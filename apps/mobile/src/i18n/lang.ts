/**
 * App languages (all left-to-right) and how one is picked.
 * Pure on purpose: no React Native imports, so node tests can load it.
 */

export const LANGS = ["tr", "en", "de", "es", "fr", "pt-BR", "it"] as const;
export type Lang = (typeof LANGS)[number];

/** What the user picked in Settings: a language, or "system" to follow the device. */
export type LangChoice = Lang | "system";

export function isLang(value: unknown): value is Lang {
  return typeof value === "string" && (LANGS as readonly string[]).includes(value);
}

export function isLangChoice(value: unknown): value is LangChoice {
  return value === "system" || isLang(value);
}

/** Each language in its own name (shown in the Settings picker). */
export const LANG_NAMES: Readonly<Record<Lang, string>> = {
  tr: "Türkçe",
  en: "English",
  de: "Deutsch",
  es: "Español",
  fr: "Français",
  "pt-BR": "Português (Brasil)",
  it: "Italiano",
};

/** BCP 47 tag for Intl formatting (dates, numbers, upper case). */
export const LANG_LOCALE: Readonly<Record<Lang, string>> = {
  tr: "tr-TR",
  en: "en-US",
  de: "de-DE",
  es: "es-ES",
  fr: "fr-FR",
  "pt-BR": "pt-BR",
  it: "it-IT",
};

/**
 * Maps one locale tag ("de-AT", "pt_PT", "tr") to an app language, or null
 * when the app has no translation for it. Any Portuguese becomes pt-BR.
 */
export function langOfTag(tag: string | null | undefined): Lang | null {
  if (!tag) return null;
  const base = tag.replace(/_/g, "-").split("-")[0].toLowerCase();
  if (base === "pt") return "pt-BR";
  return isLang(base) ? base : null;
}

/** The first device locale we speak; English when none matches. */
export function detectLang(tags?: readonly (string | null | undefined)[]): Lang {
  let list: readonly (string | null | undefined)[] = tags ?? [];
  if (!tags) {
    try {
      list = [Intl.DateTimeFormat().resolvedOptions().locale];
    } catch {
      list = [];
    }
  }
  for (const tag of list) {
    const lang = langOfTag(tag);
    if (lang) return lang;
  }
  return "en";
}

/** The language to show: a saved explicit choice wins, "system" follows the device. */
export function resolveLang(
  choice: LangChoice | null | undefined,
  deviceTags?: readonly (string | null | undefined)[],
): Lang {
  return choice && choice !== "system" ? choice : detectLang(deviceTags);
}

/**
 * Where code still has two hand-written variants (tr / en: seasonal sets,
 * campaign presets, product copy), every language but Turkish uses English.
 */
export function baseLang(lang: Lang): "tr" | "en" {
  return lang === "tr" ? "tr" : "en";
}
