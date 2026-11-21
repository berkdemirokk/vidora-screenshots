/**
 * The editor's Şablon panel in editorial mode: the cuts (switching one keeps
 * the photos, shots and texts), the three AI shots (context, hand, macro) the
 * video uses, a line on what the video is made from, and "Yeniden çek" (new
 * shots from the cloud; each one counts against today's allowance). Without
 * the cloud there is no button.
 */
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useEditorialPoster } from "../gallery-posters";
import { EDITORIAL_CUTS, type EditorialCut } from "../recipes/editorial";
import {
  Button,
  Face,
  MaxScale,
  Press,
  Radius,
  Space,
  Theme,
  tap,
  useT,
} from "../ui";

const THUMB = 56;

/** One cut: its gallery poster and name. */
function CutTile({
  cut,
  selected,
  disabled,
  onPress,
}: {
  cut: EditorialCut;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const t = useT();
  const uri = useEditorialPoster(cut, true);
  const name = t(cut.tr, cut.en);
  return (
    <Pressable
      testID={"editorial-cut-" + cut.id}
      accessibilityRole="radio"
      accessibilityLabel={name + ", " + t(cut.about.tr, cut.about.en)}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.cut,
        pressed && Press.media,
        disabled && { opacity: 0.4 },
      ]}
    >
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
        {selected && <View style={styles.ring} />}
      </View>
      <Text
        numberOfLines={2}
        maxFontSizeMultiplier={MaxScale.chrome}
        style={[styles.cutName, selected && styles.cutNameOn]}
      >
        {name}
      </Text>
    </Pressable>
  );
}

export function EditorialPanel({
  shots,
  cut,
  onCut,
  onReshoot,
  disabled,
}: {
  shots: readonly (string | null)[];
  /** The cut in use (an EDITORIAL_CUTS id) and the switch to another. */
  cut: string;
  onCut: (id: string) => void;
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
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.cuts}
        accessibilityRole="radiogroup"
        accessibilityLabel={t("Kurgu", "Cut")}
      >
        {EDITORIAL_CUTS.map((c) => (
          <CutTile
            key={c.id}
            cut={c}
            selected={c.id === cut}
            disabled={disabled}
            onPress={() => {
              if (c.id !== cut) tap("select");
              onCut(c.id);
            }}
          />
        ))}
      </ScrollView>
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
  cuts: { gap: Space.s },
  cut: { width: THUMB + Space.s, gap: Space.xs, alignItems: "center" },
  ring: {
    ...StyleSheet.absoluteFill,
    borderRadius: Radius.s,
    borderWidth: 2,
    borderColor: Theme.text,
  },
  cutName: {
    fontFamily: Face.bold,
    fontWeight: "700",
    fontSize: 13,
    lineHeight: 16,
    color: Theme.muted,
    textAlign: "center",
  },
  cutNameOn: { color: Theme.text, fontWeight: "800" },
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
