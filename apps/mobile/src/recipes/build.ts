import {
  LIMITS,
  MAX_SCENES,
  buildSpec,
  paletteById,
  type ProductKey,
  type ProductScene,
  type ProductText,
  type ProductVideoSpec,
} from "../product-templates.ts";
import type {
  RecipeInput,
  RecipeText,
  TemplateRecipe,
} from "./types.ts";

export type {
  RecipeInput,
  RecipeScene,
  RecipeText,
  TemplateRecipe,
} from "./types.ts";

/** The native side allows 30 s; recipes stay short. */
export const RECIPE_MAX_DURATION = 15;

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Scene start times in seconds for scene lengths given in beats. */
export function beatTimes(bpm: number, lengths: number[]): number[] {
  const beat = 60 / bpm;
  const out: number[] = [];
  let beats = 0;
  for (const len of lengths) {
    out.push(round3(beats * beat));
    beats += len;
  }
  return out;
}

export function buildRecipeSpec(
  recipe: TemplateRecipe,
  input: RecipeInput,
): ProductVideoSpec {
  if (input.photos.length < 1) throw new Error("recipe needs a photo");
  const recipeScenes = recipe.scenes.slice(0, MAX_SCENES);
  const beat = 60 / recipe.bpm;
  const starts = beatTimes(
    recipe.bpm,
    recipeScenes.map((s) => s.length),
  );
  const last = recipeScenes.length - 1;
  const natural = round3(starts[last] + recipeScenes[last].length * beat + recipe.endHold);
  const duration = Math.min(
    RECIPE_MAX_DURATION,
    Math.max(LIMITS.minDuration, natural),
  );

  // A scene needs room to be seen; ones starting too late are dropped.
  const kept = recipeScenes
    .map((rs, i) => ({ rs, start: starts[i] }))
    .filter(({ start }) => start < duration - 0.2);
  const scenes: ProductScene[] = kept.map(({ rs, start }, i) => {
    const n = input.photos.length;
    const photo = input.photos[rs.slot % n];
    const cutout = input.cutouts[rs.slot % n] ?? null;
    const mode = rs.mode === "cutout" && cutout ? "cutout" : "photo";
    const end = i + 1 < kept.length ? kept[i + 1].start : duration;
    const length = round3(end - start);
    const scene: ProductScene = {
      start,
      image: mode === "cutout" ? (cutout as string) : photo,
      mode,
      keys: rs.keys.map((k) => ({ ...k, t: Math.min(k.t, length) })),
      transition:
        i === 0
          ? { kind: "cut", duration: 0 }
          : {
              kind: rs.transition.kind,
              duration: Math.max(0, Math.min(rs.transition.duration, length, 1.5)),
            },
    };
    if (rs.shots) scene.shots = rs.shots.filter((s) => s.t < length);
    if (rs.shade !== undefined) scene.shade = rs.shade;
    return scene;
  });

  const base = buildSpec({
    template: "campaign",
    palette: input.palette,
    product: scenes[0].image,
    headline: input.name || " ",
    price: "",
    badge: "",
    cta: "",
    quality: input.quality,
    watermark: false,
    music: null,
    ratio: input.ratio,
  });
  const rest = base.keys[base.keys.length - 1];
  const hold = (t: number): ProductKey => ({ ...rest, t, ease: "linear" });

  const palette = paletteById(input.palette);
  const value: Record<RecipeText["field"], string> = {
    name: input.name,
    price: input.price,
    oldPrice: input.oldPrice,
    badge: input.badge,
    cta: input.cta,
  };
  const texts: ProductText[] = [];
  for (const rt of recipe.texts) {
    const text = value[rt.field].trim().slice(0, LIMITS.maxTextLength);
    const start = Math.max(0, rt.start);
    const end = Math.min(duration, rt.end);
    if (!text || start >= end) continue;
    texts.push({
      text,
      start,
      end,
      y: rt.y,
      size: rt.size,
      ...rt.style,
      color: rt.onAccent ? palette.onAccent : palette.ink,
      fill: rt.onAccent ? palette.accent : "",
    });
  }

  return {
    product: scenes[0].image,
    quality: base.quality,
    duration,
    fps: 30,
    bitrate: base.bitrate,
    background: base.background,
    camera: { zoomFrom: 1, zoomTo: 1 },
    keys: [hold(0), hold(duration)],
    shadow: base.shadow,
    reflection: false,
    sweeps: [],
    sparkles: null,
    texts: texts.slice(0, LIMITS.maxTexts),
    watermark: false,
    music: null,
    relief: 0,
    ratio: input.ratio,
    shots: [],
    scenes,
    look: base.look,
  };
}
