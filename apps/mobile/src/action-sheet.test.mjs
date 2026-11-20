// Run with: node --test apps/mobile/src/*.test.mjs
// Guard: one native action sheet at a time (run 22: two stacked sheets, the
// photo picker could not present and the cut-out stayed busy).
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createSheetGate, SHEET_WINDOW_MS } from "./action-sheet-gate.ts";

function clock(start = 1000) {
  let time = start;
  return { now: () => time, advance: (ms) => (time += ms), set: (v) => (time = v) };
}

test("a second call inside the window is dropped", () => {
  const c = clock();
  const gate = createSheetGate(c.now);
  assert.ok(gate.acquire());
  c.advance(SHEET_WINDOW_MS - 1);
  assert.equal(gate.acquire(), null);
  c.advance(0);
  assert.equal(gate.acquire(), null);
});

test("a call after the callback fired is allowed at once", () => {
  const c = clock();
  const gate = createSheetGate(c.now);
  const release = gate.acquire();
  c.advance(10);
  release();
  assert.ok(gate.acquire());
});

test("a call after the window is allowed even if the callback never fired", () => {
  const c = clock();
  const gate = createSheetGate(c.now);
  assert.ok(gate.acquire());
  c.advance(SHEET_WINDOW_MS);
  assert.ok(gate.acquire());
});

test("a refused call does not extend the window", () => {
  const c = clock();
  const gate = createSheetGate(c.now);
  assert.ok(gate.acquire());
  c.advance(500);
  assert.equal(gate.acquire(), null);
  c.advance(300);
  assert.ok(gate.acquire());
});

test("a late callback of an older sheet does not close the newer one", () => {
  const c = clock();
  const gate = createSheetGate(c.now);
  const first = gate.acquire();
  c.advance(SHEET_WINDOW_MS);
  assert.ok(gate.acquire());
  c.advance(10);
  first();
  assert.equal(gate.acquire(), null);
});

test("a clock that jumps back never sticks the guard", () => {
  const c = clock(5000);
  const gate = createSheetGate(c.now);
  assert.ok(gate.acquire());
  c.set(100);
  assert.ok(gate.acquire());
});

function sources(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sources(full));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(full);
  }
  return out;
}

test("only the wrapper calls ActionSheetIOS.showActionSheetWithOptions", () => {
  const mobile = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const wrapper = path.join(mobile, "src", "action-sheet.ts");
  const offenders = [
    ...sources(path.join(mobile, "app")),
    ...sources(path.join(mobile, "src")),
  ].filter(
    (file) =>
      file !== wrapper &&
      /\bshowActionSheetWithOptions\b/.test(readFileSync(file, "utf8")),
  );
  assert.deepEqual(offenders, []);
  assert.match(readFileSync(wrapper, "utf8"), /ActionSheetIOS\.showActionSheetWithOptions/);
});
