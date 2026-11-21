// Run with: node --test apps/mobile/src/*.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeLastLook,
  parseLastCategory,
  parseLastLook,
  serializeLastLook,
} from "./last-look.ts";

const ids = ["oak", "linen"];

test("round trip keeps backdrop and cta only", () => {
  const raw = serializeLastLook({ backdrop: "oak", cta: " Order now " });
  assert.deepEqual(parseLastLook(raw, ids), { backdrop: "oak", cta: "Order now" });
  assert.deepEqual(Object.keys(JSON.parse(raw)).sort(), ["backdrop", "cta"]);
});

test("unknown backdrop id is dropped, cta kept", () => {
  const raw = JSON.stringify({ backdrop: "gone", cta: "Buy" });
  assert.deepEqual(parseLastLook(raw, ids), { backdrop: null, cta: "Buy" });
});

test("garbage and empty values give null", () => {
  assert.equal(parseLastLook("not json", ids), null);
  assert.equal(parseLastLook(null, ids), null);
  assert.equal(parseLastLook(JSON.stringify({ backdrop: "x", cta: 5 }), ids), null);
});

test("an empty new look keeps the remembered one", () => {
  const prev = { backdrop: "oak", cta: "Buy" };
  assert.deepEqual(mergeLastLook(prev, { backdrop: null, cta: " " }), prev);
  assert.deepEqual(mergeLastLook(prev, { backdrop: "linen", cta: "" }), {
    backdrop: "linen",
    cta: "Buy",
  });
  assert.equal(mergeLastLook(null, { backdrop: null, cta: "" }), null);
});

test("last category: only a known id comes back", () => {
  const ids = ["cosmetics", "food", "fashion"];
  assert.equal(parseLastCategory("food", ids), "food");
  assert.equal(parseLastCategory("weapons", ids), null);
  assert.equal(parseLastCategory("", ids), null);
  assert.equal(parseLastCategory(null, ids), null);
  assert.equal(parseLastCategory(undefined, ids), null);
});
