/**
 * The editor's Şablon panel in editorial mode: the three AI shots (context,
 * hand, macro) the video uses, a line on what the video is made from, and
 * "Yeniden çek" (new shots from the cloud; each one counts against today's
 * allowance). Without the cloud there is no button.
 */
import { Image, StyleSheet, Text, View } from "react-native";
import { Button, Face, Radius, Space, Theme, useT } from "../ui";

const THUMB = 56;

export function EditorialPanel({
  shots,
  onReshoot,
  disabled,
}: {
  shots: readonly (string | null)[];
  /** Asks the cloud again; undefined hides the button (no cloud). */
  onReshoot?: () => void;
  disabled: boolean;
}) {
  const t = useT();
  const labels = [
    t("Mekân", "Setting"),
    t("El", "Hand"),
    t("Yakın", "Close-up"),
  ];
  const made = shots.some(Boolean);
  return (
    <View testID="editorial-panel" style={styles.panel}>
      <View style={styles.row}>
        {labels.map((label, i) => {
          const uri = shots[i];
          return (
            <View key={label} style={styles.shot}>
              <View style={styles.thumb}>
                {uri ? (
                  <Image
                    accessible={false}
                    accessibilityIgnoresInvertColors
                    source={{ uri }}
                    resizeMode="cover"
                    style={StyleSheet.absoluteFill}
                  />
                ) : null}
              </View>
              <Text maxFontSizeMultiplier={1.3} style={styles.label}>
                {label}
              </Text>
            </View>
          );
        })}
      </View>
      <Text maxFontSizeMultiplier={1.3} style={styles.note}>
        {made
          ? t(
              "Yapay zekâ çekimleri senin fotoğraflarınla birlikte kullanılır.",
              "The AI shots are used together with your photos.",
            )
          : t(
              "Bu video senin fotoğraflarınla hazırlanıyor.",
              "This video is made from your photos.",
            )}
      </Text>
      {onReshoot && (
        <Button
          testID="editorial-reshoot"
          icon="camera"
          label={t("Yeniden çek", "Shoot again")}
          disabled={disabled}
          onPress={onReshoot}
        />
      )}
      {onReshoot && (
        <Text maxFontSizeMultiplier={1.3} style={styles.note}>
          {t(
            "Her çekim günlük yapay zekâ hakkından düşer.",
            "Each shot counts against today's AI allowance.",
          )}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: Space.s,
    paddingHorizontal: Space.gutter,
    paddingTop: Space.s,
    paddingBottom: Space.l,
  },
  row: { flexDirection: "row", gap: Space.m },
  shot: { alignItems: "center", gap: Space.xs },
  thumb: {
    width: THUMB,
    height: Math.round((THUMB * 16) / 9),
    borderRadius: Radius.s,
    overflow: "hidden",
    backgroundColor: Theme.raised,
  },
  label: {
    fontFamily: Face.medium,
    fontWeight: "500",
    fontSize: 13,
    lineHeight: 16,
    color: Theme.muted,
  },
  note: { fontSize: 13, lineHeight: 18, color: Theme.muted },
});
