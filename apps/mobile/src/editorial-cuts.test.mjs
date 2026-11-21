// The Editoryal shelf's five cuts (recipes/editorial.ts EDITORIAL_CUTS):
// the signature cut stays byte-identical, every cut builds a valid video in
// every shape with 3 / 1 / 0 AI shots and 1 / 4 / 8 seller photos.
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  EDITORIAL_CUTS,
  SIGNATURE,
  buildEditorialSpec,
  cutById,
  cutDuration,
} from "./recipes/editorial.ts";
import {
  FEED_BAND,
  estimateLines,
  ratioLayout,
  textHalfHeight,
} from "./recipes/build.ts";
import { MAX_SCENES, specProblems } from "./product-templates.ts";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const AI = ["ai-context.jpg", "ai-hand.jpg", "ai-macro.jpg"];
const photos = (n) => Array.from({ length: n }, (_, i) => `photo-${i}.jpg`);
const RATIOS = ["9:16", "4:5", "1:1"];
const BASE = {
  ai: AI,
  photos: photos(2),
  cutouts: [],
  name: "Lavanta Yağı",
  price: "349 TL",
  palette: "ivory",
  music: { uri: "song.m4a", volume: 0.8 },
  watermark: true,
  quality: "1080p",
};
const build = (over = {}, cut) => buildEditorialSpec({ ...BASE, ...over }, cut);
const sha = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const byId = (id) => EDITORIAL_CUTS.find((c) => c.id === id);

test("signature cut: output unchanged by the cut refactor (hash taken before it)", () => {
  // Every shape x AI set x 0/1/4/8 photos x short/long/no name, captured
  // before EditorialCut existed (docs/_snap/editorial-cuts/).
  const cases = [];
  for (const ratio of RATIOS)
    for (const ai of [
      AI,
      [AI[0], null, null],
      [null, AI[1], null],
      [null, null, AI[2]],
      [null, null, null],
    ])
      for (const n of [0, 1, 4, 8]) {
        if (n === 0 && !ai.some(Boolean)) continue;
        for (const name of [
          "Lavanta Yağı",
          "Organik soğuk sıkım lavanta yağı, cam damlalıklı şişe 50 ml",
          "",
        ])
          cases.push(
            build({
              ai,
              photos: photos(n),
              ratio,
              name,
              price: name ? "349 TL" : "",
            }),
          );
      }
  assert.equal(cases.length, 171);
  assert.equal(
    sha(cases),
    "169cda8735f219863aa5cbf553b835f8ff995e86e6f42b31d8c33727b2516d73",
  );
  assert.deepEqual(build({}, SIGNATURE), build());
});

test("five cuts, unique ids, unknown ids fall back to the signature cut", () => {
  assert.deepEqual(
    EDITORIAL_CUTS.map((c) => c.id),
    ["signature", "ritim", "sakin-luks", "detay", "lookbook"],
  );
  assert.equal(cutById(undefined), SIGNATURE);
  assert.equal(cutById("nope"), SIGNATURE);
  assert.equal(cutById("lookbook").id, "lookbook");
  for (const cut of EDITORIAL_CUTS) {
    const d = cutDuration(cut);
    assert.ok(d >= 10 && d <= 15, `${cut.id} ${d} s`);
    assert.ok(cut.shots.length <= MAX_SCENES, cut.id);
    cut.shots.forEach((s, i) => {
      assert.ok(s.end > s.start, `${cut.id} shot ${i}`);
      if (i) assert.equal(s.start, cut.shots[i - 1].end, `${cut.id} shot ${i}`);
    });
    assert.ok(cut.poster > 0 && cut.poster < d, `${cut.id} poster`);
    assert.ok(cut.title.end <= cut.end.start, `${cut.id} texts apart`);
  }
});

const AI_SETS = [
  ["3 AI", AI],
  ["1 AI", [AI[0], null, null]],
  ["0 AI", [null, null, null]],
];

for (const cut of EDITORIAL_CUTS)
  for (const [aiLabel, ai] of AI_SETS)
    for (const n of [1, 4, 8])
      for (const ratio of RATIOS)
        test(`${cut.id} x ${aiLabel} x ${n} photo(s) x ${ratio}`, () => {
          const spec = build({ ai, photos: photos(n), ratio }, cut);
          const layout = ratioLayout(ratio);
          assert.deepEqual(specProblems(spec), []);
          assert.equal(spec.duration, cutDuration(cut));
          assert.ok(spec.scenes.length <= 16);
          assert.ok(new Set(spec.scenes.map((s) => s.image)).size <= 16);
          // Cuts on the cut's half-beat grid.
          const half = 30 / cut.bpm;
          for (const s of spec.scenes) {
            const q = s.start / half;
            assert.ok(
              Math.abs(q - Math.round(q)) < 1e-6,
              `${s.start} off grid`,
            );
          }
          spec.scenes.forEach((s, i) => {
            const shot = cut.shots[i];
            assert.equal(s.start, shot.start);
            assert.equal(s.mode, shot.cards && s.images ? "cards" : (shot.mode ?? "photo"));
            assert.deepEqual(
              s.transition,
              shot.transition ?? { kind: "cut", duration: 0 },
              `scene ${i} transition`,
            );
            const len = shot.end - shot.start;
            assert.equal(s.keys[0].t, 0);
            assert.ok(Math.abs(s.keys.at(-1).t - len) < 1e-9, `scene ${i} end`);
            assert.equal(s.keys.at(-1).rotation, 0, `scene ${i} level`);
            for (const k of s.keys) {
              assert.ok(Math.abs(k.rotation) <= 8, `scene ${i} roll`);
              if (s.mode === "photo")
                assert.ok(k.scale >= 1 && k.scale <= 3, `scene ${i} zoom`);
              if (AI.includes(s.image) && n > 0)
                assert.ok(k.scale <= 1.7, `scene ${i} AI zoom`);
            }
            if (i === 0) return;
            // No two consecutive scenes alike.
            const prev = spec.scenes[i - 1];
            if (prev.image !== s.image || prev.mode !== s.mode) return;
            const a = prev.keys.at(-1),
              b = s.keys[0];
            const d =
              Math.abs(a.x - b.x) +
              Math.abs(a.y - b.y) +
              Math.abs(a.scale - b.scale);
            assert.ok(d > 0.15, `scenes ${i - 1}/${i} alike (${d.toFixed(3)})`);
          });
          // Title and end line in their windows, at most two lines, inside
          // the frame's text band.
          const [title, end] = spec.texts;
          assert.equal(spec.texts.length, 2);
          assert.equal(title.text, "Lavanta Yağı");
          assert.deepEqual(
            [title.start, title.end, title.font, title.weight],
            [cut.title.start, cut.title.end, cut.title.font, cut.title.weight],
          );
          assert.equal(end.text, "Lavanta Yağı · 349 TL");
          assert.deepEqual(
            [end.start, end.end, end.font],
            [cut.end.start, spec.duration, cut.end.font],
          );
          for (const t of spec.texts) {
            const lines = estimateLines(t.text, t.size, t.font, t.tracking);
            assert.ok(lines <= 2, t.text);
            const h = textHalfHeight(lines, t.size, false, layout.tall);
            assert.ok(
              t.y - h >= layout.top - 1e-9 && t.y + h <= layout.bottom + 1e-9,
              `${t.text} at ${t.y}`,
            );
          }
          if (layout.box)
            for (const t of spec.texts)
              assert.ok(t.y >= FEED_BAND.top && t.y <= FEED_BAND.bottom);
        });

test("every cut: long names stay within two lines, the price survives", () => {
  const name =
    "Organik soğuk sıkım lavanta yağı, cam damlalıklı şişe 50 ml".slice(0, 60);
  for (const cut of EDITORIAL_CUTS)
    for (const ratio of RATIOS) {
      const spec = build({ name, price: "1.249,90 TL", ratio }, cut);
      assert.deepEqual(specProblems(spec), [], `${cut.id} ${ratio}`);
      for (const t of spec.texts)
        assert.ok(estimateLines(t.text, t.size, t.font, t.tracking) <= 2);
      assert.ok(spec.texts[1].text.endsWith(" · 1.249,90 TL"));
    }
});

test("every cut: only AI shots (no seller photo) still builds", () => {
  for (const cut of EDITORIAL_CUTS)
    for (const ratio of RATIOS) {
      const spec = build({ photos: [], ratio }, cut);
      assert.deepEqual(specProblems(spec), [], `${cut.id} ${ratio}`);
      assert.deepEqual(
        new Set(spec.scenes.map((s) => s.image)),
        new Set(AI),
        cut.id,
      );
    }
});

test("Ritim: 15-16 shots of mostly 0.5 s, two flashes on bar downbeats, cooler and crisper, one bold line", () => {
  const cut = byId("ritim");
  assert.equal(cut.bpm, 120);
  assert.ok(cut.shots.length >= 15 && cut.shots.length <= 16);
  const halfSecond = cut.shots.filter((s) => s.end - s.start === 0.5).length;
  assert.ok(halfSecond >= cut.shots.length * 0.75, `${halfSecond} short shots`);
  const flashes = cut.shots.filter((s) => s.transition?.kind === "flash");
  assert.equal(flashes.length, 2);
  // 120 bpm, 4/4: a bar every 2 s.
  for (const s of flashes) assert.equal(s.start % 2, 0);
  assert.ok(cut.grade.warmth < SIGNATURE.grade.warmth);
  assert.ok(cut.grade.contrast > SIGNATURE.grade.contrast);
  assert.deepEqual(
    [cut.title.font, cut.title.weight, cut.title.start, cut.title.end],
    ["modern", "heavy", 0, 1.5],
  );
  const title = build({}, cut).texts[0];
  assert.equal(
    estimateLines(title.text, title.size, title.font, title.tracking),
    1,
  );
});

test("Sakin lüks: 8-9 slow shots, slow push-ins, soft wipes and blurs, warm low-contrast faded grade, serif title", () => {
  const cut = byId("sakin-luks");
  assert.ok(cut.shots.length >= 8 && cut.shots.length <= 9);
  for (const s of cut.shots) {
    const len = s.end - s.start;
    assert.ok(len >= 1.2 - 1e-9 && len <= 1.8 + 1e-9, `${s.start}: ${len}`);
    assert.ok(
      ["wipe", "blur", undefined].includes(s.transition?.kind),
      `${s.start} soft`,
    );
    if ((s.mode ?? "photo") === "photo")
      assert.notEqual(s.motion.style ?? "drift", "drift", "no handheld");
  }
  assert.ok(cut.shots.filter((s) => s.transition).length >= 4);
  assert.ok(cut.grade.warmth >= SIGNATURE.grade.warmth);
  assert.ok(cut.grade.contrast < SIGNATURE.grade.contrast);
  assert.ok(cut.grade.fade > SIGNATURE.grade.fade);
  assert.ok(["elegant", "editorial"].includes(cut.title.font));
});

test("Ritim: two whips, left then right, 0.25 s, never on a flash", () => {
  const spec = build({}, byId("ritim"));
  const whips = spec.scenes.filter((s) => s.transition.kind === "whip");
  assert.equal(whips.length, 2);
  assert.deepEqual(whips.map((s) => s.transition.direction), ["left", "right"]);
  for (const s of whips) assert.equal(s.transition.duration, 0.25);
  assert.equal(spec.scenes.filter((s) => s.transition.kind === "flash").length, 2);
});

test("Sakin lüks: one light leak inside the video; other cuts have none", () => {
  const spec = build({}, byId("sakin-luks"));
  assert.equal(spec.leaks.length, 1);
  assert.ok(spec.leaks[0].start >= 0 && spec.leaks[0].end <= spec.duration);
  for (const id of ["signature", "ritim", "detay", "lookbook"])
    assert.equal("leaks" in build({}, byId(id)), false, id);
});

test("Lookbook: a cards scene of 2-3 seller photos with 2+ photos, a plain photo shot otherwise", () => {
  const cut = byId("lookbook");
  const shot = cut.shots.findIndex((s) => s.cards);
  for (const n of [2, 3, 8]) {
    const spec = build({ photos: photos(n) }, cut);
    const sc = spec.scenes[shot];
    assert.equal(sc.mode, "cards");
    assert.equal(sc.images.length, Math.min(3, n));
    assert.equal(new Set(sc.images).size, sc.images.length);
    assert.equal(sc.image, sc.images[0]);
    assert.ok(sc.images.every((u) => photos(n).includes(u)));
    assert.deepEqual(specProblems(spec), []);
  }
  for (const n of [0, 1]) {
    const spec = build({ photos: photos(n) }, cut);
    assert.equal(spec.scenes[shot].mode, "photo");
    assert.equal(spec.scenes[shot].images, undefined);
  }
});

test("Detay hikâyesi: macro-led, depth in the middle, a zoom into a macro", () => {
  const cut = byId("detay");
  assert.ok(cut.shots.length >= 11 && cut.shots.length <= 12);
  assert.ok(cut.shots.filter((s) => s.source === "macro").length >= 4);
  assert.equal(cut.shots[0].source, "macro");
  const depth = cut.shots.filter((s) => s.mode === "depth");
  assert.equal(depth.length, 1);
  const d = cutDuration(cut);
  assert.ok(depth[0].start > d * 0.35 && depth[0].end < d * 0.65);
  const zoom = cut.shots.filter((s) => s.transition?.kind === "zoom");
  assert.equal(zoom.length, 1);
  assert.equal(zoom[0].source, "macro");
});

test("Lookbook: every seller photo shows (1-8), even cuts, one depth, ends on the context", () => {
  const cut = byId("lookbook");
  for (let n = 1; n <= 8; n++)
    for (const [, ai] of AI_SETS) {
      const spec = build({ ai, photos: photos(n) }, cut);
      const shown = new Set(spec.scenes.flatMap((s) => [s.image, ...(s.images ?? [])]));
      for (const p of photos(n)) assert.ok(shown.has(p), `${n}: ${p}`);
    }
  assert.equal(cut.shots.filter((s) => s.mode === "depth").length, 1);
  assert.equal(cut.shots.at(-1).source, "context");
  assert.ok(cut.shots.filter((s) => s.source === "photo").length >= 7);
  const beat = 60 / cut.bpm;
  const even = cut.shots.filter((s) => s.end - s.start === beat).length;
  assert.ok(even >= cut.shots.length - 4, `${even} one-beat shots`);
});

test("gallery: the Editoryal shelf shows the 5 cuts, each with its poster and route cut id", () => {
  const gallery = read("./studio/template-gallery.tsx");
  assert.match(gallery, /EDITORIAL_CUTS\.map\(/);
  assert.match(gallery, /useEditorialPoster\(cut, /);
  assert.match(gallery, /"gallery-editorial"/);
  assert.match(gallery, /"gallery-sample-editorial"/);
  const posters = read("./gallery-posters.ts");
  assert.match(posters, /buildEditorialSpec\(\s*\{[\s\S]*?\},\s*cut,?\s*\)/);
  assert.match(posters, /at: cut\.poster/);
  const home = read("../app/(tabs)/(studio)/index.tsx");
  assert.match(home, /start: \{ editorial: "1", cut \}/);
  assert.match(home, /params: \{ sample: "1", editorial: "1", cut \}/);
  const create = read("../app/create.tsx");
  assert.match(create, /cutById\(params\.cut\)/);
  assert.match(
    create,
    /buildEditorialSpec\(\s*\{[\s\S]*?\},\s*cutById\(cutId\),?\s*\)/,
  );
  assert.match(create, /editorialCut: cutId/);
  assert.match(create, /onCut=\{setCutId\}/);
  assert.match(
    read("./studio/editorial-panel.tsx"),
    /"editorial-cut-" \+ cut\.id/,
  );
});

test("Lookbook title is script: tracking 0, one line for a normal name, two for a long one", () => {
  const cut = byId("lookbook");
  assert.equal(cut.title.font, "script");
  for (const ratio of RATIOS) {
    const short = build({ ratio }, cut).texts[0];
    assert.equal(short.font, "script");
    assert.equal(short.tracking, 0);
    assert.equal(short.text, "Lavanta Yağı");
    assert.equal(estimateLines(short.text, short.size, "script", 0), 1);
    const longName = "Organik soğuk sıkım lavanta yağı, cam damlalıklı şişe 50 ml";
    const long = build({ ratio, name: longName }, cut).texts[0];
    assert.equal(long.text, longName);
    assert.ok(estimateLines(long.text, long.size, "script", 0) <= 2);
    assert.deepEqual(specProblems(build({ ratio, name: longName }, cut)), []);
  }
  // The other cuts keep their own families.
  for (const id of ["signature", "ritim", "detay"])
    assert.notEqual(build({}, byId(id)).texts[0].font, "script");
});
