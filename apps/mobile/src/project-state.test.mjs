// Run with: node --test apps/mobile/src/*.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import {
  clampTrim,
  cleanName,
  defaultOptions,
  formatTime,
  moveItem,
  parseProject,
  totalDuration,
} from "./project-state.ts";
import { parseClipMetadata } from "./clip-metadata.ts";
import { defaultCaptions } from "./captions.ts";

const id = "01985f41-a4b5-41c2-84d0-2a2b2c2d2e2f";
const clipId = "11985f41-a4b5-41c2-84d0-2a2b2c2d2e2f";
const project = {
  version: 1,
  id,
  name: "Tatil",
  updated: 5,
  clips: [{ clipId, start: 0.5, end: 2 }],
  options: {
    ...defaultOptions(),
    music: { file: clipId + ".mp3", name: "song.mp3", volume: 0.4 },
  },
  captions: {
    enabled: true,
    style: "pop",
    position: "center",
    color: "#FF5CA8",
    font: "system",
    wordsPerCue: null,
    keywords: false,
    emoji: false,
    transcripts: {
      [clipId]: {
        locale: "tr-TR",
        words: [
          { text: "Merhaba", start: 0.6, end: 1 },
          { text: "dünya", start: 1, end: 1.4, breakAfter: true },
        ],
      },
    },
    edits: { [clipId]: [{ text: "Selam", start: 0.6, end: 1.4 }] },
  },
};
const file = id + ".project.json";
const parse = (value, name = file) => parseProject(JSON.stringify(value), name);

test("Valid projects round-trip and unknown fields are dropped", () => {
  assert.deepEqual(parse(project), project);
  assert.deepEqual(parse({ ...project, extra: true }), project);
  assert.deepEqual(parse({ ...project, clips: [] }), { ...project, clips: [] });
});

test("Projects saved before captions existed still load", () => {
  const legacy = { ...project };
  delete legacy.captions;
  assert.deepEqual(parse(legacy), { ...project, captions: defaultCaptions() });
});

test("Corrupt or unsafe projects are rejected", () => {
  assert.equal(parseProject("{", file), null);
  assert.equal(parseProject("null", file), null);
  assert.equal(parse(project, "other.project.json"), null);
  const bad = [
    { version: 2 },
    { id: "../x" },
    { name: "  " },
    { name: "x".repeat(81) },
    { updated: "now" },
    { clips: "none" },
    { clips: [{ clipId, start: 2, end: 1 }] },
    { clips: [{ clipId, start: -1, end: 1 }] },
    { clips: [{ clipId: "../" + clipId, start: 0, end: 1 }] },
    { clips: Array.from({ length: 21 }, () => project.clips[0]) },
    { options: null },
    { options: { ...project.options, ratio: "4:3" } },
    { options: { ...project.options, quality: "4k" } },
    { options: { ...project.options, fit: "stretch" } },
    { options: { ...project.options, volume: 1.5 } },
    { options: { ...project.options, title: "x".repeat(101) } },
    { options: { ...project.options, titlePosition: "left" } },
    { options: { ...project.options, music: undefined } },
    { captions: null },
    { captions: { ...project.captions, style: "sparkle" } },
    { captions: { ...project.captions, color: "red" } },
    { captions: { ...project.captions, transcripts: { "../x": {} } } },
    {
      captions: {
        ...project.captions,
        edits: { [clipId]: [{ text: "x", start: 2, end: 1 }] },
      },
    },
    {
      options: {
        ...project.options,
        music: { file: "../a.mp3", name: "a", volume: 1 },
      },
    },
  ];
  for (const change of bad)
    assert.equal(
      parse({ ...project, ...change }),
      null,
      JSON.stringify(change),
    );
});

test("Trim ranges are fitted into the clip and unknown durations kept", () => {
  assert.deepEqual(clampTrim(1, 9, 4), { start: 1, end: 4 });
  assert.deepEqual(clampTrim(5, 9, 4), { start: 3.9, end: 4 });
  assert.deepEqual(clampTrim(0, 0, 4), { start: 0, end: 0.1 });
  assert.deepEqual(clampTrim(1, 9, 0), { start: 1, end: 9 });
});

test("Reordering, totals, names and time labels", () => {
  assert.deepEqual(moveItem([1, 2, 3], 0, 1), [2, 1, 3]);
  assert.deepEqual(moveItem([1, 2, 3], 2, -1), [1, 3, 2]);
  assert.deepEqual(moveItem([1, 2, 3], 0, -1), [1, 2, 3]);
  assert.deepEqual(moveItem([1, 2, 3], 2, 1), [1, 2, 3]);
  assert.equal(
    totalDuration([
      { start: 0.5, end: 2 },
      { start: 1, end: 1.25 },
    ]),
    1.75,
  );
  assert.equal(cleanName("  Tatil  "), "Tatil");
  assert.equal(cleanName("   "), null);
  assert.equal(formatTime(75.34), "1:15.3");
  assert.equal(formatTime(0), "0:00.0");
  assert.equal(formatTime(59.96), "1:00.0");
});

test("Clip metadata accepts only its own thumbnail name", () => {
  const clip = {
    id: clipId,
    file: clipId + ".mp4",
    name: "Klip",
    kind: "source",
    created: 1,
    duration: 2,
  };
  const meta = clipId + ".json";
  assert.deepEqual(parseClipMetadata(JSON.stringify(clip), meta), clip);
  const withThumb = { ...clip, thumbnail: clipId + ".jpg" };
  assert.deepEqual(
    parseClipMetadata(JSON.stringify(withThumb), meta),
    withThumb,
  );
  assert.equal(
    parseClipMetadata(JSON.stringify({ ...clip, thumbnail: "../x.jpg" }), meta),
    null,
  );
});
