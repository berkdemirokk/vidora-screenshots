import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";
import { EDITORIAL_GRADE, buildEditorialSpec } from "./recipes/editorial.ts";
import {
  FEED_BAND,
  estimateLines,
  ratioLayout,
  textHalfHeight,
} from "./recipes/build.ts";
import { specProblems } from "./product-templates.ts";

// docs/hedef/yeni-video-v2/shotlist.md
const STARTS = [0, 2, 3, 3.75, 4.75, 5.5, 6.5, 7.25, 8, 8.5, 9, 10, 11];
const AI = ["ai-context.jpg", "ai-hand.jpg", "ai-macro.jpg"];
const photos = (n) => Array.from({ length: n }, (_, i) => `photo-${i}.jpg`);

const build = (over = {}) =>
  buildEditorialSpec({
    ai: AI,
    photos: photos(2),
    cutouts: [],
    name: "Lavanta Yağı",
    price: "349 TL",
    palette: "ivory",
    music: { uri: "song.m4a", volume: 0.8 },
    watermark: true,
    quality: "1080p",
    ...over,
  });

const AI_CASES = [
  ["all 3", AI],
  ["no context", [null, AI[1], AI[2]]],
  ["no hand", [AI[0], null, AI[2]]],
  ["no macro", [AI[0], AI[1], null]],
  ["none", [null, null, null]],
];
const CASES = AI_CASES.flatMap(([label, ai]) =>
  [1, 6].map((n) => ({
    label: `${label} x ${n} photo(s)`,
    input: { ai, photos: photos(n) },
  })),
);

test("13 scenes on the target timings, 9:16, 13 s at 30 fps", () => {
  const spec = build();
  assert.equal(spec.scenes.length, 13);
  assert.deepEqual(
    spec.scenes.map((s) => s.start),
    STARTS,
  );
  assert.equal(spec.duration, 13);
  assert.equal(spec.fps, 30);
  assert.equal(spec.ratio, "9:16");
});

test("all AI shots: sources and crops follow the shot list", () => {
  const spec = build();
  const img = spec.scenes.map((s) => s.image);
  assert.deepEqual(img, [
    AI[0],
    AI[1],
    AI[2],
    AI[0],
    "photo-0.jpg",
    "photo-1.jpg",
    AI[1],
    AI[0],
    AI[2],
    "photo-1.jpg",
    "photo-0.jpg",
    AI[0],
    AI[0],
  ]);
  const first = spec.scenes[1].keys[0];
  assert.deepEqual([first.scale, first.x, first.y], [1.35, 0.58, 0.58]);
  const last = spec.scenes[2].keys.at(-1);
  assert.deepEqual([last.scale, last.x, last.y], [1.7, 0.6, 0.26]);
});

for (const { label, input } of CASES)
  test(`no spec problems, varied cuts: ${label}`, () => {
    const spec = build(input);
    assert.deepEqual(specProblems(spec), []);
    assert.equal(spec.scenes.length, 13);
    assert.ok(new Set(spec.scenes.map((s) => s.image)).size <= 16);
    assert.equal(spec.scenes.filter((s) => s.mode === "depth").length, 1);
    spec.scenes.forEach((s, i) => {
      const len = (spec.scenes[i + 1]?.start ?? spec.duration) - s.start;
      assert.ok(s.keys.length >= 2, `scene ${i} keys`);
      assert.equal(s.keys[0].t, 0);
      assert.ok(
        Math.abs(s.keys.at(-1).t - len) < 1e-9,
        `scene ${i} ends on its cut`,
      );
      s.keys.forEach(
        (k, j) => j && assert.ok(k.t > s.keys[j - 1].t, `scene ${i} key order`),
      );
      if (i === 0) return;
      const prev = spec.scenes[i - 1];
      if (prev.image !== s.image || prev.mode !== s.mode) return;
      const a = prev.keys.at(-1),
        b = s.keys[0];
      const d =
        Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.scale - b.scale);
      assert.ok(d > 0.15, `scenes ${i - 1}/${i} look alike (${d.toFixed(3)})`);
    });
  });

test("missing AI shots use the seller's photos, never a null image", () => {
  const spec = build({ ai: [null, null, null], photos: photos(6) });
  assert.ok(spec.scenes.every((s) => s.image.startsWith("photo-")));
  // Six photos: all of them show up.
  assert.equal(new Set(spec.scenes.map((s) => s.image)).size, 6);
});

test("photo-mode scenes carry handheld drift keys", () => {
  const spec = build();
  const photoScenes = spec.scenes
    .slice(0, 12)
    .filter((s) => s.mode === "photo");
  assert.ok(photoScenes.every((s) => s.keys.length >= 3));
});

test("AI shots zoom at most 1.7 in every shape, seller photos keep the shot list's zoom", () => {
  for (const ratio of ["9:16", "4:5", "1:1"]) {
    const spec = build({ ratio });
    spec.scenes.forEach((s, i) => {
      if (!AI.includes(s.image)) return;
      for (const k of s.keys) assert.ok(k.scale <= 1.7, `${ratio} scene ${i}`);
    });
  }
  const spec = build();
  // Shot 7 (hand detail): the shot list's point, zoom capped.
  const hand = spec.scenes[6].keys;
  assert.deepEqual([hand[0].scale, hand[0].x, hand[0].y], [1.7, 0.62, 0.7]);
  // Shot 10 (seller spa detail): 2.3 as listed, point pulled halfway in.
  const spa = spec.scenes[9].keys[0];
  assert.deepEqual([spa.scale, spa.x, spa.y], [2.3, 0.65, 0.64]);
});

test("handheld roll: at most 0.18° on inner keys, level on every cut; shot 11 rolls -1.6° to 0°", () => {
  for (const ratio of ["9:16", "4:5", "1:1"]) {
    const spec = build({ ratio });
    spec.scenes.forEach((s, i) => {
      if (i === 10) {
        assert.equal(s.keys[0].rotation, -1.6, ratio);
        assert.equal(s.keys.at(-1).rotation, 0, ratio);
        return;
      }
      assert.equal(s.keys[0].rotation, 0, `${ratio} scene ${i} first`);
      assert.equal(s.keys.at(-1).rotation, 0, `${ratio} scene ${i} last`);
      for (const k of s.keys)
        assert.ok(Math.abs(k.rotation) <= 0.18, `${ratio} scene ${i}`);
    });
    const inner = spec.scenes.slice(0, 12).flatMap((s) => s.keys.slice(1, -1));
    assert.ok(inner.some((k) => k.rotation !== 0), "some roll");
  }
  // Seeded: the same input gives the same roll.
  assert.deepEqual(build(), build());
});

test("shot 1 is a little darker for the title, the hero keeps 0.1", () => {
  const spec = build();
  assert.equal(spec.scenes[0].shade, 0.16);
  assert.equal(spec.scenes[12].shade, 0.1);
  assert.ok(spec.scenes.slice(1, 12).every((s) => s.shade === undefined));
});

test("blur into shot 9, flash at 9.0 s, hard cuts elsewhere", () => {
  const spec = build();
  spec.scenes.forEach((s, i) => {
    if (i === 8)
      assert.deepEqual(s.transition, { kind: "blur", duration: 0.25 });
    else if (i === 10) assert.equal(s.transition.kind, "flash");
    else assert.equal(s.transition.kind, "cut");
  });
  assert.equal(spec.scenes[10].start, 9);
});

test("grade and look", () => {
  const spec = build();
  assert.deepEqual(spec.grade, EDITORIAL_GRADE);
  assert.deepEqual(spec.grade, {
    warmth: 0.35,
    saturation: -0.2,
    contrast: 0.1,
    fade: 0.15,
  });
  assert.equal(spec.look.grain, 0.35);
  assert.equal(spec.look.vignette, 0.3);
});

test("texts: title in the first 2.2 s, end line after 11 s, nothing else", () => {
  const spec = build();
  assert.equal(spec.texts.length, 2);
  const [title, end] = spec.texts;
  assert.equal(title.text, "Lavanta Yağı");
  assert.equal(title.font, "editorial");
  assert.ok(title.start >= 0 && title.end <= 2.2);
  assert.equal(end.text, "Lavanta Yağı · 349 TL");
  assert.equal(end.font, "editorial");
  assert.ok(end.start >= 11 && end.end === 13);
  assert.equal(build({ price: "" }).texts[1].text, "Lavanta Yağı");
});

test("long names stay within two lines", () => {
  const name =
    "Organik soğuk sıkım lavanta yağı, cam damlalıklı şişe 50 ml".slice(0, 60);
  const spec = build({ name, price: "1.249,90 TL" });
  assert.deepEqual(specProblems(spec), []);
  for (const t of spec.texts)
    assert.ok(estimateLines(t.text, t.size, t.font, t.tracking) <= 2, t.text);
  assert.ok(spec.texts[0].size >= 0.05, "title stays readable");
  assert.ok(
    spec.texts[1].text.endsWith(" · 1.249,90 TL"),
    "price survives the length limit",
  );
  assert.ok(spec.texts[1].text.length <= 60);
});

test("music and watermark come from the input", () => {
  const spec = build({ music: null, watermark: false });
  assert.equal(spec.music, null);
  assert.equal(spec.watermark, false);
  const on = build();
  assert.deepEqual(on.music, { uri: "song.m4a", volume: 0.8 });
  assert.equal(on.watermark, true);
});

// MARK: Feed shapes (4:5, 1:1) for "Hepsini çıkar"

const sha = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex");

test("9:16 output is unchanged by the ratio support (snapshot taken before it)", () => {
  // Hashes of JSON.stringify(spec), captured before `ratio` existed
  // (full sample spec: docs/_snap/gaps-ratio/baseline-916.json), then
  // re-taken in final wave 3 (AI zoom cap 1.7, handheld roll, shot 1 shade).
  assert.equal(
    sha(build()),
    "e84443f1eaeae9ab72fc48852d19db782630d002f5e26907ed3da08f22e19788",
  );
  const cases = [AI, [null, AI[1], AI[2]], [null, null, null]].flatMap((ai) =>
    [1, 6].map((n) => build({ ai, photos: photos(n) })),
  );
  assert.equal(
    sha(cases),
    "917164aba63f7710a1d62b97127639971d89af4d97eaebe6e00cd61885bf5234",
  );
  assert.deepEqual(build({ ratio: "9:16" }), build());
});

for (const ratio of ["4:5", "1:1"])
  for (const { label, input } of CASES)
    test(`${ratio}: no spec problems, texts in the feed band, same photo points: ${label}`, () => {
      const l = ratioLayout(ratio);
      const tall = build(input);
      const spec = build({ ...input, ratio });
      assert.equal(spec.ratio, ratio);
      assert.deepEqual(specProblems(spec), []);
      assert.equal(spec.scenes.length, 13);
      assert.deepEqual(
        spec.scenes.map((s) => [s.start, s.image, s.mode, s.transition]),
        tall.scenes.map((s) => [s.start, s.image, s.mode, s.transition]),
      );
      spec.scenes.forEach((s, i) =>
        s.keys.forEach((k, j) => {
          const w = tall.scenes[i].keys[j];
          assert.deepEqual(
            [k.t, k.x, k.y],
            [w.t, w.x, w.y],
            `scene ${i} key ${j} point`,
          );
          // Our AI shots stop at 1.7 (photos are always given here, so an
          // AI image only plays its own shot).
          const top = AI.includes(s.image) ? 1.7 : 3;
          if (s.mode === "photo")
            assert.ok(
              Math.abs(k.scale - Math.min(top, w.scale * l.zoom)) < 1e-4,
              `scene ${i} zoom`,
            );
          else
            assert.ok(k.scale > w.scale && k.scale <= 1.4, `scene ${i} dolly`);
        }),
      );
      for (const t of spec.texts) {
        const lines = estimateLines(t.text, t.size, t.font, t.tracking);
        const half = textHalfHeight(lines, t.size, false, l.tall);
        assert.ok(lines <= 2, t.text);
        assert.ok(
          t.y - half >= FEED_BAND.top - 1e-9 &&
            t.y + half <= FEED_BAND.bottom + 1e-9,
          `${t.text} at ${t.y}`,
        );
      }
      const [title, end] = spec.texts;
      assert.ok(title.end <= end.start, "never on screen together");
      assert.equal(
        title.size,
        Math.round(tall.texts[0].size * l.text * 10000) / 10000,
      );
    });

test("feed shapes: long names stay within two lines and the band", () => {
  const name =
    "Organik soğuk sıkım lavanta yağı, cam damlalıklı şişe 50 ml".slice(0, 60);
  for (const ratio of ["4:5", "1:1"]) {
    const l = ratioLayout(ratio);
    const spec = build({ name, price: "1.249,90 TL", ratio });
    assert.deepEqual(specProblems(spec), [], ratio);
    for (const t of spec.texts) {
      const lines = estimateLines(t.text, t.size, t.font, t.tracking);
      assert.ok(lines <= 2, `${ratio} ${t.text}`);
      const half = textHalfHeight(lines, t.size, false, l.tall);
      assert.ok(
        t.y - half >= FEED_BAND.top - 1e-9 &&
          t.y + half <= FEED_BAND.bottom + 1e-9,
        ratio,
      );
    }
    assert.ok(
      spec.texts[0].size >= 0.05 * l.text,
      `${ratio} title stays readable`,
    );
    assert.ok(spec.texts[1].text.endsWith(" · 1.249,90 TL"), ratio);
  }
});
