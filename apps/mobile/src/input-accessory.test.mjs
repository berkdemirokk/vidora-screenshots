// Run with: node --test apps/mobile/src/*.test.mjs
// Guard: one InputAccessoryView per TextInput, never a shared id.
//
// Why: on iOS, RCTInputAccessoryComponentView.didMoveToWindow hands its
// content view to the FIRST text input in the window whose
// inputAccessoryViewID equals the accessory's nativeID, once. Five inputs
// sharing one id means only the first gets the bar (run 22: "Bitti" missing
// on every editor field but "Ürün adı"). The rule, checked at source level:
//
//  1. Every inputAccessoryViewID / InputAccessoryView nativeID is a call of
//     the function returned by useInputAccessoryIds() (src/ui.tsx), which
//     is unique per mounted component (React useId) plus a key per input:
//       const doneId = useInputAccessoryIds();
//       <TextInput inputAccessoryViewID={doneId(field.testID)} />
//       <InputAccessoryView nativeID={doneId(field.testID)}>
//     No string literals, no module-level constants.
//  2. A file has as many id-bearing InputAccessoryViews as id-bearing inputs,
//     and both sides use the same set of id functions.
//  3. Two input sites of one file never use the same key.
//  4. Every <InputAccessoryView> carries style={INERT_ACCESSORY_HOST}
//     (src/ui.tsx: opacity 0, pointerEvents "none"). Why: the host view of an
//     accessory is hidden only while it is fresh. A host the Fabric pool hands
//     back (RCTViewComponentView.prepareForRecycle resets the stored layout
//     metrics, so updateLayoutMetrics sets hidden = NO) becomes a visible
//     440x52 view in front of the first row and takes its taps (run 25: the
//     product-name field never got focus). hitTest skips pointerEvents "none".
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

/** The `{…}` expression that starts at `open` (index of "{"), braces balanced. */
function braced(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return text.slice(open + 1, i);
  }
  return null;
}

/** All values of `attr=` found inside the given JSX tag openings. */
function attrValues(text, tag, attr) {
  const out = [];
  const tagRe = new RegExp(`<${tag}\\b`, "g");
  let m;
  while ((m = tagRe.exec(text))) {
    // The opening tag ends at the first ">" outside braces.
    let depth = 0;
    let end = m.index;
    for (; end < text.length; end++) {
      const c = text[end];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0 && text[end - 1] !== "=") break;
    }
    const open = text.slice(m.index, end);
    const a = new RegExp(`\\b${attr}=(\\{|"|')`).exec(open);
    if (!a) continue;
    const at = m.index + a.index + a[0].length - 1;
    if (a[1] === "{")
      out.push({ kind: "expr", value: braced(text, at).trim() });
    else out.push({ kind: "literal", value: open.slice(a.index) });
  }
  return out;
}

/** `cond ? id(x) : undefined` -> `id(x)`. */
const unwrap = (expr) => {
  const m = /^[\s\S]*?\?\s*([\s\S]+?)\s*:\s*undefined$/.exec(expr);
  return (m ? m[1] : expr).trim();
};

/** Problems found in one source text (empty = fine). */
function audit(text, name) {
  const problems = [];
  const inputs = attrValues(text, "TextInput", "inputAccessoryViewID");
  const accessories = attrValues(text, "InputAccessoryView", "nativeID");
  if (inputs.length === 0 && accessories.length === 0) return problems;

  const hooks = [
    ...text.matchAll(
      /const\s+([A-Za-z_$][\w$]*)\s*=\s*useInputAccessoryIds\(\s*\)/g,
    ),
  ].map((m) => m[1]);

  const parse = (site, what) => {
    if (site.kind === "literal") {
      problems.push(`${name}: ${what} is a string literal (${site.value})`);
      return null;
    }
    const expr = unwrap(site.value);
    const call = /^([A-Za-z_$][\w$]*)\(\s*([^()]*?[^()\s][^()]*?)\s*\)$/.exec(
      expr,
    );
    if (!call || !hooks.includes(call[1])) {
      problems.push(
        `${name}: ${what} must be fn(key) with fn = useInputAccessoryIds() (got ${expr})`,
      );
      return null;
    }
    return { fn: call[1], key: call[2] };
  };

  const ins = inputs
    .map((s) => parse(s, "inputAccessoryViewID"))
    .filter(Boolean);
  const acc = accessories
    .map((s) => parse(s, "InputAccessoryView nativeID"))
    .filter(Boolean);

  // Rule 4: every host is inert.
  const styles = attrValues(text, "InputAccessoryView", "style");
  const hosts = (text.match(/<InputAccessoryView\b/g) ?? []).length;
  const inert = styles.filter(
    (site) => site.kind === "expr" && site.value === "INERT_ACCESSORY_HOST",
  ).length;
  if (hosts !== inert)
    problems.push(
      `${name}: ${hosts} InputAccessoryView(s) but ${inert} with style={INERT_ACCESSORY_HOST}`,
    );

  if (inputs.length !== accessories.length)
    problems.push(
      `${name}: ${inputs.length} input id site(s) but ${accessories.length} accessory id site(s)`,
    );
  const fns = (list) => [...new Set(list.map((x) => x.fn))].sort().join(",");
  if (fns(ins) !== fns(acc))
    problems.push(`${name}: inputs and accessories use different id functions`);
  for (const [list, what] of [
    [ins, "input"],
    [acc, "accessory"],
  ]) {
    const seen = new Set();
    for (const { fn, key } of list) {
      const id = `${fn}(${key})`;
      if (seen.has(id))
        problems.push(`${name}: two ${what} sites use the same id ${id}`);
      seen.add(id);
    }
  }
  return problems;
}

test("every InputAccessoryView id in app/ and src/ is per input, never shared", () => {
  const problems = [];
  let checked = 0;
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    if (/inputAccessoryViewID|<InputAccessoryView\b/.test(text)) checked++;
    problems.push(...audit(text, rel(f)));
  }
  assert.ok(
    checked >= 2,
    "expected ui.tsx and studio/panels.tsx to be checked",
  );
  assert.deepEqual(problems, []);
});

test("the editor's five fields each get their own bar", () => {
  const text = readFileSync(path.join(mobile, "src/studio/panels.tsx"), "utf8");
  // Inputs and accessories come from the same list, in the same parent.
  assert.match(
    text,
    /const fieldList = \[name, priceField, oldPriceField, badge, cta\];/,
  );
  assert.match(
    text,
    /\{fieldList\.map\(\(field\) => \(\s*<InputAccessoryView\s+key=\{field\.testID\}\s+nativeID=\{doneId\(field\.testID\)\}\s+style=\{INERT_ACCESSORY_HOST\}\s*>/,
  );
  assert.match(text, /inputAccessoryViewID=\{doneId\(field\.testID\)\}/);
  // The old shared constant is gone.
  assert.doesNotMatch(text, /EDITOR_DONE/);
});

test("the id hook is unique per component and per key", () => {
  const text = readFileSync(path.join(mobile, "src/ui.tsx"), "utf8");
  const hook = /export function useInputAccessoryIds\(\)[\s\S]*?\n\}\n/.exec(
    text,
  );
  assert.ok(hook, "useInputAccessoryIds is exported from ui.tsx");
  assert.match(hook[0], /React\.useId\(\)/);
  assert.match(hook[0], /\$\{base\}-\$\{key\}/);
  assert.doesNotMatch(text, /DONE_BAR/);
});

test("the guard catches a shared id (self-test)", () => {
  const shared = `
    const DONE = "vidora-done";
    <TextInput inputAccessoryViewID={DONE} />
    <TextInput inputAccessoryViewID={DONE} />
    <InputAccessoryView nativeID={DONE} style={INERT_ACCESSORY_HOST}><View /></InputAccessoryView>`;
  assert.ok(audit(shared, "shared").length > 0);
  const literal = `<TextInput inputAccessoryViewID="x" />
    <InputAccessoryView nativeID="x" style={INERT_ACCESSORY_HOST}><View /></InputAccessoryView>`;
  assert.ok(audit(literal, "literal").length > 0);
  const sameKey = `const id = useInputAccessoryIds();
    <TextInput inputAccessoryViewID={id("a")} />
    <TextInput inputAccessoryViewID={id("a")} />
    <InputAccessoryView nativeID={id("a")} style={INERT_ACCESSORY_HOST}><View /></InputAccessoryView>
    <InputAccessoryView nativeID={id("b")} style={INERT_ACCESSORY_HOST}><View /></InputAccessoryView>`;
  assert.ok(audit(sameKey, "sameKey").length > 0);
  const good = `const id = useInputAccessoryIds();
    <TextInput inputAccessoryViewID={pad ? id("field") : undefined} />
    {pad && <InputAccessoryView nativeID={id("field")} style={INERT_ACCESSORY_HOST}><View /></InputAccessoryView>}`;
  assert.deepEqual(audit(good, "good"), []);
  // A host without the inert style, or with some other style, is caught.
  const bare = good.replace(" style={INERT_ACCESSORY_HOST}", "");
  assert.ok(audit(bare, "bare").length > 0);
  const other = good.replace("INERT_ACCESSORY_HOST", "{ opacity: 1 }");
  assert.ok(audit(other, "other").length > 0);
});

test("the inert host style hides the host from touches and from the eye", () => {
  const text = readFileSync(path.join(mobile, "src/ui.tsx"), "utf8");
  const decl = /export const INERT_ACCESSORY_HOST = \{([\s\S]*?)\} as const;/.exec(
    text,
  );
  assert.ok(decl, "INERT_ACCESSORY_HOST is exported from ui.tsx");
  assert.match(decl[1], /opacity: 0,/);
  assert.match(decl[1], /pointerEvents: "none",/);
  // Not display:none (the bar's children would not be laid out).
  assert.doesNotMatch(decl[1], /display/);
});

test("the Metin panel never blurs a field because of a tap inside it", () => {
  const text = readFileSync(path.join(mobile, "src/studio/panels.tsx"), "utf8");
  const fields = /function TextFields\([\s\S]*?\n\}\n/.exec(text);
  assert.ok(fields, "TextFields found");
  // "handled" lets ScrollView claim a tap no child handles and blur the
  // focused input on release (ScrollView.js _handleResponderRelease).
  assert.match(fields[0], /keyboardShouldPersistTaps="always"/);
  assert.doesNotMatch(fields[0], /keyboardShouldPersistTaps="handled"/);
});
