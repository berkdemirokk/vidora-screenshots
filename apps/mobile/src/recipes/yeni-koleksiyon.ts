import type { ProductKey } from "../product-templates.ts";
import type { TemplateRecipe } from "./types.ts";

/**
 * "Yeni Koleksiyon": five scenes at 120 bpm (rhythm numbers in
 * docs/hedef/sablon-ritim.md). Scene starts 0 / 1 / 3 / 4.5 / 6.5 s, a 0.25 s
 * wipe into the end card, the end card fully still from 7.4 s.
 * Scene keys are relative to the scene start; texts are on the video clock.
 * Cut-out keys: `scale` is the product height as a fraction of the frame.
 * Photo keys: `scale` is zoom, x/y the photo point at the frame centre.
 */
const key = (
  t: number,
  x: number,
  y: number,
  scale: number,
  ease: ProductKey["ease"] = "out",
): ProductKey => ({ t, x, y, scale, rotation: 0, opacity: 1, yaw: 0, ease });

const CUT = { kind: "cut", duration: 0 } as const;

export const YENI_KOLEKSIYON: TemplateRecipe = {
  id: "yeni-koleksiyon",
  tr: "Yeni Koleksiyon",
  en: "New Collection",
  minPhotos: 1,
  maxPhotos: 5,
  bpm: 120,
  endHold: 0,
  scenes: [
    // 1 hook, 0.0-1.0 s: product rises under the badge.
    {
      slot: 0,
      mode: "cutout",
      length: 2,
      keys: [key(0, 0.5, 0.72, 0.4), key(0.6, 0.5, 0.62, 0.42)],
      transition: CUT,
    },
    // 2 hero, 1.0-3.0 s: name above, product large and centred.
    {
      slot: 1,
      mode: "cutout",
      length: 4,
      keys: [key(0, 0.5, 0.66, 0.46), key(0.5, 0.5, 0.6, 0.5), key(2, 0.5, 0.58, 0.52, "inOut")],
      transition: CUT,
    },
    // 3 close-up, 3.0-4.5 s: zoomed photo, shaded for the pill.
    {
      slot: 2,
      mode: "photo",
      length: 3,
      keys: [key(0, 0.5, 0.55, 1.25, "inOut"), key(1.5, 0.5, 0.5, 1.45, "inOut")],
      transition: CUT,
      shade: 0.3,
    },
    // 4 price, 4.5-6.5 s: small product low, big price above.
    {
      slot: 3,
      mode: "cutout",
      length: 4,
      keys: [key(0, 0.5, 0.7, 0.34), key(0.5, 0.5, 0.66, 0.36)],
      transition: CUT,
    },
    // 5 end card, 6.5-9.0 s: wipe in, settled by 0.8 s (7.3 s), then still.
    {
      slot: 4,
      mode: "cutout",
      length: 5,
      keys: [key(0, 0.5, 0.5, 0.34), key(0.8, 0.5, 0.45, 0.36)],
      transition: { kind: "wipe", duration: 0.25 },
    },
  ],
  texts: [
    // hook
    {
      field: "badge",
      start: 0,
      end: 1,
      y: 0.24,
      size: 0.12,
      style: { weight: "heavy", font: "impact", animation: "pop", tracking: 0.02 },
      onAccent: true,
    },
    // hero
    {
      field: "name",
      start: 1,
      end: 3,
      y: 0.2,
      size: 0.1,
      style: { weight: "heavy", font: "impact", animation: "slide", tracking: 0.02 },
    },
    // close-up
    {
      field: "badge",
      start: 3.25,
      end: 4.5,
      y: 0.74,
      size: 0.07,
      style: { weight: "heavy", font: "impact", animation: "pop", tracking: 0.04 },
      onAccent: true,
    },
    // price scene: old price struck, then the new price
    {
      field: "oldPrice",
      start: 4.7,
      end: 6.5,
      y: 0.22,
      size: 0.06,
      style: { weight: "bold", font: "impact", animation: "fade", strike: true },
    },
    {
      field: "price",
      start: 5.2,
      end: 6.5,
      y: 0.34,
      size: 0.15,
      style: { weight: "heavy", font: "impact", animation: "pop" },
    },
    // end card: name, price pill, action pill
    {
      field: "name",
      start: 6.8,
      end: 9,
      y: 0.17,
      size: 0.08,
      style: { weight: "heavy", font: "impact", animation: "rise", tracking: 0.02 },
    },
    {
      field: "price",
      start: 6.9,
      end: 9,
      y: 0.71,
      size: 0.075,
      style: { weight: "heavy", font: "impact", animation: "pop" },
      onAccent: true,
    },
    {
      field: "cta",
      start: 7,
      end: 9,
      y: 0.79,
      size: 0.05,
      style: { weight: "heavy", font: "modern", animation: "rise" },
    },
  ],
};
