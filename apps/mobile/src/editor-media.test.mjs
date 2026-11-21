// Run with: node --test apps/mobile/src/*.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildSpec, specProblems } from "./product-templates.ts";
import { buildRecipeSpec } from "./recipes/build.ts";
import { YENI_KOLEKSIYON } from "./recipes/yeni-koleksiyon.ts";
import {
  MAX_PHOTOS,
  capPhotos,
  exportAllStep,
  guardAiScene,
  photoRange,
  photosLeft,
  recipeSources,
  resolveMusicPattern,
  shownProductScene,
  withTimeout,
} from "./editor-media.ts";

const CUT = "file:///cache/vidora-cutout-1.png";
const PHOTO = "file:///cache/picked-1.jpg";
const AI = {
  uri: "file:///cache/vidora-ai-scene-1.jpg",
  crop: { x: 0, width: 1 },
  productRect: { x: 0.2, y: 0.3, width: 0.6, height: 0.5 },
  containsProduct: true,
};
const base = (scene) =>
  buildSpec({
    template: "campaign",
    palette: "ivory",
    product: CUT,
    productSize: { width: 800, height: 1000 },
    headline: "Keten gömlek",
    price: "499 TL",
    badge: "",
    cta: "Hemen al",
    quality: "720p",
    watermark: false,
    music: null,
    scene,
  });

test("an AI scene with containsProduct never gets a cut-out product overlay", () => {
  const plain = base(AI);
  const spec = guardAiScene(plain, AI);
  assert.equal(spec.scenes.length, 1, "one full-frame scene");
  assert.ok(spec.scenes.every((s) => s.mode === "photo"));
  assert.ok(spec.scenes.every((s) => s.image === AI.uri));
  assert.notEqual(spec.product, CUT, "the cut-out is not the drawn product");
  assert.ok(!JSON.stringify(spec.scenes).includes(CUT));
  assert.deepEqual(spec.texts, plain.texts, "the template's texts stay");
  assert.deepEqual(specProblems(spec), []);

  // A background-only scene (older drafts) keeps the product over it.
  const old = { ...AI, containsProduct: undefined };
  const kept = base(old);
  assert.equal(guardAiScene(kept, old), kept);
  assert.equal(kept.scenes, undefined);

  // Recipes: the AI picture is the opening scene only, without a cut-out.
  for (const photos of [
    [{ source: PHOTO, cutout: { uri: CUT } }],
    [
      { source: PHOTO, cutout: { uri: CUT } },
      { source: "file:///cache/picked-2.jpg", cutout: { uri: "file:///cache/vidora-cutout-2.png" } },
    ],
  ]) {
    const r = buildRecipeSpec(YENI_KOLEKSIYON, {
      ...recipeSources(photos, AI.uri),
      name: "Keten gömlek",
      price: "499 TL",
      oldPrice: "",
      badge: "",
      cta: "Hemen al",
      palette: "ivory",
      ratio: "9:16",
      quality: "720p",
    });
    assert.ok(r.scenes.every((s) => s.image !== AI.uri || s.mode === "photo"));
    assert.equal(r.scenes[0].image, AI.uri);
    assert.equal(r.scenes[0].mode, "photo");
    assert.ok(r.scenes.slice(1).every((s) => s.image !== AI.uri), "AI only in scene 0");
    assert.deepEqual(specProblems(r), []);
  }
});

test("recipe sources keep the AI picture out of the photos", () => {
  const photos = [{ source: PHOTO, cutout: { uri: CUT } }];
  const src = recipeSources(photos, AI.uri);
  assert.deepEqual(src.photos, [PHOTO]);
  assert.deepEqual(src.cutouts, [CUT]);
  assert.deepEqual(src.opening, { uri: AI.uri });
  assert.equal(recipeSources(photos, null).opening, null);
});

test("photo range: a recipe's own min and max, else 1 to 8", () => {
  assert.deepEqual(photoRange(null), { min: 1, max: MAX_PHOTOS });
  assert.deepEqual(photoRange({ minPhotos: 2, maxPhotos: 2 }), { min: 2, max: 2 });
  assert.deepEqual(photoRange({ minPhotos: 1, maxPhotos: 3 }), { min: 1, max: 3 });
  assert.deepEqual(photoRange({ minPhotos: 0, maxPhotos: 20 }), { min: 1, max: 8 });
  assert.equal(photosLeft(1, 3), 2);
  assert.equal(photosLeft(3, 3), 0);
  assert.equal(photosLeft(5, 3), 0);
  assert.equal(photosLeft(1, 20), 7);
});

test("Hepsini çıkar: recipe and editorial videos are themselves in every shape, saved with their fields", () => {
  const state = { ratio: "9:16", variant: "indirim-1", headline: "Gömlek" };
  // Classic drafts: every shape classic, state as it was.
  for (const ratio of ["9:16", "4:5", "1:1"]) {
    const plan = exportAllStep({ ...state, variant: undefined }, ratio, false);
    assert.equal(plan.recipe, false);
    assert.equal(plan.saved.ratio, ratio);
  }
  const shots = ["file:///a1.jpg", null, "file:///a3.jpg"];
  for (const ratio of ["9:16", "4:5", "1:1"]) {
    const plan = exportAllStep(state, ratio, true);
    assert.equal(plan.recipe, true, ratio);
    assert.equal(plan.saved.ratio, ratio);
    assert.equal(plan.saved.variant, "indirim-1", "Düzenle reopens the recipe");
    assert.ok(!("musicPattern" in plan.saved), "the recipe's own beat stays the default");
    const ed = exportAllStep({ ratio: "9:16", editorial: true, aiShots: shots }, ratio, true);
    assert.equal(ed.saved.editorial, true, "Düzenle reopens the editorial video");
    assert.deepEqual(ed.saved.aiShots, shots);
    assert.equal(ed.saved.ratio, ratio);
  }
  assert.equal(state.ratio, "9:16", "the editor's state is not changed");
});

test("the AI scene counts only while it is the background", () => {
  assert.equal(shownProductScene(AI, { ownActive: false, backdrop: null }), AI);
  assert.equal(shownProductScene(AI, { ownActive: true, backdrop: null }), null);
  assert.equal(shownProductScene(AI, { ownActive: false, backdrop: "oak" }), null);
  assert.equal(
    shownProductScene({ ...AI, containsProduct: false }, { ownActive: false, backdrop: null }),
    null,
  );
});

test("recipe sources pass every photo and its cut-out (or null)", () => {
  const photos = Array.from({ length: 10 }, (_, i) => ({
    source: `file:///p${i}.jpg`,
    cutout: i % 2 ? null : { uri: `file:///c${i}.png` },
  }));
  const src = recipeSources(photos, null);
  assert.equal(src.photos.length, MAX_PHOTOS);
  assert.deepEqual(src.cutouts.slice(0, 3), ["file:///c0.png", null, "file:///c2.png"]);
  assert.equal(capPhotos(photos).length, 8);
  assert.equal(photosLeft(3), 5);
  assert.equal(photosLeft(12), 0);
});

test("beat music: recipes start on Ritim 1, templates stay silent", () => {
  assert.equal(resolveMusicPattern(null, true), "pulse");
  assert.equal(resolveMusicPattern(null, false), null);
  assert.equal(resolveMusicPattern("off", true), null);
  assert.equal(resolveMusicPattern("pop", false), "pop");
});

test("create.tsx guards every spec it builds from an AI scene", () => {
  const src = readFileSync(new URL("../app/create.tsx", import.meta.url), "utf8");
  // Main spec, last frame and still styles all go through the guard.
  assert.ok((src.match(/guardAiScene\(/g) ?? []).length >= 3);
  assert.match(src, /recipeSources\(recipePhotos, aiScene\?\.uri \?\? null\)/);
  const exp = readFileSync(new URL("./editor-export.tsx", import.meta.url), "utf8");
  assert.match(exp, /guardAiScene\(/);
  const cloud = readFileSync(new URL("./cloud.ts", import.meta.url), "utf8");
  assert.match(cloud, /containsProduct\?: boolean/);
  const studio = readFileSync(new URL("../app/ai-studio.tsx", import.meta.url), "utf8");
  assert.match(studio, /containsProduct: true/);
});

test("withTimeout gives null after the wait and hands a late value over", async () => {
  assert.equal(await withTimeout(Promise.resolve(5), 50), 5);
  let late = null;
  let finish;
  const slow = new Promise((resolve) => (finish = resolve));
  assert.equal(await withTimeout(slow, 10, (v) => (late = v)), null);
  finish("file:///cache/vidora-cutout-late.png");
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(late, "file:///cache/vidora-cutout-late.png");
  await assert.rejects(withTimeout(Promise.reject(new Error("x")), 50));
});

test("create.tsx makes the beat when it renders, not from the preview cache", () => {
  const src = readFileSync(new URL("../app/create.tsx", import.meta.url), "utf8");
  // The video render awaits the beat file itself.
  assert.match(src, /renderProductVideo\(\s*await withBeat\(spec\)/);
  assert.match(src, /await musicFile\(beatPattern, BEAT_BPM, made\.duration\)/);
  // The memo spec never carries the cached beat.
  const memo = src.slice(src.indexOf("const spec = useMemo("), src.indexOf("const specDuration"));
  assert.doesNotMatch(memo, /beatFile|beatPattern/);
  assert.match(memo, /recipePhotos,/);
  // Extra cut-outs: only for recipes, with a time limit and the whole-photo check.
  assert.match(src, /if \(!cutout \|\| !isRecipe \|\| busy/);
  assert.match(src, /withTimeout\(job, EXTRA_CUTOUT_TIMEOUT_MS/);
  assert.match(src, /isWholePhotoCutout\(made, size\)/);
  assert.match(src, /list\.filter\(\(p\) => p !== gone\)/);
  // The strip shows only for recipes; no spinner where the queue never runs.
  // Classic templates get only the way back to a recipe left there.
  assert.match(src, /header=\{isRecipe \? photoStrip : recipeReturn\}/);
  assert.match(src, /headerHeight=\{\s*isRecipe\s*\? photoStripHeight\(/);
  assert.match(src, /pending: isRecipe && !p\.cutout && !p\.tried/);
  assert.doesNotMatch(src, /header=\{photoStrip\}/);
});
