/**
 * "Pazaryeri görseli": text-free product images on pure white. Trendyol
 * rejects product images with price, discount, campaign or shipping text;
 * Amazon wants a white main image with the product at about 85% of the
 * frame. Sizes from docs/pazaryeri-olculeri.md (checked 16 Nov 2026).
 *
 * Pure data, so the test can check every size against the engine's limits.
 */
import type { FrameRatio } from "./product-templates";

export type MarketplaceImageId = "trendyol" | "square" | "amazon";

export type MarketplaceImage = {
  id: MarketplaceImageId;
  /** Button label, e.g. "Trendyol · 1200×1800". */
  tr: string;
  en: string;
  ratio: FrameRatio;
  /** Width in pixels; the height follows the ratio (`stillSize`). */
  width: number;
  /** Share of the frame the product takes. */
  fill: number;
};

export const MARKETPLACE_IMAGES: readonly MarketplaceImage[] = [
  // Official: 1200 x 1800, JPEG, at most 10 MB.
  {
    id: "trendyol",
    tr: "Trendyol · 1200×1800",
    en: "Trendyol · 1200×1800",
    ratio: "2:3",
    width: 1200,
    fill: 0.85,
  },
  // Common for Hepsiburada and N11; their official numbers could not be read.
  {
    id: "square",
    tr: "Kare · 1500×1500",
    en: "Square · 1500×1500",
    ratio: "1:1",
    width: 1500,
    fill: 0.85,
  },
  // Official: pure white, product about 85% of the frame.
  {
    id: "amazon",
    tr: "Amazon · 2000×2000",
    en: "Amazon · 2000×2000",
    ratio: "1:1",
    width: 2000,
    fill: 0.85,
  },
];

/** Size cap for marketplace JPEGs (N11's FAQ says 2 MB). */
export const MARKETPLACE_MAX_BYTES = 2_000_000;

export function marketplaceImageById(id: MarketplaceImageId): MarketplaceImage {
  return (
    MARKETPLACE_IMAGES.find((item) => item.id === id) ?? MARKETPLACE_IMAGES[0]
  );
}

/**
 * True when the video carries text that Trendyol rejects on product images
 * (price, old price or a badge) while the preset is the marketplace one.
 */
export function marketplaceTextRisk(
  preset: string,
  texts: { price: string; oldPrice: string; badge: string },
): boolean {
  return (
    preset === "trendyol" &&
    [texts.price, texts.oldPrice, texts.badge].some((value) => !!value.trim())
  );
}

export type StillStyleId = "main" | "instagram" | "story";

/**
 * The three still styles of the editor's Çıktı tab and of "Hepsini çıkar".
 * "white" is the text-free marketplace main image (Trendyol rule: no price,
 * discount or campaign text) built by `buildMainImageSpec`; "design" is the
 * end card of the current design in a social shape, at the width given.
 */
export type StillStyle = {
  id: StillStyleId;
  testID: string;
  tr: string;
  en: string;
  kind: "white" | "design";
  ratio: FrameRatio;
  width: number;
  /** Product share of the frame (white images only). */
  fill: number;
};

export const STILL_STYLES: readonly StillStyle[] = [
  {
    id: "main",
    testID: "still-main",
    tr: "Ana görsel · beyaz, yazısız",
    en: "Main image · white, no text",
    kind: "white",
    ratio: "2:3",
    width: 1200,
    fill: 0.85,
  },
  {
    id: "instagram",
    testID: "still-instagram",
    tr: "Instagram gönderi · 1080×1350",
    en: "Instagram post · 1080×1350",
    kind: "design",
    ratio: "4:5",
    width: 1080,
    fill: 0.85,
  },
  {
    id: "story",
    testID: "still-story",
    tr: "Hikâye kapağı · 1080×1920",
    en: "Story cover · 1080×1920",
    kind: "design",
    ratio: "9:16",
    width: 1080,
    fill: 0.85,
  },
];

export function stillStyleById(id: StillStyleId): StillStyle {
  return STILL_STYLES.find((item) => item.id === id) ?? STILL_STYLES[0];
}

/** Quality a preset starts at when the user has not picked one. */
export const presetQuality = (preset: string): "720p" | "1080p" =>
  preset === "trendyol" ? "720p" : "1080p";
