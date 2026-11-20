// Editing desk (Kurgu masası) release-audit fixes. Run with:
// node --test apps/mobile/src/*.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CAPTION_SCALES,
  buildCues,
  captionFits,
  captionInsets,
  defaultCaptions,
  exportCaptions,
  groupingFor,
  withTranscript,
} from "./captions.ts";
import { defaultOptions, exportFailureText } from "./project-state.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const swift = read("../modules/karevia-editor/ios/KareviaEditorModule.swift");
const a = "11985f41-a4b5-41c2-84d0-2a2b2c2d2e2f";

test("G13: new desk projects default to 1080p", () => {
  assert.equal(defaultOptions().quality, "1080p");
});

test("G10: a backgrounded export gets one plain Turkish sentence", () => {
  assert.match(swift, /EditFailure\.coded\(\s*"editor-backgrounded"/);
  assert.match(swift, /UIApplicationDidEnterBackgroundNotification/);
  const text = exportFailureText(
    "Error: editor-backgrounded: The export was stopped because the app went to the background.",
  );
  assert.equal(
    text?.tr,
    "Uygulama arka plana geçtiği için dışa aktarma durdu. Tekrar dene.",
  );
  assert.equal(exportFailureText("The export was cancelled."), null);
});

test("G21: caption scales match the exporter and no line is dropped", () => {
  const scales = swift.match(/let scales: \[CGFloat\] = \[([^\]]+)\]/);
  assert.ok(scales, "lineCue scales not found");
  assert.deepEqual(scales[1].split(",").map(Number), [...CAPTION_SCALES]);
  assert.doesNotMatch(swift, /lines\.prefix\(3\)/);
  // Two lines at the first four sizes, three from half size down, and the
  // smallest size is final whatever the line count.
  assert.equal(captionFits(0, 3), false);
  assert.equal(captionFits(3, 2), true);
  assert.equal(captionFits(4, 3), true);
  assert.equal(captionFits(5, 4), false);
  assert.equal(captionFits(CAPTION_SCALES.length - 1, 9), true);
  // Impact with six words per line stays short enough to read.
  assert.equal(groupingFor({ style: "impact", wordsPerCue: 6 }).maxChars, 36);
  assert.equal(groupingFor({ style: "classic", wordsPerCue: 6 }).maxChars, 54);
});

test("G20: caption insets follow the exporter's title clearance", () => {
  assert.deepEqual(captionInsets(1000, null), {
    top: 80,
    bottom: 80,
    centerTop: null,
  });
  // 5 % title margin + plate + 2 % gap.
  assert.deepEqual(captionInsets(1000, { position: "bottom", height: 60 }), {
    top: 80,
    bottom: 130,
    centerTop: null,
  });
  assert.deepEqual(captionInsets(1000, { position: "top", height: 10 }), {
    top: 80,
    bottom: 80,
    centerTop: null,
  });
  assert.equal(
    captionInsets(1000, { position: "center", height: 60 }).centerTop,
    550,
  );
});

test("G26: exported cues carry their clip and shift for the exporter", () => {
  const state = withTranscript({ ...defaultCaptions(), enabled: true }, a, {
    locale: "tr-TR",
    words: [
      { text: "bir", start: 1.2, end: 1.5 },
      { text: "iki", start: 1.6, end: 1.9 },
    ],
  });
  const clips = [
    { id: a, start: 0, end: 0.5 },
    { id: a, start: 1, end: 2 },
  ];
  const exported = exportCaptions(state, buildCues(clips, state));
  assert.equal(exported.cues.length, 1);
  const [cue] = exported.cues;
  assert.equal(cue.clip, 1);
  // Timeline 0.7 (after the 0.5 s first clip) + shift 0.5 = source 1.2.
  assert.equal(cue.start, 0.7);
  assert.equal(cue.shift, 0.5);
  assert.equal(Math.round((cue.start + cue.shift) * 1000) / 1000, 1.2);
  assert.match(swift, /@Field var clip: Int = -1/);
  assert.match(swift, /@Field var shift: Double = 0/);
});

test("G24 / G25: source frame rate kept, on-device recognition chunked", () => {
  assert.match(swift, /var frameRate: Float = 0/);
  assert.match(swift, /frameRate = max\(frameRate, min\(fps, 60\)\)/);
  assert.match(swift, /if frameRate < 1 \{ frameRate = 30 \}/);
  assert.match(swift, /if length > chunkSeconds \{/);
  assert.doesNotMatch(swift, /if !onDevice, length > chunkSeconds/);
});

test("F11: desk options carry no PRO badge; one note says export needs Pro", () => {
  for (const file of ["./editor-options.tsx", "./editor-caption-look.tsx"]) {
    const source = read(file);
    assert.doesNotMatch(source, /badge/);
    assert.doesNotMatch(source, /"PRO"/);
  }
  const screen = read("../app/editor.tsx");
  // One note (the Format panel) and the header action's PRO tag, nothing else.
  assert.equal(
    screen.match(/Dışa aktarmak için Vidora Pro gerekir\./g)?.length,
    1,
  );
  assert.match(screen, /badge=\{!isPro && !proLoading \? "PRO" : undefined\}/);
});

test("G9: leaving the editor cancels a running transcription", () => {
  const panel = read("./editor-captions.tsx");
  assert.match(panel, /if \(transcribing\.current\) cancelTranscription\(\);/);
});

const DESK_FILES = [
  "../app/editor.tsx",
  "./editor-caption-look.tsx",
  "./editor-captions.tsx",
  "./editor-clips.tsx",
  "./editor-cues.tsx",
  "./editor-export.tsx",
  "./editor-options.tsx",
  "./editor-preview.tsx",
  "./timeline.tsx",
  "./caption-overlay.tsx",
];

test("Desk rebuild: one accent (the header action), no grey cards, no old colours", () => {
  for (const file of DESK_FILES) {
    const source = read(file);
    // The only vermilion is HeaderAction (or EmptyState's single action).
    assert.doesNotMatch(source, /Theme\.accent/, file);
    assert.doesNotMatch(source, /\bprimary\b/, file);
    assert.doesNotMatch(source, /s\.panel/, file);
    assert.doesNotMatch(source, /#050805|#101410/i, file);
    // SF Symbols, not text arrows or a text check mark.
    assert.doesNotMatch(source, /["'>][↑↓✓]["'<]/, file);
  }
});

test("Desk rebuild: stable testIDs for the QA flow", () => {
  const all = DESK_FILES.map(read).join("\n");
  for (const id of [
    "desk-back",
    "desk-title",
    "desk-export",
    "desk-result-edit",
    "desk-result-done",
    "desk-empty-photos",
    "desk-empty-files",
    "desk-empty-library",
    "desk-preview",
    "desk-play",
    "desk-scrub",
    "desk-export-cancel",
    "desk-add",
    "desk-tool-trim",
    "desk-tool-captions",
    "desk-tool-text",
    "desk-tool-music",
    "desk-tool-format",
    "desk-trim-start",
    "desk-trim-end",
    "desk-captions-generate",
    "desk-captions-switch",
    "desk-captions-edit",
    "desk-title-field",
    "desk-music-row",
    "desk-library-cancel",
    "desk-library-add",
  ])
    assert.ok(all.includes(`"${id}"`), id);
  // Numbered tiles: desk-clip-1, desk-library-tile-1, desk-cue-1.
  for (const prefix of ["desk-clip-", "desk-library-tile-", "desk-cue-"])
    assert.ok(all.includes(`"${prefix}"`), prefix);
});
