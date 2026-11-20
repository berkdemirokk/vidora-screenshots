/**
 * Pure rules for the Vidora Pro cloud feature AI Sahne: styles, product
 * placement, response parsing and error copy. No React Native imports, so
 * `node --test` can load it (see cloud.test.mjs). Network and native code
 * live in cloud.ts; the server is cloud/worker (Cloudflare Workers AI, free
 * tier only).
 *
 * How fidelity is guaranteed: the cloud paints an EMPTY scene; the phone
 * lays the original cut-out on top at `productPlacement()`. The product
 * photo never leaves the phone and its pixels are never generated.
 */
import type { CategoryId } from "./product-catalog";

export type SceneStyleId =
  | "studio-marble"
  | "beach-sunset"
  | "minimal-concrete"
  | "botanical"
  | "luxury-showcase"
  | "kitchen-counter"
  | "pastel-podium"
  | "dark-premium"
  | "silk-fabric"
  | "living-room";

/** Ids must match cloud/worker/src/styles.ts (SCENE_PROMPTS). */
export const SCENE_STYLES: readonly {
  id: SceneStyleId;
  tr: string;
  en: string;
  /** Categories this style suits best; listed first for them. */
  fits: readonly CategoryId[];
}[] = [
  {
    id: "studio-marble",
    tr: "Stüdyo mermer",
    en: "Studio marble",
    fits: ["cosmetics", "jewellery", "electronics", "home"],
  },
  {
    id: "beach-sunset",
    tr: "Sahil gün batımı",
    en: "Beach sunset",
    fits: ["cosmetics", "fashion", "food"],
  },
  {
    id: "minimal-concrete",
    tr: "Minimal beton",
    en: "Minimal concrete",
    fits: ["electronics", "fashion", "home"],
  },
  {
    id: "botanical",
    tr: "Botanik",
    en: "Botanical",
    fits: ["cosmetics", "food", "home"],
  },
  {
    id: "luxury-showcase",
    tr: "Lüks vitrin",
    en: "Luxury showcase",
    fits: ["jewellery", "cosmetics", "fashion"],
  },
  {
    id: "kitchen-counter",
    tr: "Mutfak tezgâhı",
    en: "Kitchen counter",
    fits: ["food", "home"],
  },
  {
    id: "pastel-podium",
    tr: "Pastel podyum",
    en: "Pastel podium",
    fits: ["cosmetics", "fashion", "jewellery"],
  },
  {
    id: "dark-premium",
    tr: "Koyu premium",
    en: "Dark premium",
    fits: ["electronics", "jewellery", "fashion"],
  },
  {
    id: "silk-fabric",
    tr: "İpek kumaş",
    en: "Silk fabric",
    fits: ["jewellery", "cosmetics", "fashion"],
  },
  {
    id: "living-room",
    tr: "Oturma odası",
    en: "Living room",
    fits: ["home", "electronics"],
  },
];

/** Up to 8 styles, the ones that suit the category first. */
export function stylesFor(
  category: CategoryId | null | undefined,
  max = 8,
): (typeof SCENE_STYLES)[number][] {
  if (!category) return SCENE_STYLES.slice(0, max);
  const fit = SCENE_STYLES.filter((s) => s.fits.includes(category));
  const rest = SCENE_STYLES.filter((s) => !s.fits.includes(category));
  return [...fit, ...rest].slice(0, max);
}

export const VARIANT_CHOICES = [2, 4] as const;

/**
 * AI Hareket (cloud image-to-video) is OFF: no free video model exists and
 * the owner decided not to spend money. Motion stays on-device (templates).
 * TODO(paid-motion): flip only together with the worker's MOTION_ENABLED,
 * a paid provider and an updated privacy policy.
 */
export const CLOUD_MOTION_ENABLED = false;

/** `EXPO_PUBLIC_CLOUD_URL` → base URL, or null when unset or not https. */
export function normalizeBaseUrl(value: string | undefined | null) {
  const text = (value ?? "").trim().replace(/\/+$/, "");
  if (!/^https:\/\/[^\s/]+(\/[^\s]*)?$/.test(text)) return null;
  return text;
}

// ------------------------------------------------------------- placement --

/** Normalized rectangle (0..1) inside a 9:16 frame. */
export type ProductRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * The model returns a square image; the app uses its centre 9:16 column.
 * In fractions of the square: x from 0.21875, width 0.5625, full height.
 */
export const SCENE_CROP = { x: (1 - 9 / 16) / 2, width: 9 / 16 } as const;

/**
 * Where the cut-out (already cropped to the product) goes in the 9:16
 * frame: at most 64% of the width and 50% of the height, centred, standing
 * with its base at 78% of the height, on the scene's empty surface.
 */
export function productPlacement(width: number, height: number): ProductRect {
  const frameW = 900,
    frameH = 1600;
  const w = width > 0 ? width : 1,
    h = height > 0 ? height : 1;
  const scale = Math.min((frameW * 0.64) / w, (frameH * 0.5) / h);
  const pw = w * scale,
    ph = h * scale;
  return {
    x: (frameW - pw) / 2 / frameW,
    y: (frameH * 0.78 - ph) / frameH,
    width: pw / frameW,
    height: ph / frameH,
  };
}

// ------------------------------------------------------------- responses --

export type CloudQuota = {
  plan: "pro" | "trial";
  /** Scene images today (resets 00:00 UTC). */
  images: { used: number; limit: number };
  resetsAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
function count(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}
function pair(value: unknown) {
  if (!isRecord(value)) return null;
  const used = count(value.used),
    limit = count(value.limit);
  return used === null || limit === null ? null : { used, limit };
}

export function parseQuota(value: unknown): CloudQuota | null {
  if (!isRecord(value)) return null;
  const images = pair(value.images);
  if (!images) return null;
  return {
    plan: value.plan === "trial" ? "trial" : "pro",
    images,
    resetsAt: typeof value.resetsAt === "string" ? value.resetsAt : "",
  };
}

export function remaining(quota: CloudQuota): number {
  return Math.max(0, quota.images.limit - quota.images.used);
}

/** A generated scene as sent by the worker: base64 JPEG. */
export type SceneData = { data: string; mime: "image/jpeg" | "image/png" };

export function parseSceneResponse(
  value: unknown,
): { images: SceneData[]; quota: CloudQuota | null } | null {
  if (!isRecord(value) || !Array.isArray(value.images)) return null;
  const images: SceneData[] = [];
  for (const item of value.images) {
    if (!isRecord(item) || typeof item.data !== "string") continue;
    if (item.data.length < 100 || !/^[A-Za-z0-9+/=\s]+$/.test(item.data))
      continue;
    images.push({
      data: item.data,
      mime: item.mime === "image/png" ? "image/png" : "image/jpeg",
    });
  }
  if (images.length === 0) return null;
  return { images, quota: parseQuota(value.quota) };
}

// ---------------------------------------------------------------- errors --

/** Error codes from the worker plus the app's own. */
export type CloudErrorCode =
  | "not-configured"
  | "not-pro"
  | "consent-required"
  | "offline"
  | "quota-exceeded"
  | "daily-free-quota"
  | "rate-limited"
  | "subscription"
  | "upstream-failed"
  | "failed";

export class CloudError extends Error {
  readonly code: CloudErrorCode;
  readonly quota: CloudQuota | null;
  constructor(code: CloudErrorCode, quota: CloudQuota | null = null) {
    super("cloud-" + code);
    this.code = code;
    this.quota = quota;
  }
}

/** Maps a worker error response to an app error code. */
export function errorFromResponse(status: number, body: unknown): CloudError {
  const error = isRecord(body) && isRecord(body.error) ? body.error : null;
  const code = typeof error?.code === "string" ? error.code : "";
  const quota = isRecord(body) ? parseQuota(body.quota) : null;
  switch (code) {
    case "quota-exceeded":
      return new CloudError("quota-exceeded", quota);
    case "daily_free_quota":
      return new CloudError("daily-free-quota", quota);
    case "rate-limited":
      return new CloudError("rate-limited");
    case "upstream-failed":
      return new CloudError("upstream-failed");
    case "server-misconfigured":
    case "feature-disabled":
      return new CloudError("not-configured");
    case "unauthorized":
    case "subscription-expired":
    case "subscription-revoked":
    case "wrong-product":
    case "wrong-app":
    case "sandbox-not-allowed":
      return new CloudError("not-pro");
    case "invalid-transaction":
      return new CloudError("subscription");
  }
  if (status === 429) return new CloudError("rate-limited");
  if (status === 401 || status === 403) return new CloudError("not-pro");
  return new CloudError("failed");
}

/** Turkish and English copy that says what to do next. */
export function cloudErrorText(code: CloudErrorCode): {
  tr: string;
  en: string;
} {
  switch (code) {
    case "not-configured":
      return {
        tr: "Yapay zekâ stüdyosu bu sürümde henüz açık değil.",
        en: "The AI studio is not available in this version yet.",
      };
    case "not-pro":
      return {
        tr: "AI Sahne Vidora Pro ile açılır.",
        en: "AI Scene comes with Vidora Pro.",
      };
    case "consent-required":
      return {
        tr: "Devam etmek için AI Sahne'nin buluta istek göndermesine izin vermelisin.",
        en: "To continue, allow AI Scene to send a request to the cloud.",
      };
    case "offline":
      return {
        tr: "İnternete bağlanılamadı. Bağlantını kontrol edip tekrar dene.",
        en: "Could not connect. Check your connection and try again.",
      };
    case "quota-exceeded":
      return {
        tr: "Bugünkü sahne hakkın doldu. Hakların gece yarısı (UTC) yenilenir.",
        en: "You have used today's scenes. They renew at midnight (UTC).",
      };
    case "daily-free-quota":
      return {
        tr: "Bugünkü yapay zekâ kotası doldu, yarın tekrar dene.",
        en: "Today's AI quota is used up, try again tomorrow.",
      };
    case "rate-limited":
      return {
        tr: "Çok hızlı istek gönderildi. Bir dakika bekleyip tekrar dene.",
        en: "Too many requests. Wait a minute and try again.",
      };
    case "subscription":
      return {
        tr: "Aboneliğin doğrulanamadı. Ayarlar'dan “Satın alımları geri yükle”yi dene.",
        en: "Your subscription could not be verified. Try “Restore purchases” in Settings.",
      };
    case "upstream-failed":
      return {
        tr: "Yapay zekâ yanıt vermedi. Hakkın düşülmedi; tekrar dene.",
        en: "The AI did not respond. Nothing was used; try again.",
      };
    case "failed":
      return {
        tr: "İşlem tamamlanamadı. Tekrar dene.",
        en: "That did not work. Please try again.",
      };
  }
}

// --------------------------------------------------------------- consent --

/** Bump when the provider or what is sent changes: asks again. */
export const CONSENT_VERSION = 1;
export const AI_PROVIDER = "Cloudflare Workers AI (Cloudflare, Inc., ABD/USA)";

export function hasValidConsent(stored: string | null): boolean {
  if (!stored) return false;
  try {
    const value = JSON.parse(stored) as { version?: unknown };
    return value.version === CONSENT_VERSION;
  } catch {
    return false;
  }
}

export function consentRecord(now: number): string {
  return JSON.stringify({ version: CONSENT_VERSION, at: now });
}
