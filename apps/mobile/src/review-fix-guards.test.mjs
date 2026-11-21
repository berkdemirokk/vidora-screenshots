// Run with: node --test apps/mobile/src/*.test.mjs
// Guards for review fixes (2026-11-20).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const mobile = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(mobile, file), "utf8");

/** Text from `start` up to (not including) the next `end` after it. */
function slice(text, start, end) {
  const from = text.indexOf(start);
  assert.notEqual(from, -1, `missing: ${start}`);
  const to = text.indexOf(end, from + start.length);
  assert.notEqual(to, -1, `missing end: ${end}`);
  return text.slice(from, to);
}

test("openEditor drops the library video link, so a resumed draft cannot replace it", () => {
  const body = slice(
    read("app/create.tsx"),
    "const openEditor = (next: Cutout, ask = false) => {",
    "\n  };",
  );
  assert.ok(body.includes("editTarget.current = null"));
  assert.ok(body.includes("sourceClip: null"));
});

test("pro-context: products wait is bounded and stale answers are dropped; purchase is not bounded", () => {
  const src = read("src/pro-context.tsx");
  assert.ok(src.includes("PRODUCTS_WAIT_MS"));
  assert.ok(src.includes("Promise.race"));
  assert.ok(src.includes("id !== productsSeq.current"));
  const purchase = slice(src, "purchase: async (id) =>", "restore: async");
  assert.ok(!purchase.includes("Promise.race"));
});
