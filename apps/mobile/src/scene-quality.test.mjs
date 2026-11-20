// Run with: node --test apps/mobile/src/*.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { SCENE_QUALITY_DEFAULTS, withSceneQuality } from "./scene-quality.ts";

test("defaults fill missing fields and keep others", () => {
  const out = withSceneQuality({ grain: 0.2 });
  assert.equal(out.grain, 0.2);
  assert.equal(out.edge, SCENE_QUALITY_DEFAULTS.edge);
  assert.equal(out.reflectionStrength, 1);
  assert.equal(withSceneQuality().edge, 1);
});

test("values are clamped and garbage falls back", () => {
  const out = withSceneQuality({ edge: 4, reflectionStrength: Number.NaN });
  assert.equal(out.edge, 1);
  assert.equal(out.reflectionStrength, 1);
  assert.equal(withSceneQuality({ edge: -1 }).edge, 0);
});
