// Run with: node --test apps/mobile/src/*.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import {
  BRAND_FONTS,
  BRAND_SWATCHES,
  brandAccent,
  contrastRatio,
  isBrandKitEmpty,
  onColor,
  parseBrandKit,
  serializeBrandKit,
} from "./brand-kit.ts";
import { FONT_STYLES, buildSpec, specProblems } from "./product-templates.ts";

test("only bundled fonts are offered", () => {
  assert.deepEqual(BRAND_FONTS, FONT_STYLES);
});

test("a kit survives a round trip", () => {
  const kit = { accent: "#D7263D", font: "impact", logo: "logo.png" };
  assert.deepEqual(parseBrandKit(serializeBrandKit(kit)), kit);
});

test("unknown values are dropped, an empty kit is null", () => {
  assert.equal(parseBrandKit(null), null);
  assert.equal(parseBrandKit("not json"), null);
  assert.equal(
    parseBrandKit(
      JSON.stringify({ accent: "red", font: "comic", logo: "../x.png" }),
    ),
    null,
  );
  assert.deepEqual(
    parseBrandKit(
      JSON.stringify({
        accent: "#123456",
        font: "modern",
        logo: "evil/../logo.png",
      }),
    ),
    { accent: null, font: "modern", logo: null },
  );
  assert.equal(isBrandKitEmpty({ accent: null, font: null, logo: null }), true);
});

test("every swatch reads under its own type colour (4.5:1)", () => {
  for (const swatch of BRAND_SWATCHES)
    assert.ok(contrastRatio(swatch.hex, onColor(swatch.hex)) >= 4.5, swatch.id);
});

test("brandAccent gives the accent and a readable type colour", () => {
  assert.equal(brandAccent(null), null);
  assert.equal(brandAccent({ accent: null, font: "modern", logo: null }), null);
  assert.deepEqual(
    brandAccent({ accent: "#1F3A93", font: null, logo: null }),
    { accent: "#1F3A93", onAccent: "#FFFFFF" },
  );
});

test("templates take the brand accent where it shows, and ignore it where it does not", () => {
  const input = {
    template: "campaign",
    palette: "ivory",
    product: "file:///tmp/p.png",
    headline: "Yaz",
    price: "899 TL",
    badge: "%40 indirim",
    cta: "Hemen sipariş ver",
    quality: "1080p",
    watermark: false,
    music: null,
  };
  const brand = { accent: "#D7263D", onAccent: "#FFFFFF" };
  const plain = buildSpec(input);
  const branded = buildSpec({ ...input, brandAccent: brand });
  assert.notDeepEqual(branded.texts, plain.texts);
  assert.deepEqual(specProblems(branded), []);
  const navy = { accent: "#1F3A93", onAccent: "#FFFFFF" };
  assert.deepEqual(
    buildSpec({ ...input, palette: "noir", brandAccent: navy }).texts,
    buildSpec({ ...input, palette: "noir" }).texts,
  );
});
