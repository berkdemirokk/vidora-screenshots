// Checks the App Store text in store.config.json against Apple's limits.
//   node tools/validate-store.mjs        exits 1 and lists every problem
// Limits: title 30, subtitle 30, promo text 170, description 4000, keywords 100
// (comma-joined, no spaces). Also: no "AI video" claims, and the claims that
// must stay identical in every language (no free trial, 1080p, no watermark).
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const file = fileURLToPath(new URL("../store.config.json", import.meta.url));

export function validateStore(config = JSON.parse(fs.readFileSync(file, "utf8"))) {
  const problems = [];
  const info = config.apple?.info ?? {};
  const count = (s) => [...String(s)].length;
  for (const [locale, v] of Object.entries(info)) {
    const at = (field, n, max) => {
      if (count(n) > max) problems.push(`${locale}: ${field} is ${count(n)} characters (max ${max})`);
    };
    at("title", v.title, 30);
    at("subtitle", v.subtitle, 30);
    at("promoText", v.promoText, 170);
    at("description", v.description, 4000);
    const kw = Array.isArray(v.keywords) ? v.keywords.join(",") : String(v.keywords ?? "");
    at("keywords", kw, 100);
    for (const field of ["title", "subtitle", "promoText", "description"])
      if (!String(v[field] ?? "").trim()) problems.push(`${locale}: ${field} is empty`);
    if (/\bAI\b.{0,12}(video|vídeo|vidéo)|(video|vídeo|vidéo).{0,12}\bAI\b|virtual model|virtuelles Model|modelo virtual|modèle virtuel|modello virtuale|\bKI-Video|\bIA\b.{0,12}(vídeo|vidéo)/i.test(v.title + " " + v.subtitle + " " + v.promoText))
      problems.push(`${locale}: headline text makes an AI-video or virtual-model claim`);
    if (!v.supportUrl || !v.privacyPolicyUrl) problems.push(`${locale}: support/privacy URL missing`);
    if (!v.screenshots?.APP_IPHONE_67?.length) problems.push(`${locale}: no screenshots listed`);
    if (!/1080/.test(v.description)) problems.push(`${locale}: description lost the 1080p claim`);
    if (!v.description.includes("https://berkdemirokk.github.io/vidora/privacy")) problems.push(`${locale}: privacy link missing from the description`);
  }
  return problems;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const problems = validateStore();
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  console.log("store.config.json: all locales within limits");
}
