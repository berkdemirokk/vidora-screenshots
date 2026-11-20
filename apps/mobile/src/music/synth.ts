import { PATTERNS, PATTERN_IDS, type PatternId } from "./patterns.ts";

export { PATTERN_IDS };
export type { PatternId };

const FADE_SECONDS = 0.03;
const TWO_PI = Math.PI * 2;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296 - 0.5;
  };
}

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

type Ctx = { buf: Float32Array; rate: number; noise: () => number };

function kick(c: Ctx, start: number, gain: number) {
  const n = Math.min(Math.floor(0.4 * c.rate), c.buf.length - start);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / c.rate;
    const f = 48 + 120 * Math.exp(-t * 38);
    phase += (TWO_PI * f) / c.rate;
    c.buf[start + i] += Math.sin(phase) * Math.exp(-t * 9) * gain;
  }
}

function snare(c: Ctx, start: number, gain: number) {
  const n = Math.min(Math.floor(0.22 * c.rate), c.buf.length - start);
  let lp = 0;
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const t = i / c.rate;
    lp += 0.45 * (c.noise() - lp);
    const band = lp - prev * 0.5;
    prev = lp;
    const tone = Math.sin(TWO_PI * 190 * t) * Math.exp(-t * 35);
    c.buf[start + i] += (band * 2.2 * Math.exp(-t * 22) + tone * 0.5) * gain;
  }
}

function clap(c: Ctx, start: number, gain: number) {
  const n = Math.min(Math.floor(0.25 * c.rate), c.buf.length - start);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / c.rate;
    lp += 0.4 * (c.noise() - lp);
    const bursts = t < 0.03 ? 0.6 + 0.4 * Math.cos(TWO_PI * (t / 0.01)) : 0;
    const env = bursts * Math.exp(-t * 40) + Math.exp(-t * 18) * 0.7;
    c.buf[start + i] += lp * 2 * env * gain;
  }
}

function hat(c: Ctx, start: number, gain: number, open: boolean) {
  const len = open ? 0.22 : 0.06;
  const n = Math.min(Math.floor(len * c.rate), c.buf.length - start);
  const decay = open ? 16 : 60;
  let prev = 0;
  let prev2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / c.rate;
    const x = c.noise();
    const hp = x - prev; // high-pass by differencing, twice
    const hp2 = hp - prev2;
    prev = x;
    prev2 = hp;
    c.buf[start + i] += hp2 * 0.7 * Math.exp(-t * decay) * gain;
  }
}

function bassNote(
  c: Ctx,
  start: number,
  length: number,
  midi: number,
  gain: number,
  wave: "sine" | "triangle",
) {
  const n = Math.min(length, c.buf.length - start);
  if (n <= 0) return;
  const f = hz(midi);
  const attack = 0.004 * c.rate;
  const release = Math.min(0.03 * c.rate, n / 2);
  for (let i = 0; i < n; i++) {
    const p = ((f * i) / c.rate) % 1;
    const s =
      wave === "sine"
        ? Math.sin(TWO_PI * p) + 0.18 * Math.sin(TWO_PI * 2 * p)
        : (p < 0.5 ? 4 * p - 1 : 3 - 4 * p) * 0.9 + 0.2 * Math.sin(TWO_PI * p);
    const env =
      Math.min(1, i / attack) *
      Math.min(1, (n - i) / release) *
      (0.75 + 0.25 * Math.exp(-i / (0.2 * c.rate)));
    c.buf[start + i] += s * env * gain;
  }
}

const DETUNE = [-0.12, 0, 0.12]; // semitones

function padBar(pad: Float32Array, rate: number, start: number, length: number, notes: number[]) {
  const n = Math.min(length, pad.length - start);
  if (n <= 0) return;
  const attack = Math.min(0.3 * rate, n / 2);
  const release = Math.min(0.15 * rate, n / 2);
  for (const m of notes) {
    for (const d of DETUNE) {
      const f = hz(m + d);
      for (let i = 0; i < n; i++) {
        const p = ((f * i) / rate) % 1;
        const env = Math.min(1, i / attack) * Math.min(1, (n - i) / release);
        pad[start + i] += (2 * p - 1) * env;
      }
    }
  }
}

function lowpass(buf: Float32Array, rate: number, cutoff: number) {
  const a = 1 - Math.exp((-TWO_PI * cutoff) / rate);
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < buf.length; i++) {
    y1 += a * (buf[i] - y1);
    y2 += a * (y1 - y2);
    buf[i] = y2;
  }
}

/**
 * Pure, deterministic loop synthesis (kick, snare/clap, hat, bass, pad),
 * mono int16. Length is exactly round(seconds * sampleRate).
 */
export function renderLoop(
  pattern: PatternId,
  bpm: number,
  seconds: number,
  sampleRate: 44100 = 44100,
): Int16Array {
  const p = PATTERNS[pattern];
  if (!p) throw new Error("Unknown music pattern.");
  if (!Number.isFinite(bpm) || bpm < 40 || bpm > 240) throw new Error("Bad bpm.");
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 120)
    throw new Error("Bad length.");

  const rate = sampleRate;
  const total = Math.round(seconds * rate);
  const buf = new Float32Array(total);
  const pad = new Float32Array(total);
  const c: Ctx = { buf, rate, noise: mulberry32(p.seed) };
  const step = (60 / bpm / 4) * rate; // one 16th note in samples
  const bars = Math.ceil(total / (step * 16));

  const hits: number[] = [];
  for (let s = 0; s < 16; s++) if (p.bass[s] === "x") hits.push(s);

  for (let b = 0; b < bars; b++) {
    const chord = p.chords[b % p.chords.length];
    const barStart = Math.round(b * 16 * step);
    padBar(pad, rate, barStart, Math.round(16 * step), chord.notes);
    for (let s = 0; s < 16; s++) {
      const at = Math.round((b * 16 + s) * step);
      if (at >= total) break;
      if (p.kick[s] === "x") kick(c, at, p.gain.kick);
      if (p.snare[s] === "x") snare(c, at, p.gain.snare);
      if (p.clap[s] === "x") clap(c, at, p.gain.clap);
      if (p.hat[s] === "x") hat(c, at, p.gain.hat, false);
      if (p.hat[s] === "o") hat(c, at, p.gain.hat, true);
    }
    for (let h = 0; h < hits.length; h++) {
      const s = hits[h];
      const next = h + 1 < hits.length ? hits[h + 1] : 16;
      const at = Math.round((b * 16 + s) * step);
      if (at >= total) break;
      const len = Math.round((next - s) * step * 0.92);
      const note = chord.root + (s % 4 === 3 ? 12 : 0);
      bassNote(c, at, len, note, p.gain.bass, p.bassWave);
    }
  }

  lowpass(pad, rate, p.padCutoff);
  const padGain = p.gain.pad / 3;
  const fade = Math.min(Math.round(FADE_SECONDS * rate), Math.floor(total / 2));
  const out = new Int16Array(total);
  for (let i = 0; i < total; i++) {
    let g = 1;
    if (i < fade) g = i / fade;
    else if (i >= total - fade) g = (total - 1 - i) / fade;
    const x = (buf[i] + pad[i] * padGain) * g;
    // tanh soft clip, then headroom below int16 full scale.
    out[i] = Math.round(Math.tanh(x * 1.05) * 0.92 * 32767);
  }
  return out;
}
