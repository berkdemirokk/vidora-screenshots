// Run with: node --test apps/mobile/src/*.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import {
  GROUPING,
  MAX_EXPORT_CUES,
  captionCase,
  decorateCue,
  emojiFor,
  groupingFor,
  keywordIndex,
  activeCue,
  activeWordIndex,
  applyCueEdit,
  buildCues,
  defaultCaptions,
  editCueText,
  exportCaptions,
  groupWords,
  parseCaptionState,
  parseWords,
  pruneCaptions,
  replaceWords,
  sanitizeWords,
  toTimeline,
  withTranscript,
} from "./captions.ts";

const a = "11985f41-a4b5-41c2-84d0-2a2b2c2d2e2f";
const b = "21985f41-a4b5-41c2-84d0-2a2b2c2d2e2f";
/** Evenly spaced words: each lasts 0.4 s with a 0.1 s pause. */
const speak = (text, from = 0) =>
  text.split(" ").map((word, index) => ({
    text: word,
    start: Math.round((from + index * 0.5) * 1000) / 1000,
    end: Math.round((from + index * 0.5 + 0.4) * 1000) / 1000,
  }));
const texts = (cues) =>
  cues.map((cue) => cue.words.map((w) => w.text).join(" "));

test("Words are grouped by count, width, pauses and punctuation", () => {
  const words = speak("bir iki üç dört beş altı yedi sekiz");
  assert.deepEqual(texts(groupWords(words)), [
    "bir iki üç dört beş altı",
    "yedi sekiz",
  ]);
  assert.deepEqual(texts(groupWords(words, GROUPING.highlight)), [
    "bir iki üç dört",
    "beş altı yedi sekiz",
  ]);
  assert.equal(groupWords(words, GROUPING.pop).length, 8);
  assert.deepEqual(
    texts(groupWords(speak("uzunbirkelime digeruzunkelime sonuncukelime"))),
    ["uzunbirkelime digeruzunkelime", "sonuncukelime"],
  );
  assert.deepEqual(texts(groupWords(speak("Evet. Hayır! Belki")))[0], "Evet.");
  const paused = [...speak("önce"), ...speak("sonra", 1.1)];
  assert.deepEqual(texts(groupWords(paused)), ["önce", "sonra"]);
  const close = [...speak("önce"), ...speak("sonra", 0.9)];
  assert.deepEqual(texts(groupWords(close)), ["önce sonra"]);
  const cue = groupWords(words)[0];
  assert.deepEqual([cue.start, cue.end], [0, 2.9]);
  assert.deepEqual(groupWords([]), []);
});

test("Clip words are trimmed, shifted and clamped onto the timeline", () => {
  const clips = [
    { id: a, start: 1, end: 2 },
    { id: b, start: 0.5, end: 3 },
    { id: "none", start: 0, end: 1 },
  ];
  const mapped = toTimeline(clips, {
    [a]: [
      { text: "dışarıda", start: 0, end: 1 },
      { text: "taşan", start: 0.8, end: 1.3 },
      { text: "içeride", start: 1.4, end: 1.7 },
      { text: "sonda", start: 1.9, end: 2.6 },
      { text: "geç", start: 2, end: 2.4 },
    ],
    [b]: [{ text: "ikinci", start: 0.5, end: 1 }],
  });
  assert.deepEqual(mapped, [
    [
      { text: "taşan", start: 0, end: 0.3 },
      { text: "içeride", start: 0.4, end: 0.7 },
      { text: "sonda", start: 0.9, end: 1 },
    ],
    [{ text: "ikinci", start: 1, end: 1.5 }],
    [],
  ]);
});

test("Cues follow the style, hold briefly and stay inside their clip", () => {
  let state = withTranscript({ ...defaultCaptions(), style: "highlight" }, a, {
    locale: "tr-TR",
    words: speak("bir iki üç dört beş"),
  });
  const clips = [
    { id: a, start: 0, end: 2.45 },
    { id: a, start: 0, end: 1 },
  ];
  const placed = buildCues(clips, state);
  assert.deepEqual(texts(placed.map((p) => p.cue)), [
    "bir iki üç dört",
    "beş",
    "bir iki",
  ]);
  assert.deepEqual(
    placed.map((p) => [p.cue.start, p.cue.end, p.clipIndex, p.shift]),
    [
      [0, 2, 0, 0],
      [2, 2.45, 0, 0],
      [2.45, 3.45, 1, -2.45],
    ],
  );
  assert.equal(exportCaptions(state, placed), null);
  state = { ...state, enabled: true, style: "pop" };
  const exported = exportCaptions(state, buildCues(clips, state));
  assert.equal(exported.cues.length, 7);
  assert.deepEqual(Object.keys(exported.cues[0].words[0]), [
    "text",
    "start",
    "end",
    "emphasis",
    "emoji",
  ]);
  assert.equal(exportCaptions(state, []), null);
  const cues = placed.map((p) => p.cue);
  assert.equal(activeCue(cues, 2.1), cues[1]);
  assert.equal(activeCue(cues, 9), null);
  assert.equal(activeWordIndex(cues[0], 0.45), 0);
  assert.equal(activeWordIndex(cues[0], 1.2), 2);
});

test("Editing a cue keeps or evenly redistributes word timings", () => {
  const cue = groupWords(speak("bir iki"))[0];
  assert.deepEqual(editCueText(cue, " BİR  İKİ ").words, [
    { text: "BİR", start: 0, end: 0.4 },
    { text: "İKİ", start: 0.5, end: 0.9 },
  ]);
  assert.deepEqual(editCueText(cue, "bir iki üç"), {
    start: 0,
    end: 0.9,
    words: [
      { text: "bir", start: 0, end: 0.3 },
      { text: "iki", start: 0.3, end: 0.6 },
      { text: "üç", start: 0.6, end: 0.9 },
    ],
  });
  assert.equal(editCueText(cue, "   "), null);
  assert.equal(editCueText(cue, "x".repeat(100)).words[0].text.length, 60);
});

test("Cue edits are written back to the clip and survive regrouping", () => {
  const state = withTranscript({ ...defaultCaptions(), style: "classic" }, a, {
    locale: "en-US",
    words: speak("one two three four five six seven eight"),
  });
  // Trimmed and preceded by another clip: source time = timeline time - 1.
  const clips = [
    { id: b, start: 0, end: 2 },
    { id: a, start: 1, end: 4 },
  ];
  const placed = buildCues(clips, state);
  assert.deepEqual(texts(placed.map((p) => p.cue)), [
    "three four five six seven eight",
  ]);
  const narrow = { ...state, style: "highlight" };
  const [first, second] = buildCues(clips, narrow);
  assert.deepEqual(texts([first.cue, second.cue]), [
    "three four five six",
    "seven eight",
  ]);
  const edited = applyCueEdit(narrow, first, "3 4");
  assert.deepEqual(texts(buildCues(clips, edited).map((p) => p.cue)), [
    "3 4",
    "seven eight",
  ]);
  assert.equal(edited.transcripts[a].words.length, 8);
  assert.deepEqual(
    edited.edits[a].map((w) => w.text),
    ["one", "two", "3", "4", "seven", "eight"],
  );
  // The cue is held until the next one starts (timeline 3 s = source 2 s).
  assert.deepEqual(edited.edits[a][2], { text: "3", start: 1, end: 2 });
  assert.ok(parseWords(edited.edits[a]));
  // The edited line stays one line in a wider style.
  assert.deepEqual(
    texts(buildCues(clips, { ...edited, style: "classic" }).map((p) => p.cue)),
    ["3 4", "seven eight"],
  );
  const removed = applyCueEdit(edited, buildCues(clips, edited)[1], null);
  assert.deepEqual(texts(buildCues(clips, removed).map((p) => p.cue)), ["3 4"]);
  assert.equal(applyCueEdit(state, { ...first, clipId: b }, "x"), state);
  // A fresh transcript discards the edits; pruning drops unused clips.
  assert.deepEqual(withTranscript(removed, a, state.transcripts[a]).edits, {});
  assert.deepEqual(pruneCaptions(removed, [b]).transcripts, {});
  assert.deepEqual(pruneCaptions(removed, [a, a]), removed);
  assert.deepEqual(
    replaceWords(speak("a b c"), 0.5, 0.9, []).map((w) => w.text),
    ["a", "c"],
  );
});

test("Recogniser output is cleaned and stored data strictly validated", () => {
  assert.deepEqual(
    sanitizeWords([
      { text: " iki ", start: 1, end: 3 },
      { text: "bir", start: -1, end: 0.5 },
      { text: "üç", start: 2, end: 1 },
      { text: "", start: 0, end: 1 },
      { text: "nan", start: NaN, end: 1 },
      { text: 5, start: 0, end: 1 },
      null,
    ]),
    [
      { text: "bir", start: 0, end: 0.5 },
      { text: "iki", start: 1, end: 2 },
      { text: "üç", start: 2, end: 2 },
    ],
  );
  assert.deepEqual(sanitizeWords("nope"), []);
  const word = { text: "a", start: 0, end: 1 };
  assert.deepEqual(parseWords([word, { ...word, breakAfter: false }]), [
    word,
    word,
  ]);
  const bad = [
    "x",
    [{ ...word, text: " " }],
    [{ ...word, text: "x".repeat(61) }],
    [{ ...word, start: 2 }],
    [{ ...word, start: -1 }],
    [{ ...word, end: Infinity }],
    [{ ...word, end: "1" }],
    [{ ...word, start: 1 }, word],
    [{ ...word, breakAfter: "yes" }],
    Array.from({ length: 5001 }, () => word),
  ];
  for (const value of bad)
    assert.equal(parseWords(value), null, JSON.stringify(value).slice(0, 60));
  const state = withTranscript(defaultCaptions(), a, {
    locale: "tr-TR",
    words: [word],
  });
  assert.deepEqual(parseCaptionState(JSON.parse(JSON.stringify(state))), state);
  const invalid = [
    null,
    { ...state, enabled: 1 },
    { ...state, position: "left" },
    { ...state, color: "#fff" },
    { ...state, transcripts: [] },
    { ...state, transcripts: { [a]: { locale: "de-DE", words: [] } } },
    { ...state, transcripts: { constructor: { locale: "tr-TR", words: [] } } },
    { ...state, edits: { [a]: "x" } },
    { ...state, edits: undefined },
  ];
  for (const value of invalid) assert.equal(parseCaptionState(value), null);
});

test("captionCase upper-cases Turkish i correctly", () => {
  assert.equal(captionCase("istanbul ılık", "pop", "tr-TR"), "İSTANBUL ILIK");
  assert.equal(captionCase("istanbul", "highlight", "en-US"), "ISTANBUL");
  assert.equal(captionCase("istanbul", "classic", "tr-TR"), "istanbul");
});

test("exportCaptions applies case per clip locale and caps cue count", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  const words = Array.from({ length: MAX_EXPORT_CUES + 5 }, (_, i) => ({
    text: "iç",
    start: i * 0.5,
    end: i * 0.5 + 0.4,
  }));
  const state = withTranscript(
    { ...defaultCaptions(), enabled: true, style: "pop" },
    id,
    { locale: "tr-TR", words },
  );
  const clips = [{ id, start: 0, end: words.length * 0.5 }];
  const exported = exportCaptions(state, buildCues(clips, state));
  assert.equal(exported.cues.length, MAX_EXPORT_CUES);
  assert.equal(exported.cues[0].words[0].text, "İÇ");
});

test("decorateCue adds keyword emphasis and a matching emoji", () => {
  const cue = {
    start: 0,
    end: 2,
    words: speak("bu ay paramı ikiye katladım"),
  };
  const state = { style: "classic", keywords: true, emoji: true };
  const shown = decorateCue(cue, state, "tr-TR");
  assert.equal(shown.words.find((w) => w.emphasis)?.text, "katladım");
  const last = shown.words[shown.words.length - 1];
  assert.equal(last.emoji, true);
  assert.equal(last.text, "💰");
  assert.equal(last.start, shown.words[shown.words.length - 2].start);
  assert.equal(decorateCue(cue, { ...state, style: "pop" }, "tr-TR"), cue);
  assert.equal(emojiFor(speak("evet tamam"), "tr-TR"), null);
  assert.equal(keywordIndex(speak("2026 yılında"), "tr-TR"), 0);
});

test("words per line overrides the style grouping except for pop", () => {
  assert.equal(groupingFor({ style: "classic", wordsPerCue: 2 }).maxWords, 2);
  assert.equal(groupingFor({ style: "pop", wordsPerCue: 4 }).maxWords, 1);
  assert.equal(
    groupingFor({ style: "karaoke", wordsPerCue: null }).maxWords,
    5,
  );
});

test("old saved caption state gets defaults for the new options", () => {
  const old = { ...defaultCaptions() };
  delete old.font;
  delete old.wordsPerCue;
  delete old.keywords;
  delete old.emoji;
  const parsed = parseCaptionState(old);
  assert.equal(parsed.font, "system");
  assert.equal(parsed.wordsPerCue, null);
  assert.equal(parsed.keywords, false);
  assert.equal(captionCase("istanbul", "impact", "tr-TR"), "İSTANBUL");
  assert.equal(captionCase("istanbul", "karaoke", "tr-TR"), "istanbul");
});
