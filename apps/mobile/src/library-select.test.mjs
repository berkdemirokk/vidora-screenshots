// Run with: node --test apps/mobile/src/*.test.mjs
// Guard: Library select mode must survive its own re-render (QA run 27: "Seç"
// never showed "Bitti").
//
// Root cause (proven from the sources): `useT()` returns a new function every
// render, so `fail` and `refresh` change identity every render. `refresh` was
// a dependency of the useFocusEffect callback; expo-router's useFocusEffect
// (build/useFocusEffect.js) re-runs its effect whenever that callback changes,
// calling the previous cleanup first. The cleanup calls stopSelecting(), so
// setSelecting(true) -> render -> cleanup -> select mode off again.
//
// Rule: the focus effect depends only on stable values; refresh is read from
// a ref.
import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const src = readFileSync(
  new URL("../app/(tabs)/(library)/library.tsx", import.meta.url),
  "utf8",
);

test("the focus effect does not depend on refresh", () => {
  const at = src.indexOf("useFocusEffect(\n");
  assert.ok(at > 0);
  const block = src.slice(
    at,
    src.indexOf("useLayoutEffect(() => setTabBarHidden"),
  );
  assert.match(block, /refreshRef\.current\(\)/);
  assert.match(block, /\}, \[stopSelecting\]\),/);
  assert.doesNotMatch(block, /\[refresh/);
});

test("stopSelecting stays stable and the select press is traced in QA", () => {
  assert.match(
    src,
    /const stopSelecting = useCallback\(\(\) => \{[\s\S]*?\}, \[\]\);/,
  );
  assert.match(src, /if \(QA_DIAG\) diag\("select:press"\)/);
  assert.match(src, /if \(QA_DIAG\) diag\("select:mode " \+ selecting\)/);
});

test("useT returns a stable translator (useCallback on lang)", () => {
  const ui = readFileSync(new URL("./ui.tsx", import.meta.url), "utf8");
  const start = ui.indexOf("export function useT()");
  assert.ok(start > 0, "useT not found");
  const body = ui.slice(start, start + 320);
  assert.match(body, /return useCallback\(/, "useT must return useCallback");
  assert.match(body, /\[lang\]/, "useT must memoise on [lang]");
});
