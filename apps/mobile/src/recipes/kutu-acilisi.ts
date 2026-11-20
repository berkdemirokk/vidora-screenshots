import type { ProductKey } from "../product-templates.ts";
import { endCardKeys, endCardTexts } from "./end-card.ts";
import type { TemplateRecipe } from "./types.ts";

/**
 * "Kutu Açılışı": unboxing reveal at 120 bpm, 9.5 s = 19 beats. A dark tease
 * (depth close-up, then a zoomed photo), a 0.25 s zoom into the reveal where
 * the product rises into frame on the accent colour and lands at 60 % of the
 * frame under a huge name, a depth detail sweep, a hard cut to a pale end
 * card. Scene starts 0 / 1 / 2 / 4.5 / 6.5 s; end card still from 7.1 s.
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

export const KUTU_ACILISI: TemplateRecipe = {
  id: "kutu-acilisi",
  tr: "Kutu Açılışı",
  en: "Unboxing",
  minPhotos: 1,
  maxPhotos: 3,
  bpm: 120,
  endHold: 0,
  scenes: [
    // 1 tease, 0.0-1.0 s: dark depth close-up pulling back, badge on top.
    {
      slot: 1,
      mode: "depth",
      length: 2,
      keys: [key(0, 0, 0, 1.4, "inOut"), key(1, 0, 0.3, 1.3, "inOut")],
      transition: CUT,
      shade: 0.55,
    },
    // 2 tease, 1.0-2.0 s: a second glimpse, zoomed in and shaded.
    {
      slot: 2,
      mode: "photo",
      length: 2,
      keys: [key(0, 0.5, 0.5, 1.5, "inOut"), key(1, 0.5, 0.5, 1.35, "inOut")],
      transition: CUT,
      shade: 0.4,
    },
    // 3 reveal, 2.0-4.5 s: zoom in on the accent colour, the product rises
    // from below and lands at 60 % of the frame.
    {
      slot: 0,
      mode: "cutout",
      tone: "accent",
      length: 5,
      keys: [
        key(0, 0.5, 1.1, 0.4),
        key(0.5, 0.5, 0.7, 0.6, "back"),
        key(2.5, 0.5, 0.7, 0.61, "inOut"),
      ],
      transition: { kind: "zoom", duration: 0.25 },
    },
    // 4 detail, 4.5-6.5 s: the camera orbits the main photo.
    {
      slot: 0,
      mode: "depth",
      length: 4,
      keys: [key(0, -0.8, 0, 1.1, "inOut"), key(2, 0.8, 0, 1.3, "inOut")],
      transition: CUT,
      shade: 0.2,
    },
    // 5 end card, 6.5-9.5 s: pale, hard cut, settled by 0.6 s (7.1 s), then still.
    {
      slot: 0,
      mode: "cutout",
      tone: "light",
      length: 6,
      keys: endCardKeys(),
      transition: CUT,
    },
  ],
  texts: [
    // tease: the badge on a pill
    {
      field: "badge",
      start: 0.1,
      end: 1,
      y: 0.5,
      size: 0.14,
      style: { weight: "heavy", font: "impact", animation: "pop", tracking: 0.02 },
      onAccent: true,
    },
    // reveal: the name huge above the product, up to two lines
    {
      field: "name",
      start: 2.5,
      end: 4.5,
      y: 0.25,
      size: 0.17,
      style: { weight: "heavy", font: "impact", animation: "slide", tracking: 0.01 },
    },
    ...endCardTexts(6.5, 9.5),
  ],
};
