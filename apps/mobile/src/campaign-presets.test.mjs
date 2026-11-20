// Run with: node --test apps/mobile/src/*.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import {
  CAMPAIGN_PRESETS,
  PRESET_MAX,
  activePreset,
  presetText,
} from "./campaign-presets.ts";

test("the four Turkish presets exist with their test ids", () => {
  assert.deepEqual(
    CAMPAIGN_PRESETS.map((p) => [p.testID, p.tr]),
    [
      ["preset-kargo-bedava", "Kargo bedava"],
      ["preset-son-3", "Son 3 ürün"],
      ["preset-indirim-40", "%40 indirim"],
      ["preset-kapida-odeme", "Kapıda ödeme"],
    ],
  );
});

test("every preset fits the badge in both languages", () => {
  for (const p of CAMPAIGN_PRESETS)
    for (const lang of ["tr", "en"])
      assert.ok(presetText(p, lang).length <= PRESET_MAX, p.id + lang);
});

test("the active preset is found by its text, case-insensitively", () => {
  assert.equal(activePreset("kargo bedava", "tr"), "kargo-bedava");
  assert.equal(activePreset(" KAPIDA ÖDEME ", "tr"), "kapida-odeme");
  assert.equal(activePreset("40% off", "en"), "indirim-40");
  assert.equal(activePreset("Yeni sezon", "tr"), null);
});
