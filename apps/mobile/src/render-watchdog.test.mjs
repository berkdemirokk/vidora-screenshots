// Run with: node --test apps/mobile/src/*.test.mjs
// The render stall watchdog (render-watchdog.ts) and the QA timeline labels
// (render-diag.ts): pure, time injected.
import assert from "node:assert/strict";
import test from "node:test";
import {
  STALL_AFTER_MS,
  STALL_AFTER_MS_QA,
  WARN_AFTER_MS,
  createRenderWatchdog,
  stallBudgetMs,
} from "./render-watchdog.ts";
import {
  RENDER_DIAG_IDLE,
  renderDiagCancelled,
  renderDiagDone,
  renderDiagFail,
  renderDiagProgress,
  renderDiagStart,
  renderFailCode,
  secondsBetween,
} from "./render-diag.ts";

function setup(options = {}) {
  let now = 1_000_000;
  const dog = createRenderWatchdog({ now: () => now, ...options });
  return {
    dog,
    advance(ms) {
      now += ms;
    },
  };
}
const SECOND = 1000;

test("the budgets are 30 s to warn, 180 s to cancel, 600 s in the QA build", () => {
  assert.equal(WARN_AFTER_MS, 30_000);
  assert.equal(STALL_AFTER_MS, 180_000);
  assert.equal(STALL_AFTER_MS_QA, 600_000);
  assert.equal(stallBudgetMs(false), 180_000);
  assert.equal(stallBudgetMs(true), 600_000);
});

test("idle: nothing to say before the render starts", () => {
  const { dog, advance } = setup();
  advance(500 * SECOND);
  assert.deepEqual(dog.check(), { warning: false, cancel: false, quietMs: 0 });
  assert.equal(dog.phase, "idle");
});

test("a render that keeps sending progress is never warned about", () => {
  const { dog, advance } = setup();
  dog.start();
  for (let i = 0; i < 40; i++) {
    advance(20 * SECOND);
    dog.feed();
    const verdict = dog.check();
    assert.equal(verdict.warning, false);
    assert.equal(verdict.cancel, false);
  }
  assert.equal(dog.phase, "running");
});

test("quiet for 29 s: nothing; at 30 s: the quiet note", () => {
  const { dog, advance } = setup();
  dog.start();
  advance(29 * SECOND);
  assert.equal(dog.check().warning, false);
  advance(1 * SECOND);
  const verdict = dog.check();
  assert.equal(verdict.warning, true);
  assert.equal(verdict.cancel, false);
  assert.equal(verdict.quietMs, 30_000);
});

test("quiet for 180 s: cancel, once, and the note is replaced", () => {
  const { dog, advance } = setup();
  dog.start();
  advance(179 * SECOND);
  assert.deepEqual(
    { w: dog.check().warning, c: dog.check().cancel },
    { w: true, c: false },
  );
  advance(1 * SECOND);
  const first = dog.check();
  assert.equal(first.cancel, true);
  assert.equal(first.warning, false);
  assert.equal(dog.stalled, true);
  assert.equal(dog.phase, "cancelling");
  // Asked again (the cancel is still being waited for): no second cancel.
  advance(30 * SECOND);
  assert.deepEqual(dog.check(), { warning: false, cancel: false, quietMs: 0 });
});

test("the QA build waits 600 s before it cancels", () => {
  const { dog, advance } = setup({ cancelAfterMs: stallBudgetMs(true) });
  dog.start();
  advance(599 * SECOND);
  assert.equal(dog.check().cancel, false);
  advance(1 * SECOND);
  assert.equal(dog.check().cancel, true);
});

test("progress after the note clears it and restarts both clocks", () => {
  const { dog, advance } = setup();
  dog.start();
  advance(45 * SECOND);
  assert.equal(dog.check().warning, true);
  dog.feed();
  assert.equal(dog.check().warning, false);
  // 29 s later still quiet-free; 30 s after the progress the note is back.
  advance(29 * SECOND);
  assert.equal(dog.check().warning, false);
  advance(1 * SECOND);
  assert.equal(dog.check().warning, true);
  // The cancel clock also restarted: 179 s after the last progress is fine.
  advance(149 * SECOND);
  assert.equal(dog.check().cancel, false);
  advance(1 * SECOND);
  assert.equal(dog.check().cancel, true);
});

test("İptal pressed: no note and no watchdog cancel afterwards", () => {
  const { dog, advance } = setup();
  dog.start();
  advance(40 * SECOND);
  assert.equal(dog.check().warning, true);
  dog.cancelPressed();
  assert.equal(dog.phase, "cancelling");
  assert.equal(dog.check().warning, false);
  advance(1000 * SECOND);
  const verdict = dog.check();
  assert.equal(verdict.cancel, false);
  assert.equal(dog.stalled, false, "a user cancel is not a stall");
  // Late progress while cancelling changes nothing.
  dog.feed();
  assert.equal(dog.check().warning, false);
});

test("render finished: silent, whatever time passes", () => {
  const { dog, advance } = setup();
  dog.start();
  advance(35 * SECOND);
  assert.equal(dog.check().warning, true);
  dog.finish();
  advance(1000 * SECOND);
  assert.deepEqual(dog.check(), { warning: false, cancel: false, quietMs: 0 });
  dog.feed();
  assert.equal(dog.phase, "finished");
});

test("a new render starts clean after a stalled one", () => {
  const { dog, advance } = setup();
  dog.start();
  advance(181 * SECOND);
  assert.equal(dog.check().cancel, true);
  dog.finish();
  dog.start();
  assert.equal(dog.stalled, false);
  assert.equal(dog.phase, "running");
  advance(10 * SECOND);
  assert.deepEqual(dog.check(), { warning: false, cancel: false, quietMs: 10_000 });
});

test("a clock that jumps backwards never warns or cancels", () => {
  let now = 5_000_000;
  const dog = createRenderWatchdog({ now: () => now });
  dog.start();
  now -= 10 * 60 * SECOND;
  assert.deepEqual(dog.check(), { warning: false, cancel: false, quietMs: 0 });
});

test("QA timeline labels", () => {
  assert.equal(RENDER_DIAG_IDLE, "render:idle");
  assert.equal(
    renderDiagStart("1080p", { width: 269.6, height: 479.9 }),
    "render:start q=1080p box=270x480",
  );
  assert.equal(renderDiagProgress(0, 3), "render:p=0 t=3s");
  assert.equal(renderDiagProgress(0.17, 21), "render:p=17 t=21s");
  assert.equal(renderDiagProgress(1.4, 70), "render:p=100 t=70s");
  assert.equal(renderDiagDone(64), "render:done t=64s");
  assert.equal(renderDiagFail("stalled", 181), "render:fail code=stalled t=181s");
  assert.equal(renderDiagCancelled(12), "render:cancelled t=12s");
  assert.equal(secondsBetween(1000, 4999), 3);
  assert.equal(secondsBetween(5000, 1000), 0);
  // The flow's stop pattern.
  const stop = /render:(fail|cancelled).*/;
  assert.ok(stop.test(renderDiagFail("x", 1)));
  assert.ok(stop.test(renderDiagCancelled(1)));
  assert.ok(!stop.test(renderDiagProgress(0.5, 5)));
});

test("failure codes: the native code when there is one, else a safe slug", () => {
  assert.equal(
    renderFailCode(new Error("product-no-space: out of space")),
    "product-no-space",
  );
  assert.equal(
    renderFailCode(
      new Error("The video could not be made. Please try again. (editor-backgrounded)"),
    ),
    "editor-backgrounded",
  );
  assert.equal(
    renderFailCode(new Error("Your iPhone is out of storage. Free up some space")),
    "your-iphone-is-out-of-storage-free-up-so",
  );
  assert.equal(renderFailCode(undefined), "error");
  assert.equal(renderFailCode(new Error("")), "error");
  assert.match(renderFailCode(new Error("/var/mobile/x/y.mp4 failed")), /^[a-z0-9-]+$/);
});
