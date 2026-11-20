/**
 * The real Apple sign-in: expo-apple-authentication and expo-crypto, loaded
 * defensively. A build or an over-the-air update without the native module
 * (or a device without Sign in with Apple) simply has no button; nothing
 * throws at import time.
 */
import type { ComponentType } from "react";
import { runAppleSignIn } from "./apple.ts";
import type { AppleCredential } from "./apple.ts";

type AppleModule = typeof import("expo-apple-authentication");
type CryptoModule = typeof import("expo-crypto");

let appleMod: AppleModule | null | undefined;
let cryptoMod: CryptoModule | null | undefined;

function apple(): AppleModule | null {
  if (appleMod === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional native module, loaded lazily so a missing binary does not throw at import
      appleMod = require("expo-apple-authentication") as AppleModule;
    } catch {
      appleMod = null;
    }
  }
  return appleMod;
}

function crypto(): CryptoModule | null {
  if (cryptoMod === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional native module, loaded lazily so a missing binary does not throw at import
      cryptoMod = require("expo-crypto") as CryptoModule;
    } catch {
      cryptoMod = null;
    }
  }
  return cryptoMod;
}

/** True only on a device and build that can show the Apple sheet. */
export async function isAppleAvailable(): Promise<boolean> {
  const a = apple();
  if (!a || !crypto()) return false;
  try {
    return await a.isAvailableAsync();
  } catch {
    return false;
  }
}

/** The official button component, or null when the native module is missing. */
export function getAppleButton():
  AppleModule["AppleAuthenticationButton"] | null {
  return apple()?.AppleAuthenticationButton ?? null;
}

export type AppleButtonComponent = ComponentType<
  React.ComponentProps<AppleModule["AppleAuthenticationButton"]>
>;

/** null: the user cancelled. Throws AuthError("appleFailed") otherwise. */
export async function signInWithAppleNative(): Promise<AppleCredential | null> {
  const a = apple();
  const c = crypto();
  return runAppleSignIn({
    randomNonce: () => {
      if (!c) throw new Error("unavailable");
      return Array.from(c.getRandomBytes(32), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
    },
    sha256: async (value) => {
      if (!c) throw new Error("unavailable");
      return c.digestStringAsync(c.CryptoDigestAlgorithm.SHA256, value);
    },
    signIn: async (opts) => {
      if (!a) throw new Error("unavailable");
      return a.signInAsync({
        requestedScopes: [
          a.AppleAuthenticationScope.FULL_NAME,
          a.AppleAuthenticationScope.EMAIL,
        ],
        nonce: opts.nonce,
      });
    },
  });
}

/** Type and style of the official button: "Sign in with Apple", black. */
export function getAppleButtonProps(): {
  buttonType: number;
  buttonStyle: number;
} | null {
  const a = apple();
  if (!a) return null;
  return {
    buttonType: a.AppleAuthenticationButtonType.SIGN_IN,
    buttonStyle: a.AppleAuthenticationButtonStyle.BLACK,
  };
}
