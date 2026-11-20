/**
 * The bundled sample's cut-out: what the code knows about the asset, and the
 * order in which a cut-out is found. Pure (no imports), so Node tests it.
 *
 * The sample photo (`assets/sample-product.jpg`) must always have a cut-out:
 * posters, the paywall's proof and "Örnekle dene" (also for App Review) start
 * from it. Apple's subject lifting can fail (the iOS simulator has none; a
 * phone in the background or with a full disk fails it too), and the colour
 * fallback that runs instead cannot be trusted: it failed on the previous
 * sample photo, but it was not shown to fail on this one (it depends on the
 * resampler), and it can "succeed" with a wrong region. So the sample never
 * waits for the phone's own cut-out. The app carries the cut-out Apple's
 * subject lifting makes for exactly this photo
 * (`assets/sample-product-cutout.png`, made on a macOS host by
 * `tools/vision_cutout.swift` through the GitHub Actions workflow "Sample
 * cut-out"; see docs/assets-src/SOURCES.md) and copies it into place; the
 * phone's own cut-out is only the last resort, and a result of the wrong size
 * is never accepted (cached or native). `getSampleCutout` in sample-frames.ts
 * is the one caller of `resolveSampleCutout`; posters and "Örnekle dene" both
 * go through it.
 *
 * Whenever the sample photo changes: re-run the workflow, replace the PNG,
 * update these constants (`node --test` has an asset guard that fails until
 * they match), run `python tools/sample_cutout_quality.py --check`, and bump
 * POSTER_REVISION in sample-frames.ts.
 */

/** `assets/sample-product.jpg`: pixel size (read from the JPEG header) and bytes. */
export const SAMPLE_PHOTO = {
  width: 1080,
  height: 1440,
  bytes: 170908,
} as const;

/**
 * `assets/sample-product-cutout.png`: 8-bit RGBA, the size and byte count of
 * the file, and the `quality` the native cut-out would report for it.
 *
 * `quality` is NOT measured on the phone: `tools/sample_cutout_quality.py`
 * repeats ProductImages.quality(cutout:photo:) of KareviaProductModule.swift
 * for this PNG and this photo (Laplacian variance of the product's luma at
 * most 512 px, and the photo's mean luma 0...1). Neither value triggers a hint:
 * "dark" needs brightness < 0.2, "blurry" (hidden) sharpness < 25, "small" a
 * long side < 600 px (1224 here).
 */
export const SAMPLE_CUTOUT = {
  width: 484,
  height: 1224,
  bytes: 510628,
  quality: { sharpness: 274.9, brightness: 0.604 },
} as const;

/** Same shape as the native cut-out call's result (`Cutout` in product.ts). */
export type SampleCutoutValue = {
  uri: string;
  width: number;
  height: number;
  quality?: { sharpness: number; brightness: number };
};

/**
 * Where the cut-out came from in this app session: "cached" (a file from an
 * earlier launch), "bundled" (the asset was copied), "native" (the last
 * resort: the copy failed and the phone made it).
 */
export type SampleCutoutSource = "cached" | "native" | "bundled";

export type SampleCutoutResult = {
  cutout: SampleCutoutValue;
  source: SampleCutoutSource;
};

export type SampleCutoutSteps = {
  /** The cut-out already on disk, or null; one that cannot be read is null. */
  cached: () => SampleCutoutValue | null | Promise<SampleCutoutValue | null>;
  /** The bundled cut-out copied into place; rejects when it cannot be. */
  bundled: () => Promise<SampleCutoutValue>;
  /** The phone's own cut-out; rejects when it fails. Must verify its file. */
  native: () => Promise<SampleCutoutValue>;
  /** The bundled cut-out failed (the phone's own is tried next). */
  onBundledFailed?: (error: unknown) => void;
  /** The native cut-out failed too (its error is thrown). */
  onNativeFailed?: (error: unknown) => void;
};

/** How far a cut-out's width and height may be from the bundled one's. */
const SIZE_TOLERANCE = 0.05;

/**
 * True when a cut-out has the size of the bundled sample's (within 5 %). A
 * cut-out of the sample photo that is much smaller or of another shape is a
 * wrong region (the colour fallback can return one), never the bottle.
 */
export function sampleCutoutPlausible(size: {
  width: number;
  height: number;
}): boolean {
  const near = (value: number, expected: number) =>
    Math.abs(value - expected) <= expected * SIZE_TOLERANCE;
  return (
    near(size.width, SAMPLE_CUTOUT.width) &&
    near(size.height, SAMPLE_CUTOUT.height)
  );
}

/**
 * Sizes the sample's cut-out has had: the previous photo's (355 x 868) and
 * the current one's. A draft of an untouched sample carries one of them.
 */
export function isKnownSampleCutoutSize(
  width: number,
  height: number,
): boolean {
  const same = (w: number, h: number) =>
    Math.round(width) === w && Math.round(height) === h;
  return same(355, 868) || same(SAMPLE_CUTOUT.width, SAMPLE_CUTOUT.height);
}

/** True when a copy of the bundled file has all of the source's bytes. */
export function copyIsComplete(
  copiedBytes: number,
  sourceBytes: number,
): boolean {
  return copiedBytes > 0 && copiedBytes === sourceBytes;
}

/**
 * The fallback order: the cached cut-out (if it has the sample's size), else
 * the bundled one copied into place, else (that failed) the phone's own
 * cut-out, accepted only when it has the sample's size. When both fail, the
 * native error is thrown, because that is the one the user's language and
 * the native error table know.
 */
export async function resolveSampleCutout(
  steps: SampleCutoutSteps,
): Promise<SampleCutoutResult> {
  let cached: SampleCutoutValue | null = null;
  try {
    cached = await steps.cached();
  } catch {
    // An unreadable cache is no cache.
  }
  if (cached && sampleCutoutPlausible(cached))
    return { cutout: cached, source: "cached" };
  try {
    return { cutout: await steps.bundled(), source: "bundled" };
  } catch (bundledError) {
    steps.onBundledFailed?.(bundledError);
    try {
      const cutout = await steps.native();
      if (!sampleCutoutPlausible(cutout))
        throw new Error(
          `native sample cut-out has the wrong size ${cutout.width}x${cutout.height}`,
        );
      return { cutout, source: "native" };
    } catch (nativeError) {
      steps.onNativeFailed?.(nativeError);
      throw nativeError;
    }
  }
}

/**
 * What is kept next to the cached cut-out file (`sample-cutout.json`): the
 * numbers the next launch needs to return the same shape without measuring.
 */
export function serializeSampleMeta(cutout: SampleCutoutValue): string {
  return JSON.stringify({
    width: cutout.width,
    height: cutout.height,
    ...(cutout.quality ? { quality: cutout.quality } : {}),
  });
}

/** The kept numbers, or null when the text is not a usable record. */
export function parseSampleMeta(
  text: string,
): Omit<SampleCutoutValue, "uri"> | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const { width, height, quality } = value as Record<string, unknown>;
  const size = (n: unknown): n is number =>
    typeof n === "number" && Number.isFinite(n) && n >= 1;
  if (!size(width) || !size(height)) return null;
  const q = quality as Record<string, unknown> | null | undefined;
  const hasQuality =
    !!q &&
    typeof q === "object" &&
    typeof q.sharpness === "number" &&
    Number.isFinite(q.sharpness) &&
    typeof q.brightness === "number" &&
    Number.isFinite(q.brightness);
  return hasQuality
    ? {
        width,
        height,
        quality: {
          sharpness: q.sharpness as number,
          brightness: q.brightness as number,
        },
      }
    : { width, height };
}

/** The bundled cut-out as the result the native call would have returned. */
export function bundledSampleCutout(uri: string): SampleCutoutValue {
  return {
    uri,
    width: SAMPLE_CUTOUT.width,
    height: SAMPLE_CUTOUT.height,
    quality: { ...SAMPLE_CUTOUT.quality },
  };
}
