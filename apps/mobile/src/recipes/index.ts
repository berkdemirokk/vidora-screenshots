import {
  paletteById,
  type FontStyle,
  type PaletteId,
  type SceneTransition,
} from "../product-templates.ts";
import { INDIRIM } from "./indirim.ts";
import { KOMBIN } from "./kombin.ts";
import { KUTU_ACILISI } from "./kutu-acilisi.ts";
import { ONCE_SONRA } from "./once-sonra.ts";
import type { RecipeText, TemplateRecipe } from "./types.ts";
import { URUN_DETAYLARI } from "./urun-detaylari.ts";
import { YENI_KOLEKSIYON } from "./yeni-koleksiyon.ts";

/**
 * A recipe dressed in a palette, a display font and optionally another kind
 * for its one moving transition. `recipe` already carries the font and the
 * transition, so a variant builds with
 * `buildRecipeSpec(v.recipe, { ...input, palette: v.palette })`.
 * The name is the palette's name.
 */
export type RecipeVariant = {
  id: string;
  recipe: TemplateRecipe;
  palette: PaletteId;
  font: FontStyle;
  transition?: SceneTransition["kind"];
  tr: string;
  en: string;
};

export const RECIPES: readonly TemplateRecipe[] = [
  YENI_KOLEKSIYON,
  INDIRIM,
  KUTU_ACILISI,
  URUN_DETAYLARI,
  ONCE_SONRA,
  KOMBIN,
];

type Dress = [PaletteId, FontStyle, SceneTransition["kind"]?];

/** Five per recipe, the first one is the default look. */
const DRESSES: Record<string, Dress[]> = {
  "yeni-koleksiyon": [
    ["ivory", "impact"],
    ["noir", "elegant"],
    ["blush", "poster", "push"],
    ["ocean", "modern", "zoom"],
    ["emerald", "editorial"],
  ],
  indirim: [
    ["ocean", "impact"],
    ["noir", "poster", "push"],
    ["blush", "impact", "zoom"],
    ["emerald", "poster"],
    ["ivory", "modern", "push"],
  ],
  "kutu-acilisi": [
    ["noir", "impact"],
    ["ivory", "poster", "wipe"],
    ["ocean", "modern"],
    ["emerald", "elegant", "push"],
    ["blush", "impact", "wipe"],
  ],
  "urun-detaylari": [
    ["ivory", "modern"],
    ["noir", "impact", "wipe"],
    ["emerald", "editorial"],
    ["ocean", "poster", "zoom"],
    ["blush", "elegant"],
  ],
  // The wipe is the before/after reveal, so it stays a wipe or a push.
  "once-sonra": [
    ["ivory", "impact"],
    ["noir", "modern"],
    ["ocean", "poster", "push"],
    ["blush", "impact"],
    ["emerald", "poster"],
  ],
  kombin: [
    ["blush", "elegant"],
    ["noir", "editorial", "wipe"],
    ["ivory", "poster"],
    ["emerald", "impact", "zoom"],
    ["ocean", "modern", "wipe"],
  ],
};

/**
 * The recipe with the variant's font on every display text (the ones set in
 * "impact"; body texts keep their font) and the variant's kind on the moving
 * transition. Returns new objects; the base recipe is not changed.
 */
function dress(
  recipe: TemplateRecipe,
  font: FontStyle,
  transition?: SceneTransition["kind"],
): TemplateRecipe {
  return {
    ...recipe,
    scenes: recipe.scenes.map((s) =>
      transition && s.transition.kind !== "cut"
        ? { ...s, transition: { ...s.transition, kind: transition } }
        : s,
    ),
    texts: recipe.texts.map((t) =>
      t.style.font === "impact" ? { ...t, style: { ...t.style, font } } : t,
    ),
  };
}

export const VARIANTS: readonly RecipeVariant[] = RECIPES.flatMap((recipe) =>
  (DRESSES[recipe.id] ?? []).map(([palette, font, transition], i) => {
    const p = paletteById(palette);
    const v: RecipeVariant = {
      id: `${recipe.id}-${i + 1}`,
      recipe: dress(recipe, font, transition),
      palette,
      font,
      tr: p.tr,
      en: p.en,
    };
    if (transition) v.transition = transition;
    return v;
  }),
);

export function variantById(id: string): RecipeVariant | undefined {
  return VARIANTS.find((v) => v.id === id);
}

/**
 * The Metin fields a mode uses: the editorial video shows name and price, a
 * recipe the fields its texts name; null for the classic templates (all).
 */
export function usedTextFields(
  recipe: TemplateRecipe | null | undefined,
  editorial: boolean,
): RecipeText["field"][] | null {
  if (editorial) return ["name", "price"];
  if (!recipe) return null;
  return [...new Set(recipe.texts.map((t) => t.field))];
}
