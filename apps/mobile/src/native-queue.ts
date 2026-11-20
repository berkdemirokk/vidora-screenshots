/**
 * One queue for the native preview calls. The product module's `frame`
 * (posters) and `frames` (the editor's playing preview) share one "preview
 * gate": every new call makes the running one fail as stale. So they must
 * never overlap. Jobs run one at a time; "high" jobs (the editor preview) go
 * before queued "low" jobs (posters).
 *
 * Pure (no imports), so it is tested in Node.
 */
/** "high": editor preview; "low": look posters; "idle": other posters. */
export type Priority = "high" | "low" | "idle";

type Job = {
  run: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
};

export function createNativeQueue() {
  const high: Job[] = [],
    low: Job[] = [],
    idle: Job[] = [];
  let running = false;
  function pump() {
    if (running) return;
    const next = high.shift() ?? low.shift() ?? idle.shift();
    if (!next) return;
    running = true;
    let result: Promise<unknown>;
    try {
      result = next.run();
    } catch (error) {
      result = Promise.reject(error);
    }
    result.then(next.resolve, next.reject).finally(() => {
      running = false;
      pump();
    });
  }
  return {
    /** Run `job` when nothing else runs; "high" jobs jump the queue. */
    enqueue<T>(job: () => Promise<T>, priority: Priority = "low"): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        (priority === "high" ? high : priority === "low" ? low : idle).push({
          run: job,
          resolve: resolve as (value: unknown) => void,
          reject,
        });
        pump();
      });
    },
    /** Jobs waiting (not counting the running one). */
    get waiting() {
      return high.length + low.length + idle.length;
    },
  };
}

/** The app-wide queue for native preview calls. */
export const nativePreviewQueue = createNativeQueue();

/** True for the product module's "a newer preview replaced this one" error. */
export function isStaleError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return message.includes("product-preview-stale");
}
