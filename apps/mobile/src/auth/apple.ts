/**
 * Sign in with Apple, pure core. The native module and the crypto helpers are
 * injected (apple-native.ts wires the real ones), so node --test runs it
 * offline. The RAW nonce goes to Firebase; only its SHA-256 goes to Apple.
 * Nothing here is ever logged.
 */
import { AuthError } from "./firebase-rest.ts";

export type AppleCredential = {
  identityToken: string;
  /** Unhashed nonce: what Firebase must receive. */
  rawNonce: string;
  /** One-time code (5 minutes) for the revoke worker; may be missing. */
  authorizationCode: string | null;
};

export type AppleDeps = {
  /** 32 random bytes as hex. */
  randomNonce: () => string;
  /** Lowercase hex SHA-256 of a string. */
  sha256: (value: string) => Promise<string>;
  /** AppleAuthentication.signInAsync with the scopes already chosen. */
  signIn: (opts: { nonce: string }) => Promise<{
    identityToken?: string | null;
    authorizationCode?: string | null;
  }>;
};

export const APPLE_CANCELED = "ERR_REQUEST_CANCELED";

export function isAppleCanceled(e: unknown): boolean {
  return (e as { code?: unknown } | null)?.code === APPLE_CANCELED;
}

/**
 * Runs one Apple sign-in. Resolves null when the user cancelled (silent: no
 * error is shown). Any other failure throws AuthError("appleFailed").
 */
export async function runAppleSignIn(d: AppleDeps): Promise<AppleCredential | null> {
  const rawNonce = d.randomNonce();
  let credential: Awaited<ReturnType<AppleDeps["signIn"]>>;
  try {
    const hashed = await d.sha256(rawNonce);
    credential = await d.signIn({ nonce: hashed });
  } catch (e) {
    if (isAppleCanceled(e)) return null;
    throw new AuthError("appleFailed");
  }
  const identityToken = credential.identityToken;
  if (typeof identityToken !== "string" || !identityToken) throw new AuthError("appleFailed");
  const code = credential.authorizationCode;
  return {
    identityToken,
    rawNonce,
    authorizationCode: typeof code === "string" && code ? code : null,
  };
}
