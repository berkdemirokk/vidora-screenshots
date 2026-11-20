import type {
  FrameRatio,
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

export type RecipeScene = {
  slot: number;
  mode: "cutout" | "photo";
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
  ratio: FrameRatio;
  quality: ProductQuality;
};
