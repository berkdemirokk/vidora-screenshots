import { useEffect, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Button,
  Icon,
  ProgressBar,
  Radius,
  Space,
  Theme,
  TileCaption,
  tap,
  useT,
} from "../ui";
import { BACKDROPS, type BackdropId } from "../backdrops";
import { MAX_IMAGE_SET } from "../backdrop-rules";
import { useWindowDimensions } from "react-native";
import { FILL } from "./controls";

/**
 * "Diğer zeminlerde de üret": tick up to five backdrops; the end card is
 * then saved as an image on each, one after another. The screen that opens
 * the sheet does the rendering and passes `progress` while it runs.
 */
export function ImageSetSheet({
  visible,
  initial,
  progress,
  onStart,
  onCancel,
  onClose,
  onShow,
}: {
  /** The sheet reached the screen (a present during a dismissal is refused). */
  onShow?: () => void;
  visible: boolean;
  /** Pre-ticked backdrops (the current one and contrasting ones). */
  initial: BackdropId[];
  /** Images done out of the total while rendering; null before. */
  progress: { done: number; total: number } | null;
  onStart: (ids: BackdropId[]) => void;
  onCancel: () => void;
  onClose: () => void;
}) {
  const t = useT(),
    insets = useSafeAreaInsets();
  const [picked, setPicked] = useState<BackdropId[]>(initial);
  // A fresh choice each time the sheet opens.
  useEffect(() => {
    if (visible) setPicked(initial);
    // Only opening the sheet resets the ticks; `initial` is recomputed by
    // the caller on every render.
  }, [visible]);
  const running = progress !== null;
  // Four columns across the sheet, 3:4 tiles.
  const { width: screenWidth } = useWindowDimensions();
  const tile = Math.floor((screenWidth - 2 * Space.gutter - 3 * Space.m) / 4),
    tileH = Math.round((tile * 4) / 3);
  function toggle(id: BackdropId) {
    setPicked((list) => {
      if (list.includes(id)) return list.filter((item) => item !== id);
      if (list.length >= MAX_IMAGE_SET) return list;
      tap("select");
      return [...list, id];
    });
  }
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onShow={onShow}
      onRequestClose={running ? onCancel : onClose}
    >
      <View
        style={[
          styles.root,
          { paddingBottom: Math.max(insets.bottom, Space.l) },
        ]}
      >
        <View style={styles.head}>
          <Text accessibilityRole="header" style={styles.title}>
            {t("Diğer zeminlerde de üret", "Make it on more backdrops")}
          </Text>
          {!running && (
            <Pressable
              testID="image-set-close"
              accessibilityRole="button"
              accessibilityLabel={t("Kapat", "Close")}
              onPress={onClose}
              style={styles.close}
            >
              <Icon name="xmark" size={15} color={Theme.muted} />
            </Pressable>
          )}
        </View>
        <Text style={styles.note}>
          {t(
            `En fazla ${MAX_IMAGE_SET} zemin seç. Videonun son karesi her zeminde seçtiğin oranda 1080p görsel olarak Fotoğraflar'a kaydedilir.`,
            `Choose up to ${MAX_IMAGE_SET} backdrops. The video's last frame is saved to Photos on each, as a 1080p image in the shape you chose.`,
          )}
        </Text>
        <ScrollView contentContainerStyle={styles.grid}>
          {BACKDROPS.map((item) => {
            const on = picked.includes(item.id),
              full = !on && picked.length >= MAX_IMAGE_SET,
              name = t(item.tr, item.en);
            return (
              <Pressable
                key={item.id}
                testID={"image-set-backdrop-" + item.id}
                accessibilityRole="checkbox"
                accessibilityLabel={name}
                accessibilityState={{
                  checked: on,
                  disabled: running || full,
                }}
                disabled={running || full}
                onPress={() => toggle(item.id)}
                style={({ pressed }) => [
                  styles.tile,
                  { width: tile },
                  pressed && { opacity: 0.8 },
                  (running || full) && { opacity: 0.4 },
                ]}
              >
                <View style={[styles.thumb, { width: tile, height: tileH }]}>
                  <Image
                    accessible={false}
                    source={item.thumb}
                    resizeMode="cover"
                    style={[FILL, { width: tile, height: tileH }]}
                  />
                  {on && (
                    <>
                      <View style={styles.ring} />
                      <View style={styles.tick}>
                        <Icon name="checkmark" size={11} color={Theme.bg} />
                      </View>
                    </>
                  )}
                </View>
                <TileCaption selected={on}>{name}</TileCaption>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={styles.actions}>
          {running ? (
            <>
              <ProgressBar
                progress={
                  progress.total > 0 ? progress.done / progress.total : 0
                }
                label={t(
                  `Görseller hazırlanıyor (${progress.done}/${progress.total})`,
                  `Preparing images (${progress.done}/${progress.total})`,
                )}
              />
              <Button
                testID="image-set-cancel"
                label={t("İptal", "Cancel")}
                onPress={onCancel}
              />
            </>
          ) : (
            <Button
              testID="image-set-start"
              primary
              icon="photo"
              label={
                picked.length === 1
                  ? t("1 görsel kaydet", "Save 1 image")
                  : t(
                      `${picked.length} görsel kaydet`,
                      `Save ${picked.length} images`,
                    )
              }
              disabled={picked.length === 0}
              onPress={() => onStart(picked)}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Theme.bg,
    paddingTop: Space.l,
    gap: Space.m,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Space.gutter,
  },
  title: { flexShrink: 1, fontSize: 20, fontWeight: "700", color: Theme.text },
  close: {
    width: 44,
    height: 44,
    margin: -Space.s,
    alignItems: "center",
    justifyContent: "center",
  },
  note: {
    fontSize: 13,
    lineHeight: 18,
    color: Theme.muted,
    paddingHorizontal: Space.gutter,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Space.m,
    paddingHorizontal: Space.gutter,
    paddingBottom: Space.l,
  },
  tile: { gap: Space.xs },
  thumb: {
    borderRadius: Radius.s,
    overflow: "hidden",
    backgroundColor: Theme.raised,
  },
  ring: {
    ...StyleSheet.absoluteFill,
    borderRadius: Radius.s,
    borderWidth: 2,
    borderColor: Theme.text,
  },
  tick: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.text,
  },
  name: {
    minHeight: 32,
    fontSize: 13,
    lineHeight: 16,
    textAlign: "center",
    color: Theme.muted,
  },
  nameOn: { color: Theme.text, fontWeight: "600" },
  actions: { gap: Space.m, paddingHorizontal: Space.gutter },
});
