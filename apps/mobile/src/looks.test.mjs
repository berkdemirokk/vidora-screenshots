// Run with: node --test apps/mobile/src/*.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { LOOKS, lookById, looksFor, matchingLook } from "./looks.ts";
import {
  FONT_STYLES,
  PALETTES,
  RATIOS,
  TEMPLATES,
  buildSpec,
  clearanceProblems,
  specProblems,
  textOverlapProblems,
} from "./product-templates.ts";
import { productPlacement } from "./cloud-rules.ts";

// Written out like drafts.ts does: backdrops.ts imports image assets.
const BACKDROP_IDS = [
  "marble-white",
  "marble-black",
  "travertine",
  "oak",
  "walnut",
  "concrete",
  "terrazzo",
  "linen",
  "paper-blush",
  "paper-sage",
  "paper-sand",
  "paper-night",
];
const CATEGORY_IDS = [
  "cosmetics",
  "jewellery",
  "fashion",
  "home",
  "food",
  "electronics",
];

const allTexts = {
  product: "file:///tmp/product.png",
  headline: "Gül & Amber Eau de Parfum",
  price: "1.249 TL",
  oldPrice: "1.599 TL",
  badge: "%30 indirim",
  cta: "Hemen sipariş ver",
  store: "Atölye Nur",
  quality: "1080p",
  watermark: false,
  music: null,
};

test("every look uses ids that exist", () => {
  const ids = new Set();
  for (const look of LOOKS) {
    assert.ok(!ids.has(look.id), "duplicate id " + look.id);
    ids.add(look.id);
    assert.match(look.id, /^[a-z0-9-]+$/);
    assert.ok(
      TEMPLATES.some((t) => t.id === look.template),
      look.id + " template",
    );
    assert.ok(
      PALETTES.some((p) => p.id === look.palette),
      look.id + " palette",
    );
    assert.ok(
      FONT_STYLES.some((f) => f.id === look.fontStyle),
      look.id + " font",
    );
    if (look.backdrop !== null)
      assert.ok(BACKDROP_IDS.includes(look.backdrop), look.id + " backdrop");
    assert.ok(look.categories.length > 0, look.id + " categories");
    for (const c of look.categories)
      assert.ok(CATEGORY_IDS.includes(c), look.id + " category " + c);
    assert.ok(look.tr.length > 0 && look.tr.length <= 22, look.id + " tr");
    assert.ok(look.en.length > 0, look.id + " en");
  }
});

test("each category offers six to eight looks and about 36 in all", () => {
  assert.ok(LOOKS.length >= 32 && LOOKS.length <= 42, String(LOOKS.length));
  for (const c of CATEGORY_IDS) {
    const n = looksFor(c).length;
    assert.ok(n >= 6 && n <= 8, `${c}: ${n}`);
  }
  assert.equal(looksFor(null).length, LOOKS.length);
});

test("no two looks are the same combination", () => {
  const seen = new Set();
  for (const look of LOOKS) {
    const key = [
      look.template,
      look.backdrop ?? "palette:" + look.palette,
      look.fontStyle,
    ].join("|");
    assert.ok(!seen.has(key), "near-duplicate " + look.id);
    seen.add(key);
  }
  // Names are unique too.
  assert.equal(new Set(LOOKS.map((l) => l.tr)).size, LOOKS.length);
});

test("every look makes a clean video with all texts in every shape", () => {
  for (const look of LOOKS)
    for (const ratio of RATIOS)
      for (const size of [
        { width: 800, height: 1000 },
        { width: 1200, height: 600 },
        { width: 500, height: 1400 },
      ]) {
        const scene = look.backdrop
          ? {
              uri: "file:///tmp/" + look.backdrop + ".jpg",
              crop: { x: 0, width: 1 },
              productRect: productPlacement(size.width, size.height),
              shade: 0,
            }
          : null;
        const spec = buildSpec({
          ...allTexts,
          template: look.template,
          palette: look.palette,
          fontStyle: look.fontStyle,
          ratio,
          scene,
          productSize: size,
        });
        const label = `${look.id} ${ratio} ${size.width}x${size.height}`;
        assert.deepEqual(specProblems(spec), [], label);
        assert.deepEqual(clearanceProblems(spec), [], label);
        assert.deepEqual(textOverlapProblems(spec), [], label);
      }
});

test("lookById and matchingLook find a look again", () => {
  for (const look of LOOKS) {
    assert.equal(lookById(look.id), look);
    assert.equal(
      matchingLook({
        template: look.template,
        backdrop: look.backdrop,
        palette: look.palette,
        fontStyle: look.fontStyle,
      }),
      look,
    );
  }
  assert.equal(lookById("nope"), null);
  assert.equal(
    matchingLook({
      template: "showcase",
      backdrop: "marble-white",
      palette: "ivory",
      fontStyle: null,
    }),
    null,
  );
});

/** Greedy word wrap at `max` characters per line. */
function wrap(text, max) {
  const lines = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (!line) line = word;
    else if ((line + " " + word).length <= max) line += " " + word;
    else {
      lines.push(line);
      line = word;
    }
  }
  lines.push(line);
  return lines;
}

test("every look name fits two lines under a 72 pt poster", () => {
  // About 10 characters per line at 13 pt in 72 pt (run 14: names were cut).
  for (const look of LOOKS)
    for (const name of [look.tr, look.en]) {
      const lines = wrap(name, 10);
      assert.ok(
        lines.length <= 2 && lines.every((l) => l.length <= 10),
        `${look.id}: "${name}" -> ${lines.join(" / ")}`,
      );
    }
});
