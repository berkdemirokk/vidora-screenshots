import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

test("eas.json sets EXPO_PUBLIC_TESTER_PRO in no build profile", () => {
  const eas = JSON.parse(readFileSync(join(root, "apps/mobile/eas.json"), "utf8"));
  for (const [name, profile] of Object.entries(eas.build ?? {})) {
    assert.ok(
      !("EXPO_PUBLIC_TESTER_PRO" in (profile.env ?? {})),
      `profile ${name} sets EXPO_PUBLIC_TESTER_PRO`,
    );
  }
});

test("no workflow sets EXPO_PUBLIC_TESTER_PRO to 1", () => {
  const dir = join(root, ".github/workflows");
  for (const f of readdirSync(dir)) {
    const text = readFileSync(join(dir, f), "utf8");
    assert.ok(
      !/EXPO_PUBLIC_TESTER_PRO["']?\s*[:=]\s*["']?1/.test(text),
      `${f} sets EXPO_PUBLIC_TESTER_PRO to 1`,
    );
  }
});

test("config.ts reads the flag with === \"1\"", () => {
  const src = readFileSync(join(root, "apps/mobile/src/config.ts"), "utf8");
  assert.match(src, /process\.env\.EXPO_PUBLIC_TESTER_PRO === "1"/);
});
