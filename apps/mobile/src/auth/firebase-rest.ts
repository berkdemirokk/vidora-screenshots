/**
 * Firebase Auth over REST. Pure: fetch and the timeout are injected, nothing
 * from expo or react-native is imported. Passwords and tokens are never
 * logged; `AuthError.raw` carries only the bare Firebase code.
 */
import type { Lang } from "../i18n/lang.ts";
import { ENDPOINTS, FIREBASE, LIMITS } from "./config.ts";

export type AuthErrorCode =
  | "emailInUse"
  | "badCredentials"
  | "weakPassword"
  | "tooManyAttempts"
  | "disabled"
  | "needsRecentLogin"
  | "sessionExpired"
  | "invalidEmail"
  | "appleFailed"
  | "appleRejected"
  | "offline"
  | "timeout"
  | "unknown";

export const AUTH_ERROR_CODES: readonly AuthErrorCode[] = [
  "emailInUse",
  "badCredentials",
  "weakPassword",
  "tooManyAttempts",
  "disabled",
  "needsRecentLogin",
  "sessionExpired",
  "invalidEmail",
  "appleFailed",
  "appleRejected",
  "offline",
  "timeout",
  "unknown",
];

export class AuthError extends Error {
  code: AuthErrorCode;
  /** Bare Firebase code such as EMAIL_EXISTS; never a message or a value. */
  raw?: string;
  constructor(code: AuthErrorCode, raw?: string) {
    super(code);
    this.name = "AuthError";
    this.code = code;
    this.raw = raw;
  }
}

const FIREBASE_CODES: Record<string, AuthErrorCode> = {
  EMAIL_EXISTS: "emailInUse",
  INVALID_LOGIN_CREDENTIALS: "badCredentials",
  EMAIL_NOT_FOUND: "badCredentials",
  INVALID_PASSWORD: "badCredentials",
  WEAK_PASSWORD: "weakPassword",
  PASSWORD_DOES_NOT_MEET_REQUIREMENTS: "weakPassword",
  INVALID_EMAIL: "invalidEmail",
  MISSING_EMAIL: "invalidEmail",
  TOO_MANY_ATTEMPTS_TRY_LATER: "tooManyAttempts",
  USER_DISABLED: "disabled",
  CREDENTIAL_TOO_OLD_LOGIN_AGAIN: "needsRecentLogin",
  TOKEN_EXPIRED: "sessionExpired",
  INVALID_REFRESH_TOKEN: "sessionExpired",
  INVALID_ID_TOKEN: "sessionExpired",
  USER_NOT_FOUND: "sessionExpired",
  // signInWithIdp: the Apple token was refused, or Apple login is not switched on
  INVALID_IDP_RESPONSE: "appleRejected",
  INVALID_CREDENTIAL: "appleRejected",
  OPERATION_NOT_ALLOWED: "appleRejected",
};

/** Bare code of a Firebase message: "WEAK_PASSWORD : Password should..." gives WEAK_PASSWORD. */
export function firebaseCodeOf(message?: string): string {
  if (typeof message !== "string") return "";
  return message.split(" : ")[0].trim().toUpperCase();
}

export function mapFirebaseError(message?: string): AuthErrorCode {
  return FIREBASE_CODES[firebaseCodeOf(message)] ?? "unknown";
}

// ---- client-side validation -------------------------------------------------

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Shape check only; Firebase has the last word. */
export function isValidEmail(email: string): boolean {
  const e = normalizeEmail(email);
  return e.length <= LIMITS.emailMax && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

export function validateEmail(email: string): AuthErrorCode | null {
  return isValidEmail(email) ? null : "invalidEmail";
}

/**
 * Sign-up: 8..128 characters, not trimmed. Sign-in and delete re-auth never
 * check length (an older password must still work).
 */
export function validatePassword(
  password: string,
  mode: "signUp" | "signIn",
): AuthErrorCode | null {
  if (mode === "signIn") return null;
  if (password.length < LIMITS.passwordMin) return "weakPassword";
  if (password.length > LIMITS.passwordMax) return "weakPassword";
  return null;
}

// ---- transport --------------------------------------------------------------

export type Deps = { fetch?: typeof fetch; timeoutMs?: number };

export type Tokens = {
  idToken: string;
  refreshToken: string;
  expiresInSec: number;
  uid: string;
  /** Only from signInWithIdp; Apple may hide or omit it (private relay). */
  email?: string;
};

type Json = Record<string, unknown>;

async function send(
  url: string,
  body: string,
  contentType: string,
  d: Deps | undefined,
  extraHeaders?: Record<string, string>,
): Promise<Json> {
  const doFetch = d?.fetch ?? fetch;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, d?.timeoutMs ?? LIMITS.requestTimeoutMs);
  try {
    let res: Response;
    try {
      res = await doFetch(`${url}?key=${FIREBASE.apiKey}`, {
        method: "POST",
        headers: {
          "Content-Type": contentType,
          "X-Ios-Bundle-Identifier": FIREBASE.bundleId,
          ...extraHeaders,
        },
        body,
        signal: controller.signal,
      });
    } catch (e) {
      const aborted = (e as { name?: string } | null)?.name === "AbortError";
      throw new AuthError(timedOut || aborted ? "timeout" : "offline");
    }
    let text: string;
    try {
      text = await res.text();
    } catch {
      throw new AuthError(timedOut ? "timeout" : "offline");
    }
    let json: Json | null = null;
    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed && typeof parsed === "object") json = parsed as Json;
    } catch {
      json = null;
    }
    if (!res.ok) {
      const err = json?.error as { message?: unknown } | undefined;
      const message = typeof err?.message === "string" ? err.message : undefined;
      const code = firebaseCodeOf(message);
      throw new AuthError(
        mapFirebaseError(message),
        /^[A-Z0-9_]+$/.test(code) ? code : undefined,
      );
    }
    return json ?? {};
  } finally {
    clearTimeout(timer);
  }
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function tokensFrom(j: Json): Tokens {
  const idToken = str(j.idToken);
  const refreshToken = str(j.refreshToken);
  const uid = str(j.localId);
  const expiresInSec = Number(j.expiresIn);
  if (!idToken || !refreshToken || !uid || !Number.isFinite(expiresInSec) || expiresInSec <= 0)
    throw new AuthError("unknown");
  return { idToken, refreshToken, expiresInSec, uid };
}

export async function signUp(email: string, password: string, d?: Deps): Promise<Tokens> {
  const j = await send(
    ENDPOINTS.signUp,
    JSON.stringify({ email: normalizeEmail(email), password, returnSecureToken: true }),
    "application/json",
    d,
  );
  return tokensFrom(j);
}

export async function signIn(email: string, password: string, d?: Deps): Promise<Tokens> {
  const j = await send(
    ENDPOINTS.signIn,
    JSON.stringify({ email: normalizeEmail(email), password, returnSecureToken: true }),
    "application/json",
    d,
  );
  return tokensFrom(j);
}

export async function refresh(refreshToken: string, d?: Deps): Promise<Tokens> {
  const form = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  }).toString();
  const j = await send(ENDPOINTS.token, form, "application/x-www-form-urlencoded", d);
  const idToken = str(j.id_token);
  const next = str(j.refresh_token);
  const uid = str(j.user_id);
  const expiresInSec = Number(j.expires_in);
  if (!idToken || !next || !uid || !Number.isFinite(expiresInSec) || expiresInSec <= 0)
    throw new AuthError("unknown");
  return { idToken, refreshToken: next, expiresInSec, uid };
}

export async function deleteAccount(idToken: string, d?: Deps): Promise<void> {
  await send(ENDPOINTS.deleteAccount, JSON.stringify({ idToken }), "application/json", d);
}

/**
 * Resolves the same way for registered and unknown addresses. With Firebase
 * email-enumeration protection on, the server already does; without it, an
 * unknown address answers EMAIL_NOT_FOUND, which is swallowed here so the
 * screen never reveals whether an account exists.
 */
export async function sendPasswordReset(
  email: string,
  locale: Lang,
  d?: Deps,
): Promise<void> {
  try {
    await send(
      ENDPOINTS.sendOobCode,
      JSON.stringify({ requestType: "PASSWORD_RESET", email: normalizeEmail(email) }),
      "application/json",
      d,
      { "X-Firebase-Locale": locale },
    );
  } catch (e) {
    if (e instanceof AuthError && e.raw === "EMAIL_NOT_FOUND") return;
    throw e;
  }
}

/**
 * Sign in with Apple. `rawNonce` is the UNHASHED nonce: Apple's token carries
 * its SHA-256, and Firebase hashes this value to compare. An answer without
 * tokens (needConfirmation: the email belongs to a password account) is
 * reported as emailInUse.
 */
export async function signInWithApple(
  identityToken: string,
  rawNonce: string,
  d?: Deps,
): Promise<Tokens> {
  if (!identityToken || !rawNonce) throw new AuthError("appleFailed");
  const postBody = `id_token=${encodeURIComponent(identityToken)}&providerId=apple.com&nonce=${encodeURIComponent(rawNonce)}`;
  const j = await send(
    ENDPOINTS.signInWithIdp,
    JSON.stringify({
      postBody,
      requestUri: "http://localhost",
      returnSecureToken: true,
      returnIdpCredential: true,
    }),
    "application/json",
    d,
  );
  if (j.needConfirmation === true) throw new AuthError("emailInUse", "NEED_CONFIRMATION");
  const t = tokensFrom(j);
  const email = str(j.email);
  return email ? { ...t, email: normalizeEmail(email) } : t;
}
