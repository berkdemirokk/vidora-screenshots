/**
 * Posters of the gallery's recipe variants: one still per variant, drawn
 * once on the phone with the bundled sample (photo + its cut-out) and the
 * sample copy, then kept in the cache:
 *
 *   Library/Caches/vidora-gallery/<variantId>-<rev>.jpg
 *
 * `rev` holds the app version, the native build number, GALLERY_REVISION and
 * the copy language. Posters are drawn POSTER_WIDTH pixels wide with the
 * native batch call (`frames`, one time); builds without it use `frame`
 * (540 px). Both write JPEG, hence .jpg. Drawing goes through the renderer
 * queue the editor preview shares, at "idle" priority (Home's hero poster and
 * the editor go first), one frame at a time. Older posters are removed by
 * `pruneGalleryPosters`, called once after the gallery mounts. Screens use
 * `useGalleryPoster`, which returns a file URI, or null while it is drawn,
 * when it failed, or before the screen asks for it (`enabled`).
 */
import { useContext, useEffect, useState } from "react";
import { Directory, File, Paths } from "expo-file-system";
import { Asset } from "expo-asset";
import Constants from "expo-constants";
import { requireOptionalNativeModule } from "expo";
import sampleProduct from "../assets/sample-product.jpg";
import { baseLang } from "./i18n/lang";
import { specProblems, type ProductVideoSpec } from "./product-templates";
import { buildRecipeSpec } from "./recipes/build";
import type { RecipeVariant } from "./recipes";
import { galleryPosterTime } from "./gallery";
import { isStaleError, nativePreviewQueue } from "./native-queue";
import { diag } from "./diag";
import { SAMPLE_COPY, getSampleCutout } from "./sample-frames";
import { Language } from "./ui";

type NativeFrames = {
  frame?: (
    spec: ProductVideoSpec,
    time: number,
    dest: string,
  ) => Promise<string>;
  frames?: (
    spec: ProductVideoSpec,
    times: number[],
    destDir: string,
    width?: number,
  ) => Promise<string[]>;
};
const native = requireOptionalNativeModule<NativeFrames>("KareviaProduct");

/** Bump when the gallery posters change (moments, copy, recipes). */
const GALLERY_REVISION = 1;
/** Pixel width of a poster: cards are 132 pt wide (about 400 px at 3x). */
const POSTER_WIDTH = 360;
/**
 * The native build number: a new build (renderer change) draws posters
 * again even when the app version stays. eas.json uses appVersionSource
 * "remote" with autoIncrement, so app.json's ios.buildNumber ("1") never
 * changes; the binary's own CFBundleVersion (Constants.platform.ios) is the
 * real one. expo-application is not installed. An OTA that changes recipes
 * still bumps GALLERY_REVISION (same binary, same build number).
 */
const buildNumber =
  Constants.platform?.ios?.buildNumber ??
  Constants.expoConfig?.ios?.buildNumber ??
  "0";
const VERSION =
  `${Constants.expoConfig?.version ?? "0"}b${buildNumber}r${GALLERY_REVISION}`.replace(
    /[^a-zA-Z0-9.]/g,
    "_",
  );
const revOf = (lang: "tr" | "en") => `${VERSION}${lang}`;

/** Attempts per poster when a render made the frame call stale. */
const TRIES = 3;
const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** The poster folder; nothing is created or deleted here (safe in render). */
const galleryDir = () => new Directory(Paths.cache, "vidora-gallery");

let pruned = false;
/**
 * Remove posters of an older app version, build or revision (and leftover
 * drawing folders). Once per session, from an effect after the gallery
 * mounts, never during render.
 */
export function pruneGalleryPosters(): void {
  if (pruned) return;
  pruned = true;
  try {
    const dir = galleryDir();
    if (!dir.exists) return;
    for (const entry of dir.list())
      if (!entry.name.includes(`-${VERSION}`))
        entry.delete();
  } catch {
    // Cache trouble only means posters are drawn again later.
  }
}

function posterFile(variant: RecipeVariant, lang: "tr" | "en"): File {
  const rev = revOf(lang);
  return new File(galleryDir(), `${variant.id}-${rev}.jpg`);
}

/**
 * One frame at `time`, POSTER_WIDTH wide, written to `dest`: the batch call
 * draws into a scratch folder, its file is moved into place. Builds without
 * it fall back to the single-frame call.
 */
async function drawPoster(
  spec: ProductVideoSpec,
  time: number,
  dest: File,
): Promise<string> {
  const frames = native?.frames;
  if (!frames) {
    const frame = native?.frame;
    if (!frame) throw new Error("no native renderer");
    return frame(spec, time, dest.uri);
  }
  const scratch = new Directory(galleryDir(), "draw-" + dest.name);
  try {
    const [drawn] = await frames(spec, [time], scratch.uri, POSTER_WIDTH);
    if (!drawn) throw new Error("no frame drawn");
    const file = new File(drawn);
    if (dest.exists) dest.delete();
    file.moveSync(dest);
    return dest.uri;
  } finally {
    try {
      if (scratch.exists) scratch.delete();
    } catch {
      // A leftover folder goes with the next prune.
    }
  }
}

const pending = new Map<string, Promise<string | null>>();

/** The poster already on disk, without drawing; null when there is none. */
function cachedGalleryPoster(
  variant: RecipeVariant,
  lang: "tr" | "en",
): string | null {
  try {
    const file = posterFile(variant, lang);
    // Read from disk each time: "delete all data" may have removed it.
    if (file.exists) return file.uri;
  } catch {
    // Treat as not cached.
  }
  return null;
}

/** A file URI for the bundled sample photo (the photo-mode scenes). */
async function samplePhoto(): Promise<string> {
  const asset = await Asset.fromModule(sampleProduct).downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  if (!uri) throw new Error("sample photo has no local file");
  return uri;
}

/** Draw (or reuse) a variant's poster; null when it cannot be drawn. */
export function galleryPoster(
  variant: RecipeVariant,
  lang: "tr" | "en",
): Promise<string | null> {
  const cached = cachedGalleryPoster(variant, lang);
  if (cached) return Promise.resolve(cached);
  const dest = posterFile(variant, lang);
  const running = pending.get(dest.uri);
  if (running) return running;
  const job = (async () => {
    if (!native?.frames && !native?.frame) return null;
    const dir = galleryDir();
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const [{ cutout }, photo] = await Promise.all([
      getSampleCutout(),
      samplePhoto(),
    ]);
    const copy = SAMPLE_COPY[lang];
    const spec = buildRecipeSpec(variant.recipe, {
      photos: [photo],
      cutouts: [cutout.uri],
      name: copy.headline,
      price: copy.price,
      oldPrice: copy.oldPrice,
      badge: copy.badge,
      cta: copy.cta,
      palette: variant.palette,
      ratio: "9:16",
      quality: "720p",
    });
    const problems = specProblems(spec);
    if (problems.length > 0) throw new Error("spec: " + problems.join(", "));
    const at = galleryPosterTime(variant.recipe.id, spec.duration);
    for (let attempt = 1; ; attempt++) {
      try {
        const uri = await nativePreviewQueue.enqueue(
          () => drawPoster(spec, at, dest),
          "idle",
        );
        return uri;
      } catch (error) {
        if (!isStaleError(error) || attempt >= TRIES) throw error;
        await wait(500 * attempt);
      }
    }
  })()
    .catch((error: unknown) => {
      diag("gallery poster failed", {
        variant: variant.id,
        reason: error instanceof Error ? error.message : String(error),
      });
      return null;
    })
    .finally(() => pending.delete(dest.uri));
  pending.set(dest.uri, job);
  return job;
}

/**
 * The poster URI of a variant, or null while it is drawn (or when it could
 * not be). Nothing is drawn until `enabled` is true; a cached poster shows
 * at once either way. Depends only on the variant id, the language and
 * `enabled`, so it never re-runs on an unrelated render.
 */
export function useGalleryPoster(
  variant: RecipeVariant,
  enabled: boolean,
): string | null {
  const { lang: appLang } = useContext(Language);
  // The sample copy exists in Turkish and English only.
  const lang = baseLang(appLang);
  const key = `${variant.id}|${lang}`;
  const [state, setState] = useState(() => ({
    key,
    uri: cachedGalleryPoster(variant, lang),
  }));
  useEffect(() => {
    const cached = cachedGalleryPoster(variant, lang);
    if (cached || !enabled) {
      setState((now) =>
        now.key === key && now.uri === cached ? now : { key, uri: cached },
      );
      return;
    }
    let live = true;
    void galleryPoster(variant, lang).then((uri) => {
      if (live) setState({ key, uri });
    });
    return () => {
      live = false;
    };
    // `variant` is fixed per id (VARIANTS is a constant list).
  }, [key, enabled]);
  return state.key === key ? state.uri : null;
}
