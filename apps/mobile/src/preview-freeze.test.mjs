// Run with: node --test apps/mobile/src/*.test.mjs
// The playing preview during a video render (preview-freeze.ts), plus the
// schedule behaviour the hook relies on (preview-schedule.ts).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { previewFreezeStep } from "./preview-freeze.ts";
import { createPreviewSchedule } from "./preview-schedule.ts";

const base = { frozen: false, wasFrozen: false, settled: true, askedIsLatest: true };

test("never frozen: nothing to do, on any state", () => {
  for (const settled of [true, false])
    for (const askedIsLatest of [true, false])
      assert.equal(
        previewFreezeStep({ ...base, settled, askedIsLatest }),
        "none",
      );
});

test("a render starts while the preview ask is unfinished: drop it", () => {
  assert.equal(
    previewFreezeStep({ ...base, frozen: true, settled: false }),
    "drop",
  );
});

test("a render starts after the frames arrived: keep them, ask nothing", () => {
  assert.equal(previewFreezeStep({ ...base, frozen: true, settled: true }), "keep");
});

test("the render ends: an ask that was cut short starts again", () => {
  assert.equal(
    previewFreezeStep({ ...base, wasFrozen: true, settled: false }),
    "restart",
  );
});

test("the render ends: a spec that changed meanwhile is asked for", () => {
  assert.equal(
    previewFreezeStep({ ...base, wasFrozen: true, askedIsLatest: false }),
    "restart",
  );
});

test("the render ends: finished frames for the same spec stay exactly as they were", () => {
  assert.equal(previewFreezeStep({ ...base, wasFrozen: true }), "none");
});

test("still frozen on the next step: nothing is dropped twice", () => {
  assert.equal(
    previewFreezeStep({ ...base, frozen: true, wasFrozen: true, settled: true }),
    "keep",
  );
});

/** A fake clock: timers run only when the test advances time. */
function clock() {
  let now = 0,
    seq = 0;
  const timers = new Map();
  return {
    setTimer(fn, ms) {
      const id = ++seq;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimer(id) {
      timers.delete(id);
    },
    pending: () => timers.size,
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, t]) => t.at <= end)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
        for (let i = 0; i < 10; i++) await Promise.resolve();
      }
      now = end;
    },
  };
}

test("dispose() mid-pass: no frames committed, no retry timer, no native call", async () => {
  const time = clock();
  const calls = [];
  const frames = [];
  let release;
  const schedule = createPreviewSchedule({
    request: (spec, pass) => {
      calls.push(pass);
      return new Promise((resolve) => (release = resolve));
    },
    onFrames: (spec, uris) => frames.push(uris),
    onUpdating: () => {},
    isValid: () => true,
    twoPasses: () => true,
    debounceMs: 400,
    retryMs: 600,
    maxRetries: 8,
    setTimer: time.setTimer,
    clearTimer: time.clearTimer,
  });
  schedule.update({ id: 1 });
  await time.advance(400);
  assert.deepEqual(calls, ["quick"]);
  // The render starts: the hook disposes the schedule.
  schedule.dispose();
  release(["a.png"]);
  for (let i = 0; i < 10; i++) await Promise.resolve();
  assert.deepEqual(frames, [], "a pass finishing after the freeze is ignored");
  await time.advance(10_000);
  assert.deepEqual(calls, ["quick"], "nothing is asked during the freeze");
  assert.equal(time.pending(), 0, "no retry timer is left");
  // The render ended: asking again works as before.
  schedule.update({ id: 1 });
  await time.advance(400);
  assert.deepEqual(calls, ["quick", "quick"]);
});

test("the hook freezes through previewFreezeStep and guards onFrames", () => {
  const hook = readFileSync(
    new URL("./studio/use-playing-preview.ts", import.meta.url),
    "utf8",
  );
  assert.match(hook, /previewFreezeStep\(/);
  assert.match(hook, /if \(frozenNow\.current\) return;/);
  // No ask while frozen, from the spec effect or the retry button.
  assert.match(hook, /if \(!frozenNow\.current\) ask\(spec\)/);
  assert.match(hook, /if \(frozenNow\.current\) return;\s*\n\s*setFailed\(false\)/);
});
