/**
 * The look of the last video (backdrop and button text), kept so the next
 * NEW video starts the same way. Never stores the seller's photo, name or
 * price. Stored in the Keychain next to the other small settings; every
 * read and write is best effort.
 */
const KEY = "lastLook";
const MAX_CTA = 40;

export type LastLook = { backdrop: string | null; cta: string };

/** Parse a stored value; unknown backdrop ids and bad shapes are dropped. */
export function parseLastLook(
  raw: string | null | undefined,
  validBackdrops: readonly string[],
): LastLook | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { backdrop?: unknown; cta?: unknown };
    if (!value || typeof value !== "object") return null;
    const backdrop =
      typeof value.backdrop === "string" &&
      validBackdrops.includes(value.backdrop)
        ? value.backdrop
        : null;
    const cta =
      typeof value.cta === "string" ? value.cta.trim().slice(0, MAX_CTA) : "";
    if (!backdrop && !cta) return null;
    return { backdrop, cta };
  } catch {
    return null;
  }
}

export function serializeLastLook(look: LastLook): string {
  return JSON.stringify({
    backdrop: look.backdrop,
    cta: look.cta.trim().slice(0, MAX_CTA),
  });
}

export async function loadLastLook(
  validBackdrops: readonly string[],
): Promise<LastLook | null> {
  try {
    const SecureStore = await import("expo-secure-store");
    return parseLastLook(await SecureStore.getItemAsync(KEY), validBackdrops);
  } catch {
    return null;
  }
}

/** An empty half of the new look keeps the remembered one; both empty keeps all. */
export function mergeLastLook(
  prev: LastLook | null,
  next: LastLook,
): LastLook | null {
  const backdrop = next.backdrop ?? prev?.backdrop ?? null;
  const cta = next.cta.trim() || prev?.cta || "";
  return backdrop || cta ? { backdrop, cta } : null;
}

export async function saveLastLook(
  look: LastLook,
  validBackdrops: readonly string[],
): Promise<void> {
  try {
    const SecureStore = await import("expo-secure-store");
    const prev = parseLastLook(
      await SecureStore.getItemAsync(KEY),
      validBackdrops,
    );
    const merged = mergeLastLook(prev, look);
    if (merged) await SecureStore.setItemAsync(KEY, serializeLastLook(merged));
  } catch {
    // Remembering the look is a convenience only.
  }
}
