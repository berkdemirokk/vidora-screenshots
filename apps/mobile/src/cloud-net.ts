/**
 * Network and batching logic of AI Sahne without React Native imports, so
 * `node --test` can load it (see cloud.test.mjs). cloud.ts wires it up.
 */
import {
  CloudError,
  SHOT_STYLES,
  errorFromResponse,
  quotaFromHeaders,
  shotFields,
  type CloudQuota,
} from "./cloud-rules.ts";
import type { CategoryId } from "./product-catalog";

export type SceneAnswer = { jpeg: Uint8Array; quota: CloudQuota | null };

/**
 * One POST: the JPEG bytes and quota headers. The timer runs until the body
 * is fully read; a timeout (abort) is "upstream-failed", a network error is
 * "offline".
 */
export async function postForJpeg(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<SceneAnswer> {
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new CloudError("upstream-failed"));
    }, timeoutMs);
  });
  deadline.catch(() => {});
  const guard = <T>(work: Promise<T>): Promise<T> =>
    Promise.race([work, deadline]);
  try {
    let response: Response;
    try {
      response = await guard(
        fetchFn(url, { ...init, signal: controller.signal }),
      );
    } catch (error) {
      if (error instanceof CloudError) throw error;
      throw new CloudError(timedOut ? "upstream-failed" : "offline");
    }
    const get = (name: string) => response.headers.get(name);
    if (!response.ok) {
      const failure: unknown = await guard(
        response.json().catch(() => null),
      ).catch(() => null);
      throw errorFromResponse(response.status, failure, get);
    }
    let jpeg: Uint8Array;
    try {
      // New worker: JSON { image: base64 } (no CPU-heavy decode on the Free
      // plan). Old worker: raw image bytes.
      if ((get("content-type") ?? "").includes("application/json")) {
        const body: unknown = await guard(response.json());
        const image = (body as { image?: unknown } | null)?.image;
        if (typeof image !== "string") throw new CloudError("failed");
        jpeg = Uint8Array.from(atob(image), (c) => c.charCodeAt(0));
      } else {
        jpeg = new Uint8Array(await guard(response.arrayBuffer()));
      }
    } catch (error) {
      if (error instanceof CloudError) throw error;
      // atob/json parse failures are a bad answer, not a network problem.
      if (error instanceof SyntaxError || (error as Error)?.name === "InvalidCharacterError")
        throw new CloudError("failed");
      throw new CloudError(timedOut ? "upstream-failed" : "offline");
    }
    // JPEG starts FF D8 FF, PNG 89 50 4E 47; anything else is not usable.
    const jpegSig = jpeg[0] === 0xff && jpeg[1] === 0xd8 && jpeg[2] === 0xff;
    const pngSig = jpeg[0] === 0x89 && jpeg[1] === 0x50 && jpeg[2] === 0x4e && jpeg[3] === 0x47;
    if (jpeg.length < 1000 || !(jpegSig || pngSig)) throw new CloudError("failed");
    return { jpeg, quota: quotaFromHeaders(get) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Makes `count` scenes one after another. The first failure throws; a later
 * one stops the loop and comes back as `error` next to the scenes made, with
 * the quota of the failed answer when it carried one.
 */
export async function collectScenes<T>(
  count: number,
  make: (index: number) => Promise<{ item: T; quota: CloudQuota | null }>,
): Promise<{ scenes: T[]; quota: CloudQuota | null; error?: CloudError }> {
  const scenes: T[] = [];
  let quota: CloudQuota | null = null;
  for (let i = 0; i < count; i++) {
    try {
      const made = await make(i);
      scenes.push(made.item);
      quota = made.quota ?? quota;
    } catch (error) {
      if (scenes.length === 0) throw error;
      const failed =
        error instanceof CloudError ? error : new CloudError("failed");
      return { scenes, quota: failed.quota ?? quota, error: failed };
    }
  }
  return { scenes, quota };
}

/**
 * The editorial video's 3 shots (context, hand, macro), one request each,
 * in order; `onStep(i)` before shot i. Only the first `count` are asked
 * for (what is left of today's allowance); the rest stay null. The first
 * failure stops: shots made before it stay (they used today's allowance),
 * the rest are null, and the error comes back for the note. `post` returns
 * the saved file's URI.
 */
export async function requestShots(
  category: CategoryId | null,
  post: (fields: Record<string, string>, index: number) => Promise<string>,
  onStep?: (index: number) => void,
  count: number = SHOT_STYLES.length,
): Promise<{ ai: (string | null)[]; error: CloudError | null }> {
  const ai: (string | null)[] = [null, null, null];
  for (let i = 0; i < Math.min(count, SHOT_STYLES.length); i++) {
    onStep?.(i);
    try {
      ai[i] = await post(shotFields(SHOT_STYLES[i], category), i);
    } catch (error) {
      return {
        ai,
        error: error instanceof CloudError ? error : new CloudError("failed"),
      };
    }
  }
  return { ai, error: null };
}
