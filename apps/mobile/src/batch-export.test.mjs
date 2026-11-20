// Run with: node --test apps/mobile/src/*.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import {
  BATCH_LIMIT,
  addPhotos,
  batchProgress,
  createBatch,
  parseBatch,
  resumeBatch,
  retryFailed,
  runBatch,
  serializeBatch,
} from "./batch-queue.ts";
import {
  EXPORT_ALL_STEPS,
  exportAllSummaryLine,
  runExportAll,
} from "./export-all.ts";
import { STILL_STYLES } from "./marketplace-images.ts";
import { frameSize, stillSize } from "./product-templates.ts";

let n = 0;
const id = () => "id" + ++n;

test("batch caps at 10 photos and drops duplicates", () => {
  const photos = Array.from({ length: 14 }, (_, i) => "p" + i);
  const q = createBatch("b", [...photos, "p0"], id);
  assert.equal(q.items.length, BATCH_LIMIT);
  assert.equal(addPhotos(q, ["x"], id).items.length, BATCH_LIMIT);
});

test("batch resumes: working goes back to pending, survives JSON", () => {
  let q = createBatch("b", ["a", "b"], id);
  q.items[0].status = "working";
  q.items[1].status = "failed";
  const back = parseBatch(serializeBatch(q));
  assert.deepEqual(back, q);
  const r = resumeBatch(back);
  assert.equal(r.items[0].status, "pending");
  assert.equal(retryFailed(r).items[1].status, "pending");
  assert.equal(parseBatch("{"), null);
});

test("runBatch goes one by one, saves each step, isolates failures", async () => {
  const q = createBatch("b", ["a", "b", "c"], id);
  const saves = [];
  let active = 0,
    maxActive = 0;
  const done = await runBatch(q, {
    process: async (item) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active--;
      if (item.photo === "b") throw new Error("no subject");
      return "clip-" + item.photo;
    },
    save: (x) => saves.push(batchProgress(x).done),
    describe: () => ({ tr: "x", en: "x" }),
  });
  assert.equal(maxActive, 1);
  assert.deepEqual(
    done.items.map((i) => i.status),
    ["done", "failed", "done"],
  );
  assert.ok(saves.length >= 6);
});

test("runBatch cancel leaves the running item pending", async () => {
  const q = createBatch("b", ["a", "b"], id);
  let cancelled = false;
  const done = await runBatch(q, {
    process: async () => {
      cancelled = true;
      throw new Error("cancel");
    },
    save: () => {},
    isCancelled: () => cancelled,
    describe: () => ({ tr: "x", en: "x" }),
  });
  assert.deepEqual(
    done.items.map((i) => i.status),
    ["pending", "pending"],
  );
});

test("export all: six steps in order; failures counted, fatal stops", async () => {
  assert.deepEqual(
    EXPORT_ALL_STEPS.map((s) => s.id),
    [
      "video-9-16",
      "video-4-5",
      "video-1-1",
      "still-main",
      "still-instagram",
      "still-story",
    ],
  );
  const order = [];
  const a = await runExportAll(EXPORT_ALL_STEPS, async (s) => {
    order.push(s.id);
    if (s.id === "video-4-5") throw new Error("x");
  });
  assert.equal(order.length, 6);
  assert.equal(a.saved, 5);
  assert.equal(a.failed.length, 1);
  assert.match(exportAllSummaryLine(a, "en"), /5\/6/);
  const b = await runExportAll(
    EXPORT_ALL_STEPS,
    async () => {
      throw new Error("perm");
    },
    { isFatal: () => true },
  );
  assert.equal(b.aborted, true);
  assert.equal(b.failed.length, 1);
});

test("still styles have the sizes they promise", () => {
  const size = Object.fromEntries(
    STILL_STYLES.map((s) => [s.id, stillSize(s.ratio, s.width)]),
  );
  assert.deepEqual(size.main, { width: 1200, height: 1800 });
  assert.deepEqual(size.instagram, { width: 1080, height: 1350 });
  assert.deepEqual(size.story, { width: 1080, height: 1920 });
  assert.deepEqual(frameSize("4:5", "1080p"), { width: 1080, height: 1350 });
  assert.deepEqual(frameSize("9:16", "1080p"), { width: 1080, height: 1920 });
});
