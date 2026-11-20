// Run with: node --test apps/mobile/src/*.test.mjs
// Guard: every tab trigger forces pointerEvents "box-none" (QA run 26: the
// Library tab's content took no touches; the cause is not proven).
//
// expo-router's NativeTabs gives each tab screen pointerEvents
// ("box-none" | "none") from its own deferred selected tab, and spreads the
// trigger's `unstable_nativeProps` after it. Forcing "box-none" is safe
// because UIKit only keeps the selected tab's view in the window.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const mobile = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(
  path.join(mobile, "app", "(tabs)", "_layout.tsx"),
  "utf8",
);

test("TOUCHABLE forces pointerEvents box-none", () => {
  assert.match(
    source,
    /const TOUCHABLE = \{ pointerEvents: "box-none" \}/,
    'TOUCHABLE must be { pointerEvents: "box-none" }',
  );
});

test("every NativeTabs.Trigger passes unstable_nativeProps={TOUCHABLE}", () => {
  const triggers = source.match(/<NativeTabs\.Trigger\s[^>]*>/g) ?? [];
  assert.equal(triggers.length, 3, "expected three tab triggers");
  for (const tag of triggers)
    assert.ok(
      tag.includes("unstable_nativeProps={TOUCHABLE}"),
      "trigger without TOUCHABLE: " + tag.replace(/\s+/g, " "),
    );
});
