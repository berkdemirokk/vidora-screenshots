// Extracts every Turkish UI string that has an English counterpart in the
// source and writes the catalogue the translations are checked against.
//
//   node tools/extract-i18n.mjs            report counts
//   node tools/extract-i18n.mjs --write    refresh src/i18n/catalogue.json
//
// What counts as a pair (the Turkish text is the dictionary key):
//   - t("tr", "en") / translate(lang, "tr", "en") with literals, template
//     literals (${x} becomes {0}, {1}, ...) or "a" + x + "b" concatenations
//   - { tr: "...", en: "..." } and { fooTr: "...", fooEn: "..." } objects
//   - new LocalizedError / PermissionError (tr, en), new SpeechError(code, tr, en)
//   - look(id, tr, en, ...) in src/looks.ts
//   - [code, tr, en] tuples (native error tables)
//   - every sentence of src/native-errors.ts (Turkish text for native errors)
// Turkish-market-only data (campaign presets, seasonal sets, poster copy) and
// the legal texts stay Turkish/English by design and are skipped.
// Imported by src/i18n.test.mjs through extractCatalogue().
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

/** Files whose pairs are intentionally not translated (Turkish market, legal, engine copy, auth tables). */
export const SKIP_FILES = new Set([
  "src/campaign-presets.ts",
  "src/licenses.ts",
  "src/license-texts.ts",
  "src/sample-frames.ts",
  "src/auth/copy.ts",
]);
/** Files whose every sentence is Turkish text for a native message. */
const ALL_STRINGS_FILES = new Set(["src/native-errors.ts"]);

function loadTs() {
  for (const base of [root, path.resolve(root, ".."), path.resolve(root, "../.."), path.resolve(root, "../../..")]) {
    try {
      return require(require.resolve("typescript", { paths: [base] }));
    } catch {
      // try the next folder up
    }
  }
  throw new Error("typescript not found");
}

function* walkFiles(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walkFiles(p);
    else if (/\.(ts|tsx)$/.test(e.name) && !e.name.endsWith(".d.ts")) yield p;
  }
}

const isLit = (ts, n) => !!n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n));

/** Normalised text of a string-ish expression ({0}, {1} for holes), or null without literal text. */
function textOf(ts, n) {
  if (!n) return null;
  if (ts.isParenthesizedExpression(n)) return textOf(ts, n.expression);
  if (isLit(ts, n)) return n.text;
  if (ts.isTemplateExpression(n)) {
    let i = 0;
    return n.head.text + n.templateSpans.map((s) => `{${i++}}` + s.literal.text).join("");
  }
  if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const parts = [];
    const flat = (x) => {
      if (ts.isBinaryExpression(x) && x.operatorToken.kind === ts.SyntaxKind.PlusToken) {
        flat(x.left);
        flat(x.right);
      } else parts.push(x);
    };
    flat(n);
    let i = 0;
    let hasLit = false;
    const out = parts
      .map((p) => {
        const t = textOf(ts, p);
        if (t !== null) {
          hasLit = true;
          return t.replace(/\{\d+\}/g, () => `{${i++}}`);
        }
        return `{${i++}}`;
      })
      .join("");
    return hasLit ? out : null;
  }
  return null;
}

/**
 * Returns { pairs: Map<trKey, en>, conflicts, dynamic, sites }.
 * `dynamic` lists t() call sites without literal text (data-driven: t(item.tr,
 * item.en)); the data tables they read are covered by the object pairs.
 */
export function extractCatalogue() {
  const ts = loadTs();
  const pairs = new Map();
  const conflicts = [];
  const dynamic = [];
  let sites = 0;
  const add = (tr, en) => {
    if (tr === null || !tr.trim()) return;
    if (/^[a-z]{2}-[A-Z]{2}$/.test(tr)) return; // locale tags are not UI text
    if (!/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(tr.replace(/\{\d+\}/g, ""))) return; // numbers and symbols only
    if (pairs.has(tr)) {
      if (en && pairs.get(tr) && pairs.get(tr) !== en) conflicts.push({ tr, en: [pairs.get(tr), en] });
      if (en && !pairs.get(tr)) pairs.set(tr, en);
    } else pairs.set(tr, en ?? "");
  };
  for (const dir of ["app", "src"]) {
    for (const file of walkFiles(path.join(root, dir))) {
      const rel = path.relative(root, file).split(path.sep).join("/");
      if (SKIP_FILES.has(rel)) continue;
      const src = fs.readFileSync(file, "utf8");
      const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);
      const allStrings = ALL_STRINGS_FILES.has(rel);
      const visit = (n, inTurkishTable = false) => {
        // native-errors.ts: only the Turkish table (TABLE), not the English one.
        if (allStrings && ts.isVariableDeclaration(n)) inTurkishTable = n.name.getText() === "TABLE";
        if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
          const name = n.expression.text;
          if (name === "t" && n.arguments.length === 2) {
            sites++;
            const a = textOf(ts, n.arguments[0]);
            const b = textOf(ts, n.arguments[1]);
            if (a === null) dynamic.push(rel + ":" + (sf.getLineAndCharacterOfPosition(n.pos).line + 1));
            else add(a, b);
          } else if (name === "look" && n.arguments.length >= 3) {
            // looks.ts: look(id, tr, en, ...)
            add(textOf(ts, n.arguments[1]), textOf(ts, n.arguments[2]));
          } else if (name === "translate" && n.arguments.length === 3) {
            sites++;
            const a = textOf(ts, n.arguments[1]);
            if (a !== null) add(a, textOf(ts, n.arguments[2]));
          }
        }
        if (ts.isNewExpression(n) && ts.isIdentifier(n.expression)) {
          const name = n.expression.text;
          const args = n.arguments ?? [];
          if (name === "LocalizedError" || name === "PermissionError") add(textOf(ts, args[0]), textOf(ts, args[1]));
          if (name === "SpeechError") add(textOf(ts, args[1]), textOf(ts, args[2]));
        }
        if (ts.isObjectLiteralExpression(n)) {
          const props = new Map();
          for (const p of n.properties)
            if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)))
              props.set(p.name.text, p.initializer);
          for (const [k, v] of props) {
            if (k === "tr" && props.has("en")) add(textOf(ts, v), textOf(ts, props.get("en")));
            else if (/Tr$/.test(k) && props.has(k.slice(0, -2) + "En"))
              add(textOf(ts, v), textOf(ts, props.get(k.slice(0, -2) + "En")));
          }
        }
        if (ts.isArrayLiteralExpression(n) && n.elements.length === 3 && n.elements.every((e) => isLit(ts, e))) {
          const [c, a, b] = n.elements.map((e) => e.text);
          if (/^[a-z][a-z0-9-]*$/.test(c) && /\s/.test(a)) add(a, b);
        }
        if (inTurkishTable && isLit(ts, n) && /[A-Za-zÇĞİÖŞÜçğıöşü]{3}/.test(n.text) && /\s/.test(n.text)) add(n.text, "");
        if (inTurkishTable && ts.isTemplateExpression(n)) add(textOf(ts, n), "");
        ts.forEachChild(n, (child) => visit(child, inTurkishTable));
      };
      visit(sf);
    }
  }
  return { pairs, conflicts, dynamic, sites };
}

/** The sign-in copy tables (src/auth/copy.ts) as flat { "COPY.key": { tr, en, ... } }. */
export async function authPairs() {
  const m = await import(pathToFileURL(path.join(root, "src/auth/copy.ts")).href);
  const out = {};
  for (const [k, v] of Object.entries(m.ERROR_TEXT)) out["ERROR_TEXT." + k] = v;
  for (const [k, v] of Object.entries(m.COPY)) out["COPY." + k] = v;
  for (const [k, v] of Object.entries(m.LEGAL_COPY)) out["LEGAL_COPY." + k] = v;
  return out;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const { pairs, conflicts, dynamic, sites } = extractCatalogue();
  console.log(
    `t() call sites: ${sites}, unique Turkish keys: ${pairs.size}, same key with different English: ${conflicts.length}, data-driven t() sites: ${dynamic.length}`,
  );
  const auth = await authPairs();
  console.log(`auth copy entries: ${Object.keys(auth).length}`);
  if (process.argv.includes("--write")) {
    const out = path.join(root, "src/i18n/catalogue.json");
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const body = {};
    for (const [tr, en] of [...pairs].sort((a, b) => a[0].localeCompare(b[0], "tr"))) body[tr] = en;
    fs.writeFileSync(out, JSON.stringify(body, null, 1) + "\n");
    console.log("wrote", path.relative(root, out));
  }
}
