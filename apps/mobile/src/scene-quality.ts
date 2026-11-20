// Optional product-render quality fields (Batch 2). Defaults live here so the
// templates file does not change; the native engine (KareviaProductModule.swift)
// applies the same defaults when a field is missing, so older JS keeps working.

export type SceneQuality = {
  /** 0...1 cut-out edge refinement (erode + feather); 0 turns it off. */
  edge: number;
  /** 0...1 floor reflection strength when `reflection` is on. */
  reflectionStrength: number;
};

export const SCENE_QUALITY_DEFAULTS: SceneQuality = { edge: 1, reflectionStrength: 1 };

const unit = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback;

/** Fills and clamps the quality fields of a look object; unknown keys pass through. */
export function withSceneQuality<T extends object>(look?: T & Partial<SceneQuality>): T & SceneQuality {
  const base = (look ?? {}) as T & Partial<SceneQuality>;
  return {
    ...base,
    edge: unit(base.edge, SCENE_QUALITY_DEFAULTS.edge),
    reflectionStrength: unit(base.reflectionStrength, SCENE_QUALITY_DEFAULTS.reflectionStrength),
  };
}
