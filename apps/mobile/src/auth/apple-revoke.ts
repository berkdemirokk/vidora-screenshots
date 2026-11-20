/**
 * Client of the Apple token worker (workers/apple-revoke). Apple requires an
 * app that offers Sign in with Apple to revoke the user's token when the
 * account is deleted; that needs a secret, so it runs in a worker. When the
 * worker URL is empty there is no client and both steps are skipped.
 * Pure: fetch is injected. Tokens are never logged.
 */
import { LIMITS } from "./config.ts";

export type AppleRevoke = {
  /** authorizationCode -> Apple refresh token, or null when it could not be had. */
  exchange(authorizationCode: string): Promise<string | null>;
  /** Resolves true when Apple confirmed; never throws. */
  revoke(appleRefreshToken: string): Promise<boolean>;
};

export function createAppleRevoke(
  baseUrl: string,
  doFetch: typeof fetch = fetch,
  timeoutMs: number = LIMITS.requestTimeoutMs,
): AppleRevoke | null {
  const base = baseUrl.trim().replace(/\/+$/, "");
  if (!/^https:\/\//.test(base)) return null;

  async function post(path: string, body: Record<string, string>) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await doFetch(`${base}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async exchange(authorizationCode) {
      try {
        const res = await post("/exchange", { authorizationCode });
        if (!res.ok) return null;
        const j = (await res.json()) as { refresh_token?: unknown } | null;
        return typeof j?.refresh_token === "string" && j.refresh_token ? j.refresh_token : null;
      } catch {
        return null;
      }
    },
    async revoke(appleRefreshToken) {
      try {
        return (await post("/revoke", { refresh_token: appleRefreshToken })).ok;
      } catch {
        return false;
      }
    },
  };
}
