import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import {
  Icon,
  Row,
  Screen,
  Section,
  Space,
  Theme,
  Txt,
  openPage,
  s,
  useT,
} from "../src/ui";
import { LICENSES } from "../src/licenses";

const host = (url: string) => url.replace(/^https?:\/\//, "").split("/")[0];

/** Third-party content shipped in the app, with copyright and license terms. */
export default function Licenses() {
  const t = useT(),
    router = useRouter(),
    [failed, setFailed] = useState<string | null>(null);
  return (
    <Screen back title={t("Lisanslar", "Licenses")}>
      <Txt muted>
        {t(
          "Vidora aşağıdaki üçüncü taraf içerikleri kullanır. Hepsi cihazda çalışır.",
          "Vidora includes the third-party content below. All of it runs on the device.",
        )}
      </Txt>
      {LICENSES.map((item) => {
        const name =
          typeof item.name === "string"
            ? item.name
            : t(item.name.tr, item.name.en);
        return (
          <View key={item.id} style={styles.entry}>
            <Text accessibilityRole="header" style={s.headline}>
              {name}
            </Text>
            <Txt muted>{t(item.use.tr, item.use.en)}</Txt>
            <Text style={styles.license}>{item.license}</Text>
            {item.items ? (
              item.items.map((entry) => (
                <View key={entry.name} style={{ gap: 2 }}>
                  <Text style={s.footnoteStrong}>{entry.name}</Text>
                  <Text style={s.footnote}>{entry.copyright}</Text>
                </View>
              ))
            ) : (
              <Text style={s.footnote}>{item.copyright}</Text>
            )}
            <Text style={s.footnote}>
              {t(item.summary.tr, item.summary.en)}
            </Text>
            <Section>
              {!!item.source && (
                <Row
                  first
                  external
                  label={t("Kaynak", "Source")}
                  detail={host(item.source)}
                  onPress={() =>
                    openPage(item.source!, () => setFailed(item.id))
                  }
                />
              )}
              <Row
                first={!item.source}
                testID={"license-text-" + item.id}
                label={t("Lisansın tam metni", "Full license text")}
                onPress={() =>
                  router.push({
                    pathname: "/license-text",
                    params: { id: item.text },
                  })
                }
              />
            </Section>
            {failed === item.id && (
              <View style={styles.failed}>
                <Icon
                  name="exclamationmark.triangle"
                  size={13}
                  color={Theme.text}
                />
                <Text style={[s.footnote, { flex: 1, color: Theme.text }]}>
                  {t(
                    "Bağlantı açılamadı. İnternete bağlanıp yeniden dene.",
                    "The link could not be opened. Connect to the internet and try again.",
                  )}
                </Text>
              </View>
            )}
          </View>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Entries are separated by space and a hairline, not grey boxes.
  entry: {
    gap: Space.s,
    paddingTop: Space.l,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.line,
  },
  license: { fontSize: 15, lineHeight: 20, color: Theme.text },
  failed: { flexDirection: "row", gap: Space.s, alignItems: "center" },
});
