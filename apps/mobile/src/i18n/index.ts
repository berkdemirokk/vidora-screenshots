/**
 * The translator behind `useT()`.
 *
 * Call sites stay `t("Türkçe", "English")`. Turkish and English return their
 * own argument. Every other language looks the TURKISH text up in its
 * dictionary (src/i18n/dict/<lang>.ts) and falls back to the English
 * argument, so a missing entry is never blank and never Turkish.
 *
 * Strings built with `${...}` at the call site are stored as templates with
 * numbered holes ("{0} video seçildi"); they are matched by pattern and the
 * captured pieces are placed into the translated template.
 *
 * Regenerate the catalogue and check coverage with
 * `node tools/extract-i18n.mjs` and `node --test src/i18n.test.mjs`.
 */
import type { Lang } from "./lang.ts";
import { de } from "./dict/de.ts";
import { es } from "./dict/es.ts";
import { fr } from "./dict/fr.ts";
import { it } from "./dict/it.ts";
import { ptBR } from "./dict/pt-BR.ts";

export type Dict = Readonly<Record<string, string>>;

export const DICTS: Readonly<Record<Exclude<Lang, "tr" | "en">, Dict>> = {
  de,
  es,
  fr,
  it,
  "pt-BR": ptBR,
};

type Pattern = { re: RegExp; out: string; weight: number };

const HOLE = /\{(\d+)\}/g;
const patternCache = new Map<string, Pattern[]>();
const resultCache = new Map<string, Map<string, string>>();
const RESULT_CACHE_MAX = 600;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function patternsFor(lang: string, dict: Dict): Pattern[] {
  let list = patternCache.get(lang);
  if (list) return list;
  list = [];
  for (const key of Object.keys(dict)) {
    if (!/\{\d+\}/.test(key)) continue;
    const parts = key.split(/\{\d+\}/);
    const literal = parts.join("");
    if (!literal.trim()) continue;
    list.push({
      re: new RegExp("^" + parts.map(escapeRe).join("(.+?)") + "$", "s"),
      out: dict[key],
      weight: literal.length,
    });
  }
  list.sort((a, b) => b.weight - a.weight);
  patternCache.set(lang, list);
  return list;
}

/** Translates one Turkish/English pair into `lang`. Pure and synchronous. */
export function translate(lang: Lang, tr: string, en: string): string {
  if (lang === "tr") return tr;
  if (lang === "en") return en;
  const dict = DICTS[lang];
  if (!dict) return en;
  const exact = dict[tr];
  if (exact !== undefined) return exact;
  let cache = resultCache.get(lang);
  if (!cache) resultCache.set(lang, (cache = new Map()));
  const hit = cache.get(tr);
  if (hit !== undefined) return hit;
  let result = en;
  for (const p of patternsFor(lang, dict)) {
    const m = p.re.exec(tr);
    if (m) {
      // A captured piece that is itself a known phrase (a template name, a
      // ratio label) is translated too.
      result = p.out.replace(HOLE, (_, i: string) => {
        const piece = m[Number(i) + 1] ?? "";
        return dict[piece] ?? piece;
      });
      break;
    }
  }
  if (cache.size >= RESULT_CACHE_MAX) cache.clear();
  cache.set(tr, result);
  return result;
}
