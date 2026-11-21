/**
 * Vidora Pro cloud feature AI Sahne: the product photo is placed in an
 * AI-generated, photorealistic scene. Talks to cloud/worker (Cloudflare
 * Workers AI, free tier only), which verifies the App Store subscription.
 * Sent: the product on a plain background (JPEG, at most 2048 px and 1.4 MB,
 * rendered on the phone from the cut-out), the style id, the shape and the
 * signed subscription transaction. Route: POST /v1/scene, multipart.
 *
 * Hidden unless EXPO_PUBLIC_CLOUD_URL is set at build time (see
 * docs/cloud-setup.md), so builds without a deployed worker stay safe.
 */
import { requireOptionalNativeModule } from "expo";
import { File, Paths } from "expo-file-system";
import { randomUUID } from "expo-crypto";
import * as MediaLibrary from "expo-media-library";
import { addFileToPhotos } from "./media";
import * as Sharing from "expo-sharing";
import { hasAiConsent } from "./ai-consent";
import {
  collectScenes,
  postForJpeg,
  requestShots,
  type SceneAnswer,
} from "./cloud-net";
import type { CategoryId } from "./product-catalog";
import { saveStill } from "./product";
import { buildMainImageSpec } from "./product-templates";
import {
  CloudError,
  PHOTO_MAX_BYTES,
  buildMultipart,
  errorFromResponse,
  multipartContentType,
  normalizeBaseUrl,
  parseQuota,
  type CloudQuota,
  type ProductRect,
  type SceneRatio,
  type SceneStyleId,
} from "./cloud-rules";

export * from "./cloud-rules";

const BASE_URL = normalizeBaseUrl(process.env.EXPO_PUBLIC_CLOUD_URL);

type ProofStore = {
  subscriptionProof?: () => Promise<{ jws?: unknown } | null>;
};
/** Same native module as pro.ts; only the method added for the cloud. */
const store = requireOptionalNativeModule<ProofStore>("KareviaStore");

/**
 * True when this build can use the cloud: a worker URL was configured and
 * the native store can sign requests. Hide every AI Sahne entry point when
 * false.
 */
export function cloudAvailable(): boolean {
  return !!BASE_URL && typeof store?.subscriptionProof === "function";
}

/** The App Store-signed transaction of the active subscription. */
async function proof(): Promise<string> {
  if (!BASE_URL || typeof store?.subscriptionProof !== "function")
    throw new CloudError("not-configured");
  const result = await store.subscriptionProof();
  const jws = result?.jws;
  if (typeof jws !== "string" || jws.split(".").length !== 3)
    throw new CloudError("not-pro");
  return jws;
}

async function request(path: string, init: RequestInit = {}): Promise<unknown> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init.headers as Record<string, string> | undefined),
    Authorization: "Bearer " + (await proof()),
  };
  let response: Response;
  try {
    response = await fetch(BASE_URL + path, { ...init, headers });
  } catch {
    throw new CloudError("offline");
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw errorFromResponse(response.status, body);
  return body;
}

/** Today's allowance. */
export async function getQuota(): Promise<CloudQuota> {
  const quota = parseQuota(await request("/v1/quota"));
  if (!quota) throw new CloudError("failed");
  lastQuota = quota;
  return quota;
}

/** A generated scene saved in the cache (a JPEG of the product in the scene). */
export type Scene = { uri: string; style: SceneStyleId; ratio: SceneRatio };

/** The cut-out the studio was opened with. */
export type SceneProduct = { uri: string; width: number; height: number };

/** Width the upload is rendered at: 1080 px, so at most 1920 px on a side. */
const UPLOAD_WIDTH = 1080;

/**
 * The upload: the cut-out centred on pure white in the shape of `ratio`, as
 * a JPEG of at most PHOTO_MAX_BYTES (the engine lowers the quality to fit).
 * Returns the bytes; the temporary file is removed.
 */
async function preparePhoto(
  product: SceneProduct,
  ratio: SceneRatio,
): Promise<Uint8Array> {
  const spec = buildMainImageSpec({
    product: product.uri,
    productSize: { width: product.width, height: product.height },
    ratio,
    fill: 0.7,
    width: UPLOAD_WIDTH,
  });
  const still = await saveStill(spec, {
    time: 0,
    format: "jpg",
    width: UPLOAD_WIDTH,
    maxBytes: PHOTO_MAX_BYTES,
  });
  const file = new File(still.uri);
  try {
    const bytes = await file.bytes();
    if (bytes.length > PHOTO_MAX_BYTES) throw new CloudError("photo-too-large");
    return bytes;
  } finally {
    try {
      if (file.exists) file.delete();
    } catch {
      // Only a leftover file in the cache.
    }
  }
}

/**
 * Today's allowance as of the last cloud answer that carried it (quota
 * headers, an error body or GET /v1/quota); null until one came. Not
 * persisted: a cold start knows nothing.
 */
let lastQuota: CloudQuota | null = null;
export function knownQuota(): CloudQuota | null {
  return lastQuota;
}

/** One POST /v1/scene: the JPEG bytes and the quota headers. */
async function postScene(body: Uint8Array, boundary: string): Promise<SceneAnswer> {
  if (!BASE_URL) throw new CloudError("not-configured");
  const authorization = "Bearer " + (await proof());
  const answer = await postForJpeg(
    fetch,
    BASE_URL + "/v1/scene",
    {
      method: "POST",
      headers: {
        Accept: "image/jpeg",
        Authorization: authorization,
        "Content-Type": multipartContentType(boundary),
        // Explicit: a chunked upload is answered with 411.
        "Content-Length": String(body.length),
      },
      // buildMultipart returns a view over a buffer of exactly its length.
      body: body.buffer as ArrayBuffer,
    },
    120_000,
  ).catch((error: unknown) => {
    if (error instanceof CloudError && error.quota) lastQuota = error.quota;
    throw error;
  });
  if (answer.quota) lastQuota = answer.quota;
  return answer;
}

/**
 * AI Sahne: puts the product in `count` scenes of `style` (one request and
 * one image of today's allowance each) and saves them to the cache. If a
 * later request fails after one succeeded, the scenes made so far come back
 * with `error`. Requires AI consent (see ai-consent.ts): throws
 * "consent-required".
 */
export async function generateScenes(options: {
  product: SceneProduct;
  style: SceneStyleId;
  ratio: SceneRatio;
  count: number;
}): Promise<{ scenes: Scene[]; quota: CloudQuota | null; error?: CloudError }> {
  if (!cloudAvailable()) throw new CloudError("not-configured");
  if (!(await hasAiConsent())) throw new CloudError("consent-required");
  const photo = await preparePhoto(options.product, options.ratio);
  return collectScenes<Scene>(options.count, async () => {
    const boundary = "vidora" + randomUUID().replace(/-/g, "");
    const body = buildMultipart(
      { style: options.style, ratio: options.ratio },
      {
        name: "photo",
        filename: "product.jpg",
        contentType: "image/jpeg",
        data: photo,
      },
      boundary,
    );
    const result = await postScene(body, boundary);
    const file = new File(Paths.cache, "vidora-ai-scene-" + randomUUID() + ".jpg");
    file.create();
    await file.write(result.jpeg);
    return {
      item: { uri: file.uri, style: options.style, ratio: options.ratio },
      quota: result.quota,
    };
  });
}

/**
 * The editorial video's 3 AI shots of the product (context, hand, macro,
 * 9:16), one request and one image of today's allowance each, saved to the
 * cache. `category` (the editor's) picks the context setting. A failure
 * stops the run: shots made so far come back with `error`, the rest null.
 * Requires AI consent: throws "consent-required".
 */
export async function generateShots(options: {
  product: SceneProduct;
  category: CategoryId | null;
  onStep?: (index: number) => void;
  /** Shots to ask for (the first `count` of the 3); default all. */
  count?: number;
}): Promise<{ ai: (string | null)[]; error: CloudError | null }> {
  if (!cloudAvailable()) throw new CloudError("not-configured");
  if (!(await hasAiConsent())) throw new CloudError("consent-required");
  const photo = await preparePhoto(options.product, "9:16");
  return requestShots(
    options.category,
    async (fields) => {
      const boundary = "vidora" + randomUUID().replace(/-/g, "");
      const body = buildMultipart(
        fields,
        {
          name: "photo",
          filename: "product.jpg",
          contentType: "image/jpeg",
          data: photo,
        },
        boundary,
      );
      const result = await postScene(body, boundary);
      // Same prefix as AI Sahne: the editor's cache sweep and discard know it.
      const file = new File(Paths.cache, "vidora-ai-scene-" + randomUUID() + ".jpg");
      file.create();
      await file.write(result.jpeg);
      return file.uri;
    },
    options.onStep,
    options.count,
  );
}

/** Deletes cached scenes the user did not keep. */
export function discardScenes(scenes: readonly Scene[]): void {
  for (const scene of scenes) {
    try {
      const file = new File(scene.uri);
      if (file.exists) file.delete();
    } catch {
      // Already gone.
    }
  }
}

/** Saves the background image (without the product) to Photos. */
export async function saveSceneToPhotos(uri: string): Promise<boolean> {
  const permission = await MediaLibrary.requestPermissionsAsync(true);
  if (!permission.granted) return false;
  await addFileToPhotos(uri);
  return true;
}

export async function shareScene(uri: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) return;
  await Sharing.shareAsync(uri, {
    mimeType: uri.endsWith(".png") ? "image/png" : "image/jpeg",
  });
}

// ------------------------------------------------------------- hand-off --

/**
 * What the AI studio hands back to the editor: the generated scene image,
 * the part of it to use (the whole image for 9:16; the centre 9:16 column
 * of other shapes) and where the product stands in the 9:16 frame.
 */
export type ChosenScene = {
  backgroundUri: string;
  /** Fractions of the image: use x..x+width, full height. */
  crop: { x: number; width: number };
  productRect: ProductRect;
  style: SceneStyleId;
  /**
   * True for pictures from the photo route (POST /v1/scene): the product is
   * already in the image, so the editor shows it full frame and never draws
   * the cut-out over it.
   */
  containsProduct?: boolean;
};

let chosen: ChosenScene | null = null;
/** Called by app/ai-studio.tsx when the user taps "Bu sahneyi kullan". */
export function offerChosenScene(scene: ChosenScene | null): void {
  chosen = scene;
}
/** The editor takes the scene once (e.g. on focus); null when none. */
export function takeChosenScene(): ChosenScene | null {
  const value = chosen;
  chosen = null;
  return value;
}
