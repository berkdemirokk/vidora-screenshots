import type { ProductKey } from "../product-templates.ts";
import type { RecipeText } from "./types.ts";

/**
 * End card shared by the recipes, on a 9:16 frame (fractions of the height):
 * name at 0.144, price pill at 0.235, the product 0.31-0.76 (45 % of the
 * frame), the action at 0.80. Every text keeps 0.025 clear of the product
 * and 0.01 clear of the next text; buildRecipeSpec shrinks long names to fit.
 * The product settles 0.6 s after the cut, the last text enters at 0.5 s,
 * then the card is still.
 */
export function endCardKeys(): ProductKey[] {
  const key = (t: number, y: number, scale: number): ProductKey => ({
    t,
    x: 0.5,
    y,
    scale,
    rotation: 0,
    opacity: 1,
    yaw: 0,
    ease: "out",
  });
  return [key(0, 0.54, 0.4), key(0.6, 0.532, 0.45)];
}

/** Name, price pill and action, entering 0.3 / 0.4 / 0.5 s after `at`. */
export function endCardTexts(at: number, end: number): RecipeText[] {
  const t = (n: number) => Math.round((at + n) * 100) / 100;
  return [
    {
      field: "name",
      start: t(0.3),
      end,
      y: 0.144,
      size: 0.088,
      style: { weight: "heavy", font: "impact", animation: "rise", tracking: 0.02 },
    },
    {
      field: "price",
      start: t(0.4),
      end,
      y: 0.235,
      size: 0.09,
      style: { weight: "heavy", font: "impact", animation: "pop" },
      onAccent: true,
    },
    {
      field: "cta",
      start: t(0.5),
      end,
      y: 0.8,
      size: 0.045,
      style: { weight: "heavy", font: "modern", animation: "rise" },
    },
  ];
}
