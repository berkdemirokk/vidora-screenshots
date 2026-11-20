/**
 * Firebase Auth client configuration (REST only, no SDK). The web apiKey is a
 * public project identifier, not a secret: it ships inside every client app.
 * Access is controlled by Firebase Auth rules and the key's API restriction
 * (Identity Toolkit + Token Service). Source: docs/giris/firebase.md.
 *
 *   authDomain:        vidora-b9035.firebaseapp.com
 *   appId:             1:775642049897:web:aacf7ced0232bb3cb461f8
 *   messagingSenderId: 775642049897
 */
export const FIREBASE = {
  apiKey: "QA_PLACEHOLDER_FIREBASE_KEY",
  projectId: "vidora-b9035",
  bundleId: "com.berkdemirok.vidora",
} as const;

export const ENDPOINTS = {
  signUp: "https://identitytoolkit.googleapis.com/v1/accounts:signUp",
  signIn: "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword",
  signInWithIdp: "https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp",
  sendOobCode: "https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode",
  deleteAccount: "https://identitytoolkit.googleapis.com/v1/accounts:delete",
  token: "https://securetoken.googleapis.com/v1/token",
} as const;

/**
 * Base URL of the Apple token revoke worker (workers/apple-revoke). Empty by
 * default: sign-in with Apple then skips the code exchange, and deleting the
 * account skips the revoke call (the Firebase account and local data are
 * still deleted). Example: "https://vidora-apple-revoke.<account>.workers.dev".
 */
export const APPLE_REVOKE_URL = "";

/** Secure storage keys (Keychain, WHEN_UNLOCKED_THIS_DEVICE_ONLY). */
export const SECURE_KEYS = {
  session: "vidora.auth.v1",
  pendingDelete: "vidora.auth.pending",
  /** Apple refresh token for revocation; only stored when APPLE_REVOKE_URL is set. */
  appleRevoke: "vidora.auth.apple",
} as const;

/** Keys inside the app sandbox file (vidora-auth-local.json). */
export const SANDBOX_KEYS = {
  launched: "launched.v1",
  welcomed: "welcomed.v1",
} as const;

export const LIMITS = {
  requestTimeoutMs: 15_000,
  /** A cached id token this close to expiry is refreshed first. */
  tokenSafetyMarginMs: 120_000,
  /** Base wait after a failed refresh before the next request (x1, x2, x3). */
  refreshRetryMs: 10_000,
  /** Sign-up only; sign-in and delete never check length. */
  passwordMin: 8,
  passwordMax: 128,
  emailMax: 254,
  /** Seconds a button stays disabled after TOO_MANY_ATTEMPTS / a reset mail. */
  tooManyAttemptsCooldownSec: 60,
  resetResendCooldownSec: 60,
} as const;
