/**
 * Vidora Pro cloud feature AI Sahne: an AI-generated, photorealistic empty
 * scene that the phone puts the original cut-out product into. Talks to
 * cloud/worker (Cloudflare Workers AI, free tier only), which verifies the
 * App Store subscription. Only the style id and the signed subscription
 * transaction are sent; the product photo never leaves the phone.
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
  CloudError,
  SCENE_CROP,
  errorFromResponse,
  normalizeBaseUrl,
  parseQuota,
  parseSceneResponse,
  type CloudQuota,
  type ProductRect,
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
  return quota;
}

/** A generated scene saved in the cache: a square background image. */
export type Scene = { uri: string; style: SceneStyleId };

/**
 * AI Sahne: generates `count` empty scenes for `style` and saves them to
 * the cache. Costs `count` of today's images. Requires AI consent (see
 * ai-consent.ts) — throws "consent-required" without it.
 */
export async function generateScenes(options: {
  style: SceneStyleId;
  count: number;
}): Promise<{ scenes: Scene[]; quota: CloudQuota | null }> {
  if (!cloudAvailable()) throw new CloudError("not-configured");
  if (!(await hasAiConsent())) throw new CloudError("consent-required");
  const parsed = parseSceneResponse(
    await request("/v1/scene", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ style: options.style, count: options.count }),
    }),
  );
  if (!parsed) throw new CloudError("failed");
  const scenes: Scene[] = [];
  for (const image of parsed.images) {
    const ext = image.mime === "image/png" ? ".png" : ".jpg";
    const file = new File(Paths.cache, "vidora-ai-scene-" + randomUUID() + ext);
    file.create();
    await file.write(image.data, { encoding: "base64" });
    scenes.push({ uri: file.uri, style: options.style });
  }
  return { scenes, quota: parsed.quota };
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
 * What the AI studio hands back to the editor: the square background, the
 * 9:16 crop of it to use, and where the original cut-out goes in that
 * 9:16 frame. The editor's on-device renderer composites and animates the
 * product over it, so the product pixels are never generated.
 */
export type ChosenScene = {
  backgroundUri: string;
  /** Fractions of the square background: use x..x+width, full height. */
  crop: typeof SCENE_CROP;
  productRect: ProductRect;
  style: SceneStyleId;
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
