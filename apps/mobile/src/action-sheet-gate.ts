/**
 * Single-flight rule for native action sheets (pure, so it is tested with
 * an injected clock; the React Native wrapper is src/action-sheet.ts).
 *
 * RCTActionSheetManager neither queues nor drops a second sheet: it
 * presents it on top of the first (run 22: two sheets, then the photo
 * picker could not present and the app stayed busy). So at most one sheet
 * is ever presented.
 *
 * Rule: `acquire()` is refused only while the previous sheet is still open
 * (its callback has not fired) AND it was presented less than `windowMs`
 * ago. It cannot double-present: two calls closer than the window are
 * always refused. It cannot stick: the refusal ends by itself `windowMs`
 * after the last presentation, even if the callback never fires (a sheet
 * the system dropped, or one dismissed by code, never calls back), and a
 * clock that jumps back never refuses.
 */
export const SHEET_WINDOW_MS = 800;

export function createSheetGate(
  now: () => number,
  windowMs: number = SHEET_WINDOW_MS,
) {
  let seq = 0;
  /** The sequence number of the open sheet; 0 when none is open. */
  let open = 0;
  let presentedAt = 0;
  return {
    /** A `release` to call from the sheet's callback, or null to drop the call. */
    acquire(): (() => void) | null {
      const time = now();
      const age = time - presentedAt;
      if (open !== 0 && age >= 0 && age < windowMs) return null;
      const mine = ++seq;
      open = mine;
      presentedAt = time;
      // A late callback of an older sheet must not close a newer one.
      return () => {
        if (open === mine) open = 0;
      };
    },
  };
}
