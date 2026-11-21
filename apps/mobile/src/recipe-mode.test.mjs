// Run with: node --test apps/mobile/src/*.test.mjs
// Final wave (2026-11-20): recipe mode keeps the real product after the
// opening, carries the watermark, locks 9:16, exports all shapes correctly,
// and the release config is set for the December build.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { specProblems } from "./product-templates.ts";
import { buildRecipeSpec } from "./recipes/build.ts";
import { RECIPES, VARIANTS, usedTextFields } from "./recipes/index.ts";
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
  const memo = src.slice(src.indexOf("const spec = useMemo("), src.indexOf("function modeSpec("));
  assert.match(memo, /modeSpec\(shownRatio, effectiveQuality, !isPro\)/);
  const mode = src.slice(src.indexOf("function modeSpec("), src.indexOf("const specDuration"));
  const recipePart = mode.slice(mode.indexOf("buildRecipeSpec("));
  assert.match(recipePart, /watermark,/);
  assert.match(recipePart, /ratio: shape,/);
  assert.match(mode.slice(0, mode.indexOf("buildRecipeSpec(")), /buildEditorialSpec\(\s*\{[\s\S]*watermark,[\s\S]*ratio: shape,/);
});

test("create.tsx: Hepsini çıkar renders recipes and the editorial video in all 3 shapes with their beat", () => {
  const src = read("../app/create.tsx");
  const all = src.slice(src.indexOf("const exportAll = () =>"), src.indexOf("const exportAllLatest"));
  assert.match(all, /shapeSpec = isRecipe \|\| editorial \? modeSpec : null/);
  assert.match(all, /const plan = exportAllStep\(state, step\.ratio, !!shapeSpec\)/);
  assert.match(all, /videoQuality = deviceQuality\("1080p", memoryBytes\)/);
  assert.match(all, /shapeSpec\?\.\(step\.ratio, videoQuality, !isPro\)/);
  assert.match(all, /quality: videoQuality,/);
  assert.match(all, /\? await withBeat\(built\)/);
  assert.match(all, /specFromState\(plan\.saved, cutoutUri/);
  assert.match(all, /saveEdit\(clip\.id, \{ \.\.\.plan\.saved, quality: videoQuality \}, cutoutUri\)/);
  assert.doesNotMatch(all, /\{ \.\.\.state, ratio: step\.ratio \}/);
  // The buttons are back in editorial mode; stills come from the same builder.
  assert.match(src, /onStill=\{canSaveImage \? pressStillStyle : undefined\}/);
  assert.match(src, /onExportAll=\{canSaveImage \? pressExportAll : undefined\}/);
  const still = src.slice(src.indexOf("async function saveStillStyle("), src.indexOf("const stillStyle = "));
  assert.match(still, /const made = modeSpec\(style\.ratio as AspectRatio, "1080p", false\);/);
  assert.ok(still.indexOf("modeSpec(") < still.indexOf("buildSpec("), "recipes before the classic still");
});

test("create.tsx: recipe mode opens at 9:16, locks the shape and hides the shape chips", () => {
  const src = read("../app/create.tsx");
  // A 4:5 / 1:1 export reopens (Düzenle) in its shape; new recipes start at 9:16.
  assert.match(src, /const shownRatio: AspectRatio = ratio;/);
  assert.match(src, /if \(params\.variant && variantById\(params\.variant\)\) setRatio\("9:16"\);/);
  assert.match(src.slice(src.indexOf("function returnToRecipe("), src.indexOf("const backVariant")), /setRatio\("9:16"\)/);
  assert.match(src, /const aspect = aspectOf\(shownRatio\)/);
  assert.match(src, /ratio: shownRatio,/);
  assert.match(src, /ratioLocked=\{isRecipe \|\| editorial\}/);
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
  assert.match(src, /tool === "color" && !editorial && isRecipe && \(/);
  assert.match(src, /tool === "color" && !editorial && !isRecipe && \(\s*<BackgroundPanel/);
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

test("Hepsini çıkar shapes: every variant builds its own 4:5 and 1:1 layout with the AI opening", () => {
  for (const ratio of ["4:5", "1:1"])
    for (const v of VARIANTS) {
      const tag = `${v.id} ${ratio}`;
      const tall = buildRecipeSpec(v.recipe, input(3, v.palette));
      const spec = buildRecipeSpec(v.recipe, input(3, v.palette, { ratio }));
      assert.equal(spec.ratio, ratio, tag);
      assert.deepEqual(specProblems(spec), [], tag);
      // Same scenes and images; only positions, sizes and zoom differ.
      assert.deepEqual(
        spec.scenes.map((s) => [s.start, s.image, s.mode]),
        tall.scenes.map((s) => [s.start, s.image, s.mode]),
        tag,
      );
      assert.equal(spec.scenes[0].image, AI, tag + " opening");
      assert.deepEqual(spec.texts.map((t) => t.text), tall.texts.map((t) => t.text), tag);
      assert.notDeepEqual(spec.texts.map((t) => [t.y, t.size]), tall.texts.map((t) => [t.y, t.size]), tag + " re-laid");
      assert.equal(spec.watermark, tall.watermark, tag);
    }
});
// MARK: gaps-ui

test("Metin: editorial shows name and price, a recipe the fields its texts use, classic all", () => {
  assert.deepEqual(usedTextFields(null, true), ["name", "price"]);
  assert.deepEqual(usedTextFields(RECIPES[0], true), ["name", "price"]);
  assert.equal(usedTextFields(null, false), null);
  for (const r of RECIPES) {
    const fields = usedTextFields(r, false);
    assert.deepEqual(new Set(fields), new Set(r.texts.map((t) => t.field)), r.id);
    assert.equal(fields.length, new Set(fields).size, r.id + " no repeats");
  }
  const kombin = RECIPES.find((r) => r.id === "kombin");
  // Kombin has no old price, so Metin hides that field.
  assert.ok(!usedTextFields(kombin, false).includes("oldPrice"));
  const src = read("../app/create.tsx");
  assert.match(src, /usedTextFields\(\s*isRecipe \? recipeUsed\?\.recipe : null,\s*editorial,?\s*\)/);
  assert.match(src, /shown=\{textFields\}/);
  assert.match(src, /editorial \? undefined : \(\s*<CampaignStrip/);
  assert.match(src, /badges=\{!textFields \|\| textFields\.includes\("badge"\)\}/);
  assert.match(src, /priceTags=\{!textFields\}/);
  const panels = read("./studio/panels.tsx");
  assert.match(panels, /shown=\{shown\}/);
  for (const id of ["name", "price", "oldPrice", "badge", "cta"])
    assert.ok(panels.includes(`{on("${id}") && cell(`), id);
  const strip = read("./campaign-strip.tsx");
  assert.match(strip, /\{badges && \(/);
  assert.match(strip, /\{priceTags && \(/);
});

test("dropped texts: recipes and the editorial video show one quiet line", () => {
  const src = read("../app/create.tsx");
  const note = src.slice(src.indexOf("const droppedNote ="), src.indexOf("const droppedNote =") + 600);
  assert.match(note, /isRecipe \|\| editorial\s*\? t\(\s*"Bazı yazılar sığmadığı için videoya eklenmedi\."/);
  assert.match(src, /droppedNote=\{droppedNote\}/);
});

test("editorial: the category is asked once before the first shots; Yeniden çek keeps it", () => {
  const src = read("../app/create.tsx");
  const effect = src.slice(src.indexOf("const shotsAsked = useRef(false);"), src.indexOf("const colors = paletteById"));
  assert.ok(effect.indexOf("askShotCategory.current = true;") < effect.indexOf("shootLatest.current();"));
  const shoot = src.slice(src.indexOf("function shoot() {"), src.indexOf("function makeShots("));
  // Pro first, then the sheet (last used category preselected), then the shots.
  assert.ok(shoot.indexOf('showPaywall("shots")') < shoot.indexOf("if (askShotCategory.current)"));
  // After a purchase the sheet waits for the paywall to finish closing (I1).
  assert.match(shoot, /offerAfterPurchase\(\(\) => setTimeout\(\(\) => shootLatest\.current\(\), 700\)\)/);
  assert.match(shoot, /loadLastCategory\(CATEGORIES\.map\(\(item\) => item\.id\)\)/);
  assert.match(shoot, /openCategorySheet\(\s*t,\s*last \?\? category,/);
  assert.match(shoot, /askShotCategory\.current = false;/);
  assert.match(shoot, /makeShots\(picked\);/);
  assert.match(shoot, /makeShots\(category\);\s*\}\s*\/\*\*/);
  const make = src.slice(src.indexOf("function makeShots("), src.indexOf("const shootLatest = useRef(shoot);"));
  assert.match(make, /generateShots\(\{\s*product,\s*category: shotCategory,\s*count,/);
  // Consent before the busy line: "1/3" shows only once requests start (M6).
  const consentAt = make.indexOf("askConsent()");
  assert.ok(consentAt > 0 && consentAt < make.indexOf("run(shotsLabel(1)"));
  // The known allowance caps the request; none left: the quota note, no request.
  assert.match(make, /const count = shotsToRequest\(quota\);/);
  assert.ok(make.indexOf("if (count === 0)") < make.indexOf("generateShots("));
  assert.match(make, /if \(count < 3\) setMessage\(fewShotsNote\(t, count\)\);/);
  assert.match(src, /void saveLastCategory\(id\);/);
  const panels = read("./studio/panels.tsx");
  assert.match(panels, /export function openCategorySheet\(/);
  assert.match(panels, /shots \? t\("Devam et", "Continue"\) : t\("Vazgeç", "Cancel"\)/);
});

test("quality: Pro videos follow the phone's memory (deviceQuality)", () => {
  const src = read("../app/create.tsx");
  assert.match(src, /const \[memoryBytes\] = useState\(deviceMemoryBytes\);/);
  assert.match(src, /SINGLE_FLOW\s*\? deviceQuality\("1080p", memoryBytes\)/);
  assert.match(src, /: deviceQuality\(presetQuality\(preset\), memoryBytes\)\);/);
});
