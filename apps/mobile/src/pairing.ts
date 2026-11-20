import * as SecureStore from "expo-secure-store";

export const PRIVACY_URL = "https://berkdemirokk.github.io/vidora/privacy";
export const SUPPORT_URL = "https://berkdemirokk.github.io/vidora/support";

export const PAIRING_PLACEHOLDER = "https://studio.example.ts.net";

const BASE_KEY = "pairing.base";
const TOKEN_KEY = "pairing.token";
const STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export type PairingCredentials = { base: string; token: string };

/** Reason codes so the screen can render a bilingual message. */
export type AddressProblem =
  | "empty"
  | "invalid"
  | "not_https"
  | "loopback"
  | "has_path"
  | "has_credentials";

export type AddressCheck =
  { ok: true; base: string } | { ok: false; problem: AddressProblem };

const LOOPBACK_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
  "0.0.0.0",
]);

/**
 * Trim, strip trailing slashes and validate a workstation address.
 * Only HTTPS origins on a non-loopback host are accepted: on an iPhone,
 * localhost is the phone itself and plain HTTP is blocked by ATS.
 */
export function checkAddress(input: string): AddressCheck {
  const trimmed = input.trim().replace(/\/+$/, "");
  if (!trimmed) return { ok: false, problem: "empty" };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, problem: "invalid" };
  }
  if (!url.hostname) return { ok: false, problem: "invalid" };
  if (url.protocol !== "https:") return { ok: false, problem: "not_https" };
  const host = url.hostname.toLowerCase();
  if (LOOPBACK_HOSTS.has(host) || host.startsWith("127."))
    return { ok: false, problem: "loopback" };
  if (url.username || url.password)
    return { ok: false, problem: "has_credentials" };
  if ((url.pathname && url.pathname !== "/") || url.search || url.hash)
    return { ok: false, problem: "has_path" };
  return { ok: true, base: url.origin };
}

/** True when an api() error indicates the access key was rejected. */
export function isAuthError(error: unknown): boolean {
  const text = String(error);
  return /\bHTTP (401|403)\b/.test(text);
}

export async function loadPairing(): Promise<Partial<PairingCredentials>> {
  const [base, token] = await Promise.all([
    SecureStore.getItemAsync(BASE_KEY, STORE_OPTIONS),
    SecureStore.getItemAsync(TOKEN_KEY, STORE_OPTIONS),
  ]);
  return { base: base ?? undefined, token: token ?? undefined };
}

export async function savePairing({
  base,
  token,
}: PairingCredentials): Promise<void> {
  await SecureStore.setItemAsync(BASE_KEY, base, STORE_OPTIONS);
  await SecureStore.setItemAsync(TOKEN_KEY, token, STORE_OPTIONS);
}

export async function forgetPairingToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY, STORE_OPTIONS);
}

/** Delete both the stored address and access key from the Keychain. */
export async function forgetPairing(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(BASE_KEY, STORE_OPTIONS),
    SecureStore.deleteItemAsync(TOKEN_KEY, STORE_OPTIONS),
  ]);
}
