// Run with: node --test apps/mobile/src/*.test.mjs
// Guards for two DESIGN.md rules that drift easily: colours only through
// tokens in src/ui.tsx, and the Turkish glossary.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const mobile = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function sources(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sources(full));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(full);
  }
  return out;
}
const files = [
  ...sources(path.join(mobile, "app")),
  ...sources(path.join(mobile, "src")),
];
const rel = (f) => path.relative(mobile, f).split(path.sep).join("/");

// Colours are defined in src/ui.tsx only. Screens and studio panels use
// tokens (Theme.*). Allow-list: none needed today; add "file:literal" with a
// one-line reason if a raw literal is ever unavoidable.
const COLOUR_ALLOW = [];

test("no raw colour literals in screens or studio panels (tokens only)", () => {
  const colour = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;
  const scoped = files.filter(
    (f) =>
      f.endsWith(".tsx") &&
      (rel(f).startsWith("app/") || rel(f).startsWith("src/studio/")),
  );
  const found = [];
  for (const f of scoped) {
    readFileSync(f, "utf8")
      .split(/\r?\n/)
      .forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, "");
        const m = colour.exec(code);
        if (m && !COLOUR_ALLOW.includes(`${rel(f)}:${m[0]}`))
          found.push(`${rel(f)}:${i + 1} ${m[0]}`);
      });
  }
  assert.deepEqual(
    found,
    [],
    "DESIGN.md: colours live in src/ui.tsx tokens only. Raw literals: " +
      found.join(", "),
  );
});

/** First (Turkish) argument of every t("…", "…") call, plus descriptionTr. */
function turkishStrings(text) {
  const out = [];
  const call = /\bt\(\s*(["'`])((?:\\.|(?!\1)[\s\S])*?)\1\s*,/g;
  let m;
  while ((m = call.exec(text))) out.push(m[2]);
  const desc = /descriptionTr:\s*(["'`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
  while ((m = desc.exec(text))) out.push(m[2]);
  return out;
}

test("Turkish copy follows the glossary", () => {
  const problems = [];
  for (const f of files) {
    const name = rel(f);
    for (const s of turkishStrings(readFileSync(f, "utf8"))) {
      // "Buton yazısı" (not "Çağrı"), "Etiket" (not "Rozet").
      if (/(?<!\p{L})(rozet|çağrı)(?!\p{L})/iu.test(s))
        problems.push(`${name}: ${s}`);
      // "stüdyo ışığı" (not "kabartma ışığı").
      if (/kabartma ışığı/iu.test(s)) problems.push(`${name}: ${s}`);
      // On-device rendering is "hazırlandı", never "çizildi". Allowed: the
      // promise that the product is not redrawn, and a struck-through price.
      const rest = s.replace(/(yeniden|üstü) çiz\p{L}*/giu, "");
      if (name !== "app/ai-studio.tsx" && /çiz(il|di|en)/iu.test(rest))
        problems.push(`${name}: ${s}`);
    }
  }
  assert.deepEqual(
    problems,
    [],
    "Glossary (DESIGN.md › Copy):\n" + problems.join("\n"),
  );
});
