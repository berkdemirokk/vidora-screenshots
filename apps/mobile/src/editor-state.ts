import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { randomUUID } from "expo-crypto";
import { pruneCaptions, type CaptionState } from "./captions";
import { musicExists, type Clip } from "./media";
import {
  MIN_TRIM_SECONDS,
  clampTrim,
  cleanName,
  type EditOptions,
  type Project,
} from "./project-state";
import { saveProject } from "./projects";

const AUTOSAVE_DELAY_MS = 600;

/** One timeline entry: a library clip plus its own trim range. */
export type TimelineItem = {
  key: string;
  clip: Clip;
  start: number;
  end: number;
};

export function newItem(clip: Clip): TimelineItem {
  return {
    key: randomUUID(),
    clip,
    start: 0,
    end: Math.floor(clip.duration * 1000) / 1000,
  };
}

export function exportable(item: TimelineItem): boolean {
  return (
    item.clip.duration > 0 &&
    item.start >= 0 &&
    item.end <= item.clip.duration + 0.001 &&
    item.end - item.start >= Math.min(MIN_TRIM_SECONDS, item.clip.duration)
  );
}

/**
 * Rebuild the editor state from a stored project. Clips (or music) deleted
 * from the library since the last save are dropped instead of failing.
 */
export function restoreTimeline(project: Project, library: Clip[]) {
  const byId = new Map(library.map((clip) => [clip.id, clip]));
  const items: TimelineItem[] = [];
  for (const entry of project.clips) {
    const clip = byId.get(entry.clipId);
    if (!clip) continue;
    items.push({
      key: randomUUID(),
      clip,
      ...clampTrim(entry.start, entry.end, clip.duration),
    });
  }
  const music = project.options.music;
  const musicMissing = music !== null && !musicExists(music.file);
  const options: EditOptions = musicMissing
    ? { ...project.options, music: null }
    : project.options;
  return {
    items,
    options,
    missingClips: project.clips.length - items.length,
    musicMissing,
  };
}

/**
 * Debounced auto-save of the edit state as a project file. Nothing is written
 * until the timeline has a clip or the project already exists on disk.
 */
export function useAutosave(
  state: {
    ready: boolean;
    projectId: string;
    name: string;
    items: TimelineItem[];
    options: EditOptions;
    captions: CaptionState;
  },
  onError: (error: unknown) => void,
) {
  const { ready, projectId, name, items, options, captions } = state;
  const pending = useRef<Project | null>(null);
  /** True once this project has a file on disk. */
  const persisted = useRef(false);
  /** Set to skip the save triggered by merely opening a project. */
  const skipNext = useRef(false);
  const reportError = useRef(onError);
  useEffect(() => {
    reportError.current = onError;
  });

  const flush = useCallback(() => {
    const snapshot = pending.current;
    pending.current = null;
    if (!snapshot) return;
    try {
      saveProject(snapshot);
      persisted.current = true;
    } catch (error) {
      reportError.current(error);
    }
  }, []);

  useEffect(() => {
    if (!ready || (!items.length && !persisted.current)) {
      pending.current = null;
      return;
    }
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    pending.current = {
      version: 1,
      id: projectId,
      name: cleanName(name) ?? "Proje",
      updated: Date.now(),
      clips: items.map((item) => ({
        clipId: item.clip.id,
        start: item.start,
        end: Math.max(item.start, item.end),
      })),
      options,
      // Transcripts of clips no longer on the timeline are not kept on disk.
      captions: pruneCaptions(
        captions,
        items.map((item) => item.clip.id),
      ),
    };
    const timer = setTimeout(flush, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [ready, projectId, name, items, options, captions, flush]);

  // Leaving the screen: write whatever is still pending.
  useEffect(() => flush, [flush]);

  // Going to the background: iOS may kill the app without warning, so save
  // the pending edit now instead of waiting for the timer.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") flush();
    });
    return () => subscription.remove();
  }, [flush]);

  return { flush, persisted, skipNext };
}
