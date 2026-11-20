// Run with: node --test apps/mobile/src/*.test.mjs
// Guard: the Library video tile is a plain Pressable of exactly width x height
// (QA run 23: a saved video showed NO tile, the footer sat right under the
// header).
//
// Root cause (proven from the sources): the tile was
//   <Link asChild href><Link.Trigger><Pressable style={({pressed}) => [...]} />
// expo-router's Link renders asChild through its Slot (expo-router/build/
// ui/Slot.js -> @radix-ui/react-slot), and Link.Trigger renders another Slot.
// @radix-ui/react-slot mergeProps() does, for the `style` prop,
//   overrideProps.style = { ...slotPropValue, ...childPropValue }
// The Pressable's style is a FUNCTION; spreading a function gives {}. The
// tile lost width, height, radius and background and became 0 x 0 (every
// child is absolutely positioned), so the grid row had no height.
//
// Rule: no Link asChild / Link.Trigger / Link.Menu around a tile, and no
// removeClippedSubviews on the list (on Fabric iOS it makes the content view
// keep new cells out of the hierarchy until its clip pass runs: unnecessary
// risk for a small list). Tap and long press go through the router and the
// project's action-sheet gate.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const mobile = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.join(mobile, "..", "..");
const read = (file) => readFileSync(path.join(mobile, file), "utf8");

/** Source without comments, so a comment may explain what is forbidden. */
function code(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\/\/.*$/, ""))
    .join("\n");
}

const library = code(read("app/(tabs)/(library)/library.tsx"));

/** The text of one top-level declaration, up to the next blank-line break. */
function between(text, start, end) {
  const from = text.indexOf(start);
  assert.ok(from >= 0, `found: ${start}`);
  const to = text.indexOf(end, from + start.length);
  assert.ok(to > from, `found after it: ${end}`);
  return text.slice(from, to);
}

const tile = between(library, "const ClipTile = memo(", "type ClipAction");
// The branch that is shown when not selecting (and not busy).
const idle = tile.slice(tile.indexOf("if (selecting || busy)"));
const idleReturn = idle.slice(idle.indexOf("  return (\n    <Pressable"));

function sources(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sources(full));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(full);
  }
  return out;
}

test("the Library does not use Link.Trigger, Link.Menu or removeClippedSubviews", () => {
  assert.doesNotMatch(library, /Link\.Trigger|Link\.Menu|Link\.MenuAction/);
  assert.doesNotMatch(library, /<Link[\s>]/);
  assert.doesNotMatch(library, /\bLink\b[^\n]*from "expo-router"/);
  assert.doesNotMatch(library, /\{\s*Link\b[^}]*\}\s*from "expo-router"/);
  assert.doesNotMatch(library, /removeClippedSubviews/);
});

test("no screen or component uses Link asChild, Link.Trigger or Link.Menu", () => {
  const found = [];
  for (const file of [
    ...sources(path.join(mobile, "app")),
    ...sources(path.join(mobile, "src")),
  ])
    if (/<Link[^>]*asChild|Link\.Trigger|Link\.Menu/.test(code(readFileSync(file, "utf8"))))
      found.push(path.relative(mobile, file).split(path.sep).join("/"));
  assert.deepEqual(found, []);
});

test("the cause stays documented: radix Slot spreads the style prop", () => {
  const file = path.join(root, "node_modules", "@radix-ui", "react-slot", "dist", "index.js");
  if (!existsSync(file)) return; // not installed in this checkout
  assert.match(
    readFileSync(file, "utf8"),
    /\.\.\.slotPropValue,\s*\.\.\.childPropValue/,
    "if Slot stops spreading style, this guard and the tile comment can go",
  );
});

test("the idle tile's root is a Pressable carrying the box style", () => {
  assert.match(tile, /const box = \[styles\.tile, \{ width, height \}\];/);
  assert.match(idleReturn, /^ {2}return \(\n {4}<Pressable\n/);
  assert.match(idleReturn, /testID="library-tile"/);
  assert.match(
    idleReturn,
    /style=\{\(\{ pressed \}\) => \[box, pressed && Press\.media\]\}/,
  );
  // Nothing wraps it: the return opens with the Pressable and closes with it.
  assert.match(idleReturn, /<\/Pressable>\n {2}\);\n/);
});

test("the selecting tile is a checkbox Pressable with the same id and box", () => {
  const selecting = tile.slice(
    tile.indexOf("if (selecting || busy)"),
    tile.indexOf("const showActions"),
  );
  assert.match(selecting, /testID="library-tile"/);
  assert.match(selecting, /accessibilityRole=\{selecting \? "checkbox" : "button"\}/);
  assert.match(selecting, /onPress=\{\(\) => onToggle\(clip\.id\)\}/);
  assert.match(selecting, /style=\{\(\{ pressed \}\) => \[box, pressed && Press\.media\]\}/);
});

test("a tile is a direct child of the grid row (no wrapper in between)", () => {
  assert.match(
    library,
    /<View style=\{styles\.gridRow\}>\s*\{item\.clips\.map\(\(clip, index\) => \(\s*<ClipTile\b/,
  );
  assert.match(library, /gridRow: \{ flexDirection: "row", gap: GAP \}/);
  assert.match(library, /onOpen=\{openClip\}/);
});

test("tap opens /video once through the router", () => {
  assert.match(idleReturn, /onPress=\{\(\) => onOpen\(clip\)\}/);
  const open = between(library, "const openClip = useCallback(", "function draftMenu");
  assert.match(open, /deskOpenGuard\("video:" \+ clip\.id\)/);
  assert.match(
    open,
    /router\.push\(\{ pathname: "\/video", params: \{ id: clip\.id \} \}\)/,
  );
});

test("long press shows the clip actions through the action-sheet wrapper", () => {
  assert.match(idleReturn, /onLongPress=\{showActions\}/);
  const show = between(tile, "const showActions = () => {", "return (\n    <Pressable\n      testID");
  assert.match(show, /tap\("action"\)/);
  assert.match(show, /chooseAction\(/);
  assert.match(show, /actions\.map\(\(action\) => action\.label\)/);
  assert.match(show, /t\("Vazgeç", "Cancel"\)/);
  assert.match(show, /action\.id === "delete"/);
  assert.match(show, /onAction\(clip, action\.id\)/);
  // One gate for every sheet: no direct ActionSheetIOS in the Library.
  assert.doesNotMatch(library, /ActionSheetIOS/);
});

test("the VoiceOver label, hint and actions are kept", () => {
  assert.match(idleReturn, /accessibilityLabel=\{label\}/);
  assert.match(idleReturn, /accessibilityHint=\{t\("Videoyu açar\.", "Opens the video\."\)\}/);
  assert.match(
    idleReturn,
    /accessibilityActions=\{actions\.map\(\(action\) => \(\{\s*name: action\.id,\s*label: action\.label,\s*\}\)\)\}/,
  );
  assert.match(idleReturn, /onAccessibilityAction=\{\(event\) => \{/);
  assert.match(idleReturn, /event\.nativeEvent\.actionName/);
});

test("every clip action id is handled by onAction (delete included)", () => {
  const ids = [...library.matchAll(/id: "(\w+)",\s*label: t\(/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(ids)].sort(), ["delete", "duplicate", "edit", "editor", "save", "share"]);
  const onAction = between(library, "const onAction = useCallback(", "const openClip");
  for (const id of ids)
    assert.match(onAction, new RegExp(`id === "${id}"`), id);
  // The delete confirmation is its own branch: it used to hang off the inner
  // `if` of the "editor" branch (a dangling else), so Sil did nothing and a
  // double tap on "Kurguda aç" asked to delete the video.
  assert.match(onAction, /\} else if \(id === "delete"\)\s*confirmDelete\(/);
  assert.match(onAction, /else if \(id === "editor"\) \{\s*if \(deskOpenGuard/);
});

test("the list keeps its tuning but not removeClippedSubviews", () => {
  assert.match(library, /initialNumToRender=\{Math\.ceil\(800 \/ tileH\) \+ 1\}/);
  assert.match(library, /windowSize=\{5\}/);
  assert.match(library, /maxToRenderPerBatch=\{4\}/);
  assert.match(library, /extraData=\{\[selecting, selected, busy\]\}/);
});

test("draft and project rows are plain Rows (no Link, no Slot)", () => {
  assert.match(library, /<Row\s+first=\{item\.first\}\s+leading=/);
  assert.match(library, /onLongPress=\{\(\) => draftMenu\(draft, title\)\}/);
  assert.match(library, /onLongPress=\{\(\) => projectMenu\(project\)\}/);
});
