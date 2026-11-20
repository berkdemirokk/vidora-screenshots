import { Text } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Screen, Theme, useT } from "../src/ui";
import { LICENSE_TEXTS, type LicenseTextId } from "../src/licenses";

/** A full licence text, bundled with the app. Route: /license-text?id=<id> */
export default function LicenseText() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const entry =
    id && id in LICENSE_TEXTS ? LICENSE_TEXTS[id as LicenseTextId] : null;
  return (
    <Screen back title={entry?.title ?? t("Lisans", "License")}>
      <Text
        selectable
        style={{ fontSize: 13, lineHeight: 18, color: Theme.text }}
      >
        {entry?.text ??
          t("Bu lisans metni bulunamadı.", "This license text was not found.")}
      </Text>
    </Screen>
  );
}
