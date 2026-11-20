// Run with: node --test apps/mobile/src/*.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { createPreviewSchedule } from "./preview-schedule.ts";
import { createNativeQueue, isStaleError } from "./native-queue.ts";

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
        await flush();
      }
      now = end;
      await flush();
    },
  };
}
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

function setup(answers) {
  const c = clock();
  const requests = [],
    frames = [],
    busy = [];
  const schedule = createPreviewSchedule({
    request: async (spec, pass) => {
      requests.push(`${spec.name}:${pass}`);
      const answer = answers.shift();
      if (answer instanceof Error) throw answer;
      return answer === undefined ? [spec.name + "-" + pass] : answer;
    },
    onFrames: (spec, uris) => frames.push(`${spec.name}:${uris[0]}`),
    onUpdating: (value) => busy.push(value),
    isValid: (spec) => spec.valid !== false,
    twoPasses: () => true,
    debounceMs: 400,
    retryMs: 300,
    maxRetries: 5,
    setTimer: c.setTimer,
    clearTimer: c.clearTimer,
  });
  return { c, schedule, requests, frames, busy };
}

test("cut-out arrives, backdrop resolves: frames only for the final spec", async () => {
  const { c, schedule, requests, frames, busy } = setup([]);
  // The cut-out: a spec without the backdrop scene yet.
  schedule.update({ name: "no-scene" });
  await c.advance(150);
  // The backdrop file resolves: the spec gains its scene.
  schedule.update({ name: "with-scene" });
  await c.advance(1000);
  assert.deepEqual(requests, ["with-scene:quick", "with-scene:full"]);
  assert.deepEqual(frames, [
    "with-scene:with-scene-quick",
    "with-scene:with-scene-full",
  ]);
  assert.equal(busy.at(-1), false);
});

test("a first pass cancelled as stale is retried until frames come", async () => {
  const stale = new Error(
    "product-preview-stale: A newer preview replaced this one.",
  );
  // Quick pass: stale twice (null after the error is caught), then frames.
  const { c, schedule, requests, frames, busy } = setup([stale, null]);
  schedule.update({ name: "first" });
  await c.advance(400);
  assert.deepEqual(frames, [], "nothing yet");
  assert.equal(busy.at(-1), true, "still updating while it retries");
  await c.advance(2000);
  assert.deepEqual(requests, [
    "first:quick",
    "first:quick",
    "first:quick",
    "first:full",
  ]);
  assert.deepEqual(frames, ["first:first-quick", "first:first-full"]);
  assert.equal(busy.at(-1), false);
});

test("a stale full pass keeps the quick frames and retries only the full pass", async () => {
  const { c, schedule, requests, frames } = setup([undefined, null]);
  schedule.update({ name: "a" });
  await c.advance(2000);
  assert.deepEqual(requests, ["a:quick", "a:full", "a:full"]);
  assert.deepEqual(frames, ["a:a-quick", "a:a-full"]);
});

test("an invalid spec is not retried and an edit cancels a pending retry", async () => {
  const bad = setup([null]);
  bad.schedule.update({ name: "bad", valid: false });
  await bad.c.advance(5000);
  assert.deepEqual(bad.requests, ["bad:quick"]);
  assert.equal(bad.busy.at(-1), false);

  const edit = setup([null]);
  edit.schedule.update({ name: "old" });
  await edit.c.advance(400); // first try fails, a retry is pending
  edit.schedule.update({ name: "new" });
  await edit.c.advance(2000);
  assert.deepEqual(edit.requests, ["old:quick", "new:quick", "new:full"]);
  assert.deepEqual(edit.frames, ["new:new-quick", "new:new-full"]);
});

test("the native queue never overlaps jobs and runs high before low", async () => {
  const queue = createNativeQueue();
  const log = [];
  let active = 0;
  const job = (name) => async () => {
    active++;
    assert.equal(active, 1, "overlap");
    log.push(name);
    await flush();
    active--;
    return name;
  };
  const done = [
    queue.enqueue(job("poster-1"), "low"),
    queue.enqueue(job("poster-2"), "low"),
    queue.enqueue(job("preview"), "high"),
    queue.enqueue(job("poster-3"), "low"),
  ];
  assert.deepEqual(await Promise.all(done), [
    "poster-1",
    "poster-2",
    "preview",
    "poster-3",
  ]);
  // poster-1 was already running; the preview jumped the other posters.
  assert.deepEqual(log, ["poster-1", "preview", "poster-2", "poster-3"]);
  // A failing job does not stop the queue.
  await assert.rejects(
    queue.enqueue(async () => {
      throw new Error("x");
    }),
  );
  assert.equal(await queue.enqueue(async () => 7), 7);
  assert.ok(isStaleError(new Error("product-preview-stale: x")));
  assert.ok(!isStaleError(new Error("other")));
});

test("onFailed fires only when a valid spec got no frames at all", async () => {
  const c = clock();
  const failed = [];
  const make = (answers) =>
    createPreviewSchedule({
      request: async () => answers.shift() ?? null,
      onFrames: () => {},
      onUpdating: () => {},
      isValid: () => true,
      twoPasses: () => true,
      debounceMs: 10,
      retryMs: 10,
      maxRetries: 2,
      setTimer: c.setTimer,
      clearTimer: c.clearTimer,
      onFailed: () => failed.push("failed"),
    });
  make([null, null, null]).update({ name: "x" });
  await c.advance(500);
  assert.deepEqual(failed, ["failed"]);
  // Quick frames came: a missing full pass is not a failure.
  failed.length = 0;
  make([["q"], null, null, null]).update({ name: "y" });
  await c.advance(500);
  assert.deepEqual(failed, []);
});
