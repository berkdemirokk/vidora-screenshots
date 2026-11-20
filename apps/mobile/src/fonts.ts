/* eslint-disable @typescript-eslint/no-require-imports -- fonts are required lazily on purpose */
/**
 * Vitrin type faces: Anton (display) and Manrope 500/700/800 (UI). The TTFs
 * ship with the native video engine (modules/karevia-editor/ios/fonts), which
 * only registers them lazily, so the app loads the same files with expo-font
 * (already part of Expo; no new dependency).
 *
 * Fail safe: styles name the faces together with a matching fontWeight. If a
 * face is missing or loading fails, iOS draws the system font in that weight
 * (heavy, tight tracking) and nothing crashes. Loading never blocks render.
 */
export const Face = {
  display: "Anton-Regular",
  medium: "Manrope-Medium",
  bold: "Manrope-Bold",
  extra: "Manrope-ExtraBold",
} as const;

let started: Promise<boolean> | null = null;

/** Loads the faces once; resolves true when all are usable, never rejects. */
export function loadFonts(): Promise<boolean> {
  if (started) return started;
  started = (async () => {
    try {
      // Required lazily so a missing module or file cannot break app start.
      const Font = require("expo-font") as typeof import("expo-font");
      await Font.loadAsync({
        [Face.display]: require("../modules/karevia-editor/ios/fonts/Anton_400Regular.ttf"),
        [Face.medium]: require("../modules/karevia-editor/ios/fonts/Manrope_500Medium.ttf"),
        [Face.bold]: require("../modules/karevia-editor/ios/fonts/Manrope_700Bold.ttf"),
        [Face.extra]: require("../modules/karevia-editor/ios/fonts/Manrope_800ExtraBold.ttf"),
      });
      return true;
    } catch {
      return false;
    }
  })();
  return started;
}
