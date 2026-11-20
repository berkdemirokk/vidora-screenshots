// Run with: node --test apps/mobile/src/*.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { PRICE_TAGS, applyPriceTag, isPriceTag } from "./price-tags.ts";
import {
  ALL_RATIOS,
  PALETTES,
  TEMPLATES,
  buildSpec,
  specProblems,
  textOverlapProblems,
  clearanceProblems,
} from "./product-templates.ts";

const base = {
  template: "showcase",
  palette: "noir",
  product: "file:///tmp/product.png",
  headline: "Gül & Amber Eau de Parfum",
  price: "899 TL",
  oldPrice: "1.299 TL",
  badge: "%30 indirim",
  cta: "Hemen sipariş ver",
  quality: "1080p",
  watermark: false,
  music: null,
};

test("price tags have unique ids and test ids", () => {
  assert.ok(PRICE_TAGS.length >= 2 && PRICE_TAGS.length <= 3);
  assert.equal(new Set(PRICE_TAGS.map((t) => t.id)).size, PRICE_TAGS.length);
  for (const tag of PRICE_TAGS) {
    assert.equal(tag.testID, "pricetag-" + tag.id);
    assert.ok(isPriceTag(tag.id));
  }
  assert.equal(isPriceTag("nope"), false);
});

test("every tag keeps the old price struck through and valid", () => {
  for (const tag of PRICE_TAGS)
    for (const template of TEMPLATES)
      for (const ratio of ALL_RATIOS) {
        const spec = buildSpec({
          ...base,
          template: template.id,
          ratio,
          priceTag: tag.id,
        });
        const label = [tag.id, template.id, ratio].join("/");
        assert.deepEqual(specProblems(spec), [], label);
        assert.deepEqual(textOverlapProblems(spec), [], label);
        assert.deepEqual(clearanceProblems(spec), [], label);
        const old = spec.texts.find((t) => t.text === "1.299 TL");
        assert.ok(!old || old.strike === true, label);
      }
});

test("no tag, or no price, leaves the spec as it was", () => {
  const plain = buildSpec(base);
  assert.deepEqual(buildSpec({ ...base, priceTag: null }), plain);
  const noPrice = buildSpec({ ...base, price: "", priceTag: "pill" });
  assert.deepEqual(noPrice, buildSpec({ ...base, price: "" }));
});

test("pill puts the price on the accent colour", () => {
  const spec = buildSpec({ ...base, palette: "ivory", priceTag: "pill" });
  const price = spec.texts.find((t) => t.text === "899 TL");
  assert.notEqual(price.fill, "");
});

test("applyPriceTag ignores a missing price text", () => {
  const texts = [{ text: "x", start: 0, end: 1, y: 0.5, size: 0.05, weight: "bold", color: "#000000", fill: "", animation: "fade" }];
  assert.equal(
    applyPriceTag(texts, "pill", "899 TL", "", { ink: "#000000", accent: "#FF7A00", onAccent: "#141210" }),
    texts,
  );
});

test("every palette stays valid with each tag", () => {
  for (const tag of PRICE_TAGS)
    for (const palette of PALETTES)
      assert.deepEqual(
        specProblems(buildSpec({ ...base, palette: palette.id, priceTag: tag.id })),
        [],
        tag.id + "/" + palette.id,
      );
});
