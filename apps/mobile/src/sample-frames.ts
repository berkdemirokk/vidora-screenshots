/**
 * Real template posters, drawn on the phone by the native renderer.
 *
 * Posters stand on the bundled studio backdrops (`src/backdrops.ts`), the
 * same way a new video starts in the editor: the full backdrop image as the
 * scene, the product where `productPlacement` puts it, no shade, and the
 * backdrop's text colours. Passing a `palette` draws the old plain palette.
 *
 * The bundled sample photo's cut-out is made once (`getSampleCutout`: the
 * bundled cut-out copied into place, the phone's own only as the last
 * resort; "Örnekle dene" uses the same function); then one representative frame per template (and palette)
 * is rendered and kept in the cache directory, keyed by template, palette,
 * language, product and app version. Screens use `useTemplatePoster`, which
 * returns a file URI, or null while it is being drawn or when this build has
 * no native renderer (callers then show a neutral placeholder).
 *
 * Looks ("Hazır görünümler") use the same posters with a type family and
 * the user's own texts; see `useLookPoster`.
 *
 * The renderer is called directly (not through product.ts' preview
 * functions), so posters never cancel or sweep the editor's live preview.
 */
import { baseLang } from "./i18n/lang";
import { useContext, useEffect, useState } from "react";
import { Image } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import { Asset } from "expo-asset";
import Constants from "expo-constants";
import { randomUUID } from "expo-crypto";
import { requireOptionalNativeModule } from "expo";
import sampleProductCutoutAsset from "../assets/sample-product-cutout.png";
import sampleProduct from "../assets/sample-product.jpg";
import {
  buildSpec,
  specProblems,
  type AspectRatio,
  type FontStyle,
  type PaletteId,
  type ProductVideoSpec,
  type TemplateId,
} from "./product-templates";
import { backdropById, backdropScene, type BackdropId } from "./backdrops";
import type { Look as CuratedLook } from "./looks";
import { isStaleError, nativePreviewQueue } from "./native-queue";
import { clean, diag } from "./diag";
import { QA_DIAG } from "./config";
import { assertNativeProduct, cutOut, type Cutout } from "./product";
import {
  bundledSampleCutout,
  copyIsComplete,
  parseSampleMeta,
  resolveSampleCutout,
  serializeSampleMeta,
  type SampleCutoutResult,
  type SampleCutoutSource,
  type SampleCutoutValue,
} from "./sample-cutout";
import { Language } from "./ui";

type NativeFrames = {
  frame?: (
    spec: ProductVideoSpec,
    time: number,
    dest: string,
  ) => Promise<string>;
};
const native = requireOptionalNativeModule<NativeFrames>("KareviaProduct");

/** Bump when the poster look (copy, moment, palettes) changes. */
// 3: texts upper-cased in their own language (textLang, audit F3).
// 4: Kampanya on white marble with the approved scheme and Home copy.
// 5: the drawn bottle was replaced by the photoreal amber bottle and new copy.
// 6: sharper sample photo with the bottle filling the frame (1080 x 1440), and
//    its bundled cut-out (484 x 1224).
const POSTER_REVISION = 6;
const VERSION =
  `${Constants.expoConfig?.version ?? "0"}-r${POSTER_REVISION}`.replace(
    /[^a-zA-Z0-9.-]/g,
    "_",
  );

/** The palette each template is shown in when none is given. */
export const POSTER_PALETTE: Partial<Record<TemplateId, PaletteId>> = {
  showcase: "noir",
  lightTour: "ivory",
  turntable: "ocean",
  campaign: "blush",
  unboxing: "emerald",
  store: "ivory",
  editorial: "ivory",
  detail: "noir",
  discount: "blush",
  minimal: "ivory",
};
/**
 * The studio backdrop each template is shown on. Mostly light surfaces, with
 * two dark ones for contrast.
 */
export const POSTER_BACKDROP: Partial<Record<TemplateId, BackdropId>> = {
  showcase: "marble-white",
  lightTour: "travertine",
  turntable: "marble-black",
  campaign: "marble-white",
  unboxing: "paper-sage",
  store: "oak",
  editorial: "paper-sand",
  detail: "walnut",
  discount: "terrazzo",
  minimal: "concrete",
};
const DEFAULT_POSTER_BACKDROP: BackdropId = "marble-white";
const posterBackdrop = (template: TemplateId): BackdropId =>
  POSTER_BACKDROP[template] ?? DEFAULT_POSTER_BACKDROP;

/** Templates added later fall back to this palette. */
const DEFAULT_POSTER_PALETTE: PaletteId = "ivory";
const posterPalette = (template: TemplateId): PaletteId =>
  POSTER_PALETTE[template] ?? DEFAULT_POSTER_PALETTE;

/** Copy that matches the bundled amber bottle. */
export const SAMPLE_COPY = {
  tr: {
    headline: "Lavanta Yağı",
    price: "349 TL",
    oldPrice: "449 TL",
    badge: "Yeni sezon",
    cta: "Hemen al",
    store: "Atölye Nur",
  },
  en: {
    headline: "Lavender Oil",
    price: "$19",
    oldPrice: "$25",
    badge: "New season",
    cta: "Shop now",
    store: "Nur Studio",
  },
} as const;

/**
 * Home's hero (the approved frame): label, name, price with the old price,
 * button. Prices use the app's money format ("349 TL" / "$19").
 */
export const HOME_POSTER_COPY: Record<"tr" | "en", PosterCopy> = {
  tr: {
    headline: "Lavanta Yağı",
    price: "349 TL",
    oldPrice: "449 TL",
    badge: "Yeni sezon",
    cta: "Hemen al",
    store: "",
  },
  en: {
    headline: "Lavender Oil",
    price: "$19",
    oldPrice: "$25",
    badge: "New season",
    cta: "Shop now",
    store: "",
  },
};

function posterDir(): Directory {
  const root = new Directory(Paths.cache, "vidora-posters");
  const dir = new Directory(root, VERSION);
  if (!dir.exists) {
    try {
      // Posters from an older app version or revision are not needed now.
      if (root.exists)
        for (const entry of root.list())
          if (entry.name !== VERSION) entry.delete();
      dir.create({ intermediates: true, idempotent: true });
    } catch {
      // Cache trouble only means posters are drawn again later.
    }
  }
  return dir;
}

/** Short, file-name safe hash of a string. */
function hashKey(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i++)
    hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(36);
}
/** Short, file-name safe key for a product image URI. */
function productKey(uri: string | null | undefined): string {
  return uri ? "p" + hashKey(uri) : "sample";
}

/** Texts drawn on a poster. */
export type PosterCopy = {
  headline: string;
  price: string;
  badge: string;
  cta: string;
  store: string;
  oldPrice?: string;
};
const NO_COPY: PosterCopy = {
  headline: "",
  price: "",
  badge: "",
  cta: "",
  store: "",
};

/**
 * Calls to the renderer run one at a time, in the queue the editor's preview
 * shares: the native `frame` and `frames` calls cancel each other as stale
 * when they overlap (QA run 13: the Vitrin poster and the first preview
 * never finished). Posters are "low": the editor preview goes first.
 */
function serial<T>(
  job: () => Promise<T>,
  priority: "low" | "idle" = "low",
): Promise<T> {
  return nativePreviewQueue.enqueue(job, priority);
}

/** Attempts per poster when the renderer reports it as stale. */
const POSTER_TRIES = 4;
const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** A poster that could not be drawn: logged once, then the grey tile shows. */
function posterFailed(key: string, reason: unknown): null {
  const text =
    reason instanceof Error ? reason.message : String(reason ?? "unknown");
  diag("poster failed", { key, reason: text });
  return null;
}

/**
 * QA only (`EXPO_PUBLIC_QA_DIAG=1`): where each template's poster is, as one
 * line a UI test can read from the accessibility tree (Home's hidden
 * "poster-diag" element): `poster:<template>:drawing:<stage>`,
 * `:ready:<ms>:cutout=<native|bundled|cached>` (the sample's cut-out:
 * copied from the bundle, found from an earlier launch, or (last resort,
 * after the copy failed) made by the phone; `:ready:cached` when the poster
 * itself was already on disk) or `:failed:<stage>:<reason>:n=<failures so far>`. Last write per
 * template wins. With the flag off nothing is stored and `usePosterDiag` returns null.
 */
const diagLabels = new Map<string, string>();
const diagFailures = new Map<string, number>();
const diagListeners = new Set<() => void>();
const diagRead = (template: string) =>
  diagLabels.get(template) ?? `poster:${template}:idle`;
/** A reason as one short token: no paths, no spaces. */
function diagReason(reason: unknown): string {
  const text =
    reason instanceof Error ? reason.message : String(reason ?? "unknown");
  return String(clean(text)).replace(/\s+/g, "_").slice(0, 140);
}
function diagSet(template: string, state: string): void {
  if (!QA_DIAG) return;
  if (state.startsWith("failed"))
    diagFailures.set(template, (diagFailures.get(template) ?? 0) + 1);
  const suffix = state.startsWith("failed")
    ? `:n=${diagFailures.get(template)}`
    : "";
  diagLabels.set(template, `poster:${template}:${state}${suffix}`);
  diagListeners.forEach((listener) => listener());
}
/** The QA line for a template's poster; null unless EXPO_PUBLIC_QA_DIAG=1. */
export function usePosterDiag(template: TemplateId): string | null {
  const [text, setText] = useState(() => diagRead(template));
  useEffect(() => {
    if (!QA_DIAG) return;
    const update = () => setText(diagRead(template));
    diagListeners.add(update);
    update();
    return () => {
      diagListeners.delete(update);
    };
  }, [template]);
  return QA_DIAG ? text : null;
}

/** Pixel size of an image file; null when it cannot be read. */
function imageSize(
  uri: string,
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) =>
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      () => resolve(null),
    ),
  );
}

// --- The sample's cut-out ----------------------------------------------
// One file per app version (`sample-cutout.png` in the poster folder, with
// `sample-cutout.json` next to it holding its size and photo quality), made
// once per session by `getSampleCutout`:
//   1. the file from an earlier launch, if the PNG and its JSON are both
//      there and it has the sample's size ("cached");
//   2. else the bundled cut-out (assets/sample-product-cutout.png) copied to
//      the very same place ("bundled"), reported with the same
//      {uri, width, height, quality};
//   3. else, when that copy failed for ANY reason, the phone's own cut-out of
//      the bundled photo ("native"), only if it has the sample's size.
// The phone's own cut-out of the sample is not tried first: in the simulator
// its colour fallback can return a wrong region instead of failing, and a
// stalled native call would hold up every screen that waits for the sample.
// Posters and "Örnekle dene" (`sampleEditorCutout`) both come through here.
const SAMPLE_CUTOUT_FILE = "sample-cutout.png";
const SAMPLE_CUTOUT_META = "sample-cutout.json";
/** Suffix of a file being written; moved over the real name when complete. */
const PARTIAL = ".part";

/** Delete a file if it is there; never throws. */
function removeQuietly(file: File): void {
  try {
    if (file.exists) file.delete();
  } catch {
    // The system clears its cache on its own.
  }
}

/** The cut-out already on disk (PNG and JSON both usable), else null. */
function cachedSampleCutout(): SampleCutoutValue | null {
  const dir = posterDir();
  const png = new File(dir, SAMPLE_CUTOUT_FILE);
  const meta = new File(dir, SAMPLE_CUTOUT_META);
  if (!png.exists) return null;
  const known = meta.exists ? parseSampleMeta(meta.textSync()) : null;
  if (known) return { ...known, uri: png.uri };
  // A PNG without its numbers (an older build, a cut-off write): the native
  // call refuses to overwrite a file, so clear it and make the cut-out again.
  removeQuietly(png);
  removeQuietly(meta);
  return null;
}

/** Keep the cut-out's numbers next to its PNG; failing only costs a redo. */
function writeSampleMeta(cutout: SampleCutoutValue): void {
  try {
    const meta = new File(posterDir(), SAMPLE_CUTOUT_META);
    removeQuietly(meta);
    meta.create();
    meta.writeSync(serializeSampleMeta(cutout));
  } catch {
    // Next launch finds a PNG without numbers and makes it again.
  }
}

/** A local file URI for an asset module (the copy on disk, not a web URL). */
async function assetFileUri(module: number): Promise<string> {
  const asset = await Asset.fromModule(module).downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  if (!uri) throw new Error("asset has no local file");
  return uri;
}

/**
 * The phone's own cut-out of the bundled photo, written to `dest`: the last
 * resort, after the bundled copy failed (`resolveSampleCutout` rejects a
 * result of the wrong size).
 */
async function nativeSampleCutout(dest: File): Promise<SampleCutoutValue> {
  // A leftover would make the native call refuse ("already exists").
  removeQuietly(dest);
  const result = await cutOut(await assetFileUri(sampleProduct), dest.uri);
  // Never hand out a path that is not there.
  if (!new File(result.uri).exists)
    throw new Error("native cut-out file is missing");
  return result;
}

/**
 * The bundled cut-out, copied to `dest` (where the native one would have
 * been written). The source is the asset's local file: in a release build
 * the file inside the app bundle (expo-asset resolves a bundled asset to its
 * `file://` path and `downloadAsync` returns that path as it is), after an
 * OTA update the update's copy, in development a download in the cache. All
 * three are readable (expo-file-system allows reads in the app bundle).
 */
async function copyBundledSampleCutout(dest: File): Promise<SampleCutoutValue> {
  const source = new File(await assetFileUri(sampleProductCutoutAsset));
  if (!source.exists) throw new Error("bundled sample cut-out is missing");
  const partial = new File(dest.uri + PARTIAL);
  removeQuietly(partial);
  source.copySync(partial);
  if (!partial.exists || !copyIsComplete(partial.size, source.size)) {
    removeQuietly(partial);
    throw new Error("bundled sample cut-out copy is incomplete");
  }
  partial.moveSync(dest, { overwrite: true });
  if (!dest.exists) throw new Error("bundled sample cut-out copy is missing");
  return bundledSampleCutout(dest.uri);
}

let sampleResult: Promise<SampleCutoutResult> | null = null;

/**
 * The bundled sample's cut-out, made once per app session (see above);
 * rejects only when neither the phone nor the bundled copy produced one
 * (with the phone's error), and the next call tries again. The result's
 * `source` says how this session got it.
 */
export function getSampleCutout(): Promise<SampleCutoutResult> {
  return loadSampleCutout(0);
}
function loadSampleCutout(attempt: number): Promise<SampleCutoutResult> {
  if (!sampleResult) {
    const run: Promise<SampleCutoutResult> = (async () => {
      // Without the native module nothing can be drawn or rendered: keep the
      // "needs the new iOS build" message instead of opening a dead editor.
      assertNativeProduct();
      const dest = new File(posterDir(), SAMPLE_CUTOUT_FILE);
      const result = await resolveSampleCutout({
        cached: cachedSampleCutout,
        bundled: () => copyBundledSampleCutout(dest),
        native: () => nativeSampleCutout(dest),
        onBundledFailed: (error) =>
          diag("sample cut-out: bundled copy failed, trying the phone's own", {
            reason: diagReason(error),
          }),
        onNativeFailed: (error) =>
          diag("sample cut-out: native failed too", {
            reason: diagReason(error),
          }),
      });
      if (result.source !== "cached") writeSampleMeta(result.cutout);
      return result;
    })().catch((error: unknown) => {
      // Not final: the next screen retries; the log says why.
      diag("sample cut-out failed", { reason: diagReason(error) });
      if (sampleResult === run) sampleResult = null;
      throw error;
    });
    sampleResult = run;
  }
  const current = sampleResult;
  return current.then((result) => {
    if (new File(result.cutout.uri).exists || attempt >= 1) return result;
    // The system cleared the cache while the app ran: make it again. Only the
    // first caller to notice resets the memo; the others join its new run.
    if (sampleResult === current) sampleResult = null;
    return loadSampleCutout(attempt + 1);
  });
}

/**
 * The sample for the editor ("Örnekle dene"): the same cut-out as the
 * posters', as a working copy in the cache named like a native cut-out
 * (`vidora-cutout-<id>.png`), so the editor can discard or sweep it and
 * drafts copy it like any other. Same shape as `cutOut` returns.
 */
export async function sampleEditorCutout(): Promise<Cutout> {
  const { cutout } = await getSampleCutout();
  const copy = new File(Paths.cache, "vidora-cutout-" + randomUUID() + ".png");
  const source = new File(cutout.uri);
  source.copySync(copy);
  if (!copy.exists) throw new Error("sample cut-out working copy is missing");
  return {
    uri: copy.uri,
    width: cutout.width,
    height: cutout.height,
    quality: cutout.quality,
  };
}

/** A moment where the product has landed and the texts are on screen. */
function posterTime(spec: ProductVideoSpec): number {
  const texts = spec.texts.filter((text) => text.text);
  if (texts.length === 0) return spec.duration * 0.6;
  const latest = Math.max(...texts.map((text) => text.start));
  return Math.min(spec.duration - 0.2, latest + 0.9);
}

const memory = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

/**
 * Posters of the seller's own cut-out live apart ("user"), so the editor can
 * drop them when it sweeps its cache (audit F54); sample posters stay.
 */
const isUserKey = (key: string) => !key.includes("-sample-");
function userPosterDir(): Directory {
  const dir = new Directory(posterDir(), "user");
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}
function posterFile(key: string): File {
  return new File(isUserKey(key) ? userPosterDir() : posterDir(), key + ".jpg");
}
/** Remove posters drawn from a seller's cut-out (disk and memory). */
export function forgetUserPosters(): void {
  for (const key of [...memory.keys()]) if (isUserKey(key)) memory.delete(key);
  try {
    const dir = new Directory(posterDir(), "user");
    if (dir.exists) dir.delete();
  } catch {
    // The system clears its cache on its own.
  }
}

/** What a poster is drawn on: a bundled backdrop or a plain palette. */
type Look = { backdrop: BackdropId | null; palette: PaletteId };

function lookFor(
  template: TemplateId,
  palette?: PaletteId,
  backdrop?: BackdropId | null,
): Look {
  // An explicit palette (the user's choice in the editor) wins over the
  // template's default backdrop; an explicit backdrop wins over both.
  if (backdrop)
    return { backdrop, palette: palette ?? posterPalette(template) };
  if (palette) return { backdrop: null, palette };
  return {
    backdrop: posterBackdrop(template),
    palette: posterPalette(template),
  };
}

function keyFor(
  template: TemplateId,
  look: Look,
  lang: "tr" | "en",
  product: string | null | undefined,
  ratio: AspectRatio,
  bare: boolean,
  fontStyle?: FontStyle,
  copy?: PosterCopy | null,
  safeArea?: "none" | "social",
): string {
  return [
    template,
    look.backdrop ?? look.palette,
    lang,
    productKey(product),
    ratio.replace(":", "x"),
    bare ? "bare" : copy ? "c" + hashKey(JSON.stringify(copy)) : "copy",
    ...(fontStyle ? [fontStyle] : []),
    ...(safeArea === "social" ? ["social"] : []),
  ].join("-");
}

/** Optional poster settings; all default to the template's own look. */
export type PosterOptions = {
  palette?: PaletteId;
  /** A bundled backdrop; default POSTER_BACKDROP unless `palette` is given. */
  backdrop?: BackdropId | null;
  /** Frame shape; default "9:16". */
  ratio?: AspectRatio;
  /** true draws the product without headline, price, badge and button. */
  bare?: boolean;
  /** Type family; default the template's own. */
  fontStyle?: FontStyle;
  /** "social" keeps 9:16 texts clear of Reels/TikTok buttons; default "none". */
  safeArea?: "none" | "social";
  /**
   * Queue order: "low" (the editor's looks, drawn first after the preview)
   * or "idle" (template cards and Home, the default).
   */
  priority?: "low" | "idle";
  /**
   * Texts to draw. Default: the sample copy on the sample product, none on
   * the user's product. `bare` always draws none.
   */
  copy?: PosterCopy | null;
};

/** A poster already on disk or in memory, without drawing anything. */
function cachedPoster(key: string): string | null {
  const known = memory.get(key);
  if (known) return known;
  try {
    const file = posterFile(key);
    if (file.exists) {
      memory.set(key, file.uri);
      return file.uri;
    }
  } catch {
    // Treat as not cached.
  }
  return null;
}

/**
 * Draw (or reuse) the poster of a template. `product` is a cut-out PNG; the
 * bundled sample is used without it. Resolves null when there is no renderer.
 */
export function templatePoster(
  template: TemplateId,
  options: PosterOptions & {
    lang?: "tr" | "en";
    product?: string | null;
  } = {},
): Promise<string | null> {
  const look = lookFor(template, options.palette, options.backdrop),
    lang = options.lang ?? "tr",
    ratio = options.ratio ?? "9:16",
    bare = options.bare ?? false,
    key = keyFor(
      template,
      look,
      lang,
      options.product,
      ratio,
      bare,
      options.fontStyle,
      options.copy,
      options.safeArea,
    );
  const cached = cachedPoster(key);
  if (cached) {
    diagSet(template, "ready:cached");
    return Promise.resolve(cached);
  }
  const running = pending.get(key);
  if (running) return running;
  const started = Date.now();
  let stage = "start";
  const at = (next: string) => {
    stage = next;
    diagSet(template, "drawing:" + next);
  };
  const fail = (reason: unknown): null => {
    diagSet(template, `failed:${stage}:${diagReason(reason)}`);
    return posterFailed(key, reason);
  };
  const job = (async () => {
    const frame = native?.frame;
    if (!frame) {
      diagSet(template, "failed:no-native-frame");
      return null;
    }
    at("cutout");
    // The seller's own cut-out, or the sample's (shared with "Örnekle dene").
    let product = options.product ?? null;
    let cutoutSource: SampleCutoutSource | null = null;
    if (!product) {
      try {
        const sample = await getSampleCutout();
        product = sample.cutout.uri;
        cutoutSource = sample.source;
      } catch (error) {
        return fail("no product cut-out: " + diagReason(error));
      }
    }
    // The user's own product gets no sample copy unless texts are given.
    const copy = bare
      ? NO_COPY
      : (options.copy ?? (options.product ? NO_COPY : SAMPLE_COPY[lang]));
    let scene = null;
    let productSize: { width: number; height: number } | null = null;
    if (look.backdrop) {
      at("size");
      const size = await imageSize(product);
      if (!size) return fail("product size unreadable");
      productSize = size;
      at("scene");
      scene = await backdropScene(look.backdrop, size.width, size.height);
    }
    at("spec");
    const spec = buildSpec({
      template,
      palette: look.palette,
      product,
      ...copy,
      quality: "720p",
      relief: true,
      watermark: false,
      music: null,
      ratio,
      scene,
      productSize,
      fontStyle: options.fontStyle,
      safeArea: options.safeArea ?? "none",
      textLang: lang,
      // Kampanya on its own backdrop (white marble) keeps the approved
      // scheme; every other poster uses the backdrop's text colours.
      colors:
        look.backdrop &&
        !(
          template === "campaign" &&
          look.backdrop === POSTER_BACKDROP.campaign &&
          !backdropById(look.backdrop).dark
        )
          ? backdropById(look.backdrop).colors
          : null,
    });
    const problems = specProblems(spec);
    if (problems.length > 0) return fail("spec: " + problems.join(", "));
    at("frame");
    const dest = posterFile(key);
    // A render (or an old build without the shared queue) can still cancel
    // a poster as stale: try again a few times before giving up.
    for (let attempt = 1; ; attempt++) {
      try {
        const uri = await serial(
          () => frame(spec, posterTime(spec), dest.uri),
          options.priority ?? "idle",
        );
        memory.set(key, uri);
        diagSet(
          template,
          `ready:${Date.now() - started}` +
            (cutoutSource ? `:cutout=${cutoutSource}` : ""),
        );
        return uri;
      } catch (error) {
        if (!isStaleError(error) || attempt >= POSTER_TRIES) throw error;
        await wait(500 * attempt);
      }
    }
  })()
    .catch((error) => fail(error))
    .finally(() => pending.delete(key));
  pending.set(key, job);
  return job;
}

/**
 * The poster URI of a template, or null while it is drawn or when the build
 * cannot draw it. Pass the user's cut-out to see their own product.
 */
export function useTemplatePoster(
  template: TemplateId,
  product?: string | null,
  palette?: PaletteId,
  options: Omit<PosterOptions, "palette"> = {},
): string | null {
  return useTemplatePosterState(template, product, palette, options).uri;
}

/**
 * Like `useTemplatePoster`, and says when it gave up: `failed` turns true
 * once the poster could not be drawn and no more tries are left (or this
 * build cannot draw posters), so a screen waiting for it can leave at once.
 */
export function useTemplatePosterState(
  template: TemplateId,
  product?: string | null,
  palette?: PaletteId,
  options: Omit<PosterOptions, "palette"> = {},
): { uri: string | null; failed: boolean } {
  const { lang: appLang } = useContext(Language);
  // Poster copy exists in Turkish and English only.
  const lang = baseLang(appLang);
  const {
    backdrop,
    ratio = "9:16",
    bare = false,
    fontStyle,
    copy,
    safeArea,
    priority,
  } = options;
  const key = keyFor(
    template,
    lookFor(template, palette, backdrop),
    lang,
    product,
    ratio,
    bare,
    fontStyle,
    copy,
    safeArea,
  );
  const [state, setState] = useState(() => ({
    key,
    uri: cachedPoster(key),
    failed: false,
  }));
  useEffect(() => {
    let live = true;
    const cached = cachedPoster(key);
    if (cached) {
      diagSet(template, "ready:cached");
      setState({ key, uri: cached, failed: false });
      return;
    }
    setState({ key, uri: null, failed: false });
    let retry: ReturnType<typeof setTimeout> | null = null;
    const draw = (tries: number): void =>
      void templatePoster(template, {
        palette,
        backdrop,
        ratio,
        bare,
        lang,
        product,
        fontStyle,
        copy,
        safeArea,
        priority,
      }).then((uri) => {
        if (!live) return;
        // Not a silent final state: a failed poster is drawn again later;
        // `failed` is set only when no try is left.
        const again = !uri && canDrawPosters() && tries < HOOK_RETRIES;
        setState({ key, uri, failed: !uri && !again });
        if (again)
          retry = setTimeout(() => draw(tries + 1), 3000 * (tries + 1));
      });
    draw(0);
    return () => {
      live = false;
      if (retry) clearTimeout(retry);
    };
    // `copy` is part of `key`; the object itself may be new each render.
  }, [
    key,
    template,
    palette,
    backdrop,
    ratio,
    bare,
    lang,
    product,
    fontStyle,
    safeArea,
  ]);
  return state.key === key
    ? { uri: state.uri, failed: state.failed }
    : { uri: cachedPoster(key), failed: false };
}

/**
 * The poster of a curated look with the user's product and texts (9:16).
 * Drawn lazily one at a time and cached like template posters; null while
 * it is drawn or when the build cannot draw.
 */
export function useLookPoster(
  look: CuratedLook,
  product: string | null | undefined,
  copy: PosterCopy | null,
  safeArea: "none" | "social" = "none",
): string | null {
  return useTemplatePoster(
    look.template,
    product,
    look.backdrop ? undefined : look.palette,
    {
      backdrop: look.backdrop,
      fontStyle: look.fontStyle,
      copy,
      safeArea,
      priority: "low",
    },
  );
}

/** Extra rounds a mounted poster tries after a failure. */
const HOOK_RETRIES = 2;

/** True when this build can draw posters at all. */
export function canDrawPosters(): boolean {
  return typeof native?.frame === "function";
}

/**
 * Forget posters held in memory; call after "delete all data" removed the
 * cache folder's `vidora-*` entries, so no tile points at a deleted file.
 */
export function forgetPosters(): void {
  memory.clear();
  pending.clear();
  sampleResult = null;
}
