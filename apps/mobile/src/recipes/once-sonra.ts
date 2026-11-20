import type { ProductKey } from "../product-templates.ts";
import { endCardKeys, endCardTexts } from "./end-card.ts";
import type { TemplateRecipe } from "./types.ts";

/**
 * "Önce/Sonra": photo 0 is the before, photo 1 the after, at 120 bpm,
 * 10 s = 20 beats. Before holds, a 0.5 s wipe reveals the after, then the two
 * flick back and forth on the beat and a hard cut lands on the end card.
 * Scene starts 0 / 2 / 4 / 4.5 / 5 / 5.5 / 6.5 s; pale end card still from
 * 7.1 s.
 * Plain photo scenes only: a before/after must not distort the photos, so this
 * is the one recipe without a depth scene. The only label is the seller's own
 * badge on the after; no badge, no label.
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

/** Both photos get the same slow push so the comparison stays fair. */
const HOLD = [key(0, 0.5, 0.5, 1.05, "inOut"), key(2, 0.5, 0.5, 1.12, "inOut")];
const FLICK = [key(0, 0.5, 0.5, 1.12, "linear")];

export const ONCE_SONRA: TemplateRecipe = {
  id: "once-sonra",
  tr: "Önce/Sonra",
  en: "Before/After",
  minPhotos: 2,
  maxPhotos: 2,
  bpm: 120,
  endHold: 0,
  scenes: [
    // 1 before, 0.0-2.0 s: name pill on top.
    { slot: 0, mode: "photo", length: 4, keys: HOLD, transition: CUT, shade: 0.15 },
    // 2 after, 2.0-4.0 s: wipe reveal, the badge labels it.
    {
      slot: 1,
      mode: "photo",
      length: 4,
      keys: HOLD,
      transition: { kind: "wipe", duration: 0.5 },
      shade: 0.15,
    },
    // 3-6 flick on the beat, 4.0-6.5 s: before / after / before / after.
    { slot: 0, mode: "photo", length: 1, keys: FLICK, transition: CUT, shade: 0.15 },
    { slot: 1, mode: "photo", length: 1, keys: FLICK, transition: CUT, shade: 0.15 },
    { slot: 0, mode: "photo", length: 1, keys: FLICK, transition: CUT, shade: 0.15 },
    {
      slot: 1,
      mode: "photo",
      length: 2,
      keys: [key(0, 0.5, 0.5, 1.12, "inOut"), key(1, 0.5, 0.5, 1.18, "inOut")],
      transition: CUT,
      shade: 0.15,
    },
    // 7 end card, 6.5-10.0 s: the after as cut-out on paper, settled by 0.6 s,
    // then still.
    {
      slot: 1,
      mode: "cutout",
      tone: "light",
      length: 7,
      keys: endCardKeys(),
      transition: CUT,
    },
  ],
  texts: [
    // before: the name
    {
      field: "name",
      start: 0.1,
      end: 2,
      y: 0.2,
      size: 0.11,
      style: { weight: "heavy", font: "impact", animation: "slide", tracking: 0.02 },
      onAccent: true,
    },
    // after: the seller's badge as the label, only when set
    {
      field: "badge",
      start: 2.5,
      end: 4,
      y: 0.74,
      size: 0.12,
      style: { weight: "heavy", font: "impact", animation: "pop", tracking: 0.02 },
      onAccent: true,
    },
    ...endCardTexts(6.5, 10),
  ],
};
