/**
 * The QA timeline of one render, as short single-line labels. Pure, tested in
 * `render-diag.test.mjs`. The editor shows the latest line in a tiny hidden
 * element (testID "render-diag", QA builds only) and mirrors it through
 * diag(); a UI test reads it from the accessibility tree.
 *
 *   render:idle
 *   render:start q=1080p box=270x480
 *   render:p=0 t=3s          (progress in whole percent, seconds since start)
 *   render:p=17 t=21s
 *   render:done t=64s
 *   render:fail code=stalled t=181s
 *   render:cancelled t=12s
 *
 * No user content: no texts, no prices, no paths.
 */
export const RENDER_DIAG_IDLE = "render:idle";

/** Whole seconds between two clock readings in milliseconds. */
export function secondsBetween(startMs: number, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - startMs) / 1000));
}

export function renderDiagStart(
  quality: string,
  box: { width: number; height: number },
): string {
  return `render:start q=${quality} box=${Math.round(box.width)}x${Math.round(box.height)}`;
}

/** `progress` is 0..1 as the native module reports it. */
export function renderDiagProgress(progress: number, seconds: number): string {
  const percent = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  return `render:p=${percent} t=${seconds}s`;
}

export function renderDiagDone(seconds: number): string {
  return `render:done t=${seconds}s`;
}

export function renderDiagFail(code: string, seconds: number): string {
  return `render:fail code=${code} t=${seconds}s`;
}

export function renderDiagCancelled(seconds: number): string {
  return `render:cancelled t=${seconds}s`;
}

/**
 * A short code for a failed render: the native module's own code when the
 * message carries one ("product-no-space: ..."), else the start of the
 * message made safe for a label. Never a path or user text.
 */
export function renderFailCode(error: unknown): string {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const coded = /\b(?:product|editor)-[a-z][a-z-]*/.exec(message);
  if (coded) return coded[0];
  const slug = message
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return slug || "error";
}
