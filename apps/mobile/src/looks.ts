/**
 * "Hazır görünümler": curated looks, each a template, a background (bundled
 * backdrop or plain palette) and a type family that work together. The
 * editor draws every look with the user's own product, so they can pick a
 * finished look instead of building one from parts.
 *
 * Pure data (type imports only), so `looks.test.mjs` can check every look
 * against the engine's layout rules.
 */
import type { BackdropId } from "./backdrops";
import type { CategoryId } from "./product-catalog";
import type { FontStyle, PaletteId, TemplateId } from "./product-templates";

export type Look = {
  id: string;
  tr: string;
  en: string;
  /** Categories the look is offered for (6 to 8 looks per category). */
  categories: readonly CategoryId[];
  template: TemplateId;
  /** A bundled backdrop; null when the look uses a plain `palette`. */
  backdrop: BackdropId | null;
  /** The plain palette; with a backdrop it is only the fallback colours. */
  palette: PaletteId;
  fontStyle: FontStyle;
};

const look = (
  id: string,
  tr: string,
  en: string,
  categories: CategoryId[],
  template: TemplateId,
  background: { backdrop: BackdropId } | { palette: PaletteId },
  fontStyle: FontStyle,
): Look => ({
  id,
  tr,
  en,
  categories,
  template,
  backdrop: "backdrop" in background ? background.backdrop : null,
  palette: "palette" in background ? background.palette : "ivory",
  fontStyle,
});

export const LOOKS: readonly Look[] = [
  // Cosmetics and perfume
  look(
    "marble-showcase",
    "Mermer vitrin",
    "Marble showcase",
    ["cosmetics", "jewellery"],
    "showcase",
    { backdrop: "marble-white" },
    "elegant",
  ),
  look(
    "blush-campaign",
    "Pudra kampanya",
    "Blush campaign",
    ["cosmetics"],
    "campaign",
    { backdrop: "paper-blush" },
    "modern",
  ),
  look(
    "travertine-light",
    "Traverten ışık",
    "Travertine light",
    ["cosmetics"],
    "lightTour",
    { backdrop: "travertine" },
    "elegant",
  ),
  look(
    "sage-box",
    "Adaçayı kutu",
    "Sage unboxing",
    ["cosmetics", "food"],
    "unboxing",
    { backdrop: "paper-sage" },
    "modern",
  ),
  look(
    "blush-detail",
    "Pudra detay",
    "Blush detail",
    ["cosmetics"],
    "detail",
    { backdrop: "paper-blush" },
    "elegant",
  ),
  look(
    "ivory-plain",
    "Fildişi sade",
    "Ivory plain",
    ["cosmetics", "fashion"],
    "minimal",
    { palette: "ivory" },
    "editorial",
  ),
  look(
    "travertine-store",
    "Traverten mağaza",
    "Travertine store",
    ["cosmetics", "jewellery"],
    "store",
    { backdrop: "travertine" },
    "elegant",
  ),
  look(
    "blush-turn",
    "Pudra dönüş",
    "Blush turntable",
    ["cosmetics", "fashion"],
    "turntable",
    { backdrop: "paper-blush" },
    "modern",
  ),
  // Jewellery and accessories
  look(
    "night-jewel",
    "Gece mücevher",
    "Night jewel",
    ["jewellery"],
    "turntable",
    { backdrop: "marble-black" },
    "elegant",
  ),
  look(
    "walnut-turn",
    "Ceviz dönüş",
    "Walnut turntable",
    ["jewellery"],
    "turntable",
    { backdrop: "walnut" },
    "editorial",
  ),
  look(
    "black-detail",
    "Siyah detay",
    "Black detail",
    ["jewellery", "electronics"],
    "detail",
    { backdrop: "marble-black" },
    "modern",
  ),
  look(
    "noir-showcase",
    "Gece vitrini",
    "Night showcase",
    ["jewellery"],
    "showcase",
    { palette: "noir" },
    "elegant",
  ),
  look(
    "sand-campaign",
    "Kum kampanya",
    "Sand campaign",
    ["jewellery", "fashion"],
    "campaign",
    { backdrop: "paper-sand" },
    "editorial",
  ),
  look(
    "marble-plain",
    "Mermer sade",
    "Marble plain",
    ["jewellery"],
    "minimal",
    { backdrop: "marble-white" },
    "elegant",
  ),
  // Fashion
  look(
    "linen-editorial",
    "Keten editoryal",
    "Linen editorial",
    ["fashion", "home"],
    "editorial",
    { backdrop: "linen" },
    "editorial",
  ),
  look(
    "terrazzo-sale",
    "Terrazzo indirim",
    "Terrazzo sale",
    ["fashion"],
    "discount",
    { backdrop: "terrazzo" },
    "poster",
  ),
  look(
    "blush-sale",
    "Pembe afiş indirim",
    "Pink sale",
    ["fashion"],
    "discount",
    { palette: "blush" },
    "impact",
  ),
  look(
    "night-light",
    "Gece ışık turu",
    "Night light tour",
    ["fashion"],
    "lightTour",
    { backdrop: "paper-night" },
    "elegant",
  ),
  look(
    "linen-box",
    "Keten kutu",
    "Linen unboxing",
    ["fashion", "home"],
    "unboxing",
    { backdrop: "linen" },
    "editorial",
  ),
  // Home and living
  look(
    "concrete-minimal",
    "Beton minimal",
    "Concrete minimal",
    ["home", "electronics"],
    "minimal",
    { backdrop: "concrete" },
    "modern",
  ),
  look(
    "oak-store",
    "Meşe mağaza",
    "Oak store",
    ["home", "food"],
    "store",
    { backdrop: "oak" },
    "modern",
  ),
  look(
    "oak-showcase",
    "Meşe vitrin",
    "Oak showcase",
    ["home"],
    "showcase",
    { backdrop: "oak" },
    "modern",
  ),
  look(
    "walnut-editorial",
    "Ceviz editoryal",
    "Walnut editorial",
    ["home", "food"],
    "editorial",
    { backdrop: "walnut" },
    "editorial",
  ),
  look(
    "sage-light",
    "Adaçayı ışık turu",
    "Sage light tour",
    ["home"],
    "lightTour",
    { backdrop: "paper-sage" },
    "modern",
  ),
  look(
    "terrazzo-showcase",
    "Terrazzo vitrin",
    "Terrazzo showcase",
    ["home"],
    "showcase",
    { backdrop: "terrazzo" },
    "modern",
  ),
  // Food
  look(
    "walnut-showcase",
    "Ceviz vitrin",
    "Walnut showcase",
    ["food"],
    "showcase",
    { backdrop: "walnut" },
    "elegant",
  ),
  look(
    "sand-sale",
    "Kum indirim",
    "Sand sale",
    ["food"],
    "discount",
    { backdrop: "paper-sand" },
    "poster",
  ),
  look(
    "sage-plain",
    "Adaçayı sade",
    "Sage plain",
    ["food"],
    "minimal",
    { backdrop: "paper-sage" },
    "editorial",
  ),
  look(
    "emerald-campaign",
    "Zümrüt kampanya",
    "Emerald campaign",
    ["food"],
    "campaign",
    { palette: "emerald" },
    "impact",
  ),
  look(
    "emerald-detail",
    "Zümrüt detay",
    "Emerald detail",
    ["food"],
    "detail",
    { palette: "emerald" },
    "elegant",
  ),
  // Electronics
  look(
    "concrete-turn",
    "Beton dönüş",
    "Concrete turntable",
    ["electronics"],
    "turntable",
    { backdrop: "concrete" },
    "modern",
  ),
  look(
    "night-campaign",
    "Gece kampanya",
    "Night campaign",
    ["electronics"],
    "campaign",
    { backdrop: "paper-night" },
    "impact",
  ),
  look(
    "ocean-sale",
    "Mavi indirim",
    "Blue sale",
    ["electronics"],
    "discount",
    { palette: "ocean" },
    "impact",
  ),
  look(
    "concrete-box",
    "Beton kutu",
    "Concrete unboxing",
    ["electronics"],
    "unboxing",
    { backdrop: "concrete" },
    "modern",
  ),
  look(
    "ocean-detail",
    "Mavi detay",
    "Blue detail",
    ["electronics"],
    "detail",
    { palette: "ocean" },
    "modern",
  ),
  look(
    "night-store",
    "Gece mağaza",
    "Night store",
    ["electronics"],
    "store",
    { backdrop: "paper-night" },
    "modern",
  ),
];

export function lookById(id: string): Look | null {
  return LOOKS.find((item) => item.id === id) ?? null;
}

/** The looks offered for a category; `null` lists every look. */
export function looksFor(category: CategoryId | null): readonly Look[] {
  return category
    ? LOOKS.filter((item) => item.categories.includes(category))
    : LOOKS;
}

/** The look the editor's current choices match, if any. */
export function matchingLook(state: {
  template: TemplateId;
  backdrop: BackdropId | null;
  palette: PaletteId;
  fontStyle: FontStyle | null;
}): Look | null {
  return (
    LOOKS.find(
      (item) =>
        item.template === state.template &&
        item.backdrop === state.backdrop &&
        (item.backdrop !== null || item.palette === state.palette) &&
        item.fontStyle === state.fontStyle,
    ) ?? null
  );
}
