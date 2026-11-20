import { Stack } from "expo-router";
import { HeaderOptions, NATIVE_TAB_TITLES, useT } from "../../../src/ui";

/** The Studio tab in its own native stack: the iOS large title (or the drawn title when NATIVE_TAB_TITLES is off; see `Screen`). */
export default function StudioStack() {
  const t = useT();
  return (
    <Stack screenOptions={{ ...HeaderOptions, headerShown: NATIVE_TAB_TITLES }}>
      <Stack.Screen name="index" options={{ title: t("Stüdyo", "Studio") }} />
    </Stack>
  );
}
