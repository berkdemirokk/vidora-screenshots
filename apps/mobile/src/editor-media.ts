/**
 * Pure rules for the editor's photos, beat music and AI scenes. No React or
 * native module here, so node --test runs it directly.
 */
import type {
  AspectRatio,
  ProductKey,
  ProductVideoSpec,
  SceneInput,
} from "./product-templates.ts";
import type { PatternId } from "./music/patterns.ts";
import type { EditState } from "./drafts.ts";

/** One video uses at most 8 photos (the main product plus 7). */
export const MAX_PHOTOS = 8;

/** A photo of the video: the picked file and its cut-out (null: none yet or failed). */
export type EditorPhoto<C extends { uri: string } = { uri: string }> = {
  source: string;
  cutout: C | null;
};

/** The list cut to MAX_PHOTOS. */
export function capPhotos<T>(photos: readonly T[]): T[] {
  return photos.slice(0, MAX_PHOTOS);
}

/** How many more photos fit next to `count` (at most `max`, default 8). */
export function photosLeft(count: number, max: number = MAX_PHOTOS): number {
  return Math.max(0, Math.min(max, MAX_PHOTOS) - count);
}

/**
 * The photo and cut-out lists for a recipe. An AI picture that already shows
 * the product is the opening scene only (`opening`, full frame, no cut-out);
 * it never goes into `photos`, so every other scene shows the seller's own
 * photos (the price, the close-up, the end card, Önce/Sonra's "before").
 */
export function recipeSources(
  photos: readonly EditorPhoto[],
  aiSceneUri: string | null,
): {
  photos: string[];
  cutouts: (string | null)[];
  opening: { uri: string } | null;
} {
  const list = capPhotos(photos);
  return {
    photos: list.map((p) => p.source),
    cutouts: list.map((p) => p.cutout?.uri ?? null),
    opening: aiSceneUri ? { uri: aiSceneUri } : null,
  };
}

/** Photos a template takes: a recipe's own range, else 1 to MAX_PHOTOS. */
export function photoRange(
  recipe: { minPhotos: number; maxPhotos: number } | null | undefined,
): { min: number; max: number } {
  if (!recipe) return { min: 1, max: MAX_PHOTOS };
  const max = Math.max(1, Math.min(MAX_PHOTOS, recipe.maxPhotos));
  return { min: Math.max(1, Math.min(max, recipe.minPhotos)), max };
}

/** The AI picture already shows the product (AI Sahne's photo route). */
export function sceneHasProduct(
  scene: Pick<SceneInput, "containsProduct"> | null | undefined,
): boolean {
  return scene?.containsProduct === true;
}

/**
 * The scene that is the background now, when it already shows the product:
 * an own photo or a bundled backdrop wins over a kept AI scene.
 */
export function shownProductScene(
  scene: SceneInput | null,
  others: { ownActive: boolean; backdrop: string | null },
): SceneInput | null {
  if (others.ownActive || others.backdrop) return null;
  return sceneHasProduct(scene) ? scene : null;
}

/**
 * The guard for templates without scenes: when the AI picture shows the
 * product, the video becomes one full-frame photo scene of that picture
 * (slow push-in) with the template's texts; the cut-out is not drawn.
 * Specs that already have scenes (recipes) get their photos from
 * `recipeSources` and are returned as they are.
 */
export function guardAiScene(
  spec: ProductVideoSpec,
  scene: SceneInput | null,
): ProductVideoSpec {
  if (!sceneHasProduct(scene) || !scene || spec.scenes) return spec;
  const d = spec.duration;
  const rest = spec.keys[spec.keys.length - 1];
  const hold = (t: number): ProductKey => ({ ...rest, t, ease: "linear" });
  const zoom = (t: number, scale: number): ProductKey => ({
    t,
    x: 0.5,
    y: 0.5,
    scale,
    rotation: 0,
    opacity: 1,
    yaw: 0,
    ease: "inOut",
  });
  return {
    ...spec,
    product: scene.uri,
    camera: { zoomFrom: 1, zoomTo: 1 },
    keys: [hold(0), hold(d)],
    shadow: false,
    reflection: false,
    sweeps: [],
    sparkles: null,
    shots: [],
    relief: 0,
    scenes: [
      {
        start: 0,
        image: scene.uri,
        mode: "photo",
        keys: [zoom(0, 1), zoom(d, 1.08)],
        transition: { kind: "cut", duration: 0 },
        shade: scene.shade ?? 0.2,
      },
    ],
  };
}

/** The seller's beat choice: a pattern, "off", or null (the default). */
export type MusicChoice = PatternId | "off" | null;

/** The pattern to play: recipes start with "pulse" (Ritim 1), templates with none. */
export function resolveMusicPattern(
  choice: MusicChoice,
  recipe: boolean,
): PatternId | null {
  if (choice === "off") return null;
  if (choice) return choice;
  return recipe ? "pulse" : null;
}

/**
 * One video of "Hepsini çıkar". In recipe mode the 9:16 video is the recipe
 * itself (`recipe: true`, kept with its variant). 4:5 and 1:1 stay renders of
 * the classic template: they are made from and saved with `saved`, which has
 * no `variant` (Düzenle reopens them with the classic templates) and keeps
 * the beat the seller heard (a recipe's default is Ritim 1).
 */
export function exportAllStep(
  state: EditState,
  ratio: AspectRatio,
  recipe: boolean,
): { recipe: boolean; saved: EditState } {
  if (!recipe) return { recipe: false, saved: { ...state, ratio } };
  if (ratio === "9:16") return { recipe: true, saved: { ...state, ratio } };
  const saved: EditState = {
    ...state,
    ratio,
    musicPattern: state.musicPattern ?? resolveMusicPattern(null, true) ?? "off",
  };
  delete saved.variant;
  return { recipe: false, saved };
}

/** How long an added photo's cut-out may take before it is given up. */
export const EXTRA_CUTOUT_TIMEOUT_MS = 60_000;

/**
 * `job`'s value, or null when it takes longer than `ms`. A value that comes
 * after the wait was given up goes to `onLate` (to delete its file); a late
 * failure is ignored.
 */
export function withTimeout<T>(
  job: Promise<T>,
  ms: number,
  onLate?: (value: T) => void,
): Promise<T | null> {
  return new Promise<T | null>((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      done = true;
      resolve(null);
    }, ms);
    job.then(
      (value) => {
        if (done) return onLate?.(value);
        done = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
