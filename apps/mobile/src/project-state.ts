// Pure edit-state logic: no Expo/React Native imports so it runs under `node --test`.
import type { Ratio } from "./studio";
// The explicit ".ts" lets `node --test` load this module without a bundler.
import {
  defaultCaptions,
  parseCaptionState,
  type CaptionState,
} from "./captions.ts";

export type Quality = "720p" | "1080p";
export type Fit = "contain" | "cover";
export type TitlePosition = "top" | "center" | "bottom";
export type MusicTrack = { file: string; name: string; volume: number };
export type EditOptions = {
  ratio: Ratio;
  quality: Quality;
  fit: Fit;
  /** Original audio level, 0..1. */
  volume: number;
  title: string;
  titlePosition: TitlePosition;
  music: MusicTrack | null;
};
export type TrimmedClip = { clipId: string; start: number; end: number };
export type Project = {
  version: 1;
  id: string;
  name: string;
  updated: number;
  clips: TrimmedClip[];
  options: EditOptions;
  /** Transcripts and caption settings; files saved before captions lack it. */
  captions: CaptionState;
};

export const MAX_CLIPS = 20;
export const MIN_TRIM_SECONDS = 0.1;
export const MAX_TITLE_LENGTH = 100;
export const MAX_NAME_LENGTH = 80;
export const PROJECT_SUFFIX = ".project.json";
export const RATIOS: readonly Ratio[] = ["16:9", "9:16", "1:1"];
export const QUALITIES: readonly Quality[] = ["720p", "1080p"];
export const FITS: readonly Fit[] = ["contain", "cover"];
export const TITLE_POSITIONS: readonly TitlePosition[] = [
  "top",
  "center",
  "bottom",
];

const UUID = /^[0-9a-f-]{36}$/i;
const MEDIA_FILE = /^[0-9a-f-]{36}\.[a-z0-9]{1,8}$/i;

export function defaultOptions(): EditOptions {
  return {
    ratio: "9:16",
    // Every desk export needs Pro, and Pro includes 1080p.
    quality: "1080p",
    fit: "cover",
    volume: 1,
    title: "",
    titlePosition: "bottom",
    music: null,
  };
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** True for `<uuid>.<ext>` names that cannot escape the media folder. */
export function isMediaFileName(value: unknown): value is string {
  return typeof value === "string" && MEDIA_FILE.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isLevel(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}
function oneOf<T extends string>(
  allowed: readonly T[],
  value: unknown,
): value is T {
  return typeof value === "string" && allowed.includes(value as T);
}

function parseMusic(value: unknown): MusicTrack | null | undefined {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    !isMediaFileName(value.file) ||
    typeof value.name !== "string" ||
    value.name.length > 255 ||
    !isLevel(value.volume)
  )
    return undefined;
  return { file: value.file, name: value.name, volume: value.volume };
}

function parseOptions(value: unknown): EditOptions | null {
  if (!isRecord(value)) return null;
  const music = parseMusic(value.music);
  if (
    !oneOf(RATIOS, value.ratio) ||
    !oneOf(QUALITIES, value.quality) ||
    !oneOf(FITS, value.fit) ||
    !isLevel(value.volume) ||
    typeof value.title !== "string" ||
    value.title.length > MAX_TITLE_LENGTH ||
    !oneOf(TITLE_POSITIONS, value.titlePosition) ||
    music === undefined
  )
    return null;
  return {
    ratio: value.ratio,
    quality: value.quality,
    fit: value.fit,
    volume: value.volume,
    title: value.title,
    titlePosition: value.titlePosition,
    music,
  };
}

function parseTrimmedClip(value: unknown): TrimmedClip | null {
  if (
    !isRecord(value) ||
    !isUuid(value.clipId) ||
    typeof value.start !== "number" ||
    typeof value.end !== "number" ||
    !Number.isFinite(value.start) ||
    !Number.isFinite(value.end) ||
    value.start < 0 ||
    // Equal bounds are stored for clips whose duration is still unknown;
    // the editor refuses to export them.
    value.end < value.start
  )
    return null;
  return { clipId: value.clipId, start: value.start, end: value.end };
}

/** Strictly validate a stored project; anything unexpected yields null. */
export function parseProject(text: string, filename: string): Project | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (
    !isRecord(raw) ||
    raw.version !== 1 ||
    !isUuid(raw.id) ||
    filename !== raw.id + PROJECT_SUFFIX ||
    typeof raw.name !== "string" ||
    !raw.name.trim() ||
    raw.name.length > MAX_NAME_LENGTH ||
    typeof raw.updated !== "number" ||
    !Number.isFinite(raw.updated) ||
    !Array.isArray(raw.clips) ||
    raw.clips.length > MAX_CLIPS
  )
    return null;
  const options = parseOptions(raw.options);
  if (!options) return null;
  // Projects saved before captions existed simply have none.
  const captions =
    raw.captions === undefined
      ? defaultCaptions()
      : parseCaptionState(raw.captions);
  if (!captions) return null;
  const clips: TrimmedClip[] = [];
  for (const entry of raw.clips) {
    const clip = parseTrimmedClip(entry);
    if (!clip) return null;
    clips.push(clip);
  }
  return {
    version: 1,
    id: raw.id,
    name: raw.name,
    updated: raw.updated,
    clips,
    options,
    captions,
  };
}

/**
 * Plain sentences for the desk export's coded native failures
 * (KareviaEditorModule.swift), or null for any other error.
 */
export function exportFailureText(
  message: string,
): { tr: string; en: string } | null {
  if (message.includes("editor-backgrounded"))
    return {
      tr: "Uygulama arka plana geçtiği için dışa aktarma durdu. Tekrar dene.",
      en: "The export stopped because the app went to the background. Try again.",
    };
  return null;
}

/** Normalise a user-entered project name; null when it is unusable. */
export function cleanName(input: string): string | null {
  const name = input.trim().slice(0, MAX_NAME_LENGTH).trim();
  return name ? name : null;
}

/**
 * Fit a trim range inside a clip. A duration of 0 means "unknown" (no native
 * module), in which case the stored range is kept as is.
 */
export function clampTrim(
  start: number,
  end: number,
  duration: number,
): { start: number; end: number } {
  if (!(duration > 0)) return { start, end };
  const minimum = Math.min(MIN_TRIM_SECONDS, duration);
  const safeEnd = Math.min(Math.max(end, minimum), duration);
  const safeStart = Math.min(Math.max(start, 0), safeEnd - minimum);
  return { start: roundTime(safeStart), end: roundTime(safeEnd) };
}

export function roundTime(seconds: number): number {
  return Math.round(seconds * 1000) / 1000;
}

/** Move one list entry up (-1) or down (+1); out-of-range moves are no-ops. */
export function moveItem<T>(items: readonly T[], index: number, delta: number) {
  const target = index + delta;
  const next = [...items];
  if (index < 0 || index >= next.length || target < 0 || target >= next.length)
    return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function totalDuration(
  clips: readonly { start: number; end: number }[],
): number {
  return roundTime(clips.reduce((sum, clip) => sum + clip.end - clip.start, 0));
}

/** 75.34 -> "1:15.3" */
export function formatTime(seconds: number): string {
  const tenths = Math.max(
    0,
    Math.round((Number.isFinite(seconds) ? seconds : 0) * 10),
  );
  const minutes = Math.floor(tenths / 600);
  const rest = tenths - minutes * 600;
  const whole = Math.floor(rest / 10);
  return minutes + ":" + String(whole).padStart(2, "0") + "." + (rest % 10);
}
