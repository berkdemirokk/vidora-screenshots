/**
 * Data of the template gallery (Home's shelves of recipe variants) and the
 * editor's recipe choice. Pure, so `gallery.test.mjs` runs it in Node; the
 * shelves are drawn by `src/studio/template-gallery.tsx`, the posters by
 * `src/gallery-posters.ts`.
 */
import type { PaletteId } from "./product-templates";
import { buildRecipeSpec } from "./recipes/build.ts";
import { VARIANTS, variantById, type RecipeVariant } from "./recipes/index.ts";
import type { TemplateRecipe } from "./recipes/types";
import { YENI_KOLEKSIYON } from "./recipes/yeni-koleksiyon.ts";
import { MAX_PHOTOS } from "./editor-media.ts";

export type ShelfId = "new" | "sale" | "intro";

/** Home's shelves, in order, and the recipes each one shows. */
export const GALLERY_SHELVES: readonly {
  id: ShelfId;
  tr: string;
  en: string;
  recipes: readonly string[];
}[] = [
  {
    id: "new",
    tr: "Yeni",
    en: "New",
    recipes: ["yeni-koleksiyon", "kutu-acilisi"],
  },
  { id: "sale", tr: "İndirim", en: "Sale", recipes: ["indirim"] },
  {
    id: "intro",
    tr: "Tanıtım",
    en: "Showcase",
    recipes: ["urun-detaylari", "once-sonra", "kombin"],
  },
];

/** One card: a variant with the numbers shown under its poster. */
export type GalleryCard = {
  variant: RecipeVariant;
  /** The base recipe (its name, photo limits). */
  recipe: TemplateRecipe;
  minPhotos: number;
  maxPhotos: number;
  /** Video length in seconds, as the editor builds it. */
  seconds: number;
  /** The length as "0:SS" (same rounding as ui.tsx formatClock). */
  clock: string;
};
export type GalleryShelf = {
  id: ShelfId;
  tr: string;
  en: string;
  cards: GalleryCard[];
};

const clockOf = (seconds: number) => {
  const total = Math.max(0, Math.round(seconds));
  return Math.floor(total / 60) + ":" + String(total % 60).padStart(2, "0");
};

/** The length a variant builds to (one photo, sample-like texts). */
function variantSeconds(variant: RecipeVariant): number {
  return buildRecipeSpec(variant.recipe, {
    photos: ["file:///gallery.jpg"],
    cutouts: ["file:///gallery.png"],
    name: "Lavanta Yağı",
    price: "349 TL",
    oldPrice: "449 TL",
    badge: "Yeni sezon",
    cta: "Hemen al",
    palette: variant.palette,
    ratio: "9:16",
    quality: "720p",
  }).duration;
}

let shelves: GalleryShelf[] | null = null;

/** The shelves with their cards; built once, the same array on every call. */
export function galleryShelves(): GalleryShelf[] {
  if (shelves) return shelves;
  shelves = GALLERY_SHELVES.map((shelf) => ({
    id: shelf.id,
    tr: shelf.tr,
    en: shelf.en,
    cards: shelf.recipes.flatMap((recipeId) =>
      variantsOfRecipe(recipeId).map((variant) => {
        // The base recipe's name and limits (a variant only changes looks).
        const recipe = variant.recipe;
        const seconds = variantSeconds(variant);
        return {
          variant,
          recipe,
          minPhotos: recipe.minPhotos,
          maxPhotos: recipe.maxPhotos,
          seconds,
          clock: clockOf(seconds),
        };
      }),
    ),
  }));
  return shelves;
}

/** The five variants of one recipe, in their own order. */
export function variantsOfRecipe(recipeId: string): RecipeVariant[] {
  return VARIANTS.filter((v) => v.recipe.id === recipeId);
}

/**
 * The moment each recipe's poster shows: a beat where the product and a text
 * are on screen and the recipe looks like itself (not the shared end card).
 */
const POSTER_MOMENT: Record<string, number> = {
  "yeni-koleksiyon": 2.2,
  indirim: 5.2,
  "kutu-acilisi": 3.8,
  "urun-detaylari": 1.0,
  "once-sonra": 3.0,
  kombin: 1.5,
};
export function galleryPosterTime(recipeId: string, seconds: number): number {
  const at = POSTER_MOMENT[recipeId] ?? seconds * 0.6;
  return Math.min(Math.max(0.5, at), seconds - 0.2);
}

/** What the editor builds: a recipe (with its palette, null = the editor's) or none. */
export type RecipeChoice = {
  recipe: TemplateRecipe;
  palette: PaletteId | null;
  variant?: RecipeVariant;
};

/**
 * The recipe path for the editor. A known variant id wins; with none, the QA
 * override (`QA_RECIPE`) gives Yeni Koleksiyon in the editor's palette; else
 * null and the classic templates (buildSpec) are used.
 */
export function recipeChoice(
  variantId: string | null | undefined,
  qaRecipe: boolean,
): RecipeChoice | null {
  const variant = variantId ? variantById(variantId) : undefined;
  if (variant)
    return { recipe: variant.recipe, palette: variant.palette, variant };
  if (qaRecipe) return { recipe: YENI_KOLEKSIYON, palette: null };
  return null;
}

/**
 * Photos picked on Home and handed to the editor as a JSON list in the route
 * (`photos`): only files under `allowedPrefix` (the app's cache directory,
 * where the photo picker writes its copies), at most 8. Anything else gives
 * []. The prefix is passed in so this file stays free of native modules.
 */
export function parsePhotosParam(value: unknown, allowedPrefix: string): string[] {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string" || !raw || !allowedPrefix) return [];
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  return list
    .filter(
      (item): item is string =>
        typeof item === "string" &&
        item.startsWith(allowedPrefix) &&
        item.length > allowedPrefix.length &&
        !item.includes(".."),
    )
    .slice(0, MAX_PHOTOS);
}

/** Photos still needed before a recipe may start (Önce/Sonra needs 2). */
export function missingPhotos(
  recipe: Pick<TemplateRecipe, "minPhotos">,
  picked: number,
): number {
  return Math.max(0, recipe.minPhotos - Math.max(0, picked));
}

/**
 * Whether the editor may start a variant with `photos` photos: never below
 * the recipe's minimum (Önce/Sonra never starts with one photo).
 */
export function canStartVariant(
  variant: Pick<RecipeVariant, "recipe">,
  photos: number,
): boolean {
  return missingPhotos(variant.recipe, photos) === 0;
}

/** Home's gallery card: width, gap between cards, 9:16 poster height. */
export const GALLERY_CARD = {
  width: 132,
  gap: 12,
  posterHeight: Math.round((132 * 16) / 9),
} as const;
/** Above the first cards: the gallery's top padding, shelf title, gap. */
export const SHELF_HEAD = 16 + 28 + 8;
/**
 * The hero column (headline, button, the two links, the claim) at the
 * default text size, in points: used to check the first shelf shows.
 */
export const HERO_COLUMN_ESTIMATE = 290;

/** Most of the screen height Home's hero may take (the gallery shows below). */
export const HERO_MAX_SHARE = 0.45;
/** Home's side margins, the gap poster-to-column and below the hero. */
const GUTTER = 20,
  HERO_GAP = 16,
  HERO_BOTTOM = 12,
  HERO_TOP = 8;

/**
 * Home's compact hero: the engine poster (9:16) on the left, the headline and
 * buttons on the right, at most HERO_MAX_SHARE of the window height (the
 * column may grow past it at large text sizes). The poster is never wider
 * than half the row.
 */
export function compactHeroLayout(g: {
  width: number;
  height: number;
  safeTop: number;
}): {
  top: number;
  posterWidth: number;
  posterHeight: number;
  columnWidth: number;
  heroHeight: number;
} {
  const fin = (n: number) => (Number.isFinite(n) ? Math.max(0, n) : 0);
  const width = fin(g.width),
    height = fin(g.height);
  const top = Math.round(fin(g.safeTop) + HERO_TOP);
  const budget = Math.floor(height * HERO_MAX_SHARE) - top - HERO_BOTTOM;
  let posterHeight = Math.max(160, budget);
  let posterWidth = Math.round((posterHeight * 9) / 16);
  const widest = Math.floor((width - 2 * GUTTER - HERO_GAP) / 2);
  if (posterWidth > widest) {
    posterWidth = Math.max(0, widest);
    posterHeight = Math.round((posterWidth * 16) / 9);
  }
  const columnWidth = Math.max(0, width - 2 * GUTTER - HERO_GAP - posterWidth);
  return {
    top,
    posterWidth,
    posterHeight,
    columnWidth,
    heroHeight: top + posterHeight + HERO_BOTTOM,
  };
}
