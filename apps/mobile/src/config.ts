/** Product switches for this release. */
export const FEATURES = {
  /** AI video generation through a paired workstation; not part of v1. */
  aiStudio: false,
  /**
   * Store screenshot builds only (CI simulator, `EXPO_PUBLIC_SCREENSHOT_MODE=1`
   * at bundle time): shows Pro features without a purchase. Never set for
   * App Store / TestFlight builds, so it is always false there.
   */
  screenshotMode: process.env.EXPO_PUBLIC_SCREENSHOT_MODE === "1",
  testerPro: process.env.EXPO_PUBLIC_TESTER_PRO === "1",
  accounts: process.env.EXPO_PUBLIC_ACCOUNTS === "1",
} as const;

/**
 * QA diagnostics for the simulator run only (`EXPO_PUBLIC_QA_DIAG=1` at bundle
 * time): Home exposes the sample poster pipeline's state as a hidden element
 * (testID "poster-diag"). Never set for App Store / TestFlight builds, so it
 * is always false there and nothing extra is rendered or tracked.
 */
export const QA_DIAG = process.env.EXPO_PUBLIC_QA_DIAG === "1";

/**
 * QA only (`EXPO_PUBLIC_QA_QUALITY=720p|1080p` at bundle time): the editor
 * renders at this quality whatever the plan or preset says, so a slow
 * simulator can run 720p. Anything else (unset, empty, a typo) is null, and
 * then nothing changes. Never set for App Store / TestFlight builds.
 */
const qaQualityRaw = process.env.EXPO_PUBLIC_QA_QUALITY;
export const QA_QUALITY: "720p" | "1080p" | null =
  qaQualityRaw === "720p" || qaQualityRaw === "1080p" ? qaQualityRaw : null;

/**
 * QA only (`EXPO_PUBLIC_QA_RECIPE=1` at bundle time): the editor renders the
 * "Yeni Koleksiyon" recipe instead of the chosen template, so the simulator
 * run can show the multi-scene renderer. Never set for App Store / TestFlight
 * builds (not in any eas.json profile), so it is always false there.
 */
export const QA_RECIPE = process.env.EXPO_PUBLIC_QA_RECIPE === "1";

/**
 * True in the simulator QA build (either QA switch above): a slow machine, so
 * the render stall watchdog waits longer. Always false in store builds.
 */
export const QA_SLOW_RENDER = QA_DIAG || QA_QUALITY !== null;

/**
 * One flow only: photo > editor > video > save. Rows and tools outside it are
 * hidden, not deleted; set to false to bring them all back.
 */
export const SINGLE_FLOW = true;

/**
 * Templates offered in the single flow's Şablon tool, in tile order. The
 * others stay in the code (hidden), never deleted.
 */
export const SINGLE_FLOW_TEMPLATES = ["campaign", "discount", "showcase"] as const;
