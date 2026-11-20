// Pure caption logic: no Expo/React Native imports so it runs under `node --test`.

/** One recognised word. Times are seconds; `breakAfter` forces a cue break. */
export type Word = {
  text: string;
  start: number;
  end: number;
  breakAfter?: true;
  /** Display only (never stored): drawn in the accent colour. */
  emphasis?: true;
  /** Display only (never stored): an emoji added after the cue. */
  emoji?: true;
};
export type Cue = { start: number; end: number; words: Word[] };
export type CaptionStyle =
  | "classic"
  | "highlight"
  | "pop"
  | "box"
  | "karaoke"
  | "typewriter"
  | "outline"
  | "neon"
  | "impact";
export type CaptionFont = "system" | "rounded" | "serif" | "condensed" | "mono";
export type CaptionPosition = "top" | "center" | "bottom";
export type CaptionLocale = "tr-TR" | "en-US";
/** Words are relative to the start of the SOURCE clip (not its trim). */
export type Transcript = { locale: CaptionLocale; words: Word[] };
export type CaptionState = {
  enabled: boolean;
  style: CaptionStyle;
  position: CaptionPosition;
  /** Accent colour as #RRGGBB. */
  color: string;
  font: CaptionFont;
  /** Words per caption line; null uses the style's own grouping. */
  wordsPerCue: number | null;
  /** Colour one key word per line with the accent. */
  keywords: boolean;
  /** Add a fitting emoji after lines that mention a known topic. */
  emoji: boolean;
  /** Recognised speech, keyed by library clip id. */
  transcripts: Record<string, Transcript>;
  /** User-edited words that replace a clip's transcript, keyed by clip id. */
  edits: Record<string, Word[]>;
};
export type Grouping = { maxWords: number; maxChars: number; maxGap: number };
/** A cue on the final timeline plus what is needed to map it back. */
export type PlacedCue = {
  cue: Cue;
  clipId: string;
  clipIndex: number;
  /** source time = timeline time + shift */
  shift: number;
};
export type ExportCaptions = {
  cues: {
    start: number;
    end: number;
    /**
     * Timeline index of the cue's clip and its shift (source time = time +
     * shift). The exporter places the cue by where that clip really landed,
     * so a clip whose video is shorter than its file cannot make later
     * captions drift.
     */
    clip: number;
    shift: number;
    words: {
      text: string;
      start: number;
      end: number;
      emphasis: boolean;
      emoji: boolean;
    }[];
  }[];
  style: CaptionStyle;
  position: CaptionPosition;
  color: string;
  font: CaptionFont;
};

export const CAPTION_STYLES: readonly CaptionStyle[] = [
  "classic",
  "highlight",
  "pop",
  "box",
  "karaoke",
  "typewriter",
  "outline",
  "neon",
  "impact",
];
export const CAPTION_FONTS: readonly CaptionFont[] = [
  "system",
  "rounded",
  "serif",
  "condensed",
  "mono",
];
/** Choices for words per line; null = automatic (the style decides). */
export const WORDS_PER_CUE: readonly (number | null)[] = [null, 1, 2, 3, 4, 6];
/** Styles drawn in upper case. */
const UPPER_STYLES: readonly CaptionStyle[] = ["highlight", "pop", "impact"];
export const CAPTION_POSITIONS: readonly CaptionPosition[] = [
  "top",
  "center",
  "bottom",
];
export const CAPTION_LOCALES: readonly CaptionLocale[] = ["tr-TR", "en-US"];
export const CAPTION_COLORS: readonly string[] = [
  "#FFE600",
  "#FFFFFF",
  "#D2FC86",
  "#5CE1E6",
  "#FF5CA8",
  "#FF8A3D",
];
export const GROUPING: Record<CaptionStyle, Grouping> = {
  classic: { maxWords: 6, maxChars: 32, maxGap: 0.6 },
  highlight: { maxWords: 4, maxChars: 22, maxGap: 0.6 },
  pop: { maxWords: 1, maxChars: Infinity, maxGap: 0.6 },
  box: { maxWords: 6, maxChars: 32, maxGap: 0.6 },
  karaoke: { maxWords: 5, maxChars: 28, maxGap: 0.6 },
  typewriter: { maxWords: 6, maxChars: 32, maxGap: 0.6 },
  outline: { maxWords: 5, maxChars: 28, maxGap: 0.6 },
  neon: { maxWords: 4, maxChars: 24, maxGap: 0.6 },
  impact: { maxWords: 3, maxChars: 18, maxGap: 0.6 },
};

/** Longest Impact line with a words-per-line choice (characters). */
const IMPACT_MAX_CHARS = 36;

/** The grouping a state uses: the style's, or the user's words per line. */
export function groupingFor(state: {
  style: CaptionStyle;
  wordsPerCue: number | null;
}): Grouping {
  const base = GROUPING[state.style];
  if (state.style === "pop" || state.wordsPerCue === null) return base;
  const chars = Math.max(base.maxChars, state.wordsPerCue * 9);
  return {
    ...base,
    maxWords: state.wordsPerCue,
    // Impact is drawn 1.3× larger in upper case: a longer line would need a
    // tiny font in the video.
    maxChars:
      state.style === "impact" ? Math.min(chars, IMPACT_MAX_CHARS) : chars,
  };
}

// ---- Caption layout shared with the exporter (CaptionRenderer in
// KareviaEditorModule.swift). Sizes are fractions of the video frame, so the
// editor preview can draw captions as they will be burned in.

export const CAPTION_LAYOUT = {
  /** Caption font size (impact draws it 1.3× larger). */
  font: 0.055,
  /** Pop's one-word font size. */
  popFont: 0.09,
  /** Line width: pop, box, every other style (fractions of the width). */
  popWidth: 0.9,
  boxWidth: 0.84,
  width: 0.88,
  /** Title font size and its distance from the top or bottom edge. */
  titleFont: 0.035,
  titleMargin: 0.05,
} as const;

/**
 * Font scales the exporter tries for a caption line, largest first: the
 * first five need the cue on two lines (the fifth, 0.5, accepts three),
 * the smaller ones on three. Below the last one every line is kept.
 */
export const CAPTION_SCALES: readonly number[] = [
  1, 0.85, 0.72, 0.6, 0.5, 0.45, 0.405, 0.3645, 0.32805,
];

/** Whether a cue drawn at CAPTION_SCALES[step] in `lines` lines is final. */
export function captionFits(step: number, lines: number): boolean {
  if (step >= CAPTION_SCALES.length - 1) return true;
  return lines <= (step < 4 ? 2 : 3);
}

/**
 * Distances of the caption block from the frame edges (frame `height`
 * tall): 8 % from the edge, below a top title, above a bottom title, and
 * just under a centred title (`centerTop`).
 */
export function captionInsets(
  height: number,
  title: { position: CaptionPosition; height: number } | null,
): { top: number; bottom: number; centerTop: number | null } {
  const base = height * 0.08;
  const gap = height * 0.02;
  if (!title) return { top: base, bottom: base, centerTop: null };
  const clear = height * CAPTION_LAYOUT.titleMargin + title.height + gap;
  if (title.position === "top")
    return { top: Math.max(base, clear), bottom: base, centerTop: null };
  if (title.position === "center")
    return {
      top: base,
      bottom: base,
      centerTop: (height + title.height) / 2 + gap,
    };
  return { top: base, bottom: Math.max(base, clear), centerTop: null };
}
export const MAX_WORDS_PER_CLIP = 5000;
export const MAX_WORD_LENGTH = 60;
export const MAX_CUE_WORDS = 40;
export const MAX_TRANSCRIPTS = 20;
/** Must match CaptionRenderer.maxCues in KareviaEditorModule.swift. */
export const MAX_EXPORT_CUES = 3000;
const MAX_SECONDS = 24 * 60 * 60;
/** How long a cue may linger after its last word (seconds). */
const HOLD_SECONDS = 0.3;

const UUID = /^[0-9a-f-]{36}$/i;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const SENTENCE_END = /[.!?…]["'”’)\]]*$/;

function round(seconds: number): number {
  return Math.round(seconds * 1000) / 1000;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isTime(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= MAX_SECONDS
  );
}

/**
 * The text as a style shows it. Highlight and Pop are upper case; Turkish
 * needs dotted/dotless i handled explicitly (i -> İ, ı -> I), which plain
 * toUpperCase() gets wrong and Hermes locale support does not guarantee.
 */
export function captionCase(
  text: string,
  style: CaptionStyle,
  locale?: CaptionLocale,
): string {
  if (!UPPER_STYLES.includes(style)) return text;
  const source =
    locale === "tr-TR" ? text.replace(/i/g, "İ").replace(/ı/g, "I") : text;
  return source.toUpperCase();
}

export function defaultCaptions(): CaptionState {
  return {
    enabled: false,
    style: "classic",
    position: "bottom",
    color: CAPTION_COLORS[0],
    font: "system",
    wordsPerCue: null,
    keywords: false,
    emoji: false,
    transcripts: {},
    edits: {},
  };
}

// ---- Keyword emphasis and emoji (display only, never stored)

const STOPWORDS = new Set(
  (
    "ve veya ama fakat çünkü için gibi kadar daha bunu şunu bunlar onlar " +
    "şimdi sonra önce hepsi herkes bence aslında yani şöyle böyle diye " +
    "değil olarak olduğu olduğunu ediyor yapıyor geliyor gidiyor " +
    "because should would could their there these those about which " +
    "really actually basically something everything anything"
  ).split(" "),
);
const NUMBER = /\d/;

function bare(text: string, locale?: CaptionLocale): string {
  const cleaned = text.replace(/[^\p{L}\p{N}]/gu, "");
  return locale === "tr-TR"
    ? cleaned.replace(/I/g, "ı").replace(/İ/g, "i").toLowerCase()
    : cleaned.toLowerCase();
}

/** Index of the word worth emphasising in a cue, or -1. */
export function keywordIndex(words: readonly Word[], locale?: CaptionLocale) {
  let best = -1;
  let bestScore = 0;
  words.forEach((word, index) => {
    if (word.emoji) return;
    const plain = bare(word.text, locale);
    if (!plain || STOPWORDS.has(plain)) return;
    const score = NUMBER.test(plain)
      ? 20
      : plain.length >= 6
        ? plain.length
        : 0;
    if (score > bestScore) {
      best = index;
      bestScore = score;
    }
  });
  return best;
}

/** Word stems (lower case, no suffix) and the emoji they suggest. */
const EMOJI: readonly [string, string][] = [
  ["para", "💰"],
  ["money", "💰"],
  ["dolar", "💵"],
  ["zengin", "🤑"],
  ["rich", "🤑"],
  ["aşk", "❤️"],
  ["sev", "❤️"],
  ["love", "❤️"],
  ["kalp", "❤️"],
  ["heart", "❤️"],
  ["ateş", "🔥"],
  ["fire", "🔥"],
  ["harika", "🔥"],
  ["amazing", "🔥"],
  ["güldü", "😂"],
  ["komik", "😂"],
  ["funny", "😂"],
  ["laugh", "😂"],
  ["üzgün", "😢"],
  ["ağla", "😢"],
  ["sad", "😢"],
  ["cry", "😢"],
  ["yemek", "🍽️"],
  ["food", "🍽️"],
  ["kahve", "☕"],
  ["coffee", "☕"],
  ["spor", "💪"],
  ["gym", "💪"],
  ["antrenman", "💪"],
  ["workout", "💪"],
  ["güç", "💪"],
  ["strong", "💪"],
  ["fikir", "💡"],
  ["idea", "💡"],
  ["ipucu", "💡"],
  ["tip", "💡"],
  ["zaman", "⏰"],
  ["time", "⏰"],
  ["saat", "⏰"],
  ["dikkat", "⚠️"],
  ["warning", "⚠️"],
  ["hata", "❌"],
  ["mistake", "❌"],
  ["doğru", "✅"],
  ["correct", "✅"],
  ["başarı", "🏆"],
  ["kazan", "🏆"],
  ["success", "🏆"],
  ["win", "🏆"],
  ["hedef", "🎯"],
  ["goal", "🎯"],
  ["telefon", "📱"],
  ["phone", "📱"],
  ["müzik", "🎵"],
  ["music", "🎵"],
  ["seyahat", "✈️"],
  ["tatil", "🏖️"],
  ["travel", "✈️"],
  ["vacation", "🏖️"],
  ["kitap", "📚"],
  ["book", "📚"],
  ["okul", "🎓"],
  ["school", "🎓"],
  ["araba", "🚗"],
  ["car", "🚗"],
  ["ev", "🏠"],
  ["home", "🏠"],
  ["house", "🏠"],
  ["şaşır", "😮"],
  ["wow", "😮"],
  ["mutlu", "😊"],
  ["happy", "😊"],
  ["teşekkür", "🙏"],
  ["thank", "🙏"],
];
/** Stems this short only match the whole word ("ev", not "evet"). */
const EXACT_STEM_LENGTH = 3;

/** An emoji for a cue's words, or null. */
export function emojiFor(
  words: readonly Word[],
  locale?: CaptionLocale,
): string | null {
  for (const word of words) {
    const plain = bare(word.text, locale);
    if (!plain) continue;
    for (const [stem, emoji] of EMOJI) {
      const hit =
        stem.length <= EXACT_STEM_LENGTH
          ? plain === stem || plain === stem + "s"
          : plain.startsWith(stem);
      if (hit) return emoji;
    }
  }
  return null;
}

/**
 * Display copy of a cue with keyword emphasis and an emoji token added. The
 * emoji lights with the last word, so word-by-word styles stay in order.
 */
export function decorateCue(
  cue: Cue,
  state: { style: CaptionStyle; keywords: boolean; emoji: boolean },
  locale?: CaptionLocale,
): Cue {
  // Pop shows one word at a time, so it is never decorated.
  if (state.style === "pop" || (!state.keywords && !state.emoji)) return cue;
  if (!cue.words.length) return cue;
  const words: Word[] = cue.words.map((word) => ({ ...word }));
  if (state.keywords) {
    const index = keywordIndex(words, locale);
    if (index >= 0) words[index].emphasis = true;
  }
  if (state.emoji) {
    const emoji = emojiFor(words, locale);
    const last = words[words.length - 1];
    if (emoji)
      words.push({
        text: emoji,
        start: last.start,
        end: last.end,
        emoji: true,
      });
  }
  return { ...cue, words };
}

/** Split words into cues by size, by pauses and after sentence punctuation. */
export function groupWords(
  words: readonly Word[],
  options: Partial<Grouping> = {},
): Cue[] {
  const { maxWords, maxChars, maxGap } = { ...GROUPING.classic, ...options };
  const cues: Cue[] = [];
  let current: Word[] = [];
  let chars = 0;
  const close = () => {
    if (current.length)
      cues.push({
        start: current[0].start,
        end: current[current.length - 1].end,
        words: current,
      });
    current = [];
    chars = 0;
  };
  for (const word of words) {
    const previous = current[current.length - 1];
    if (
      previous &&
      (current.length >= maxWords ||
        chars + 1 + word.text.length > maxChars ||
        word.start - previous.end > maxGap ||
        previous.breakAfter === true ||
        SENTENCE_END.test(previous.text))
    )
      close();
    chars += (current.length ? 1 : 0) + word.text.length;
    current.push(word);
  }
  close();
  return cues;
}

/**
 * Map clip-relative words onto the final composed timeline, one list per
 * clip. Words outside a clip's trim are dropped; the rest are shifted by the
 * trim start and the length of the preceding clips, then clamped to the clip.
 */
export function toTimeline(
  clips: readonly { id: string; start: number; end: number }[],
  wordsByClip: Readonly<Record<string, readonly Word[] | undefined>>,
): Word[][] {
  let offset = 0;
  return clips.map((clip) => {
    const shift = round(clip.start - offset);
    offset += Math.max(0, clip.end - clip.start);
    const mapped: Word[] = [];
    for (const word of wordsByClip[clip.id] ?? []) {
      if (word.end <= clip.start || word.start >= clip.end) continue;
      const start = Math.max(word.start, clip.start);
      const end = Math.min(word.end, clip.end);
      mapped.push({
        ...word,
        start: round(start - shift),
        end: round(Math.max(start, end) - shift),
      });
    }
    return mapped;
  });
}

/** The words shown for a clip: the user's edits, else the transcript. */
export function effectiveWords(
  state: CaptionState,
  clipId: string,
): Word[] | null {
  return state.edits[clipId] ?? state.transcripts[clipId]?.words ?? null;
}

/** All cues of the timeline in the current style, in playback order. */
export function buildCues(
  clips: readonly { id: string; start: number; end: number }[],
  state: CaptionState,
): PlacedCue[] {
  const wordsByClip: Record<string, Word[]> = {};
  for (const clip of clips) {
    const words = effectiveWords(state, clip.id);
    if (words) wordsByClip[clip.id] = words;
  }
  const mapped = toTimeline(clips, wordsByClip);
  const placed: PlacedCue[] = [];
  const limits: number[] = [];
  let offset = 0;
  clips.forEach((clip, clipIndex) => {
    const shift = round(clip.start - offset);
    offset += Math.max(0, clip.end - clip.start);
    for (const cue of groupWords(mapped[clipIndex], groupingFor(state))) {
      placed.push({ cue, clipId: clip.id, clipIndex, shift });
      limits.push(round(offset));
    }
  });
  // Keep a cue on screen briefly after its last word, never into the next
  // cue or the next clip.
  placed.forEach((entry, index) => {
    const next = placed[index + 1];
    const limit = Math.min(limits[index], next ? next.cue.start : Infinity);
    const held = Math.min(entry.cue.end + HOLD_SECONDS, limit);
    entry.cue.end = round(Math.max(entry.cue.end, held));
  });
  return placed;
}

/**
 * Replace a cue's text. With the same number of words the timings are kept;
 * otherwise the new words share the cue's duration evenly. Empty text → null.
 */
export function editCueText(cue: Cue, newText: string): Cue | null {
  const tokens = newText
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_CUE_WORDS)
    .map((token) => token.slice(0, MAX_WORD_LENGTH));
  if (!tokens.length) return null;
  if (tokens.length === cue.words.length)
    return {
      ...cue,
      words: cue.words.map((word, index) => ({ ...word, text: tokens[index] })),
    };
  const step = Math.max(0, cue.end - cue.start) / tokens.length;
  const words: Word[] = tokens.map((text, index) => ({
    text,
    start: round(cue.start + index * step),
    end: round(cue.start + (index + 1) * step),
  }));
  if (cue.words[cue.words.length - 1]?.breakAfter)
    words[words.length - 1].breakAfter = true;
  return { start: cue.start, end: cue.end, words };
}

/**
 * Swap the words overlapping [from, to) for `replacement`. The edited run is
 * fenced with breaks so regrouping keeps it as the line the user wrote.
 */
export function replaceWords(
  words: readonly Word[],
  from: number,
  to: number,
  replacement: readonly Word[],
): Word[] {
  const until = Math.max(to, from + 0.001);
  const before: Word[] = [];
  const after: Word[] = [];
  for (const word of words) {
    const inside =
      (word.end > from && word.start < until) ||
      (word.start >= from && word.start < until);
    if (inside) continue;
    (word.start < from ? before : after).push(word);
  }
  const inserted = replacement.map((word) => ({ ...word }));
  if (inserted.length) {
    inserted[inserted.length - 1].breakAfter = true;
    const last = before.length - 1;
    if (last >= 0) before[last] = { ...before[last], breakAfter: true };
  }
  return [...before, ...inserted, ...after].slice(0, MAX_WORDS_PER_CLIP);
}

/** Edit (text) or delete (null) one timeline cue, stored as a clip edit. */
export function applyCueEdit(
  state: CaptionState,
  placed: PlacedCue,
  text: string | null,
): CaptionState {
  const source = effectiveWords(state, placed.clipId);
  const { cue, shift } = placed;
  if (!source || !cue.words.length) return state;
  const edited = text === null ? null : editCueText(cue, text);
  const from = round(cue.start + shift);
  const to = round(cue.words[cue.words.length - 1].end + shift);
  const replacement = (edited?.words ?? []).map((word) => ({
    ...word,
    start: round(word.start + shift),
    end: round(word.end + shift),
  }));
  return {
    ...state,
    edits: {
      ...state.edits,
      [placed.clipId]: replaceWords(source, from, to, replacement),
    },
  };
}

/** Store a fresh transcript for a clip, discarding earlier edits to it. */
export function withTranscript(
  state: CaptionState,
  clipId: string,
  transcript: Transcript,
): CaptionState {
  const edits = { ...state.edits };
  delete edits[clipId];
  return {
    ...state,
    transcripts: { ...state.transcripts, [clipId]: transcript },
    edits,
  };
}

/** Keep only the transcripts and edits of the given clips (for saving). */
export function pruneCaptions(
  state: CaptionState,
  clipIds: Iterable<string>,
): CaptionState {
  const transcripts: Record<string, Transcript> = {};
  const edits: Record<string, Word[]> = {};
  for (const id of new Set(clipIds)) {
    if (state.transcripts[id]) transcripts[id] = state.transcripts[id];
    if (state.transcripts[id] && state.edits[id]) edits[id] = state.edits[id];
  }
  return { ...state, transcripts, edits };
}

/** What the native exporter receives; null when there is nothing to draw. */
export function exportCaptions(
  state: CaptionState,
  placed: readonly PlacedCue[],
): ExportCaptions | null {
  if (!state.enabled || !placed.length) return null;
  return {
    cues: placed
      .slice(0, MAX_EXPORT_CUES)
      .map(({ cue, clipId, clipIndex, shift }) => {
        const locale = state.transcripts[clipId]?.locale;
        const shown = decorateCue(cue, state, locale);
        return {
          start: shown.start,
          end: shown.end,
          clip: clipIndex,
          shift,
          words: shown.words.map((word) => ({
            text: word.emoji
              ? word.text
              : captionCase(word.text, state.style, locale),
            start: word.start,
            end: word.end,
            emphasis: word.emphasis === true,
            emoji: word.emoji === true,
          })),
        };
      }),
    style: state.style,
    position: state.position,
    color: state.color,
    font: state.font,
  };
}

export function activeCue(cues: readonly Cue[], time: number): Cue | null {
  for (const cue of cues) if (time >= cue.start && time < cue.end) return cue;
  return null;
}
/** Index of the word being spoken (the latest one already started). */
export function activeWordIndex(cue: Cue, time: number): number {
  let index = 0;
  for (let i = 0; i < cue.words.length; i++)
    if (cue.words[i].start <= time) index = i;
  return index;
}

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_COLOR.test(value);
}

/** Strict check of stored words: finite, ordered by start, bounded. */
export function parseWords(
  value: unknown,
  maxCount = MAX_WORDS_PER_CLIP,
): Word[] | null {
  if (!Array.isArray(value) || value.length > maxCount) return null;
  const words: Word[] = [];
  let previous = 0;
  for (const entry of value) {
    if (
      !isRecord(entry) ||
      typeof entry.text !== "string" ||
      !entry.text.trim() ||
      entry.text.length > MAX_WORD_LENGTH ||
      !isTime(entry.start) ||
      !isTime(entry.end) ||
      entry.end < entry.start ||
      entry.start < previous ||
      (entry.breakAfter !== undefined && typeof entry.breakAfter !== "boolean")
    )
      return null;
    previous = entry.start;
    const word: Word = {
      text: entry.text,
      start: entry.start,
      end: entry.end,
    };
    if (entry.breakAfter === true) word.breakAfter = true;
    words.push(word);
  }
  return words;
}

/**
 * Lenient clean-up of recogniser output: unusable entries are dropped, the
 * rest sorted, rounded, made non-overlapping and capped.
 */
export function sanitizeWords(value: unknown): Word[] {
  if (!Array.isArray(value)) return [];
  const words: Word[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.text !== "string") continue;
    const text = entry.text.trim().slice(0, MAX_WORD_LENGTH).trim();
    const start = Number(entry.start);
    const end = Number(entry.end);
    if (!text || !Number.isFinite(start) || !Number.isFinite(end)) continue;
    const from = round(Math.min(MAX_SECONDS, Math.max(0, start)));
    words.push({
      text,
      start: from,
      end: round(Math.min(MAX_SECONDS, Math.max(from, end))),
    });
  }
  words.sort((a, b) => a.start - b.start);
  for (let i = 0; i + 1 < words.length; i++)
    words[i].end = Math.min(words[i].end, words[i + 1].start);
  return words.slice(0, MAX_WORDS_PER_CLIP);
}

function oneOf<T extends string>(
  allowed: readonly T[],
  value: unknown,
): value is T {
  return typeof value === "string" && allowed.includes(value as T);
}
function clipEntries(value: unknown): [string, unknown][] | null {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > MAX_TRANSCRIPTS) return null;
  return entries.every(([id]) => UUID.test(id)) ? entries : null;
}

/** Strictly validate stored caption state; anything unexpected yields null. */
export function parseCaptionState(value: unknown): CaptionState | null {
  if (
    !isRecord(value) ||
    typeof value.enabled !== "boolean" ||
    !oneOf(CAPTION_STYLES, value.style) ||
    !oneOf(CAPTION_POSITIONS, value.position) ||
    !isHexColor(value.color)
  )
    return null;
  const stored = clipEntries(value.transcripts);
  const storedEdits = clipEntries(value.edits);
  if (!stored || !storedEdits) return null;
  const transcripts: Record<string, Transcript> = {};
  for (const [id, entry] of stored) {
    if (!isRecord(entry) || !oneOf(CAPTION_LOCALES, entry.locale)) return null;
    const words = parseWords(entry.words);
    if (!words) return null;
    transcripts[id] = { locale: entry.locale, words };
  }
  const edits: Record<string, Word[]> = {};
  for (const [id, entry] of storedEdits) {
    const words = parseWords(entry);
    if (!words) return null;
    edits[id] = words;
  }
  // Fields added after the first release fall back to their defaults.
  const words = value.wordsPerCue;
  return {
    enabled: value.enabled,
    style: value.style,
    position: value.position,
    color: value.color.toUpperCase(),
    font: oneOf(CAPTION_FONTS, value.font) ? value.font : "system",
    wordsPerCue:
      typeof words === "number" && WORDS_PER_CUE.includes(words) ? words : null,
    keywords: value.keywords === true,
    emoji: value.emoji === true,
    transcripts,
    edits,
  };
}
