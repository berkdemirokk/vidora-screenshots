// Run with: node --test apps/mobile/src/*.test.mjs
// Source guards for the product-module gaps closed for the 1.2.0 build
// (Swift is not compiled here, so the source is checked as text).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const mobile = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(mobile, file), "utf8");
const swift = read("modules/karevia-editor/ios/KareviaProductModule.swift");

/** Text of a Swift static func, from its signature to the next "static ". */
function body(name) {
  const from = swift.indexOf(`static func ${name}(`);
  assert.notEqual(from, -1, `missing: ${name}`);
  const to = swift.indexOf("\n  static ", from + 10);
  return swift.slice(from, to === -1 ? undefined : to);
}

test("photo and depth scenes roll by the key rotation, clamped to 8 degrees", () => {
  assert.match(swift, /static let sceneRollLimit: Double = 8\r?\n/);
  for (const name of ["drawPhotoScene", "drawDepthScene"]) {
    const code = body(name);
    assert.match(code, /sceneRoll\(degrees: pose\.rotation\)/, name);
    assert.match(code, /sceneCoverBox\(roll: roll, size: size\)/, name);
    assert.match(code, /applySceneRoll\(ctx, roll: roll, size: size\)/, name);
  }
  // A depth scene drawn as a photo (no depth) keeps its roll.
  assert.match(body("photoKeys"), /out\.rotation = key\.rotation/);
});

test("device memory is exposed natively and bridged with a guard", () => {
  assert.match(
    swift,
    /Function\("deviceMemory"\) \{ \(\) -> Double in\s*return Double\(ProcessInfo\.processInfo\.physicalMemory\)/,
  );
  const bridge = read("src/product.ts");
  assert.match(bridge, /deviceMemory\?: \(\) => number;/);
  assert.match(
    bridge,
    /export function deviceMemoryBytes\(\): number \| null \{\s*if \(typeof native\?\.deviceMemory !== "function"\) return null;/,
  );
});
