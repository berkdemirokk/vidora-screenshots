import type { ProductKey } from "../product-templates.ts";
import type { TemplateRecipe } from "./types.ts";

/**
 * "İndirim": badge-led sale ad at 120 bpm, 10 s = 20 beats. Scene starts
 * 0 / 1.5 / 3.5 / 6 / 7 s, hard cuts, one 0.25 s wipe into the end card, the
 * end card still from 7.6 s (last 2.4 s).
 * Look: accent hook with "%30 İNDİRİM" huge, a depth sweep, a two-tone price
 * scene (old price struck, the new price huge in ink), a shaded close-up, a
 * pale urgency card with a big price pill and the action.
 * Scene keys are relative to the scene start; texts are on the video clock.
 * Cut-out keys: `scale` is the product height as a fraction of the frame.
 * Photo keys: `scale` is zoom, x/y the photo point at the frame centre.
 * Depth keys: `scale` is the dolly (1...1.4), x/y the camera orbit (-1...1).
 */
const key = (
  t: number,
  x: number,
  y: number,
  scale: number,
  ease: ProductKey["ease"] = "out",
): ProductKey => ({ t, x, y, scale, rotation: 0, opacity: 1, yaw: 0, ease });

const CUT = { kind: "cut", duration: 0 } as const;

export const INDIRIM: TemplateRecipe = {
  id: "indirim",
  tr: "İndirim",
  en: "Sale",
  minPhotos: 1,
  maxPhotos: 3,
  bpm: 120,
  endHold: 0,
  scenes: [
    // 1 hook, 0.0-1.5 s: accent colour, the badge huge, the product punches up.
    {
      slot: 0,
      mode: "cutout",
      tone: "accent",
      length: 3,
      keys: [
        key(0, 0.5, 0.88, 0.5),
        key(0.4, 0.5, 0.76, 0.54, "back"),
        key(1, 0.5, 0.75, 0.55, "inOut"),
      ],
      transition: CUT,
    },
    // 2 depth, 1.5-3.5 s: the camera sweeps across the photo, name below.
    {
      slot: 1,
      mode: "depth",
      length: 4,
      keys: [key(0, -0.6, 0, 1.05, "inOut"), key(2, 0.6, -0.2, 1.3, "inOut")],
      transition: CUT,
      shade: 0.3,
    },
    // 3 price, 3.5-6.0 s: two-tone, old price struck, the new price slams in
    // with a bump of the product.
    {
      slot: 0,
      mode: "cutout",
      tone: "split",
      length: 5,
      keys: [
        key(0, 0.5, 0.74, 0.46),
        key(0.7, 0.5, 0.72, 0.48, "inOut"),
        key(0.9, 0.5, 0.7, 0.54, "back"),
      ],
      transition: CUT,
    },
    // 4 close-up, 6.0-7.0 s: a fast zoom on the detail photo, shaded.
    {
      slot: 2,
      mode: "photo",
      length: 2,
      keys: [key(0, 0.5, 0.5, 1.3, "inOut"), key(1, 0.5, 0.46, 1.45, "inOut")],
      transition: CUT,
      shade: 0.3,
    },
    // 5 end card, 7.0-10.0 s: pale, wipe in, settled by 0.6 s (7.6 s), then still.
    {
      slot: 0,
      mode: "cutout",
      tone: "light",
      length: 6,
      keys: [key(0, 0.5, 0.55, 0.4), key(0.6, 0.5, 0.534, 0.445)],
      transition: { kind: "wipe", duration: 0.25 },
    },
  ],
  texts: [
    // hook: "%30 İNDİRİM" from the badge, huge type on the accent colour
    {
      field: "badge",
      start: 0,
      end: 1.5,
      y: 0.28,
      size: 0.2,
      style: { weight: "heavy", font: "impact", animation: "pop", tracking: 0.01 },
    },
    // depth: the name on a pill over the photo
    {
      field: "name",
      start: 1.6,
      end: 3.5,
      y: 0.76,
      size: 0.11,
      style: { weight: "heavy", font: "impact", animation: "slide", tracking: 0.02 },
      onAccent: true,
    },
    // price: old price struck, then the new price slam
    {
      field: "oldPrice",
      start: 3.7,
      end: 6,
      y: 0.19,
      size: 0.08,
      style: { weight: "bold", font: "impact", animation: "fade", strike: true },
    },
    {
      field: "price",
      start: 4.2,
      end: 6,
      y: 0.32,
      size: 0.18,
      style: { weight: "heavy", font: "impact", animation: "pop" },
    },
    // end card: big price pill on top and the action, the urgency close
    {
      field: "price",
      start: 7.3,
      end: 10,
      y: 0.22,
      size: 0.13,
      style: { weight: "heavy", font: "impact", animation: "pop" },
      onAccent: true,
    },
    {
      field: "cta",
      start: 7.5,
      end: 10,
      y: 0.8,
      size: 0.045,
      style: { weight: "heavy", font: "modern", animation: "rise" },
    },
  ],
};
