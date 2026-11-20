// Run with: node --test apps/mobile/src/*.test.mjs
// Source-level guards for the render tap (QA run 22): the order of the
// steps, the QA switches staying inert, and the testIDs the UI flows use.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) =>
  readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const create = read("../app/create.tsx");
const player = read("./studio/preview-player.tsx");
const config = read("./config.ts");

/** The body of `const render = () => {` up to the İptal handler. */
function renderBody() {
  const from = create.indexOf("  const render = () => {");
  const to = create.indexOf("  const cancelRender = () => {");
  assert.ok(from > 0 && to > from, "render() found");
  return create.slice(from, to);
}

test("the render tap: keyboard first, then one batch, then the native call", () => {
  const body = renderBody();
  const at = (needle) => {
    const i = body.indexOf(needle);
    assert.ok(i >= 0, "missing: " + needle);
    return i;
  };
  const order = [
    "rendering.current || running.current || !spec",
    "keyboardGone()",
    "return run(",
    "watchdog.start()",
    "setProgress(0)",
    "setProgressSeen(false)",
    "flushSave()",
    "renderProductVideo(",
  ].map(at);
  assert.deepEqual(order, [...order].sort((a, b) => a - b), "steps in order");
});

test("the render does not close Metin or Arka plan, only the Şablon panel", () => {
  const body = renderBody();
  assert.match(body, /const closesPanel = !SINGLE_FLOW \|\| tool === "template";/);
  // The only chooseTool calls in render() are guarded by closesPanel.
  const calls = body.match(/chooseTool\(/g) ?? [];
  assert.equal(calls.length, 2);
  assert.doesNotMatch(body, /\n\s*chooseTool\(null\);\s*\n\s*\/\/ The work is on disk/);
});

test("İptal gives feedback at once and cannot start a second render", () => {
  const from = create.indexOf("  const cancelRender = () => {");
  const body = create.slice(from, create.indexOf("// While a render runs", from));
  assert.match(body, /if \(cancelled\.current \|\| !rendering\.current\) return;/);
  assert.match(body, /setCancelling\(true\)/);
  assert.match(body, /cancelProductRender\(\)/);
  // The flag that blocks a second render is cleared only when the promise
  // settled (the finally block), never in the cancel handler.
  assert.doesNotMatch(body, /rendering\.current = false/);
  const finallyAt = renderBody().indexOf("} finally {");
  assert.ok(finallyAt > 0);
  assert.match(renderBody().slice(finallyAt), /rendering\.current = false/);
  // Copy.
  assert.match(player, /"İptal ediliyor…", "Cancelling…"/);
  assert.match(player, /disabled=\{cancelling\}/);
});

test("progress 0 is 'preparing', the percentage starts with the first event", () => {
  assert.match(player, /"Hazırlanıyor… · Bitene kadar açık kalsın"/);
  assert.match(player, /"Preparing… · Keep Vidora open"/);
  assert.match(player, /Beklenenden uzun sürüyor\. Bekleyebilir ya da iptal edebilirsin\./);
  assert.match(create, /started: progressSeen/);
  assert.match(renderBody(), /setProgressSeen\(true\)/);
});

test("the watchdog is fed by progress and cancels through the normal path", () => {
  assert.match(renderBody(), /watchdog\.feed\(\)/);
  assert.match(create, /createRenderWatchdog\(\{\s*now: monotonicNow,\s*cancelAfterMs: stallBudgetMs\(QA_SLOW_RENDER\)/);
  const tick = create.slice(
    create.indexOf("onTick.current = () => {"),
    create.indexOf("const timer = setInterval(() => onTick.current(), 1000)"),
  );
  assert.match(tick, /verdict\.cancel/);
  assert.match(tick, /stalledOut\.current = true/);
  assert.match(tick, /cancelProductRender\(\)/);
  // The failure state: the existing copy, thrown after the promise settled.
  assert.match(renderBody(), /throw stalledRenderError\(\)/);
  assert.match(create, /"Video hazırlanamadı\. Tekrar dene\."/);
});

test("QA switches are inert unless the bundle sets them", () => {
  assert.match(config, /process\.env\.EXPO_PUBLIC_QA_QUALITY/);
  assert.match(
    config,
    /qaQualityRaw === "720p" \|\| qaQualityRaw === "1080p" \? qaQualityRaw : null/,
  );
  // The override sits in effectiveQuality and nowhere else.
  assert.match(create, /effectiveQuality: ProductQuality =\s*\n\s*QA_QUALITY \?\?/);
  assert.equal((create.match(/\bQA_QUALITY\b/g) ?? []).length, 2); // import + use
  // The timeline element and its log lines only exist with QA_DIAG.
  assert.match(create, /\{QA_DIAG \? \(\s*\n[^]*?testID="render-diag"/);
  assert.match(create, /const noteRender = \(line: string\) => \{\s*\n\s*if \(!QA_DIAG\) return;/);
});

test("the testIDs the UI flows use are still there", () => {
  const result = read("./studio/result-view.tsx");
  for (const [text, id] of [
    [create, "render-button"],
    [create, "result-edit"],
    [create, "render-diag"],
    [create, "editor-back"],
    [create, "open-last-video"],
    [player, "render-cancel"],
    [result, "save-photos"],
    [result, "result-bar-done"],
  ])
    assert.ok(text.includes(`testID="${id}"`), `testID ${id}`);
});

test("the preview freezes for the whole render", () => {
  assert.match(create, /usePlayingPreview\(\s*spec,\s*stageBox\.current,\s*progress !== null/);
  assert.match(create, /paused=\{progress !== null \|\| !!result \|\| !isFocused\}/);
});

test("the keyboard moves the layout with plain padding, not an avoiding view", () => {
  const editor = read("../app/editor.tsx");
  for (const source of [create, editor])
    assert.match(source, /paddingBottom: keyboard/);
});

test("a cancel that does not settle gets its own line", () => {
  assert.match(create, /CANCEL_SLOW_AFTER_MS/);
  assert.match(player, /"İptal uzun sürüyor\. Ekrandan çıkıp tekrar açabilirsin\."/);
});
