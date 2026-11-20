export type PatternId = "pulse" | "house" | "chill" | "pop";

export const PATTERN_IDS: readonly PatternId[] = ["pulse", "house", "chill", "pop"];

/** One bar = 16 steps ("x" hit, "o" open hat, "." rest). */
export type Pattern = {
  kick: string;
  snare: string;
  clap: string;
  hat: string;
  /** Bass hits; each note rings until the next hit. */
  bass: string;
  bassWave: "sine" | "triangle";
  /** One chord per bar, cycled: bass root and triad (MIDI notes). */
  chords: { root: number; notes: [number, number, number] }[];
  gain: { kick: number; snare: number; clap: number; hat: number; bass: number; pad: number };
  /** Pad low-pass cutoff in Hz. */
  padCutoff: number;
  seed: number;
};

type Chord = { root: number; notes: [number, number, number] };

const AM: Chord = { root: 33, notes: [57, 60, 64] };
const F: Chord = { root: 29, notes: [53, 57, 60] };
const C: Chord = { root: 36, notes: [55, 60, 64] };
const G: Chord = { root: 31, notes: [55, 59, 62] };
const DM: Chord = { root: 26, notes: [50, 53, 57] };
const EM: Chord = { root: 28, notes: [52, 55, 59] };

export const PATTERNS: Record<PatternId, Pattern> = {
  pulse: {
    kick: "x...x...x...x...",
    snare: "................",
    clap: "....x.......x...",
    hat: "..x...x...x...xo",
    bass: "x.x.x.x.x.x.x.x.",
    bassWave: "triangle",
    chords: [AM, AM, F, G],
    gain: { kick: 0.95, snare: 0, clap: 0.5, hat: 0.22, bass: 0.5, pad: 0.16 },
    padCutoff: 1400,
    seed: 11,
  },
  house: {
    kick: "x...x...x...x...",
    snare: "................",
    clap: "....x.......x...",
    hat: "..o...o...o...o.",
    bass: "..x...x...x...x.",
    bassWave: "sine",
    chords: [AM, F, C, G],
    gain: { kick: 1, snare: 0, clap: 0.55, hat: 0.26, bass: 0.62, pad: 0.2 },
    padCutoff: 1800,
    seed: 23,
  },
  chill: {
    kick: "x.....x...x.....",
    snare: "....x.......x...",
    clap: "................",
    hat: "x.x.x.x.x.x.x.x.",
    bass: "x.......x.......",
    bassWave: "sine",
    chords: [DM, EM, F, AM],
    gain: { kick: 0.7, snare: 0.35, clap: 0, hat: 0.1, bass: 0.6, pad: 0.3 },
    padCutoff: 1000,
    seed: 37,
  },
  pop: {
    kick: "x.......x.x.....",
    snare: "....x.......x...",
    clap: "....x.......x...",
    hat: "x.x.x.x.x.x.x.xo",
    bass: "x..x..x.x..x..x.",
    bassWave: "triangle",
    chords: [C, G, AM, F],
    gain: { kick: 0.85, snare: 0.5, clap: 0.3, hat: 0.2, bass: 0.52, pad: 0.22 },
    padCutoff: 1600,
    seed: 53,
  },
};
