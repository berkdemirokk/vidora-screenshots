// Run with: node --test apps/mobile/src/*.test.mjs
// The bundled sample's cut-out: the asset guard, the fallback order, and a
// source-level guard that posters and "Örnekle dene" use the same helper.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  SAMPLE_CUTOUT,
  SAMPLE_PHOTO,
  bundledSampleCutout,
  copyIsComplete,
  isKnownSampleCutoutSize,
  parseSampleMeta,
  resolveSampleCutout,
  sampleCutoutPlausible,
  serializeSampleMeta,
} from "./sample-cutout.ts";
import { PHOTO_LIMITS, photoWarnings } from "./product-templates.ts";

const mobile = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(mobile, file));
const text = (file) => read(file).toString("utf8");

// --- Asset guard -------------------------------------------------------

test("the bundled cut-out PNG is 8-bit RGBA with the size the code claims", () => {
  const png = read("assets/sample-product-cutout.png");
  assert.deepEqual(
    [...png.subarray(0, 8)],
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    "PNG signature",
  );
  assert.equal(png.toString("latin1", 12, 16), "IHDR");
  assert.equal(png.readUInt32BE(16), SAMPLE_CUTOUT.width, "width");
  assert.equal(png.readUInt32BE(20), SAMPLE_CUTOUT.height, "height");
  assert.equal(png[24], 8, "8 bits per channel");
  assert.equal(png[25], 6, "colour type 6 = RGBA");
  assert.equal(
    png.length,
    SAMPLE_CUTOUT.bytes,
    "file size (re-run the checks)",
  );
});

/** Pixel size from the first JPEG start-of-frame marker. */
function jpegSize(buffer) {
  assert.equal(buffer[0], 0xff);
  assert.equal(buffer[1], 0xd8, "JPEG signature");
  let i = 2;
  while (i + 9 < buffer.length) {
    assert.equal(buffer[i], 0xff, "marker at " + i);
    const marker = buffer[i + 1];
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker)
    )
      return {
        height: buffer.readUInt16BE(i + 5),
        width: buffer.readUInt16BE(i + 7),
      };
    i += 2 + buffer.readUInt16BE(i + 2);
  }
  throw new Error("no JPEG frame header");
}

test("the sample photo the cut-out belongs to still has the claimed size", () => {
  const jpg = read("assets/sample-product.jpg");
  assert.deepEqual(jpegSize(jpg), {
    width: SAMPLE_PHOTO.width,
    height: SAMPLE_PHOTO.height,
  });
  assert.equal(jpg.length, SAMPLE_PHOTO.bytes, "file size (re-run the checks)");
});

test("the sample's quality numbers trigger no photo hint", () => {
  const value = bundledSampleCutout("file:///x/sample-cutout.png");
  assert.deepEqual(photoWarnings(value), []);
  assert.ok(value.quality.sharpness >= PHOTO_LIMITS.minSharpness);
  assert.ok(value.quality.brightness >= PHOTO_LIMITS.minBrightness);
  assert.ok(
    Math.max(value.width, value.height) >= PHOTO_LIMITS.minSide,
    "not flagged as small",
  );
});

test("the bundled value has the native result's shape", () => {
  const value = bundledSampleCutout("file:///x/sample-cutout.png");
  assert.deepEqual(Object.keys(value).sort(), [
    "height",
    "quality",
    "uri",
    "width",
  ]);
  assert.equal(value.uri, "file:///x/sample-cutout.png");
  assert.equal(value.width, SAMPLE_CUTOUT.width);
  assert.equal(value.height, SAMPLE_CUTOUT.height);
  // A copy: nobody can change the constant through the result.
  assert.notEqual(value.quality, SAMPLE_CUTOUT.quality);
});

// --- The fallback decision ---------------------------------------------

/** A value the size of the bundled cut-out. */
const made = (uri) => ({
  uri,
  width: SAMPLE_CUTOUT.width,
  height: SAMPLE_CUTOUT.height,
});

/** Steps that record their calls. */
function steps(overrides = {}) {
  const calls = [];
  const base = {
    cached: () => {
      calls.push("cached");
      return null;
    },
    bundled: async () => {
      calls.push("bundled");
      return made("file:///bundled.png");
    },
    native: async () => {
      calls.push("native");
      return made("file:///native.png");
    },
    onBundledFailed: () => calls.push("bundled-failed"),
    onNativeFailed: () => calls.push("native-failed"),
  };
  return { calls, steps: { ...base, ...overrides } };
}

test("a cached cut-out wins and nothing else runs", async () => {
  const { calls, steps: s } = steps({
    cached: async () => made("file:///cached.png"),
  });
  const result = await resolveSampleCutout(s);
  assert.equal(result.source, "cached");
  assert.equal(result.cutout.uri, "file:///cached.png");
  assert.deepEqual(calls, []);
});

test("without a cache the bundled cut-out is used and the phone is not asked", async () => {
  const { calls, steps: s } = steps();
  const result = await resolveSampleCutout(s);
  assert.equal(result.source, "bundled");
  assert.equal(result.cutout.uri, "file:///bundled.png");
  assert.deepEqual(calls, ["cached", "bundled"]);
});

test("a cached cut-out of the wrong shape is replaced by the bundled one", async () => {
  // The cap only (a colour-fill result), landscape.
  const { calls, steps: s } = steps({
    cached: () => ({ uri: "file:///bad.png", width: 188, height: 135 }),
  });
  const result = await resolveSampleCutout(s);
  assert.equal(result.source, "bundled");
  assert.deepEqual(calls, ["bundled"]);
});

test("when the bundled copy throws, the phone's own cut-out is the last resort", async () => {
  for (const reason of [
    new Error("bundled sample cut-out is missing"),
    new Error("bundled sample cut-out copy is incomplete"),
    "a string, not an Error",
  ]) {
    const { calls, steps: s } = steps({
      bundled: async () => {
        throw reason;
      },
    });
    const result = await resolveSampleCutout(s);
    assert.equal(result.source, "native");
    assert.equal(result.cutout.uri, "file:///native.png");
    assert.deepEqual(calls, ["cached", "bundled-failed", "native"]);
  }
});

test("a native result of the wrong shape is never used", async () => {
  const wrong = [
    { width: 188, height: 135 }, // the cap only, landscape
    { width: 1224, height: 484 }, // turned
    { width: 242, height: 612 }, // half size
    { width: SAMPLE_CUTOUT.width, height: 600 },
  ];
  for (const size of wrong) {
    const { calls, steps: s } = steps({
      bundled: async () => {
        throw new Error("bundled sample cut-out is missing");
      },
      native: async () => ({ uri: "file:///native.png", ...size }),
    });
    await assert.rejects(resolveSampleCutout(s), /wrong size/);
    assert.deepEqual(calls, ["cached", "bundled-failed", "native-failed"]);
  }
});

test("bundled and native both failing: the native error is thrown", async () => {
  const nativeError = new Error("product-no-subject");
  const { calls, steps: s } = steps({
    bundled: async () => {
      throw new Error("bundled sample cut-out copy is incomplete");
    },
    native: async () => {
      throw nativeError;
    },
  });
  await assert.rejects(
    resolveSampleCutout(s),
    (error) => error === nativeError,
  );
  assert.deepEqual(calls, ["cached", "bundled-failed", "native-failed"]);
});

test("an unreadable cache is no cache", async () => {
  const { steps: s } = steps({
    cached: () => {
      throw new Error("disk");
    },
  });
  assert.equal((await resolveSampleCutout(s)).source, "bundled");
});

test("sizes the sample can have are plausible, other shapes are not", () => {
  const plausible = (width, height) => sampleCutoutPlausible({ width, height });
  assert.equal(plausible(484, 1224), true);
  assert.equal(plausible(485, 1224), true);
  assert.equal(plausible(470, 1250), true);
  assert.equal(plausible(188, 135), false, "cap only");
  assert.equal(plausible(355, 868), false, "the previous sample's cut-out");
  assert.equal(plausible(1224, 484), false);
  assert.equal(plausible(484, 1400), false);
  assert.equal(plausible(0, 0), false);
  assert.equal(plausible(NaN, 1224), false);
});

test("Home knows the sample's cut-out sizes, the previous one included", () => {
  assert.equal(isKnownSampleCutoutSize(484, 1224), true);
  assert.equal(isKnownSampleCutoutSize(355, 868), true);
  assert.equal(isKnownSampleCutoutSize(355.4, 867.6), true);
  assert.equal(isKnownSampleCutoutSize(484, 1225), false);
  assert.equal(isKnownSampleCutoutSize(1000, 1000), false);
});

test("a copy is complete only with every byte of the source", () => {
  assert.equal(copyIsComplete(510628, 510628), true);
  assert.equal(copyIsComplete(510627, 510628), false);
  assert.equal(copyIsComplete(0, 0), false);
  assert.equal(copyIsComplete(510628, 0), false);
});

// --- The kept numbers ----------------------------------------------------

test("the numbers kept next to the cached PNG round-trip", () => {
  const value = bundledSampleCutout("file:///x.png");
  const { uri, ...rest } = value;
  assert.deepEqual(parseSampleMeta(serializeSampleMeta(value)), rest);
  assert.deepEqual(
    parseSampleMeta(serializeSampleMeta({ uri, width: 10, height: 20 })),
    { width: 10, height: 20 },
  );
});

test("a record that is not usable is rejected", () => {
  for (const bad of [
    "",
    "not json",
    "null",
    "[]",
    "{}",
    '{"width":0,"height":10}',
    '{"width":10}',
    '{"width":"10","height":10}',
    '{"width":1e999,"height":10}',
  ])
    assert.equal(parseSampleMeta(bad), null, bad);
  // A broken quality is dropped, the size stays.
  assert.deepEqual(
    parseSampleMeta('{"width":10,"height":20,"quality":{"sharpness":"x"}}'),
    { width: 10, height: 20 },
  );
});

// --- Both consumers use the one helper -----------------------------------

test("posters and Örnekle dene both go through getSampleCutout", () => {
  const frames = text("src/sample-frames.ts");
  // The poster draws the sample from the shared helper.
  assert.match(frames, /await getSampleCutout\(\)/);
  // The editor's copy is made from the same helper's result.
  const editor = frames.slice(
    frames.indexOf("export async function sampleEditorCutout"),
  );
  assert.match(editor.slice(0, 400), /await getSampleCutout\(\)/);
  // The fallback decision is the pure function, not a second copy of it.
  assert.match(frames, /resolveSampleCutout\(\{/);
  assert.match(frames, /sample-product-cutout\.png/);

  const create = text("app/create.tsx");
  const from = create.indexOf("const trySample");
  const sample = create.slice(
    from,
    create.indexOf("// Pro became active", from),
  );
  assert.ok(from > 0 && sample.length > 100, "trySample found");
  assert.match(sample, /await sampleEditorCutout\(\)/);
  assert.doesNotMatch(sample, /\bcutOut\(/, "no second cut-out path");
  assert.doesNotMatch(sample, /Asset\.fromModule/);
  assert.match(
    create,
    /sampleEditorCutout,?\s*\} from "\.\.\/src\/sample-frames"/,
  );
});

test("the poster hook has no private cut-out and the QA line names the source", () => {
  const frames = text("src/sample-frames.ts");
  assert.doesNotMatch(frames, /\bsampleProductCutout\b/);
  assert.doesNotMatch(frames, /native\.cutout|native\?\.cutout/);
  assert.match(frames, /:cutout=\$\{cutoutSource\}/);
  // The QA line stays inert without the flag.
  assert.match(frames, /if \(!QA_DIAG\) return;\s*\n\s*if \(state\.startsWith/);
  // No stale talk of tolerance retries.
  assert.doesNotMatch(frames, /tolerance/i);
});

test("ProofPair leaves at once when the poster hook gave up", () => {
  const proof = text("src/proof.tsx");
  assert.match(proof, /useTemplatePosterState/);
  assert.match(proof, /failed: frameGaveUp/);
  assert.match(proof, /if \(frameGaveUp\)/);
  const frames = text("src/sample-frames.ts");
  // `failed` is set only when no try is left.
  assert.match(frames, /failed: !uri && !again/);
});

test("the sample's small files are written synchronously (File.write is async)", () => {
  assert.match(text("src/sample-frames.ts"), /meta\.writeSync\(/);
  assert.doesNotMatch(text("src/sample-frames.ts"), /meta\.write\(/);
  assert.match(
    text("src/draft-store.ts"),
    /file\.writeSync\(`\$\{Math\.round\(width\)\}/,
  );
});
