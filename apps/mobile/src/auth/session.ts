/**
 * Auth session. Pure: secure storage (Keychain), sandbox storage (app file),
 * the Firebase REST calls and the clock are all injected, so node --test runs
 * it offline. Nothing here touches the network at launch. The refresh token
 * is the only secret that is ever persisted, and only through `store`; the id
 * token lives in memory. Passwords are passed straight to `api` and dropped.
 */
import { LIMITS, SANDBOX_KEYS, SECURE_KEYS } from "./config.ts";
import { AuthError, normalizeEmail } from "./firebase-rest.ts";
import type * as Rest from "./firebase-rest.ts";
import type { AppleCredential } from "./apple.ts";
import type { AppleRevoke } from "./apple-revoke.ts";

export type Provider = "apple" | "password";

export type Session =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; uid: string; email: string; provider: Provider; offline: boolean };

export type Action =
  | { t: "restored"; uid: string; email: string; provider?: Provider }
  | { t: "none" }
  | { t: "signedIn"; uid: string; email: string; provider?: Provider }
  | { t: "signedOut" }
  | { t: "offline"; on: boolean };

export const INITIAL_SESSION: Session = { status: "loading" };

/** Returns the same object when nothing changes. */
export function reduce(s: Session, a: Action): Session {
  switch (a.t) {
    case "restored":
      return s.status === "loading"
        ? { status: "signedIn", uid: a.uid, email: a.email, provider: a.provider ?? "password", offline: false }
        : s;
    case "none":
      return s.status === "loading" ? { status: "signedOut" } : s;
    case "signedIn":
      return { status: "signedIn", uid: a.uid, email: a.email, provider: a.provider ?? "password", offline: false };
    case "signedOut":
      return s.status === "signedOut" ? s : { status: "signedOut" };
    case "offline":
      return s.status === "signedIn" && s.offline !== a.on ? { ...s, offline: a.on } : s;
  }
}

export type KV = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
};

/** Shown once on the account screen. */
export type Notice = "sessionExpired" | "deleteIncomplete";

export type AuthApi = Pick<
  typeof Rest,
  "signIn" | "signUp" | "refresh" | "deleteAccount"
> &
  Partial<Pick<typeof Rest, "signInWithApple">>;

export type Auth = {
  /** Restores the stored session. Makes no network call. Safe to call twice. */
  start(): Promise<void>;
  signUp(email: string, password: string): Promise<void>;
  signIn(email: string, password: string): Promise<void>;
  /** Sign in with Apple (credential from apple.ts). Optionally exchanges the code for revocation. */
  signInApple(credential: AppleCredential): Promise<void>;
  /** Local only: clears secure storage and memory. No server call. */
  signOut(): Promise<void>;
  /**
   * Password users re-authenticate with the password first; Apple users with a
   * fresh id token from the refresh token (no password). Throws AuthError,
   * session kept on failure.
   */
  deleteAccount(password?: string): Promise<void>;
  /**
   * A valid id token or null (signed out, or refresh failed offline). Single
   * flight. After a failed refresh, further calls return null without a
   * request for a short cooldown. `force` drops the cached id token and the
   * cooldown (use it once after a 401, then retry the request).
   */
  getIdToken(opts?: { force?: boolean }): Promise<string | null>;
  /** null: the sandbox file could not be read. */
  getWelcomeDismissed(): Promise<boolean | null>;
  dismissWelcome(): Promise<void>;
  getSession(): Session;
};

type Stored = { refreshToken: string; uid: string; email: string; provider: Provider };

function parseStored(raw: string | null): Stored | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<Stored> | null;
    if (
      v &&
      typeof v.refreshToken === "string" &&
      v.refreshToken &&
      typeof v.uid === "string" &&
      v.uid &&
      typeof v.email === "string"
    )
      return {
        refreshToken: v.refreshToken,
        uid: v.uid,
        email: v.email,
        // Records written before 1.1 have no provider: they are password accounts.
        provider: v.provider === "apple" ? "apple" : "password",
      };
  } catch {
    // corrupt record: treated as none
  }
  return null;
}

export function createAuth(opts: {
  store: KV;
  sandbox: KV;
  api: AuthApi;
  now?: () => number;
  onChange: (s: Session) => void;
  onNotice?: (n: Notice) => void;
  /** Null/absent: Apple code exchange and revoke are skipped. */
  appleRevoke?: AppleRevoke | null;
}): Auth {
  const { store, sandbox, api, onChange } = opts;
  const now = opts.now ?? Date.now;

  let session: Session = INITIAL_SESSION;
  /** Bumped by every sign-in, sign-out and deletion; stale refreshes are dropped. */
  let generation = 0;
  let identity: { uid: string; email: string; provider: Provider } | null = null;
  let refreshToken: string | null = null;
  let access: { idToken: string; expMs: number } | null = null;
  let inflight: Promise<string | null> | null = null;
  let starting: Promise<void> | null = null;
  /** True once the launch marker is known to be in the sandbox file. */
  let markerOk = false;
  /** Refresh backoff: no request before retryAt after a failure. */
  let failures = 0;
  let retryAt = 0;
  /** Keychain writes run one at a time, in call order. */
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T,>(fn: () => Promise<T>): Promise<T> => {
    const p = queue.then(fn);
    queue = p.catch(() => undefined);
    return p;
  };

  const dispatch = (a: Action) => {
    const next = reduce(session, a);
    if (next !== session) {
      session = next;
      onChange(next);
    }
  };

  const safe = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      return true;
    } catch {
      return false;
    }
  };

  /**
   * Makes the Keychain record equal the current memory (set, or delete when
   * signed out). The job reads memory when it runs, not when it was queued, so
   * a late write of an earlier account can never land after a later one.
   */
  const persist = () =>
    serial(() =>
      safe(() =>
        identity && refreshToken
          ? store.set(
              SECURE_KEYS.session,
              JSON.stringify({
                refreshToken,
                uid: identity!.uid,
                email: identity!.email,
                provider: identity!.provider,
              }),
            )
          : store.del(SECURE_KEYS.session),
      ),
    );

  const noteMarker = async () => {
    if (!markerOk) markerOk = await safe(() => sandbox.set(SANDBOX_KEYS.launched, "1"));
  };

  const clearMemory = () => {
    generation++;
    identity = null;
    refreshToken = null;
    access = null;
    inflight = null;
    failures = 0;
    retryAt = 0;
  };

  const clearSecure = async (opts2: { pending: boolean }) => {
    await persist(); // memory is already empty: deletes the record (or keeps a newer account's)
    await safe(() => store.del(SECURE_KEYS.appleRevoke));
    if (opts2.pending) await safe(() => store.del(SECURE_KEYS.pendingDelete));
  };

  const adopt = async (t: Rest.Tokens, email: string, provider: Provider = "password") => {
    clearMemory();
    identity = { uid: t.uid, email: normalizeEmail(email), provider };
    refreshToken = t.refreshToken;
    access = { idToken: t.idToken, expMs: now() + t.expiresInSec * 1000 };
    const email2 = identity.email;
    await persist();
    await safe(() => store.del(SECURE_KEYS.pendingDelete));
    await safe(() => store.del(SECURE_KEYS.appleRevoke)); // never keep a previous account's token
    await noteMarker(); // a lost launch marker must not sign this user out at the next launch
    dispatch({ t: "signedIn", uid: t.uid, email: email2, provider });
  };

  async function doStart() {
    // A sign-in, sign-up or sign-out that completes while this runs wins.
    const gen = generation;
    // 1. Stale Keychain after reinstall: the sandbox marker is gone with the
    // app, the Keychain is not. Wipe only when the marker is missing AND the
    // sandbox was readable; an unreadable file must never log anyone out.
    let wiped = true;
    let markerRead = true;
    let marker: string | null = null;
    try {
      marker = await sandbox.get(SANDBOX_KEYS.launched);
    } catch {
      markerRead = false;
    }
    if (markerRead && marker !== null) markerOk = true;
    if (markerRead && marker === null) {
      const a = await persist();
      const b = await safe(() => store.del(SECURE_KEYS.pendingDelete));
      wiped = a && b;
      // Only a completed wipe is recorded; a failed one is retried next launch.
      if (wiped && gen === generation) await noteMarker();
    }
    if (gen !== generation) return;
    if (!wiped) return dispatch({ t: "none" });

    // 2. A deletion that was killed halfway: signed out, tell the user once.
    let pending: string | null = null;
    try {
      pending = await store.get(SECURE_KEYS.pendingDelete);
    } catch {
      pending = null;
    }
    if (gen !== generation) return;
    if (pending) {
      await clearSecure({ pending: false });
      await safe(() => store.del(SECURE_KEYS.pendingDelete));
      dispatch({ t: "none" });
      opts.onNotice?.("deleteIncomplete");
      return;
    }

    // 3. Restore from the refresh token. No network: the id token is fetched
    // on first use by getIdToken.
    let stored: Stored | null = null;
    try {
      stored = parseStored(await store.get(SECURE_KEYS.session));
    } catch {
      stored = null;
    }
    if (gen !== generation) return;
    if (!stored) return dispatch({ t: "none" });
    identity = { uid: stored.uid, email: stored.email, provider: stored.provider };
    refreshToken = stored.refreshToken;
    dispatch({ t: "restored", uid: stored.uid, email: stored.email, provider: stored.provider });
  }

  async function refreshNow(): Promise<string | null> {
    const gen = generation;
    const rt = refreshToken;
    if (!rt) return null;
    let t: Rest.Tokens;
    try {
      t = await api.refresh(rt);
    } catch (e) {
      if (gen !== generation) return null;
      const code = e instanceof AuthError ? e.code : "unknown";
      if (code === "sessionExpired" || code === "disabled") {
        clearMemory();
        await clearSecure({ pending: false });
        dispatch({ t: "signedOut" });
        opts.onNotice?.("sessionExpired");
        return null;
      }
      // offline, timeout, unknown: keep the session, caller skips quietly,
      // and no new request is made for a growing cooldown (10, 20, 30 s).
      failures++;
      retryAt = now() + Math.min(failures, 3) * LIMITS.refreshRetryMs;
      dispatch({ t: "offline", on: true });
      return null;
    }
    if (gen !== generation) return null;
    access = { idToken: t.idToken, expMs: now() + t.expiresInSec * 1000 };
    refreshToken = t.refreshToken;
    // The (possibly rotated) refresh token is persisted before anyone gets the id token.
    failures = 0;
    retryAt = 0;
    // Persist runs in order and mirrors memory, so a sign-out or another
    // account that arrives meanwhile is never overwritten by this write.
    await persist();
    if (gen !== generation) return null;
    dispatch({ t: "offline", on: false });
    return t.idToken;
  }

  const auth: Auth = {
    start() {
      starting ??= doStart();
      return starting;
    },

    async signUp(email, password) {
      await adopt(await api.signUp(email, password), email);
    },

    async signIn(email, password) {
      await adopt(await api.signIn(email, password), email);
    },

    async signInApple(credential) {
      if (!api.signInWithApple) throw new AuthError("appleFailed");
      const t = await api.signInWithApple(credential.identityToken, credential.rawNonce);
      await adopt(t, t.email ?? "", "apple");
      // Revocation token: only when the worker is configured, never blocks sign-in.
      const revoker = opts.appleRevoke;
      if (revoker && credential.authorizationCode) {
        const gen = generation;
        const apple = await revoker.exchange(credential.authorizationCode);
        if (apple && gen === generation)
          await safe(() => store.set(SECURE_KEYS.appleRevoke, apple));
      }
    },

    async signOut() {
      clearMemory();
      await clearSecure({ pending: true });
      dispatch({ t: "signedOut" });
    },

    async deleteAccount(password) {
      if (session.status !== "signedIn" || !identity) throw new AuthError("sessionExpired");
      const email = identity.email;
      const apple = identity.provider === "apple";
      // Apple users have no password: a fresh id token from the refresh token.
      const reauth = async () => {
        if (!apple) return api.signIn(email, password ?? "");
        if (!refreshToken) throw new AuthError("sessionExpired");
        return api.refresh(refreshToken);
      };
      // 1. Re-authenticate (wrong password stops here, also gives a fresh token).
      let t = await reauth();
      await safe(() => store.set(SECURE_KEYS.pendingDelete, "1"));
      let retried = false;
      for (;;) {
        // 2. Delete on the server.
        try {
          await api.deleteAccount(t.idToken);
          break;
        } catch (e) {
          const code = e instanceof AuthError ? e.code : "unknown";
          // Only USER_NOT_FOUND means the account is already gone. A rejected or
          // expired id token (TOKEN_EXPIRED, INVALID_ID_TOKEN) is a failure.
          if (code === "sessionExpired" && e instanceof AuthError && e.raw === "USER_NOT_FOUND")
            break;
          if ((code === "needsRecentLogin" || code === "sessionExpired") && !retried) {
            retried = true;
            t = await reauth().catch(async (e2) => {
              await safe(() => store.del(SECURE_KEYS.pendingDelete));
              throw e2;
            });
            continue;
          }
          // The account may or may not be gone after a timeout or an unknown
          // answer: keep the flag so the next launch says so. Anything else
          // definitely failed: drop the flag, the session stays.
          if (code !== "timeout" && code !== "unknown")
            await safe(() => store.del(SECURE_KEYS.pendingDelete));
          throw e;
        }
      }
      // 3. Gone: revoke the Apple token (best effort), then clear everything local.
      if (apple && opts.appleRevoke) {
        const revoker = opts.appleRevoke;
        await safe(async () => {
          const apt = await store.get(SECURE_KEYS.appleRevoke);
          if (apt) await revoker.revoke(apt);
        });
      }
      clearMemory();
      await clearSecure({ pending: true });
      dispatch({ t: "signedOut" });
    },

    getIdToken(o) {
      if (session.status !== "signedIn" || !refreshToken) return Promise.resolve(null);
      if (o?.force) {
        access = null;
        retryAt = 0;
      }
      if (access && access.expMs - now() > LIMITS.tokenSafetyMarginMs)
        return Promise.resolve(access.idToken);
      if (!inflight) {
        if (now() < retryAt) return Promise.resolve(null);
        const p: Promise<string | null> = refreshNow().finally(() => {
          if (inflight === p) inflight = null;
        });
        inflight = p;
      }
      return inflight;
    },

    async getWelcomeDismissed() {
      try {
        return (await sandbox.get(SANDBOX_KEYS.welcomed)) === "1";
      } catch {
        return null;
      }
    },

    async dismissWelcome() {
      await safe(() => sandbox.set(SANDBOX_KEYS.welcomed, "1"));
    },

    getSession: () => session,
  };
  return auth;
}
