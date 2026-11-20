import { Stack } from "expo-router";
import { HeaderOptions, NATIVE_TAB_TITLES, useT } from "../../../src/ui";

/** The Settings tab in its own native stack: the iOS large title (or the drawn title when NATIVE_TAB_TITLES is off; see `Screen`). */
export default function SettingsStack() {
  const t = useT();
  return (
    <Stack screenOptions={{ ...HeaderOptions, headerShown: NATIVE_TAB_TITLES }}>
      <Stack.Screen
        name="settings"
        options={{ title: t("Ayarlar", "Settings") }}
      />
    </Stack>
  );
}
