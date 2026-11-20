// Pure subscription rules: no Expo/React Native imports so it runs under `node --test`.
import type { CaptionStyle } from "./captions";

export type ProQuality = "720p" | "1080p";
export type ProCaptionStyle = CaptionStyle;

export const FREE_QUALITY: ProQuality = "720p";
export const FREE_CAPTION_STYLE: ProCaptionStyle = "classic";

/**
 * No free plan: anyone can preview, but rendering a product video or
 * exporting from the editing desk needs Vidora Pro.
 */
export const FREE_RENDERS = false;

/** What an export would use. `captionStyle` is null when no captions are burned in. */
export type ExportIntent = {
  quality: ProQuality;
  captionStyle: ProCaptionStyle | null;
};
export type ExportPlan = ExportIntent & { watermark: boolean };
export type ProOnlyOption = "quality" | "captionStyle";

export function isProQuality(quality: ProQuality): boolean {
  return quality !== FREE_QUALITY;
}
export function isProCaptionStyle(style: ProCaptionStyle): boolean {
  return style !== FREE_CAPTION_STYLE;
}

/** The Pro-only options an export intent relies on. */
export function proOnlyOptions(intent: ExportIntent): ProOnlyOption[] {
  const found: ProOnlyOption[] = [];
  if (isProQuality(intent.quality)) found.push("quality");
  if (intent.captionStyle !== null && isProCaptionStyle(intent.captionStyle))
    found.push("captionStyle");
  return found;
}

/** Free users with a Pro-only option active see the paywall instead of exporting. */
export function needsPaywall(isPro: boolean, intent: ExportIntent): boolean {
  return !isPro && proOnlyOptions(intent).length > 0;
}

/** The same intent reduced to what the free tier allows. */
export function freeIntent(intent: ExportIntent): ExportIntent {
  return {
    quality: FREE_QUALITY,
    captionStyle: intent.captionStyle === null ? null : FREE_CAPTION_STYLE,
  };
}

/** What is actually exported: Pro keeps everything, free is limited and watermarked. */
export function exportPlan(isPro: boolean, intent: ExportIntent): ExportPlan {
  return isPro
    ? { ...intent, watermark: false }
    : { ...freeIntent(intent), watermark: true };
}

export type Entitlement = {
  active: boolean;
  productId: string | null;
  expires: number | null;
};
export const NO_ENTITLEMENT: Entitlement = {
  active: false,
  productId: null,
  expires: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Validate a native payload; anything malformed counts as "not Pro". */
export function parseEntitlement(value: unknown): Entitlement {
  if (!isRecord(value) || value.active !== true) return NO_ENTITLEMENT;
  return {
    active: true,
    productId: typeof value.productId === "string" ? value.productId : null,
    expires:
      typeof value.expires === "number" && Number.isFinite(value.expires)
        ? value.expires
        : null,
  };
}

export type ProPeriod = "week" | "month" | "year" | "";
export type ProProduct = {
  id: string;
  displayName: string;
  displayPrice: string;
  /** Numeric store price in `currencyCode`; null when the build does not send it. */
  price: number | null;
  /** ISO 4217 code, e.g. "TRY"; null when unknown. */
  currencyCode: string | null;
  /** Locale the store formats prices in, e.g. "tr_TR"; null when unknown. */
  priceLocale: string | null;
  period: ProPeriod;
  hasTrial: boolean;
  trialDays: number;
};

/**
 * Keep only well-formed products with a known id and a store price string,
 * in the order of `ids`. Prices are never invented here.
 */
export function parseProducts(
  value: unknown,
  ids: readonly string[],
): ProProduct[] {
  if (!Array.isArray(value)) return [];
  const byId = new Map<string, ProProduct>();
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const { id, displayPrice, period, trialDays } = entry;
    if (typeof id !== "string" || !ids.includes(id) || byId.has(id)) continue;
    if (typeof displayPrice !== "string" || !displayPrice.trim()) continue;
    const days =
      typeof trialDays === "number" && Number.isFinite(trialDays)
        ? Math.max(0, Math.floor(trialDays))
        : 0;
    byId.set(id, {
      id,
      displayName:
        typeof entry.displayName === "string" ? entry.displayName : "",
      displayPrice,
      price:
        typeof entry.price === "number" &&
        Number.isFinite(entry.price) &&
        entry.price > 0
          ? entry.price
          : null,
      currencyCode:
        typeof entry.currencyCode === "string" &&
        /^[A-Z]{3}$/.test(entry.currencyCode)
          ? entry.currencyCode
          : null,
      priceLocale:
        typeof entry.priceLocale === "string" && entry.priceLocale.trim()
          ? entry.priceLocale
          : null,
      period:
        period === "week" || period === "month" || period === "year"
          ? period
          : "",
      hasTrial: entry.hasTrial === true,
      trialDays: days,
    });
  }
  return ids.flatMap((id) => {
    const product = byId.get(id);
    return product ? [product] : [];
  });
}

export type YearlySaving = {
  /** The yearly price spread over 12 months, rounded up to the cent. */
  perMonth: number;
  /** What 12 months of the monthly plan cost. */
  twelveMonths: number;
  /** Exactly how much less the yearly plan costs than 12 monthly payments. */
  saved: number;
  currencyCode: string;
  priceLocale: string | null;
};

/**
 * The yearly plan compared with 12 × the monthly plan, from the numeric store
 * prices only. Null when a price or the currency is missing, the currencies
 * differ, or the yearly plan saves nothing.
 */
export function yearlySaving(
  products: readonly ProProduct[],
): YearlySaving | null {
  const yearly = products.find((product) => product.period === "year");
  const monthly = products.find((product) => product.period === "month");
  if (!yearly || !monthly) return null;
  if (yearly.price === null || monthly.price === null) return null;
  if (!yearly.currencyCode || yearly.currencyCode !== monthly.currencyCode)
    return null;
  // Work in cents to avoid floating point drift.
  const yearCents = Math.round(yearly.price * 100),
    monthCents = Math.round(monthly.price * 100),
    twelveCents = monthCents * 12;
  if (monthCents <= 0 || yearCents <= 0 || yearCents >= twelveCents)
    return null;
  return {
    perMonth: Math.ceil(yearCents / 12) / 100,
    twelveMonths: twelveCents / 100,
    saved: (twelveCents - yearCents) / 100,
    currencyCode: yearly.currencyCode,
    priceLocale: yearly.priceLocale ?? monthly.priceLocale,
  };
}

const PERIOD_DAYS: Record<string, number> = {
  year: 365,
  month: 30.4375,
  week: 7,
};

/**
 * The plan with the strictly lowest cost per day, for the "EN AVANTAJLI"
 * tag. Null unless there are at least two plans, every price is numeric and
 * above zero, all share one currency, and one plan is strictly cheapest.
 */
export function bestValueId(products: readonly ProProduct[]): string | null {
  if (products.length < 2) return null;
  const currency = products[0].currencyCode;
  if (!currency) return null;
  let best: { id: string; perDay: number } | null = null;
  let tie = false;
  for (const product of products) {
    const days = PERIOD_DAYS[product.period];
    if (
      !days ||
      product.price === null ||
      !(product.price > 0) ||
      product.currencyCode !== currency
    )
      return null;
    const perDay = product.price / days;
    if (!best || perDay < best.perDay - 1e-9) {
      best = { id: product.id, perDay };
      tie = false;
    } else if (Math.abs(perDay - best.perDay) <= 1e-9) tie = true;
  }
  return best && !tie ? best.id : null;
}

/**
 * A store amount written like the store writes it (locale + currency).
 * Null when this JavaScript engine cannot format the currency.
 */
export function formatMoney(
  amount: number,
  currencyCode: string,
  priceLocale: string | null,
): string | null {
  const locale = (priceLocale ?? "").split("@")[0].replace(/_/g, "-");
  try {
    return new Intl.NumberFormat(locale || undefined, {
      style: "currency",
      currency: currencyCode,
    }).format(amount);
  } catch {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: currencyCode,
      }).format(amount);
    } catch {
      return null;
    }
  }
}

export type PurchaseStatus = "purchased" | "cancelled" | "pending";
/** An unknown status is treated as pending: never grant or fail on a guess. */
export function parsePurchaseStatus(value: unknown): PurchaseStatus {
  const status = isRecord(value) ? value.status : undefined;
  return status === "purchased" || status === "cancelled" ? status : "pending";
}

export type StoreProblem = "unverified" | "unavailable" | "other";
/** Classify a rejected native call by the marker in its message. */
export function storeProblem(error: unknown): StoreProblem {
  const text = error instanceof Error ? error.message : String(error);
  if (text.includes("store-unverified:")) return "unverified";
  if (text.includes("store-unavailable:")) return "unavailable";
  return "other";
}

/** Free exports allowed per local calendar day. */
export const FREE_DAILY_EXPORTS = 3;
export type ExportQuota = { day: string; count: number };

/** Local calendar day as YYYY-MM-DD (the limit resets at local midnight). */
export function localDay(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Strict check of a stored quota; anything unexpected counts as unused. */
export function parseQuota(value: unknown): ExportQuota | null {
  if (!isRecord(value)) return null;
  const { day, count } = value;
  if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 0)
    return null;
  return { day, count };
}

export function freeExportsLeft(
  quota: ExportQuota | null,
  day: string,
): number {
  const used = quota && quota.day === day ? quota.count : 0;
  return Math.max(0, FREE_DAILY_EXPORTS - used);
}

export function recordFreeExport(
  quota: ExportQuota | null,
  day: string,
): ExportQuota {
  const used = quota && quota.day === day ? quota.count : 0;
  return { day, count: used + 1 };
}
