import {
  useEffect,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
} from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  findNodeHandle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useVideoPlayer, VideoView } from "expo-video";
import {
  Button,
  Face,
  Icon,
  MaxScale,
  Radius,
  SaveShareRow,
  Space,
  Theme,
  useT,
  useUpper,
} from "../ui";
import { SINGLE_FLOW } from "../config";
import { CHROME_SCALE, useReduceMotion } from "./controls";
import { clockLabel } from "./flipbook";

/**
 * The finished video over the editor. Single flow (Vitrin): the video plays
 * at full width from the top with a thin progress line and a "HAZIR · 0:12"
 * chip; an ink action bar with rounded top corners holds Save, Share and
 * "Bitti". Otherwise: a row with Save and Share, "Görsel olarak kaydet…" and
 * a status line.
 */
export function ResultView({
  uri,
  busy,
  busyLabel,
  saved = false,
  error,
  errorAction,
  onSave,
  onShare,
  onSaveStill,
  autoPlay = true,
  note,
  aspect = 9 / 16,
  duration,
  onDone,
  onEdit,
}: {
  uri: string;
  busy: boolean;
  /** Busy work started here ("Kaydediliyor…"), shown in the status line. */
  busyLabel?: string | null;
  /** Saved to Photos: the save button says so and Share leads. */
  saved?: boolean;
  /** A problem, shown in the status line with an icon. */
  error?: string | null;
  /** e.g. "Ayarları aç" next to a permission problem. */
  errorAction?: ReactNode;
  onSave: () => void;
  onShare: () => void;
  /** Opens the still choices; left out when the build cannot save stills. */
  onSaveStill?: () => void;
  /** False with Reduce Motion: the video waits for the play button. */
  autoPlay?: boolean;
  /** What happened in the library (added, or replaced the earlier one). */
  note?: string;
  /** Width / height of the video (9:16, 4:5 or 1:1). */
  aspect?: number;
  /** Length of the video in seconds, for the "HAZIR · 0:12" chip. */
  duration?: number;
  /** "Bitti" in the action bar (single flow): leaves to Home. */
  onDone?: () => void;
  /** "Düzenle" in the action bar (single flow): back to the editor. */
  onEdit?: () => void;
}) {
  const t = useT(),
    insets = useSafeAreaInsets(),
    reduceMotion = useReduceMotion(),
    upper = useUpper();
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  const [stage, setStage] = useState({ width: 0, height: 0 });
  // Height of the single flow's action bar (measured).
  const [barHeight, setBarHeight] = useState(0);
  // As large as the stage allows, in the video's own shape.
  const height = Math.min(stage.height, stage.width / aspect),
    box = { width: height * aspect, height };
  const player = useVideoPlayer(uri, (created) => {
    created.loop = true;
    if (autoPlay) created.play();
  });

  // Single flow: progress line and tap on the video to pause / play.
  const [progress, setProgress] = useState(0);
  const [length, setLength] = useState(duration ?? 0);
  const [paused, setPaused] = useState(!autoPlay);
  useEffect(() => {
    if (!SINGLE_FLOW) return;
    player.timeUpdateEventInterval = 0.25;
    const sub = player.addListener("timeUpdate", (event) => {
      const total = player.duration > 0 ? player.duration : (duration ?? 0);
      if (player.duration > 0) setLength(player.duration);
      if (total > 0) setProgress(Math.min(1, event.currentTime / total));
    });
    return () => sub.remove();
  }, [player, duration]);
  function toggle() {
    if (player.playing) {
      player.pause();
      setPaused(true);
    } else {
      player.play();
      setPaused(false);
    }
  }

  // The bar pulses once when the save lands (off under Reduce Motion).
  const pulse = useRef(new Animated.Value(0)).current;
  const wasSaved = useRef(saved);
  useEffect(() => {
    if (saved && !wasSaved.current && !reduceMotion) {
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 140,
          useNativeDriver: true,
        }),
        Animated.spring(pulse, { toValue: 0, useNativeDriver: true }),
      ]).start();
    }
    wasSaved.current = saved;
  }, [saved, reduceMotion, pulse]);

  // VoiceOver lands on the status line when the result appears.
  const statusRef = useRef<ComponentRef<typeof Text>>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      const node = statusRef.current ? findNodeHandle(statusRef.current) : null;
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  // The spinner shows only when the work takes a moment.
  const [showBusy, setShowBusy] = useState(false);
  useEffect(() => {
    if (!busyLabel) {
      setShowBusy(false);
      return;
    }
    const timer = setTimeout(() => setShowBusy(true), 300);
    return () => clearTimeout(timer);
  }, [busyLabel]);

  // Single flow: the line says where the video is, before and after saving.
  const status = SINGLE_FLOW
    ? saved
      ? t(
          "Fotoğraflar'a kaydedildi. Paylaşabilirsin.",
          "Saved to Photos. Ready to share.",
        )
      : note ||
        t(
          "Kitaplık'ta duruyor. Paylaşmak için Fotoğraflar'a kaydet.",
          "It's in your Library. Save to Photos to share.",
        )
    : note || t("Kitaplık'a eklendi.", "Added to your Library.");

  if (SINGLE_FLOW) {
    const chip =
      upper(t("Hazır", "Ready")) + " · " + clockLabel(duration ?? length);
    // The video runs down behind the bar's rounded corners: its box is the
    // space above the bar's top edge plus the corner radius. It shows whole
    // (contain), sits directly on the bar, and is as wide as its shape and
    // that height allow.
    const space = barHeight > 0 ? frame.height - barHeight : 0;
    const videoHeight = Math.min(space, frame.width / aspect);
    const videoWidth = Math.min(frame.width, videoHeight * aspect);
    return (
      <View
        style={styles.root}
        onLayout={(event) => {
          const { width, height: h } = event.nativeEvent.layout;
          setFrame({ width, height: h });
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            paused
              ? t("Videoyu oynat", "Play video")
              : t("Videoyu duraklat", "Pause video")
          }
          onPress={toggle}
          style={[
            styles.heroVideo,
            {
              width: videoWidth,
              height: videoHeight,
              top: Math.max(0, space - videoHeight),
              left: (frame.width - videoWidth) / 2,
            },
          ]}
        >
          <VideoView
            style={StyleSheet.absoluteFill}
            player={player}
            nativeControls={false}
            contentFit="contain"
          />
        </Pressable>
        <View
          pointerEvents="none"
          style={[styles.track, { top: insets.top + 4 }]}
        >
          <View
            style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]}
          />
        </View>
        <View
          style={[styles.chip, { top: insets.top + Space.l }]}
          pointerEvents="none"
        >
          <Text style={styles.chipText} maxFontSizeMultiplier={1.2}>
            {chip}
          </Text>
        </View>
        <Animated.View
          onLayout={(event) => setBarHeight(event.nativeEvent.layout.height)}
          style={[
            styles.bar,
            {
              paddingBottom: Math.max(insets.bottom, Space.l),
              transform: [
                {
                  translateY: pulse.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -6],
                  }),
                },
              ],
            },
          ]}
        >
          {saved ? (
            <Button
              onInk
              done
              large
              icon="checkmark"
              label={t("Kaydedildi", "Saved")}
              accessibilityLabel={t(
                "Fotoğraflar'a kaydedildi",
                "Saved to Photos",
              )}
              testID="save-photos"
              onPress={() => {}}
            />
          ) : (
            <Button
              onInk
              primary
              large
              busy={busy}
              label={t("Fotoğraflar'a kaydet", "Save to Photos")}
              testID="save-photos"
              maxFontSizeMultiplier={MaxScale.chrome}
              onPress={onSave}
            />
          )}
          <Button
            onInk
            large
            primary={saved}
            disabled={busy}
            label={t("Paylaş", "Share")}
            testID="share"
            maxFontSizeMultiplier={MaxScale.chrome}
            onPress={onShare}
          />
          {(onDone || onEdit) && (
            <View style={styles.lastRow}>
              {onEdit ? (
                <Pressable
                  accessibilityRole="button"
                  testID="result-edit"
                  onPress={onEdit}
                  hitSlop={{ top: 4, bottom: 4, left: 8, right: 8 }}
                  style={styles.textButton}
                >
                  <Text
                    style={styles.doneText}
                    maxFontSizeMultiplier={MaxScale.chrome}
                  >
                    {t("Düzenle", "Edit")}
                  </Text>
                </Pressable>
              ) : (
                <View />
              )}
              {onDone && (
                <Pressable
                  accessibilityRole="button"
                  testID="result-bar-done"
                  onPress={onDone}
                  hitSlop={{ top: 4, bottom: 4, left: 8, right: 8 }}
                  style={styles.textButton}
                >
                  <Text
                    style={styles.doneText}
                    maxFontSizeMultiplier={MaxScale.chrome}
                  >
                    {t("Bitti", "Done")}
                  </Text>
                </Pressable>
              )}
            </View>
          )}
          <View style={styles.statusBox}>
            {error ? (
              <View style={styles.errorLine}>
                <Icon
                  name="exclamationmark.circle"
                  size={15}
                  color={Theme.raised}
                />
                <Text
                  style={styles.statusOnInk}
                  accessibilityLiveRegion="polite"
                  maxFontSizeMultiplier={CHROME_SCALE}
                >
                  {error}
                </Text>
              </View>
            ) : (
              <Text
                ref={statusRef}
                testID="result-status"
                style={styles.statusOnInk}
                accessibilityLiveRegion="polite"
                maxFontSizeMultiplier={CHROME_SCALE}
              >
                {status}
              </Text>
            )}
            {error ? errorAction : null}
            {showBusy && !!busyLabel && (
              <View style={styles.busyOnInk} pointerEvents="none">
                <ActivityIndicator size="small" color={Theme.raised} />
                <Text
                  style={styles.statusOnInk}
                  maxFontSizeMultiplier={CHROME_SCALE}
                >
                  {busyLabel}
                </Text>
              </View>
            )}
          </View>
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View
        style={styles.stage}
        onLayout={(event) => {
          const { width, height: h } = event.nativeEvent.layout;
          setStage({
            width: width - 2 * Space.gutter,
            height: h - Space.s,
          });
        }}
      >
        <View style={[styles.video, box]}>
          <VideoView
            style={StyleSheet.absoluteFill}
            player={player}
            nativeControls
            contentFit="contain"
          />
        </View>
      </View>
      <View
        style={[
          styles.actions,
          { paddingBottom: Math.max(insets.bottom, Space.l) },
        ]}
      >
        <SaveShareRow
          busy={busy}
          saved={saved}
          onSave={onSave}
          onShare={onShare}
          saveTestID="save-photos"
          shareTestID="share"
        />
        {onSaveStill && (
          <View style={styles.center}>
            <Button
              plain
              testID="result-image"
              label={t("Görsel olarak kaydet…", "Save as image…")}
              disabled={busy}
              onPress={onSaveStill}
            />
          </View>
        )}
        <View style={styles.statusBox}>
          {error ? (
            <View style={styles.errorLine}>
              <Icon
                name="exclamationmark.circle"
                size={15}
                color={Theme.text}
              />
              <Text
                style={styles.status}
                accessibilityLiveRegion="polite"
                maxFontSizeMultiplier={CHROME_SCALE}
              >
                {error}
              </Text>
            </View>
          ) : (
            <Text
              ref={statusRef}
              testID="result-status"
              style={styles.status}
              accessibilityLiveRegion="polite"
              maxFontSizeMultiplier={CHROME_SCALE}
            >
              {status}
            </Text>
          )}
          {error ? errorAction : null}
          {showBusy && !!busyLabel && (
            <View style={styles.busyLine} pointerEvents="none">
              <ActivityIndicator size="small" color={Theme.muted} />
              <Text style={styles.status} maxFontSizeMultiplier={CHROME_SCALE}>
                {busyLabel}
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

/** Rounded top corners of the single flow's action bar. */
const BAR_RADIUS = 26;

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Theme.bg,
  },
  heroVideo: {
    position: "absolute",
    overflow: "hidden",
  },
  track: {
    position: "absolute",
    left: Space.l,
    right: Space.l,
    height: 3,
    borderRadius: 2,
    backgroundColor: Theme.scrimSoft,
    overflow: "hidden",
  },
  fill: { height: 3, borderRadius: 2, backgroundColor: Theme.text },
  chip: {
    position: "absolute",
    right: Space.l,
    backgroundColor: Theme.text,
    borderRadius: 20,
    paddingVertical: 7,
    paddingHorizontal: 11,
  },
  chipText: {
    fontFamily: Face.extra,
    fontWeight: "800",
    fontSize: 11,
    letterSpacing: 1.1,
    color: Theme.accent,
  },
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Theme.text,
    borderTopLeftRadius: BAR_RADIUS,
    borderTopRightRadius: BAR_RADIUS,
    paddingTop: 14,
    paddingHorizontal: Space.l,
    gap: 10,
  },
  lastRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  textButton: {
    minHeight: 48,
    minWidth: 64,
    paddingHorizontal: Space.s,
    justifyContent: "center",
  },
  doneText: {
    fontFamily: Face.extra,
    fontWeight: "800",
    fontSize: 16,
    color: Theme.accent,
    textAlign: "center",
  },
  statusOnInk: {
    flexShrink: 1,
    fontFamily: Face.bold,
    fontWeight: "700",
    fontSize: 13,
    lineHeight: 18,
    color: Theme.raised,
    textAlign: "center",
  },
  busyOnInk: {
    ...StyleSheet.absoluteFill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Space.s,
    backgroundColor: Theme.text,
  },
  stage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Space.gutter,
    paddingTop: Space.s,
  },
  video: {
    borderRadius: Radius.xl,
    overflow: "hidden",
    backgroundColor: Theme.surface,
  },
  actions: {
    gap: Space.m,
    paddingHorizontal: Space.gutter,
    paddingTop: Space.l,
  },
  center: { flexDirection: "row", justifyContent: "center" },
  statusBox: {
    minHeight: SINGLE_FLOW ? 24 : 36,
    alignItems: "center",
    gap: Space.s,
  },
  status: {
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 18,
    color: Theme.muted,
    textAlign: "center",
  },
  errorLine: { flexDirection: "row", alignItems: "center", gap: Space.s },
  busyLine: {
    ...StyleSheet.absoluteFill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Space.s,
    backgroundColor: Theme.bg,
  },
});
