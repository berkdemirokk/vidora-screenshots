// Run with: node --test apps/mobile/src/display-metrics.test.mjs
// Anton headlines: the marks of İ Ğ Ü Ö must stay inside their text view on
// iOS (see the long comment above displayMetrics in src/ui.tsx). This test
// reads the display-metrics block of ui.tsx, runs it for every size from 12
// to 72 pt and checks it against the font's own measurements, so nobody can
// lower the padding again.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const mobile = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(mobile, rel), "utf8");
const ui = read("src/ui.tsx");

// Anton_400Regular.ttf measured with PIL (em): hhea descent, tops of the
// marks, depth of the cedilla of Ş and Ç.
const FONT = {
  descent: 0.33,
  markTop: { Ğ: 1.077, Ü: 1.054, Ö: 1.054, İ: 1.05 },
  cedilla: 0.309,
};
// Measured on the simulator (run 22, three screens): the baseline sits
// (lineHeight - 0.325 em) below the top of the line.
const MEASURED_DESCENT = 0.325;

const block =
  /\/\* display-metrics:begin \*\/([\s\S]*?)\/\* display-metrics:end \*\//.exec(
    ui,
  );
assert.ok(block, "display-metrics block missing in src/ui.tsx");
const code = stripTypeScriptTypes(block[1]).replace(/\bexport\s+/g, "");
const api = new Function(
  `${code}; return { ANTON_DESCENT, ANTON_MARK_TOP, DISPLAY_SAFE, DISPLAY_LEAD, DISPLAY_PAD, displayBox, displayMetrics };`,
)();

const SIZES = Array.from({ length: 61 }, (_, i) => 12 + i);
const SCALES = [1, 1.1, 1.2, 1.3, 1.75, 2, 2.5];

/** Ink of a mark above the top edge of the text view (negative = visible). */
function clip(m, size, scale, top) {
  const baseline =
    m.paddingTop + scale * (m.lineHeight - MEASURED_DESCENT * size);
  return scale * top * size - baseline;
}

test("font constants in ui.tsx are not lower than the measured font", () => {
  assert.ok(api.ANTON_DESCENT >= FONT.descent);
  assert.ok(api.ANTON_MARK_TOP >= FONT.markTop["Ğ"]);
  assert.ok(api.DISPLAY_SAFE >= 0.03);
});

test("approved layout: line box and layout padding are unchanged", () => {
  assert.equal(api.DISPLAY_LEAD, 1.12);
  assert.equal(api.DISPLAY_PAD, 0.14);
  for (const size of SIZES)
    for (const scale of SCALES) {
      const m = api.displayMetrics(size, scale);
      assert.equal(m.fontSize, size);
      assert.equal(m.lineHeight, Math.round(size * 1.12));
      // Room the text takes above line 1: padding plus the negative margin.
      assert.equal(
        m.paddingTop + m.marginTop,
        Math.round(size * 0.14),
        `${size}@${scale}`,
      );
      assert.ok(Number.isInteger(m.paddingTop) && m.marginTop <= 0);
    }
});

test("paddingTop covers the tallest mark for sizes 12..72 at every cap", () => {
  for (const size of SIZES)
    for (const scale of SCALES) {
      const m = api.displayMetrics(size, scale);
      // From the font's numbers only: baseline (L - descent) below the line
      // top, Ğ breve at 1.077 em, 0.03 em clearance.
      const needed = Math.ceil(
        scale *
          ((FONT.markTop["Ğ"] + 0.03 + FONT.descent) * size - m.lineHeight),
      );
      assert.ok(
        m.paddingTop >= needed,
        `${size}pt@${scale}: ${m.paddingTop} < ${needed}`,
      );
      for (const [ch, top] of Object.entries(FONT.markTop))
        for (const sc of [scale, Math.max(1, scale - 0.1), 1]) {
          const out = clip(m, size, sc, top);
          // Fully inside the view with clearance (0.02 em at the cap).
          assert.ok(
            out <= -0.02 * size * sc + 1e-9,
            `${ch} ${size}pt scale ${sc} of cap ${scale}: ${out.toFixed(2)} pt over the edge`,
          );
        }
    }
});

test("the old padding (0.14 em) is not enough: the rule is not vacuous", () => {
  for (const size of [36, 41, 52]) {
    const old = {
      lineHeight: Math.round(size * 1.12),
      paddingTop: Math.round(size * 0.14),
    };
    assert.ok(
      clip(old, size, 1, FONT.markTop["Ğ"]) > 0,
      `${size}pt old padding should clip`,
    );
  }
});

test("cedillas (0.309 em below the baseline) stay inside the line box", () => {
  for (const size of SIZES)
    for (const scale of SCALES) {
      const m = api.displayMetrics(size, scale);
      // The baseline is (lineHeight - descent) below the line top, so the
      // room under it is descent * size * scale, whatever the line height.
      const room = scale * MEASURED_DESCENT * size;
      assert.ok(
        room - scale * FONT.cedilla * size >= 0.01 * size * scale,
        `${size}pt@${scale} lineHeight ${m.lineHeight}`,
      );
    }
});

test("displayBox keeps an explicit line height and layout padding (badge 22/26/5)", () => {
  const m = api.displayBox(22, 26, 5, 1.2);
  assert.equal(m.lineHeight, 26);
  assert.equal(m.paddingTop + m.marginTop, 5);
  assert.ok(clip(m, 22, 1.2, FONT.markTop["Ğ"]) < 0);
});

test("Dynamic Type caps match the room above each Anton text", () => {
  const cap = /largeTitle:\s*([\d.]+)/.exec(ui);
  assert.ok(cap, "MaxScale.largeTitle missing");
  const largeTitle = Number(cap[1]);
  // Tab-root titles have 8 pt (Space.s) above the text slot; the marks may
  // reach into it but not beyond.
  const m = api.displayMetrics(34, largeTitle);
  const overSlot = -clip(
    { lineHeight: m.lineHeight, paddingTop: m.paddingTop + m.marginTop },
    34,
    largeTitle,
    FONT.markTop["Ğ"],
  );
  assert.ok(
    overSlot >= -8,
    `largeTitle cap ${largeTitle}: marks reach ${-overSlot} pt above the layout slot, room is 8`,
  );
  // Type.display, s.heading and the paywall heading derive their padding at
  // the cap their Text really has.
  assert.match(
    ui,
    /display:\s*\{[^}]*displayMetrics\(34, MaxScale\.largeTitle\)/,
  );
  assert.match(
    ui,
    /heading:\s*\{[^}]*displayMetrics\(34, MaxScale\.largeTitle\)/,
  );
  assert.match(ui, /big \? MaxScale\.largeTitle/);
  assert.match(
    read("app/paywall.tsx"),
    /displayMetrics\(36, MaxScale\.paywallTitle\)/,
  );
  assert.match(
    read("app/(tabs)/(library)/library.tsx"),
    /maxFontSizeMultiplier=\{MaxScale\.largeTitle\}\s+style=\{\[Type\.display/,
  );
});

/** All .ts/.tsx sources of the app, relative paths. */
function walk(dir) {
  const out = [];
  for (const name of readdirSync(path.join(mobile, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(path.join(mobile, rel)).isDirectory()) out.push(...walk(rel));
    else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) out.push(rel);
  }
  return out;
}

test("no Anton text sets its own lineHeight, fontSize or paddingTop", () => {
  const bad = [];
  for (const rel of [...walk("app"), ...walk("src")]) {
    if (rel === "src/ui.tsx") continue;
    const text = read(rel);
    // A style object that spreads Type.display.
    for (const m of text.matchAll(
      /\.\.\.Type\.display,?[ \t]*\n([\s\S]*?)\n\s*\},?/g,
    )) {
      const body = m[1];
      const own = body.replace(/\.\.\.display(Metrics|Box)\([^)]*\),?/g, "");
      if (/\b(fontSize|lineHeight|paddingTop|marginTop)\s*:/.test(own))
        bad.push(`${rel}: ${own.trim().slice(0, 80)}`);
      if (
        /\bfontSize\b|\blineHeight\b/.test(body) &&
        !/display(Metrics|Box)\(/.test(body)
      )
        bad.push(`${rel}: Type.display with fontSize but no displayMetrics`);
    }
    // One-line form: { ...Type.display, ... }
    for (const m of text.matchAll(/\{\s*\.\.\.Type\.display,([^}\n]*)\}/g))
      if (
        /\b(fontSize|lineHeight|paddingTop|marginTop)\s*:/.test(
          m[1].replace(/\.\.\.display(Metrics|Box)\([^)]*\)/g, ""),
        )
      )
        bad.push(`${rel}: ${m[0]}`);
    if (/fontFamily:\s*Face\.display/.test(text))
      bad.push(`${rel}: Face.display outside ui.tsx`);
  }
  assert.deepEqual(bad, []);
});
