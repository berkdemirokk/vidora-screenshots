/**
 * Marketplace listing text (title, description, bullets, keywords), written
 * on the device by Apple's Foundation Models and translated by Apple's
 * Translation framework. Nothing leaves the phone. Devices without Apple
 * Intelligence (or builds without the native functions) get no languages,
 * and the result screen then hides the "İlan metni" button.
 */
import { categoryById, type CategoryId } from "./product-catalog";
import {
  nativeListingText,
  nativeTextAvailability,
  nativeTranslateTexts,
} from "./product";
import { LocalizedError } from "./media";

export type ListingText = {
  title: string;
  description: string;
  bullets: string[];
  keywords: string[];
};

/** Languages the on-device model writes listings in (iOS 26.1+ for tr/de). */
export const WRITE_LANGS = ["tr", "en", "de"] as const;
export type WriteLang = (typeof WRITE_LANGS)[number];
/** Languages a listing can be translated into. */
export const TRANSLATE_LANGS = ["en", "de", "fr", "es", "ar", "ru"] as const;
export type TranslateLang = (typeof TRANSLATE_LANGS)[number];

export type ListingAvailability = { write: WriteLang[]; translate: string[] };

export const MAX_TITLE = 100;
export const MAX_BULLETS = 5;
export const MAX_KEYWORDS = 15;
const MAX_DESCRIPTION = 2000;
const MAX_BULLET = 200;
const MAX_KEYWORD = 40;

/** One line: inner whitespace collapsed, ends trimmed, at most `max` chars. */
function clean(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  // Cut at the last space before the limit when there is one nearby.
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return (space > max * 0.6 ? cut.slice(0, space) : cut).trim();
}

/** Paragraphs kept, spaces inside lines collapsed, at most `max` chars. */
function cleanBlock(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const text = value
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.length <= max ? text : text.slice(0, max).trim();
}

/** A list from an array or a separated string; cleaned, unique, capped. */
function cleanList(
  value: unknown,
  separator: RegExp,
  strip: RegExp,
  maxItem: number,
  maxCount: number,
): string[] {
  const items: unknown[] = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(separator)
      : [];
  const out: string[] = [];
  for (const item of items) {
    const text = clean(
      typeof item === "string" ? item.replace(strip, "") : "",
      maxItem,
    );
    if (!text) continue;
    if (out.some((v) => v.toLocaleLowerCase() === text.toLocaleLowerCase()))
      continue;
    out.push(text);
    if (out.length >= maxCount) break;
  }
  return out;
}

/** The first balanced {...} in `raw`, ignoring braces inside strings. */
function firstObject(raw: string): string | null {
  const start = raw.indexOf("{");
  if (start < 0) return null;
  let depth = 0,
    inString = false,
    escaped = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}

function parseObject(text: string): Record<string, unknown> | null {
  for (const candidate of [text, text.replace(/,\s*([}\]])/g, "$1")]) {
    try {
      const value: unknown = JSON.parse(candidate);
      if (value && typeof value === "object" && !Array.isArray(value))
        return value as Record<string, unknown>;
      return null;
    } catch {
      // Try the next, more forgiving candidate.
    }
  }
  return null;
}

/** Fits a listing's fields to the limits; null when the title is empty. */
function tidyListing(source: Record<string, unknown>): ListingText | null {
  const title = clean(source.title, MAX_TITLE);
  if (!title) return null;
  return {
    title,
    description: cleanBlock(source.description, MAX_DESCRIPTION),
    bullets: cleanList(
      source.bullets,
      /\r?\n/,
      /^\s*[-*•·]+\s*/,
      MAX_BULLET,
      MAX_BULLETS,
    ),
    keywords: cleanList(
      source.keywords,
      /[,\n;]/,
      /^\s*#+/,
      MAX_KEYWORD,
      MAX_KEYWORDS,
    ),
  };
}

/**
 * The model's answer as a listing: the first JSON object in the text (prose
 * or a code fence around it is fine), trimmed, title at most 100 chars, at
 * most 5 bullets and 15 keywords. Null when nothing usable is found.
 */
export function parseListing(raw: string): ListingText | null {
  if (typeof raw !== "string") return null;
  const text = firstObject(raw);
  if (!text) return null;
  const value = parseObject(text);
  return value ? tidyListing(value) : null;
}

/**
 * The native availability answer, checked: known languages only, in a fixed
 * order, translate targets that are not write languages. No write language
 * means nothing to translate, so nothing at all is offered.
 */
export function normalizeAvailability(raw: unknown): ListingAvailability {
  const none: ListingAvailability = { write: [], translate: [] };
  if (!raw || typeof raw !== "object") return none;
  const { write, translate } = raw as { write?: unknown; translate?: unknown };
  if (!Array.isArray(write)) return none;
  const writeLangs = WRITE_LANGS.filter((l) => write.includes(l));
  if (writeLangs.length === 0) return none;
  const targets = Array.isArray(translate) ? translate : [];
  return {
    write: writeLangs,
    translate: TRANSLATE_LANGS.filter(
      (l) =>
        targets.includes(l) && !(writeLangs as readonly string[]).includes(l),
    ),
  };
}

/** True when the "İlan metni" button should show. */
export function hasListing(av: ListingAvailability): boolean {
  return av.write.length > 0;
}

/** The sheet's language chips: write languages first, then translations. */
export function listingLanguages(
  av: ListingAvailability,
): { lang: string; kind: "write" | "translate" }[] {
  if (!hasListing(av)) return [];
  return [
    ...av.write.map((lang) => ({ lang, kind: "write" as const })),
    ...av.translate.map((lang) => ({ lang, kind: "translate" as const })),
  ];
}

/** What this device offers; empty lists on older builds or devices. */
export async function listingAvailability(): Promise<ListingAvailability> {
  return normalizeAvailability(await nativeTextAvailability());
}

/**
 * A listing written on the device in `lang`. Null when the model or the
 * language is unavailable; throws a clear message when generation failed.
 */
export async function writeListing(input: {
  name: string;
  category: CategoryId;
  price: string;
  lang: WriteLang;
}): Promise<ListingText | null> {
  const c = categoryById(input.category);
  const raw = await nativeListingText(
    input.name.trim().slice(0, 80),
    input.lang === "tr" ? c.tr : c.en,
    input.price.trim().slice(0, 30),
    input.lang,
  );
  if (raw === null) return null;
  const listing = parseListing(raw);
  if (!listing)
    throw new LocalizedError(
      "İlan metni yazılamadı. Tekrar dene.",
      "Couldn't write the listing text. Try again.",
    );
  return listing;
}

/** Every text of a listing in one list (title, description, bullets, keywords). */
export function flattenListing(text: ListingText): string[] {
  return [text.title, text.description, ...text.bullets, ...text.keywords];
}

/** `flattenListing`'s inverse for translated texts; null on a count mismatch. */
export function rebuildListing(
  shape: ListingText,
  texts: readonly string[],
): ListingText | null {
  const nb = shape.bullets.length;
  if (texts.length !== 2 + nb + shape.keywords.length) return null;
  return tidyListing({
    title: texts[0],
    description: texts[1],
    bullets: texts.slice(2, 2 + nb),
    keywords: texts.slice(2 + nb),
  });
}

/**
 * The listing translated on the device from `from` into `to`. Null on
 * builds without translation; throws a clear message when it fails.
 */
export async function translateListing(
  text: ListingText,
  to: TranslateLang,
  from: WriteLang = "en",
): Promise<ListingText | null> {
  if (from === to) return text;
  const out = await nativeTranslateTexts(flattenListing(text), from, to);
  if (out === null) return null;
  const listing = rebuildListing(text, out);
  if (!listing)
    throw new LocalizedError(
      "Çeviri bu cihazda şu an kullanılamıyor.",
      "Translation isn't available on this device right now.",
    );
  return listing;
}
