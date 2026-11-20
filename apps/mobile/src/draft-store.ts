/**
 * Drafts and re-edit sidecars on disk. Both live inside the media folder
 * (KareviaMedia), so they are excluded from iCloud backup with it and
 * removed by "delete all data":
 *
 *   KareviaMedia/drafts/<draftId>.json  + .png (cut-out) [+ .scene.<ext>]
 *   KareviaMedia/edits/<clipId>.json    + .png (cut-out) [+ .scene.<ext>]
 *     both with photos 2..8 as [.x<n>.<ext> + .x<n>c.png (cut-out)]
 *     and photo 1's original photo as [.p.<ext>]
 *   KareviaMedia/backdrops/<uuid>.<ext>  own photos used as backdrops,
 *                                        shared by drafts and videos
 *
 * Sub-folders keep these files out of media.list(), which reads only the
 * top level, so parseClipMetadata never sees them.
 *
 * Safety: a save never deletes before the new file is written. Each file is
 * written as `<name>.tmp` and then moved over the old one; readers use the
 * `.tmp` when a kill landed between the two steps. An unchanged cut-out is
 * not copied again.
 */
import { Directory, File, Paths } from "expo-file-system";
import { randomUUID } from "expo-crypto";
import {
  DRAFT_VERSION,
  MAX_EXTRA_PHOTOS,
  isDraftId,
  parseDraft,
  restoreExtraPhotos,
  serializeDraft,
  sortDrafts,
  type Draft,
  type EditState,
  type ExtraPhoto,
} from "./drafts";
import { bumpLibraryVersion, mediaFolder, removeMusic } from "./media";
import { parseBatch, serializeBatch, type BatchQueue } from "./batch-queue";
import { isKnownSampleCutoutSize } from "./sample-cutout";

type Kind = "drafts" | "edits";

const media = () => new Directory(Paths.document, "KareviaMedia");
function dir(kind: Kind): Directory {
  // Creates KareviaMedia (kept out of backups) when it is missing.
  const parent = mediaFolder();
  const folder = new Directory(parent, kind);
  if (!folder.exists) folder.create({ intermediates: true, idempotent: true });
  return folder;
}
const extOf = (uri: string) => {
  const match = /\.([a-z0-9]{1,5})(?:\?.*)?$/i.exec(uri);
  return match ? match[1].toLowerCase() : "jpg";
};

/** Suffix of a file being written; moved over the real name when complete. */
const TMP = ".tmp";

/** Copy `sourceUri` to `dest` without deleting `dest` first. */
function copyInto(sourceUri: string, dest: File) {
  if (sourceUri === dest.uri) return;
  const source = new File(sourceUri);
  if (!source.exists) throw new Error("missing source " + sourceUri);
  const temp = new File(dest.uri + TMP);
  if (temp.exists) temp.delete();
  source.copySync(temp);
  temp.moveSync(dest, { overwrite: true });
}
/** Write `text` to `dest` as a new file, then move it over the old one. */
function writeText(dest: File, text: string) {
  const temp = new File(dest.uri + TMP);
  if (temp.exists) temp.delete();
  temp.create();
  temp.writeSync(text);
  temp.moveSync(dest, { overwrite: true });
}
/** The file, or its `.tmp` when a move was cut short; null when neither. */
function present(file: File): File | null {
  if (file.exists) return file;
  const temp = new File(file.uri + TMP);
  return temp.exists ? temp : null;
}
/** Parse a stored JSON, falling back to a complete `.tmp` copy. */
function readDraftFile(folder: Directory, key: string): Draft | null {
  for (const name of [key + ".json", key + ".json" + TMP]) {
    const file = new File(folder, name);
    if (!file.exists) continue;
    try {
      const draft = parseDraft(file.textSync(), key);
      if (draft) return draft;
    } catch {
      // Try the other copy.
    }
  }
  return null;
}

/** Last cut-out written per stored entry, so an unchanged one is not copied. */
const savedCutouts = new Map<string, string>();

function removeFiles(kind: Kind, key: string) {
  const folder = new Directory(media(), kind);
  if (!folder.exists) return;
  for (const entry of folder.list())
    if (entry instanceof File && entry.name.startsWith(key + "."))
      try {
        entry.delete();
      } catch {
        // A leftover file; removed with "delete all data".
      }
}
function sceneFile(kind: Kind, key: string): File | null {
  const folder = new Directory(media(), kind);
  if (!folder.exists) return null;
  const files = folder
    .list()
    .filter(
      (entry): entry is File =>
        entry instanceof File && entry.name.startsWith(key + ".scene."),
    );
  // A complete file first; a `.tmp` only when the move was cut short.
  return (
    files.find((f) => !f.name.endsWith(TMP)) ??
    files.find((f) => f.name.endsWith(TMP)) ??
    null
  );
}

const PHOTO_EXTS = ["jpg", "jpeg", "png", "heic", "heif", "webp"];
/** Copy `uri` to `dest` unless the same file was copied there last time. */
function copyOnce(cacheKey: string, uri: string, dest: File) {
  if (savedCutouts.get(cacheKey) === uri && dest.exists) return;
  copyInto(uri, dest);
  savedCutouts.set(cacheKey, uri);
}
/** True only when the source file is really gone (not a failed copy). */
function sourceGone(uri: string): boolean {
  try {
    return !new File(uri).exists;
  } catch {
    return false;
  }
}
/**
 * Photos 2..8 (editor file URIs) copied next to the JSON. Returns the stored
 * names; a photo (or cut-out) whose file is gone is left out. Any other copy
 * failure (a full disk) throws, so the save fails like it does for the main
 * cut-out and the stored copies stay.
 */
function writeExtras(
  folder: Directory,
  entry: string,
  id: string,
  list: readonly ExtraPhoto[] | undefined,
): ExtraPhoto[] {
  const stored: ExtraPhoto[] = [];
  for (const photo of (list ?? []).slice(0, MAX_EXTRA_PHOTOS)) {
    const n = stored.length + 1;
    const ext = extOf(photo.source);
    const name = `${id}.x${n}.${PHOTO_EXTS.includes(ext) ? ext : "jpg"}`;
    try {
      copyOnce(`${entry}|x${n}`, photo.source, new File(folder, name));
    } catch (error) {
      // The picked file is gone (cache cleared): the video keeps the others.
      if (sourceGone(photo.source)) continue;
      throw error;
    }
    const kept: ExtraPhoto = { source: name };
    if (photo.cutout && photo.width && photo.height) {
      const cutName = `${id}.x${n}c.png`;
      try {
        copyOnce(`${entry}|x${n}c`, photo.cutout, new File(folder, cutName));
        kept.cutout = cutName;
        kept.width = photo.width;
        kept.height = photo.height;
      } catch (error) {
        // A cut-out that is gone is made again when the draft opens.
        if (!sourceGone(photo.cutout)) throw error;
      }
    }
    stored.push(kept);
  }
  return stored;
}
/** Extra photo files of `id` that the new JSON no longer names. */
function dropOldExtras(folder: Directory, id: string, stored: ExtraPhoto[]) {
  const keep = new Set<string>();
  for (const photo of stored) {
    keep.add(photo.source);
    if (photo.cutout) keep.add(photo.cutout);
  }
  for (const entry of folder.list())
    if (
      entry instanceof File &&
      entry.name.startsWith(id + ".x") &&
      !keep.has(entry.name)
    )
      try {
        entry.delete();
      } catch {
        // A leftover file; removed with "delete all data".
      }
}

/**
 * Photo 1's original photo (an editor file URI) copied next to the JSON as
 * `<id>.p.<ext>`. Returns the stored name, or null when there is none or the
 * picked file is gone. Any other copy failure throws, like the cut-out.
 */
function writeMainPhoto(
  folder: Directory,
  entry: string,
  id: string,
  uri: string | undefined,
): string | null {
  if (!uri) return null;
  const ext = extOf(uri);
  const name = `${id}.p.${PHOTO_EXTS.includes(ext) ? ext : "jpg"}`;
  try {
    copyOnce(`${entry}|p`, uri, new File(folder, name));
  } catch (error) {
    // The picked file is gone (cache cleared): the cut-out stands in.
    if (sourceGone(uri)) return null;
    throw error;
  }
  return name;
}
/** Stored main-photo files of `id` other than `keep`. */
function dropOldMainPhoto(folder: Directory, id: string, keep: string | null) {
  for (const entry of folder.list())
    if (
      entry instanceof File &&
      entry.name.startsWith(id + ".p.") &&
      entry.name !== keep
    )
      try {
        entry.delete();
      } catch {
        // A leftover file; removed with "delete all data".
      }
}

function write(
  kind: Kind,
  draft: Draft,
  cutoutUri: string,
  sceneUri: string | null,
) {
  const folder = dir(kind);
  const image = new File(folder, draft.id + ".png");
  const entry = kind + "/" + draft.id;
  // Copy the cut-out only when it changed (or is missing).
  if (savedCutouts.get(entry) !== cutoutUri || !image.exists) {
    copyInto(cutoutUri, image);
    savedCutouts.set(entry, cutoutUri);
  }
  const oldScene = sceneFile(kind, draft.id);
  let scene = draft.scene;
  let keepScene: string | null = null;
  if (scene && sceneUri) {
    const dest = new File(folder, `${draft.id}.scene.${extOf(sceneUri)}`);
    try {
      copyInto(sceneUri, dest);
      keepScene = dest.uri;
    } catch {
      // The AI scene file is gone (cache cleared): keep the draft without it.
      scene = null;
    }
  }
  const extras = writeExtras(folder, entry, draft.id, draft.extraPhotos);
  const photo = writeMainPhoto(folder, entry, draft.id, draft.photo);
  const { extraPhotos: _uris, photo: _photo, ...rest } = draft;
  void _uris;
  void _photo;
  bumpLibraryVersion();
  writeText(
    new File(folder, draft.id + ".json"),
    serializeDraft({
      ...rest,
      scene,
      ...(extras.length > 0 ? { extraPhotos: extras } : {}),
      ...(photo ? { photo } : {}),
    }),
  );
  // Photos removed (or renumbered) since the last save go now.
  dropOldExtras(folder, draft.id, extras);
  dropOldMainPhoto(folder, draft.id, photo);
  // Only now, with the new JSON in place, an old scene of another type goes.
  if (oldScene && oldScene.uri !== keepScene)
    try {
      oldScene.delete();
    } catch {
      // A leftover file; removed with "delete all data".
    }
}

/** A restored state with working file URIs (fresh copies in the cache). */
export type Restored = {
  /** `extraPhotos` here hold cache file URIs, like `cutoutUri`. */
  draft: Draft;
  cutoutUri: string;
  /** An extra photo's file was gone and it was left out (the editor says so). */
  photosMissing?: boolean;
};

/** Cache copies of the stored extra photos; ones whose file is gone are dropped. */
function readExtras(
  folder: Directory,
  list: readonly ExtraPhoto[],
  tag: string,
): { photos: ExtraPhoto[]; missing: boolean } {
  const { photos, missing } = restoreExtraPhotos(
    list,
    (name) => !!present(new File(folder, name)),
  );
  const out: ExtraPhoto[] = [];
  let lost = missing;
  photos.forEach((photo, i) => {
    try {
      const source = present(new File(folder, photo.source));
      if (!source) throw new Error("gone");
      const copy = new File(
        Paths.cache,
        `vidora-photo-${tag}-${i + 1}.${extOf(photo.source)}`,
      );
      source.copySync(copy);
      const restored: ExtraPhoto = { source: copy.uri };
      const cut = photo.cutout ? present(new File(folder, photo.cutout)) : null;
      if (cut && photo.width && photo.height) {
        const cutCopy = new File(Paths.cache, `vidora-cutout-${tag}-${i + 1}.png`);
        cut.copySync(cutCopy);
        restored.cutout = cutCopy.uri;
        restored.width = photo.width;
        restored.height = photo.height;
      }
      out.push(restored);
    } catch {
      lost = true;
    }
  });
  return { photos: out, missing: lost };
}

function read(kind: Kind, key: string): Restored | null {
  if (!isDraftId(key)) return null;
  const folder = new Directory(media(), kind);
  const image = present(new File(folder, key + ".png"));
  if (!image) return null;
  const draft = readDraftFile(folder, key);
  if (!draft) return null;
  // The editor works on cache copies, so deleting or replacing this draft
  // never pulls a file out from under the live preview.
  const tag = randomUUID().slice(0, 8);
  const cutout = new File(Paths.cache, `vidora-cutout-${tag}.png`);
  image.copySync(cutout);
  let scene = draft.scene;
  const storedScene = scene ? sceneFile(kind, key) : null;
  if (scene && storedScene) {
    const copy = new File(
      Paths.cache,
      `vidora-ai-scene-${tag}.${extOf(storedScene.uri)}`,
    );
    storedScene.copySync(copy);
    scene = { ...scene, uri: copy.uri };
  } else scene = null;
  const { photo: storedPhoto, ...withoutPhoto } = draft;
  const photo = storedPhoto ? readMainPhoto(folder, storedPhoto, tag) : null;
  const base = photo ? { ...withoutPhoto, photo } : withoutPhoto;
  if (!base.extraPhotos)
    return { draft: { ...base, scene }, cutoutUri: cutout.uri };
  const { extraPhotos: stored, ...rest } = base;
  const extras = readExtras(folder, stored, tag);
  return {
    draft:
      extras.photos.length > 0
        ? { ...rest, scene, extraPhotos: extras.photos }
        : { ...rest, scene },
    cutoutUri: cutout.uri,
    photosMissing: extras.missing,
  };
}

/**
 * A cache copy of photo 1's stored original; null when its file is gone (the
 * cut-out then stands in, as in drafts from before 1.2: no note needed).
 */
function readMainPhoto(
  folder: Directory,
  name: string,
  tag: string,
): string | null {
  try {
    const source = present(new File(folder, name));
    if (!source) return null;
    const copy = new File(Paths.cache, `vidora-photo-${tag}-0.${extOf(name)}`);
    source.copySync(copy);
    return copy.uri;
  } catch {
    return null;
  }
}

export function newDraftId(): string {
  return randomUUID();
}

/** Write (or overwrite) a draft. Synchronous so it can run while leaving. */
export function saveDraft(
  meta: { id: string; created: number; sourceClip: string | null },
  state: EditState,
  cutoutUri: string,
): void {
  write(
    "drafts",
    {
      ...state,
      version: DRAFT_VERSION,
      id: meta.id,
      created: meta.created,
      updated: Date.now(),
      sourceClip: meta.sourceClip,
    },
    cutoutUri,
    state.scene?.uri ?? null,
  );
}
export function loadDraft(id: string): Restored | null {
  return read("drafts", id);
}
export function deleteDraft(id: string): void {
  if (!isDraftId(id)) return;
  const shared = loadSharedFiles("drafts", id);
  removeFiles("drafts", id);
  bumpLibraryVersion();
  savedCutouts.delete("drafts/" + id);
  dropSharedIfUnused(shared);
}

export type DraftSummary = Draft & { thumbnail: string };
export function listDrafts(): DraftSummary[] {
  const folder = new Directory(media(), "drafts");
  if (!folder.exists) return [];
  const drafts: DraftSummary[] = [];
  const seen = new Set<string>();
  for (const entry of folder.list()) {
    if (!(entry instanceof File)) continue;
    const match = /^(.+)\.json(?:\.tmp)?$/.exec(entry.name);
    if (!match || seen.has(match[1])) continue;
    const id = match[1];
    seen.add(id);
    const image = present(new File(folder, id + ".png"));
    if (!image) continue;
    const draft = readDraftFile(folder, id);
    if (draft) drafts.push({ ...draft, thumbnail: image.uri });
  }
  return sortDrafts(drafts);
}

/**
 * The sample photo's cut-out size, remembered when the sample starts, so
 * Home can tell a draft that kept the sample photo from one whose photo was
 * changed (the texts alone cannot: they may still equal the sample copy).
 */
const sampleMarker = () => new File(mediaFolder(), "sample-cutout.txt");
export function rememberSampleCutout(width: number, height: number): void {
  try {
    const file = sampleMarker();
    if (!file.exists) file.create({ intermediates: true });
    file.writeSync(`${Math.round(width)}x${Math.round(height)}`);
  } catch {
    // No marker: Home falls back to comparing the texts only.
  }
}
/** True/false once known; null when the sample never ran here. */
export function isSampleCutout(size: {
  width: number;
  height: number;
}): boolean | null {
  // The marker holds only the newest size: a draft of an older sample (or of
  // the current one after the marker moved on) is still the sample.
  if (isKnownSampleCutoutSize(size.width, size.height)) return true;
  try {
    const file = sampleMarker();
    if (!file.exists) return null;
    return (
      file.textSync().trim() ===
      `${Math.round(size.width)}x${Math.round(size.height)}`
    );
  } catch {
    return null;
  }
}

/** Keep the editable state next to a rendered video (for Edit / Duplicate). */
export function saveEdit(
  clipId: string,
  state: EditState,
  cutoutUri: string,
): void {
  const now = Date.now();
  write(
    "edits",
    {
      ...state,
      version: DRAFT_VERSION,
      id: clipId,
      created: now,
      updated: now,
      sourceClip: clipId,
    },
    cutoutUri,
    state.scene?.uri ?? null,
  );
}
export function loadEdit(clipId: string): Restored | null {
  return read("edits", clipId);
}
export function hasEdit(clipId: string): boolean {
  if (!isDraftId(clipId)) return false;
  const folder = new Directory(media(), "edits");
  return (
    folder.exists &&
    !!present(new File(folder, clipId + ".json")) &&
    !!present(new File(folder, clipId + ".png"))
  );
}
/** Remove a video's sidecar; call together with media.remove(clip). */
export function removeEdit(clipId: string): void {
  if (!isDraftId(clipId)) return;
  const shared = loadSharedFiles("edits", clipId);
  removeFiles("edits", clipId);
  bumpLibraryVersion();
  savedCutouts.delete("edits/" + clipId);
  dropSharedIfUnused(shared);
}

/** Files a draft or sidecar shares with others: music and own backdrop. */
function loadSharedFiles(
  kind: Kind,
  key: string,
): { music: string | null; backdrop: string | null } {
  try {
    const draft = readDraftFile(new Directory(media(), kind), key);
    return {
      music: draft?.music?.file ?? null,
      backdrop: draft?.ownBackdrop?.file ?? null,
    };
  } catch {
    return { music: null, backdrop: null };
  }
}
function dropSharedIfUnused(shared: {
  music: string | null;
  backdrop: string | null;
}) {
  if (shared.music) dropMusicIfUnused(shared.music);
  if (shared.backdrop) releaseOwnBackdrop(shared.backdrop);
}

/** True when a draft or video sidecar (other than `exceptDraft`) names `file`. */
function inUse(file: string, exceptDraft?: string): boolean {
  for (const kind of ["drafts", "edits"] as const) {
    const folder = new Directory(media(), kind);
    if (!folder.exists) continue;
    for (const entry of folder.list()) {
      if (!(entry instanceof File) || !/\.json(\.tmp)?$/.test(entry.name))
        continue;
      if (
        kind === "drafts" &&
        (entry.name === exceptDraft + ".json" ||
          entry.name === exceptDraft + ".json" + TMP)
      )
        continue;
      try {
        if (entry.textSync().includes(file)) return true;
      } catch {
        // Unreadable: keep the file, it may still be needed.
        return true;
      }
    }
  }
  return false;
}

const ownBackdrops = () => new Directory(media(), "backdrops");

/**
 * Copy a photo the user picked into the media folder as an own backdrop, so
 * drafts and saved videos can open it again. Returns its file name.
 */
export function importOwnBackdrop(sourceUri: string): string {
  const folder = ownBackdrops();
  if (!folder.exists) folder.create({ intermediates: true, idempotent: true });
  const ext = extOf(sourceUri);
  const name =
    randomUUID() +
    "." +
    (["jpg", "jpeg", "png", "heic", "webp"].includes(ext) ? ext : "jpg");
  copyInto(sourceUri, new File(folder, name));
  return name;
}
/** Local URI of an own backdrop. */
export function ownBackdropUri(file: string): string {
  return new File(ownBackdrops(), file).uri;
}
export function ownBackdropExists(file: string): boolean {
  try {
    return new File(ownBackdrops(), file).exists;
  } catch {
    return false;
  }
}
/**
 * Delete an own backdrop once no draft or video sidecar uses it, like music.
 * `exceptDraft` ignores the open editor's own draft.
 */
export function releaseOwnBackdrop(file: string, exceptDraft?: string): void {
  if (!/^[0-9a-f-]{36}\.[a-z0-9]{1,5}$/i.test(file)) return;
  if (inUse(file, exceptDraft)) return;
  try {
    const target = new File(ownBackdrops(), file);
    if (target.exists) target.delete();
  } catch {
    // Only an orphan photo; removed with "delete all data".
  }
}
/**
 * Delete a copied music file once no draft or video sidecar uses it.
 * `exceptDraft` ignores the open editor's own draft, which is about to be
 * rewritten without this music.
 */
export function releaseMusic(file: string, exceptDraft?: string): void {
  if (inUse(file, exceptDraft)) return;
  try {
    removeMusic(file);
  } catch {
    // Only an orphan audio file.
  }
}
const dropMusicIfUnused = (file: string) => releaseMusic(file);

/** Cache files the product editor writes: cut-outs, AI scenes, restored photos. */
const EDITOR_CACHE = /^vidora-(cutout|ai-scene|photo)-[0-9a-f-]+\.[a-z0-9]+$/i;

/**
 * Delete one editor cache file (a cut-out or AI scene the editor no longer
 * shows). Files outside the cache, such as stored drafts, are never touched.
 */
export function discardEditorFile(uri: string | null | undefined): void {
  if (!uri || !uri.startsWith(Paths.cache.uri)) return;
  try {
    const file = new File(uri);
    if (EDITOR_CACHE.test(file.name) && file.exists) file.delete();
  } catch {
    // The system clears its cache on its own.
  }
}
/**
 * Remove every leftover cut-out and AI scene from the cache. Call when the
 * editor opens: none is in use then (AI Studio opens only from the editor),
 * and drafts and videos keep their own copies in app storage.
 */
export function sweepEditorCache(): void {
  try {
    for (const entry of new Directory(Paths.cache).list())
      if (entry instanceof File && EDITOR_CACHE.test(entry.name))
        try {
          entry.delete();
        } catch {
          // Try again next time.
        }
  } catch {
    // Only leftover files in the cache.
  }
}

/**
 * The newest draft that re-edits `clipId` ("Video düzenlemesi"), so Düzenle
 * opens the edits already made instead of starting over.
 */
export function draftForClip(clipId: string): string | null {
  if (!isDraftId(clipId)) return null;
  const found = listDrafts().find((draft) => draft.sourceClip === clipId);
  return found ? found.id : null;
}

/** The frame shape a video was rendered in (from its edit state). */
export function editRatio(clipId: string): EditState["ratio"] | null {
  if (!isDraftId(clipId)) return null;
  return readDraftFile(new Directory(media(), "edits"), clipId)?.ratio ?? null;
}

/* ---- Batch queue (src/batch-queue.ts) -------------------------------- */

const batchDir = () => new Directory(media(), "batch");

/** Copy a picked photo into app storage so a resumed queue still has it. */
export function importBatchPhoto(sourceUri: string): string {
  const folder = batchDir();
  if (!folder.exists) folder.create({ intermediates: true, idempotent: true });
  const dest = new File(folder, randomUUID() + "." + extOf(sourceUri));
  copyInto(sourceUri, dest);
  return dest.uri;
}

/** Write the queue (aside, then moved in, like drafts). */
export function saveBatchQueue(queue: BatchQueue): void {
  const folder = batchDir();
  if (!folder.exists) folder.create({ intermediates: true, idempotent: true });
  writeText(new File(folder, "queue.json"), serializeBatch(queue));
}

/** The stored queue, or null when there is none or it is unreadable. */
export function loadBatchQueue(): BatchQueue | null {
  const folder = batchDir();
  if (!folder.exists) return null;
  const file = present(new File(folder, "queue.json"));
  if (!file) return null;
  try {
    return parseBatch(file.textSync());
  } catch {
    return null;
  }
}

/** Remove the queue and its photo copies. */
export function clearBatchQueue(): void {
  const folder = batchDir();
  if (folder.exists)
    try {
      folder.delete();
    } catch {
      // Removed with "delete all data" at the latest.
    }
}
