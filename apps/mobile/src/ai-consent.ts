/**
 * Consent for sending the product photo to the third-party AI provider
 * (App Review guideline 5.1.2(i)). Stored in the Keychain; asked again when
 * CONSENT_VERSION changes. The sheet itself is in app/ai-studio.tsx.
 */
import * as SecureStore from "expo-secure-store";
import { consentRecord, hasValidConsent } from "./cloud-rules";

const KEY = "ai-cloud-consent";

export async function hasAiConsent(): Promise<boolean> {
  try {
    return hasValidConsent(await SecureStore.getItemAsync(KEY));
  } catch {
    return false;
  }
}

export async function grantAiConsent(): Promise<void> {
  await SecureStore.setItemAsync(KEY, consentRecord(Date.now()));
}

/** For a future Settings switch ("AI özelliklerine izin ver"). */
export async function revokeAiConsent(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY).catch(() => {});
}
