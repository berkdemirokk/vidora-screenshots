// Run with: node --test apps/mobile/src/*.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import {
  MARKETPLACE_IMAGES,
  marketplaceImageById,
  marketplaceTextRisk,
  presetQuality,
} from "./marketplace-images.ts";
import {
  buildMainImageSpec,
  specProblems,
  stillSize,
} from "./product-templates.ts";

test("marketplace images have the verified pixel sizes", () => {
  const sizes = Object.fromEntries(
    MARKETPLACE_IMAGES.map((item) => [
      item.id,
      stillSize(item.ratio, item.width),
    ]),
  );
  assert.deepEqual(sizes, {
    trendyol: { width: 1200, height: 1800 },
    square: { width: 1500, height: 1500 },
    amazon: { width: 2000, height: 2000 },
  });
  for (const item of MARKETPLACE_IMAGES)
    assert.ok(item.tr.endsWith(item.width + "×" + sizes[item.id].height));
});

test("every marketplace image is a valid text-free spec on white", () => {
  for (const item of MARKETPLACE_IMAGES)
    for (const productSize of [
      { width: 800, height: 1000 },
      { width: 1600, height: 500 },
    ]) {
      const spec = buildMainImageSpec({
        product: "file:///tmp/p.png",
        productSize,
        ratio: item.ratio,
        fill: item.fill,
      });
      assert.deepEqual(specProblems(spec), [], item.id);
      assert.equal(spec.texts.length, 0, item.id);
      assert.equal(spec.background.top.toUpperCase(), "#FFFFFF");
      assert.equal(spec.background.bottom.toUpperCase(), "#FFFFFF");
      assert.equal(spec.watermark, false);
    }
  assert.equal(marketplaceImageById("amazon").width, 2000);
});

test("the marketplace text hint shows only for the marketplace preset", () => {
  const none = { price: "", oldPrice: "", badge: " " };
  assert.equal(marketplaceTextRisk("trendyol", none), false);
  assert.equal(
    marketplaceTextRisk("trendyol", { ...none, price: "899 TL" }),
    true,
  );
  assert.equal(
    marketplaceTextRisk("trendyol", { ...none, badge: "%20" }),
    true,
  );
  assert.equal(
    marketplaceTextRisk("reels", { ...none, price: "899 TL" }),
    false,
  );
  assert.equal(presetQuality("trendyol"), "720p");
  assert.equal(presetQuality("reels"), "1080p");
});
