import type { ProductKey } from "../product-templates.ts";
import { endCardKeys, endCardTexts } from "./end-card.ts";
import type { TemplateRecipe } from "./types.ts";

/**
 * "Ürün Detayları": a hero hook on the accent colour (huge name, product at
 * 60 % of the frame), then four close-ups (photo, depth, photo, depth) at
 * 120 bpm, 10 s = 20 beats. The badge and the action text work as the facts
 * on the close-ups. Scene starts 0 / 1.5 / 2.5 / 4 / 5 / 6.5 s, hard cuts,
 * one 0.25 s push into a pale end card, still from 7.1 s.
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

export const URUN_DETAYLARI: TemplateRecipe = {
  id: "urun-detaylari",
  tr: "Ürün Detayları",
  en: "Product Details",
  minPhotos: 1,
  maxPhotos: 5,
  bpm: 120,
  endHold: 0,
  scenes: [
    // 1 hero, 0.0-1.5 s: accent colour, huge name, the product large below it.
    {
      slot: 0,
      mode: "cutout",
      tone: "accent",
      length: 3,
      keys: [
        key(0, 0.5, 0.74, 0.56),
        key(0.5, 0.5, 0.7, 0.6),
        key(1.5, 0.5, 0.7, 0.61, "inOut"),
      ],
      transition: CUT,
    },
    // 2 close-up, 1.5-2.5 s: push into the upper left, badge fact.
    {
      slot: 1,
      mode: "photo",
      length: 2,
      keys: [key(0, 0.42, 0.42, 1.3, "inOut"), key(1, 0.42, 0.4, 1.5, "inOut")],
      transition: CUT,
      shade: 0.3,
    },
    // 3 close-up, 2.5-4.0 s: depth, the camera tilts down while dollying in.
    {
      slot: 2,
      mode: "depth",
      length: 3,
      keys: [key(0, 0, -0.6, 1, "inOut"), key(1.5, 0, 0.6, 1.35, "inOut")],
      transition: CUT,
      shade: 0.2,
    },
    // 4 close-up, 4.0-5.0 s: pull back from the lower right, action fact.
    {
      slot: 3,
      mode: "photo",
      length: 2,
      keys: [key(0, 0.58, 0.6, 1.5, "inOut"), key(1, 0.56, 0.56, 1.3, "inOut")],
      transition: CUT,
      shade: 0.3,
    },
    // 5 close-up, 5.0-6.5 s: depth, the camera orbits right to left.
    {
      slot: 4,
      mode: "depth",
      length: 3,
      keys: [key(0, 0.7, 0, 1.3, "inOut"), key(1.5, -0.7, 0, 1.1, "inOut")],
      transition: CUT,
      shade: 0.2,
    },
    // 6 end card, 6.5-10.0 s: pale, push in, settled by 0.6 s (7.1 s), then still.
    {
      slot: 0,
      mode: "cutout",
      tone: "light",
      length: 7,
      keys: endCardKeys(),
      transition: { kind: "push", duration: 0.25 },
    },
  ],
  texts: [
    // hero: the name huge, up to two lines
    {
      field: "name",
      start: 0,
      end: 1.5,
      y: 0.25,
      size: 0.17,
      style: { weight: "heavy", font: "impact", animation: "slide", tracking: 0.01 },
    },
    // fact 1: badge pill
    {
      field: "badge",
      start: 1.75,
      end: 2.5,
      y: 0.74,
      size: 0.1,
      style: { weight: "heavy", font: "impact", animation: "pop", tracking: 0.04 },
      onAccent: true,
    },
    // fact 2: action pill
    {
      field: "cta",
      start: 4.25,
      end: 5,
      y: 0.74,
      size: 0.09,
      style: { weight: "heavy", font: "impact", animation: "pop", tracking: 0.04 },
      onAccent: true,
    },
    ...endCardTexts(6.5, 10),
  ],
};
