/**
 * Asks for an App Store review after the 3rd successful save, at most once
 * per app version. The counter lives in a small JSON file inside the media
 * folder (same write pattern as the drafts: write `.tmp`, then move over the
 * old file). Every step is best effort and never throws; the native module is
 * optional so a build without it simply skips the prompt.
 */
export const REVIEW_AFTER_SAVES = 3;

export type ReviewState = { saves: number; askedVersion: string | null };
export const EMPTY_REVIEW_STATE: ReviewState = { saves: 0, askedVersion: null };

export function parseReviewState(raw: string | null | undefined): ReviewState {
  if (!raw) return EMPTY_REVIEW_STATE;
  try {
    const value = JSON.parse(raw) as Partial<ReviewState> | null;
    const saves =
      typeof value?.saves === "number" && Number.isFinite(value.saves)
        ? Math.max(0, Math.min(1000, Math.floor(value.saves)))
        : 0;
    const askedVersion =
      typeof value?.askedVersion === "string" ? value.askedVersion : null;
    return { saves, askedVersion };
  } catch {
    return EMPTY_REVIEW_STATE;
  }
}

/** Count one save; `ask` is true when the prompt is due now. */
export function nextReviewState(
  state: ReviewState,
  version: string,
): { state: ReviewState; ask: boolean } {
  const saves = state.saves + 1;
  const ask = saves >= REVIEW_AFTER_SAVES && state.askedVersion !== version;
  return {
    ask,
    state: { saves, askedVersion: ask ? version : state.askedVersion },
  };
}

const FILE = "review-prompt.json";

async function location() {
  const { File } = await import("expo-file-system");
  const { mediaFolder } = await import("./media");
  const dir = mediaFolder();
  return { file: new File(dir, FILE), temp: new File(dir, FILE + ".tmp") };
}

async function appVersion(): Promise<string> {
  try {
    const Constants = (await import("expo-constants")).default;
    return String(Constants.expoConfig?.version ?? "0");
  } catch {
    return "0";
  }
}

async function requestReview(): Promise<void> {
  try {
    const { requireOptionalNativeModule } = await import("expo");
    const native = requireOptionalNativeModule<{
      requestReview?: () => Promise<void>;
    }>("ExpoStoreReview");
    await native?.requestReview?.();
  } catch {
    // No native module, or iOS declined: nothing to do.
  }
}

/**
 * Call once after a video was saved to Photos. Never throws; the dialog
 * itself is shown by iOS, which may also decline to show it.
 */
export async function recordSuccessfulSave(): Promise<void> {
  try {
    const { file, temp } = await location();
    const before = parseReviewState(file.exists ? await file.text() : null);
    const { state, ask } = nextReviewState(before, await appVersion());
    if (temp.exists) temp.delete();
    temp.create();
    temp.write(JSON.stringify(state));
    if (file.exists) file.delete();
    temp.move(file);
    if (ask) await requestReview();
  } catch {
    // Counting is best effort.
  }
}
