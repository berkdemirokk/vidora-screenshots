// Price tag layouts (Batch 4). A layout restyles the price text a template
// already placed, and the struck-through old price next to it, without moving
// the template's own timing: only size, weight, fill and the old price's side
// change. Pure data and geometry, no native code.
import type { ProductText } from "./product-templates.ts";

export type PriceTagId = "classic" | "pill" | "below";

export type PriceTagInfo = {
  id: PriceTagId;
  testID: string;
  tr: string;
  en: string;
};

export const PRICE_TAGS: readonly PriceTagInfo[] = [
  { id: "classic", testID: "pricetag-classic", tr: "Üstü çizili", en: "Struck above" },
  { id: "pill", testID: "pricetag-pill", tr: "Renkli etiket", en: "Colour tag" },
  { id: "below", testID: "pricetag-below", tr: "Büyük fiyat", en: "Big price" },
];

export const isPriceTag = (value: unknown): value is PriceTagId =>
  PRICE_TAGS.some((tag) => tag.id === value);

export type PriceTagColors = { ink: string; accent: string; onAccent: string };

/** 9:16 frame height of one text line of `size` (fraction of the width). */
const lineHeight = (size: number) => size * (9 / 16) * 1.25;

/**
 * Restyles `price` and `oldPrice` in `texts` (9:16 coordinates, before the
 * frame shape is applied). Other texts, and the price's own start/end, are
 * kept. Without a matching price text the list comes back unchanged.
 */
export function applyPriceTag(
  texts: ProductText[],
  tag: PriceTagId,
  price: string,
  oldPrice: string,
  colors: PriceTagColors,
): ProductText[] {
  const priceIndex = texts.findIndex((t) => t.text === price && !t.strike);
  if (!price || priceIndex < 0) return texts;
  const base = texts[priceIndex];
  const oldIndex = oldPrice
    ? texts.findIndex((t) => t.strike && t.text === oldPrice)
    : -1;
  const out = texts.map((t) => ({ ...t }));

  let priceSize = base.size;
  let oldSize = Math.min(base.size * 0.55, 0.055);
  let oldDy: number;
  const next: ProductText = { ...base };
  switch (tag) {
    case "pill":
      priceSize = Math.min(base.size * 0.9, 0.09);
      next.fill = colors.accent;
      next.color = colors.onAccent;
      next.weight = "heavy";
      next.animation = "pop";
      oldDy = -(lineHeight(priceSize) / 2 + lineHeight(oldSize) / 2 + 0.03);
      break;
    case "below":
      priceSize = Math.min(base.size * 1.12, 0.12);
      next.fill = "";
      next.color = colors.ink;
      next.weight = "heavy";
      oldSize = Math.min(oldSize, 0.045);
      oldDy = lineHeight(priceSize) / 2 + lineHeight(oldSize) / 2 + 0.012;
      break;
    default:
      next.fill = "";
      next.color = colors.ink;
      next.weight = "bold";
      oldDy = -(lineHeight(priceSize) / 2 + lineHeight(oldSize) / 2 + 0.012);
  }
  next.size = priceSize;
  out[priceIndex] = next;
  if (oldIndex >= 0) {
    out[oldIndex] = {
      ...out[oldIndex],
      y: next.y + oldDy,
      size: oldSize,
      weight: tag === "below" ? "regular" : "bold",
      color: colors.ink,
      fill: "",
      strike: true,
    };
  }
  return out;
}
