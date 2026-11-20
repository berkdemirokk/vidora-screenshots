/**
 * Stall watchdog for the native video render. Pure (time is injected), so the
 * rules are tested in Node (`render-watchdog.test.mjs`).
 *
 * Why it exists: the native renderer (ProductRenderer.run) sends progress only
 * after frames are appended (every 6th frame), so its whole preparation phase
 * (photo decode, scene) is silent; cancelling does nothing until that phase
 * returns; and a new render is refused while the old task is alive. A render
 * that never moves would leave the editor locked on "%0" for good.
 *
 * Rules (all measured from the last sign of life, which is the start of the
 * render or the latest progress event, whichever is later):
 * - after `warnAfterMs` of silence: `warning` (quiet note next to İptal);
 * - after `cancelAfterMs` of silence: `cancel`, once (the caller cancels the
 *   native render through the normal path and waits for the promise);
 * - a progress event clears the warning and restarts both clocks;
 * - once the user pressed İptal, or the render ended, the watchdog is silent.
 */
/**
 * Monotonic milliseconds: a wall-clock step (manual change, network time)
 * must not read as 150 s of silence in a healthy render.
 */
export const monotonicNow = (): number =>
  globalThis.performance?.now?.() ?? Date.now();

export const WARN_AFTER_MS = 30_000;
/** A cancel that has not settled this long gets its own honest line. */
export const CANCEL_SLOW_AFTER_MS = 30_000;
export const STALL_AFTER_MS = 180_000;
/** The simulator QA build is slow: the same rule with a longer budget. */
export const STALL_AFTER_MS_QA = 600_000;

/** How long a silent render may run before it is cancelled. */
export function stallBudgetMs(slowQaBuild: boolean): number {
  return slowQaBuild ? STALL_AFTER_MS_QA : STALL_AFTER_MS;
}

export type WatchdogPhase =
  | "idle"
  | "running"
  /** İptal pressed by the user, or the watchdog's own cancel was issued. */
  | "cancelling"
  | "finished";

export type WatchdogVerdict = {
  /** Show the quiet "taking longer than expected" note. */
  warning: boolean;
  /** Cancel the render now (true once per render). */
  cancel: boolean;
  /** Milliseconds since the last sign of life (0 when not running). */
  quietMs: number;
};

export type WatchdogOptions = {
  now: () => number;
  warnAfterMs?: number;
  cancelAfterMs?: number;
};

export function createRenderWatchdog(options: WatchdogOptions) {
  const warnAfter = options.warnAfterMs ?? WARN_AFTER_MS;
  const cancelAfter = options.cancelAfterMs ?? STALL_AFTER_MS;
  let phase: WatchdogPhase = "idle";
  let lastMove = 0;
  let stalled = false;

  const quiet = () => Math.max(0, options.now() - lastMove);

  return {
    /** The render begins: both clocks start now. */
    start() {
      phase = "running";
      lastMove = options.now();
      stalled = false;
    },
    /** A progress event arrived: the render is alive. */
    feed() {
      if (phase === "running") lastMove = options.now();
    },
    /** The user pressed İptal: nothing more to warn about or cancel. */
    cancelPressed() {
      if (phase === "running") phase = "cancelling";
    },
    /** The render promise settled (done, failed or cancelled). */
    finish() {
      phase = "finished";
    },
    /** Ask what to do now; call about once a second while rendering. */
    check(): WatchdogVerdict {
      if (phase !== "running") return { warning: false, cancel: false, quietMs: 0 };
      const quietMs = quiet();
      if (quietMs >= cancelAfter) {
        // Cancelling is issued once; from here on the UI says "Cancelling".
        phase = "cancelling";
        stalled = true;
        return { warning: false, cancel: true, quietMs };
      }
      return { warning: quietMs >= warnAfter, cancel: false, quietMs };
    },
    /** True when the watchdog (not the user) cancelled this render. */
    get stalled() {
      return stalled;
    },
    get phase(): WatchdogPhase {
      return phase;
    },
  };
}

export type RenderWatchdog = ReturnType<typeof createRenderWatchdog>;
