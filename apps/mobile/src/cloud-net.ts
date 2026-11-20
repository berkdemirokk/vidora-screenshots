/**
 * Network and batching logic of AI Sahne without React Native imports, so
 * `node --test` can load it (see cloud.test.mjs). cloud.ts wires it up.
 */
import {
  CloudError,
  errorFromResponse,
  quotaFromHeaders,
  type CloudQuota,
} from "./cloud-rules.ts";

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
      jpeg = new Uint8Array(await guard(response.arrayBuffer()));
    } catch (error) {
      if (error instanceof CloudError) throw error;
      throw new CloudError(timedOut ? "upstream-failed" : "offline");
    }
    // A JPEG starts FF D8 FF; anything else is not a usable answer.
    if (jpeg.length < 1000 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8)
      throw new CloudError("failed");
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
