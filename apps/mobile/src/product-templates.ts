/**
 * Product video templates. Everything here is plain data: the native
 * renderer (KareviaProduct.render) interpolates the keyframes, so the look of
 * a template is defined and tested in TypeScript.
 *
 * Coordinates are fractions of the frame: x/y is the centre of the product,
 * `scale` is the product's height as a fraction of the frame height.
 * Times are seconds from the start of the video.
 *
 * Templates are authored once for 9:16; `layoutForRatio` maps them to the
 * 2:3, 4:5 and 1:1 frames (texts keep their distance to the nearest edge in
 * frame-width units, the product fills the band left between them).
 */

import type { Lang } from "./i18n/lang.ts";
import { applyPriceTag, type PriceTagId } from "./price-tags.ts";
import { withSceneQuality } from "./scene-quality.ts";

export type Ease = "linear" | "out" | "inOut" | "back";
export type ProductQuality = "720p" | "1080p";
/** Frame shape, width:height. */
export type AspectRatio = "9:16" | "1:1" | "4:5";
/** Every shape the renderer draws: the video shapes plus 2:3 (marketplace images). */
export type FrameRatio = AspectRatio | "2:3";
/** Shapes offered for videos, in the order to show them. */
export const RATIOS: readonly AspectRatio[] = ["9:16", "4:5", "1:1"];
/** Every shape the renderer draws: the video shapes plus 2:3 (marketplace images). */
export const ALL_RATIOS: readonly FrameRatio[] = ["9:16", "2:3", "4:5", "1:1"];

const FRAME_SIZES: Record<
  FrameRatio,
  Record<ProductQuality, { width: number; height: number }>
> = {
  "9:16": {
    "720p": { width: 720, height: 1280 },
    "1080p": { width: 1080, height: 1920 },
  },
  "4:5": {
    "720p": { width: 864, height: 1080 },
    "1080p": { width: 1080, height: 1350 },
  },
  "1:1": {
    "720p": { width: 720, height: 720 },
    "1080p": { width: 1080, height: 1080 },
  },
  "2:3": {
    "720p": { width: 720, height: 1080 },
    "1080p": { width: 1080, height: 1620 },
  },
};

/** Sides a still export may have, in pixels. */
export const STILL_LIMITS = { minSide: 500, maxSide: 4096 } as const;

/**
 * Pixel size of a still `width` pixels wide in the shape of `ratio`
 * (e.g. 1200 x 1800 for 2:3, 2000 x 2000 for 1:1); null when a side falls
 * outside STILL_LIMITS. The native side computes the height the same way.
 */
export function stillSize(
  ratio: FrameRatio | undefined,
  width: number,
): { width: number; height: number } | null {
  const full = FRAME_SIZES[ratio ?? "9:16"]["1080p"];
  const w = Math.round(width);
  const h = Math.round((w * full.height) / full.width);
  const ok = (n: number) =>
    Number.isFinite(n) &&
    n >= STILL_LIMITS.minSide &&
    n <= STILL_LIMITS.maxSide;
  return ok(w) && ok(h) ? { width: w, height: h } : null;
}

/** Pixel size of the video (and of a still export) for a ratio and quality. */
export function frameSize(
  ratio: FrameRatio | undefined,
  quality: ProductQuality,
): { width: number; height: number } {
  return FRAME_SIZES[ratio ?? "9:16"][quality];
}

export type ProductKey = {
  t: number;
  x: number;
  y: number;
  scale: number;
  /** Degrees, clockwise. */
  rotation: number;
  opacity: number;
  /** Turn around the vertical axis in degrees (perspective), -35...35. */
  yaw: number;
  /** Easing used from the previous key to this one. */
  ease: Ease;
};

export type TextAnimation = "rise" | "fade" | "pop" | "slide";

/**
 * Type families for video texts (bundled OFL fonts, with Turkish letters):
 * modern = Manrope, elegant = Playfair Display, editorial = Cormorant
 * Garamond, impact = Anton, poster = Archivo Black, system = SF.
 */
export type FontStyle =
  "system" | "modern" | "elegant" | "editorial" | "impact" | "poster";
export const FONT_STYLES: readonly { id: FontStyle; tr: string; en: string }[] =
  [
    { id: "modern", tr: "Modern", en: "Modern" },
    { id: "elegant", tr: "Zarif", en: "Elegant" },
    { id: "editorial", tr: "Editoryal", en: "Editorial" },
    { id: "impact", tr: "Güçlü", en: "Bold" },
    { id: "poster", tr: "Afiş", en: "Poster" },
    { id: "system", tr: "Sade", en: "Plain" },
  ];
/**
 * Optical size per family, so the same `size` reads about as large: Anton is
 * tall and condensed, Archivo Black wide, Cormorant has a small x-height.
 */
export const FONT_SIZE_FACTOR: Record<FontStyle, number> = {
  system: 1,
  modern: 0.96,
  elegant: 1,
  editorial: 1.12,
  impact: 0.9,
  poster: 0.86,
};
/**
 * PostScript name of each family's sample face (the bold cut the renderer
 * registers), for the font chips; undefined = the system font.
 */
export const FONT_SAMPLE_FAMILY: Record<FontStyle, string | undefined> = {
  system: undefined,
  modern: "Manrope-Bold",
  elegant: "PlayfairDisplay-Bold",
  editorial: "CormorantGaramond-Bold",
  impact: "Anton-Regular",
  poster: "ArchivoBlack-Regular",
};

export type ProductText = {
  text: string;
  start: number;
  end: number;
  /** Vertical centre as a fraction of the frame height. */
  y: number;
  /** Font size as a fraction of the frame width. */
  size: number;
  weight: "heavy" | "bold" | "regular";
  color: string;
  /** Pill background colour, or "" for none. */
  fill: string;
  animation: TextAnimation;
  /**
   * How the text leaves when it ends before the video does; defaults to the
   * mirror of `animation` (rise floats up, pop shrinks, slide moves out).
   */
  exit?: TextAnimation;
  /** Struck through, e.g. the old price next to a discounted one. */
  strike?: boolean;
  /** Type family; default "system". Spacing per family is set natively. */
  font?: FontStyle;
  /** Extra letter spacing in ems (-0.05...0.3), e.g. for small caps. */
  tracking?: number;
};

/**
 * A camera cut. From `t` until the next shot the camera zooms by `zoom`
 * (on top of `camera`) onto a point given relative to the product:
 * `focusX`/`focusY` are offsets from the product centre in product
 * widths/heights (-0.5 = left/top edge). The camera follows the product and
 * never shows past the frame edge.
 */
export type ProductShot = {
  t: number;
  zoom: number;
  focusX: number;
  focusY: number;
};

/** Finishing of the composite; every value is a 0...1 strength. */
export type ProductLook = {
  /** Fine film grain baked into the background (also hides banding). */
  grain: number;
  /** Darkened frame corners. */
  vignette: number;
  /** Depth-of-field blur of a scene image (`background.image`) only. */
  sceneBlur: number;
  /** Background moves slower than the product (depth). */
  parallax: number;
  /** Gentle colour match of the product to the scene plus light wrap. */
  harmonize: number;
  /** 0...1 cut-out edge refinement (see scene-quality.ts); engine default 1. */
  edge?: number;
  /** 0...1 floor reflection strength; engine default 1. */
  reflectionStrength?: number;
};

export type ProductBackground = {
  top: string;
  bottom: string;
  /** Soft spotlight behind the product. */
  glow: string;
  /** Draws a horizon line and a floor tone under the product. */
  floor: boolean;
  /** Local scene image drawn instead of the gradient (AI Sahne); "" = none. */
  image: string;
  /** Horizontal part of the image to use, as fractions of its width. */
  imageX: number;
  imageWidth: number;
  /** Vertical part of the image to use (fractions of its height); default 0 / 1. */
  imageY?: number;
  imageHeight?: number;
  /** 0...1 strength of the top/bottom darkening over a scene image; default 1. */
  shade?: number;
  /**
   * 0 < split < 1 (fraction of the frame width): a hard two-colour split
   * instead of the gradient, `top` left of the edge and `bottom` right of it;
   * glow and floor still drawn on top. Absent or 0 = the gradient.
   */
  split?: number;
};

/** A scene image and where the product stands in the 9:16 frame (fractions). */
export type SceneInput = {
  uri: string;
  /**
   * Part of the image that fills the frame: x/width in fractions of its
   * width, y/height in fractions of its height (default: full height).
   * Callers pass the 9:16 column; `sceneForRatio` derives the other shapes.
   */
  crop: { x: number; width: number; y?: number; height?: number };
  productRect: { x: number; y: number; width: number; height: number };
  /** 0...1 strength of the darkening over the image; default 1 (0 for bundled backdrops). */
  shade?: number;
  /**
   * True when the image already shows the product (AI Sahne's photo route):
   * the editor must never draw the cut-out over it (src/editor-media.ts).
   */
  containsProduct?: boolean;
};

export type SceneTransition = {
  /**
   * blur: the previous scene grows, blurs and fades out with ghost copies over
   * the new one; flash: hard cut with one white frame (duration ignored).
   */
  kind: "cut" | "push" | "wipe" | "zoom" | "blur" | "flash";
  duration: number;
};

/** Colour grade over the scenes (before texts); each -1...1, 0 = unchanged. */
export type ProductGrade = {
  warmth: number;
  saturation: number;
  contrast: number;
  /** Positive lifts the blacks toward a warm grey; negative deepens them. */
  fade: number;
};

export type ProductScene = {
  /** Seconds; scene i ends where scene i+1 starts, the last ends at spec.duration. */
  start: number;
  /** File uri. */
  image: string;
  /**
   * cutout: drawn like the single-product spec; photo: cover-fills the frame
   * (keys: scale = zoom 1...3, x/y = photo point at the frame centre,
   * rotation = camera roll about the frame centre, degrees clockwise, clamped
   * to ±8; the engine overscans so no corner shows);
   * depth: the photo split into depth layers for a 2.5D camera move (keys:
   * scale = dolly 1...1.4, x/y = camera offset -1...1, rotation = roll as in
   * photo; yaw and opacity ignored). Falls back to a still photo when depth
   * is unavailable. Roll needs the 1.2.0 native build; older builds ignore it.
   */
  mode: "cutout" | "photo" | "depth";
  /** Times relative to the scene start. */
  keys: ProductKey[];
  /** Cutout mode only; default spec.background. */
  background?: ProductBackground;
  /** Times relative to the scene start. */
  shots?: ProductShot[];
  /** How this scene enters; ignored on scene 0. */
  transition: SceneTransition;
  /** 0...1 darkening over a photo scene for text; default 0. */
  shade?: number;
};

export const MAX_SCENES = 16;

export type ProductVideoSpec = {
  /** Cut-out PNG with transparency. */
  product: string;
  quality: ProductQuality;
  duration: number;
  fps: 30;
  /** "compact" keeps marketplace uploads small. */
  bitrate: "compact" | "high";
  background: ProductBackground;
  camera: { zoomFrom: number; zoomTo: number };
  keys: ProductKey[];
  shadow: boolean;
  /**
   * "full" (default): cast shadow plus contact shadow; "contact": only the
   * soft occlusion under the base (marketplace main images).
   */
  shadowStyle?: "full" | "contact";
  reflection: boolean;
  /** Light passes across the product. */
  sweeps: { start: number; duration: number }[];
  sparkles: { count: number; color: string; seed: number } | null;
  texts: ProductText[];
  watermark: boolean;
  music: { uri: string; volume: number } | null;
  /** 0...1 strength of the depth-based relief light; 0 turns it off. */
  relief: number;
  /** Frame shape; default "9:16". */
  ratio?: FrameRatio;
  /** Camera cuts (hero, close-up, end card); none = one continuous shot. */
  shots?: ProductShot[];
  /** Multi-scene video; absent = the single-product path. */
  scenes?: ProductScene[];
  /** Composite finishing; the renderer uses moderate defaults when absent. */
  look?: ProductLook;
  /** Multi-scene videos: colour grade; absent or all 0 = none. */
  grade?: ProductGrade;
  /**
   * Texts the user typed that `buildSpec` left out because the product would
   * otherwise have become too small (call to action first, then the badge).
   * Recipes also list the fields of texts over LIMITS.maxTexts or with no
   * room left (buildRecipeSpec).
   */
  dropped?: DroppedText[];
};

export type DroppedText = "cta" | "badge" | "name" | "price" | "oldPrice";
const DROPPED_TEXTS: readonly string[] = ["cta", "badge", "name", "price", "oldPrice"];

export type PaletteId = "noir" | "blush" | "ivory" | "ocean" | "emerald";
export type Palette = {
  id: PaletteId;
  tr: string;
  en: string;
  background: ProductBackground;
  /** Main text colour. */
  ink: string;
  /** Price, badge and CTA colour. */
  accent: string;
  /** Text drawn on top of `accent`. */
  onAccent: string;
  sparkle: string;
};

export const PALETTES: readonly Palette[] = [
  {
    id: "noir",
    tr: "Gece",
    en: "Noir",
    background: {
      top: "#17140F",
      bottom: "#050505",
      glow: "#5A4A2E",
      floor: true,
      image: "",
      imageX: 0,
      imageWidth: 1,
    },
    ink: "#F6EFE2",
    accent: "#D9B46A",
    onAccent: "#17120A",
    sparkle: "#F3D9A0",
  },
  {
    id: "blush",
    tr: "Pudra",
    en: "Blush",
    background: {
      top: "#F7DCD6",
      bottom: "#E7B5AC",
      glow: "#FFF3EE",
      floor: true,
      image: "",
      imageX: 0,
      imageWidth: 1,
    },
    ink: "#3B1F1B",
    accent: "#8E2F3C",
    onAccent: "#FFF4F1",
    sparkle: "#FFFFFF",
  },
  {
    id: "ivory",
    tr: "Fildişi",
    en: "Ivory",
    background: {
      top: "#F4EFE6",
      bottom: "#DCD3C3",
      glow: "#FFFFFF",
      floor: true,
      image: "",
      imageX: 0,
      imageWidth: 1,
    },
    ink: "#26231E",
    accent: "#26231E",
    onAccent: "#F4EFE6",
    sparkle: "#FFFFFF",
  },
  {
    id: "ocean",
    tr: "Okyanus",
    en: "Ocean",
    background: {
      top: "#0E3A4F",
      bottom: "#04141D",
      glow: "#2C8DA8",
      floor: false,
      image: "",
      imageX: 0,
      imageWidth: 1,
    },
    ink: "#EAF7FB",
    accent: "#7FE0F0",
    onAccent: "#04212C",
    sparkle: "#CFF6FF",
  },
  {
    id: "emerald",
    tr: "Zümrüt",
    en: "Emerald",
    background: {
      top: "#123B2C",
      bottom: "#05140E",
      glow: "#3E8A62",
      floor: true,
      image: "",
      imageX: 0,
      imageWidth: 1,
    },
    ink: "#EEF6EF",
    accent: "#E8C872",
    onAccent: "#1A1406",
    sparkle: "#F6E6B0",
  },
];

/** Trendyol's seller video types, used to group templates. */
export type VideoKind =
  "promotion" | "advertisement" | "usage" | "packaging" | "assembly" | "store";

export type TemplateId =
  | "showcase"
  | "lightTour"
  | "turntable"
  | "campaign"
  | "unboxing"
  | "store"
  | "editorial"
  | "detail"
  | "discount"
  | "minimal";
export type TemplateInfo = {
  id: TemplateId;
  kind: VideoKind;
  tr: string;
  en: string;
  descriptionTr: string;
  descriptionEn: string;
  duration: number;
};

export const TEMPLATES: readonly TemplateInfo[] = [
  {
    id: "showcase",
    kind: "promotion",
    tr: "Vitrin",
    en: "Showcase",
    descriptionTr:
      "Ürün ışıltıyla sahneye çıkar, ardından başlık ve fiyat gelir.",
    descriptionEn: "The product rises in with a shimmer, then title and price.",
    duration: 9,
  },
  {
    id: "lightTour",
    kind: "advertisement",
    tr: "Işık turu",
    en: "Light tour",
    descriptionTr: "Yavaş kamera yaklaşması, ürünün üzerinde gezen ışık.",
    descriptionEn: "A slow push-in with light gliding over the product.",
    duration: 10,
  },
  {
    id: "turntable",
    kind: "promotion",
    tr: "Döner vitrin",
    en: "Turntable",
    descriptionTr:
      "Ürün yansımalı zeminde sağa sola döner; ışık her dönüşte üzerinden geçer.",
    descriptionEn:
      "The product turns left and right on a reflective floor, catching the light.",
    duration: 10,
  },
  {
    id: "campaign",
    kind: "advertisement",
    tr: "Kampanya",
    en: "Campaign",
    descriptionTr:
      "İndirim etiketi, zıplayan ürün, büyük fiyat ve buton yazısı.",
    descriptionEn:
      "Discount badge, bouncing product, big price and button text.",
    duration: 9,
  },
  {
    id: "unboxing",
    kind: "packaging",
    tr: "Kutu açılışı",
    en: "Unboxing",
    descriptionTr:
      "Işık patlamasıyla ürün kutudan çıkar gibi belirir; paket ve hediye vurgusu.",
    descriptionEn:
      "The product bursts into view as if out of its box, with a gift feel.",
    duration: 9,
  },
  {
    id: "store",
    kind: "store",
    tr: "Mağaza",
    en: "Store",
    descriptionTr:
      "Mağaza adın büyük yazılır, ürün ortada süzülür; takip çağrısıyla biter.",
    descriptionEn:
      "Your store name in large type, the product floating, ending on a follow call.",
    duration: 10,
  },
  {
    id: "editorial",
    kind: "advertisement",
    tr: "Editoryal",
    en: "Editorial",
    descriptionTr:
      "Büyük serif başlık, yavaş kamera yaklaşması ve sade bir dergi düzeni.",
    descriptionEn:
      "A large serif headline, a slow push-in and a calm magazine layout.",
    duration: 10,
  },
  {
    id: "detail",
    kind: "promotion",
    tr: "Detay",
    en: "Detail",
    descriptionTr:
      "Önce ürünün tamamı, sonra iki yakın plan, en sonda fiyat kartı.",
    descriptionEn:
      "The whole product, two close-ups of its details, then a price card.",
    duration: 11,
  },
  {
    id: "discount",
    kind: "advertisement",
    tr: "İndirim",
    en: "Discount",
    descriptionTr:
      "Eski fiyatın üstü çizilir, yeni fiyat büyüyerek gelir; iri indirim etiketiyle.",
    descriptionEn:
      "The old price is struck out and the new price pops in, with a big discount badge.",
    duration: 9,
  },
  {
    id: "minimal",
    kind: "promotion",
    tr: "Minimal",
    en: "Minimal",
    descriptionTr:
      "Hareketsiz ürün, bol boşluk ve küçük, aralıklı büyük harflerle yazılar.",
    descriptionEn:
      "A still product, generous space and small, widely spaced capitals.",
    duration: 12,
  },
];

/** The type family each template uses unless the user picks another. */
export const DEFAULT_FONT_STYLE: Record<TemplateId, FontStyle> = {
  showcase: "elegant",
  lightTour: "editorial",
  turntable: "modern",
  campaign: "impact",
  unboxing: "modern",
  store: "poster",
  editorial: "editorial",
  detail: "modern",
  discount: "poster",
  minimal: "modern",
};

/** Text colours that replace the palette's (same roles as in a Palette). */
export type TextColors = {
  ink: string;
  accent: string;
  onAccent: string;
  sparkle: string;
};

export type TemplateInput = {
  template: TemplateId;
  palette: PaletteId;
  product: string;
  headline: string;
  price: string;
  /** e.g. "%30 İNDİRİM"; empty hides the badge. */
  badge: string;
  cta: string;
  /** Store name, used by the Store template. */
  store?: string;
  quality: ProductQuality;
  /** "compact" keeps marketplace uploads small; default "high". */
  bitrate?: "compact" | "high";
  /** false turns the depth relief light off (free plan); default true. */
  relief?: boolean;
  /** AI Sahne background; the product then stands where the scene expects it. */
  scene?: SceneInput | null;
  watermark: boolean;
  music: { uri: string; volume: number } | null;
  /** Frame shape; default "9:16". */
  ratio?: FrameRatio;
  /** Price before the discount, shown struck through near `price`. */
  oldPrice?: string;
  /**
   * Brand accent (src/brand-kit.ts) with the type colour on it; replaces the
   * palette's accent unless it would not show on the palette's background.
   */
  brandAccent?: { accent: string; onAccent: string } | null;
  /** Price tag layout (src/price-tags.ts); null/undefined keeps the template's own. */
  priceTag?: PriceTagId | null;
  /** One type family for every text; default DEFAULT_FONT_STYLE[template]. */
  fontStyle?: FontStyle;
  /** Replaces the palette's text colours (e.g. with a bundled backdrop). */
  colors?: TextColors | null;
  /**
   * Pixel size of the cut-out (from `cutOut`). Close-ups use it so they never
   * upscale the cut-out too far; without it a 1000x1000 cut-out is assumed.
   */
  productSize?: { width: number; height: number } | null;
  /**
   * "social" keeps every text out of the zones where Reels and TikTok draw
   * their caption and buttons (SOCIAL_SAFE), with the texts on top and the
   * product below them; 9:16 only, other shapes ignore it. Default "none".
   */
  safeArea?: "none" | "social";
  /**
   * Language of the texts, for upper-casing (badge, store name, Minimal
   * headline and CTA): "tr" uses the dotted/dotless i rules, "en" plain
   * upper case. Default "tr".
   */
  textLang?: Lang;
};

export const LIMITS = {
  minDuration: 8,
  maxDuration: 30,
  maxTexts: 6,
  maxTextLength: 60,
  maxSweeps: 6,
  maxSparkles: 80,
  maxKeys: 12,
  maxShots: 8,
  maxShotZoom: 2.5,
} as const;

/** 9:16 bands kept for texts at the top and bottom of the frame. */
const TOP_BAND = 0.17,
  BOTTOM_BAND = 0.22;
/** Text size factor per ratio (shorter frames get slightly smaller type). */
const TEXT_FACTOR: Record<FrameRatio, number> = {
  "9:16": 1,
  "2:3": 0.9,
  "4:5": 0.82,
  "1:1": 0.68,
};

/** Frame height divided by width. */
export function ratioHeight(ratio: FrameRatio): number {
  return ratio === "1:1"
    ? 1
    : ratio === "4:5"
      ? 1.25
      : ratio === "2:3"
        ? 1.5
        : 16 / 9;
}

/**
 * How a 9:16 layout maps onto `ratio`:
 * - `text` multiplies text sizes (fractions of the frame width);
 * - `edge` multiplies a text's distance to its nearest top/bottom edge
 *   (fractions of the frame height), so texts keep their spacing;
 * - `product` multiplies product heights, and `productY` maps a product
 *   centre into the band left between the text areas.
 */
export function layoutForRatio(ratio: FrameRatio = "9:16") {
  const text = TEXT_FACTOR[ratio];
  const edge = (text * (16 / 9)) / ratioHeight(ratio);
  const bands = TOP_BAND + BOTTOM_BAND;
  const product = (1 - bands * edge) / (1 - bands);
  return {
    text,
    edge,
    product,
    textY: (y: number) => (y < 0.5 ? y * edge : 1 - (1 - y) * edge),
    productY: (y: number) => TOP_BAND * edge + (y - TOP_BAND) * product,
  };
}

/** A template's keys and texts moved from 9:16 into `ratio`. */
export function fitToRatio(
  keys: ProductKey[],
  texts: ProductText[],
  ratio: FrameRatio,
): { keys: ProductKey[]; texts: ProductText[] } {
  if (ratio === "9:16") return { keys, texts };
  const l = layoutForRatio(ratio);
  return {
    keys: keys.map((k) => {
      const scale = k.scale * l.product,
        top = k.y - k.scale / 2,
        bottom = k.y + k.scale / 2;
      // A product flying in from beyond an edge stays just as far outside.
      const y =
        top >= 0.9
          ? top + scale / 2
          : bottom <= 0.1
            ? bottom - scale / 2
            : l.productY(k.y);
      return { ...k, y, scale };
    }),
    texts: texts.map((t) => ({
      ...t,
      y: Math.min(0.97, Math.max(0.03, l.textY(t.y))),
      size: t.size * l.text,
    })),
  };
}

/**
 * The centred 9:16 part of a photo of any shape, as a `SceneInput.crop`:
 * a column of the full height for wider photos, a band of the full width
 * for taller ones.
 */
export function sceneCrop(
  imageWidth: number,
  imageHeight: number,
): { x: number; width: number; y: number; height: number } {
  const aspect = imageWidth / Math.max(1, imageHeight);
  if (!(aspect > 0) || !Number.isFinite(aspect))
    return { x: 0, width: 1, y: 0, height: 1 };
  if (aspect >= 9 / 16) {
    const width = 9 / 16 / aspect;
    return { x: (1 - width) / 2, width, y: 0, height: 1 };
  }
  const height = aspect / (9 / 16);
  return { x: 0, width: 1, y: (1 - height) / 2, height };
}

/**
 * The scene for another frame shape. The caller's crop is the 9:16 part of
 * the image (any image shape). A wider frame takes a wider column of the full
 * image height when the image is wide enough (square AI scenes); otherwise
 * (9:16 backdrops, tall photos) it takes the full width and a band of the
 * height placed so the product's base stays on the same image point and lands
 * where the ratio layout puts a product's base.
 */
export function sceneForRatio(
  scene: SceneInput,
  ratio: FrameRatio,
): SceneInput {
  if (ratio === "9:16") return scene;
  const frameAspect = 1 / ratioHeight(ratio); // width / height
  const cw = Math.max(0.01, scene.crop.width),
    ch = Math.max(0.01, scene.crop.height ?? 1),
    cy = scene.crop.y ?? 0;
  // The 9:16 crop has the 9:16 shape in pixels, which gives the image's aspect.
  const imageAspect = ((9 / 16) * ch) / cw;
  const r = scene.productRect;
  // The product in image fractions.
  const imageX = scene.crop.x + r.x * cw,
    imageW = r.width * cw,
    centreX = imageX + imageW / 2,
    imageTop = cy + r.y * ch,
    imageH = r.height * ch,
    base = imageTop + imageH;
  const wanted = frameAspect / imageAspect;
  if (wanted <= 1) {
    // Wide enough: a wider column, full height.
    const x = Math.min(
      1 - wanted,
      Math.max(0, scene.crop.x + cw / 2 - wanted / 2),
    );
    return {
      ...scene,
      crop: { x, width: wanted, y: 0, height: 1 },
      productRect: {
        x: (imageX - x) / wanted,
        width: imageW / wanted,
        y: imageTop,
        height: imageH,
      },
    };
  }
  // Too narrow: full width and a band of the height around the base.
  const l = layoutForRatio(ratio);
  const visible = 1 / wanted;
  const top = Math.min(
    1 - visible,
    Math.max(0, base - l.productY(base) * visible),
  );
  const baseInFrame = (base - top) / visible;
  // The product keeps its size relative to the frame like template products
  // do, instead of growing with the crop; it shrinks around its base.
  const fullHeight = imageH / visible;
  const height = Math.min(fullHeight, r.height * l.product);
  const width = imageW * (height / fullHeight);
  return {
    ...scene,
    crop: { x: 0, width: 1, y: top, height: visible },
    productRect: {
      x: centreX - width / 2,
      y: baseInFrame - height,
      width,
      height,
    },
  };
}

/** Upper case with Turkish dotted/dotless i. */
export function upperTr(text: string): string {
  return text.replace(/i/g, "İ").replace(/ı/g, "I").toUpperCase();
}

/**
 * Upper case for the texts' language. A text with Turkish-only letters
 * (ı İ ğ Ğ ş Ş) keeps the Turkish rules even when `lang` is "en".
 */
export function upperFor(text: string, lang: Lang = "tr"): string {
  return lang === "tr" || /[ıİğĞşŞ]/.test(text)
    ? upperTr(text)
    : text.toUpperCase();
}

function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, LIMITS.maxTextLength);
}

export function paletteById(id: PaletteId): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}
export function templateById(id: TemplateId): TemplateInfo {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}

const key = (
  t: number,
  y: number,
  scale: number,
  opacity = 1,
  ease: Ease = "inOut",
  rotation = 0,
  x = 0.5,
  yaw = 0,
): ProductKey => ({ t, x, y, scale, rotation, opacity, yaw, ease });

/**
 * Moves a template's product animation so that it comes to rest where the
 * scene expects the product: same motion, shifted and rescaled.
 */
export function keysOnScene(
  keys: ProductKey[],
  scene: SceneInput,
): ProductKey[] {
  const rest = keys[keys.length - 1];
  if (!rest) return keys;
  const r = scene.productRect;
  const factor = Math.min(
    1.5 / Math.max(...keys.map((k) => k.scale)),
    r.height / rest.scale,
  );
  const dx = r.x + r.width / 2 - rest.x,
    dy = r.y + r.height / 2 - rest.y;
  return keys.map((k) => ({
    ...k,
    x: k.x + dx,
    y: k.y + dy,
    scale: k.scale * factor,
  }));
}

// MARK: Layout measurement (mirrors the native renderer)

/**
 * Per-family type metrics from the bundled fonts (hhea line height times the
 * native line-height multiple; average advances in ems of the heaviest weight
 * used, so estimates err on the wide side) plus the native default kerning.
 */
const TYPE_METRICS: Record<
  FontStyle,
  {
    line: number;
    upper: number;
    lower: number;
    digit: number;
    space: number;
    kern: number;
  }
> = {
  system: {
    line: 1.2,
    upper: 0.68,
    lower: 0.56,
    digit: 0.62,
    space: 0.28,
    kern: 0.01,
  },
  modern: {
    line: 1.366,
    upper: 0.654,
    lower: 0.55,
    digit: 0.548,
    space: 0.2,
    kern: 0.005,
  },
  elegant: {
    line: 1.333 * 0.95,
    upper: 0.66,
    lower: 0.51,
    digit: 0.476,
    space: 0.244,
    kern: 0,
  },
  editorial: {
    line: 1.211 * 0.9,
    upper: 0.629,
    lower: 0.429,
    digit: 0.397,
    space: 0.234,
    kern: 0.01,
  },
  impact: {
    line: 1.505 * 0.92,
    upper: 0.456,
    lower: 0.444,
    digit: 0.467,
    space: 0.234,
    kern: 0.04,
  },
  poster: {
    line: 1.088 * 0.95,
    upper: 0.751,
    lower: 0.596,
    digit: 0.619,
    space: 0.333,
    kern: 0.01,
  },
};

/** Widest line the renderer allows, in frame widths. */
const maxLineWidth = (t: ProductText) => (t.fill ? 0.78 : 0.86);

function wordWidth(word: string, t: ProductText): number {
  const m = TYPE_METRICS[t.font ?? "system"];
  let ems = 0;
  for (const c of word) {
    if (c === " ") ems += m.space;
    else if (/[0-9.,%:+\-/]/.test(c)) ems += m.digit;
    else if (c !== c.toLocaleLowerCase("tr")) ems += m.upper;
    else ems += m.lower;
  }
  const extra = Math.max(0, word.length - 1) * (m.kern + (t.tracking ?? 0));
  return (ems + extra) * t.size;
}

/** Lines the renderer wraps a text into (word wrapping, like UIKit). */
export function textLines(t: ProductText): number {
  return wrapText(t).lines;
}

/** Line count and widest line (frame widths) of a text as the renderer wraps it. */
function wrapText(t: ProductText): { lines: number; widest: number } {
  const max = maxLineWidth(t);
  const space = wordWidth(" ", t);
  let lines = 1,
    line = 0,
    widest = 0;
  for (const word of t.text.split(" ")) {
    const w = wordWidth(word, t);
    if (line > 0 && line + space + w > max) {
      widest = Math.max(widest, line);
      lines += 1;
      line = 0;
    }
    if (line === 0 && w > max) {
      // A word longer than a line breaks inside the word.
      lines += Math.ceil(w / max) - 1;
      widest = max;
      line = w % max;
    } else line += (line > 0 ? space : 0) + w;
  }
  return { lines, widest: Math.max(widest, line) };
}

/** Width of a text's drawn box (with its pill or padding), in frame widths. */
export function textWidth(t: ProductText): number {
  const pad = t.fill ? 0.7 * t.size : 4 / 720;
  return wrapText(t).widest + 2 * pad;
}

/** Height of a text's drawn box (with its pill or padding), in frame heights. */
export function textHeight(t: ProductText, ratio: FrameRatio = "9:16"): number {
  const m = TYPE_METRICS[t.font ?? "system"];
  const pad = t.fill ? 0.35 * t.size : Math.max(2 / 720, 0.15 * t.size);
  const inWidths = textLines(t) * m.line * t.size + 2 * pad;
  return (inWidths * 1.03) / ratioHeight(ratio);
}

function easeValue(name: Ease, u: number): number {
  const v = Math.max(0, Math.min(1, u));
  switch (name) {
    case "linear":
      return v;
    case "out":
      return 1 - Math.pow(1 - v, 3);
    case "back": {
      const c1 = 1.70158,
        c3 = c1 + 1;
      return 1 + c3 * Math.pow(v - 1, 3) + c1 * Math.pow(v - 1, 2);
    }
    default:
      return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2;
  }
}

/** The product's pose at `t`, as the renderer interpolates it. */
export function poseAt(keys: ProductKey[], t: number): ProductKey {
  const first = keys[0];
  if (t <= first.t) return first;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1],
      b = keys[i];
    if (t <= b.t) {
      const e = easeValue(b.ease, (t - a.t) / Math.max(0.0001, b.t - a.t));
      const mix = (p: number, q: number) => p + (q - p) * e;
      return {
        ...b,
        t,
        x: mix(a.x, b.x),
        y: mix(a.y, b.y),
        scale: mix(a.scale, b.scale),
        rotation: mix(a.rotation, b.rotation),
        opacity: Math.max(0, Math.min(1, mix(a.opacity, b.opacity))),
        yaw: mix(a.yaw, b.yaw),
      };
    }
  }
  return keys[keys.length - 1];
}

/** A text's vertical box at `t` with its animation, or null when hidden. */
function textBoxAt(
  text: ProductText,
  t: number,
  total: number,
  ratio: FrameRatio,
): { top: number; bottom: number } | null {
  const look = textLookAt(text, t, total);
  if (!look) return null;
  const half = (textHeight(text, ratio) * look.scale) / 2;
  return { top: text.y + look.dy - half, bottom: text.y + look.dy + half };
}

/** A text's animation offsets at `t` as drawn natively, or null when hidden. */
function textLookAt(
  text: ProductText,
  t: number,
  total: number,
): { dx: number; dy: number; scale: number } | null {
  if (t < text.start || t > text.end) return null;
  const u = Math.min(1, (t - text.start) / 0.5);
  let alpha = easeValue("out", u),
    dx = 0,
    dy = 0,
    scale = 1;
  if (text.animation === "rise") dy = (1 - easeValue("out", u)) * 0.035;
  if (text.animation === "pop") {
    alpha *= Math.min(1, u * 2.5);
    scale = 0.6 + 0.4 * easeValue("back", u);
  }
  if (text.animation === "slide") dx = (easeValue("out", u) - 1) * SLIDE_TRAVEL;
  if (text.end < total - 0.01) {
    const length = Math.max(0.15, Math.min(0.4, (text.end - text.start) / 3));
    const k = easeValue(
      "inOut",
      1 - Math.max(0, Math.min(1, (text.end - t) / length)),
    );
    alpha *= 1 - k;
    const kind = text.exit ?? text.animation;
    if (kind === "rise") dy -= k * 0.03;
    if (kind === "pop") scale *= 1 - 0.3 * k;
    if (kind === "slide") dx += k * SLIDE_TRAVEL;
  }
  if (alpha < 0.05) return null;
  return { dx, dy, scale };
}

/** Total camera zoom at `t`, or null during a close-up (zoom > 1 cut). */
function frameZoomAt(
  t: number,
  duration: number,
  camera: ProductVideoSpec["camera"],
  shots: ProductShot[],
): number | null {
  let shot: ProductShot | undefined;
  for (const s of shots) if (s.t <= t + 1e-6) shot = s;
  if (shot && shot.zoom > 1.0001) return null;
  const p = Math.max(0, Math.min(1, t / duration));
  return (
    camera.zoomFrom + (camera.zoomTo - camera.zoomFrom) * easeValue("inOut", p)
  );
}

/** Product box in frame heights; turning makes the near edge taller. */
function productBox(k: ProductKey, zoom: number) {
  const half =
    (k.scale * (1 + 0.18 * Math.abs(Math.sin((k.yaw * Math.PI) / 180)))) / 2;
  return {
    top: 0.5 + (k.y - half - 0.5) * zoom,
    bottom: 0.5 + (k.y + half - 0.5) * zoom,
  };
}

/** Clearance kept between any visible text and the product (frame heights). */
export const TEXT_CLEARANCE = 0.025;
const SAMPLE = 1 / 30;

/**
 * Moments a visible text comes closer than TEXT_CLEARANCE to the product's box
 * (outside camera close-ups, which show no text). Empty when the layout is clean.
 */
export function clearanceProblems(spec: ProductVideoSpec): string[] {
  const ratio = spec.ratio ?? "9:16";
  const out: string[] = [];
  for (let t = 0; t <= spec.duration + 1e-9; t += SAMPLE) {
    const pose = poseAt(spec.keys, t);
    const zoom = frameZoomAt(t, spec.duration, spec.camera, spec.shots ?? []);
    if (zoom === null || pose.opacity < 0.05) continue;
    const p = productBox(pose, zoom);
    for (const text of spec.texts) {
      const b = textBoxAt(text, t, spec.duration, ratio);
      if (!b) continue;
      const clear =
        b.bottom + TEXT_CLEARANCE <= p.top + 1e-6 ||
        b.top - TEXT_CLEARANCE >= p.bottom - 1e-6;
      if (!clear) out.push(`${text.text} at ${t.toFixed(2)}s`);
    }
  }
  return out;
}

/** Texts that are on screen at the same time and overlap each other. */
export function textOverlapProblems(spec: ProductVideoSpec): string[] {
  const ratio = spec.ratio ?? "9:16";
  const out: string[] = [];
  const texts = spec.texts;
  for (let i = 0; i < texts.length; i++)
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i],
        b = texts[j];
      if (!(a.start < b.end && b.start < a.end)) continue;
      const ha = textHeight(a, ratio) / 2,
        hb = textHeight(b, ratio) / 2;
      if (Math.abs(a.y - b.y) < ha + hb - 1e-6)
        out.push(`${a.text} / ${b.text}`);
    }
  return out;
}

/** Gap kept between stacked texts, and the frame margin, in frame heights. */
const STACK_GAP = 0.008,
  FRAME_MARGIN = 0.025;

/**
 * Stacks texts that are on screen together so they never overlap: the top
 * group grows downwards from the top margin, the bottom group upwards from the
 * bottom margin, each keeping its order.
 */
function stackTexts(texts: ProductText[], ratio: FrameRatio): ProductText[] {
  const out = texts.map((t) => ({ ...t }));
  const together = (a: ProductText, b: ProductText) =>
    a.start < b.end && b.start < a.end;
  const half = (t: ProductText) => textHeight(t, ratio) / 2;
  const top = out.filter((t) => t.y < 0.5).sort((a, b) => a.y - b.y);
  const placedTop: ProductText[] = [];
  for (const t of top) {
    let y = Math.max(t.y, FRAME_MARGIN + half(t));
    for (const o of placedTop)
      if (together(o, t)) y = Math.max(y, o.y + half(o) + STACK_GAP + half(t));
    t.y = y;
    placedTop.push(t);
  }
  const bottom = out.filter((t) => t.y >= 0.5).sort((a, b) => b.y - a.y);
  const placedBottom: ProductText[] = [];
  for (const t of bottom) {
    let y = Math.min(t.y, 1 - FRAME_MARGIN - half(t));
    for (const o of placedBottom)
      if (together(o, t)) y = Math.min(y, o.y - half(o) - STACK_GAP - half(t));
    t.y = y;
    placedBottom.push(t);
  }
  return out;
}

/** Lowest a text's box may reach when a stack moves down (frame heights). */
const SAFE_BOTTOM = 0.95;

/**
 * The bottom stack moved down as one block until its lowest box touches
 * SAFE_BOTTOM; the spacing between its texts is kept.
 */
function lowerBottomStack(
  texts: ProductText[],
  ratio: FrameRatio,
): ProductText[] {
  const bottom = texts.filter((t) => t.y >= 0.5);
  if (bottom.length === 0) return texts;
  const lowest = Math.max(...bottom.map((t) => t.y + textHeight(t, ratio) / 2));
  const dy = Math.max(0, SAFE_BOTTOM - lowest);
  return texts.map((t) => (t.y >= 0.5 ? { ...t, y: t.y + dy } : t));
}

/** Highest a text's box may reach when the top stack moves up (frame heights). */
const SAFE_TOP = 0.04;

/** The top stack moved up as one block until its highest box touches SAFE_TOP. */
function raiseTopStack(texts: ProductText[], ratio: FrameRatio): ProductText[] {
  const top = texts.filter((t) => t.y < 0.5);
  if (top.length === 0) return texts;
  const highest = Math.min(...top.map((t) => t.y - textHeight(t, ratio) / 2));
  const dy = Math.max(0, highest - SAFE_TOP);
  return texts.map((t) => (t.y < 0.5 ? { ...t, y: t.y - dy } : t));
}

/**
 * Shrinks long texts so a headline takes at most two lines (down to 60% of
 * the designed size) and every other text one line (down to 40%); past that
 * they wrap.
 */
function fitTextSizes(
  texts: ProductText[],
  isHeadline: (t: ProductText) => boolean,
): ProductText[] {
  return texts.map((t) => {
    const headline = isHeadline(t),
      maxLines = headline ? 2 : 1,
      floor = headline ? 0.6 : 0.4;
    let k = 1;
    while (k > floor && textLines({ ...t, size: t.size * k }) > maxLines)
      k -= 0.02;
    return k < 1 ? { ...t, size: t.size * Math.max(floor, k) } : t;
  });
}

/**
 * Moves and scales the product animation so its box clears every visible text
 * by TEXT_CLEARANCE. Keys are handled per camera segment (split where the
 * animation jumps at a cut). Each segment is scaled around `anchor` (the base
 * on a scene, the centre otherwise) as little as possible, then shifted by as
 * little as possible within `shift` (frame heights the anchor may move up /
 * down).
 */
function clearProduct(
  keys: ProductKey[],
  texts: ProductText[],
  opts: {
    duration: number;
    camera: ProductVideoSpec["camera"];
    shots: ProductShot[];
    ratio: FrameRatio;
    anchor: "base" | "centre";
    up: number;
    down: number;
  },
): ProductKey[] {
  const { duration, camera, shots, ratio } = opts;
  // Segment boundaries: cuts where two keys 0.02 s apart make the product jump.
  const cuts = shots
    .map((s) => s.t)
    .filter((t) =>
      keys.some(
        (k, i) =>
          i > 0 && keys[i - 1].t < t && k.t >= t && k.t - keys[i - 1].t <= 0.02,
      ),
    );
  const bounds = [0, ...cuts, duration + 1];
  const out = keys.map((k) => ({ ...k }));
  for (let g = 0; g + 1 < bounds.length; g++) {
    const from = bounds[g],
      to = bounds[g + 1];
    const members = keys
      .map((k, i) => ({ k, i }))
      .filter(({ k }) => k.t >= from - 1e-9 && k.t < to - 1e-9);
    if (members.length === 0) continue;
    const rest = members[members.length - 1].k;
    const c = opts.anchor === "base" ? rest.y + rest.scale / 2 : rest.y;
    // Linear limits on the anchor's new place A for a given scale s:
    // lo(s) <= A <= hi(s), collected per sample as [a + b*s] terms.
    const lower: { a: number; b: number }[] = [],
      upper: { a: number; b: number }[] = [];
    for (let t = from; t < Math.min(to, duration + 1e-9); t += SAMPLE) {
      const pose = poseAt(keys, t);
      const zoom = frameZoomAt(t, duration, camera, shots);
      if (zoom === null || pose.opacity < 0.05) continue;
      const half =
        (pose.scale *
          (1 + 0.18 * Math.abs(Math.sin((pose.yaw * Math.PI) / 180)))) /
        2;
      for (const text of texts) {
        const b = textBoxAt(text, t, duration, ratio);
        if (!b) continue;
        if ((b.top + b.bottom) / 2 < 0.5)
          lower.push({
            a: (b.bottom + TEXT_CLEARANCE - 0.5) / zoom + 0.5,
            b: -(pose.y - c - half),
          });
        else
          upper.push({
            a: (b.top - TEXT_CLEARANCE - 0.5) / zoom + 0.5,
            b: -(pose.y - c + half),
          });
      }
    }
    // The largest scale that fits; if the allowed shift is not enough even
    // at 60%, the shift limit gives way (texts must stay clear).
    const solve = (up: number, floor: number) => {
      for (let k = 1; k >= floor - 1e-9; k -= 0.005) {
        const lo = Math.max(c - up, ...lower.map((l) => l.a + l.b * k));
        const hi = Math.min(c + opts.down, ...upper.map((u) => u.a + u.b * k));
        if (lo <= hi + 1e-9) return { s: k, A: Math.min(hi, Math.max(lo, c)) };
      }
      return null;
    };
    const { s, A } = solve(opts.up, 0.6) ?? solve(0.4, 0.3) ?? { s: 0.3, A: c };
    for (const { k, i } of members) {
      const scale = k.scale * s,
        top = k.y - k.scale / 2,
        bottom = k.y + k.scale / 2;
      // A product flying in from beyond an edge stays just as far outside.
      const y =
        top >= 0.9
          ? top + scale / 2
          : bottom <= 0.1
            ? bottom - scale / 2
            : A + (k.y - c) * s;
      out[i] = { ...k, x: rest.x + (k.x - rest.x) * s, y, scale };
    }
  }
  return out;
}

// MARK: Social safe area (Reels, TikTok)

/**
 * Where Reels and TikTok draw no caption or buttons in a 9:16 frame: texts
 * stay inside this box (fractions of the frame); the product may leave it.
 */
export const SOCIAL_SAFE = { top: 0.14, bottom: 0.65, side: 0.06 } as const;
/** Side travel of the "slide" animation (as drawn natively), frame widths. */
const SLIDE_TRAVEL = 0.12;

/**
 * Moments a text box (with its animation) leaves SOCIAL_SAFE. Empty when the
 * spec does not use the social safe area or every text stays inside.
 */
export function safeAreaProblems(spec: ProductVideoSpec): string[] {
  const ratio = spec.ratio ?? "9:16";
  const out: string[] = [];
  for (const text of spec.texts)
    for (let t = text.start; t <= text.end + 1e-9; t += SAMPLE) {
      const look = textLookAt(text, t, spec.duration);
      if (!look) continue;
      const half = (textHeight(text, ratio) * look.scale) / 2,
        halfW = (textWidth(text) * look.scale) / 2;
      const y = text.y + look.dy,
        x = 0.5 + look.dx;
      if (
        y - half < SOCIAL_SAFE.top - 1e-6 ||
        y + half > SOCIAL_SAFE.bottom + 1e-6 ||
        x - halfW < SOCIAL_SAFE.side - 1e-6 ||
        x + halfW > 1 - SOCIAL_SAFE.side + 1e-6
      ) {
        out.push(`${text.text} at ${t.toFixed(2)}s`);
        break;
      }
    }
  return out;
}

const popGrow = (t: ProductText) => (t.animation === "pop" ? 1.05 : 1);

/** Room an animation needs inside the safe box (frame heights): rise in / out. */
const RISE_IN = 0.035,
  RISE_OUT = 0.03;

/**
 * The social layout of a 9:16 template: every text in one stack at the top
 * of the safe band, in reading order (the top texts, then the price block and
 * the call to action), each kept narrow enough that its animation stays
 * inside the side margins. Texts that are never on screen together share
 * room. If the stack does not fit, all texts shrink together (to 70%).
 */
function socialTexts(texts: ProductText[], duration: number): ProductText[] {
  const ordered = texts
    .map((t, i) => ({ t, i }))
    .sort(
      (a, b) =>
        Number(a.t.y >= 0.5) - Number(b.t.y >= 0.5) ||
        a.t.y - b.t.y ||
        a.i - b.i,
    );
  const together = (a: ProductText, b: ProductText) =>
    a.start < b.end && b.start < a.end;
  const lay = (k: number): ProductText[] => {
    const placed: ProductText[] = [];
    for (const { t } of ordered) {
      let text = { ...t, size: t.size * k };
      // Pop overshoots ~4%; slide travels sideways.
      const slides =
        t.animation === "slide" ||
        (t.end < duration - 0.01 && (t.exit ?? t.animation) === "slide");
      const cap =
        (1 - 2 * SOCIAL_SAFE.side) / 1.05 - (slides ? 2 * SLIDE_TRAVEL : 0);
      let shrink = 1;
      while (
        shrink > 0.4 &&
        textWidth({ ...text, size: text.size * shrink }) > cap
      )
        shrink -= 0.02;
      text = { ...text, size: text.size * shrink };
      // A pop overshoots by ~4% while it scales in.
      const half = (textHeight(text) / 2) * popGrow(text);
      const exitsUp =
        t.end < duration - 0.01 && (t.exit ?? t.animation) === "rise";
      let y = SOCIAL_SAFE.top + (exitsUp ? RISE_OUT : 0) + half;
      for (const o of placed)
        if (together(o, text))
          y = Math.max(
            y,
            o.y + (textHeight(o) / 2) * popGrow(o) + STACK_GAP + half,
          );
      text.y = y;
      placed.push(text);
    }
    return placed;
  };
  const fits = (list: ProductText[]) =>
    list.every(
      (t) =>
        t.y +
          (textHeight(t) / 2) * popGrow(t) +
          (t.animation === "rise" ? RISE_IN : 0) <=
        SOCIAL_SAFE.bottom,
    );
  let k = 1,
    laid = lay(k);
  while (!fits(laid) && k > 0.7) laid = lay((k -= 0.03));
  // Back in the template's order (the renderer draws in this order).
  const byIndex = new Map(ordered.map(({ i }, n) => [i, laid[n]]));
  return texts.map((_, i) => byIndex.get(i) as ProductText);
}

/** Base of the resting product in the social layout, on a palette / on a scene. */
const SOCIAL_PALETTE_BASE = 0.92,
  SOCIAL_SCENE_BASE = 0.88;

/**
 * The product animation moved down for the social layout so it rests with its
 * base low in the frame, under the texts. On a scene the base only moves down
 * (towards the viewer, still on the surface) and the product may grow to a
 * template-like size there.
 */
function socialKeys(keys: ProductKey[], onScene: boolean): ProductKey[] {
  const rest = keys[keys.length - 1];
  const base = rest.y + rest.scale / 2;
  const target = onScene
    ? Math.max(base, SOCIAL_SCENE_BASE)
    : SOCIAL_PALETTE_BASE;
  const grow = onScene ? Math.min(1.6, Math.max(1, 0.46 / rest.scale)) : 1;
  return keys.map((k) => {
    const top = k.y - k.scale / 2,
      bottom = k.y + k.scale / 2;
    const scale = k.scale * grow;
    // A product flying in from beyond an edge stays just as far outside.
    const y =
      top >= 0.9
        ? top + scale / 2
        : bottom <= 0.1
          ? bottom - scale / 2
          : target + (k.y - base) * grow;
    return { ...k, x: rest.x + (k.x - rest.x) * grow, y, scale };
  });
}

/** Cut-out pixel size assumed when the caller does not pass `productSize`. */
const DEFAULT_PRODUCT_SIZE = { width: 1000, height: 1000 };
/** Close-up limits: product width in frame widths, and cut-out upscaling. */
export const CLOSE_UP = {
  maxWidth: 0.8,
  detailMaxWidth: 1.3,
  maxUpscale: 1.4,
} as const;

/**
 * Limits each camera cut's zoom: outside Detay the whole product stays in the
 * frame and at most CLOSE_UP.maxWidth wide; in Detay it may reach
 * CLOSE_UP.detailMaxWidth. A close-up never draws the cut-out larger than
 * CLOSE_UP.maxUpscale times its pixel size. Zooms that end up under 1.08 are
 * dropped (a plain cut).
 */
/** The renderer's fit factor: the largest key fits 90% of the frame width. */
function fitFactor(keys: ProductKey[], ratio: FrameRatio, aspect: number) {
  const maxScale = Math.max(...keys.map((k) => k.scale));
  return Math.min(
    1,
    0.9 / Math.max(1e-6, maxScale * ratioHeight(ratio) * aspect),
  );
}

/**
 * The product's box on screen (fractions of the frame) at `t` during a
 * camera cut, exactly as the renderer places it: the cut's zoom times the
 * slow camera move, centred on the cut's focus point, which is then clamped
 * so the (slightly oversized, drifting) background still covers the frame.
 * That clamp can push a low product off-centre, which is why close-ups are
 * checked with it and not around the focus point alone.
 */
function closeUpBox(
  keys: ProductKey[],
  shot: ProductShot,
  t: number,
  o: {
    duration: number;
    camera: ProductVideoSpec["camera"];
    ratio: FrameRatio;
    aspect: number;
    fit: number;
    parallax: number;
  },
): { left: number; right: number; top: number; bottom: number } {
  const W = 1,
    H = ratioHeight(o.ratio);
  const pose = poseAt(keys, t);
  const h = pose.scale * H * o.fit,
    w = h * o.aspect;
  const drawH = h * (1 + 0.18 * Math.abs(Math.sin((pose.yaw * Math.PI) / 180)));
  const rad = (pose.rotation * Math.PI) / 180;
  const halfW =
      (Math.abs(Math.cos(rad)) * w + Math.abs(Math.sin(rad)) * drawH) / 2,
    halfH = (Math.abs(Math.sin(rad)) * w + Math.abs(Math.cos(rad)) * drawH) / 2;
  const cx = pose.x * W,
    cy = pose.y * H;
  const progress = Math.max(0, Math.min(1, t / o.duration));
  const zoom =
    (o.camera.zoomFrom +
      (o.camera.zoomTo - o.camera.zoomFrom) * easeValue("inOut", progress)) *
    shot.zoom;
  let fx = W / 2,
    fy = H / 2;
  if (shot.zoom > 1.0001) {
    fx = cx + shot.focusX * w;
    fy = cy + shot.focusY * h;
  }
  const bgZoom = 1 + (zoom - 1) * (1 - 0.4 * o.parallax);
  const bgScale = 1 + 0.06 * o.parallax;
  const bgW = W * bgScale,
    bgH = H * bgScale;
  const pan = (progress - 0.5) * (bgW - W) * 0.8;
  const bx = (W - bgW) / 2 + pan,
    by = (H - bgH) / 2;
  const hw = W / (2 * bgZoom),
    hh = H / (2 * bgZoom);
  const clamp = (v: number, lo: number, hi: number, mid: number) =>
    lo <= hi ? Math.min(Math.max(v, lo), hi) : mid;
  fx = clamp(fx, bx + hw, bx + bgW - hw, bx + bgW / 2);
  fy = clamp(fy, by + hh, by + bgH - hh, by + bgH / 2);
  const sx = (x: number) => ((x - fx) * zoom + W / 2) / W,
    sy = (y: number) => ((y - fy) * zoom + H / 2) / H;
  return {
    left: sx(cx - halfW),
    right: sx(cx + halfW),
    top: sy(cy - halfH),
    bottom: sy(cy + halfH),
  };
}

/**
 * Room a close-up (outside Detay) keeps between the product and the frame
 * edge, in frame heights / widths: the base, its contact shadow and the
 * preview's rounded corners need air, or the product reads as cut off.
 */
export const CLOSE_UP_MARGIN = { vertical: 0.06, side: 0.05 } as const;
const outsideMargin = (b: {
  left: number;
  right: number;
  top: number;
  bottom: number;
}) =>
  b.left < CLOSE_UP_MARGIN.side - 1e-6 ||
  b.right > 1 - CLOSE_UP_MARGIN.side + 1e-6 ||
  b.top < CLOSE_UP_MARGIN.vertical - 1e-6 ||
  b.bottom > 1 - CLOSE_UP_MARGIN.vertical + 1e-6;

/**
 * Moments of a camera cut (outside Detay) where an edge of the product comes
 * closer to the frame edge than CLOSE_UP_MARGIN, for a cut-out of
 * `productSize`, with the renderer's focus clamp. Empty when clean.
 */
export function closeUpProblems(
  spec: ProductVideoSpec,
  productSize: { width: number; height: number } = DEFAULT_PRODUCT_SIZE,
  detail = false,
): string[] {
  const ratio = spec.ratio ?? "9:16";
  const aspect = productSize.width / Math.max(1, productSize.height);
  const o = {
    duration: spec.duration,
    camera: spec.camera,
    ratio,
    aspect,
    fit: fitFactor(spec.keys, ratio, aspect),
    parallax: spec.look?.parallax ?? 0.4,
  };
  const shots = spec.shots ?? [];
  const out: string[] = [];
  shots.forEach((shot, i) => {
    if (shot.zoom <= 1.0001 || detail) return;
    const end = shots[i + 1]?.t ?? spec.duration;
    for (let t = shot.t; t < end; t += SAMPLE) {
      if (poseAt(spec.keys, t).opacity < 0.05) continue;
      if (outsideMargin(closeUpBox(spec.keys, shot, t, o))) {
        out.push(`shot at ${shot.t}: t ${t.toFixed(2)}`);
        break;
      }
    }
  });
  return out;
}

function limitShots(
  shots: ProductShot[],
  keys: ProductKey[],
  opts: {
    duration: number;
    camera: ProductVideoSpec["camera"];
    ratio: FrameRatio;
    quality: ProductQuality;
    productSize: { width: number; height: number };
    detail: boolean;
    parallax: number;
  },
): ProductShot[] {
  const { duration, camera, ratio } = opts;
  const aspect = opts.productSize.width / Math.max(1, opts.productSize.height);
  const rh = ratioHeight(ratio);
  const fit = fitFactor(keys, ratio, aspect);
  const framePixels = frameSize(ratio, opts.quality).height;
  const camMax = Math.max(camera.zoomFrom, camera.zoomTo);
  return shots.map((shot, i) => {
    if (shot.zoom <= 1.0001) return shot;
    const end = shots[i + 1]?.t ?? duration;
    let scale = 0;
    for (let t = shot.t; t <= end; t += SAMPLE)
      scale = Math.max(scale, poseAt(keys, t).scale);
    const h = scale * fit; // frame heights
    const w = h * aspect * rh; // frame widths
    const limit = Math.min(
      (opts.detail ? CLOSE_UP.detailMaxWidth : CLOSE_UP.maxWidth) / w,
      (CLOSE_UP.maxUpscale * opts.productSize.height) / (h * framePixels),
    );
    let zoom = Math.floor(Math.min(shot.zoom, limit / camMax) * 1000) / 1000;
    if (!opts.detail) {
      // The whole product stays in frame at every moment of the cut, with
      // the focus clamp the renderer applies.
      const o = {
        duration,
        camera,
        ratio,
        aspect,
        fit,
        parallax: opts.parallax,
      };
      const inFrame = (z: number) => {
        for (let t = shot.t; t < end; t += SAMPLE) {
          if (poseAt(keys, t).opacity < 0.05) continue;
          if (outsideMargin(closeUpBox(keys, { ...shot, zoom: z }, t, o)))
            return false;
        }
        return true;
      };
      while (zoom >= 1.08 && !inFrame(zoom))
        zoom = Math.round((zoom - 0.01) * 1000) / 1000;
    }
    return zoom < 1.08
      ? { ...shot, zoom: 1, focusX: 0, focusY: 0 }
      : { ...shot, zoom };
  });
}

/** Composite finishing on a scene photo and on a studio gradient. */
const SCENE_LOOK: ProductLook = {
  grain: 0.35,
  vignette: 0.3,
  sceneBlur: 0.55,
  parallax: 0.2,
  harmonize: 0.7,
};
const STUDIO_LOOK: ProductLook = {
  grain: 0.4,
  vignette: 0.35,
  sceneBlur: 0,
  parallax: 0.5,
  harmonize: 0.35,
};

/** WCAG contrast ratio of two "#RRGGBB" colours. */
function contrastOf(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Below this share of its designed size the product makes `buildSpec` drop texts. */
export const MIN_PRODUCT_SHARE = 0.65;
/** Smallest product height (frame heights) in the 9:16 social layout. */
export const MIN_SOCIAL_PRODUCT = 0.34;

/**
 * Build the renderer spec for a template. Empty texts are left out. The
 * spec's `ratio` has the input's ratio type (video screens get AspectRatio).
 * When the texts would leave the product under MIN_PRODUCT_SHARE of its
 * designed size (or under MIN_SOCIAL_PRODUCT in the social layout), the call
 * to action is dropped, then the badge; `spec.dropped` says which.
 */
export function buildSpec<R extends FrameRatio = AspectRatio>(
  input: TemplateInput & { ratio?: R },
): ProductVideoSpec & { ratio: R } {
  const tooSmall = (r: ReturnType<typeof buildSpecOnce<R>>) => {
    const rest = r.spec.keys[r.spec.keys.length - 1].scale;
    return (
      rest < MIN_PRODUCT_SHARE * r.designed - 1e-9 ||
      (r.social && rest < MIN_SOCIAL_PRODUCT - 1e-9)
    );
  };
  const restOf = (r: ReturnType<typeof buildSpecOnce<R>>) =>
    r.spec.keys[r.spec.keys.length - 1].scale;
  // Escalation: the designed layout; both text stacks moved to the frame
  // edges; then without the call to action; then without the badge. A drop
  // only stays if it actually gives the product room.
  let best = buildSpecOnce(input, false);
  if (!tooSmall(best)) return best.spec;
  best = buildSpecOnce(input, true);
  const dropped: DroppedText[] = [];
  let attempt = { ...input };
  for (const field of ["cta", "badge"] as const) {
    if (!tooSmall(best)) break;
    if (!clean(attempt[field])) continue;
    const next = { ...attempt, [field]: "" };
    const result = buildSpecOnce(next, true);
    if (restOf(result) < restOf(best) * 1.03) break;
    attempt = next;
    best = result;
    dropped.push(field);
  }
  return dropped.length > 0 ? { ...best.spec, dropped } : best.spec;
}

/**
 * Kampanya's own scheme (approved Vitrin frame) while nobody chose colours:
 * ink type and chips, one orange accent with ink type on it.
 */
const CAMPAIGN_COLORS: Omit<TextColors, "sparkle"> = {
  ink: "#141210",
  accent: "#FF7A00",
  onAccent: "#141210",
};

/** Templates offered in the single flow share the approved scheme. */
const APPROVED_SCHEME: readonly TemplateId[] = [
  "campaign",
  "discount",
  "showcase",
];

/** Type colour on an ink fill: the accent when it reads, else onAccent. */
const campaignOnInk = (palette: Palette) =>
  contrastOf(palette.accent, palette.ink) >= 3
    ? palette.accent
    : palette.onAccent;

function buildSpecOnce<R extends FrameRatio>(
  input: TemplateInput & { ratio?: R },
  /** Move both text stacks to the frame edges to give the product room. */
  compact: boolean,
): {
  spec: ProductVideoSpec & { ratio: R };
  /** The product resting height before it made room for the texts. */
  designed: number;
  social: boolean;
} {
  const basePalette = paletteById(input.palette),
    // Ink type only reads on a light backdrop; dark palettes keep their own.
    approved =
      !input.colors &&
      APPROVED_SCHEME.includes(input.template) &&
      contrastOf(CAMPAIGN_COLORS.ink, basePalette.background.top) >= 4.5,
    scheme: Palette = input.colors
      ? { ...basePalette, ...input.colors }
      : approved
        ? { ...basePalette, ...CAMPAIGN_COLORS }
        : basePalette,
    brand = input.brandAccent,
    palette: Palette =
      brand && contrastOf(brand.accent, scheme.background.top) >= 2.2
        ? {
            ...scheme,
            accent: brand.accent,
            onAccent: brand.onAccent,
            sparkle: brand.accent,
          }
        : scheme,
    // Accent type alone does not read on paper: under the approved scheme
    // the big price of Vitrin and İndirim is ink.
    priceInk = approved,
    info = templateById(input.template),
    fontStyle = input.fontStyle ?? DEFAULT_FONT_STYLE[info.id],
    duration = info.duration,
    headline = clean(input.headline),
    price = clean(input.price),
    upper = (text: string) => upperFor(text, input.textLang ?? "tr"),
    badge = upper(clean(input.badge)),
    cta = clean(input.cta),
    store = clean(input.store ?? ""),
    // The old price only means something next to the new one.
    oldPrice = price ? clean(input.oldPrice ?? "") : "",
    scene = input.scene ?? null,
    ratio: FrameRatio = input.ratio ?? "9:16";
  const texts: ProductText[] = [];
  const add = (
    text: string,
    rest: Omit<ProductText, "text">,
  ): ProductText | null => {
    if (!text) return null;
    const entry = { text, ...rest };
    texts.push(entry);
    return entry;
  };
  /**
   * The struck-through old price, centred `dy` (9:16 frame heights) from the
   * price: negative above it, positive below it.
   */
  const addOldPrice = (
    p: ProductText | null,
    dy: number,
    size: number,
    lead = 0.25,
  ) => {
    if (!oldPrice || !p) return;
    add(oldPrice, {
      start: Math.max(0, p.start - lead),
      end: p.end,
      y: p.y + dy,
      size,
      weight: "bold",
      color: palette.ink,
      fill: "",
      animation: "fade",
      strike: true,
    });
  };
  let keys: ProductKey[];
  let camera = { zoomFrom: 1, zoomTo: 1.06 };
  let sweeps: ProductVideoSpec["sweeps"];
  let sparkles: ProductVideoSpec["sparkles"] = null;
  let shots: ProductShot[] = [];

  switch (info.id) {
    case "showcase": {
      // Hero → detail close-up → end card. The product steps up a little at
      // the last cut so the end card has room for the price block.
      const closeUp = 3.4,
        endCard = 6;
      keys = [
        key(0, 0.6, 0.38, 0),
        key(1.3, 0.47, 0.5, 1, "back"),
        key(endCard - 0.01, 0.455, 0.52, 1, "linear"),
        key(endCard, 0.43, 0.48, 1, "linear"),
        key(duration, 0.42, 0.5, 1, "linear"),
      ];
      shots = [
        { t: 0, zoom: 1, focusX: 0, focusY: 0 },
        { t: closeUp, zoom: 1.7, focusX: 0, focusY: -0.18 },
        { t: endCard, zoom: 1, focusX: 0, focusY: 0 },
      ];
      sweeps = [
        { start: 1.5, duration: 1.1 },
        { start: closeUp + 0.5, duration: 1.4 },
        { start: endCard + 1.2, duration: 1.1 },
      ];
      sparkles = { count: 18, color: palette.sparkle, seed: 7 };
      add(headline, {
        start: 1.7,
        end: closeUp,
        y: 0.13,
        size: 0.075,
        weight: "bold",
        color: palette.ink,
        fill: "",
        animation: "rise",
        exit: "rise",
      });
      add(badge, {
        start: 2.2,
        end: closeUp,
        y: 0.205,
        size: 0.042,
        weight: "heavy",
        color: palette.onAccent,
        fill: palette.accent,
        animation: "pop",
        exit: "pop",
      });
      add(headline, {
        start: endCard + 0.15,
        end: duration,
        y: 0.13,
        size: 0.075,
        weight: "bold",
        color: palette.ink,
        fill: "",
        animation: "rise",
      });
      const showcasePrice = add(price, {
        start: endCard + 0.5,
        end: duration,
        y: 0.78,
        size: 0.1,
        weight: "heavy",
        color: priceInk ? palette.ink : palette.accent,
        fill: "",
        animation: "pop",
      });
      addOldPrice(showcasePrice, -0.072, 0.05);
      add(cta, {
        start: endCard + 1.1,
        end: duration,
        y: 0.87,
        size: 0.05,
        weight: "bold",
        color: palette.onAccent,
        fill: palette.accent,
        animation: "rise",
      });
      break;
    }
    case "lightTour": {
      const closeUp = 4,
        endCard = 7;
      camera = { zoomFrom: 1, zoomTo: 1.14 };
      keys = [
        key(0, 0.5, 0.5, 0, "out", -3),
        key(0.8, 0.5, 0.52, 1, "out", -3),
        key(endCard - 0.01, 0.49, 0.55, 1, "inOut", 3),
        key(endCard, 0.43, 0.5, 1, "linear", 1),
        key(duration, 0.42, 0.5, 1, "inOut", -1),
      ];
      shots = [
        { t: 0, zoom: 1, focusX: 0, focusY: 0 },
        { t: closeUp, zoom: 1.6, focusX: 0, focusY: -0.12 },
        { t: endCard, zoom: 1, focusX: 0, focusY: 0 },
      ];
      sweeps = [
        { start: 1, duration: 1.6 },
        { start: closeUp + 0.3, duration: 1.8 },
        { start: endCard + 0.6, duration: 1.6 },
      ];
      add(headline, {
        start: 1.5,
        end: closeUp,
        y: 0.84,
        size: 0.07,
        weight: "bold",
        color: palette.ink,
        fill: "",
        animation: "fade",
        exit: "fade",
      });
      add(badge, {
        start: endCard + 0.2,
        end: duration,
        y: 0.1,
        size: 0.04,
        weight: "heavy",
        color: palette.onAccent,
        fill: palette.accent,
        animation: "slide",
      });
      add(headline, {
        start: endCard + 0.1,
        end: duration,
        y: 0.76,
        size: 0.07,
        weight: "bold",
        color: palette.ink,
        fill: "",
        animation: "fade",
      });
      const tourPrice = add(price, {
        start: endCard + 0.6,
        end: duration,
        y: oldPrice ? 0.87 : 0.84,
        size: 0.065,
        weight: "heavy",
        color: palette.accent,
        fill: "",
        animation: "fade",
      });
      addOldPrice(tourPrice, -0.052, 0.04);
      add(cta, {
        start: endCard + 1.2,
        end: duration,
        y: 0.93,
        size: 0.045,
        weight: "bold",
        color: palette.ink,
        fill: "",
        animation: "fade",
      });
      break;
    }
    case "turntable":
      camera = { zoomFrom: 1, zoomTo: 1.05 };
      keys = [
        key(0, 0.5, 0.5, 0, "out", 0, 0.5, -28),
        key(0.8, 0.48, 0.52, 1, "out", 0, 0.5, -24),
        key(3.3, 0.47, 0.53, 1, "inOut", 0, 0.5, 26),
        key(5.8, 0.48, 0.53, 1, "inOut", 0, 0.5, -26),
        key(8.3, 0.47, 0.54, 1, "inOut", 0, 0.5, 22),
        key(duration, 0.47, 0.55, 1, "inOut", 0, 0.5, 0),
      ];
      sweeps = [
        { start: 1.6, duration: 1.1 },
        { start: 4.1, duration: 1.1 },
        { start: 6.6, duration: 1.1 },
      ];
      add(headline, {
        start: 1,
        end: duration,
        y: 0.12,
        size: 0.07,
        weight: "bold",
        color: palette.ink,
        fill: "",
        animation: "rise",
      });
      add(badge, {
        start: 1.6,
        end: duration,
        y: 0.19,
        size: 0.04,
        weight: "heavy",
        color: palette.onAccent,
        fill: palette.accent,
        animation: "pop",
      });
      addOldPrice(
        add(price, {
          start: 3.5,
          end: duration,
          y: 0.86,
          size: 0.09,
          weight: "heavy",
          color: palette.accent,
          fill: "",
          animation: "pop",
        }),
        -0.055,
        0.045,
      );
      add(cta, {
        start: 6,
        end: duration,
        y: 0.925,
        size: 0.045,
        weight: "bold",
        color: palette.ink,
        fill: "",
        animation: "fade",
      });
      break;
    case "unboxing":
      camera = { zoomFrom: 1.1, zoomTo: 1 };
      keys = [
        key(0, 0.56, 0.04, 0),
        key(0.9, 0.56, 0.06, 1, "out"),
        key(1.7, 0.48, 0.52, 1, "back"),
        key(duration, 0.47, 0.55, 1, "linear"),
      ];
      sweeps = [
        { start: 1.8, duration: 1 },
        { start: 6, duration: 1.1 },
      ];
      sparkles = { count: 28, color: palette.sparkle, seed: 21 };
      add(badge, {
        start: 0.4,
        end: duration,
        y: 0.12,
        size: 0.045,
        weight: "heavy",
        color: palette.onAccent,
        fill: palette.accent,
        animation: "pop",
      });
      add(headline, {
        start: 2.2,
        end: duration,
        y: 0.19,
        size: 0.07,
        weight: "bold",
        color: palette.ink,
        fill: "",
        animation: "rise",
      });
      addOldPrice(
        add(price, {
          start: 3.6,
          end: duration,
          y: 0.82,
          size: 0.09,
          weight: "heavy",
          color: palette.accent,
          fill: "",
          animation: "pop",
        }),
        -0.051,
        0.045,
      );
      add(cta, {
        start: 5.5,
        end: duration,
        y: 0.9,
        size: 0.05,
        weight: "bold",
        color: palette.onAccent,
        fill: palette.accent,
        animation: "rise",
      });
      break;
    case "store":
      camera = { zoomFrom: 1, zoomTo: 1.08 };
      keys = [
        key(0, 0.53, 0.42, 0, "out"),
        key(1.2, 0.5, 0.44, 1, "out"),
        key(3.5, 0.48, 0.45, 1, "inOut"),
        key(6, 0.5, 0.45, 1, "inOut"),
        key(duration, 0.48, 0.46, 1, "inOut"),
      ];
      sweeps = [{ start: 2.5, duration: 1.4 }];
      add(upper(store), {
        start: 0.2,
        end: duration,
        y: 0.11,
        size: 0.09,
        weight: "heavy",
        color: palette.ink,
        fill: "",
        animation: "rise",
      });
      add(headline, {
        start: 1.6,
        end: duration,
        y: 0.76,
        size: 0.06,
        weight: "bold",
        color: palette.ink,
        fill: "",
        animation: "fade",
      });
      addOldPrice(
        add(price, {
          start: 3,
          end: duration,
          y: 0.82,
          size: 0.06,
          weight: "heavy",
          color: palette.accent,
          fill: "",
          animation: "fade",
        }),
        0.04,
        0.038,
      );
      add(badge, {
        start: 4,
        end: duration,
        y: 0.18,
        size: 0.04,
        weight: "heavy",
        color: palette.onAccent,
        fill: palette.accent,
        animation: "pop",
      });
      add(cta, {
        start: 5.5,
        end: duration,
        y: oldPrice ? 0.915 : 0.9,
        size: 0.05,
        weight: "bold",
        color: palette.onAccent,
        fill: palette.accent,
        animation: "pop",
      });
      break;
    case "campaign":
      // Approved Vitrin ad (docs/hedef/video-vurus-listesi.md): the product
      // moves in from the first frame, then turns once (yaw -8 -> +6 -> 0),
      // breathes slowly and rests calmly for the last 1.5 s while every text
      // stays. Texts enter in order: tag, name, price, button.
      camera = { zoomFrom: 1.04, zoomTo: 1 };
      {
        // With an old price the product steps back to leave room above it.
        const k = oldPrice ? 0.92 : 1,
          dy = oldPrice ? -0.01 : 0,
          cx = 0.53, // a little right of centre, like the mock
          y = 0.5 + dy;
        keys = [
          key(0, 1.25, 0.48 * k, 1, "inOut", 0, cx),
          key(0.9, y, 0.48 * k, 1, "back", 0, cx),
          key(1.9, y, 0.48 * k, 1, "inOut", 0, cx, -8),
          key(2.4, y, 0.48 * k, 1, "inOut", 0, cx, 6),
          key(2.75, y - 0.03, 0.51 * k, 1, "out", 0, cx, 3),
          key(3.1, y, 0.48 * k, 1, "inOut", 0, cx, 0),
          key(4.5, y, 0.48 * k, 1, "linear", 0, cx, 0),
          key(5.5, y, 0.49 * k, 1, "inOut", 0, cx, 4),
          key(6.8, y, 0.5 * k, 1, "inOut", 0, cx, -4),
          key(7.5, y - 0.01, 0.5 * k, 1, "inOut", 0, cx, 0),
          key(duration, y - 0.01, 0.5 * k, 1, "linear", 0, cx, 0),
        ];
      }
      sweeps = [{ start: 1, duration: 0.9 }];
      // Small tag chip (the mock's "etiket"): an ink chip with accent type,
      // or onAccent type when the accent would not read on the ink. The
      // button pill below uses the same pair.
      add(badge, {
        start: 0.3,
        end: duration,
        y: 0.075,
        size: 0.04,
        weight: "heavy",
        color: campaignOnInk(palette),
        fill: palette.ink,
        animation: "pop",
        tracking: 0.14,
        font: "modern",
      });
      // The name: big uppercase headline, up to two lines (fitTextSizes).
      add(upper(headline), {
        start: 1.2,
        end: duration,
        y: 0.2,
        size: 0.085,
        weight: "bold",
        color: palette.ink,
        fill: "",
        animation: "rise",
      });
      // The price is the strongest element: a big accent block (the engine
      // has no round sticker shape).
      addOldPrice(
        add(price, {
          start: 2.6,
          end: duration,
          y: 0.78,
          size: 0.105,
          weight: "heavy",
          color: palette.onAccent,
          fill: palette.accent,
          animation: "pop",
        }),
        -0.075,
        0.045,
      );
      // The button: an ink pill.
      add(cta, {
        start: 4,
        end: duration,
        y: 0.89,
        size: 0.044,
        weight: "heavy",
        color: campaignOnInk(palette),
        fill: palette.ink,
        animation: "pop",
        font: "modern",
      });
      break;
    case "editorial":
      // A magazine page: big serif headline, still product, slow push-in.
      camera = { zoomFrom: 1, zoomTo: 1.12 };
      keys = [
        key(0, 0.5, 0.48, 0, "out"),
        key(1.2, 0.5, 0.48, 1, "out"),
        key(duration, 0.49, 0.48, 1, "inOut"),
      ];
      sweeps = [{ start: 4, duration: 2.2 }];
      add(headline, {
        start: 0.8,
        end: duration,
        y: 0.14,
        size: 0.085,
        weight: "regular",
        color: palette.ink,
        fill: "",
        animation: "fade",
      });
      add(badge, {
        start: 1.6,
        end: duration,
        y: 0.195,
        size: 0.032,
        weight: "bold",
        color: palette.accent,
        fill: "",
        animation: "fade",
        tracking: 0.2,
      });
      addOldPrice(
        add(price, {
          start: 3,
          end: duration,
          y: 0.83,
          size: 0.065,
          weight: "regular",
          color: palette.ink,
          fill: "",
          animation: "fade",
        }),
        -0.045,
        0.04,
      );
      add(cta, {
        start: 5,
        end: duration,
        y: 0.9,
        size: 0.036,
        weight: "bold",
        color: palette.ink,
        fill: "",
        animation: "fade",
        tracking: 0.12,
      });
      break;
    case "detail": {
      // Hero, two close-ups (upper third, then the label), end card.
      const closeUp = 3.2,
        second = 5.6,
        endCard = 8;
      keys = [
        key(0, 0.62, 0.42, 0),
        key(1.1, 0.48, 0.5, 1, "back"),
        key(endCard - 0.01, 0.47, 0.52, 1, "linear"),
        key(endCard, 0.45, 0.47, 1, "linear"),
        key(duration, 0.45, 0.48, 1, "linear"),
      ];
      shots = [
        { t: 0, zoom: 1, focusX: 0, focusY: 0 },
        // Upper third (shoulder, cap), then the middle (label).
        { t: closeUp, zoom: 2.2, focusX: 0, focusY: -0.17 },
        { t: second, zoom: 2.2, focusX: 0, focusY: 0 },
        { t: endCard, zoom: 1, focusX: 0, focusY: 0 },
      ];
      sweeps = [
        { start: closeUp + 0.4, duration: 1.4 },
        { start: second + 0.4, duration: 1.4 },
        { start: endCard + 1, duration: 1.1 },
      ];
      add(headline, {
        start: 1.2,
        end: closeUp,
        y: 0.13,
        size: 0.07,
        weight: "bold",
        color: palette.ink,
        fill: "",
        animation: "rise",
        exit: "rise",
      });
      add(badge, {
        start: 1.7,
        end: closeUp,
        y: 0.195,
        size: 0.04,
        weight: "heavy",
        color: palette.onAccent,
        fill: palette.accent,
        animation: "pop",
        exit: "pop",
      });
      add(headline, {
        start: endCard + 0.15,
        end: duration,
        y: 0.13,
        size: 0.07,
        weight: "bold",
        color: palette.ink,
        fill: "",
        animation: "rise",
      });
      addOldPrice(
        add(price, {
          start: endCard + 0.5,
          end: duration,
          y: 0.79,
          size: 0.09,
          weight: "heavy",
          color: palette.accent,
          fill: "",
          animation: "pop",
        }),
        -0.062,
        0.045,
      );
      add(cta, {
        start: endCard + 1.1,
        end: duration,
        y: 0.88,
        size: 0.05,
        weight: "bold",
        color: palette.onAccent,
        fill: palette.accent,
        animation: "rise",
      });
      break;
    }
    case "discount": {
      // The old price alone, struck out; then the new price pops in under it.
      const reveal = oldPrice ? 3.3 : 1.6;
      keys = [
        key(0, 0.48, 0.3, 0, "out"),
        key(0.8, 0.46, 0.47, 1, "back"),
        key(duration, 0.45, 0.48, 1, "linear"),
      ];
      sweeps = [{ start: reveal, duration: 0.9 }];
      add(badge, {
        start: 0.3,
        end: duration,
        y: 0.12,
        size: 0.07,
        weight: "heavy",
        color: palette.onAccent,
        fill: palette.accent,
        animation: "pop",
      });
      add(headline, {
        start: 1,
        end: duration,
        y: 0.2,
        size: 0.05,
        weight: "bold",
        color: palette.ink,
        fill: "",
        animation: "slide",
      });
      add(oldPrice, {
        start: 1.4,
        end: reveal,
        y: 0.78,
        size: 0.085,
        weight: "heavy",
        color: palette.ink,
        fill: "",
        animation: "fade",
        exit: "pop",
        strike: true,
      });
      addOldPrice(
        add(price, {
          start: reveal,
          end: duration,
          y: 0.8,
          size: 0.12,
          weight: "heavy",
          color: priceInk ? palette.ink : palette.accent,
          fill: "",
          animation: "pop",
        }),
        -0.07,
        0.045,
        0,
      );
      add(cta, {
        start: reveal + 1.2,
        end: duration,
        y: 0.89,
        size: 0.05,
        weight: "heavy",
        color: palette.onAccent,
        fill: palette.accent,
        animation: "pop",
      });
      break;
    }
    case "minimal":
      // A still product with room around it; small, widely spaced capitals.
      camera = { zoomFrom: 1, zoomTo: 1.03 };
      keys = [
        key(0, 0.47, 0.46, 0, "out"),
        key(1.6, 0.47, 0.46, 1, "out"),
        key(duration, 0.47, 0.465, 1, "linear"),
      ];
      sweeps = [{ start: 5, duration: 2 }];
      add(upper(headline), {
        start: 1.5,
        end: duration,
        y: 0.14,
        size: 0.04,
        weight: "regular",
        color: palette.ink,
        fill: "",
        animation: "fade",
        tracking: 0.16,
      });
      add(badge, {
        start: 2.2,
        end: duration,
        y: 0.19,
        size: 0.028,
        weight: "bold",
        color: palette.accent,
        fill: "",
        animation: "fade",
        tracking: 0.22,
      });
      addOldPrice(
        add(price, {
          start: 3,
          end: duration,
          y: 0.83,
          size: 0.045,
          weight: "bold",
          color: palette.ink,
          fill: "",
          animation: "fade",
          tracking: 0.1,
        }),
        -0.035,
        0.03,
      );
      add(upper(cta), {
        start: 5,
        end: duration,
        y: 0.9,
        size: 0.03,
        weight: "regular",
        color: palette.ink,
        fill: "",
        animation: "fade",
        tracking: 0.22,
      });
      break;
  }

  // Type: the chosen family for display texts; serif styles pair with the
  // sans for pills and calls to action. Sizes get the family's optical factor.
  const uiFont: FontStyle =
    fontStyle === "elegant" || fontStyle === "editorial" ? "modern" : fontStyle;
  const tagged = input.priceTag
    ? applyPriceTag(texts, input.priceTag, price, oldPrice, palette)
    : texts;
  const styled = tagged.map((t) => {
    const font =
      t.font ??
      (t.fill !== "" || t.text === cta || t.text === badge
        ? uiFont
        : fontStyle);
    return {
      ...t,
      font,
      size: Math.min(0.2, t.size * FONT_SIZE_FACTOR[font]),
    };
  });
  // Long texts shrink to their line budget, then everything moves into the
  // frame shape, texts on screen together stack without overlapping, and the
  // product makes room for the texts.
  const sized = fitTextSizes(
    styled,
    (t) => !!headline && (t.text === headline || t.text === upper(headline)),
  );
  const fitted = fitToRatio(keys, sized, ratio);
  const placed = scene ? sceneForRatio(scene, ratio) : null;
  const social = input.safeArea === "social" && ratio === "9:16";
  // On a scene the product stands low, so the bottom stack moves down to the
  // safe line to leave it room. The social layout puts every text on top.
  const stacked = social
    ? socialTexts(fitted.texts, duration)
    : compact
      ? raiseTopStack(
          lowerBottomStack(stackTexts(fitted.texts, ratio), ratio),
          ratio,
        )
      : placed
        ? lowerBottomStack(stackTexts(fitted.texts, ratio), ratio)
        : stackTexts(fitted.texts, ratio);
  let onScene = placed ? keysOnScene(fitted.keys, placed) : fitted.keys;
  if (social) onScene = socialKeys(onScene, placed !== null);
  const restKey = onScene[onScene.length - 1];
  const designed = restKey.scale,
    restBase = restKey.y + restKey.scale / 2;
  const cleared = clearProduct(
    onScene,
    stacked,
    social
      ? {
          duration,
          camera,
          shots,
          ratio,
          // The product stands below the texts; on a scene its base may sink
          // to SOCIAL_SCENE_BASE (the backdrop surface runs to the bottom).
          anchor: "base",
          up: 0,
          down: placed ? Math.max(0, SOCIAL_SCENE_BASE - restBase) : 0,
        }
      : {
          duration,
          camera,
          shots,
          ratio,
          anchor: placed ? "base" : "centre",
          // On a scene the base may rise by 0.12 of the image height (it still
          // stands on the surface) and sink a little; on a palette it moves freely.
          up: placed ? 0.12 / (placed.crop.height ?? 1) : 0.2,
          down: placed ? 0.02 : 0.2,
        },
  );
  const limitedShots = limitShots(shots, cleared, {
    duration,
    camera,
    ratio,
    quality: input.quality,
    productSize: input.productSize ?? DEFAULT_PRODUCT_SIZE,
    detail: info.id === "detail",
    parallax: placed ? SCENE_LOOK.parallax : STUDIO_LOOK.parallax,
  });
  const spec = {
    product: input.product,
    quality: input.quality,
    duration,
    fps: 30 as const,
    bitrate: input.bitrate ?? "high",
    background: placed
      ? {
          ...palette.background,
          floor: false,
          image: placed.uri,
          imageX: placed.crop.x,
          imageWidth: placed.crop.width,
          imageY: placed.crop.y ?? 0,
          imageHeight: placed.crop.height ?? 1,
          shade: placed.shade ?? 1,
        }
      : palette.background,
    camera,
    keys: cleared,
    shadow: true,
    reflection: placed ? false : palette.background.floor,
    sweeps,
    // Sparkles read as dust on photographic scenes.
    sparkles: placed ? null : sparkles,
    texts: stacked,
    watermark: input.watermark,
    music: input.music,
    relief: input.relief === false ? 0 : RELIEF[info.id],
    ratio: ratio as R,
    shots: limitedShots,
    look: withSceneQuality(placed ? SCENE_LOOK : STUDIO_LOOK),
  };
  return { spec, designed, social };
}

/** How strongly each template lights the product's relief (0 = off). */
const RELIEF: Record<TemplateId, number> = {
  showcase: 0.6,
  lightTour: 0.85,
  turntable: 0.75,
  campaign: 0,
  unboxing: 0.5,
  store: 0.5,
  editorial: 0.55,
  detail: 0.7,
  discount: 0,
  minimal: 0.45,
};

const HEX = /^#[0-9A-Fa-f]{6}$/;
const TEXT_ANIMATIONS: readonly TextAnimation[] = [
  "rise",
  "fade",
  "pop",
  "slide",
];
const fin = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n);

/** Problems the native renderer would reject; empty when the spec is valid. */
export function specProblems(spec: ProductVideoSpec): string[] {
  const out: string[] = [];
  const d = spec.duration;
  if (!spec.product) out.push("product");
  if (!fin(d) || d < LIMITS.minDuration || d > LIMITS.maxDuration)
    out.push("duration");
  for (const c of [
    spec.background.top,
    spec.background.bottom,
    spec.background.glow,
  ])
    if (!HEX.test(c)) out.push("background colour");
  if (
    !fin(spec.camera.zoomFrom) ||
    !fin(spec.camera.zoomTo) ||
    spec.camera.zoomFrom < 1 ||
    spec.camera.zoomTo < 1 ||
    spec.camera.zoomFrom > 1.5 ||
    spec.camera.zoomTo > 1.5
  )
    out.push("camera");
  if (spec.keys.length < 1 || spec.keys.length > LIMITS.maxKeys)
    out.push("keys");
  let last = -1;
  for (const k of spec.keys) {
    if (
      ![k.t, k.x, k.y, k.scale, k.rotation, k.opacity, k.yaw].every(fin) ||
      Math.abs(k.yaw) > 35 ||
      k.t < 0 ||
      k.t > d ||
      k.t <= last ||
      k.scale <= 0 ||
      k.scale > 1.5 ||
      k.opacity < 0 ||
      k.opacity > 1
    )
      out.push("key at " + k.t);
    last = k.t;
  }
  if (spec.keys[0] && spec.keys[0].t !== 0) out.push("first key must be at 0");
  if (spec.bitrate !== "compact" && spec.bitrate !== "high")
    out.push("bitrate");
  if (
    spec.dropped !== undefined &&
    (!Array.isArray(spec.dropped) ||
      !spec.dropped.every((d) => DROPPED_TEXTS.includes(d)))
  )
    out.push("dropped");
  if (
    spec.shadowStyle !== undefined &&
    spec.shadowStyle !== "full" &&
    spec.shadowStyle !== "contact"
  )
    out.push("shadow style");
  const bg = spec.background;
  const iy = bg.imageY ?? 0,
    ih = bg.imageHeight ?? 1;
  if (
    !fin(iy) ||
    !fin(ih) ||
    iy < 0 ||
    ih <= 0 ||
    iy + ih > 1 + 1e-9 ||
    (bg.shade !== undefined && (!fin(bg.shade) || bg.shade < 0 || bg.shade > 1))
  )
    out.push("background image");
  if (splitBad(bg.split)) out.push("background split");
  if (spec.ratio !== undefined && !ALL_RATIOS.includes(spec.ratio))
    out.push("ratio");
  const shots = spec.shots ?? [];
  if (shots.length > LIMITS.maxShots) out.push("shots");
  let lastShot = -1;
  for (const s of shots) {
    if (
      ![s.t, s.zoom, s.focusX, s.focusY].every(fin) ||
      s.t < 0 ||
      s.t >= d ||
      s.t <= lastShot ||
      s.zoom < 1 ||
      s.zoom > LIMITS.maxShotZoom ||
      Math.abs(s.focusX) > 1 ||
      Math.abs(s.focusY) > 1
    )
      out.push("shot at " + s.t);
    lastShot = s.t;
  }
  if (spec.look) {
    const l = spec.look;
    if (
      ![l.grain, l.vignette, l.sceneBlur, l.parallax, l.harmonize].every(
        (v) => fin(v) && v >= 0 && v <= 1,
      )
    )
      out.push("look");
  }
  if (!fin(spec.relief) || spec.relief < 0 || spec.relief > 1)
    out.push("relief");
  if (spec.sweeps.length > LIMITS.maxSweeps) out.push("sweeps");
  for (const s of spec.sweeps)
    if (
      !fin(s.start) ||
      !fin(s.duration) ||
      s.start < 0 ||
      s.duration <= 0 ||
      s.start >= d
    )
      out.push("sweep");
  if (
    spec.sparkles &&
    (!fin(spec.sparkles.count) ||
      spec.sparkles.count < 0 ||
      spec.sparkles.count > LIMITS.maxSparkles ||
      !HEX.test(spec.sparkles.color))
  )
    out.push("sparkles");
  if (spec.texts.length > LIMITS.maxTexts) out.push("texts");
  for (const t of spec.texts)
    if (
      !t.text ||
      t.text.length > LIMITS.maxTextLength ||
      !fin(t.start) ||
      !fin(t.end) ||
      t.start < 0 ||
      t.end > d ||
      t.start >= t.end ||
      !fin(t.y) ||
      t.y < 0 ||
      t.y > 1 ||
      !fin(t.size) ||
      t.size <= 0 ||
      t.size > 0.2 ||
      !HEX.test(t.color) ||
      (t.fill !== "" && !HEX.test(t.fill)) ||
      (t.exit !== undefined && !TEXT_ANIMATIONS.includes(t.exit)) ||
      (t.strike !== undefined && typeof t.strike !== "boolean") ||
      (t.font !== undefined && !FONT_STYLES.some((f) => f.id === t.font)) ||
      (t.tracking !== undefined &&
        (!fin(t.tracking) || t.tracking < -0.05 || t.tracking > 0.3))
    )
      out.push("text " + JSON.stringify(t.text));
  if (
    spec.music &&
    (!spec.music.uri ||
      !fin(spec.music.volume) ||
      spec.music.volume < 0 ||
      spec.music.volume > 1)
  )
    out.push("music");
  if (spec.scenes) out.push(...sceneProblems(spec.scenes, d));
  if (
    spec.grade !== undefined &&
    !(
      spec.grade &&
      [spec.grade.warmth, spec.grade.saturation, spec.grade.contrast, spec.grade.fade].every(
        (v) => fin(v) && v >= -1 && v <= 1,
      )
    )
  )
    out.push("grade");
  return out;
}

function sceneProblems(scenes: ProductScene[], duration: number): string[] {
  const out: string[] = [];
  if (scenes.length < 1 || scenes.length > MAX_SCENES) out.push("scenes count");
  scenes.forEach((sc, i) => {
    const n = "scene " + i;
    if (!fin(sc.start) || sc.start < 0 || sc.start >= duration)
      out.push("scenes start " + i);
    else if (i === 0 ? sc.start !== 0 : sc.start <= scenes[i - 1].start)
      out.push("scenes order " + i);
    if (!sc.image) out.push(n + " image");
    if (sc.mode !== "cutout" && sc.mode !== "photo" && sc.mode !== "depth")
      out.push(n + " mode");
    if (!Array.isArray(sc.keys)) out.push(n + " keys");
    if (
      !["cut", "push", "wipe", "zoom", "blur", "flash"].includes(sc.transition?.kind) ||
      !fin(sc.transition.duration) ||
      sc.transition.duration < 0 ||
      sc.transition.duration > 1.5
    )
      out.push(n + " transition");
    if (sc.shade !== undefined && (!fin(sc.shade) || sc.shade < 0 || sc.shade > 1))
      out.push(n + " shade");
    if (splitBad(sc.background?.split)) out.push(n + " background split");
  });
  return out;
}

/** A background split outside 0 <= split < 1 (absent is fine). */
function splitBad(s: number | undefined): boolean {
  return s !== undefined && (!fin(s) || s < 0 || s >= 1);
}

// MARK: Poster moment

/**
 * The moment to use as a video's cover, Library thumbnail or poster: the
 * product fully visible and at rest, outside a close-up, with as many texts
 * fully in as at any moment (entrance finished, not leaving). Ties go to the
 * calmer pose, then to the later moment. Seconds, on a 1/30 s frame.
 */
export function posterTime(spec: ProductVideoSpec): number {
  const d = spec.duration;
  const fallback = Math.max(0, d - 0.5);
  if (!(d > 0) || spec.keys.length === 0) return fallback;
  let best = -Infinity,
    bestT = fallback;
  const step = 1 / 30;
  for (let f = Math.ceil(0.5 / step); f * step <= d - 0.5 + 1e-9; f++) {
    const t = f * step;
    if (frameZoomAt(t, d, spec.camera, spec.shots ?? []) === null) continue;
    const k = poseAt(spec.keys, t);
    if (k.opacity < 0.99) continue;
    let textsIn = 0;
    for (const text of spec.texts) {
      if (t < text.start + 0.5 || t > text.end) continue;
      const leaving =
        text.end < d - 0.01 &&
        text.end - t <
          Math.max(0.15, Math.min(0.4, (text.end - text.start) / 3));
      if (!leaving) textsIn++;
    }
    // Moving, turned or tilted products make a weaker cover.
    const next = poseAt(spec.keys, Math.min(d, t + 0.2));
    const motion =
      Math.abs(next.x - k.x) +
      Math.abs(next.y - k.y) +
      Math.abs(next.scale - k.scale);
    const score =
      textsIn * 10 -
      motion * 40 -
      Math.abs(k.yaw) / 15 -
      Math.abs(k.rotation) / 10;
    if (score >= best - 1e-9) {
      best = score;
      bestT = t;
    }
  }
  return Math.round(bestT * 30) / 30;
}

/**
 * How much a still enlarges the cut-out at `time` (default the end card):
 * drawn product height in pixels over the cut-out's pixel height. Above 1
 * the product is upscaled (soft). `width` is the still's pixel width
 * (default the 1080p frame).
 */
export function stillEnlargement(
  spec: ProductVideoSpec,
  productSize: { width: number; height: number },
  width?: number,
  time: number = spec.duration - 0.5,
): number {
  const frame =
    (width !== undefined ? stillSize(spec.ratio, width) : null) ??
    frameSize(spec.ratio, "1080p");
  const aspect =
    Math.max(1, productSize.width) / Math.max(1, productSize.height);
  // The renderer's one fit factor for wide products (90% of the width).
  const maxScale = Math.max(...spec.keys.map((k) => k.scale));
  const fit = Math.min(
    1,
    (frame.width * 0.9) / Math.max(1, maxScale * frame.height * aspect),
  );
  const drawn = poseAt(spec.keys, time).scale * frame.height * fit;
  return drawn / Math.max(1, productSize.height);
}

// MARK: Marketplace main image

export type MainImageInput = {
  /** Cut-out PNG with transparency. */
  product: string;
  /** Pixel size of the cut-out (from `cutOut`). */
  productSize: { width: number; height: number };
  /** Frame shape; the pixel size goes to `exportStill`. Default "1:1". */
  ratio?: FrameRatio;
  /** Share of the frame the product's larger side takes (0.5...0.9); default 0.85. */
  fill?: number;
  /** Soft contact shadow under the product; default true. */
  shadow?: boolean;
  /**
   * Pixel width the still will be saved at (the `width` given to
   * `saveStill`); default the 1080p frame. The product is never drawn larger
   * than its own pixels at that size: a small cut-out fills less of the
   * frame instead of going soft (see `mainImageFit`).
   */
  width?: number;
};

/**
 * The fill a main image really gets: `requested` (input.fill, clamped) unless
 * the cut-out has too few pixels for it at `input.width`, then less.
 * `neededHeight` is the cut-out pixel height that would reach `requested`.
 */
export function mainImageFit(input: MainImageInput): {
  fill: number;
  requested: number;
  neededHeight: number;
  /** Height share of the frame the product takes (the key's scale). */
  scale: number;
} {
  const ratio = input.ratio ?? "1:1";
  const requested = Math.min(
    0.9,
    Math.max(0.5, Number.isFinite(input.fill) ? (input.fill as number) : 0.85),
  );
  const pw = Math.max(1, input.productSize.width),
    ph = Math.max(1, input.productSize.height);
  // Height share of the frame per unit of fill; a wide product is limited by the width.
  const perFill = Math.min(1, 1 / ((pw / ph) * ratioHeight(ratio)));
  const frame =
    (input.width !== undefined ? stillSize(ratio, input.width) : null) ??
    frameSize(ratio, "1080p");
  const neededHeight = Math.ceil(requested * perFill * frame.height);
  const scale = Math.min(requested * perFill, ph / frame.height);
  return { fill: scale / perFill, requested, neededHeight, scale };
}

/**
 * A marketplace main image: the product centred on pure white, no text, no
 * finish (grain, vignette, glow, floor, sweeps, sparkles, relief), only a
 * soft contact shadow. The product fits a box of `fill` times the frame on
 * both sides, so its larger side takes `fill` of the matching frame side,
 * unless that would enlarge the cut-out at `width` (then it fills less).
 * Export it with `saveStill(spec, { time: 0, width })`, the same `width`.
 */
export function buildMainImageSpec(input: MainImageInput): ProductVideoSpec {
  const ratio = input.ratio ?? "1:1";
  const { scale } = mainImageFit(input);
  const white = "#FFFFFF";
  return {
    product: input.product,
    quality: "1080p",
    duration: LIMITS.minDuration,
    fps: 30,
    bitrate: "high",
    background: {
      top: white,
      bottom: white,
      glow: white,
      floor: false,
      image: "",
      imageX: 0,
      imageWidth: 1,
    },
    camera: { zoomFrom: 1, zoomTo: 1 },
    keys: [key(0, 0.5, scale, 1, "linear")],
    shadow: input.shadow !== false,
    shadowStyle: "contact",
    reflection: false,
    sweeps: [],
    sparkles: null,
    texts: [],
    watermark: false,
    music: null,
    relief: 0,
    ratio,
    shots: [],
    look: { grain: 0, vignette: 0, sceneBlur: 0, parallax: 0, harmonize: 0 },
  };
}

// MARK: Own photo as scene, photo check

/** What `imageInfo` measures on a photo; lumas are 0...1 (sRGB, Rec. 709). */
export type ImageInfo = {
  /** Upright pixel size (EXIF orientation applied). */
  width: number;
  height: number;
  meanLuma: number;
  /** Mean luma where top / bottom texts sit, in the centred 9:16 part (`sceneCrop`). */
  topLuma: number;
  bottomLuma: number;
};

/**
 * Text colours that read on a photo: dark type when the text bands are
 * light, white type when they are dark. Accent pills keep the contrast.
 */
export function textColorsForScene(
  info: Pick<ImageInfo, "topLuma" | "bottomLuma">,
): TextColors {
  // The darker band decides: white type on a light band is the worse miss.
  const luma = Math.min(info.topLuma, info.bottomLuma);
  return luma > 0.55
    ? {
        ink: "#1A1A1A",
        accent: "#1A1A1A",
        onAccent: "#FFFFFF",
        sparkle: "#FFFFFF",
      }
    : {
        ink: "#FFFFFF",
        accent: "#FFFFFF",
        onAccent: "#1A1A1A",
        sparkle: "#FFFFFF",
      };
}

/** Quality of a cut-out's photo, measured by `cutOut` (missing on older builds). */
export type PhotoQuality = {
  /**
   * Variance of the Laplacian of the product's luma (0...255) at an analysis
   * size of at most 512 px on the long side, inside the product only; -1 when
   * too little of the product could be measured.
   */
  sharpness: number;
  /** Mean luma of the whole photo, 0...1. */
  brightness: number;
};
export type PhotoWarning = "blurry" | "dark" | "small";
/** Thresholds of `photoWarnings`; chosen so an ordinary phone photo passes. */
export const PHOTO_LIMITS = {
  minSharpness: 25,
  minBrightness: 0.2,
  minSide: 600,
} as const;

/** Gentle hints about the seller's photo; nothing is blocked. */
export function photoWarnings(cutout: {
  width: number;
  height: number;
  quality?: PhotoQuality | null;
}): PhotoWarning[] {
  const out: PhotoWarning[] = [];
  const q = cutout.quality;
  if (q && q.sharpness >= 0 && q.sharpness < PHOTO_LIMITS.minSharpness)
    out.push("blurry");
  if (
    q &&
    Number.isFinite(q.brightness) &&
    q.brightness < PHOTO_LIMITS.minBrightness
  )
    out.push("dark");
  if (Math.max(cutout.width, cutout.height) < PHOTO_LIMITS.minSide)
    out.push("small");
  return out;
}

/**
 * True when the cut-out is the whole photo, i.e. nothing was separated: it
 * covers at least 92 % of the photo's width and height. The native cut-out
 * scales the photo to at most 2048 px on the long side before cropping to
 * the subject, so the photo size gets the same scale. False when the photo
 * size is unknown.
 */
export function isWholePhotoCutout(
  cutout: { width: number; height: number },
  photo: { width: number; height: number } | null | undefined,
): boolean {
  if (!photo || !(photo.width > 0) || !(photo.height > 0)) return false;
  const scale = Math.min(1, 2048 / Math.max(photo.width, photo.height));
  return (
    cutout.width >= 0.92 * photo.width * scale &&
    cutout.height >= 0.92 * photo.height * scale
  );
}

/** Fallback text for an unknown system error, per kind of work; never the raw text. */
export function fallbackErrorText(context: "video" | "cutout" | "still"): {
  tr: string;
  en: string;
} {
  if (context === "cutout")
    return {
      tr: "Ürün ayrılamadı. Tekrar dene.",
      en: "The product could not be cut out. Try again.",
    };
  if (context === "still")
    return {
      tr: "Görsel hazırlanamadı. Tekrar dene.",
      en: "The image could not be prepared. Try again.",
    };
  return {
    tr: "Video hazırlanamadı. Tekrar dene.",
    en: "The video could not be made. Please try again.",
  };
}
