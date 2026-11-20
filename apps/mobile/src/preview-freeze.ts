/**
 * What the editor's playing preview does when a video render starts (freeze)
 * and ends (thaw). Pure, so `preview-freeze.test.mjs` runs it in Node; the
 * hook in `studio/use-playing-preview.ts` carries out the answer.
 *
 * - Freeze while an ask is still unfinished (debounce, a pass in flight, a
 *   retry timer): "drop" it; nothing more is asked and its frames are never
 *   committed. If the ask had already finished, its frames stay valid and
 *   nothing needs doing ("keep").
 * - Thaw: "restart" when the dropped ask never finished or the spec changed
 *   meanwhile; otherwise "none" and the preview is exactly as it was.
 */
export type FreezeState = {
  /** The hook's "frozen" input now. */
  frozen: boolean;
  /** The previous step froze it (so a thaw has something to undo). */
  wasFrozen: boolean;
  /** The last ask ended (frames complete, or the passes gave up). */
  settled: boolean;
  /** The spec last asked for is the current spec. */
  askedIsLatest: boolean;
};

export type FreezeStep = "drop" | "keep" | "restart" | "none";

export function previewFreezeStep(state: FreezeState): FreezeStep {
  if (state.frozen) return state.settled ? "keep" : "drop";
  if (!state.wasFrozen) return "none";
  return !state.settled || !state.askedIsLatest ? "restart" : "none";
}
