// Run with: node --test apps/mobile/src/home-hero-geometry.test.mjs
// Home's full-bleed hero moves up on short screens so the product clears the
// sheet (src/home-hero-geometry.ts; applied in app/(tabs)/(studio)/index.tsx).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  BOTTOM_GAP,
  PHOTO_BOTTLE_BOTTOM,
  PHOTO_BOTTLE_TOP,
  PRODUCT_BOTTOM,
  PRODUCT_TOP,
  SHEET_TRIM,
  SHORT_SCREEN,
  TOP_GAP,
  heroOffset,
  photoFrame,
  posterHeightFor,
  sheetPaddingBottom,
} from "./home-hero-geometry.ts";

// Sheet height the styles produce: paddingTop 12 + headline 2 x (46 line +
// 6 slot) - 3 overlap = 101 + button 16 + 52 + link 6 + 44 + claim 17 + the
// tab inset (safe bottom incl. the iOS 26 tab bar 84 + 49 + 16 = 149), which
// is what the simulator measured on 375x667 and 440x956 (397 pt on both,
// before the short-window trim).
const CONTENT = 12 + 101 + 68 + 50 + 17;
const TAB_INSET = 149;
const SHEET = CONTENT + TAB_INSET;
assert.equal(SHEET, 397);
// The sheet the code produces on a screen: short windows trim the padding.
const sheetFor = (screen, tabInset = TAB_INSET) =>
  CONTENT + sheetPaddingBottom(screen.height, tabInset);

// width x height, safe-area top.
const SCREENS = [
  { name: "375x667", width: 375, height: 667, safeTop: 20 },
  { name: "375x812", width: 375, height: 812, safeTop: 50 },
  { name: "390x844", width: 390, height: 844, safeTop: 47 },
  { name: "430x932", width: 430, height: 932, safeTop: 59 },
  { name: "440x956", width: 440, height: 956, safeTop: 62 },
];
const geometry = (screen, sheetHeight = sheetFor(screen)) => ({
  posterHeight: posterHeightFor(screen.width, screen.height),
  windowHeight: screen.height,
  sheetHeight,
  safeTop: screen.safeTop,
});
const band = (screen, sheetHeight = sheetFor(screen)) => {
  const g = geometry(screen, sheetHeight);
  const d = heroOffset(g);
  return {
    g,
    d,
    top: PRODUCT_TOP * g.posterHeight - d,
    bottom: PRODUCT_BOTTOM * g.posterHeight - d,
    sheetTop: g.windowHeight - sheetHeight,
  };
};

test("hero height: 9:16 at the width, never above the window", () => {
  assert.equal(posterHeightFor(375, 667), 667);
  assert.equal(posterHeightFor(375, 812), 667);
  assert.equal(posterHeightFor(440, 956), 782);
  assert.equal(posterHeightFor(440, 600), 600);
});

test("tall phones: the hero does not move", () => {
  for (const name of ["430x932", "440x956"]) {
    const screen = SCREENS.find((s) => s.name === name);
    assert.equal(heroOffset(geometry(screen)), 0, name);
  }
});

test("the constants are the measured band (pinned literally)", () => {
  assert.equal(PRODUCT_TOP, 0.305);
  assert.equal(PRODUCT_BOTTOM, 0.683);
  assert.equal(BOTTOM_GAP, 12);
  assert.equal(TOP_GAP, 8);
  assert.equal(SHORT_SCREEN, 700);
  assert.equal(SHEET_TRIM, 30);
});

test("pinned offsets for the five screens (sheet as the code builds it)", () => {
  const expected = { "375x667": 168, "375x812": 53, "390x844": 39, "430x932": 0, "440x956": 0 };
  for (const screen of SCREENS)
    assert.equal(heroOffset(geometry(screen)), expected[screen.name], screen.name);
  // Only the 16:9 window gets the trimmed sheet.
  assert.equal(sheetFor(SCREENS[0]), 367);
  for (const screen of SCREENS.slice(1)) assert.equal(sheetFor(screen), SHEET);
  // Without the trim the 16:9 screen is cap-limited: 175, base 10.6 pt under.
  assert.equal(heroOffset(geometry(SCREENS[0], SHEET)), 175);
});

test("the product ends >= 12 pt above the sheet on every screen", () => {
  for (const screen of SCREENS) {
    const { d, bottom, sheetTop } = band(screen);
    if (d > 0) assert.ok(sheetTop - bottom >= BOTTOM_GAP - 1e-9, screen.name);
    // The offset is a whole number of points.
    assert.equal(d, Math.round(d), screen.name);
  }
  // 375x667: cap 35.4 pt (15 below the status bar), base 12.4 above the sheet.
  const se = band(SCREENS[0]);
  assert.ok(se.top - SCREENS[0].safeTop >= TOP_GAP);
  assert.ok(se.sheetTop - se.bottom >= BOTTOM_GAP);
  // Classic tab bar (inset 114): padding 84, sheet 332, still fits.
  const classic = band(SCREENS[0], sheetFor(SCREENS[0], 114));
  assert.ok(classic.sheetTop - classic.bottom >= BOTTOM_GAP - 1e-9);
  assert.equal(classic.d, 133);
  // The claim stays clear of the tab bar (top at height - 84): 35 pt on 375x667.
  const claimBottom = SCREENS[0].height - sheetPaddingBottom(SCREENS[0].height, TAB_INSET);
  assert.ok(SCREENS[0].height - 84 - claimBottom >= 30);
});

test("430x932 has only 1.2 pt of slack: a 3 pt taller sheet already moves it", () => {
  assert.equal(heroOffset(geometry(SCREENS[3], 397)), 0);
  assert.equal(heroOffset(geometry(SCREENS[3], 400)), 2);
});

test("sheet padding: trimmed under SHORT_SCREEN only, never negative or NaN", () => {
  assert.equal(sheetPaddingBottom(667, 149), 119);
  assert.equal(sheetPaddingBottom(699, 149), 119);
  assert.equal(sheetPaddingBottom(700, 149), 149);
  assert.equal(sheetPaddingBottom(956, 149), 149);
  assert.equal(sheetPaddingBottom(667, 10), 0);
  assert.equal(sheetPaddingBottom(667, NaN), 0);
});

test("the product's top keeps 8 pt below the safe area", () => {
  for (const screen of SCREENS)
    for (const sheetHeight of [0, 200, SHEET, 450, 600, 5000]) {
      const { top } = band(screen, sheetHeight);
      assert.ok(top - screen.safeTop >= TOP_GAP - 1e-9, `${screen.name} ${sheetHeight}`);
    }
});

test("a taller sheet gives a larger offset (until the cap)", () => {
  const screen = SCREENS[1]; // 375x812
  const a = heroOffset(geometry(screen, 362));
  const b = heroOffset(geometry(screen, SHEET));
  const c = heroOffset(geometry(screen, 450));
  assert.ok(a < b && b < c, `${a} < ${b} < ${c}`);
  for (const s of SCREENS) {
    let last = 0;
    for (const sheetHeight of [250, 300, 362, SHEET, 450, 520, 700]) {
      const d = heroOffset(geometry(s, sheetHeight));
      assert.ok(d >= last, `${s.name} ${sheetHeight}`);
      last = d;
    }
  }
});

test("never negative, never NaN (zero or unknown sheet, odd input)", () => {
  for (const screen of SCREENS) {
    assert.equal(heroOffset(geometry(screen, 0)), 0);
    assert.equal(heroOffset(geometry(screen, -5)), 0);
    assert.equal(heroOffset(geometry(screen, NaN)), 0);
    assert.equal(heroOffset(geometry(screen, Infinity)), 0);
  }
  for (const g of [
    { posterHeight: 0, windowHeight: 0, sheetHeight: 0, safeTop: 0 },
    { posterHeight: NaN, windowHeight: NaN, sheetHeight: NaN, safeTop: NaN },
    { posterHeight: 667, windowHeight: 667, sheetHeight: 400, safeTop: NaN },
    { posterHeight: 100, windowHeight: 50, sheetHeight: 400, safeTop: 500 },
  ]) {
    const d = heroOffset(g);
    assert.ok(Number.isFinite(d) && d >= 0, JSON.stringify(g));
    assert.ok(!Object.is(d, -0));
  }
});

test("first-paint photo: the whole bottle is above the sheet", () => {
  for (const screen of SCREENS)
    for (const sheetHeight of [362, SHEET, 450]) {
      const g = geometry(screen, sheetHeight);
      const frame = photoFrame({ ...g, width: screen.width });
      const sheetTop = screen.height - sheetHeight;
      const label = `${screen.name} ${sheetHeight}`;
      assert.ok(frame.height > 0 && frame.width > 0, label);
      assert.ok(Math.abs(frame.width / frame.height - 0.75) < 1e-9, label);
      assert.ok(frame.top >= screen.safeTop + TOP_GAP - 1e-9, label);
      const bottleTop = frame.top + PHOTO_BOTTLE_TOP * frame.height;
      const bottleBottom = frame.top + PHOTO_BOTTLE_BOTTOM * frame.height;
      assert.ok(bottleTop >= screen.safeTop + TOP_GAP, label);
      assert.ok(sheetTop - bottleBottom >= BOTTOM_GAP - 1e-9, label);
      // Centred on the window.
      assert.ok(Math.abs(frame.left * 2 + frame.width - screen.width) < 1e-9, label);
    }
});

test("first-paint photo: nothing known gives an empty frame, no NaN", () => {
  for (const g of [
    { posterHeight: 667, windowHeight: 667, sheetHeight: 0, safeTop: 20, width: 375 },
    { posterHeight: 667, windowHeight: 667, sheetHeight: NaN, safeTop: NaN, width: NaN },
    { posterHeight: 667, windowHeight: 300, sheetHeight: 400, safeTop: 20, width: 375 },
  ]) {
    const frame = photoFrame(g);
    for (const value of Object.values(frame))
      assert.ok(Number.isFinite(value), JSON.stringify(g));
  }
});

test("Home wires it: layer hidden until the sheet is measured, ids kept", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(
    path.join(here, "..", "app", "(tabs)", "(studio)", "index.tsx"),
    "utf8",
  );
  assert.match(source, /heroOffset\(geometry\)/);
  assert.match(source, /opacity: revealed \? 1 : 0/);
  assert.match(source, /sheetPaddingBottom\(window\.height, tabInset\)/);
  assert.match(source, /top: -offset/);
  assert.match(source, /onLayout=\{/);
  for (const id of [
    "home-create",
    "home-sample",
    "home-resume-draft",
    "home-hero",
    "poster-diag",
  ])
    assert.ok(source.includes(`"${id}"`), id);
});
