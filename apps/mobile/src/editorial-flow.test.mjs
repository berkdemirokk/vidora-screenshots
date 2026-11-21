// Editorial video app flow (task 4 of docs/.superpowers editoryal): route,
// shot requests, failure note, bundled sample and the editor wiring.
// Run with: node --test apps/mobile/src/*.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  EDITORIAL_SAMPLE,
  editorialStart,
  fewShotsNote,
  mergeShots,
  shotsNote,
  shotsToRequest,
} from "./editorial-flow.ts";
import { requestShots } from "./cloud-net.ts";
import { CloudError, SHOT_STYLES, cloudErrorText } from "./cloud-rules.ts";
import { buildEditorialSpec } from "./recipes/editorial.ts";
import { specProblems } from "./product-templates.ts";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("editorial route: editorial=1 opens the editorial video and asks for shots", () => {
  assert.deepEqual(editorialStart({ editorial: "1", photos: "[]" }, false), {
    editorial: true,
    sample: false,
    shots: true,
  });
  // A plain new video, a gallery variant or a draft: not editorial.
  assert.equal(editorialStart({}, false).editorial, false);
  assert.equal(
    editorialStart({ variant: "indirim-1" }, false).editorial,
    false,
  );
  assert.equal(
    editorialStart({ editorial: "1", draft: "x" }, false).editorial,
    false,
    "a draft brings its own mode",
  );
  // The card's "Örnekle dene": the bundled sample, no cloud request.
  assert.deepEqual(editorialStart({ editorial: "1", sample: "1" }, false), {
    editorial: true,
    sample: true,
    shots: false,
  });
});

test("QA flag: the sample flow opens the bundled editorial sample", () => {
  assert.equal(editorialStart({ sample: "1" }, false).editorial, false);
  assert.deepEqual(editorialStart({ sample: "1" }, true), {
    editorial: true,
    sample: true,
    shots: false,
  });
  // A variant's sample stays that variant.
  assert.equal(
    editorialStart({ sample: "1", variant: "indirim-1" }, true).editorial,
    false,
  );
});

test("bundled sample: 6 files on disk, ai = lavender/hand/macro, photos = flatlay/spa/vanity", () => {
  assert.deepEqual(EDITORIAL_SAMPLE.ai, ["ref-lavanta", "hand", "macro"]);
  assert.deepEqual(EDITORIAL_SAMPLE.photos, ["flatlay", "ref-spa", "vanity"]);
  const src = read("./editorial-sample.ts");
  for (const name of [...EDITORIAL_SAMPLE.ai, ...EDITORIAL_SAMPLE.photos]) {
    assert.ok(
      fs.existsSync(
        new URL(`../assets/editorial/${name}.jpg`, import.meta.url),
      ),
      name,
    );
    assert.match(src, new RegExp(`assets/editorial/${name}\\.jpg`), name);
  }
  // The sample builds a clean editorial spec.
  const spec = buildEditorialSpec({
    ai: EDITORIAL_SAMPLE.ai.map((n) => `file:///a/${n}.jpg`),
    photos: EDITORIAL_SAMPLE.photos.map((n) => `file:///a/${n}.jpg`),
    cutouts: [null, null, null],
    name: "Lavanta Yağı",
    price: "349 TL",
    palette: "blush",
    music: null,
    watermark: false,
    quality: "720p",
  });
  assert.deepEqual(specProblems(spec), []);
});

test("shots: the 3 styles in order, 9:16, with the editor's category", async () => {
  const calls = [];
  const steps = [];
  const result = await requestShots(
    "food",
    async (fields, i) => {
      calls.push(fields);
      return `file:///cache/vidora-ai-scene-${i}.jpg`;
    },
    (i) => steps.push(i),
  );
  assert.deepEqual(SHOT_STYLES, ["shot-context", "shot-hand", "shot-macro"]);
  assert.deepEqual(calls, [
    { style: "shot-context", ratio: "9:16", category: "food" },
    { style: "shot-hand", ratio: "9:16", category: "food" },
    { style: "shot-macro", ratio: "9:16", category: "food" },
  ]);
  assert.deepEqual(steps, [0, 1, 2]);
  assert.equal(result.error, null);
  assert.deepEqual(
    result.ai,
    [0, 1, 2].map((i) => `file:///cache/vidora-ai-scene-${i}.jpg`),
  );
  // No category: the field is left out.
  const plain = [];
  await requestShots(null, async (fields) => {
    plain.push(fields);
    return "file:///x.jpg";
  });
  assert.deepEqual(plain[0], { style: "shot-context", ratio: "9:16" });
});

test("shots: a failure gives null shots, the Turkish error and the own-photos note", async () => {
  let calls = 0;
  const failed = await requestShots("cosmetics", async () => {
    calls++;
    throw new CloudError("quota-exceeded");
  });
  assert.equal(calls, 1, "stops at the first failure");
  assert.deepEqual(failed.ai, [null, null, null]);
  assert.equal(failed.error.code, "quota-exceeded");
  const tr = (a) => a,
    en = (_, b) => b;
  assert.equal(
    shotsNote(tr, failed.error.code, null, true),
    cloudErrorText("quota-exceeded").tr +
      " Videon kendi fotoğraflarınla hazırlanacak.",
  );
  assert.ok(
    shotsNote(en, "offline", null, true).endsWith(
      "Your video will be made from your own photos.",
    ),
  );
  // Some shots in use (a re-shoot): the error alone.
  assert.equal(
    shotsNote(tr, "offline", null, false),
    cloudErrorText("offline").tr,
  );
  // A non-cloud error (network stack, file write) is "failed".
  const odd = await requestShots(null, async () => {
    throw new Error("boom");
  });
  assert.equal(odd.error.code, "failed");
  // A later failure keeps the shots made before it (they used the quota).
  let n = 0;
  const partial = await requestShots(null, async () => {
    if (n++ === 1) throw new CloudError("offline");
    return "file:///shot.jpg";
  });
  assert.deepEqual(partial.ai, ["file:///shot.jpg", null, null]);
  assert.equal(partial.error.code, "offline");
});

test("shots: only the first `count` are asked for, the rest stay null", async () => {
  const styles = [];
  const steps = [];
  const two = await requestShots(
    null,
    async (fields, i) => {
      styles.push(fields.style);
      return `file:///s${i}.jpg`;
    },
    (i) => steps.push(i),
    2,
  );
  assert.deepEqual(styles, ["shot-context", "shot-hand"]);
  assert.deepEqual(steps, [0, 1]);
  assert.deepEqual(two.ai, ["file:///s0.jpg", "file:///s1.jpg", null]);
  assert.equal(two.error, null);
  const none = await requestShots(null, async () => assert.fail("no call"), undefined, 0);
  assert.deepEqual(none.ai, [null, null, null]);
});

test("trial allowance: ask for what is left today, ignore a stale count", () => {
  const now = Date.parse("2026-11-21T12:00:00Z");
  const quota = (used, limit, resetsAt = "2026-11-22T00:00:00Z") => ({
    plan: "pro",
    images: { used, limit },
    resetsAt,
  });
  assert.equal(shotsToRequest(null, now), 3, "unknown: all 3");
  assert.equal(shotsToRequest(quota(0, 4), now), 3);
  assert.equal(shotsToRequest(quota(3, 4), now), 1);
  assert.equal(shotsToRequest(quota(2, 4), now), 2);
  assert.equal(shotsToRequest(quota(4, 4), now), 0);
  assert.equal(shotsToRequest(quota(9, 4), now), 0);
  // Counted before today's reset: a new day, all 3.
  assert.equal(shotsToRequest(quota(4, 4, "2026-11-21T00:00:00Z"), now), 3);
  // No reset time in the headers: the count is used as it is.
  assert.equal(shotsToRequest(quota(3, 4, ""), now), 1);
  const tr = (a) => a;
  assert.equal(
    fewShotsNote(tr, 2),
    "Bugün 2 çekim hakkın kaldı; kalanlar kendi fotoğraflarınla tamamlanacak.",
  );
});

test("editor: a new photo 1 asks before re-shooting; Hayır keeps the old shots", () => {
  const src = read("../app/create.tsx");
  const open = src.slice(src.indexOf("const openEditor = ("), src.indexOf("const trySample = ()"));
  assert.match(open, /if \(ask && editorial && aiShotsNow\.current\.some\(Boolean\)\)/);
  assert.match(open, /"Yeni fotoğraf için çekimler yeniden üretilsin mi\?"/);
  assert.match(open, /\{ text: t\("Hayır", "No"\), style: "cancel" \}/);
  assert.match(open, /\{ text: t\("Evet", "Yes"\), onPress: \(\) => shootLatest\.current\(\) \}/);
  // Otherwise (no shots, the sample, another mode) they go as before.
  assert.match(open, /else \{\s*for \(const uri of aiShotsNow\.current\) discardEditorFile\(uri\);\s*setAiShots\(\[\.\.\.NO_SHOTS\]\);/);
  // Only a picked photo 1 asks.
  assert.match(src, /openEditor\(next, true\);/);
  assert.match(src, /openEditor\(sampleCutout\);/);
});

test("export-all saves the quality it rendered, not the editor's", () => {
  const src = read("../app/create.tsx");
  assert.match(src, /saveEdit\(clip\.id, \{ \.\.\.plan\.saved, quality: videoQuality \}, cutoutUri\)/);
});

test("paywall: the AI shots have their own heading and first fact in every build", () => {
  const src = read("../app/paywall.tsx");
  assert.match(src, /params\.reason === "shots"\s*\? \("shots" as const\)\s*: \("video" as const\)/);
  assert.match(src, /reason === "shots"\s*\? t\("Yapay zekâ çekimleri", "AI shots"\)/);
  assert.match(src, /"Ürünün için 3 profesyonel çekim üretilir; günlük hak Pro ile\."/);
  // The copy suggestions keep theirs.
  assert.match(src, /reason === "ai"\s*\? t\("Yapay zekâyla öneri al", "Get AI suggestions"\)/);
});

test("re-shoot keeps an old shot where the new request made none", () => {
  assert.deepEqual(mergeShots([null, null, null], ["a", null, "c"]), [
    "a",
    null,
    "c",
  ]);
  assert.deepEqual(mergeShots(["x", "y", "z"], [null, "b", null]), [
    "x",
    "b",
    "z",
  ]);
});

test("editor wiring: editorial mode builds buildEditorialSpec and renders withBeat", () => {
  const src = read("../app/create.tsx");
  assert.match(src, /editorialStart\(params, QA_EDITORIAL\)/);
  // The spec memo takes the editorial branch first.
  const memo = src.slice(src.indexOf("const spec = useMemo("));
  const editorialAt = memo.indexOf("buildEditorialSpec(");
  assert.ok(editorialAt > 0 && editorialAt < memo.indexOf("buildRecipeSpec("));
  assert.match(memo.slice(0, editorialAt), /if \(editorial\)/);
  assert.match(memo, /ai: aiShots/);
  assert.match(memo, /watermark: !isPro/);
  // One render path: the beat is added by withBeat for editorial too.
  assert.match(src, /await withBeat\(spec\)/);
  assert.match(
    src,
    /resolveMusicPattern\(musicChoice, isRecipe \|\| editorial\)/,
  );
  // Shots: Pro first (paywall), then consent, then the cloud; the note on failure.
  assert.match(src, /showPaywall\("shots"\)/);
  assert.match(src, /generateShots\(/);
  assert.match(src, /shotsNote\(/);
  assert.match(src, /onReshoot=\{cloudAvailable\(\) \? shoot : undefined\}/);
  assert.match(
    read("./studio/editorial-panel.tsx"),
    /testID="editorial-reshoot"/,
  );
  // Drafts keep the mode and the shots.
  assert.match(src, /editorial: true/);
  assert.match(src, /aiShots/);
});

test("Home: the Editoryal shelf comes first, picks up to 8 photos, sample opens editorial", () => {
  const home = read("../app/(tabs)/(studio)/index.tsx");
  assert.match(home, /pickProductPhotos\(8\)/);
  assert.match(home, /editorial: "1"/);
  const gallery = read("./studio/template-gallery.tsx");
  assert.ok(
    gallery.indexOf("<EditorialShelf") <
      gallery.indexOf("galleryShelves().map"),
    "first shelf",
  );
  assert.match(gallery, /useEditorialPoster/);
  const posters = read("./gallery-posters.ts");
  assert.match(posters, /buildEditorialSpec\(/);
  assert.match(posters, /EDITORIAL_POSTER_TIME/);
});

test("CI: qa_editorial input and the qa-editorial flow", () => {
  const yml = read("../../../.github/workflows/qa-flow.yml");
  assert.match(yml, /qa_editorial:/);
  assert.match(
    yml,
    /EXPO_PUBLIC_QA_EDITORIAL: \$\{\{ inputs\.qa_editorial \}\}/,
  );
  assert.match(yml, /- qa-editorial\.yaml/);
  const flow = read("../.maestro/qa-editorial.yaml");
  for (const id of [
    "home-create",
    "sample-try",
    "render-button",
    "save-photos",
  ])
    assert.match(flow, new RegExp(`id: "${id}"`));
  const config = read("./config.ts");
  assert.match(
    config,
    /QA_EDITORIAL = process\.env\.EXPO_PUBLIC_QA_EDITORIAL === "1"/,
  );
});
