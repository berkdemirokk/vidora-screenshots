/**
 * Timing for the playing preview: the native renderer draws a batch of
 * small frames and the editor flips through them like a film strip.
 * Pure functions, tested in src/flipbook.test.mjs.
 */

/** Playback rate of the full preview. */
export const FLIPBOOK_FPS = 12;
/** Rate of the quick first pass shown while the full pass is drawn. */
export const QUICK_FPS = 3;
/** Upper bound on frames per batch (memory and drawing time). */
export const MAX_FRAMES = 120;

/**
 * Evenly spaced times (seconds) covering [0, duration), at most `maxFrames`.
 * Returns an empty list for a duration or rate that is not positive.
 */
export function flipbookTimes(
  duration: number,
  fps: number,
  maxFrames = MAX_FRAMES,
): number[] {
  if (!(duration > 0) || !(fps > 0) || !(maxFrames >= 1)) return [];
  const count = Math.max(
    1,
    Math.min(Math.floor(maxFrames), Math.round(duration * fps)),
  );
  const step = duration / count;
  return Array.from(
    { length: count },
    (_, index) => Math.round(index * step * 1000) / 1000,
  );
}

/** Milliseconds each frame stays on screen so the strip plays in real time. */
export function frameInterval(duration: number, count: number): number {
  if (!(duration > 0) || !(count >= 1)) return 1000 / FLIPBOOK_FPS;
  return Math.max(40, Math.round((duration * 1000) / count));
}

/** The frame to show after `elapsedMs` of looping playback. */
export function frameAt(
  elapsedMs: number,
  duration: number,
  count: number,
): number {
  if (count <= 1 || !(duration > 0) || !Number.isFinite(elapsedMs)) return 0;
  const loop = duration * 1000;
  const position = ((elapsedMs % loop) + loop) % loop;
  return Math.min(count - 1, Math.floor((position / loop) * count));
}

/** The frame under a finger at `x` on a scrub bar `width` wide. */
export function scrubIndex(x: number, width: number, count: number): number {
  if (count <= 1 || !(width > 0) || !Number.isFinite(x)) return 0;
  const fraction = Math.min(1, Math.max(0, x / width));
  return Math.min(count - 1, Math.floor(fraction * count));
}

/** "0:04" style label for a time in seconds. */
export function clockLabel(seconds: number): string {
  const whole = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** Pixel budget of one full-pass frame (keeps memory and drawing time fixed). */
export const PIXEL_BUDGET = 540 * 960;
/** Width of the quick pass and the smallest full pass. */
export const QUICK_WIDTH = 360;

/**
 * Pixel width of the full preview pass for a frame `boxPt` points wide on a
 * screen with `pixelRatio`: as sharp as the box needs, never above the
 * budget for the ratio, at least 360, even.
 */
export function flipbookWidth(
  ratio: "9:16" | "4:5" | "1:1",
  boxPt: number,
  pixelRatio: number,
): number {
  const a = ratio === "1:1" ? 1 : ratio === "4:5" ? 0.8 : 9 / 16;
  const want = Math.round(boxPt * pixelRatio);
  const cap = Math.sqrt(PIXEL_BUDGET * a);
  return Math.max(
    QUICK_WIDTH,
    Math.round(Math.min(want > 0 ? want : QUICK_WIDTH, cap) / 2) * 2,
  );
}
