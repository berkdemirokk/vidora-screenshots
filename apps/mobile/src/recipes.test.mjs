import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import { beatTimes, buildRecipeSpec } from "./recipes/build.ts";
import { specProblems } from "./product-templates.ts";
import { YENI_KOLEKSIYON } from "./recipes/yeni-koleksiyon.ts";

const key = (t, scale = 1) => ({
  t,
  x: 0.5,
  y: 0.5,
  scale,
  rotation: 0,
  opacity: 1,
  yaw: 0,
  ease: "inOut",
});

const mkScene = (slot, over = {}) => ({
  slot,
  mode: "photo",
  length: 4,
  keys: [key(0, 1), key(2, 1.2)],
  transition: { kind: "push", duration: 0.4 },
  ...over,
});

const style = { weight: "heavy", animation: "rise" };

const mkRecipe = (over = {}) => ({
  id: "t",
  tr: "T",
  en: "T",
  minPhotos: 1,
  maxPhotos: 5,
  bpm: 120,
  scenes: [0, 1, 2].map((i) => mkScene(i)),
  texts: [
    { field: "name", start: 0.2, end: 3, y: 0.2, size: 0.07, style },
    { field: "price", start: 0.5, end: 5, y: 0.8, size: 0.08, style, onAccent: true },
    { field: "oldPrice", start: 0.5, end: 5, y: 0.7, size: 0.05, style: { ...style, strike: true } },
  ],
  endHold: 1,
  ...over,
});

const mkInput = (over = {}) => ({
  photos: ["file:///p0.jpg", "file:///p1.jpg", "file:///p2.jpg"],
  cutouts: ["file:///c0.png", "file:///c1.png", "file:///c2.png"],
  name: "Amber",
  price: "1.249 TL",
  oldPrice: "1.499 TL",
  badge: "",
  cta: "",
  palette: "ivory",
  ratio: "9:16",
  quality: "1080p",
  ...over,
});

test("beatTimes at 120 bpm", () => {
  assert.deepEqual(beatTimes(120, [2, 4, 3]), [0, 1, 3]);
});

test("fewer photos than slots repeat in order", () => {
  const recipe = mkRecipe({ scenes: [0, 1, 2, 3, 4].map((i) => mkScene(i, { length: 2 })) });
  const spec = buildRecipeSpec(
    recipe,
    mkInput({ photos: ["p0", "p1"], cutouts: [null, null] }),
  );
  assert.deepEqual(
    spec.scenes.map((s) => s.image),
    ["p0", "p1", "p0", "p1", "p0"],
  );
});

test("missing cutout falls back to photo", () => {
  const recipe = mkRecipe({
    scenes: [0, 1, 2].map((i) => mkScene(i, { mode: "cutout" })),
  });
  const spec = buildRecipeSpec(
    recipe,
    mkInput({ cutouts: ["file:///c0.png", null, "file:///c2.png"] }),
  );
  assert.equal(spec.scenes[0].mode, "cutout");
  assert.equal(spec.scenes[0].image, "file:///c0.png");
  assert.equal(spec.scenes[1].mode, "photo");
  assert.equal(spec.scenes[1].image, "file:///p1.jpg");
});

test("empty old price leaves no text", () => {
  const spec = buildRecipeSpec(mkRecipe(), mkInput({ oldPrice: "" }));
  assert.ok(!spec.texts.some((t) => t.text === "1.499 TL"));
  assert.equal(spec.texts.length, 2);
});

test("transition clamps to scene length", () => {
  const recipe = mkRecipe({
    bpm: 120,
    scenes: [
      mkScene(0, { length: 4 }),
      mkScene(1, { length: 1, transition: { kind: "wipe", duration: 1.2 } }),
      mkScene(2, { length: 4 }),
    ],
  });
  const spec = buildRecipeSpec(recipe, mkInput());
  assert.ok(spec.scenes[1].transition.duration <= 0.5);
});

test("built spec has no spec problems", () => {
  const spec = buildRecipeSpec(mkRecipe(), mkInput());
  assert.deepEqual(specProblems(spec), []);
  assert.equal(spec.relief, 0);
  assert.equal(spec.product, spec.scenes[0].image);
  assert.ok(spec.keys.length >= 2);
  const price = spec.texts.find((t) => t.text === "1.249 TL");
  assert.notEqual(price.fill, "");
  assert.deepEqual(specProblems(buildRecipeSpec(mkRecipe(), mkInput({ oldPrice: "" }))), []);
});

test("duration capped at 15 s", () => {
  const recipe = mkRecipe({
    bpm: 60,
    scenes: [0, 1, 2, 3, 4, 5].map((i) => mkScene(i, { length: 5 })),
    endHold: 2,
  });
  const spec = buildRecipeSpec(recipe, mkInput());
  assert.equal(spec.duration, 15);
  assert.ok(spec.scenes.every((s) => s.start < 15));
  assert.deepEqual(specProblems(spec), []);
});

test("yeni koleksiyon builds with one photo", () => {
  const spec = buildRecipeSpec(
    YENI_KOLEKSIYON,
    mkInput({
      photos: ["file:///p0.jpg"],
      cutouts: ["file:///c0.png"],
      badge: "Yeni",
      cta: "Hemen al",
    }),
  );
  assert.equal(spec.scenes.length, 5);
  assert.deepEqual(
    spec.scenes.map((s) => s.start),
    [0, 1, 3, 4.5, 6.5],
  );
  assert.ok(spec.scenes.every((s) => Math.abs(s.start * 2 - Math.round(s.start * 2)) < 1e-9));
  assert.deepEqual(specProblems(spec), []);
  // End card is still from 7.4 s: no key changes in the last 1.6 s.
  const last = spec.scenes[4];
  const stillFrom = 7.4 - last.start;
  assert.ok(last.keys.every((k) => k.t <= stillFrom + 1e-9));
  assert.equal(spec.duration, 9);
  assert.ok(spec.texts.every((t) => t.start <= 7.4));
  assert.ok(spec.texts.every((t) => t.y >= 0.14 && t.y <= 0.8));
});

test("create.tsx passes the source photo to the QA recipe", () => {
  const src = readFileSync(new URL("../app/create.tsx", import.meta.url), "utf8");
  assert.match(src, /photos: \[\s*sourcePhoto\?\.cutout === cutout\.uri \? sourcePhoto\.photo : cutout\.uri/);
  assert.match(src, /if \(QA_RECIPE\) setSourcePhoto\(\{ cutout: next\.uri, photo \}\)/);
  assert.match(src, /qaSamplePhotoUri\(\)/);
});
