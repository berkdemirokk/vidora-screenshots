// Run with: node --test apps/mobile/src/*.test.mjs
// Multi-language support: coverage of the five dictionaries, the translator,
// language detection, the sign-in copy and the stable-useT guard.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { extractCatalogue, authPairs } from "../tools/extract-i18n.mjs";
import { DICTS, translate } from "./i18n/index.ts";
import {
  LANGS,
  LANG_LOCALE,
  LANG_NAMES,
  baseLang,
  detectLang,
  isLang,
  langOfTag,
  resolveLang,
} from "./i18n/lang.ts";

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), "utf8");
const holes = (s) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");
const OTHER = ["de", "es", "fr", "pt-BR", "it"];
const { pairs } = extractCatalogue();

test("seven languages, each with a name and a locale", () => {
  assert.deepEqual([...LANGS], ["tr", "en", "de", "es", "fr", "pt-BR", "it"]);
  for (const l of LANGS) {
    assert.ok(LANG_NAMES[l] && LANG_LOCALE[l], l);
    assert.ok(isLang(l));
  }
  assert.equal(isLang("pt"), false);
  assert.deepEqual(Object.keys(DICTS).sort(), [...OTHER].sort());
});

test("every Turkish key in the source exists in all five dictionaries", () => {
  assert.ok(pairs.size > 700, "the extractor found the call sites");
  for (const lang of OTHER) {
    const missing = [...pairs.keys()].filter((k) => !(k in DICTS[lang]));
    assert.deepEqual(missing, [], `${lang} is missing ${missing.length} keys`);
  }
});

test("no stale keys: every dictionary entry is still used in the source", () => {
  for (const lang of OTHER) {
    const stale = Object.keys(DICTS[lang]).filter((k) => !pairs.has(k));
    assert.deepEqual(stale, [], `${lang} has stale keys`);
  }
});

test("placeholders match the Turkish key and no value is empty", () => {
  for (const lang of OTHER)
    for (const [key, value] of Object.entries(DICTS[lang])) {
      assert.ok(value.trim().length > 0, `${lang} empty: ${key}`);
      assert.equal(holes(value), holes(key), `${lang} placeholders: ${key}`);
      assert.doesNotMatch(value, /[ıİğĞşŞ]/, `${lang} has Turkish-only letters: ${value}`);
    }
});

test("emoji, prices and units in a key survive in its translation", () => {
  for (const lang of OTHER)
    for (const [key, value] of Object.entries(DICTS[lang])) {
      const emoji = key.match(/\p{Extended_Pictographic}/gu) ?? [];
      for (const e of emoji) assert.ok(value.includes(e), `${lang} lost ${e}: ${key}`);
      for (const price of key.match(/[₺$€]\s?\d[\d.,]*/g) ?? [])
        assert.ok(value.includes(price), `${lang} changed price ${price}: ${key}`);
    }
});

test("the extracted catalogue file is up to date", () => {
  const onDisk = JSON.parse(read("./i18n/catalogue.json"));
  assert.deepEqual(Object.keys(onDisk).sort(), [...pairs.keys()].sort());
});

test("translate: Turkish and English pass through, others look up the Turkish text", () => {
  assert.equal(translate("tr", "Kaydet", "Save"), "Kaydet");
  assert.equal(translate("en", "Kaydet", "Save"), "Save");
  assert.equal(translate("de", "Kaydet", "Save"), "Sichern");
  assert.equal(translate("pt-BR", "Kaydet", "Save"), "Salvar");
  // Unknown text falls back to the English argument, never to Turkish.
  assert.equal(translate("fr", "Bu cümle sözlükte yok", "Not in the dictionary"), "Not in the dictionary");
});

test("translate: templates built with ${...} at the call site are matched by pattern", () => {
  assert.equal(translate("de", "5 video seçildi", "5 videos selected"), "5 Videos ausgewählt");
  assert.equal(translate("es", "3/6 klip", "3/6 clips"), "3/6 clips");
  assert.equal(
    translate("it", "Altyazı oluşturuluyor (2/5)", "Generating captions (2/5)"),
    "Creazione dei sottotitoli (2/5)",
  );
  // A captured piece that is a known phrase is translated too.
  assert.equal(
    translate("de", "Hazırlanıyor 2/6: Video 4:5", "Preparing 2/6: Video 4:5"),
    "Wird vorbereitet 2/6: Video 4:5",
  );
});

test("translate: every templated key matches its own filled-in text", () => {
  for (const lang of OTHER)
    for (const key of Object.keys(DICTS[lang])) {
      if (!/\{\d+\}/.test(key)) continue;
      const filled = key.replace(/\{(\d+)\}/g, (_, i) => String(7 + Number(i)));
      // A more specific key may legitimately win, but never the English fallback.
      assert.notEqual(translate(lang, filled, "EN"), "EN", `${lang}: ${key}`);
    }
});

test("language detection: device locale, Portuguese is pt-BR, unknown is English", () => {
  assert.equal(detectLang(["de-AT"]), "de");
  assert.equal(detectLang(["pt-PT"]), "pt-BR");
  assert.equal(detectLang(["pt_BR"]), "pt-BR");
  assert.equal(detectLang(["tr-TR", "en-US"]), "tr");
  assert.equal(detectLang(["ja-JP", "fr-CA"]), "fr", "the first language we speak wins");
  assert.equal(detectLang(["ja-JP"]), "en");
  assert.equal(detectLang([]), "en");
  assert.equal(langOfTag("it"), "it");
  assert.equal(langOfTag(""), null);
  assert.ok(isLang(detectLang()), "Intl fallback returns a supported language");
});

test("a saved choice wins over the device; system follows the device", () => {
  assert.equal(resolveLang("fr", ["de-DE"]), "fr");
  assert.equal(resolveLang("system", ["de-DE"]), "de");
  assert.equal(resolveLang(null, ["es-MX"]), "es");
  assert.equal(baseLang("tr"), "tr");
  for (const l of LANGS.filter((x) => x !== "tr")) assert.equal(baseLang(l), "en");
});

test("sign-in copy is complete in all seven languages with matching placeholders", async () => {
  const auth = await authPairs();
  assert.ok(Object.keys(auth).length >= 60);
  for (const [key, pair] of Object.entries(auth))
    for (const lang of LANGS) {
      assert.ok(typeof pair[lang] === "string" && pair[lang].trim(), `${key} ${lang}`);
      assert.equal(holes(pair[lang]), holes(pair.tr), `${key} ${lang} placeholders`);
    }
});

test("useT returns a referentially stable function (guard for the Library select loop)", () => {
  const ui = read("./ui.tsx");
  const body = ui.slice(ui.indexOf("export function useT()"));
  const fn = body.slice(0, body.indexOf("\n}\n"));
  assert.match(fn, /useCallback\(/, "useT memoises its translator");
  assert.match(fn, /,\s*\[lang\]\s*\)/, "and depends on the language only");
  assert.match(fn, /translate\(lang, a, b\)/);
  assert.doesNotMatch(fn, /useState|useRef\(/);
  // The translator itself is synchronous and pure: no hooks, no I/O.
  const idx = read("./i18n/index.ts");
  assert.doesNotMatch(idx, /from "react"|from "react-native"|await |fetch\(/);
});

test("the language picker has the agreed test ids", () => {
  const settings = read("../app/(tabs)/(settings)/settings.tsx");
  assert.match(settings, /testID="settings-language"/);
  assert.match(settings, /testID="lang-system"/);
  assert.match(settings, /lang-option-\$\{code\}/);
  assert.match(settings, /LANGS\.map/);
});

test("native strings: infoPlist translations and store metadata exist for every language", () => {
  const app = JSON.parse(read("../app.json")).expo;
  const base = Object.keys(JSON.parse(read("../locales/en.json")));
  for (const lang of LANGS) {
    assert.ok(app.locales[lang], `app.json locales has ${lang}`);
    const file = JSON.parse(read("../locales/" + lang + ".json"));
    assert.deepEqual(Object.keys(file).sort(), [...base].sort(), `locales/${lang}.json keys`);
    for (const v of Object.values(file)) assert.ok(String(v).trim().length > 20);
  }
});

test("store listing exists for de-DE, es-ES, fr-FR, pt-BR and it within Apple's limits", async () => {
  const { validateStore } = await import("../tools/validate-store.mjs");
  const config = JSON.parse(read("../store.config.json"));
  for (const locale of ["de-DE", "es-ES", "fr-FR", "pt-BR", "it"])
    assert.ok(config.apple.info[locale], locale);
  assert.deepEqual(validateStore(config), []);
});
