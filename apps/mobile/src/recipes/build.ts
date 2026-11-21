import {
  LIMITS,
  MAX_SCENES,
  buildSpec,
  layoutForRatio,
  paletteById,
  ratioHeight,
  type AspectRatio,
  type FontStyle,
  type Palette,
  type ProductBackground,
  type ProductKey,
  type ProductScene,
  type ProductText,
  type ProductVideoSpec,
} from "../product-templates.ts";
import type {
  RecipeInput,
  RecipeText,
  SceneTone,
  TemplateRecipe,
} from "./types.ts";

export type {
  RecipeInput,
  RecipeScene,
  RecipeText,
  SceneTone,
  TemplateRecipe,
} from "./types.ts";

const HEX6 = /^#[0-9a-f]{6}$/i;

/** `a` moved towards `b` by `t` (0...1); #RRGGBB only, otherwise `a`. */
export function mixHex(a: string, b: string, t: number): string {
  if (!HEX6.test(a) || !HEX6.test(b)) return a;
  const ch = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  let out = "#";
  for (let i = 0; i < 3; i++) {
    const v = Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t);
    out += Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0");
  }
  return out.toUpperCase();
}

/** Relative luminance (WCAG) of #RRGGBB; 0 for anything else. */
export function luminance(hex: string): number {
  if (!HEX6.test(hex)) return 0;
  const lin = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(0) + 0.7152 * lin(1) + 0.0722 * lin(2);
}

/**
 * A palette's pale and deep tones with the type colour for each: dark
 * palettes (light ink) use their ink as paper, light palettes their
 * background top.
 */
function tones(p: Palette) {
  const inkIsLight = luminance(p.ink) > 0.4;
  return inkIsLight
    ? { paper: p.ink, paperInk: p.background.top, night: p.background.bottom, nightInk: p.ink }
    : {
        paper: p.background.top,
        paperInk: p.ink,
        night: mixHex(p.ink, "#000000", 0.35),
        nightInk: p.background.top,
      };
}

/** Edge of the "split" tone: paper left of 22 % of the width, accent right of it; left of a centred price ("349 TL" at 0.18 spans ~0.26-0.74). */
export const SPLIT_EDGE = 0.22;

// MARK: Frame shapes

/**
 * Safe area of the 4:5 and 1:1 feed posts (frame fractions): no Reels
 * buttons or caption, so texts may use y 0.08-0.92 (whole box) and keep
 * 0.06 from the sides (plain lines are at most 86 % of the width, pills
 * stay inside that band too, see textMaxWidth).
 */
export const FEED_BAND = { top: 0.08, bottom: 0.92, side: 0.06 } as const;
/**
 * Box extent of the 9:16 recipe texts (end-card name top ~0.11, action
 * bottom ~0.82); the top is taken a little higher so the 1:1 end-card name
 * keeps its size above the price pill.
 */
const DESIGN_TOP = 0.105,
  DESIGN_BOTTOM = 0.82;
/** Photo zoom per shape: wider frames show more of a photo, so detail shots push in. */
const PHOTO_ZOOM: Record<AspectRatio, number> = { "9:16": 1, "4:5": 1.1, "1:1": 1.2 };
/** Depth dolly per shape: part of the way left to the 1.4 limit. */
const DEPTH_PUSH: Record<AspectRatio, number> = { "9:16": 0, "4:5": 0.15, "1:1": 0.25 };
const MAX_ZOOM = 3,
  MAX_DOLLY = 1.4;
/**
 * Cut-out product growth per shape: square frames show the product about
 * 15 % larger where it still keeps PRODUCT_CLEARANCE from the texts and
 * stays in frame (growProducts).
 */
const PRODUCT_GROW: Record<AspectRatio, number> = { "9:16": 1, "4:5": 1, "1:1": 1.15 };

/**
 * How the 9:16 recipe layouts map onto a frame shape:
 * - `top`/`bottom`: text band; 9:16 bounds the centre (y 0.14-0.80, clear
 *   of the Reels caption and buttons), the feed shapes the whole box
 *   (FEED_BAND) when `box` is true;
 * - `tall`: a width-based length (text size) in frame heights, relative to
 *   9:16 (16/9 divided by the shape's height/width);
 * - `text`: text size factor (the classic templates' factor: 0.82 for 4:5,
 *   0.68 for 1:1), so type reads like the other videos of that shape;
 * - `y`: a 9:16 centre (text or product) in the new frame: the 9:16 design
 *   extent 0.105-0.82 stretched over 0.08-0.92;
 * - `zoom` / `push`: photo zoom factor and depth dolly push (see PHOTO_ZOOM,
 *   DEPTH_PUSH);
 * - `grow`: cut-out product growth where there is room (PRODUCT_GROW).
 * Cut-out products keep their scale (height as a fraction of the frame
 * height) and are kept fully inside the frame.
 */
export function ratioLayout(ratio: AspectRatio = "9:16") {
  if (ratio === "9:16")
    return {
      ratio,
      top: TEXT_TOP,
      bottom: TEXT_BOTTOM,
      box: false,
      tall: 1,
      text: 1,
      zoom: 1,
      push: 0,
      grow: 1,
      y: (y: number) => y,
    };
  const stretch = (FEED_BAND.bottom - FEED_BAND.top) / (DESIGN_BOTTOM - DESIGN_TOP);
  return {
    ratio,
    top: FEED_BAND.top,
    bottom: FEED_BAND.bottom,
    box: true,
    tall: 16 / 9 / ratioHeight(ratio),
    text: layoutForRatio(ratio).text,
    zoom: PHOTO_ZOOM[ratio],
    push: DEPTH_PUSH[ratio],
    grow: PRODUCT_GROW[ratio],
    y: (y: number) => r4(FEED_BAND.top + (y - DESIGN_TOP) * stretch),
  };
}

export type RatioLayout = ReturnType<typeof ratioLayout>;

const r4 = (n: number) => Math.round(n * 10000) / 10000;

/**
 * Scene keys of a 9:16 recipe in another frame shape (9:16: unchanged).
 * Cut-out: the product keeps its scale and its centre moves with `y`, kept
 * fully inside the frame; photo: same photo point, zoom times `zoom` (the
 * renderer's zoom is 1...3); depth: same camera offset, dolly pushed toward
 * 1.4 by `push` (order and motion kept).
 */
export function keysForRatio(
  keys: ProductKey[],
  mode: ProductScene["mode"],
  layout: RatioLayout,
): ProductKey[] {
  if (layout.ratio === "9:16") return keys;
  return keys.map((k) => {
    if (mode === "cutout") {
      const half = Math.min(0.5, k.scale / 2);
      return { ...k, y: r4(Math.max(half, Math.min(1 - half, layout.y(k.y)))) };
    }
    if (mode === "photo")
      return { ...k, scale: r4(Math.min(MAX_ZOOM, Math.max(1, k.scale) * layout.zoom)) };
    return k.scale <= MAX_DOLLY
      ? { ...k, scale: r4(k.scale + (MAX_DOLLY - k.scale) * layout.push) }
      : k;
  });
}

/** The cut-out background for a scene tone in a palette. */
export function toneBackground(p: Palette, tone: SceneTone): ProductBackground {
  const { paper, paperInk, night } = tones(p);
  const flat = { floor: false, image: "", imageX: 0, imageWidth: 1 };
  switch (tone) {
    case "accent":
      return {
        ...flat,
        top: p.accent,
        bottom: mixHex(p.accent, "#000000", 0.22),
        glow: mixHex(p.accent, "#FFFFFF", 0.2),
      };
    case "dark":
      return {
        ...flat,
        top: mixHex(night, p.accent, 0.12),
        bottom: mixHex(night, "#000000", 0.4),
        glow: mixHex(night, p.accent, 0.3),
      };
    case "split":
      return {
        ...flat,
        top: paper,
        bottom: p.accent,
        glow: mixHex(paper, p.accent, 0.5),
        split: SPLIT_EDGE,
      };
    default:
      return {
        ...flat,
        top: paper,
        bottom: mixHex(paper, paperInk, 0.1),
        glow: mixHex(paper, "#FFFFFF", 0.5),
      };
  }
}

/** Type and pill colours that read on a scene tone. */
export function toneText(
  p: Palette,
  tone: SceneTone,
  pill: boolean,
): { color: string; fill: string } {
  const { paperInk, nightInk } = tones(p);
  if (tone === "accent")
    return pill ? { color: p.accent, fill: p.onAccent } : { color: p.onAccent, fill: "" };
  if (pill) return { color: p.onAccent, fill: p.accent };
  // Texts are centred (x 0.5) and the edge sits left of their widest line: accent side.
  if (tone === "split") return { color: SPLIT_EDGE <= 0.5 ? p.onAccent : paperInk, fill: "" };
  return { color: tone === "dark" ? nightInk : paperInk, fill: "" };
}

// MARK: Text fitting

/**
 * Average advance per character in ems, relative to Anton (impact), which is
 * narrow. Rough but on the wide side, so estimates wrap a little early.
 */
const FONT_WIDTH: Record<FontStyle, number> = {
  impact: 1,
  editorial: 1.05,
  elegant: 1.2,
  modern: 1.25,
  system: 1.25,
  poster: 1.45,
};

function charEm(c: string): number {
  if (c === " ") return 0.22;
  if (/\d/.test(c)) return 0.5;
  const up = c.toLocaleUpperCase("tr"),
    low = c.toLocaleLowerCase("tr");
  if (up === low) return 0.4;
  return c === up ? 0.52 : 0.44;
}

/** Estimated width of `text` as a fraction of the frame width. */
export function textWidth(text: string, size: number, font: FontStyle = "system", tracking = 0): number {
  let em = 0;
  for (const c of text) em += charEm(c) * FONT_WIDTH[font] + tracking;
  return em * size;
}

/**
 * Widest line the renderer allows (frame-width fractions): plain texts 86 %;
 * pills 78 %, less when the pill's side padding (0.7 em each) would leave
 * the frame's 86 % band.
 */
export function textMaxWidth(size: number, pill: boolean): number {
  return pill ? Math.min(0.78, 0.86 - 1.4 * size) : 0.86;
}

/** Lines after word wrapping (a word wider than a line breaks inside). */
export function estimateLines(
  text: string,
  size: number,
  font: FontStyle = "system",
  tracking = 0,
  pill = false,
): number {
  const max = textMaxWidth(size, pill);
  const space = textWidth(" ", size, font, tracking);
  let lines = 1;
  let line = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const w = textWidth(word, size, font, tracking);
    if (w > max) {
      // Long word: starts a fresh line and fills as many as it needs.
      if (line > 0) lines++;
      lines += Math.ceil(w / max) - 1;
      line = w - (Math.ceil(w / max) - 1) * max;
    } else if (line === 0) line = w;
    else if (line + space + w <= max) line += space + w;
    else {
      lines++;
      line = w;
    }
  }
  return lines;
}

/**
 * Half the text block's height as a fraction of a 9:16 frame's height: a
 * line is about size * 0.6 (size is a fraction of the width); pills add
 * 0.35 em above and below, plain texts a little room for accents. `tall`
 * (RatioLayout.tall) converts to another frame shape's height.
 */
export function textHalfHeight(lines: number, size: number, pill: boolean, tall = 1): number {
  const half = (size * 0.6 * (lines + (pill ? 0.7 : 0.3))) / 2;
  return tall === 1 ? half : half * tall;
}

/** Shrinks a text to at most two lines down to this size (or its own, if smaller). */
export const FIT_FLOOR = 0.075;
/** Below this a text is not shrunk further to make room. */
const HARD_FLOOR = 0.04;
/** Gap kept to the product in cut-out scenes, and between texts. */
export const PRODUCT_CLEARANCE = 0.025;
const TEXT_GAP = 0.01;
const TEXT_TOP = 0.14,
  TEXT_BOTTOM = 0.8;

type Band = { top: number; bottom: number; gap: number };

const linesOf = (t: ProductText, size: number) =>
  estimateLines(t.text, size, t.font ?? "system", t.tracking ?? 0, t.fill !== "");

function textBand(t: ProductText, gap: number, tall: number): Band {
  const half = textHalfHeight(linesOf(t, t.size), t.size, t.fill !== "", tall);
  return { top: t.y - half, bottom: t.y + half, gap };
}

/** Product boxes (y +- scale / 2 at every key) of cut-out scenes shown while `t` is. */
function productBands(t: ProductText, scenes: ProductScene[], duration: number): Band[] {
  const out: Band[] = [];
  scenes.forEach((s, i) => {
    const end = i + 1 < scenes.length ? scenes[i + 1].start : duration;
    if (s.mode !== "cutout" || t.end <= s.start || t.start >= end) return;
    for (const k of s.keys)
      out.push({ top: k.y - k.scale / 2, bottom: k.y + k.scale / 2, gap: PRODUCT_CLEARANCE });
  });
  return out;
}

/**
 * The y nearest to `y0` (within the text band) where a block of `half`
 * clears every band, or null. 9:16 bounds the centre; feed shapes
 * (`layout.box`) keep the whole block inside the band.
 */
function placeY(y0: number, half: number, bands: Band[], layout: RatioLayout): number | null {
  const clear = (y: number) =>
    bands.every((b) => y + half <= b.top - b.gap + 1e-9 || y - half >= b.bottom + b.gap - 1e-9);
  const lo = layout.box ? layout.top + half : layout.top,
    hi = layout.box ? layout.bottom - half : layout.bottom;
  if (lo > hi) return null;
  const clamp = (y: number) => Math.max(lo, Math.min(hi, y));
  // Feed shapes try both 4-decimal neighbours (rounding must not cost a
  // clear spot) and keep the box inside the band.
  const round = (y: number) =>
    layout.box
      ? [Math.floor(y * 10000) / 10000, Math.ceil(y * 10000) / 10000]
      : [Math.round(y * 10000) / 10000];
  const tries = [y0, ...bands.flatMap((b) => [b.top - b.gap - half, b.bottom + b.gap + half])]
    .flatMap((y) => round(clamp(y)))
    .filter((y) => y >= lo - 1e-9 && y <= hi + 1e-9)
    .filter(clear)
    .sort((a, b) => Math.abs(a - y0) - Math.abs(b - y0));
  return tries.length ? tries[0] : null;
}

/**
 * Fits seller texts of any length: each text shrinks until it takes at most
 * two lines (FIT_FLOOR first, then down to the hard floor if a wide font
 * still needs it); a text on a split scene shrinks to stay right of the
 * edge; then, if it would come closer than PRODUCT_CLEARANCE to the product
 * in a cut-out scene, or overlap another text, it moves (within the text
 * band) or shrinks further. Names go last so they make room around the fixed
 * price and action texts. Changes `texts`; returns the texts that found no
 * clear spot even at the hard floor (left out of the video).
 */
function fitTexts(
  texts: ProductText[],
  fields: RecipeText["field"][],
  scenes: ProductScene[],
  duration: number,
  layout: RatioLayout,
  splitTexts: Set<ProductText>,
): Set<ProductText> {
  const unplaced = new Set<ProductText>();
  const overlaps = (a: ProductText, b: ProductText) => a.start < b.end && b.start < a.end;
  // Floors scale with the shape's text factor (9:16: x 1, unchanged).
  const fitFloor = FIT_FLOOR * layout.text,
    hardFloor = HARD_FLOOR * layout.text;
  const step = (size: number, floor: number) => Math.max(floor, Math.round((size - 0.0025) * 10000) / 10000);
  const fit = (t: ProductText, others: ProductText[]) => {
    const pill = t.fill !== "";
    const floor = Math.min(t.size, fitFloor);
    let size = t.size;
    while (size > floor && linesOf(t, size) > 2) size = step(size, floor);
    // Every text stays within two lines (wide fonts may need to go below
    // the fit floor).
    while (size > hardFloor && linesOf(t, size) > 2) size = step(size, hardFloor);
    // A text on a split scene stays on the accent side, right of the edge
    // (centred, so at most 2 * (0.5 - edge) wide on one line).
    if (splitTexts.has(t))
      while (size > hardFloor && textWidth(t.text, size, t.font ?? "system", t.tracking ?? 0) > 2 * (0.5 - SPLIT_EDGE))
        size = step(size, hardFloor);
    const bands = [
      ...productBands(t, scenes, duration),
      ...others.filter((o) => o !== t && overlaps(o, t)).map((o) => textBand(o, TEXT_GAP, layout.tall)),
    ];
    for (;;) {
      const y = placeY(t.y, textHalfHeight(linesOf(t, size), size, pill, layout.tall), bands, layout);
      if (y !== null) {
        t.y = y;
        t.size = size;
        return;
      }
      if (size <= hardFloor) {
        t.size = size;
        unplaced.add(t);
        return;
      }
      size = step(size, hardFloor);
    }
  };
  // Fixed texts first (only the product counts; feed shapes, whose taller
  // type is rescaled, also keep clear of the fixed texts placed before),
  // then names around them.
  const placed: ProductText[] = [];
  for (const t of texts.filter((_, i) => fields[i] !== "name")) {
    fit(t, layout.box ? placed : []);
    placed.push(t);
  }
  for (const t of texts.filter((_, i) => fields[i] === "name")) fit(t, texts);
  return unplaced;
}

/**
 * Square frames: each cut-out scene's product grows by up to `layout.grow`
 * (largest factor in 0.01 steps) while every key stays in frame and keeps
 * PRODUCT_CLEARANCE from the texts on screen with it. Texts do not move.
 */
function growProducts(
  scenes: ProductScene[],
  texts: ProductText[],
  duration: number,
  layout: RatioLayout,
): void {
  if (layout.grow <= 1) return;
  scenes.forEach((s, i) => {
    if (s.mode !== "cutout") return;
    const end = i + 1 < scenes.length ? scenes[i + 1].start : duration;
    const bands = texts
      .filter((t) => t.start < end && t.end > s.start)
      .map((t) => textBand(t, PRODUCT_CLEARANCE, layout.tall));
    const grown = (f: number) =>
      s.keys.map((k) => {
        const scale = r4(k.scale * f),
          half = Math.min(0.5, scale / 2);
        // Rounded inward so the box stays in frame.
        const lo = Math.ceil(half * 10000) / 10000,
          hi = Math.floor((1 - half) * 10000) / 10000;
        return { ...k, scale, y: Math.max(lo, Math.min(hi, r4(k.y))) };
      });
    const fits = (keys: ProductKey[]) =>
      keys.every(
        (k) =>
          k.scale <= 1 &&
          bands.every(
            (b) => b.bottom + b.gap <= k.y - k.scale / 2 + 1e-9 || b.top - b.gap >= k.y + k.scale / 2 - 1e-9,
          ),
      );
    for (let f = layout.grow; f > 1.0001; f = r4(f - 0.01)) {
      const keys = grown(f);
      if (fits(keys)) {
        s.keys = keys;
        return;
      }
    }
  });
}

/** The native side allows 30 s; recipes stay short. */
export const RECIPE_MAX_DURATION = 15;

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Scene start times in seconds for scene lengths given in beats. */
export function beatTimes(bpm: number, lengths: number[]): number[] {
  const beat = 60 / bpm;
  const out: number[] = [];
  let beats = 0;
  for (const len of lengths) {
    out.push(round3(beats * beat));
    beats += len;
  }
  return out;
}

export function buildRecipeSpec(
  recipe: TemplateRecipe,
  input: RecipeInput,
): ProductVideoSpec {
  const opening = input.opening?.uri || null;
  // Only an AI picture and no photo: it is all there is to show.
  const photos =
    input.photos.length > 0 ? input.photos : opening ? [opening] : [];
  if (photos.length < 1) throw new Error("recipe needs a photo");
  const recipeScenes = recipe.scenes.slice(0, MAX_SCENES);
  const beat = 60 / recipe.bpm;
  const starts = beatTimes(
    recipe.bpm,
    recipeScenes.map((s) => s.length),
  );
  const last = recipeScenes.length - 1;
  const natural = round3(starts[last] + recipeScenes[last].length * beat + recipe.endHold);
  const duration = Math.min(
    RECIPE_MAX_DURATION,
    Math.max(LIMITS.minDuration, natural),
  );

  // A scene needs room to be seen; ones starting too late are dropped.
  const kept = recipeScenes
    .map((rs, i) => ({ rs, start: starts[i] }))
    .filter(({ start }) => start < duration - 0.2);
  const palette = paletteById(input.palette);
  const layout = ratioLayout(input.ratio);
  /** Tone per built scene; only cut-out scenes keep one. */
  const sceneTones: (SceneTone | undefined)[] = [];
  const scenes: ProductScene[] = kept.map(({ rs, start }, i) => {
    const n = photos.length;
    // The AI opening is scene 0 only, full frame, never cut out.
    const ai = i === 0 && !!opening;
    const photo = ai ? (opening as string) : photos[rs.slot % n];
    const cutout = ai ? null : (input.cutouts[rs.slot % n] ?? null);
    const mode = ai
      ? "photo"
      : rs.mode === "cutout" && cutout
        ? "cutout"
        : rs.mode === "depth" && photo
          ? "depth"
          : "photo";
    const end = i + 1 < kept.length ? kept[i + 1].start : duration;
    const length = round3(end - start);
    const scene: ProductScene = {
      start,
      image: mode === "cutout" ? (cutout as string) : photo,
      mode,
      keys: keysForRatio(
        rs.keys.map((k) => ({ ...k, t: Math.min(k.t, length) })),
        mode,
        layout,
      ),
      transition:
        i === 0
          ? { kind: "cut", duration: 0 }
          : {
              kind: rs.transition.kind,
              duration: Math.max(0, Math.min(rs.transition.duration, length, 1.5)),
            },
    };
    if (rs.shots) scene.shots = rs.shots.filter((s) => s.t < length);
    if (rs.shade !== undefined) scene.shade = rs.shade;
    const tone = mode === "cutout" ? rs.tone : undefined;
    if (tone) scene.background = toneBackground(palette, tone);
    sceneTones.push(tone);
    return scene;
  });
  const toneAt = (t: number) => {
    let k = 0;
    scenes.forEach((s, i) => {
      if (s.start <= t + 1e-9) k = i;
    });
    return sceneTones[k];
  };

  const base = buildSpec({
    template: "campaign",
    palette: input.palette,
    product: scenes[0].image,
    headline: input.name || " ",
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

  const value: Record<RecipeText["field"], string> = {
    name: input.name,
    price: input.price,
    oldPrice: input.oldPrice,
    badge: input.badge,
    cta: input.cta,
  };
  const texts: ProductText[] = [];
  const fields: RecipeText["field"][] = [];
  /** Texts that start on a split scene (kept right of its edge). */
  const splitTexts = new Set<ProductText>();
  for (const rt of recipe.texts) {
    const text = value[rt.field].trim().slice(0, LIMITS.maxTextLength);
    const start = Math.max(0, rt.start);
    const end = Math.min(duration, rt.end);
    if (!text || start >= end) continue;
    const tone = toneAt(start);
    const colours = tone
      ? toneText(palette, tone, !!rt.onAccent)
      : {
          color: rt.onAccent ? palette.onAccent : palette.ink,
          fill: rt.onAccent ? palette.accent : "",
        };
    // The action reads as an action: accent colour where it keeps contrast 3+.
    if (rt.field === "cta" && !colours.fill && (tone === "light" || tone === "dark")) {
      const bg = tone === "light" ? tones(palette).paper : tones(palette).night;
      const [a, b] = [luminance(palette.accent), luminance(bg)];
      if ((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 3) colours.color = palette.accent;
    }
    const built: ProductText = {
      text,
      start,
      end,
      // 9:16 keeps the designed numbers; other shapes re-band and rescale.
      y: layout.box ? layout.y(rt.y) : rt.y,
      size: layout.box ? r4(rt.size * layout.text) : rt.size,
      ...rt.style,
      ...colours,
    };
    texts.push(built);
    fields.push(rt.field);
    if (tone === "split") splitTexts.add(built);
  }

  const unplaced = fitTexts(texts, fields, scenes, duration, layout, splitTexts);
  // Texts with no clear spot, then any over the limit, are left out; the
  // editor says so (spec.dropped).
  const shown = texts.filter((t) => !unplaced.has(t)).slice(0, LIMITS.maxTexts);
  const dropped = [
    ...new Set(fields.filter((_, i) => !shown.includes(texts[i]))),
  ];
  growProducts(scenes, shown, duration, layout);

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
    texts: shown,
    watermark: input.watermark === true,
    music: input.music ?? null,
    relief: 0,
    ratio: layout.ratio,
    shots: [],
    scenes,
    look: base.look,
    ...(dropped.length > 0 ? { dropped } : {}),
  };
}
