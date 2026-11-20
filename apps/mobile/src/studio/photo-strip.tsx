/**
 * The editor's photos (up to 8) and beat chips. Vitrin: paper thumbnails
 * with a hairline, ink remove buttons, 44 pt touch targets everywhere.
 */
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Face, Icon, Press, Radius, Space, Theme, useT } from "../ui";
import { ChipRow, PanelLabel } from "./controls";
import { MAX_PHOTOS } from "../editor-media";
import type { MusicPatternChoice } from "../drafts";

const THUMB = 56;
/** Room above the thumbnails for the remove buttons. */
const TOP = 10;

/** Height the strip takes, so a panel can plan its own room. */
export function photoStripHeight(withNote: boolean): number {
  return TOP + THUMB + Space.s + (withNote ? 24 : 0);
}

export type StripPhoto = {
  /** What the thumbnail shows (the cut-out, or the photo until it is ready). */
  uri: string;
  /** The cut-out is still being made. */
  pending: boolean;
};

/**
 * Photo 1 (the main product) and the added photos, each with a remove
 * button, then "Fotoğraf ekle" while fewer than 8. The main photo is changed
 * with the preview's own button, so it has no remove button.
 */
export function PhotoStrip({
  photos,
  onAdd,
  onRemove,
  disabled,
  note,
}: {
  photos: readonly StripPhoto[];
  onAdd: () => void;
  /** Index into `photos` (1 or more). */
  onRemove: (index: number) => void;
  disabled: boolean;
  note?: string | null;
}) {
  const t = useT();
  const left = MAX_PHOTOS - photos.length;
  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        accessibilityLabel={t("Fotoğraflar", "Photos")}
        contentContainerStyle={styles.row}
      >
        {photos.map((photo, index) => (
          <View
            key={photo.uri + index}
            testID={"photo-thumb-" + (index + 1)}
            style={styles.cell}
          >
            <View
              accessible
              accessibilityLabel={
                index === 0
                  ? t("1. fotoğraf, ana ürün", "Photo 1, main product")
                  : t(`${index + 1}. fotoğraf`, `Photo ${index + 1}`)
              }
              style={styles.thumb}
            >
              <Image
                source={{ uri: photo.uri }}
                resizeMode={index === 0 ? "contain" : "cover"}
                style={styles.image}
              />
              {photo.pending && (
                <View style={styles.pending}>
                  <ActivityIndicator size="small" color={Theme.onMedia} />
                </View>
              )}
            </View>
            {index > 0 && (
              <Pressable
                testID={"photo-remove-" + (index + 1)}
                accessibilityRole="button"
                accessibilityLabel={t(
                  `${index + 1}. fotoğrafı kaldır`,
                  `Remove photo ${index + 1}`,
                )}
                disabled={disabled}
                onPress={() => onRemove(index)}
                style={({ pressed }) => [
                  styles.remove,
                  pressed && Press.filled,
                  disabled && { opacity: 0.4 },
                ]}
              >
                <View style={styles.removeDot}>
                  <Icon name="xmark" size={10} color={Theme.onMedia} />
                </View>
              </Pressable>
            )}
          </View>
        ))}
        {left > 0 && (
          <Pressable
            testID="photo-add"
            accessibilityRole="button"
            accessibilityLabel={t("Fotoğraf ekle", "Add photos")}
            accessibilityHint={t(
              `${left} fotoğraf daha ekleyebilirsin.`,
              `You can add ${left} more.`,
            )}
            disabled={disabled}
            onPress={onAdd}
            style={({ pressed }) => [
              styles.add,
              pressed && Press.filled,
              disabled && { opacity: 0.4 },
            ]}
          >
            <Icon name="plus" size={16} />
            <Text maxFontSizeMultiplier={1.3} style={styles.addText}>
              {t("Fotoğraf ekle", "Add photos")}
            </Text>
          </Pressable>
        )}
      </ScrollView>
      {note ? (
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
          style={styles.note}
        >
          {note}
        </Text>
      ) : null}
    </View>
  );
}

/** "Ritim 1-4" and "Kapalı"; `value` null selects none (an own music file plays). */
export function BeatChips({
  value,
  onChange,
  disabled,
}: {
  value: MusicPatternChoice | null;
  onChange: (value: MusicPatternChoice) => void;
  disabled: boolean;
}) {
  const t = useT();
  return (
    <View style={styles.group}>
      <PanelLabel>{t("Müzik", "Music")}</PanelLabel>
      <ChipRow<MusicPatternChoice>
        label={t("Müzik", "Music")}
        options={[
          { value: "pulse", label: t("Ritim 1", "Beat 1") },
          { value: "house", label: t("Ritim 2", "Beat 2") },
          { value: "chill", label: t("Ritim 3", "Beat 3") },
          { value: "pop", label: t("Ritim 4", "Beat 4") },
          { value: "off", label: t("Kapalı", "Off") },
        ]}
        value={value}
        onChange={onChange}
        disabled={disabled}
        testIDFor={(id) => "beat-" + id}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: Space.s,
    paddingHorizontal: Space.gutter,
    paddingTop: TOP,
    paddingBottom: Space.s,
    alignItems: "flex-end",
  },
  cell: { width: THUMB, height: THUMB },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: Radius.s,
    overflow: "hidden",
    backgroundColor: Theme.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.line,
  },
  image: { width: "100%", height: "100%" },
  pending: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.scrimSoft,
  },
  // 44 pt target (inside the scroll content, so it gets touches) around a
  // 22 pt ink dot at the thumbnail's top right.
  remove: {
    position: "absolute",
    top: -TOP,
    right: -8,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  removeDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.text,
    borderWidth: 1.5,
    borderColor: Theme.bg,
  },
  add: {
    height: THUMB,
    minWidth: 112,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Space.xs,
    paddingHorizontal: Space.m,
    borderRadius: Radius.s,
    borderWidth: 1,
    borderColor: Theme.text,
    backgroundColor: Theme.bg,
  },
  addText: {
    fontFamily: Face.bold,
    fontSize: 13,
    fontWeight: "700",
    color: Theme.text,
  },
  note: {
    fontSize: 12.5,
    lineHeight: 18,
    color: Theme.muted,
    paddingHorizontal: Space.gutter,
  },
  group: { gap: Space.s },
});
