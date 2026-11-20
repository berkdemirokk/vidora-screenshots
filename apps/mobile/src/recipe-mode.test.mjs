// Run with: node --test apps/mobile/src/*.test.mjs
// Final wave (2026-11-20): recipe mode keeps the real product after the
// opening, carries the watermark, locks 9:16, exports all shapes correctly,
// and the release config is set for the December build.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { specProblems } from "./product-templates.ts";
import { buildRecipeSpec } from "./recipes/build.ts";
import { VARIANTS } from "./recipes/index.ts";
import { recipeSources } from "./editor-media.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const AI = "file:///cache/vidora-ai-scene-9.jpg";

const editorPhotos = (n) =>
  Array.from({ length: n }, (_, i) => ({
    source: `file:///cache/picked-${i}.jpg`,
    cutout: { uri: `file:///cache/vidora-cutout-${i}.png` },
  }));
const input = (n, palette, extra = {}) => ({
  ...recipeSources(editorPhotos(n), AI),
  name: "Keten gömlek",
  price: "499 TL",
  oldPrice: "699 TL",
  badge: "YENİ",
  cta: "Hemen al",
  palette,
  ratio: "9:16",
  quality: "720p",
  ...extra,
});

test("an AI opening shows only in scene 0; every other scene uses the real photos", () => {
  for (const v of VARIANTS)
    for (const n of [1, 3]) {
      const tag = `${v.id} (${n} photos)`;
      const spec = buildRecipeSpec(v.recipe, input(n, v.palette));
      assert.equal(spec.scenes[0].image, AI, tag + " opening");
      assert.equal(spec.scenes[0].mode, "photo", tag + " full frame");
      const later = spec.scenes.slice(1);
      assert.ok(later.length > 0, tag + " has more scenes");
      assert.ok(later.every((s) => s.image !== AI), tag + " AI only in scene 0");
      // Later scenes use the seller's photos or their cut-outs.
      assert.ok(
        later.every((s) => /picked-\d|vidora-cutout-\d/.test(s.image)),
        tag + " real photos",
      );
      assert.deepEqual(specProblems(spec), [], tag);
    }
  // Without an AI picture nothing changes: scene 0 is a real photo too.
  const v = VARIANTS[0];
  const plain = buildRecipeSpec(v.recipe, { ...input(1, v.palette), opening: null });
  assert.ok(plain.scenes.every((s) => s.image !== AI));
});

test("recipe specs carry the watermark exactly like the classic path", () => {
  const v = VARIANTS[0];
  assert.equal(buildRecipeSpec(v.recipe, input(1, v.palette, { watermark: true })).watermark, true);
  assert.equal(buildRecipeSpec(v.recipe, input(1, v.palette, { watermark: false })).watermark, false);
  assert.equal(buildRecipeSpec(v.recipe, input(1, v.palette)).watermark, false);
  const src = read("../app/create.tsx");
  const memo = src.slice(src.indexOf("const spec = useMemo("), src.indexOf("const specDuration"));
  const recipePart = memo.slice(memo.indexOf("buildRecipeSpec("), memo.indexOf("guardAiScene("));
  assert.match(recipePart, /watermark: !isPro/);
});

test("create.tsx: Hepsini çıkar renders the recipe at 9:16 with its beat", () => {
  const src = read("../app/create.tsx");
  const all = src.slice(src.indexOf("const exportAll = () =>"), src.indexOf("const exportAllLatest"));
  assert.match(all, /recipeSpec = isRecipe \? spec : null/);
  assert.match(all, /const plan = exportAllStep\(state, step\.ratio, !!recipeSpec\)/);
  assert.match(all, /plan\.recipe && recipeSpec\s*\? await withBeat\(\{/);
  assert.match(all, /specFromState\(plan\.saved, cutoutUri/);
  assert.match(all, /saveEdit\(clip\.id, plan\.saved, cutoutUri\)/);
  assert.doesNotMatch(all, /\{ \.\.\.state, ratio: step\.ratio \}/);
});

test("create.tsx: recipe mode locks 9:16 and hides the shape chips", () => {
  const src = read("../app/create.tsx");
  assert.match(src, /const shownRatio: AspectRatio = isRecipe \? "9:16" : ratio;/);
  assert.match(src, /const aspect = aspectOf\(shownRatio\)/);
  assert.match(src, /ratio: shownRatio,/);
  assert.match(src, /ratioLocked=\{isRecipe\}/);
  assert.match(src, /ratio=\{shownRatio\}/);
  const exp = read("./editor-export.tsx");
  assert.match(exp, /\{ratioLocked \? \(/);
  assert.match(exp, /testID="ratio-locked"/);
});

test("single flow: a category chooser in Çıktı, shared with the Şablon panel", () => {
  const src = read("../app/create.tsx");
  const panel = src.slice(src.indexOf("<ExportPanel"), src.indexOf("<ExportPanel") + 900);
  assert.match(panel, /<CategoryMenu\s+category=\{category\}\s+onCategory=\{chooseCategory\}/);
  const panels = read("./studio/panels.tsx");
  assert.match(panels, /export function CategoryMenu\(/);
  assert.match(panels, /<CategoryMenu\s+category=\{category\}\s+onCategory=\{onCategory\}/);
  // The category still reaches AI Sahne (Manken styles) and is in drafts.
  assert.match(src, /params: \{\s*cutout: cutout\.uri,[\s\S]{0,120}category,/);
  assert.match(src, /setCategory\(state\.category\)/);
});

test("Arka plan: recipes show only the AI scene; classic picks never drop a scene silently", () => {
  const src = read("../app/create.tsx");
  assert.match(src, /tool === "color" && isRecipe && \(/);
  assert.match(src, /tool === "color" && !isRecipe && \(\s*<BackgroundPanel/);
  assert.match(src, /scene=\{aiSceneButtons\}/);
  const pick = src.slice(src.indexOf("function pickBackdrop("), src.indexOf("function selectOwn("));
  assert.ok(pick.indexOf("if (scene)") < pick.indexOf("setScene(null)"));
  assert.match(pick, /Yapay zekâ sahnesi kaldırıldı, seçtiğin zemin kullanılıyor\./);
  const own = src.slice(src.indexOf("function selectOwn("), src.indexOf("function removeOwn("));
  assert.match(own, /noteOwnOverScene\(\);/);
});

test("minors: recipe file name, photo strip limits, poster key from the binary", () => {
  const src = read("../app/create.tsx");
  assert.match(src, /recipeUsed\?\.variant \?\? recipeUsed\?\.recipe \?\? templateById\(template\)/);
  assert.match(src, /photosLeft\(1 \+ extrasNow\.current\.length, photoLimits\.max\)/);
  assert.match(src, /1 \+ extras\.length <= photoLimits\.min/);
  assert.match(src, /min=\{photoLimits\.min\}\s+max=\{photoLimits\.max\}/);
  const strip = read("./studio/photo-strip.tsx");
  assert.match(strip, /const canRemove = photos\.length > min;/);
  assert.match(strip, /index > 0 && canRemove &&/);
  const posters = read("./gallery-posters.ts");
  assert.match(posters, /Constants\.platform\?\.ios\?\.buildNumber \?\?/);
});

test("release: version 1.2.0 and an iOS 26 SDK image for store and preview builds", () => {
  const app = JSON.parse(read("../app.json"));
  assert.equal(app.expo.version, "1.2.0");
  assert.equal(app.expo.runtimeVersion.policy, "appVersion");
  const eas = JSON.parse(read("../eas.json"));
  assert.equal(eas.build.production.ios.image, "latest");
  assert.equal(eas.build.preview.ios.image, "latest");
});
