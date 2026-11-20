// Run with: node --test apps/mobile/src/*.test.mjs
// The mobile app ships a copy of packages/shared/studio.ts because EAS uploads
// only apps/mobile. This keeps the copy identical to the shared source.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) =>
  readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("src/studio.ts matches packages/shared/studio.ts", () => {
  assert.equal(
    read("./studio.ts"),
    read("../../../packages/shared/studio.ts"),
    "Copy packages/shared/studio.ts to apps/mobile/src/studio.ts",
  );
});
