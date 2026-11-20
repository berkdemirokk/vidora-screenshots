/**
 * When the editor asks the renderer for preview frames. Pure (timers are
 * injected), so the sequence "cut-out arrives, backdrop resolves, frames are
 * requested for the final spec" is tested in Node.
 *
 * - Each change waits `debounceMs`; only the last spec of a burst is drawn.
 * - A quick pass comes first, then the full pass (when `twoPasses`).
 * - A pass that brings nothing back (cancelled as stale, or a passing native
 *   error) for a valid spec is retried after `retryMs`, up to `maxRetries`
 *   times. Before this, a cancelled first pass left the editor on a still
 *   picture until the next edit (QA run 13).
 */
export type PreviewPass = "quick" | "full";

export type PreviewScheduleOptions<S> = {
  request: (spec: S, pass: PreviewPass) => Promise<string[] | null>;
  onFrames: (spec: S, uris: string[]) => void;
  onUpdating: (busy: boolean) => void;
  /** False for specs the renderer refuses; those are not retried. */
  isValid: (spec: S) => boolean;
  twoPasses: () => boolean;
  debounceMs: number;
  retryMs: number;
  maxRetries: number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  /** A pass came back empty and is tried again (`tries` so far). */
  onRetry?: (tries: number) => void;
  /** Retries used up without a full set of frames. */
  onGiveUp?: () => void; /** Retries used up and this spec got no frames at all. */
  onFailed?: () => void;
};

export function createPreviewSchedule<S>(options: PreviewScheduleOptions<S>) {
  let token = 0;
  let timer: unknown = null;
  const later = (fn: () => void, ms: number) => {
    if (timer !== null) options.clearTimer(timer);
    timer = options.setTimer(() => {
      timer = null;
      fn();
    }, ms);
  };
  const attempt = async (
    mine: number,
    spec: S,
    tries: number,
    shownQuick: boolean,
  ) => {
    const current = () => mine === token;
    const ask = async (pass: PreviewPass) => {
      try {
        return await options.request(spec, pass);
      } catch {
        return null;
      }
    };
    let quick = shownQuick;
    if (!quick) {
      const uris = await ask("quick");
      if (!current()) return;
      if (uris && uris.length > 0) {
        options.onFrames(spec, uris);
        quick = true;
      }
    }
    let full = !options.twoPasses();
    if (!full && quick) {
      const uris = await ask("full");
      if (!current()) return;
      if (uris && uris.length > 0) {
        options.onFrames(spec, uris);
        full = true;
      }
    }
    if (
      (!quick || !full) &&
      options.isValid(spec) &&
      tries < options.maxRetries
    ) {
      options.onRetry?.(tries + 1);
      later(() => void attempt(mine, spec, tries + 1, quick), options.retryMs);
      return;
    }
    if (!quick || !full) options.onGiveUp?.();
    if (!quick) options.onFailed?.();
    options.onUpdating(false);
  };
  return {
    /** A new spec (null clears). Only the last one of a burst is drawn. */
    update(spec: S | null) {
      token++;
      const mine = token;
      if (timer !== null) {
        options.clearTimer(timer);
        timer = null;
      }
      if (spec === null) {
        options.onUpdating(false);
        return;
      }
      options.onUpdating(true);
      later(() => void attempt(mine, spec, 0, false), options.debounceMs);
    },
    dispose() {
      token++;
      if (timer !== null) options.clearTimer(timer);
      timer = null;
    },
  };
}
