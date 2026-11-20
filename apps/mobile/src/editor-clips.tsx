import { useEffect, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { thumbnailUri, type Clip } from "./media";
import type { TimelineItem } from "./editor-state";
import { MAX_CLIPS, formatTime, totalDuration } from "./project-state";
import { clockLabel } from "./studio/flipbook";
import {
  HeaderText,
  Icon,
  MaxScale,
  Pill,
  Press,
  Radius,
  Space,
  Theme,
  chooseAction,
  displayName,
  enPlural,
  tap,
  useT,
} from "./ui";

/** Strip tile height, ring width and the gap inside the ring. */
const TILE = 56;
const RING = 2;
const RING_GAP = 2;
/** Points per trimmed second on the strip. */
const PER_SECOND = 10;
const MAX_TILE = 180;
/** Height the filmstrip block takes in the stage (strip + summary line). */
export const FILMSTRIP_HEIGHT =
  TILE + 2 * (RING + RING_GAP) + Space.s + Math.ceil(18 * MaxScale.chrome);

/** "Klip 2": clips are named by their place, never by their file name. */
export function clipLabel(
  t: (tr: string, en: string) => string,
  index: number,
): string {
  return t("Klip ", "Clip ") + (index + 1);
}

/**
 * The timeline under the preview: one tile per clip, as wide as its trimmed
 * length, and a trailing "+" tile. Tap selects; tapping the selected tile or
 * a long press opens Move left / Move right / Remove (also VoiceOver actions).
 */
export function Filmstrip({
  items,
  selectedKey,
  disabled,
  canAdd,
  note,
  onSelect,
  onMove,
  onRemove,
  onAdd,
}: {
  items: TimelineItem[];
  selectedKey: string | null;
  disabled: boolean;
  canAdd: boolean;
  /** Replaces the summary line (e.g. while exporting). */
  note?: string | null;
  onSelect: (key: string) => void;
  onMove: (index: number, delta: -1 | 1) => void;
  onRemove: (key: string) => void;
  onAdd: () => void;
}) {
  const t = useT();
  const summary =
    t(
      `${items.length}/${MAX_CLIPS} klip`,
      `${items.length}/${MAX_CLIPS} clips`,
    ) +
    " · " +
    t("Toplam ", "Total ") +
    formatTime(totalDuration(items));

  function menu(index: number) {
    const item = items[index];
    if (!item) return;
    const options: { label: string; run: () => void }[] = [];
    if (index > 0)
      options.push({
        label: t("Sola taşı", "Move left"),
        run: () => onMove(index, -1),
      });
    if (index < items.length - 1)
      options.push({
        label: t("Sağa taşı", "Move right"),
        run: () => onMove(index, 1),
      });
    options.push({
      label: t("Zaman çizelgesinden çıkar", "Remove from timeline"),
      run: () => onRemove(item.key),
    });
    chooseAction(
      clipLabel(t, index),
      options.map((option) => option.label),
      t("Vazgeç", "Cancel"),
      options.length - 1,
      (picked) => options[picked]?.run(),
    );
  }

  return (
    <View style={{ gap: Space.s, alignSelf: "stretch" }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}
      >
        {items.map((item, index) => {
          const selected = item.key === selectedKey;
          const length = Math.max(0, item.end - item.start);
          const width = Math.min(MAX_TILE, Math.max(44, length * PER_SECOND));
          const label = clipLabel(t, index) + ", " + clockLabel(length);
          const actions = [
            ...(index > 0
              ? [{ name: "moveLeft", label: t("Sola taşı", "Move left") }]
              : []),
            ...(index < items.length - 1
              ? [{ name: "moveRight", label: t("Sağa taşı", "Move right") }]
              : []),
            {
              name: "remove",
              label: t("Zaman çizelgesinden çıkar", "Remove from timeline"),
            },
          ];
          const uri = thumbnailUri(item.clip);
          return (
            <Pressable
              key={item.key}
              testID={"desk-clip-" + (index + 1)}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ selected, disabled }}
              accessibilityActions={disabled ? undefined : actions}
              onAccessibilityAction={(event) => {
                const name = event.nativeEvent.actionName;
                if (name === "moveLeft") onMove(index, -1);
                if (name === "moveRight") onMove(index, 1);
                if (name === "remove") onRemove(item.key);
              }}
              disabled={disabled}
              delayLongPress={350}
              onLongPress={() => menu(index)}
              onPress={() => {
                if (selected) return menu(index);
                tap("select");
                onSelect(item.key);
              }}
              style={({ pressed }) => [
                styles.ring,
                selected && { borderColor: Theme.text },
                pressed && Press.media,
                disabled && { opacity: 0.4 },
              ]}
            >
              {uri ? (
                <Image
                  accessible={false}
                  source={{ uri }}
                  resizeMode="cover"
                  style={[styles.tile, { width }]}
                />
              ) : (
                <View style={[styles.tile, { width }]} />
              )}
            </Pressable>
          );
        })}
        <Pressable
          testID="desk-add"
          accessibilityRole="button"
          accessibilityLabel={t("Klip ekle", "Add clips")}
          accessibilityState={{ disabled: disabled || !canAdd }}
          disabled={disabled || !canAdd}
          onPress={onAdd}
          style={({ pressed }) => [
            styles.ring,
            pressed && Press.filled,
            (disabled || !canAdd) && { opacity: 0.4 },
          ]}
        >
          <View style={[styles.tile, styles.add]}>
            <Icon name="plus" size={20} />
          </View>
        </Pressable>
      </ScrollView>
      <Text
        maxFontSizeMultiplier={MaxScale.chrome}
        style={styles.summary}
        accessibilityLiveRegion="polite"
      >
        {note ?? summary}
      </Text>
    </View>
  );
}

/**
 * Library clips in a page sheet: a 3-column grid, toggle tiles (up to the
 * free timeline slots), then "Ekle (n)".
 */
export function LibrarySheet({
  visible,
  clips,
  limit,
  onClose,
  onAdd,
}: {
  visible: boolean;
  clips: Clip[];
  /** Free timeline slots. */
  limit: number;
  onClose: () => void;
  onAdd: (clips: Clip[]) => void;
}) {
  const t = useT();
  const { width } = useWindowDimensions();
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => {
    if (visible) setPicked([]);
  }, [visible]);
  const tileWidth = Math.floor((width - 2 * 2) / 3);
  const full = picked.length >= limit;
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.sheet}>
        <View style={styles.bar}>
          <HeaderText
            testID="desk-library-cancel"
            label={t("Vazgeç", "Cancel")}
            onPress={onClose}
          />
          <Text
            accessibilityRole="header"
            maxFontSizeMultiplier={MaxScale.chrome}
            style={styles.barTitle}
          >
            {t("Kitaplık", "Library")}
          </Text>
          <HeaderText
            strong
            testID="desk-library-add"
            label={t(`Ekle (${picked.length})`, `Add (${picked.length})`)}
            accessibilityLabel={t(
              `${picked.length} klibi ekle`,
              `Add ${picked.length} ${enPlural(picked.length, "clip", "clips")}`,
            )}
            disabled={picked.length === 0}
            onPress={() => {
              const chosen = picked
                .map((id) => clips.find((clip) => clip.id === id))
                .filter((clip): clip is Clip => !!clip);
              onAdd(chosen);
            }}
          />
        </View>
        <ScrollView contentContainerStyle={styles.grid}>
          {clips.map((clip, index) => {
            const on = picked.includes(clip.id);
            const blocked = !on && full;
            const uri = thumbnailUri(clip);
            return (
              <Pressable
                key={clip.id}
                testID={"desk-library-tile-" + (index + 1)}
                accessibilityRole="checkbox"
                accessibilityLabel={
                  displayName(clip.name) + ", " + clockLabel(clip.duration)
                }
                accessibilityState={{ checked: on, disabled: blocked }}
                disabled={blocked}
                onPress={() => {
                  tap("select");
                  setPicked((current) =>
                    on
                      ? current.filter((id) => id !== clip.id)
                      : [...current, clip.id],
                  );
                }}
                style={({ pressed }) => [
                  { width: tileWidth, aspectRatio: 3 / 4 },
                  pressed && Press.media,
                  blocked && { opacity: 0.4 },
                ]}
              >
                {uri ? (
                  <Image
                    accessible={false}
                    source={{ uri }}
                    resizeMode="cover"
                    style={styles.gridImage}
                  />
                ) : (
                  <View style={styles.gridImage} />
                )}
                <View style={styles.duration}>
                  <Pill label={clockLabel(clip.duration)} />
                </View>
                {on && (
                  <>
                    <View pointerEvents="none" style={styles.gridRing} />
                    <View pointerEvents="none" style={styles.check}>
                      <Icon
                        name="checkmark.circle.fill"
                        size={16}
                        color={Theme.text}
                      />
                    </View>
                  </>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  strip: {
    gap: 2,
    paddingHorizontal: Space.l - RING - RING_GAP,
    alignItems: "center",
  },
  // A clear ring on every tile, ink on the selected one, so nothing shifts.
  ring: {
    padding: RING_GAP,
    borderWidth: RING,
    borderColor: "transparent",
    borderRadius: Radius.s + RING + RING_GAP,
  },
  tile: {
    height: TILE,
    borderRadius: Radius.s,
    backgroundColor: Theme.raised,
  },
  add: { width: TILE, alignItems: "center", justifyContent: "center" },
  summary: {
    fontSize: 13,
    lineHeight: 18,
    color: Theme.muted,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  sheet: { flex: 1, backgroundColor: Theme.bg },
  bar: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Space.gutter,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Theme.line,
  },
  barTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "600",
    color: Theme.text,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 2 },
  gridImage: { flex: 1, backgroundColor: Theme.surface },
  duration: { position: "absolute", right: Space.xs, bottom: Space.xs },
  gridRing: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 2,
    borderColor: Theme.text,
  },
  check: {
    position: "absolute",
    top: Space.xs,
    right: Space.xs,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.bg,
  },
});
