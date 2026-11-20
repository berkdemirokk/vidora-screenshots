import { translate } from "./i18n/index.ts";
import type { Lang } from "./i18n/lang.ts";
/**
 * Rules that keep one draft in one editor, and the editor's file bookkeeping.
 * Pure (no imports), so `editor-session.test.mjs` runs them in Node next to
 * the real draft store.
 */

/** What opened the editor (its route params). */
export type EditorParams = {
  draft?: string;
  edit?: string;
  duplicate?: string;
  /** Set by `editorSessionKey` callers: the work this editor is about. */
  session?: string;
};

/**
 * The work an editor is about: a video ("clip:<id>", for Düzenle and for a
 * draft that re-edits that video) or a draft ("draft:<id>"). Two opens with
 * the same key would stack two editors on one draft (data-safety finding 3).
 * Duplicates and new videos have no key: each is its own work.
 */
export function editorSessionKey(target: {
  draft?: { id: string; sourceClip: string | null };
  edit?: string;
}): string | undefined {
  if (target.edit) return "clip:" + target.edit;
  if (target.draft)
    return target.draft.sourceClip
      ? "clip:" + target.draft.sourceClip
      : "draft:" + target.draft.id;
  return undefined;
}

/**
 * For expo-router's `dangerouslySingular`: an editor screen with the same
 * session key is taken out of the history before the new one is pushed.
 */
export function singularEditor(
  name: string,
  params: Record<string, unknown>,
): string | undefined {
  const session = params.session;
  return name === "create" && typeof session === "string" && session
    ? session
    : undefined;
}

/** Ignores a second open of the same work within `ms` (a double tap). */
export function createOpenGuard(ms = 1000, now: () => number = Date.now) {
  let last: { key: string; at: number } | null = null;
  return (key: string): boolean => {
    const at = now();
    if (last && last.key === key && at - last.at < ms) return false;
    last = { key, at };
    return true;
  };
}

/**
 * Editors on screen. The opening cache sweep deletes every working cut-out,
 * so it may only run when no other editor is mounted (finding 3).
 */
export function createEditorRegistry() {
  let mounted = 0;
  return {
    /** Call on mount; `sweep` says whether the cache sweep is safe now. */
    enter(): { sweep: boolean; leave: () => void } {
      const sweep = mounted === 0;
      mounted++;
      let left = false;
      return {
        sweep,
        leave() {
          if (left) return;
          left = true;
          mounted--;
        },
      };
    },
    get mounted() {
      return mounted;
    },
  };
}

/**
 * Files the editor stopped using (a replaced music file or own photo). They
 * are released only after the draft that stopped naming them was saved;
 * before that the stored draft still needs them (finding 4).
 */
export function createReleaseQueue() {
  const music = new Set<string>(),
    backdrops = new Set<string>();
  return {
    music(file: string) {
      music.add(file);
    },
    backdrop(file: string) {
      backdrops.add(file);
    },
    /** A file chosen again is no longer waiting to go. */
    keep(file: string) {
      music.delete(file);
      backdrops.delete(file);
    },
    /** Call after a successful save; the release functions check references. */
    afterSave(release: {
      music: (file: string) => void;
      backdrop: (file: string) => void;
    }) {
      for (const file of [...music]) {
        music.delete(file);
        try {
          release.music(file);
        } catch {
          // Only an orphan file; removed with "delete all data".
        }
      }
      for (const file of [...backdrops]) {
        backdrops.delete(file);
        try {
          release.backdrop(file);
        } catch {
          // Only an orphan file.
        }
      }
    },
    get size() {
      return music.size + backdrops.size;
    },
  };
}

/** Autosave waits this long after the last change... */
export const AUTOSAVE_MS = 800;
/** ...but never longer than this after the first unsaved change (finding 7). */
export const AUTOSAVE_MAX_WAIT_MS = 4000;

/** Delay before the next autosave; continuous typing still saves. */
export function autosaveDelay(pendingSince: number, now: number): number {
  return Math.max(
    0,
    Math.min(AUTOSAVE_MS, pendingSince + AUTOSAVE_MAX_WAIT_MS - now),
  );
}

/** One plain sentence when a draft's music or own photo is gone (finding 8). */
export function missingFilesNote(
  missing: { music: boolean; backdrop: boolean; photos?: boolean },
  lang: Lang,
): string | null {
  const t = (tr: string, en: string) => translate(lang, tr, en);
  if (missing.photos)
    return missing.music || missing.backdrop
      ? t(
          "Bu çalışmanın bazı dosyaları bulunamadı; kalanlarla açıldı.",
          "Some of this work's files were not found; it opened with the rest.",
        )
      : t(
          "Bu çalışmanın bazı fotoğrafları bulunamadı; kalan fotoğraflarla açıldı.",
          "Some of this work's photos were not found; it opened with the remaining photos.",
        );
  if (missing.music && missing.backdrop)
    return t(
      "Bu çalışmanın müziği ve arka plan fotoğrafı bulunamadı; onlarsız açıldı.",
      "This work's music and background photo were not found; it opened without them.",
    );
  if (missing.music)
    return t(
      "Bu çalışmanın müziği bulunamadı; müziksiz açıldı.",
      "This work's music was not found; it opened without music.",
    );
  if (missing.backdrop)
    return t(
      "Bu çalışmanın arka plan fotoğrafı bulunamadı; onsuz açıldı.",
      "This work's background photo was not found; it opened without it.",
    );
  return null;
}
