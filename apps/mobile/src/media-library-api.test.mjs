// Run with: node --test apps/mobile/src/*.test.mjs
// expo-media-library in SDK 58: the legacy functions re-encode images
// (UIImage + UIImageWriteToSavedPhotosAlbum), losing exact pixels and the
// marketplace byte cap. Files must be added with `MediaLibrary.Asset.create`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const FILES = ["media.ts", "studio/still.ts", "cloud.ts"];
const BANNED = [
  /saveToLibraryAsync/,
  /createAssetAsync/,
  /getAssetsAsync/,
  /["']expo-media-library\/legacy["']/,
];

test("Photos saving uses the new expo-media-library API only", () => {
  for (const name of FILES) {
    const source = readFileSync(new URL("./" + name, import.meta.url), "utf8");
    for (const pattern of BANNED)
      assert.doesNotMatch(source, pattern, `${name} uses ${pattern}`);
  }
  const media = readFileSync(new URL("./media.ts", import.meta.url), "utf8");
  assert.match(media, /MediaLibrary\.Asset\.create\(/);
  assert.match(media, /from "expo-media-library";/);
});
