import { Directory, File, Paths } from "expo-file-system";
import { randomUUID } from "expo-crypto";
import { requireOptionalNativeModule } from "expo";
import * as ImagePicker from "expo-image-picker";
import {
  LocalizedError,
  discardTarget,
  newExportTarget,
  registerExport,
  type Clip,
} from "./media";
import { nativeErrorEnglish, nativeErrorTurkish } from "./native-errors";
import { diag } from "./diag";
import {
  fallbackErrorText,
  frameSize,
  posterTime,
  specProblems,
  stillSize,
  type ImageInfo,
  type PhotoQuality,
  type ProductVideoSpec,
} from "./product-templates";
import {
  categoryById,
  parseCopySuggestions,
  type CategoryId,
  type CopySuggestions,
} from "./product-catalog";

type Subscription = { remove: () => void };
type NativeProduct = {
  cutout: (source: string, dest: string) => Promise<Cutout>;
  render: (spec: ProductVideoSpec, dest: string) => Promise<string>;
  /** Missing in builds made before the preview was added. */
  frame?: (
    spec: ProductVideoSpec,
    time: number,
    dest: string,
  ) => Promise<string>;
  /** Missing in builds made before the playing preview was added. */
  frames?: (
    spec: ProductVideoSpec,
    times: number[],
    destDir: string,
    /** Builds before the width argument ignore it and draw 360 px. */
    width?: number,
  ) => Promise<string[]>;
  /**
   * Missing in builds made before still export was added. `width` 0 = video
   * size; `maxBytes` 0 = no cap. Builds before the size cap return the URI only.
   */
  still?: (
    spec: ProductVideoSpec,
    time: number,
    dest: string,
    width: number,
    maxBytes: number,
  ) => Promise<StillResult | string>;
  /** Missing in builds made before the own-photo scene was added. */
  imageInfo?: (source: string) => Promise<ImageInfo>;
  cancelRender: () => void;
  suggestCopy?: (
    category: string,
    product: string,
    lang: string,
  ) => Promise<{ available: boolean; text?: string }>;
  /** Missing in builds made before the availability check. */
  copyAvailability?: (
    lang: string,
  ) => Promise<{ available: boolean; reason?: string }>;
  /**
   * Missing in builds made before listing text. Raw model text (JSON asked
   * in the prompt); throws "product-listing-unavailable" when it cannot run.
   */
  listingText?: (
    name: string,
    category: string,
    price: string,
    lang: string,
  ) => Promise<string>;
  /** Missing in builds made before listing text; throws "product-translate-unavailable". */
  translateTexts?: (
    texts: string[],
    from: string,
    to: string,
  ) => Promise<string[]>;
  /** Missing in builds made before listing text: {write: langs, translate: langs}. */
  textAvailability?: () => Promise<unknown>;
  /** Missing in builds made before listing text: puts text on the pasteboard. */
  copyText?: (text: string) => Promise<boolean>;
  /** Missing in builds before 1.2.0: physical RAM in bytes (synchronous). */
  deviceMemory?: () => number;
  addListener: (
    event: "onRenderProgress",
    listener: (payload: { progress: number }) => void,
  ) => Subscription;
};
const native = requireOptionalNativeModule<NativeProduct>("KareviaProduct");

/** A saved still: file, size in bytes, pixel size and the JPEG quality used (1 for PNG). */
export type StillResult = {
  uri: string;
  bytes: number;
  width: number;
  height: number;
  quality: number;
};

export type Cutout = {
  uri: string;
  width: number;
  height: number;
  /** Missing on builds made before the photo check; see `photoWarnings`. */
  quality?: PhotoQuality;
};

function needNative(): NativeProduct {
  if (!native)
    throw new LocalizedError(
      "Ürün videosu için uygulamanın yeni iOS derlemesi gerekir.",
      "Product videos require the latest iOS build of the app.",
    );
  return native;
}

/**
 * Native errors carry English text, sometimes with a "product-code:" prefix
 * and the bridge's wrapper. Known messages become clean text in both languages.
 */
function localized(
  error: unknown,
  context: "video" | "cutout" | "still" = "video",
): unknown {
  if (error instanceof LocalizedError) return error;
  const message = error instanceof Error ? error.message : String(error);
  // Specific codes first: "product-cutout-backgrounded" and
  // "product-still-backgrounded" are not the video's background stop.
  for (const [code, tr, en] of CODED)
    if (message.includes(code)) {
      return new LocalizedError(tr, en);
    }
  if (message.includes("product-backgrounded"))
    return new LocalizedError(
      "Uygulama arka plana geçtiği için video durduruldu. Video hazırlanırken Vidora'yı açık tut.",
      "The video was stopped because the app went to the background. Keep Vidora open while it renders.",
    );
  const tr = nativeErrorTurkish(message),
    en = nativeErrorEnglish(message);
  // Unknown system errors still get a readable sentence in both languages;
  // the raw text goes to the diagnostic log, not to the user.
  const fallback = fallbackErrorText(context);
  if (tr === null || en === null)
    diag("product: unmapped native error", message);
  return new LocalizedError(tr ?? fallback.tr, en ?? fallback.en);
}

/** Native error codes this file words itself (native-errors.ts may add them too). */
const CODED: readonly [code: string, tr: string, en: string][] = [
  [
    "product-no-space",
    "iPhone'da yer kalmadı. Biraz yer açıp tekrar dene.",
    "Your iPhone is out of storage. Free up some space and try again.",
  ],
  [
    "product-cutout-failed",
    "Ürün arka plandan ayrılamadı. Tekrar dene.",
    "The product could not be cut out. Try again.",
  ],
  [
    "product-cutout-backgrounded",
    "Ürün ayrılırken uygulama arka plana geçti. Tekrar dene.",
    "The app went to the background while cutting out the product. Try again.",
  ],
  [
    "product-still-backgrounded",
    "Görsel hazırlanırken uygulama arka plana geçti. Tekrar dene.",
    "The app went to the background while the image was being made. Try again.",
  ],
];

/** Room kept free on top of every estimate (the system needs some too). */
const SPACE_HEADROOM = 30 * 1024 * 1024;

/**
 * Throws the "out of storage" message when the device clearly lacks
 * `bytes` (plus headroom). Unknown free space never blocks.
 */
export function ensureFreeSpace(bytes: number): void {
  let free: number;
  try {
    free = Paths.availableDiskSpace;
  } catch {
    return;
  }
  if (!Number.isFinite(free) || free <= 0) return;
  if (free >= bytes + SPACE_HEADROOM) return;
  diag("product: not enough free space", {
    freeMB: Math.round(free / 1048576),
    neededMB: Math.round((bytes + SPACE_HEADROOM) / 1048576),
  });
  const [, tr, en] = CODED[0];
  throw new LocalizedError(tr, en);
}

/** About how many bytes a render of `spec` writes (bitrate x duration). */
export function renderBytes(spec: ProductVideoSpec): number {
  const high = spec.quality === "1080p";
  const bitsPerSecond =
    spec.bitrate === "compact"
      ? high
        ? 4_500_000
        : 2_500_000
      : high
        ? 10_000_000
        : 5_000_000;
  // Music adds a little; 1.2 covers it and the container.
  return Math.ceil(((bitsPerSecond * spec.duration) / 8) * 1.2);
}

/** A newer preview request (or a render) replaced this preview pass. */
function isStalePreview(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("product-preview-stale");
}

/**
 * Let the user choose product photos (one by default); an empty list when
 * cancelled. `selectionLimit` above 1 turns on multi-select (Batch: 10).
 */
export async function pickProductPhotos(selectionLimit = 1): Promise<string[]> {
  const limit = Math.max(1, Math.floor(selectionLimit));
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: limit > 1,
    selectionLimit: limit,
    allowsEditing: false,
    quality: 1,
  });
  if (result.canceled) return [];
  return result.assets.slice(0, limit).map((asset) => asset.uri);
}

/** Let the user choose one product photo; null when cancelled. */
export async function pickProductPhoto(
  selectionLimit = 1,
): Promise<string | null> {
  return (await pickProductPhotos(selectionLimit))[0] ?? null;
}

/** Throws the "needs the new iOS build" message when there is no native module. */
export function assertNativeProduct(): void {
  needNative();
}

/**
 * Cut the product out of the photo (on device, iOS 17+). The PNG goes to a
 * new file in the cache, or to `destUri` (which must not exist yet: the
 * native call refuses to overwrite). The bundled sample uses `destUri`.
 */
export async function cutOut(
  photoUri: string,
  destUri?: string,
): Promise<Cutout> {
  const product = needNative();
  // The PNG (up to 2048 px, RGBA) plus Vision's working buffers.
  ensureFreeSpace(40 * 1024 * 1024);
  const dest = destUri
    ? new File(destUri)
    : new File(Paths.cache, "vidora-cutout-" + randomUUID() + ".png");
  try {
    return await product.cutout(photoUri, dest.uri);
  } catch (error) {
    // The raw native error (a code such as product-no-subject) is for QA;
    // the user gets the localized one.
    diag("cut-out failed", { error });
    if (dest.exists) dest.delete();
    throw localized(error, "cutout");
  }
}

/**
 * Cover moment of a product video (seconds): product fully visible, texts
 * in. Use it for the Library thumbnail and posters instead of frame 0.
 */
export function productPosterTime(spec: ProductVideoSpec): number {
  return posterTime(spec);
}

/** Render a product video into the library. */
export async function renderProductVideo(
  spec: ProductVideoSpec,
  name: string,
  onProgress: (progress: number) => void,
): Promise<Clip> {
  const product = needNative();
  const problems = specProblems(spec);
  if (problems.length > 0)
    throw new LocalizedError(
      "Şablon ayarları geçersiz: " + problems.join(", "),
      "The template settings are invalid: " + problems.join(", "),
    );
  ensureFreeSpace(renderBytes(spec));
  const target = newExportTarget();
  const subscription = product.addListener("onRenderProgress", (event) => {
    const progress = Number(event?.progress);
    if (Number.isFinite(progress))
      onProgress(Math.min(1, Math.max(0, progress)));
  });
  try {
    await product.render(spec, target.uri);
    return await registerExport(target, name, spec.duration);
  } catch (error) {
    discardTarget(target);
    throw localized(error);
  } finally {
    subscription.remove();
  }
}

/** Moments shown in the preview strip, as fractions of the duration. */
export const PREVIEW_MOMENTS = [0.2, 0.5, 0.9] as const;
let previewRound = 0;
/** Files written per preview round, so stale rounds can be removed. */
const previewFiles = new Map<number, File[]>();
/** The last two rounds handed to the UI; their frames may still be on screen. */
let shownRounds: number[] = [];

function forget(file: File) {
  try {
    if (file.exists) file.delete();
  } catch {
    // Only a leftover file in the cache.
  }
}

/** Remove every round's files except the newest round and the shown ones. */
function sweepPreviews() {
  for (const [round, files] of previewFiles) {
    if (round === previewRound || shownRounds.includes(round)) continue;
    files.forEach(forget);
    previewFiles.delete(round);
  }
}

/**
 * Half-resolution frames of the video at PREVIEW_MOMENTS. Returns null when
 * the build has no preview support or a newer preview request replaced this one.
 */
export async function previewFrames(
  spec: ProductVideoSpec,
): Promise<string[] | null> {
  const frame = native?.frame;
  if (!frame || specProblems(spec).length > 0) return null;
  const round = ++previewRound;
  const uris: string[] = [];
  for (const [index, moment] of PREVIEW_MOMENTS.entries()) {
    // A fresh name per round so the Image component reloads it.
    const dest = new File(Paths.cache, `vidora-preview-${index}-${round}.jpg`);
    let uri: string;
    try {
      uri = await frame(spec, spec.duration * moment, dest.uri);
    } catch (error) {
      forget(dest);
      // Replaced by a newer request or a render: nothing to show, not an error.
      if (isStalePreview(error)) {
        sweepPreviews();
        return null;
      }
      throw localized(error);
    } finally {
      // Tracked once written, so a sweep never races a file being written.
      previewFiles.set(round, [...(previewFiles.get(round) ?? []), dest]);
    }
    uris.push(uri);
    if (round !== previewRound) {
      sweepPreviews();
      return null;
    }
  }
  // Keep the previous round too: the UI may still show it if it drops this one.
  shownRounds = [...shownRounds, round].slice(-2);
  sweepPreviews();
  return uris;
}

let flipRound = 0;
/** Folder written per flipbook round, so stale rounds can be removed. */
const flipDirs = new Map<number, Directory>();
/** The last two rounds handed to the UI; their frames may still be on screen. */
let shownFlipRounds: number[] = [];
/** Per launch, so frame files from an earlier launch never collide. */
const flipSession = randomUUID().slice(0, 8);
let leftoversRemoved = false;

/** Flipbook folders from earlier launches are not needed any more. */
function removeLeftoverFlipbooks() {
  if (leftoversRemoved) return;
  leftoversRemoved = true;
  try {
    for (const entry of new Directory(Paths.cache).list()) {
      if (
        entry instanceof Directory &&
        entry.name.startsWith("vidora-flip-") &&
        !entry.name.startsWith(`vidora-flip-${flipSession}-`)
      )
        entry.delete();
    }
  } catch {
    // Only leftover files in the cache.
  }
}

function sweepFlipbooks() {
  for (const [round, dir] of flipDirs) {
    if (round === flipRound || shownFlipRounds.includes(round)) continue;
    try {
      if (dir.exists) dir.delete();
    } catch {
      // Only leftover files in the cache.
    }
    flipDirs.delete(round);
  }
}

/** True when this build can draw a playing preview (batch frames). */
export function hasPlayingPreview(): boolean {
  return typeof native?.frames === "function";
}

/**
 * Small frames of the video at `times` (seconds), drawn from one prepared
 * scene, for the editor's looping preview. Builds without the batch function
 * fall back to the three still preview frames. Returns null when there is no
 * preview support or a newer request replaced this one.
 */
export async function previewFlipbook(
  spec: ProductVideoSpec,
  times: number[],
  /** Pixel width of each frame (240...1080, default 360): the display size. */
  width?: number,
): Promise<string[] | null> {
  const frames = native?.frames;
  if (!frames) return previewFrames(spec);
  if (times.length === 0 || specProblems(spec).length > 0) return null;
  removeLeftoverFlipbooks();
  const round = ++flipRound;
  // A fresh folder per round so the Image component reloads every frame.
  const dir = new Directory(Paths.cache, `vidora-flip-${flipSession}-${round}`);
  flipDirs.set(round, dir);
  let uris: string[];
  try {
    uris =
      width !== undefined && Number.isFinite(width)
        ? await frames(spec, times, dir.uri, Math.round(width))
        : await frames(spec, times, dir.uri);
  } catch (error) {
    if (round !== flipRound || isStalePreview(error)) {
      sweepFlipbooks();
      return null;
    }
    throw localized(error);
  }
  if (round !== flipRound) {
    sweepFlipbooks();
    return null;
  }
  shownFlipRounds = [...shownFlipRounds, round].slice(-2);
  sweepFlipbooks();
  return uris;
}

/** True when this build can save a frame of the video as an image. */
export function hasStillExport(): boolean {
  return typeof native?.still === "function";
}

/**
 * One frame of the video as a local image file; the caller saves or shares
 * it. `time` defaults to the end card, where every text is on screen. PNG
 * keeps the colours exact; JPEG (default) is smaller for marketplaces.
 * `width` asks for another pixel size of the same shape (e.g. 1200 for a
 * 1200 x 1800 image from a 2:3 spec; see `stillSize` for the limits).
 * `maxBytes` caps a JPEG's file size: it is re-encoded with lower quality
 * (down to 0.6) until it fits; the result says the size reached.
 */
export async function saveStill(
  spec: ProductVideoSpec,
  options: {
    time?: number;
    format?: "jpg" | "png";
    width?: number;
    maxBytes?: number;
  } = {},
): Promise<StillResult> {
  const still = native?.still;
  if (!still)
    throw new LocalizedError(
      "Görsel kaydetmek için uygulamanın yeni iOS derlemesi gerekir.",
      "Saving an image requires the latest iOS build of the app.",
    );
  const problems = specProblems(spec);
  if (problems.length > 0)
    throw new LocalizedError(
      "Şablon ayarları geçersiz: " + problems.join(", "),
      "The template settings are invalid: " + problems.join(", "),
    );
  const { width, maxBytes, format = "jpg" } = options;
  const size = width !== undefined ? stillSize(spec.ratio, width) : null;
  if (width !== undefined && !size)
    throw new LocalizedError(
      "Görsel boyutu desteklenmiyor (kenarlar 500–4096 piksel olmalı).",
      "That image size is not supported (sides must be 500–4096 pixels).",
    );
  const time = options.time ?? spec.duration - 0.5;
  const at = Number.isFinite(time)
    ? Math.min(spec.duration, Math.max(0, time))
    : spec.duration - 0.5;
  const cap =
    maxBytes !== undefined && Number.isFinite(maxBytes) && maxBytes > 0
      ? Math.round(maxBytes)
      : 0;
  const pixels = size
    ? size.width * size.height
    : (() => {
        const f = frameSize(spec.ratio, spec.quality);
        return f.width * f.height;
      })();
  // PNG at worst about raw RGBA, JPEG well under one byte per pixel.
  ensureFreeSpace(pixels * (format === "png" ? 4 : 1));
  const dest = new File(Paths.cache, `vidora-still-${randomUUID()}.${format}`);
  try {
    const result = await still(spec, at, dest.uri, size?.width ?? 0, cap);
    if (typeof result === "string") {
      // A build from before the size cap: only the file came back.
      const full = size ?? frameSize(spec.ratio, spec.quality);
      return {
        uri: result,
        bytes: dest.exists ? dest.size : 0,
        ...full,
        quality: format === "png" ? 1 : 0.93,
      };
    }
    return result;
  } catch (error) {
    forget(dest);
    throw localized(error, "still");
  }
}

/** `saveStill` returning only the file URI (kept for existing callers). */
export async function exportStill(
  spec: ProductVideoSpec,
  time: number = spec.duration - 0.5,
  format: "jpg" | "png" = "jpg",
  width?: number,
): Promise<string> {
  return (await saveStill(spec, { time, format, width })).uri;
}

/**
 * Size and brightness of a photo used as the scene ("Kendi fotoğrafın");
 * null on builds without it. Pass the result to `textColorsForScene`.
 */
export async function imageInfo(uri: string): Promise<ImageInfo | null> {
  const read = native?.imageInfo;
  if (!read) return null;
  try {
    return await read(uri);
  } catch (error) {
    throw localized(error);
  }
}

export function cancelProductRender(): void {
  native?.cancelRender();
}

/**
 * Why Apple Intelligence copy is (not) available: "" when it is; "device"
 * not eligible, "off" turned off in Settings, "notReady" still downloading,
 * "language" not offered in this language, "os" before iOS 26 or a build
 * without it, "error" the check itself failed.
 */
export type AiReason =
  "" | "device" | "off" | "notReady" | "language" | "os" | "error";
export type AiAvailability = { available: boolean; reason: AiReason };
const AI_REASONS: readonly AiReason[] = [
  "",
  "device",
  "off",
  "notReady",
  "language",
  "os",
  "error",
];

/** One check per language, shared by the editor and the paywall. */
const aiProbes = new Map<"tr" | "en", Promise<AiAvailability>>();

/**
 * Whether this device can write AI suggestions in `lang`, and why not.
 * Cached per language for the launch, except "notReady" and "error", which
 * are asked again next time. Builds with the native check never generate
 * text for it; older builds fall back to one short generation.
 */
export function aiAvailability(lang: "tr" | "en"): Promise<AiAvailability> {
  const cached = aiProbes.get(lang);
  if (cached) return cached;
  const probe = (async (): Promise<AiAvailability> => {
    const check = native?.copyAvailability;
    if (check) {
      try {
        const result = await check(lang);
        if (result.available) return { available: true, reason: "" };
        const reason = AI_REASONS.includes(result.reason as AiReason)
          ? (result.reason as AiReason)
          : "notReady";
        return { available: false, reason: reason || "notReady" };
      } catch (error) {
        diag("product: AI availability check failed", error);
        return { available: false, reason: "error" };
      }
    }
    if (!native?.suggestCopy) return { available: false, reason: "os" };
    const result = await aiCopyResult(
      "cosmetics",
      lang === "tr" ? "ürün" : "product",
      lang,
    );
    if (result.kind === "ok") return { available: true, reason: "" };
    return {
      available: false,
      reason: result.kind === "failed" ? "error" : "device",
    };
  })();
  aiProbes.set(lang, probe);
  void probe.then((r) => {
    const retry = r.reason === "notReady" || r.reason === "error";
    if (retry && aiProbes.get(lang) === probe) aiProbes.delete(lang);
  });
  return probe;
}

/** `aiAvailability(lang).available`, for callers that only need yes or no. */
export async function aiAvailable(lang: "tr" | "en"): Promise<boolean> {
  return (await aiAvailability(lang)).available;
}

/**
 * Forget the cached checks, e.g. when the app becomes active again or the
 * language changes.
 */
export function resetAiAvailability(): void {
  aiProbes.clear();
}

/**
 * Ad copy from Apple's on-device model: "ok" with the suggestions,
 * "unavailable" when the model cannot run here (or the build predates it),
 * "failed" when it ran but generation or parsing failed (worth a retry).
 */
export async function aiCopyResult(
  category: CategoryId,
  product: string,
  lang: "tr" | "en",
): Promise<
  | { kind: "ok"; suggestions: CopySuggestions }
  | { kind: "unavailable" }
  | { kind: "failed" }
> {
  const suggest = native?.suggestCopy;
  if (!suggest) return { kind: "unavailable" };
  const c = categoryById(category);
  let result: { available: boolean; text?: string };
  try {
    result = await suggest(lang === "tr" ? c.tr : c.en, product, lang);
  } catch (error) {
    // Model busy, guardrail or other failure.
    diag("product: AI copy failed", error);
    return { kind: "failed" };
  }
  if (!result.available) return { kind: "unavailable" };
  if (typeof result.text !== "string") return { kind: "failed" };
  const parsed = parseCopySuggestions(result.text);
  return parsed.headlines.length + parsed.ctas.length > 0
    ? { kind: "ok", suggestions: parsed }
    : { kind: "failed" };
}

/**
 * Which languages the device can write listing text in and translate it
 * into, as the native side reports it (src/listing.ts checks the shape).
 * Null on builds without it or when the check fails.
 */
export async function nativeTextAvailability(): Promise<unknown> {
  const check = native?.textAvailability;
  if (!check) return null;
  try {
    return await check();
  } catch (error) {
    diag("product: text availability check failed", error);
    return null;
  }
}

/**
 * Raw listing text from Apple's on-device model. Null when the build
 * predates it or the model / language cannot run; other failures throw.
 */
export async function nativeListingText(
  name: string,
  category: string,
  price: string,
  lang: string,
): Promise<string | null> {
  const write = native?.listingText;
  if (!write) return null;
  try {
    return await write(name, category, price, lang);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("product-listing-unavailable")) return null;
    diag("product: listing text failed", error);
    throw new LocalizedError(
      "İlan metni yazılamadı. Tekrar dene.",
      "Couldn't write the listing text. Try again.",
    );
  }
}

/**
 * The texts translated on the device (Apple's Translation framework), in
 * order. Null when the build predates it; failures throw a clear message.
 */
export async function nativeTranslateTexts(
  texts: string[],
  from: string,
  to: string,
): Promise<string[] | null> {
  const translate = native?.translateTexts;
  if (!translate) return null;
  try {
    return await translate(texts, from, to);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    diag("product: translation failed", error);
    throw new LocalizedError(
      nativeErrorTurkish(message) ?? TRANSLATE_UNAVAILABLE.tr,
      nativeErrorEnglish(message) ?? TRANSLATE_UNAVAILABLE.en,
    );
  }
}

const TRANSLATE_UNAVAILABLE = {
  tr: "Çeviri bu cihazda şu an kullanılamıyor.",
  en: "Translation isn't available on this device right now.",
};

/**
 * Puts `text` on the pasteboard. False on builds without it (the caller
 * then offers the share sheet, which has "Copy") or when it fails.
 */
export async function copyText(text: string): Promise<boolean> {
  const copy = native?.copyText;
  if (!copy) return false;
  try {
    return (await copy(text)) !== false;
  } catch (error) {
    diag("product: copy failed", error);
    return false;
  }
}

/**
 * The phone's physical RAM in bytes, for picking the render quality. Null on
 * builds without the native function (before 1.2.0) or when it fails or
 * reports something unusable.
 */
export function deviceMemoryBytes(): number | null {
  if (typeof native?.deviceMemory !== "function") return null;
  try {
    const bytes = native.deviceMemory();
    return typeof bytes === "number" && Number.isFinite(bytes) && bytes > 0
      ? bytes
      : null;
  } catch (error) {
    diag("product: device memory check failed", error);
    return null;
  }
}

/**
 * Ad copy from Apple's on-device model. Null when this device has no Apple
 * Intelligence, the build predates it, or generation failed; then the
 * offline bank is used. `aiCopyResult` tells those apart.
 */
export async function aiCopySuggestions(
  category: CategoryId,
  product: string,
  lang: "tr" | "en",
): Promise<CopySuggestions | null> {
  const result = await aiCopyResult(category, product, lang);
  return result.kind === "ok" ? result.suggestions : null;
}
