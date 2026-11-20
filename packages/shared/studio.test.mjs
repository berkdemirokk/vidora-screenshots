import assert from "node:assert/strict";
import test from "node:test";
import { clipRange, endpoint, validSrt } from "./studio.ts";
test("Caption validation accepts normal cues and rejects invalid timings", () => {
  assert.equal(validSrt("1\n00:00:00,000 --> 00:00:02,000\nMerhaba\n"), true);
  assert.equal(validSrt("00:00:02.000 --> 00:00:03.500\nHello"), true);
  assert.equal(validSrt("1\n00:00:02,000 --> 00:00:01,000\nHello"), false);
  assert.equal(validSrt("1\n00:60:00,000 --> 01:01:00,000\nHello"), false);
  assert.equal(validSrt("1\n00:00:00,000 --> 00:00:01,000\n"), false);
});
import { parseClipMetadata } from "../../apps/mobile/src/clip-metadata.ts";
test("Corrupt or unsafe clip metadata does not hide valid records", () => {
  const id = "01985f41-a4b5-41c2-84d0-2a2b2c2d2e2f";
  const clip = {
    id,
    file: id + ".mp4",
    name: "Klip",
    kind: "source",
    created: 1,
    duration: 2,
  };
  assert.deepEqual(parseClipMetadata(JSON.stringify(clip), id + ".json"), clip);
  assert.equal(parseClipMetadata("{", id + ".json"), null);
  assert.equal(
    parseClipMetadata(
      JSON.stringify({ ...clip, file: "../private.mp4" }),
      id + ".json",
    ),
    null,
  );
  assert.equal(
    parseClipMetadata(JSON.stringify({ ...clip, duration: -1 }), id + ".json"),
    null,
  );
  assert.equal(parseClipMetadata(JSON.stringify(clip), "other.json"), null);
});
test("Credentials are only sent to a clean HTTPS origin or local loopback", () => {
  for (const s of [
    "http://studio.test",
    "https://name:secret@studio.test",
    "https://studio.test/?token=x",
    "file:///tmp",
    "https://studio.test/v1",
    "https://studio.test/#secret",
  ])
    assert.throws(() => endpoint(s));
  assert.equal(endpoint("http://127.0.0.1:8000/"), "http://127.0.0.1:8000");
  assert.equal(endpoint("https://my.studio/"), "https://my.studio");
});
test("Trim selection respects imported duration and Turkish decimal input", () => {
  assert.deepEqual(clipRange("0,5", "1.5", 2), { start: 0.5, end: 1.5 });
  for (const [a, b] of [
    ["", "1"],
    ["1", ""],
    ["1", "1"],
    ["-1", "1"],
    ["2", "1"],
    ["0", "3"],
    ["0", "NaN"],
  ])
    assert.equal(clipRange(a, b, 2), null);
});
