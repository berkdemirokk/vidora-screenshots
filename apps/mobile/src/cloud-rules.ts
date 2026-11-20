/**
 * Pure rules for the Vidora Pro cloud feature AI Sahne: styles, upload
 * body, quota headers and error copy. No React Native imports, so
 * `node --test` can load it (see cloud.test.mjs). Network and native code
 * live in cloud.ts; the server is cloud/worker (Cloudflare Workers AI, free
 * tier only).
 *
 * The phone sends the product on a plain background (rendered from the
 * cut-out); the worker answers with a JPEG of that product in the chosen
 * scene (POST /v1/scene, multipart).
 */
import type { CategoryId } from "./product-catalog";

export type SceneStyleId =
  | "spa-slate"
  | "lavender-field"
  | "marble-bath"
  | "kitchen-oak"
  | "studio-softbox"
  | "golden-beach"
  | "botanical-moss"
  | "luxury-velvet"
  | "model-studio"
  | "model-street";

/** Ids must match cloud/worker/src/styles.ts (PRODUCT_STYLES). */
export const SCENE_STYLES: readonly {
  id: SceneStyleId;
  tr: string;
  en: string;
}[] = [
  { id: "spa-slate", tr: "Spa taşı", en: "Spa slate" },
  { id: "lavender-field", tr: "Lavanta tarlası", en: "Lavender field" },
  { id: "marble-bath", tr: "Mermer banyo", en: "Marble bathroom" },
  { id: "kitchen-oak", tr: "Meşe mutfak", en: "Oak kitchen" },
  { id: "studio-softbox", tr: "Stüdyo ışığı", en: "Studio light" },
  { id: "golden-beach", tr: "Altın sahil", en: "Golden beach" },
  { id: "botanical-moss", tr: "Botanik yosun", en: "Botanical moss" },
  { id: "luxury-velvet", tr: "Lüks kadife", en: "Luxury velvet" },
  { id: "model-studio", tr: "Manken · stüdyo", en: "Model · studio" },
  { id: "model-street", tr: "Manken · sokak", en: "Model · street" },
];

/** Best styles first, per product category; the rest follow in list order. */
export const STYLE_ORDER: Readonly<Record<CategoryId, readonly SceneStyleId[]>> =
  {
    cosmetics: ["spa-slate", "marble-bath", "lavender-field", "luxury-velvet"],
    jewellery: ["luxury-velvet", "marble-bath", "studio-softbox", "golden-beach"],
    fashion: [
      "model-studio",
      "model-street",
      "golden-beach", "studio-softbox", "lavender-field", "luxury-velvet"],
    home: ["kitchen-oak", "marble-bath", "botanical-moss", "studio-softbox"],
    food: ["kitchen-oak", "botanical-moss", "golden-beach", "studio-softbox"],
    electronics: ["studio-softbox", "luxury-velvet", "kitchen-oak", "spa-slate"],
  };

/** Styles with a person wearing the product: clothing categories only. */
export const MODEL_STYLE_IDS: readonly SceneStyleId[] = [
  "model-studio",
  "model-street",
];
export const MODEL_CATEGORIES: readonly CategoryId[] = ["fashion"];

export function isModelStyle(id: SceneStyleId): boolean {
  return MODEL_STYLE_IDS.includes(id);
}

/** The styles on offer for a category, the recommended ones first. */
export function stylesFor(
  category: CategoryId | null | undefined,
  max = 10,
): (typeof SCENE_STYLES)[number][] {
  const clothing = !!category && MODEL_CATEGORIES.includes(category);
  const offered = SCENE_STYLES.filter((s) => clothing || !isModelStyle(s.id));
  if (!category) return offered.slice(0, max);
  const order = STYLE_ORDER[category] ?? [];
  const first = order
    .map((id) => offered.find((s) => s.id === id))
    .filter((s): s is (typeof SCENE_STYLES)[number] => !!s);
  const rest = offered.filter((s) => !order.includes(s.id));
  return [...first, ...rest].slice(0, max);
}

/** Shapes the worker paints (its `ratio` field). */
export type SceneRatio = "9:16" | "1:1" | "4:5";
export const SCENE_RATIOS: readonly {
  id: SceneRatio;
  tr: string;
  en: string;
}[] = [
  { id: "9:16", tr: "Hikâye 9:16", en: "Story 9:16" },
  { id: "4:5", tr: "Gönderi 4:5", en: "Post 4:5" },
  { id: "1:1", tr: "Kare 1:1", en: "Square 1:1" },
];

/** Scenes made per tap; every scene is one image of today's allowance. */
export const VARIANT_CHOICES = [1, 2] as const;

/** Longest side and size the phone sends (worker limit: 2048 px, 1.5 MB). */
export const PHOTO_MAX_SIDE = 2048;
export const PHOTO_MAX_BYTES = 1_400_000;

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
/** Whole image: scenes made in 9:16 need no crop. */
export const FULL_CROP = { x: 0, width: 1 } as const;

/** The part of a scene of shape `ratio` the 9:16 video shows (fractions of the image). */
export function cropFor(ratio: SceneRatio): { x: number; width: number } {
  if (ratio === "9:16") return FULL_CROP;
  const aspect = ratio === "4:5" ? 4 / 5 : 1;
  const width = 9 / 16 / aspect;
  return { x: (1 - width) / 2, width };
}

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

/** Reads X-Quota-* headers of a /v1/scene answer; null when absent. */
export function quotaFromHeaders(
  get: (name: string) => string | null,
): CloudQuota | null {
  const rawUsed = get("X-Quota-Used"),
    rawLimit = get("X-Quota-Limit");
  if (rawUsed === null || rawLimit === null) return null;
  const used = Number(rawUsed),
    limit = Number(rawLimit);
  if (
    !Number.isFinite(used) ||
    !Number.isFinite(limit) ||
    used < 0 ||
    limit < 0
  )
    return null;
  return {
    plan: "pro",
    images: { used, limit },
    resetsAt: get("X-Quota-Resets-At") ?? "",
  };
}

// ------------------------------------------------------------- multipart --

export type MultipartFile = {
  name: string;
  filename: string;
  contentType: string;
  data: Uint8Array;
};

const encoder = new TextEncoder();

/** `Content-Type` header value for a multipart body made with `boundary`. */
export function multipartContentType(boundary: string): string {
  return "multipart/form-data; boundary=" + boundary;
}

/**
 * The bytes of a multipart/form-data body: text fields first, then the file.
 * Built by hand so the caller knows the exact length: React Native may send
 * a FormData body chunked, and the worker answers 411 without Content-Length.
 */
export function buildMultipart(
  fields: Readonly<Record<string, string>>,
  file: MultipartFile,
  boundary: string,
): Uint8Array {
  if (!/^[A-Za-z0-9()+_,./:=?-]{8,70}$/.test(boundary))
    throw new Error("bad-boundary");
  const clean = (value: string) => value.replace(/["\r\n]/g, "");
  const parts: Uint8Array[] = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(
      encoder.encode(
        `--${boundary}\r\nContent-Disposition: form-data; name="${clean(name)}"\r\n\r\n${value}\r\n`,
      ),
    );
  }
  parts.push(
    encoder.encode(
      `--${boundary}\r\nContent-Disposition: form-data; name="${clean(file.name)}"; filename="${clean(file.filename)}"\r\nContent-Type: ${clean(file.contentType)}\r\n\r\n`,
    ),
    file.data,
    encoder.encode(`\r\n--${boundary}--\r\n`),
  );
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const body = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    body.set(part, offset);
    offset += part.length;
  }
  return body;
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
  | "photo-too-large"
  | "bad-photo"
  | "bad-style"
  | "length-required"
  | "failed";

export class CloudError extends Error {
  readonly code: CloudErrorCode;
  readonly quota: CloudQuota | null;
  /** When today's allowance renews (ISO), if the worker said. */
  readonly resetsAt: string | null;
  constructor(
    code: CloudErrorCode,
    quota: CloudQuota | null = null,
    resetsAt: string | null = null,
  ) {
    super("cloud-" + code);
    this.code = code;
    this.quota = quota;
    this.resetsAt = resetsAt || quota?.resetsAt || null;
  }
}

/**
 * Maps a worker error response to an app error code. `get` reads response
 * headers (X-Quota-Resets-At) when the caller has them.
 */
export function errorFromResponse(
  status: number,
  body: unknown,
  get?: (name: string) => string | null,
): CloudError {
  const error = isRecord(body) && isRecord(body.error) ? body.error : null;
  const code = typeof error?.code === "string" ? error.code : "";
  const quota = isRecord(body) ? parseQuota(body.quota) : null;
  const resets = get?.("X-Quota-Resets-At") ?? null;
  switch (code) {
    case "quota-exceeded":
      return new CloudError("quota-exceeded", quota, resets);
    case "daily_free_quota":
      return new CloudError("daily-free-quota", quota, resets);
    case "rate-limited":
      return new CloudError("rate-limited");
    case "upstream-failed":
      return new CloudError("upstream-failed");
    case "photo-too-large":
      return new CloudError("photo-too-large");
    case "bad-photo":
      return new CloudError("bad-photo");
    case "bad-style":
      return new CloudError("bad-style");
    case "length-required":
      return new CloudError("length-required");
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
  if (status === 411) return new CloudError("length-required");
  if (status === 413) return new CloudError("photo-too-large");
  if (status === 429) return new CloudError("rate-limited");
  if (status === 401 || status === 403) return new CloudError("not-pro");
  return new CloudError("failed");
}

/** Local time "HH:MM" of an ISO instant; null when it is not a date. */
export function localClock(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const two = (n: number) => String(n).padStart(2, "0");
  return two(date.getHours()) + ":" + two(date.getMinutes());
}

/**
 * Turkish and English copy that says what to do next. `resetsAt` (the
 * X-Quota-Resets-At instant) adds the local time the allowance renews.
 */
export function cloudErrorText(
  code: CloudErrorCode,
  resetsAt?: string | null,
): {
  tr: string;
  en: string;
} {
  const clock = localClock(resetsAt);
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
        tr: "Devam etmek için AI Sahne'nin ürün fotoğrafını buluta göndermesine izin vermelisin.",
        en: "To continue, allow AI Scene to send your product photo to the cloud.",
      };
    case "offline":
      return {
        tr: "İnternete bağlanılamadı. Bağlantını kontrol edip tekrar dene.",
        en: "Could not connect. Check your connection and try again.",
      };
    case "quota-exceeded":
      return clock
        ? {
            tr: `Bugünkü sahne hakkın doldu. Yarın tekrar dene: haklar ${clock} civarı yenilenir. Şablonlar çalışmaya devam eder.`,
            en: `You have used today's scenes. Try again tomorrow: they renew around ${clock}. Templates keep working.`,
          }
        : {
            tr: "Bugünkü sahne hakkın doldu. Yarın tekrar dene. Şablonlar çalışmaya devam eder.",
            en: "You have used today's scenes. Try again tomorrow. Templates keep working.",
          };
    case "daily-free-quota":
      return clock
        ? {
            tr: `Bugünkü yapay zekâ kotası doldu. Yarın tekrar dene: kota ${clock} civarı yenilenir. Şablonlar çalışmaya devam eder.`,
            en: `Today's AI quota is used up. Try again tomorrow: it renews around ${clock}. Templates keep working.`,
          }
        : {
            tr: "Bugünkü yapay zekâ kotası doldu. Yarın tekrar dene. Şablonlar çalışmaya devam eder.",
            en: "Today's AI quota is used up. Try again tomorrow. Templates keep working.",
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
        tr: "Yapay zekâ yanıt vermedi. Biraz sonra tekrar dene.",
        en: "The AI did not respond. Try again in a moment.",
      };
    case "photo-too-large":
      return {
        tr: "Fotoğraf yüklenemeyecek kadar büyük. Daha küçük bir fotoğrafla dene.",
        en: "The photo is too large to upload. Try a smaller photo.",
      };
    case "bad-photo":
      return {
        tr: "Fotoğraf okunamadı. Başka bir ürün fotoğrafıyla dene.",
        en: "The photo could not be read. Try another product photo.",
      };
    case "bad-style":
      return {
        tr: "Bu sahne stili artık yok. Başka bir stil seç.",
        en: "That scene style is gone. Pick another style.",
      };
    case "length-required":
      return {
        tr: "Fotoğraf gönderilemedi. Tekrar dene.",
        en: "The photo could not be sent. Please try again.",
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
export const CONSENT_VERSION = 2;
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
