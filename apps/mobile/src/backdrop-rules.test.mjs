// Run with: node --test apps/mobile/src/*.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_IMAGE_SET,
  OWN_OFFSET,
  OWN_SCALE,
  centerCrop,
  contrastingBackdrops,
  imageSetSummary,
  ownBackdropScene,
  ownProductRect,
  parseOwnBackdrop,
  stepValue,
  textForImage,
} from "./backdrop-rules.ts";
import { productPlacement } from "./cloud-rules.ts";
import {
  RATIOS,
  TEMPLATES,
  buildSpec,
  specProblems,
} from "./product-templates.ts";

const FILE = "0f8fad5b-d9cb-469f-a165-70867728950e.jpg";

test("an own backdrop parses tolerantly", () => {
  assert.deepEqual(
    parseOwnBackdrop({ file: FILE, width: 3024, height: 4032 }),
    {
      file: FILE,
      width: 3024,
      height: 4032,
      scale: 1,
      offset: 0,
      text: "light",
    },
  );
  const odd = parseOwnBackdrop({
    file: FILE,
    width: 100,
    height: 100,
    scale: 9,
    offset: -3,
    text: "dark",
  });
  assert.equal(odd.scale, OWN_SCALE.max);
  assert.equal(odd.offset, OWN_OFFSET.min);
  assert.equal(odd.text, "dark");
  for (const bad of [
    null,
    "x",
    { file: "../etc/passwd", width: 1, height: 1 },
    { file: "file:///x/" + FILE, width: 1, height: 1 },
    { file: FILE, width: 0, height: 10 },
    { file: FILE, width: 10 },
  ])
    assert.equal(parseOwnBackdrop(bad), null, JSON.stringify(bad));
});

test("the photo is cropped to its centred 9:16 column", () => {
  const portrait = centerCrop(3000, 4000); // 3:4
  assert.ok(Math.abs(portrait.width - 0.75) < 0.001);
  assert.ok(Math.abs(portrait.x - 0.125) < 0.001);
  assert.equal(portrait.y, 0);
  const landscape = centerCrop(4000, 3000);
  assert.ok(landscape.width < 0.5 && landscape.x > 0.25);
  // Narrower than 9:16: full width and the centred band of the height.
  const tall = centerCrop(900, 2400);
  assert.equal(tall.x, 0);
  assert.equal(tall.width, 1);
  assert.ok(tall.y > 0 && tall.height < 1);
  assert.deepEqual(centerCrop(0, 0), { x: 0, width: 1, y: 0, height: 1 });
});

test("size and position move the product but keep it in the frame", () => {
  const base = productPlacement(800, 1000);
  const same = ownProductRect(base, 1, 0);
  assert.ok(Math.abs(same.width - base.width) < 0.002);
  assert.ok(Math.abs(same.y + same.height - (base.y + base.height)) < 0.002);
  const big = ownProductRect(base, OWN_SCALE.max, 0);
  assert.ok(big.height > same.height);
  const up = ownProductRect(base, 1, OWN_OFFSET.min);
  assert.ok(up.y < same.y);
  for (const size of [
    [800, 1000],
    [2000, 300],
    [300, 2000],
  ])
    for (const scale of [OWN_SCALE.min, 1, OWN_SCALE.max])
      for (const offset of [OWN_OFFSET.min, 0, OWN_OFFSET.max]) {
        const r = ownProductRect(productPlacement(...size), scale, offset);
        assert.ok(r.x >= 0 && r.x + r.width <= 1.0001, JSON.stringify(r));
        assert.ok(r.y >= 0 && r.y + r.height <= 1.0001, JSON.stringify(r));
      }
});

test("steppers stay on the grid and in range", () => {
  assert.equal(stepValue(1, 1, OWN_SCALE), 1.1);
  assert.equal(stepValue(OWN_SCALE.max, 1, OWN_SCALE), OWN_SCALE.max);
  assert.equal(stepValue(0, -1, OWN_OFFSET), -0.04);
  assert.equal(stepValue(OWN_OFFSET.min, -1, OWN_OFFSET), OWN_OFFSET.min);
});

test("an own photo scene builds a valid video in every shape", () => {
  for (const text of ["light", "dark"]) {
    const own = parseOwnBackdrop({
      file: FILE,
      width: 3024,
      height: 4032,
      text,
    });
    const scene = ownBackdropScene(
      "file:///tmp/" + FILE,
      own,
      productPlacement(800, 1000),
    );
    assert.equal(scene.shade, text === "light" ? 0.5 : 0);
    for (const template of TEMPLATES)
      for (const ratio of RATIOS) {
        const spec = buildSpec({
          template: template.id,
          palette: "ivory",
          product: "file:///tmp/p.png",
          headline: "Yaz Esintisi",
          price: "899 TL",
          badge: "",
          cta: "Hemen al",
          quality: "1080p",
          watermark: false,
          music: null,
          ratio,
          scene,
        });
        assert.deepEqual(specProblems(spec), [], template.id + " " + ratio);
      }
  }
});

test("the default text colour follows the photo's brightness", () => {
  assert.equal(textForImage(null), "light");
  assert.equal(textForImage({ width: 10 }), "light");
  assert.equal(textForImage({ topLuma: 0.9, bottomLuma: 0.8 }), "dark");
  assert.equal(textForImage({ topLuma: 0.9, bottomLuma: 0.3 }), "light");
  assert.equal(textForImage({ topLuma: "x", bottomLuma: 0.9 }), "light");
});

const ALL = [
  { id: "marble-white", dark: false },
  { id: "marble-black", dark: true },
  { id: "travertine", dark: false },
  { id: "oak", dark: false },
  { id: "walnut", dark: true },
  { id: "concrete", dark: false },
  { id: "terrazzo", dark: false },
  { id: "linen", dark: false },
  { id: "paper-blush", dark: false },
  { id: "paper-sage", dark: false },
  { id: "paper-sand", dark: false },
  { id: "paper-night", dark: true },
];

test("an image set starts with the current backdrop and contrasting ones", () => {
  const set = contrastingBackdrops("marble-white", ALL);
  assert.equal(set.length, MAX_IMAGE_SET);
  assert.equal(set[0], "marble-white");
  assert.equal(new Set(set).size, set.length);
  assert.ok(set.some((id) => ALL.find((b) => b.id === id).dark));
  const fromDark = contrastingBackdrops("paper-night", ALL);
  assert.equal(fromDark[0], "paper-night");
  assert.ok(
    fromDark.slice(1).filter((id) => !ALL.find((b) => b.id === id).dark)
      .length >= 2,
  );
  // A palette or own photo: five backdrops, mixed.
  const none = contrastingBackdrops(null, ALL);
  assert.equal(none.length, 5);
  assert.equal(new Set(none).size, 5);
});

test("the image set summary counts what was saved", () => {
  const sum = (over, lang = "tr") =>
    imageSetSummary(
      { saved: 0, renderFailed: 0, saveFailed: 0, cancelled: false, ...over },
      lang,
    );
  assert.equal(sum({ saved: 5 }), "5 görsel Fotoğraflar'a kaydedildi.");
  assert.match(
    sum({ saved: 3, renderFailed: 2 }),
    /3 görsel.*2 zeminde görsel hazırlanamadı/,
  );
  assert.match(sum({ saved: 2, cancelled: true }), /^İptal edildi\. 2 görsel/);
  assert.equal(sum({ saved: 1 }, "en"), "1 image saved to Photos.");
  assert.match(sum({ renderFailed: 5 }, "en"), /No images/);
});

test("a save failure is not called a render failure, and says why once (QA run 15)", () => {
  const text = imageSetSummary(
    {
      saved: 0,
      renderFailed: 0,
      saveFailed: 4,
      cancelled: false,
      reason:
        "Fotoğraflar'a kaydedilemedi. Fotoğraflar izninin açık olduğunu kontrol et.",
    },
    "tr",
  );
  assert.match(text, /4 görsel Fotoğraflar'a kaydedilemedi\./);
  assert.doesNotMatch(text, /hazırlanamadı/);
  assert.equal(text.split("Fotoğraflar izninin").length, 2, "reason once");
  assert.doesNotMatch(
    imageSetSummary(
      {
        saved: 2,
        renderFailed: 0,
        saveFailed: 0,
        cancelled: false,
        reason: "x",
      },
      "tr",
    ),
    /x$/,
    "no reason without a failure",
  );
});
