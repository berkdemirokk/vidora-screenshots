import { Directory, File, Paths } from "expo-file-system";
import { randomUUID } from "expo-crypto";
import { requireOptionalNativeModule } from "expo";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
// SDK 58's root API. Asset.create adds the file as it is (PHAssetChangeRequest
// from the file URL); the legacy save function re-encoded every image,
// losing the exact pixels and the marketplace size cap.
import * as MediaLibrary from "expo-media-library";
import * as Sharing from "expo-sharing";
import type { Ratio } from "./studio";
import type { ExportCaptions } from "./captions";
import { parseClipMetadata, type Clip } from "./clip-metadata";
import {
  isMediaFileName,
  type EditOptions,
  type Fit,
  type Quality,
  type TitlePosition,
} from "./project-state";
import { nativeErrorEnglish, nativeErrorTurkish } from "./native-errors";
import { diag } from "./diag";
import { clearProjects } from "./projects";
export type { Clip } from "./clip-metadata";

const MAX_VIDEO_BYTES = 1536 * 1024 * 1024;
const MAX_MUSIC_BYTES = 50 * 1024 * 1024;
const directory = () => new Directory(Paths.document, "KareviaMedia");

export type ExportSpec = {
  clips: { uri: string; start: number; end: number }[];
  ratio: Ratio;
  quality: Quality;
  fit: Fit;
  volume: number;
  title: string;
  titlePosition: TitlePosition;
  music: { uri: string; volume: number } | null;
  /** Cue times are on the final composed timeline. */
  captions: ExportCaptions | null;
  watermark: boolean;
};
type Subscription = { remove: () => void };
type NativeEditor = {
  duration: (uri: string) => Promise<number>;
  thumbnail: (uri: string, time: number, dest: string) => Promise<string>;
  export: (spec: ExportSpec, dest: string) => Promise<string>;
  cancel: () => void;
  /** Word times are seconds from the start of the source file. */
  transcribe?: (
    uri: string,
    locale: string,
  ) => Promise<{
    words: { text: string; start: number; end: number }[];
    onDevice: boolean;
  }>;
  /** Stops a running transcribe() call; it then rejects "speech-cancelled". */
  cancelTranscribe?: () => void;
  /** Marks a file or folder as excluded from iCloud backup. */
  excludeFromBackup?: (uri: string) => boolean;
  addListener: (
    event: "onExportProgress" | "onTranscribeProgress",
    listener: (payload: { progress: number }) => void,
  ) => Subscription;
};
export const nativeEditor =
  requireOptionalNativeModule<NativeEditor>("KareviaEditor");

/** An error whose message is already written for the user in both languages. */
export class LocalizedError extends Error {
  readonly tr: string;
  readonly en: string;
  constructor(tr: string, en: string) {
    super(en);
    this.name = "LocalizedError";
    this.tr = tr;
    this.en = en;
  }
}
/** A denied permission; the UI offers a button to open the app settings. */
export class PermissionError extends LocalizedError {
  constructor(tr: string, en: string) {
    super(tr, en);
    this.name = "PermissionError";
  }
}
export function describeError(
  error: unknown,
  t: (tr: string, en: string) => string,
): string {
  if (error instanceof LocalizedError) return t(error.tr, error.en);
  // A wrapped failure (e.g. adding to Photos) is described by its cause.
  const cause =
    error instanceof Error && "reason" in error
      ? (error as Error & { reason: unknown }).reason
      : error;
  if (cause !== error) return describeError(cause, t);
  const message = error instanceof Error ? error.message : String(error);
  const turkish = nativeErrorTurkish(message),
    english = nativeErrorEnglish(message);
  if (turkish) return t(turkish, english ?? turkish);
  // Unknown: one plain sentence; the technical text goes to the log only.
  diag("unexpected error", message);
  return t(
    "İşlem tamamlanamadı. Tekrar dene; sorun sürerse uygulamayı kapatıp aç.",
    "That did not work. Try again; if it keeps happening, close and reopen the app.",
  );
}

export function uri(clip: Clip) {
  return new File(directory(), clip.file).uri;
}
export function thumbnailUri(clip: Clip): string | null {
  return clip.thumbnail ? new File(directory(), clip.thumbnail).uri : null;
}
let backupExcluded = false;
/**
 * The media folder (KareviaMedia), created when missing. It is kept out of
 * iCloud backups: marked on the first call per launch and again whenever it
 * was created (after "delete all data" it is recreated, audit G16). Drafts,
 * edit states and own backdrops live inside it and use this helper too.
 */
export function mediaFolder(): Directory {
  const dir = directory();
  let created = false;
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
    created = true;
  }
  if (!backupExcluded || created) {
    // Older native builds lack the function; a failure only means backup.
    try {
      nativeEditor?.excludeFromBackup?.(dir.uri);
    } catch {
      // Keep going: the media is still usable.
    }
    backupExcluded = true;
  }
  return dir;
}
const folder = mediaFolder;

/** Bumped whenever a clip, draft or project is written or deleted. */
let version = 0;
/** Lets screens skip re-listing when nothing changed since their last look. */
export function libraryVersion(): number {
  return version;
}
export function bumpLibraryVersion(): void {
  version++;
}

/** Clip metadata files in the media folder (not projects or temp files). */
function metaFiles(): File[] {
  return folder()
    .list()
    .filter(
      (entry): entry is File =>
        entry instanceof File &&
        entry.name.endsWith(".json") &&
        !entry.name.endsWith(".project.json"),
    );
}
/** Existing clips only, newest first: one rule for list() and listSync(). */
function finishList(clips: (Clip | null)[]): Clip[] {
  return clips
    .filter(
      (clip): clip is Clip =>
        clip !== null && new File(folder(), clip.file).exists,
    )
    .sort((a, b) => b.created - a.created);
}
export async function list(): Promise<Clip[]> {
  const clips = await Promise.all(
    metaFiles().map(async (meta): Promise<Clip | null> => {
      try {
        return parseClipMetadata(await meta.text(), meta.name);
      } catch {
        return null;
      }
    }),
  );
  return finishList(clips);
}
/** The same as list(), read synchronously, so a screen opens in its final layout. */
export function listSync(): Clip[] {
  return finishList(
    metaFiles().map((meta) => {
      try {
        return parseClipMetadata(meta.textSync(), meta.name);
      } catch {
        return null;
      }
    }),
  );
}
function record(clip: Clip) {
  // Written aside, then moved into place: a kill never leaves a half file.
  const meta = new File(folder(), clip.id + ".json"),
    temp = new File(folder(), clip.id + ".json.tmp");
  if (temp.exists) temp.delete();
  temp.create();
  temp.writeSync(JSON.stringify(clip));
  temp.moveSync(meta, { overwrite: true });
  bumpLibraryVersion();
  return clip;
}
function extension(name: string, fallback: string) {
  const parts = name.split(".");
  const ext =
    parts.length > 1
      ? parts[parts.length - 1].replace(/[^a-zA-Z0-9]/g, "").slice(0, 8)
      : "";
  // ".json" and ".jpg" are reserved for metadata and thumbnails.
  return ext && !/^(json|jpe?g)$/i.test(ext) ? ext.toLowerCase() : fallback;
}
function discardCached(file: File) {
  try {
    if (file.uri.startsWith(Paths.cache.uri) && file.exists) file.delete();
  } catch {
    // The system clears its cache on its own; nothing to recover here.
  }
}
async function probeDuration(mediaUri: string) {
  return nativeEditor ? await nativeEditor.duration(mediaUri) : 0;
}
/**
 * Best effort: a missing thumbnail must never fail an import or export.
 * `at` picks the moment (e.g. the end card of a render); default 0.5 s.
 */
async function makeThumbnail(
  id: string,
  mediaUri: string,
  duration: number,
  at?: number,
) {
  if (!nativeEditor) return undefined;
  const name = id + ".jpg",
    dest = new File(folder(), name);
  try {
    if (dest.exists) dest.delete();
    const wanted = at ?? Math.min(0.5, duration / 2);
    await nativeEditor.thumbnail(
      mediaUri,
      Math.max(0, Math.min(wanted, Math.max(0, duration - 0.1))),
      dest.uri,
    );
    return dest.exists ? name : undefined;
  } catch {
    try {
      if (dest.exists) dest.delete();
    } catch {
      // Ignored: an orphan thumbnail is removed with clear().
    }
    return undefined;
  }
}
async function finishClip(
  id: string,
  file: string,
  name: string,
  kind: Clip["kind"],
  duration: number,
  options: { thumbAt?: number } = {},
): Promise<Clip> {
  const thumbnail = await makeThumbnail(
    id,
    new File(folder(), file).uri,
    duration,
    options.thumbAt,
  );
  return record({
    id,
    file,
    name,
    kind,
    created: Date.now(),
    duration,
    ...(thumbnail ? { thumbnail } : {}),
  });
}

async function importVideo(sourceUri: string, name: string): Promise<Clip> {
  const input = new File(sourceUri);
  try {
    if ((input.size ?? 0) > MAX_VIDEO_BYTES)
      throw new LocalizedError(
        "Video 1,5 GB sınırını aşıyor. Daha kısa bir bölüm seç.",
        "The video is over the 1.5 GB limit. Choose a shorter part.",
      );
    const duration = await probeDuration(input.uri),
      id = randomUUID(),
      file = id + "." + extension(name, "mp4"),
      dest = new File(folder(), file);
    input.copySync(dest);
    try {
      return await finishClip(id, file, name, "source", duration);
    } catch (error) {
      if (dest.exists) dest.delete();
      throw error;
    }
  } finally {
    discardCached(input);
  }
}
export type ImportResult = {
  clips: Clip[];
  failed: { name: string; error: unknown }[];
};
async function importAll(
  sources: { uri: string; name: string }[],
): Promise<ImportResult> {
  const result: ImportResult = { clips: [], failed: [] };
  // Sequential on purpose: each copy can be hundreds of megabytes.
  for (const source of sources) {
    try {
      result.clips.push(await importVideo(source.uri, source.name));
    } catch (error) {
      result.failed.push({ name: source.name, error });
      if (result.clips.length === 0 && sources.length === 1) throw error;
    }
  }
  return result;
}
function fileName(sourceUri: string) {
  const last = sourceUri.split("/").pop() ?? "";
  try {
    return decodeURIComponent(last) || "video.mp4";
  } catch {
    return last || "video.mp4";
  }
}

/** Primary import: the system Photos picker (no library permission needed). */
export async function pickFromPhotos(limit = 0): Promise<ImportResult> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["videos"],
    allowsMultipleSelection: true,
    allowsEditing: false,
    selectionLimit: Math.max(0, limit),
    // Keep the original file instead of a slow "compatible" transcode.
    preferredAssetRepresentationMode:
      ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
  });
  if (result.canceled) return { clips: [], failed: [] };
  return importAll(
    result.assets.map((asset) => ({
      uri: asset.uri,
      name: asset.fileName || fileName(asset.uri),
    })),
  );
}
/** Secondary import: the Files document picker. */
export async function pickFromFiles(): Promise<ImportResult> {
  const result = await DocumentPicker.getDocumentAsync({
    type: "video/*",
    copyToCacheDirectory: true,
    multiple: true,
  });
  if (result.canceled) return { clips: [], failed: [] };
  return importAll(
    result.assets.map((asset) => ({ uri: asset.uri, name: asset.name })),
  );
}

/** Copy an audio file into the media folder; it has no metadata record. */
export async function pickMusic(): Promise<{
  file: string;
  name: string;
} | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: "audio/*",
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;
  const asset = result.assets[0],
    input = new File(asset.uri);
  try {
    if ((input.size ?? 0) > MAX_MUSIC_BYTES)
      throw new LocalizedError(
        "Müzik dosyası 50 MB sınırını aşıyor.",
        "The music file is over the 50 MB limit.",
      );
    const file = randomUUID() + "." + extension(asset.name, "m4a");
    input.copySync(new File(folder(), file));
    return { file, name: asset.name.slice(0, 255) };
  } finally {
    discardCached(input);
  }
}
export function musicExists(file: string): boolean {
  return isMediaFileName(file) && new File(directory(), file).exists;
}
/** Delete a copied music file; refuses anything that is a recorded clip. */
export function removeMusic(file: string): void {
  if (!isMediaFileName(file) || /\.(json|jpe?g)$/i.test(file)) return;
  const dir = directory();
  if (!dir.exists) return;
  if (new File(dir, file.slice(0, 36) + ".json").exists) return;
  const target = new File(dir, file);
  if (target.exists) target.delete();
}

export type ExportSegment = { clip: Clip; start: number; end: number };
export async function exportTimeline(
  segments: ExportSegment[],
  options: EditOptions,
  name: string,
  onProgress: (progress: number) => void,
  captions: ExportCaptions | null = null,
  /** Free exports carry the Vidora watermark; only Pro passes false. */
  watermark = true,
): Promise<Clip> {
  if (!nativeEditor)
    throw new LocalizedError(
      "Dışa aktarma için iOS uygulama derlemesi gerekir.",
      "Export requires the native iOS build.",
    );
  if (segments.length < 1 || segments.length > 20)
    throw new LocalizedError(
      "Dışa aktarma için 1–20 klip gerekir.",
      "Export needs between 1 and 20 clips.",
    );
  const id = randomUUID(),
    file = id + ".mp4",
    dest = new File(folder(), file);
  const music =
    options.music && musicExists(options.music.file)
      ? {
          uri: new File(directory(), options.music.file).uri,
          volume: options.music.volume,
        }
      : null;
  const subscription = nativeEditor.addListener("onExportProgress", (event) => {
    const progress = Number(event?.progress);
    if (Number.isFinite(progress))
      onProgress(Math.min(1, Math.max(0, progress)));
  });
  try {
    await nativeEditor.export(
      {
        clips: segments.map((segment) => ({
          uri: uri(segment.clip),
          start: segment.start,
          end: segment.end,
        })),
        ratio: options.ratio,
        quality: options.quality,
        fit: options.fit,
        volume: options.volume,
        title: options.title,
        titlePosition: options.titlePosition,
        music,
        captions,
        watermark,
      },
      dest.uri,
    );
    const trimmed = segments.reduce(
      (sum, segment) => sum + segment.end - segment.start,
      0,
    );
    // The real length of the file (caption timing in multi-clip exports);
    // the sum of the trims when it cannot be read.
    let measured = 0;
    try {
      measured = await probeDuration(dest.uri);
    } catch {
      measured = 0;
    }
    const duration =
      Number.isFinite(measured) && measured > 0 ? measured : trimmed;
    const length = Math.round(duration * 1000) / 1000;
    return await finishClip(
      id,
      file,
      (name.replace(/\.[^.]+$/, "") || "video") + "-cut.mp4",
      "export",
      length,
      // A moment with the title and the edit in view, not the first frame.
      { thumbAt: Math.min(length - 0.3, length * 0.6) },
    );
  } catch (error) {
    if (dest.exists) dest.delete();
    throw error;
  } finally {
    subscription.remove();
  }
}
export function cancelExport(): void {
  nativeEditor?.cancel();
}

/** Local URI of a music file copied by pickMusic(). */
export function musicUri(file: string): string {
  return new File(directory(), file).uri;
}

/** A fresh destination in the media folder for a rendered video. */
export function newExportTarget(): { id: string; file: string; uri: string } {
  const id = randomUUID(),
    file = id + ".mp4";
  return { id, file, uri: new File(folder(), file).uri };
}
/** Record a rendered video in the library (with a poster frame). */
export async function registerExport(
  target: { id: string; file: string },
  name: string,
  duration: number,
  options: { thumbAt?: number } = {},
): Promise<Clip> {
  return finishClip(target.id, target.file, name, "export", duration, options);
}
/** Delete a target whose render failed. */
export function discardTarget(target: { file: string }): void {
  const file = new File(folder(), target.file);
  if (file.exists) file.delete();
}

export async function storeOutput(bytes: ArrayBuffer, name: string) {
  const id = randomUUID(),
    file = id + ".mp4",
    dest = new File(folder(), file);
  dest.create();
  try {
    dest.writeSync(new Uint8Array(bytes));
    const duration = await probeDuration(dest.uri);
    return await finishClip(id, file, name, "export", duration);
  } catch (error) {
    dest.delete();
    throw error;
  }
}
export function remove(clip: Clip) {
  for (const name of [clip.file, clip.id + ".json", clip.id + ".jpg"]) {
    const target = new File(folder(), name);
    if (target.exists) target.delete();
  }
  bumpLibraryVersion();
}
/**
 * Delete every imported clip, export, music file, draft, video edit state,
 * own backdrop and saved project, and the app's cache copies: posters with
 * the user's product and texts, preview frames, cut-outs and picked photos
 * (every `vidora-*` entry in the cache folder).
 */
export function clear() {
  const dir = directory();
  if (dir.exists) dir.delete();
  // The recreated folder must be kept out of backups again (audit G16).
  backupExcluded = false;
  clearProjects();
  clearAppCaches();
  bumpLibraryVersion();
}
/** Remove the app's own entries in the cache folder (`vidora-*`). */
export function clearAppCaches(): void {
  try {
    for (const entry of Paths.cache.list())
      if (entry.name.startsWith("vidora-"))
        try {
          entry.delete();
        } catch {
          // The system clears its cache on its own.
        }
  } catch {
    // No cache folder: nothing to clear.
  }
}
export async function share(clip: Clip) {
  if (!(await Sharing.isAvailableAsync()))
    throw new LocalizedError(
      "Bu cihazda paylaşım kullanılamıyor.",
      "Sharing is not available on this device.",
    );
  // A readable file name for AirDrop, Files and Mail, not the stored UUID
  // (audit G32): a copy in its own cache folder. Old copies go at the start
  // of the next share, so a slow share extension is never cut off.
  removeShareCopies();
  let shared = uri(clip);
  try {
    const dir = new Directory(Paths.cache, "vidora-share-" + randomUUID());
    dir.create({ intermediates: true, idempotent: true });
    const ext = clip.file.split(".").pop() || "mp4";
    const copy = new File(dir, shareBaseName(clip.name) + "." + ext);
    new File(shared).copySync(copy);
    shared = copy.uri;
  } catch {
    // Share the stored file under its own name rather than not at all.
  }
  await Sharing.shareAsync(shared, {
    mimeType: clip.file.endsWith(".mp4") ? "video/mp4" : undefined,
  });
}
/**
 * A file name from the clip's name: the extension and preset suffix go (the
 * same rule as ui.tsx `displayName`), characters files cannot hold become
 * "-", at most 60 characters, "Vidora" when nothing is left.
 */
export function shareBaseName(name: string): string {
  const base = name
    .replace(/(-trendyol|-reels|-cut)?\.[a-z0-9]{2,4}$/i, "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60)
    .trim();
  return base || "Vidora";
}
function removeShareCopies() {
  try {
    for (const entry of Paths.cache.list())
      if (entry.name.startsWith("vidora-share-"))
        try {
          entry.delete();
        } catch {
          // Left for clearAppCaches.
        }
  } catch {
    // No cache folder.
  }
}
/** Save a clip to the Photos library using add-only permission. */
export async function saveToPhotos(clip: Clip) {
  const permission = await MediaLibrary.requestPermissionsAsync(true);
  if (!permission.granted)
    throw new PermissionError(
      "Fotoğraflar'a ekleme izni verilmedi. Ayarlar > Vidora > Fotoğraflar bölümünden izin verebilirsin.",
      "Permission to add to Photos was denied. You can allow it in Settings > Vidora > Photos.",
    );
  await addFileToPhotos(uri(clip));
}

/**
 * Add a local image or video file to Photos unchanged (add-only access must
 * be granted). The native side takes a URL: a bare path becomes `file://`.
 */
export async function addFileToPhotos(fileUri: string): Promise<void> {
  const url = fileUri.startsWith("/") ? "file://" + fileUri : fileUri;
  await MediaLibrary.Asset.create(url);
}

export async function shareCaptions(data: ArrayBuffer) {
  if (!(await Sharing.isAvailableAsync()))
    throw new LocalizedError(
      "Bu cihazda paylaşım kullanılamıyor.",
      "Sharing is not available on this device.",
    );
  const file = new File(Paths.cache, "karevia-" + randomUUID() + ".srt");
  file.create();
  try {
    file.writeSync(new Uint8Array(data));
    await Sharing.shareAsync(file.uri, { mimeType: "application/x-subrip" });
  } finally {
    if (file.exists) file.delete();
  }
}

/**
 * Take a product photo with the camera; null when cancelled. The system
 * asks for camera access the first time (NSCameraUsageDescription).
 */
export async function takeProductPhoto(): Promise<string | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted)
    throw new PermissionError(
      "Kamera izni verilmedi. Ayarlar > Vidora > Kamera bölümünden izin verebilirsin.",
      "Camera access was denied. You can allow it in Settings > Vidora > Camera.",
    );
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ["images"],
    allowsEditing: false,
    quality: 1,
  });
  if (result.canceled || !result.assets[0]) return null;
  return result.assets[0].uri;
}
