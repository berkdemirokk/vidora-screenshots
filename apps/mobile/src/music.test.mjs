// Run with: node --test apps/mobile/src/*.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { renderLoop, PATTERN_IDS } from "./music/synth.ts";
import { encodeWav } from "./music/wav.ts";

const RATE = 44100;

test("renderLoop length is seconds x rate for every pattern", () => {
  for (const id of PATTERN_IDS) {
    assert.equal(renderLoop(id, 120, 3).length, 3 * RATE);
    assert.equal(renderLoop(id, 120, 2.5).length, Math.round(2.5 * RATE));
  }
});

test("renderLoop stays inside int16 and is audible", () => {
  for (const id of PATTERN_IDS) {
    const pcm = renderLoop(id, 120, 4);
    assert.ok(pcm instanceof Int16Array);
    let peak = 0;
    for (const v of pcm) peak = Math.max(peak, Math.abs(v));
    assert.ok(peak <= 32767, id);
    assert.ok(peak > 8000, `${id} too quiet: ${peak}`);
  }
});

test("renderLoop fades in and out over 30 ms", () => {
  const pcm = renderLoop("house", 120, 2);
  assert.equal(pcm[0], 0);
  assert.ok(Math.abs(pcm[pcm.length - 1]) <= 40);
});

test("renderLoop is deterministic and patterns differ", () => {
  const a = renderLoop("pop", 120, 2);
  const b = renderLoop("pop", 120, 2);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, renderLoop("chill", 120, 2));
});

test("renderLoop puts the kick on the 120 bpm beat grid", () => {
  const pcm = renderLoop("house", 120, 2);
  const beat = RATE / 2;
  const energy = (from) => {
    let s = 0;
    for (let k = from; k < from + 400; k++) s += Math.abs(pcm[k]);
    return s;
  };
  // Beat 2 starts with a kick; a quarter beat before it is quieter.
  assert.ok(energy(beat) > energy(beat - 600) * 1.5);
});

test("renderLoop rejects bad input", () => {
  assert.throws(() => renderLoop("house", 0, 2));
  assert.throws(() => renderLoop("house", 120, 0));
  assert.throws(() => renderLoop("nope", 120, 2));
});

test("renderLoop 15 s renders fast", () => {
  for (const id of PATTERN_IDS) {
    const t0 = performance.now();
    renderLoop(id, 120, 15);
    const ms = performance.now() - t0;
    assert.ok(ms < 1500, `${id} took ${ms} ms`);
  }
});

test("encodeWav writes a standard mono 16-bit PCM header", () => {
  const pcm = Int16Array.from([0, 1000, -1000, 32767, -32768]);
  const wav = encodeWav(pcm, RATE);
  const v = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const tag = (o) => String.fromCharCode(...wav.subarray(o, o + 4));
  assert.equal(wav.length, 44 + pcm.length * 2);
  assert.equal(tag(0), "RIFF");
  assert.equal(v.getUint32(4, true), wav.length - 8);
  assert.equal(tag(8), "WAVE");
  assert.equal(tag(12), "fmt ");
  assert.equal(v.getUint32(16, true), 16);
  assert.equal(v.getUint16(20, true), 1);
  assert.equal(v.getUint16(22, true), 1);
  assert.equal(v.getUint32(24, true), RATE);
  assert.equal(v.getUint32(28, true), RATE * 2);
  assert.equal(v.getUint16(32, true), 2);
  assert.equal(v.getUint16(34, true), 16);
  assert.equal(tag(36), "data");
  assert.equal(v.getUint32(40, true), pcm.length * 2);
  assert.equal(v.getInt16(44 + 6, true), 32767);
  assert.equal(v.getInt16(44 + 8, true), -32768);
});

test("encodeWav of a rendered loop has seconds x rate samples", () => {
  const wav = encodeWav(renderLoop("pulse", 120, 1), RATE);
  const v = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  assert.equal(v.getUint32(40, true) / 2, RATE);
});

test("buildRecipeSpec passes music through; absent or null stays null", async () => {
  const { buildRecipeSpec } = await import("./recipes/build.ts");
  const style = { weight: "heavy", animation: "rise" };
  const key = (t) => ({ t, x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1, yaw: 0, ease: "inOut" });
  const recipe = {
    id: "t", tr: "T", en: "T", minPhotos: 1, maxPhotos: 2, bpm: 120,
    scenes: [0, 1].map((slot) => ({
      slot, mode: "photo", length: 4, keys: [key(0), key(2)],
      transition: { kind: "push", duration: 0.4 },
    })),
    texts: [{ field: "name", start: 0.2, end: 3, y: 0.2, size: 0.07, style }],
    endHold: 1,
  };
  const input = {
    photos: ["file:///p0.jpg", "file:///p1.jpg"], cutouts: [null, null],
    name: "Amber", price: "", oldPrice: "", badge: "", cta: "",
    palette: "ivory", ratio: "9:16", quality: "1080p",
  };
  assert.equal(buildRecipeSpec(recipe, input).music, null);
  assert.equal(buildRecipeSpec(recipe, { ...input, music: null }).music, null);
  const music = { uri: "file:///m.wav", volume: 0.8 };
  assert.deepEqual(buildRecipeSpec(recipe, { ...input, music }).music, music);
});
