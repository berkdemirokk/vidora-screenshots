import type { ProductKey } from "../product-templates.ts";
import { endCardKeys, endCardTexts } from "./end-card.ts";
import type { TemplateRecipe } from "./types.ts";

/**
 * "Yeni Koleksiyon": five scenes at 120 bpm (rhythm numbers in
 * docs/hedef/sablon-ritim.md). Scene starts 0 / 1 / 3 / 4.5 / 6.5 s, a 0.25 s
 * wipe into the end card, the end card fully still from 7.1 s.
 * Look (docs/hedef/yeni-video/sheet.png): accent hook with the badge huge,
 * pale hero with a very large name over the product (60 % of the frame,
 * cropped at the bottom), a shaded close-up, a two-tone price scene with the
 * price huge, a pale end card.
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
    // 1 hook, 0.0-1.0 s: accent colour, the product rises under the badge.
    {
      slot: 0,
      mode: "cutout",
      tone: "accent",
      length: 2,
      keys: [key(0, 0.5, 0.86, 0.5), key(0.6, 0.5, 0.76, 0.52)],
      transition: CUT,
    },
    // 2 hero, 1.0-3.0 s: pale, name huge above, product 60 % of the frame.
    {
      slot: 1,
      mode: "cutout",
      tone: "light",
      length: 4,
      keys: [key(0, 0.5, 0.74, 0.56), key(0.5, 0.5, 0.7, 0.6), key(2, 0.5, 0.7, 0.61, "inOut")],
      transition: CUT,
    },
    // 3 close-up, 3.0-4.5 s: zoomed photo, shaded dark.
    {
      slot: 2,
      mode: "photo",
      length: 3,
      keys: [key(0, 0.5, 0.55, 1.25, "inOut"), key(1.5, 0.5, 0.5, 1.45, "inOut")],
      transition: CUT,
      shade: 0.35,
    },
    // 4 price, 4.5-6.5 s: two-tone, the price huge, the product half the frame.
    {
      slot: 3,
      mode: "cutout",
      tone: "split",
      length: 4,
      keys: [key(0, 0.5, 0.74, 0.46), key(0.5, 0.5, 0.7, 0.5)],
      transition: CUT,
    },
    // 5 end card, 6.5-9.0 s: pale, wipe in, settled by 0.6 s (7.1 s), then still.
    {
      slot: 4,
      mode: "cutout",
      tone: "light",
      length: 5,
      keys: endCardKeys(),
      transition: { kind: "wipe", duration: 0.25 },
    },
  ],
  // Six texts at most (LIMITS.maxTexts), so the end card always keeps its
  // price pill and action. The struck old price belongs to the İndirim recipe.
  texts: [
    // hook: the badge as huge type on the accent colour
    {
      field: "badge",
      start: 0,
      end: 1,
      y: 0.28,
      size: 0.2,
      style: { weight: "heavy", font: "impact", animation: "pop", tracking: 0.01 },
    },
    // hero: the name very large, up to two lines
    {
      field: "name",
      start: 1,
      end: 3,
      y: 0.25,
      size: 0.17,
      style: { weight: "heavy", font: "impact", animation: "slide", tracking: 0.01 },
    },
    // price scene: the price slams in, one line, ink on paper
    {
      field: "price",
      start: 4.7,
      end: 6.5,
      y: 0.3,
      size: 0.18,
      style: { weight: "heavy", font: "impact", animation: "pop" },
    },
    ...endCardTexts(6.5, 9),
  ],
};
