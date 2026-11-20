// Run with: node --test apps/mobile/src/*.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import {
  FLIPBOOK_FPS,
  MAX_FRAMES,
  clockLabel,
  flipbookTimes,
  frameAt,
  frameInterval,
  scrubIndex,
} from "./studio/flipbook.ts";

test("flipbookTimes covers the duration evenly at the rate", () => {
  const times = flipbookTimes(9, FLIPBOOK_FPS);
  assert.equal(times.length, 108);
  assert.equal(times[0], 0);
  assert.ok(times.at(-1) < 9);
  for (let i = 1; i < times.length; i++) assert.ok(times[i] > times[i - 1]);
});

test("flipbookTimes caps the frame count", () => {
  assert.equal(flipbookTimes(30, 12).length, MAX_FRAMES);
  assert.equal(flipbookTimes(10, 12, 20).length, 20);
  assert.equal(flipbookTimes(0.01, 12).length, 1);
});

test("flipbookTimes rejects bad input", () => {
  assert.deepEqual(flipbookTimes(0, 12), []);
  assert.deepEqual(flipbookTimes(10, 0), []);
  assert.deepEqual(flipbookTimes(Number.NaN, 12), []);
  assert.deepEqual(flipbookTimes(10, 12, 0), []);
});

test("frameInterval plays in real time with a floor", () => {
  assert.equal(frameInterval(9, 108), 83);
  assert.equal(frameInterval(9, 3), 3000);
  assert.equal(frameInterval(1, 1000), 40);
  assert.equal(frameInterval(0, 10), 1000 / FLIPBOOK_FPS);
});

test("frameAt loops and stays in range", () => {
  assert.equal(frameAt(0, 10, 120), 0);
  assert.equal(frameAt(5000, 10, 120), 60);
  assert.equal(frameAt(9999, 10, 120), 119);
  assert.equal(frameAt(10000, 10, 120), 0);
  assert.equal(frameAt(-1, 10, 120), 119);
  assert.equal(frameAt(5000, 10, 1), 0);
  assert.equal(frameAt(Number.NaN, 10, 12), 0);
});

test("scrubIndex maps a finger position to a frame", () => {
  assert.equal(scrubIndex(0, 300, 120), 0);
  assert.equal(scrubIndex(150, 300, 120), 60);
  assert.equal(scrubIndex(300, 300, 120), 119);
  assert.equal(scrubIndex(-20, 300, 120), 0);
  assert.equal(scrubIndex(999, 300, 120), 119);
  assert.equal(scrubIndex(10, 0, 120), 0);
});

test("clockLabel formats seconds", () => {
  assert.equal(clockLabel(0), "0:00");
  assert.equal(clockLabel(4.9), "0:04");
  assert.equal(clockLabel(65), "1:05");
  assert.equal(clockLabel(Number.NaN), "0:00");
});

test("the full preview pass is as sharp as the box, within the budget", async () => {
  const { flipbookWidth, PIXEL_BUDGET } = await import("./studio/flipbook.ts");
  // A 408 pt 1:1 box at 3x wants 1224 px; the budget caps it.
  const square = flipbookWidth("1:1", 408, 3);
  assert.ok(square * square <= PIXEL_BUDGET + 2);
  assert.ok(square > 360);
  // A 9:16 frame never exceeds 540 x 960.
  const tall = flipbookWidth("9:16", 240, 3);
  assert.ok(tall <= 540 && tall % 2 === 0);
  // Small boxes still get at least the quick-pass width.
  assert.equal(flipbookWidth("9:16", 100, 2), 360);
  assert.equal(flipbookWidth("4:5", 0, 3), 360);
});
