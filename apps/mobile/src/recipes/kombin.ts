import type { ProductKey } from "../product-templates.ts";
import { endCardKeys, endCardTexts } from "./end-card.ts";
import type { TemplateRecipe } from "./types.ts";

/**
 * "Kombin": a lookbook at 120 bpm, 10 s = 20 beats. Six photos cut on every
 * second beat (1 s each, two of them depth), the product cut-out large on a
 * deep tone, then a 0.25 s push into a pale end card with the price.
 * Scene starts
 * 0 / 1 / 2 / 3 / 4 / 5 / 6 / 7 s; end card still from 7.6 s.
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
  ease: ProductKey["ease"] = "inOut",
): ProductKey => ({ t, x, y, scale, rotation: 0, opacity: 1, yaw: 0, ease });

const CUT = { kind: "cut", duration: 0 } as const;

export const KOMBIN: TemplateRecipe = {
  id: "kombin",
  tr: "Kombin",
  en: "Outfit",
  minPhotos: 1,
  maxPhotos: 6,
  bpm: 120,
  endHold: 0,
  scenes: [
    // 1 look, 0.0-1.0 s: depth, dolly in while the camera rises.
    {
      slot: 0,
      mode: "depth",
      length: 2,
      keys: [key(0, 0, 0, 1), key(1, 0, -0.3, 1.2)],
      transition: CUT,
      shade: 0.2,
    },
    // 2 look, 1.0-2.0 s: slow push, drifting down.
    {
      slot: 1,
      mode: "photo",
      length: 2,
      keys: [key(0, 0.5, 0.48, 1.15), key(1, 0.5, 0.52, 1.25)],
      transition: CUT,
      shade: 0.2,
    },
    // 3 look, 2.0-3.0 s: pull back, drifting right.
    {
      slot: 2,
      mode: "photo",
      length: 2,
      keys: [key(0, 0.45, 0.5, 1.25), key(1, 0.55, 0.5, 1.15)],
      transition: CUT,
    },
    // 4 look, 3.0-4.0 s: push up, badge pill.
    {
      slot: 3,
      mode: "photo",
      length: 2,
      keys: [key(0, 0.5, 0.55, 1.1), key(1, 0.5, 0.45, 1.25)],
      transition: CUT,
      shade: 0.15,
    },
    // 5 look, 4.0-5.0 s: depth, orbit left to right.
    {
      slot: 4,
      mode: "depth",
      length: 2,
      keys: [key(0, -0.7, 0, 1.15), key(1, 0.7, 0, 1.25)],
      transition: CUT,
      shade: 0.15,
    },
    // 6 look, 5.0-6.0 s: pull back.
    {
      slot: 5,
      mode: "photo",
      length: 2,
      keys: [key(0, 0.5, 0.5, 1.3), key(1, 0.5, 0.5, 1.15)],
      transition: CUT,
    },
    // 7 product, 6.0-7.0 s: the cut-out on the deep tone with an accent glow,
    // 60 % of the frame, no text.
    {
      slot: 0,
      mode: "cutout",
      tone: "dark",
      length: 2,
      keys: [key(0, 0.5, 0.56, 0.56, "out"), key(1, 0.5, 0.52, 0.62)],
      transition: CUT,
    },
    // 8 end card, 7.0-10.0 s: pale, push in, settled by 0.6 s (7.6 s), then still.
    {
      slot: 0,
      mode: "cutout",
      tone: "light",
      length: 6,
      keys: endCardKeys(),
      transition: { kind: "push", duration: 0.25 },
    },
  ],
  texts: [
    // opening looks: the name across the first cut
    {
      field: "name",
      start: 0.1,
      end: 2,
      y: 0.22,
      size: 0.14,
      style: { weight: "heavy", font: "impact", animation: "pop", tracking: 0.02 },
      onAccent: true,
    },
    // middle looks: badge pill across the depth cut
    {
      field: "badge",
      start: 3.1,
      end: 5,
      y: 0.74,
      size: 0.1,
      style: { weight: "heavy", font: "impact", animation: "pop", tracking: 0.04 },
      onAccent: true,
    },
    ...endCardTexts(7, 10),
  ],
};
