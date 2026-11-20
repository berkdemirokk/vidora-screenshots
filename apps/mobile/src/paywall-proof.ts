/**
 * The user's own last rendered result (a poster or frame), shown on the
 * paywall with a watermark. Set by the editor after a render; it lives in
 * memory only and is never written to Photos. Only a local file:// URI is
 * accepted, so nothing remote can be loaded through it.
 */
import { useSyncExternalStore } from "react";

let proof: string | null = null;
const listeners = new Set<() => void>();

export function normalizeProof(uri: unknown): string | null {
  return typeof uri === "string" && uri.startsWith("file://") ? uri : null;
}

/** Remember the frame to show on the paywall; null clears it. */
export function setPaywallProof(uri: string | null): void {
  const next = normalizeProof(uri);
  if (next === proof) return;
  proof = next;
  listeners.forEach((listener) => listener());
}

export function getPaywallProof(): string | null {
  return proof;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** The current proof URI, or null; stable between changes. */
export function usePaywallProof(): string | null {
  return useSyncExternalStore(subscribe, getPaywallProof, getPaywallProof);
}
