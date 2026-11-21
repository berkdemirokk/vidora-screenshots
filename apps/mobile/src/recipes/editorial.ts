import {
  LIMITS,
  buildSpec,
  type AspectRatio,
  type PaletteId,
  type ProductGrade,
  type ProductKey,
  type ProductQuality,
  type ProductScene,
  type ProductText,
  type ProductVideoSpec,
} from "../product-templates.ts";
import {
  estimateLines,
  keysForRatio,
  ratioLayout,
  textHalfHeight,
  textWidth,
} from "./build.ts";

/**
 * "Editoryal": 13 shots at 120 bpm (13.0 s) after the target video in
 * docs/hedef/yeni-video-v2/shotlist.md. Three AI shots (context, hand, macro)
 * play the target's lavender field / vanity, hand and macro images; the
 * seller's photos play the flat lay and spa shots.
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

export const EDITORIAL_DURATION = 13;
/** Warm, a little faded and less saturated (the target's pre-graded photos). */
export const EDITORIAL_GRADE: ProductGrade = {
  warmth: 0.35,
  saturation: -0.2,
  contrast: 0.1,
  fade: 0.15,
};
/** Handheld drift: up to 0.6 % of the frame in x and y at the inner keys. */
const DRIFT = 0.006;
/** Seller photos are framed around the product: target crops pulled halfway to the centre. */
const PULL = 0.5;
/**
 * Our AI shots are only 768x1344: their zoom stops here in every shape
 * (beyond it they go soft); the photo point is kept. Seller photos keep the
 * shot list's zoom.
 */
const AI_ZOOM = 1.7;
/** Handheld roll: up to this many degrees at the inner keys (shot list). */
const ROLL = 0.18;
/** Shot 11 (depth) rolls from this to level (shot list). */
const DEPTH_ROLL = -1.6;
const TEXT_COLOR = "#F6F0E6";
const TITLE_WIDTH = 0.55,
  TITLE_MAX = 0.11,
  /** Long names wrap (two lines at most) rather than shrink below this. */
  TITLE_MIN = 0.075,
  TITLE_TRACK = 0.01;
const END_SIZE = 0.045,
  END_TRACK = 0.04;
const TEXT_FLOOR = 0.035;

type Crop = [scale: number, x: number, y: number];
type Source = 0 | 1 | 2 | "seller";
/** [start s, source (AI index or seller), crop at the start, crop at the end]. */
const SHOTS: [number, Source, Crop, Crop][] = [
  [0, 0, [1.0, 0.5, 0.5], [1.07, 0.51, 0.52]], // 1 lavender field, wide, title
  [2, 1, [1.35, 0.58, 0.58], [1.43, 0.57, 0.55]], // 2 hand, medium
  [3, 2, [1.6, 0.63, 0.24], [1.7, 0.6, 0.26]], // 3 macro, cap
  [3.75, 0, [1.8, 0.42, 0.3], [1.74, 0.48, 0.31]], // 4 vanity wall, pull back
  [4.75, "seller", [2.0, 0.62, 0.36], [2.1, 0.64, 0.33]], // 5 flat lay detail
  [5.5, "seller", [1.3, 0.46, 0.55], [1.38, 0.47, 0.57]], // 6 spa, medium
  [6.5, 1, [2.4, 0.62, 0.7], [2.5, 0.6, 0.68]], // 7 hand detail
  [7.25, 0, [2.4, 0.8, 0.62], [2.55, 0.76, 0.6]], // 8 flowers detail, blurs out
  [8, 2, [2.4, 0.3, 0.64], [2.3, 0.32, 0.62]], // 9 macro droplets, blur in
  [8.5, "seller", [2.3, 0.8, 0.78], [2.4, 0.78, 0.76]], // 10 spa detail
  [9, "seller", [1.1, 0.5, 0.5], [1.16, 0.5, 0.49]], // 11 flat lay wide, flash (depth here)
  [10, 0, [2.0, 0.4, 0.68], [2.08, 0.43, 0.67]], // 12 vanity detail
  [11, 0, [1.13, 0.56, 0.52], [1.06, 0.55, 0.52]], // 13 hero, settles by 0.55 s
];
const DEPTH_SHOT = 10;
/** Target pairing of the 4 seller shots (flat lay, spa, spa, flat lay) when photos run out. */
const SELLER_PAIRS = [0, 1, 1, 0];

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
function fit(text: string, start: number, track: number): number {
  let size = start;
  while (size > TEXT_FLOOR && estimateLines(text, size, "editorial", track) > 2)
    size = Math.max(TEXT_FLOOR, r4(size - 0.0025));
  return size;
}

export function buildEditorialSpec(input: EditorialInput): ProductVideoSpec {
  const ai = [0, 1, 2].map((i) => input.ai[i] || null);
  // Only AI shots and no photo: they stand in for the photos.
  const photos =
    input.photos.length > 0 ? input.photos : ai.filter((a): a is string => !!a);
  if (photos.length < 1) throw new Error("editorial needs a photo");
  const n = photos.length;
  const duration = EDITORIAL_DURATION;
  const layout = ratioLayout(input.ratio);

  // Images: AI shots and seller shots first, then missing AI shots from the
  // photos in turn (from the first one the seller shots left unused), avoiding
  // the neighbours' photo where possible.
  let seller = 0;
  const images: (string | null)[] = SHOTS.map(([, src]) => {
    if (src !== "seller") return ai[src];
    const k = seller++;
    return photos[k < n ? k : SELLER_PAIRS[k] % n];
  });
  let next = 4 % n;
  images.forEach((img, i) => {
    if (img) return;
    const penalty = (p: string) =>
      (p === images[i - 1] ? 2 : 0) + (p === images[i + 1] ? 1 : 0);
    let best = next;
    for (let j = 1; j < n; j++) {
      const c = (next + j) % n;
      if (penalty(photos[c]) < penalty(photos[best])) best = c;
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

  const scenes: ProductScene[] = SHOTS.map(([start, src, from, to], i) => {
    const image = images[i] as string;
    const end = i + 1 < SHOTS.length ? SHOTS[i + 1][0] : duration;
    const len = end - start;
    const own = src !== "seller" && image === ai[src];
    const pull = ([s, x, y]: Crop): Crop =>
      own
        ? [Math.min(s, AI_ZOOM), x, y]
        : [s, 0.5 + (x - 0.5) * PULL, 0.5 + (y - 0.5) * PULL];
    const a = pull(from),
      b = pull(to);
    let keys: ProductKey[];
    if (i === DEPTH_SHOT) {
      // Depth: a slow dolly with a small orbit (scale = dolly, x/y = camera offset).
      // The roll levels out over the shot.
      keys = [
        key(0, [1, 0, 0], "linear", DEPTH_ROLL),
        key(len, [1.08, 0.25, -0.1]),
      ];
    } else if (i === SHOTS.length - 1) {
      // Hero: settles (ease out) by 0.55 s, then holds still for the end line.
      keys = [key(0, a), key(0.55, b, "out"), key(len, b)];
    } else {
      // Linear push/pan from the shot list plus handheld drift and roll at
      // the inner keys (level on the cuts).
      const segs = Math.max(2, Math.round(len / 0.5));
      keys = Array.from({ length: segs + 1 }, (_, j) => {
        const f = j / segs;
        const s = a[0] + (b[0] - a[0]) * f;
        const inner = j > 0 && j < segs;
        const wob = inner ? DRIFT / s : 0;
        return key(
          len * f,
          [
            s,
            a[1] + (b[1] - a[1]) * f + rnd() * wob,
            a[2] + (b[2] - a[2]) * f + rnd() * wob,
          ],
          "linear",
          inner ? roll() * ROLL : 0,
        );
      });
    }
    const mode = i === DEPTH_SHOT ? "depth" : "photo";
    const scene: ProductScene = {
      start,
      image,
      mode,
      // Wider frames: same photo point, a little more zoom (9:16 unchanged),
      // never past AI_ZOOM on our AI shots.
      keys: keysForRatio(keys, mode, layout).map((k) =>
        own && k.scale > AI_ZOOM ? { ...k, scale: AI_ZOOM } : k,
      ),
      transition:
        i === 8
          ? { kind: "blur", duration: 0.25 }
          : i === 10
            ? { kind: "flash", duration: 0 }
            : { kind: "cut", duration: 0 },
    };
    // A touch of shade under the two texts. Shot 1 is a little darker: the
    // engine has no top gradient for photo scenes, so this stands in for the
    // target's warm gradient behind the title.
    if (i === 0) scene.shade = 0.16;
    else if (i === SHOTS.length - 1) scene.shade = 0.1;
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
    y916: number,
    size916: number,
    tracking: number,
  ): ProductText => {
    // Feed shapes: the shape's text factor (two lines at most still holds,
    // smaller type never wraps more) and the whole box inside FEED_BAND.
    let y = y916,
      size = size916;
    if (layout.box) {
      size = r4(size916 * layout.text);
      const lines = estimateLines(t, size, "editorial", tracking);
      const half = textHalfHeight(lines, size, false, layout.tall);
      const lo = Math.ceil((layout.top + half) * 10000) / 10000,
        hi = Math.floor((layout.bottom - half) * 10000) / 10000;
      y = Math.max(lo, Math.min(hi, layout.y(y916)));
    }
    return textAt(t, start, end, y, size, tracking);
  };
  const textAt = (
    t: string,
    start: number,
    end: number,
    y: number,
    size: number,
    tracking: number,
  ): ProductText => ({
    text: t,
    start,
    end,
    y,
    size,
    weight: "regular",
    color: TEXT_COLOR,
    fill: "",
    animation: "fade",
    exit: "fade",
    font: "editorial",
    tracking,
  });
  const texts: ProductText[] = [];
  if (name) {
    const one = TITLE_WIDTH / textWidth(name, 1, "editorial", TITLE_TRACK);
    const size = Math.min(TITLE_MAX, Math.max(TITLE_MIN, one));
    texts.push(
      text(name, 0.2, 2, 0.3, fit(name, r4(size), TITLE_TRACK), TITLE_TRACK),
    );
  }
  if (endLine)
    texts.push(
      text(
        endLine,
        11.5,
        duration,
        0.22,
        fit(endLine, END_SIZE, END_TRACK),
        END_TRACK,
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
      grain: 0.35,
      vignette: 0.3,
    },
    grade: { ...EDITORIAL_GRADE },
  };
}
