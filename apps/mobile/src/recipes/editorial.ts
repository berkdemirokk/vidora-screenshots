import {
  LIMITS,
  MAX_CARDS,
  buildSpec,
  type AspectRatio,
  type Ease,
  type FontStyle,
  type LightLeak,
  type PaletteId,
  type ProductGrade,
  type ProductKey,
  type ProductQuality,
  type ProductScene,
  type ProductText,
  type ProductVideoSpec,
  type SceneTransition,
  type TextAnimation,
  trackingFor,
} from "../product-templates.ts";
import {
  estimateLines,
  keysForRatio,
  ratioLayout,
  textHalfHeight,
  textWidth,
} from "./build.ts";

/**
 * "Editoryal": full-frame photo videos from three AI shots (context, hand,
 * macro) and the seller's photos. Each cut (EDITORIAL_CUTS) is data: its
 * shots, grade, look and the two texts. SIGNATURE is the first cut, 13 shots
 * at 120 bpm (13.0 s) after the target video in
 * docs/hedef/yeni-video-v2/shotlist.md: the AI shots play the target's
 * lavender field / vanity, hand and macro images, the seller's photos play
 * the flat lay and spa shots.
 */
export type EditorialInput = {
  /** [context, hand, macro]; null = not made. */
  ai: (string | null)[];
  photos: string[];
  cutouts: (string | null)[];
  name: string;
  price: string;
  palette: PaletteId;
  music: { uri: string; volume: number } | null;
  watermark: boolean;
  quality: ProductQuality;
  /**
   * Frame shape; default "9:16" (the shot list's own). 4:5 and 1:1 keep
   * each crop's photo point with a little more zoom and re-band the texts
   * (see ratioLayout in build.ts).
   */
  ratio?: AspectRatio;
};

/**
 * Photo mode: scale = zoom 1...3, x/y = photo point at the frame centre;
 * depth mode: scale = dolly 1...1.4, x/y = camera offset -1...1.
 */
export type CutCrop = { x: number; y: number; scale: number };

export type CutShot = {
  /** Seconds; a shot ends where the next one starts. */
  start: number;
  end: number;
  /** An AI shot (the seller's photos stand in when it is missing) or the next seller photo. */
  source: "context" | "hand" | "macro" | "photo";
  /** Crop at the shot's start, as authored for the AI shot's composition. */
  crop: CutCrop;
  motion: {
    /** Crop at the end (settle: from `settle` s on). */
    to: CutCrop;
    /**
     * drift (photo default): a linear move with handheld drift and roll on a
     * key every ~0.5 s; settle: eases out to `to` by `settle` s, then holds;
     * glide: one smooth move with `ease` (depth always glides).
     */
    style?: "drift" | "settle" | "glide";
    settle?: number;
    ease?: Ease;
    /** Camera roll at the first key, degrees (±8); level by the last key. */
    roll?: number;
  };
  /** Default "photo". */
  mode?: "photo" | "depth";
  /** How the shot enters; default a hard cut. */
  transition?: SceneTransition;
  /**
   * Photo shots only: with at least two seller photos the shot becomes a
   * collage of this many (2...4) of them in turn; otherwise one photo shot.
   */
  cards?: number;
  /** 0...1 darkening under a text. */
  shade?: number;
};

type CutText = {
  font: FontStyle;
  weight: ProductText["weight"];
  tracking: number;
  /** 9:16 centre; feed shapes re-band it (ratioLayout). */
  y: number;
  animation: TextAnimation;
  exit: TextAnimation;
};

export type EditorialCut = {
  id: string;
  tr: string;
  en: string;
  /** The gallery card's line. */
  about: { tr: string; en: string };
  /** Tempo of the cut (and of its beat music); every cut sits on its half-beat grid. */
  bpm: number;
  /** At most MAX_SCENES; the last one ends the video. */
  shots: CutShot[];
  /**
   * Seller shot k shows photo k; when the photos run out, photo
   * `pairs[k % pairs.length]` (default: from the first again).
   */
  pairs?: number[];
  /** Handheld drift (fraction of the frame) and roll (degrees) at the inner keys. */
  handheld: { drift: number; roll: number };
  grade: ProductGrade;
  look: { grain: number; vignette: number };
  /** Warm film-burns over the finished frame (seconds). */
  leaks?: LightLeak[];
  /** The name: sized to `width` on one line, `max` at most, wraps (two lines) below `min`. */
  title: CutText & {
    start: number;
    end: number;
    width: number;
    max: number;
    min: number;
  };
  /** "name · price" from `start` to the end. */
  end: CutText & { start: number; size: number };
  /** The gallery poster's moment (seconds). */
  poster: number;
};

/**
 * Our AI shots are only 768x1344: their zoom stops here in every shape
 * (beyond it they go soft); the photo point is kept. Seller photos keep the
 * cut's zoom.
 */
const AI_ZOOM = 1.7;
/** Seller photos are framed around the product: crops pulled halfway to the centre. */
const PULL = 0.5;
const TEXT_COLOR = "#F6F0E6";
const TEXT_FLOOR = 0.035;
const CUT: SceneTransition = { kind: "cut", duration: 0 };
const FLASH: SceneTransition = { kind: "flash", duration: 0 };
const WHIP = (direction: "left" | "right"): SceneTransition => ({
  kind: "whip",
  duration: 0.25,
  direction,
});

const c = (scale: number, x: number, y: number): CutCrop => ({ x, y, scale });

/** The target shot list (docs/hedef/yeni-video-v2/shotlist.md). */
export const SIGNATURE: EditorialCut = {
  id: "signature",
  tr: "İmza",
  en: "Signature",
  about: {
    tr: "Yapay zekâ çekimleri ve senin fotoğraflarınla dergi tadında bir video.",
    en: "A magazine-style video from AI shots and your own photos.",
  },
  bpm: 120,
  // One shot per line, like the shot lists.
  // prettier-ignore
  shots: [
    // 1 lavender field, wide, title (a little darker: the engine has no top
    // gradient for photo scenes, so this stands in for the target's)
    { start: 0, end: 2, source: "context", crop: c(1.0, 0.5, 0.5), motion: { to: c(1.07, 0.51, 0.52) }, shade: 0.16 },
    // 2 hand, medium
    { start: 2, end: 3, source: "hand", crop: c(1.35, 0.58, 0.58), motion: { to: c(1.43, 0.57, 0.55) } },
    // 3 macro, cap
    { start: 3, end: 3.75, source: "macro", crop: c(1.6, 0.63, 0.24), motion: { to: c(1.7, 0.6, 0.26) } },
    // 4 vanity wall, pull back
    { start: 3.75, end: 4.75, source: "context", crop: c(1.8, 0.42, 0.3), motion: { to: c(1.74, 0.48, 0.31) } },
    // 5 flat lay detail
    { start: 4.75, end: 5.5, source: "photo", crop: c(2.0, 0.62, 0.36), motion: { to: c(2.1, 0.64, 0.33) } },
    // 6 spa, medium
    { start: 5.5, end: 6.5, source: "photo", crop: c(1.3, 0.46, 0.55), motion: { to: c(1.38, 0.47, 0.57) } },
    // 7 hand detail
    { start: 6.5, end: 7.25, source: "hand", crop: c(2.4, 0.62, 0.7), motion: { to: c(2.5, 0.6, 0.68) } },
    // 8 flowers detail, blurs out
    { start: 7.25, end: 8, source: "context", crop: c(2.4, 0.8, 0.62), motion: { to: c(2.55, 0.76, 0.6) } },
    // 9 macro droplets, blur in
    { start: 8, end: 8.5, source: "macro", crop: c(2.4, 0.3, 0.64), motion: { to: c(2.3, 0.32, 0.62) }, transition: { kind: "blur", duration: 0.25 } },
    // 10 spa detail
    { start: 8.5, end: 9, source: "photo", crop: c(2.3, 0.8, 0.78), motion: { to: c(2.4, 0.78, 0.76) } },
    // 11 flat lay wide, flash: a slow dolly with a small orbit, the roll
    // levels out over the shot
    { start: 9, end: 10, source: "photo", mode: "depth", crop: c(1, 0, 0), motion: { to: c(1.08, 0.25, -0.1), roll: -1.6 }, transition: FLASH },
    // 12 vanity detail
    { start: 10, end: 11, source: "context", crop: c(2.0, 0.4, 0.68), motion: { to: c(2.08, 0.43, 0.67) } },
    // 13 hero: settles by 0.55 s, then holds still for the end line
    { start: 11, end: 13, source: "context", crop: c(1.13, 0.56, 0.52), motion: { to: c(1.06, 0.55, 0.52), style: "settle", settle: 0.55 }, shade: 0.1 },
  ],
  // Target pairing of the 4 seller shots (flat lay, spa, spa, flat lay).
  pairs: [0, 1, 1, 0],
  handheld: { drift: 0.006, roll: 0.18 },
  // Warm, a little faded and less saturated (the target's pre-graded photos).
  grade: { warmth: 0.35, saturation: -0.2, contrast: 0.1, fade: 0.15 },
  look: { grain: 0.35, vignette: 0.3 },
  title: {
    start: 0.2,
    end: 2,
    y: 0.3,
    font: "editorial",
    weight: "regular",
    tracking: 0.01,
    width: 0.55,
    max: 0.11,
    min: 0.075,
    animation: "fade",
    exit: "fade",
  },
  end: {
    start: 11.5,
    y: 0.22,
    size: 0.045,
    font: "editorial",
    weight: "regular",
    tracking: 0.04,
    animation: "fade",
    exit: "fade",
  },
  // The closing hero shot with name and price.
  poster: 12.2,
};

/** Energetic: 120 bpm, mostly one shot a beat, flashes on bars 3 and 5. */
const RITIM: EditorialCut = {
  id: "ritim",
  tr: "Ritim",
  en: "Rhythm",
  about: {
    tr: "Vuruşa oturan hızlı kesimler, iki flaş ve kalın bir başlık.",
    en: "Fast cuts on the beat, two flashes and a bold title.",
  },
  bpm: 120,
  // One shot per line, like the shot lists.
  // prettier-ignore
  shots: [
    { start: 0, end: 1, source: "context", crop: c(1.0, 0.5, 0.5), motion: { to: c(1.1, 0.5, 0.52) }, shade: 0.18 },
    { start: 1, end: 1.5, source: "photo", crop: c(1.5, 0.45, 0.55), motion: { to: c(1.6, 0.46, 0.53) }, shade: 0.12 },
    { start: 1.5, end: 2, source: "hand", crop: c(2.2, 0.62, 0.7), motion: { to: c(2.3, 0.6, 0.68) } },
    { start: 2, end: 2.5, source: "macro", crop: c(1.1, 0.5, 0.45), motion: { to: c(1.2, 0.52, 0.44) } },
    { start: 2.5, end: 3, source: "photo", crop: c(2.2, 0.62, 0.36), motion: { to: c(2.35, 0.64, 0.34) }, transition: WHIP("left") },
    { start: 3, end: 3.5, source: "context", crop: c(1.5, 0.42, 0.3), motion: { to: c(1.6, 0.46, 0.31) } },
    { start: 3.5, end: 4, source: "photo", crop: c(1.05, 0.5, 0.5), motion: { to: c(1.15, 0.5, 0.48) } },
    // Bar 3's downbeat.
    { start: 4, end: 4.5, source: "macro", crop: c(2.1, 0.63, 0.24), motion: { to: c(2.2, 0.6, 0.26) }, transition: FLASH },
    { start: 4.5, end: 5, source: "photo", crop: c(1.55, 0.38, 0.6), motion: { to: c(1.65, 0.4, 0.58), roll: -4 } },
    { start: 5, end: 5.5, source: "hand", crop: c(1.1, 0.55, 0.55), motion: { to: c(1.2, 0.57, 0.56) } },
    { start: 5.5, end: 6, source: "photo", crop: c(2.2, 0.7, 0.7), motion: { to: c(2.35, 0.68, 0.68) } },
    { start: 6, end: 7, source: "photo", mode: "depth", crop: c(1, 0, 0), motion: { to: c(1.15, 0.3, -0.05), roll: 2 }, transition: WHIP("right") },
    { start: 7, end: 7.5, source: "context", crop: c(1.6, 0.4, 0.68), motion: { to: c(1.5, 0.43, 0.67) } },
    { start: 7.5, end: 8, source: "photo", crop: c(1.05, 0.55, 0.45), motion: { to: c(1.15, 0.54, 0.46), roll: 3 } },
    // Bar 5's downbeat.
    { start: 8, end: 8.5, source: "macro", crop: c(2.2, 0.3, 0.64), motion: { to: c(2.1, 0.32, 0.62) }, transition: FLASH },
    { start: 8.5, end: 10.5, source: "context", crop: c(1.2, 0.56, 0.52), motion: { to: c(1.1, 0.55, 0.52), style: "settle", settle: 0.4 }, shade: 0.12 },
  ],
  handheld: { drift: 0.008, roll: 0.3 },
  // Cooler, a touch more contrast.
  grade: { warmth: -0.1, saturation: -0.05, contrast: 0.22, fade: 0.05 },
  look: { grain: 0.25, vignette: 0.25 },
  title: {
    start: 0,
    end: 1.5,
    y: 0.28,
    font: "modern",
    weight: "heavy",
    tracking: 0,
    width: 0.62,
    max: 0.12,
    min: 0.07,
    animation: "pop",
    exit: "fade",
  },
  end: {
    start: 8.75,
    y: 0.72,
    size: 0.042,
    font: "modern",
    weight: "bold",
    tracking: 0.02,
    animation: "pop",
    exit: "fade",
  },
  // The bold title over the opening.
  poster: 0.8,
};

/** Luxury slow: 100 bpm, 1.2-1.8 s shots, slow push-ins, soft wipes and blurs. */
const SAKIN_LUKS: EditorialCut = {
  id: "sakin-luks",
  tr: "Sakin lüks",
  en: "Quiet luxury",
  about: {
    tr: "Yavaş yaklaşmalar, yumuşak geçişler ve sıcak, sakin renkler.",
    en: "Slow push-ins, soft transitions and warm, calm colours.",
  },
  bpm: 100,
  // One shot per line, like the shot lists.
  // prettier-ignore
  shots: [
    { start: 0, end: 1.8, source: "context", crop: c(1.0, 0.5, 0.5), motion: { to: c(1.08, 0.51, 0.52), style: "glide", ease: "inOut" }, shade: 0.18 },
    { start: 1.8, end: 3, source: "photo", crop: c(1.45, 0.46, 0.55), motion: { to: c(1.55, 0.47, 0.56), style: "glide" }, transition: { kind: "blur", duration: 0.4 }, shade: 0.12 },
    { start: 3, end: 4.5, source: "macro", crop: c(1.0, 0.55, 0.4), motion: { to: c(1.12, 0.58, 0.36), style: "glide" }, transition: { kind: "wipe", duration: 0.5 } },
    { start: 4.5, end: 5.7, source: "photo", crop: c(2.0, 0.62, 0.36), motion: { to: c(2.15, 0.63, 0.35), style: "glide" }, transition: { kind: "blur", duration: 0.35 } },
    { start: 5.7, end: 7.5, source: "photo", mode: "depth", crop: c(1, 0, 0), motion: { to: c(1.1, 0.15, -0.08), ease: "inOut" }, transition: { kind: "wipe", duration: 0.6 } },
    { start: 7.5, end: 8.7, source: "hand", crop: c(1.5, 0.58, 0.58), motion: { to: c(1.62, 0.58, 0.56), style: "glide" }, transition: { kind: "blur", duration: 0.4 } },
    { start: 8.7, end: 10.2, source: "photo", crop: c(1.05, 0.5, 0.5), motion: { to: c(1.15, 0.5, 0.49), style: "glide" }, transition: { kind: "wipe", duration: 0.5 } },
    { start: 10.2, end: 11.4, source: "context", crop: c(1.6, 0.4, 0.68), motion: { to: c(1.72, 0.42, 0.67), style: "glide" }, transition: { kind: "blur", duration: 0.4 } },
    { start: 11.4, end: 13.2, source: "context", crop: c(1.15, 0.56, 0.52), motion: { to: c(1.05, 0.55, 0.52), style: "settle", settle: 1.2 }, transition: { kind: "blur", duration: 0.4 }, shade: 0.12 },
  ],
  handheld: { drift: 0, roll: 0 },
  // Warm, low contrast, more fade.
  grade: { warmth: 0.4, saturation: -0.25, contrast: -0.08, fade: 0.28 },
  look: { grain: 0.25, vignette: 0.35 },
  // One warm burn across the depth shot.
  leaks: [{ start: 5.7, end: 7.3, strength: 0.55 }],
  title: {
    start: 0.4,
    end: 2.7,
    y: 0.32,
    font: "elegant",
    weight: "regular",
    tracking: 0.02,
    width: 0.6,
    max: 0.1,
    min: 0.07,
    animation: "fade",
    exit: "fade",
  },
  end: {
    start: 11.8,
    y: 0.7,
    size: 0.042,
    font: "elegant",
    weight: "regular",
    tracking: 0.06,
    animation: "fade",
    exit: "fade",
  },
  // The serif title over the wide opening.
  poster: 1.5,
};

/** Macro-led: close-ups and context take turns, depth in the middle, a zoom into the macro. */
const DETAY: EditorialCut = {
  id: "detay",
  tr: "Detay hikâyesi",
  en: "Detail story",
  about: {
    tr: "Yakın çekimlerle ürünün dokusunu ve ayrıntılarını anlatır.",
    en: "Tells the product's texture and details in close-ups.",
  },
  bpm: 120,
  // One shot per line, like the shot lists.
  // prettier-ignore
  shots: [
    { start: 0, end: 1.5, source: "macro", crop: c(1.0, 0.55, 0.45), motion: { to: c(1.12, 0.57, 0.43) }, shade: 0.14 },
    { start: 1.5, end: 2.5, source: "photo", crop: c(2.2, 0.62, 0.36), motion: { to: c(2.3, 0.64, 0.34) }, shade: 0.12 },
    { start: 2.5, end: 3.5, source: "context", crop: c(1.4, 0.45, 0.4), motion: { to: c(1.5, 0.47, 0.42) } },
    { start: 3.5, end: 4.25, source: "macro", crop: c(2.0, 0.63, 0.24), motion: { to: c(2.1, 0.61, 0.26) }, transition: { kind: "zoom", duration: 0.35 } },
    { start: 4.25, end: 5, source: "photo", crop: c(1.45, 0.46, 0.55), motion: { to: c(1.55, 0.47, 0.57) } },
    { start: 5, end: 6, source: "hand", crop: c(2.2, 0.62, 0.7), motion: { to: c(2.3, 0.6, 0.68) } },
    { start: 6, end: 7.25, source: "photo", mode: "depth", crop: c(1, 0, 0), motion: { to: c(1.12, -0.2, -0.1), roll: 1.2 } },
    { start: 7.25, end: 8, source: "macro", crop: c(1.9, 0.3, 0.64), motion: { to: c(2.0, 0.32, 0.62) } },
    { start: 8, end: 8.75, source: "photo", crop: c(1.1, 0.5, 0.5), motion: { to: c(1.2, 0.5, 0.48) } },
    { start: 8.75, end: 9.75, source: "hand", crop: c(2.2, 0.55, 0.62), motion: { to: c(2.3, 0.56, 0.6) } },
    { start: 9.75, end: 10.75, source: "macro", crop: c(1.35, 0.4, 0.55), motion: { to: c(1.5, 0.42, 0.54) }, transition: { kind: "blur", duration: 0.25 } },
    { start: 10.75, end: 13, source: "context", crop: c(1.15, 0.56, 0.52), motion: { to: c(1.06, 0.55, 0.52), style: "settle", settle: 0.5 }, shade: 0.1 },
  ],
  handheld: { drift: 0.004, roll: 0.12 },
  grade: { warmth: 0.15, saturation: -0.1, contrast: 0.18, fade: 0.08 },
  look: { grain: 0.4, vignette: 0.4 },
  title: {
    start: 0.3,
    end: 2.3,
    y: 0.72,
    font: "modern",
    weight: "regular",
    tracking: 0.14,
    width: 0.5,
    max: 0.07,
    min: 0.05,
    animation: "fade",
    exit: "fade",
  },
  end: {
    start: 11.25,
    y: 0.72,
    size: 0.038,
    font: "modern",
    weight: "regular",
    tracking: 0.14,
    animation: "fade",
    exit: "fade",
  },
  // Inside the zoom into the macro.
  poster: 3.9,
};

/** Seller-photo-led: 96 bpm, one photo a beat (each one at least once), one depth, ends on the context. */
const LOOKBOOK: EditorialCut = {
  id: "lookbook",
  tr: "Lookbook",
  en: "Lookbook",
  about: {
    tr: "Fotoğraflarının hepsini ritimle sıralayan bir katalog videosu.",
    en: "A catalogue video that lines up all your photos on the beat.",
  },
  bpm: 96,
  // One shot per line, like the shot lists.
  // prettier-ignore
  shots: [
    { start: 0, end: 1.25, source: "context", crop: c(1.0, 0.5, 0.5), motion: { to: c(1.08, 0.5, 0.52) }, shade: 0.16 },
    { start: 1.25, end: 1.875, source: "photo", crop: c(1.4, 0.5, 0.5), motion: { to: c(1.48, 0.5, 0.48) } },
    // Two beats: a card collage of three photos (one plain photo shot with fewer than two photos).
    { start: 1.875, end: 3.125, source: "photo", crop: c(1.05, 0.4, 0.45), motion: { to: c(1.12, 0.41, 0.46) }, cards: 3 },
    { start: 3.125, end: 3.75, source: "hand", crop: c(1.9, 0.6, 0.66), motion: { to: c(2.0, 0.6, 0.64) } },
    { start: 3.75, end: 4.375, source: "photo", crop: c(1.1, 0.45, 0.5), motion: { to: c(1.18, 0.46, 0.49) } },
    { start: 4.375, end: 5, source: "photo", crop: c(1.55, 0.6, 0.4), motion: { to: c(1.62, 0.59, 0.41) } },
    { start: 5, end: 6.25, source: "photo", mode: "depth", crop: c(1, 0, 0), motion: { to: c(1.1, 0.2, -0.08) }, transition: { kind: "push", duration: 0.3 } },
    { start: 6.25, end: 6.875, source: "macro", crop: c(1.2, 0.55, 0.45), motion: { to: c(1.3, 0.56, 0.44) } },
    { start: 6.875, end: 7.5, source: "photo", crop: c(1.6, 0.42, 0.58), motion: { to: c(1.68, 0.43, 0.57) } },
    { start: 7.5, end: 8.125, source: "photo", crop: c(1.08, 0.6, 0.55), motion: { to: c(1.15, 0.59, 0.54) } },
    { start: 8.125, end: 10, source: "context", crop: c(1.4, 0.56, 0.52), motion: { to: c(1.15, 0.55, 0.52), style: "settle", settle: 0.5 }, shade: 0.1 },
  ],
  handheld: { drift: 0.005, roll: 0.15 },
  grade: { warmth: 0.18, saturation: -0.12, contrast: 0.1, fade: 0.1 },
  look: { grain: 0.3, vignette: 0.22 },
  title: {
    start: 0.2,
    end: 1.25,
    y: 0.68,
    // Handwritten accent: a normal name fits one line, a long one wraps to
    // two (never upper case, never letter-spaced).
    font: "script",
    weight: "bold",
    tracking: 0,
    width: 0.64,
    max: 0.12,
    min: 0.075,
    animation: "fade",
    exit: "fade",
  },
  end: {
    start: 8.4,
    y: 0.7,
    size: 0.045,
    font: "editorial",
    weight: "regular",
    tracking: 0.08,
    animation: "fade",
    exit: "fade",
  },
  // The closing context shot with name and price.
  poster: 9.4,
};

/** The Editoryal shelf, in order. */
export const EDITORIAL_CUTS: readonly EditorialCut[] = [
  SIGNATURE,
  RITIM,
  SAKIN_LUKS,
  DETAY,
  LOOKBOOK,
];

/** The cut with `id`; unknown or absent (older drafts) = SIGNATURE. */
export function cutById(id: string | null | undefined): EditorialCut {
  return EDITORIAL_CUTS.find((cut) => cut.id === id) ?? SIGNATURE;
}

/** A cut's length in seconds. */
export const cutDuration = (cut: EditorialCut): number =>
  cut.shots[cut.shots.length - 1].end;

export const EDITORIAL_DURATION = cutDuration(SIGNATURE);
export const EDITORIAL_GRADE: ProductGrade = SIGNATURE.grade;

type Crop = [scale: number, x: number, y: number];
const AI_INDEX = { context: 0, hand: 1, macro: 2 } as const;

const r4 = (n: number) => Math.round(n * 10000) / 10000;
const key = (
  t: number,
  [scale, x, y]: Crop,
  ease: ProductKey["ease"] = "linear",
  rotation = 0,
): ProductKey => ({
  t: r4(t),
  x: r4(x),
  y: r4(y),
  scale: r4(scale),
  rotation: r4(rotation),
  opacity: 1,
  yaw: 0,
  ease,
});

/** Largest size up to `start` at which `text` takes at most two lines. */
function fit(
  text: string,
  start: number,
  font: FontStyle,
  track: number,
): number {
  let size = start;
  while (size > TEXT_FLOOR && estimateLines(text, size, font, track) > 2)
    size = Math.max(TEXT_FLOOR, r4(size - 0.0025));
  return size;
}

export function buildEditorialSpec(
  input: EditorialInput,
  cut: EditorialCut = SIGNATURE,
): ProductVideoSpec {
  const ai = [0, 1, 2].map((i) => input.ai[i] || null);
  // Only AI shots and no photo: they stand in for the photos.
  const photos =
    input.photos.length > 0 ? input.photos : ai.filter((a): a is string => !!a);
  if (photos.length < 1) throw new Error("editorial needs a photo");
  const n = photos.length;
  const shots = cut.shots;
  const duration = cutDuration(cut);
  const layout = ratioLayout(input.ratio);

  // Images: AI shots and seller shots first, then missing AI shots from the
  // photos in turn (from the first one the seller shots left unused), avoiding
  // the neighbours' photo where possible.
  let seller = 0;
  const collage = new Map<number, string[]>();
  const images: (string | null)[] = shots.map(({ source, cards }, i) => {
    if (source !== "photo") return ai[AI_INDEX[source]];
    if (cards && input.photos.length >= 2) {
      const count = Math.min(cards, MAX_CARDS, n);
      collage.set(i, Array.from({ length: count }, (_, j) => photos[(seller + j) % n]));
      seller += count;
      return photos[(seller - count) % n];
    }
    const k = seller++;
    if (k < n) return photos[k];
    return photos[(cut.pairs ? cut.pairs[k % cut.pairs.length] : k) % n];
  });
  let next = seller % n;
  images.forEach((img, i) => {
    if (img) return;
    const penalty = (p: string) =>
      (p === images[i - 1] ? 2 : 0) + (p === images[i + 1] ? 1 : 0);
    let best = next;
    for (let j = 1; j < n; j++) {
      const cand = (next + j) % n;
      if (penalty(photos[cand]) < penalty(photos[best])) best = cand;
    }
    images[i] = photos[best];
    next = (best + 1) % n;
  });

  // Seeded -1...1 sequences: the same input always gives the same video. The
  // roll has its own, so the x/y drift stays as before.
  const seeded = (seed: number) => () => {
    seed = (seed * 16807) % 2147483647;
    return (seed / 2147483647) * 2 - 1;
  };
  const rnd = seeded(7),
    roll = seeded(11);
  const { drift, roll: wobble } = cut.handheld;

  const scenes: ProductScene[] = shots.map((shot, i) => {
    const image = images[i] as string;
    const len = shot.end - shot.start;
    const own = shot.source !== "photo" && image === ai[AI_INDEX[shot.source]];
    const mode = shot.mode ?? "photo";
    const { motion } = shot;
    const style = mode === "depth" ? "glide" : (motion.style ?? "drift");
    const r0 = motion.roll ?? 0;
    // Depth crops are camera moves; our AI shots stop at AI_ZOOM, seller
    // photos are pulled toward the centre.
    const pull = ({ scale: s, x, y }: CutCrop): Crop =>
      mode === "depth"
        ? [s, x, y]
        : own
          ? [Math.min(s, AI_ZOOM), x, y]
          : [s, 0.5 + (x - 0.5) * PULL, 0.5 + (y - 0.5) * PULL];
    const a = pull(shot.crop),
      b = pull(motion.to);
    let keys: ProductKey[];
    if (style === "glide") {
      keys = [key(0, a, "linear", r0), key(len, b, motion.ease ?? "linear")];
    } else if (style === "settle") {
      // Settles (ease out), then holds still for the end line.
      const at = motion.settle ?? 0.55;
      keys = [key(0, a, "linear", r0), key(at, b, "out"), key(len, b)];
    } else {
      // Linear push/pan plus handheld drift and roll at the inner keys
      // (level on the cuts, besides the shot's own roll).
      const segs = Math.max(2, Math.round(len / 0.5));
      keys = Array.from({ length: segs + 1 }, (_, j) => {
        const f = j / segs;
        const s = a[0] + (b[0] - a[0]) * f;
        const inner = j > 0 && j < segs;
        const wob = inner ? drift / s : 0;
        return key(
          len * f,
          [
            s,
            a[1] + (b[1] - a[1]) * f + rnd() * wob,
            a[2] + (b[2] - a[2]) * f + rnd() * wob,
          ],
          "linear",
          (inner ? roll() * wobble : 0) + r0 * (1 - f),
        );
      });
    }
    const scene: ProductScene = {
      start: shot.start,
      image,
      mode,
      // Wider frames: same photo point, a little more zoom (9:16 unchanged),
      // never past AI_ZOOM on our AI shots.
      keys: keysForRatio(keys, mode, layout).map((k) =>
        own && k.scale > AI_ZOOM ? { ...k, scale: AI_ZOOM } : k,
      ),
      transition: { ...(shot.transition ?? CUT) },
    };
    if (shot.shade !== undefined) scene.shade = shot.shade;
    const cards = collage.get(i);
    if (cards) {
      scene.mode = "cards";
      scene.images = cards;
    }
    return scene;
  });

  const name = input.name.trim().slice(0, LIMITS.maxTextLength);
  const price = input.price.trim().slice(0, 20);
  // The price always survives the length limit; the name gives way.
  const room = LIMITS.maxTextLength - (price ? price.length + 3 : 0);
  const endLine = [name.slice(0, room).trim(), price]
    .filter(Boolean)
    .join(" · ");
  const text = (
    t: string,
    start: number,
    end: number,
    size916: number,
    style: CutText,
  ): ProductText => {
    // Feed shapes: the shape's text factor (two lines at most still holds,
    // smaller type never wraps more) and the whole box inside FEED_BAND.
    let y = style.y,
      size = size916;
    if (layout.box) {
      size = r4(size916 * layout.text);
      const lines = estimateLines(t, size, style.font, style.tracking);
      const half = textHalfHeight(lines, size, false, layout.tall);
      const lo = Math.ceil((layout.top + half) * 10000) / 10000,
        hi = Math.floor((layout.bottom - half) * 10000) / 10000;
      y = Math.max(lo, Math.min(hi, layout.y(style.y)));
    }
    return {
      text: t,
      start,
      end,
      y,
      size,
      weight: style.weight,
      color: TEXT_COLOR,
      fill: "",
      animation: style.animation,
      exit: style.exit,
      font: style.font,
      tracking: trackingFor(style.font, style.tracking),
    };
  };
  const texts: ProductText[] = [];
  const { title, end } = cut;
  if (name) {
    const one = title.width / textWidth(name, 1, title.font, title.tracking);
    const size = Math.min(title.max, Math.max(title.min, one));
    texts.push(
      text(
        name,
        title.start,
        title.end,
        fit(name, r4(size), title.font, title.tracking),
        title,
      ),
    );
  }
  if (endLine)
    texts.push(
      text(
        endLine,
        end.start,
        duration,
        fit(endLine, end.size, end.font, end.tracking),
        end,
      ),
    );

  const base = buildSpec({
    template: "campaign",
    palette: input.palette,
    product: scenes[0].image,
    headline: name || " ",
    price: "",
    badge: "",
    cta: "",
    quality: input.quality,
    watermark: false,
    music: null,
    ratio: layout.ratio,
  });
  const rest = base.keys[base.keys.length - 1];
  const hold = (t: number): ProductKey => ({ ...rest, t, ease: "linear" });

  return {
    product: scenes[0].image,
    quality: base.quality,
    duration,
    fps: 30,
    bitrate: base.bitrate,
    background: base.background,
    camera: { zoomFrom: 1, zoomTo: 1 },
    keys: [hold(0), hold(duration)],
    shadow: base.shadow,
    reflection: false,
    sweeps: [],
    sparkles: null,
    texts,
    watermark: input.watermark === true,
    music: input.music ?? null,
    relief: 0,
    ratio: layout.ratio,
    shots: [],
    scenes,
    look: {
      ...(base.look ?? { sceneBlur: 0, parallax: 0, harmonize: 0 }),
      grain: cut.look.grain,
      vignette: cut.look.vignette,
    },
    grade: { ...cut.grade },
    ...(cut.leaks ? { leaks: cut.leaks.map((l) => ({ ...l })) } : {}),
  };
}
