import type {
  AspectRatio,
  PaletteId,
  ProductKey,
  ProductQuality,
  ProductShot,
  ProductText,
  SceneTransition,
} from "../product-templates.ts";

export type RecipeText = {
  field: "name" | "price" | "oldPrice" | "badge" | "cta";
  start: number;
  end: number;
  y: number;
  size: number;
  style: Pick<ProductText, "weight" | "font" | "animation" | "strike" | "tracking">;
  /** Palette `onAccent` type on an `accent` pill; otherwise palette `ink`. */
  onAccent?: boolean;
};

/**
 * Scene colour, resolved from the chosen palette at build time:
 * accent = strong accent colour (hooks), light = a pale paper tone (hero, end
 * card), dark = a deep tone (detail), split = a hard two-colour split, paper
 * on the left 42 % and the accent on the right (price). Applies to cut-out scenes only; texts that
 * start in the scene take colours that read on it.
 */
export type SceneTone = "accent" | "light" | "dark" | "split";

export type RecipeScene = {
  slot: number;
  /** "depth" uses the slot's photo (see ProductScene.mode). */
  mode: "cutout" | "photo" | "depth";
  /** Cut-out background; default the palette's own background. */
  tone?: SceneTone;
  /** In beats. */
  length: number;
  keys: ProductKey[];
  shots?: ProductShot[];
  transition: SceneTransition;
  shade?: number;
};

export type TemplateRecipe = {
  id: string;
  tr: string;
  en: string;
  minPhotos: number;
  maxPhotos: number;
  bpm: number;
  scenes: RecipeScene[];
  texts: RecipeText[];
  /** Seconds the last scene holds after its own length. */
  endHold: number;
};

export type RecipeInput = {
  photos: string[];
  cutouts: (string | null)[];
  name: string;
  price: string;
  oldPrice: string;
  badge: string;
  cta: string;
  palette: PaletteId;
  /** Frame shape; default "9:16", which the layouts are authored for (see ratioLayout in build.ts). */
  ratio?: AspectRatio;
  quality: ProductQuality;
  /** Optional music for the render; null or absent means none. */
  music?: { uri: string; volume: number } | null;
  /**
   * An AI picture that already shows the product: used ONLY for the opening
   * scene (photo mode, full frame). Every other scene keeps the seller's own
   * photos, so the price, close-up and end card always show the real product.
   */
  opening?: { uri: string } | null;
  /** The "Vidora" mark for people without Pro (as the classic templates). */
  watermark?: boolean;
};
