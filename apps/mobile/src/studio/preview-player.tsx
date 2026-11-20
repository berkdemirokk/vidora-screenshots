import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from "react-native";
import { Button, Icon, Radius, Space, Theme, useT, type IconName } from "../ui";
import { clockLabel, frameInterval } from "./flipbook";
import { CHROME_SCALE } from "./controls";
import type { Flipbook } from "./use-playing-preview";

/** Height of the transport row under the frame, including its top gap. */
export const TRANSPORT_HEIGHT = 44;

/**
 * What the transport row shows instead of the player controls. While
 * rendering: `started` turns true with the first progress event (until then
 * the native side is still preparing and the bar would only say "0%");
 * `stalled` adds the quiet "taking longer" note; `cancelling` replaces the
 * line with "Cancelling…" and disables İptal. All three are optional for the
 * other editor (app/editor.tsx): absent means started, not stalled, not
 * cancelling, the old percentage line.
 */
export type TransportStatus =
  | {
      kind: "rendering";
      progress: number;
      started?: boolean;
      stalled?: boolean;
      cancelling?: boolean;
      /** The cancel has not settled for a long while. */
      cancelSlow?: boolean;
      onCancel: () => void;
    }
  | { kind: "busy"; text: string }
  | { kind: "done"; text: string }
  | null;

/**
 * A round 36 pt button for the transport row: no fill, a 44 pt target
 * (hitSlop 4) so neighbours touch but never overlap.
 */
export function TransportButton({
  icon,
  label,
  onPress,
  disabled = false,
  testID,
  solid = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
  /** Vitrin play button: round ink fill, accent glyph. */
  solid?: boolean;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        solid && styles.buttonSolid,
        pressed && { backgroundColor: Theme.pressed },
        disabled && { opacity: 0.4 },
      ]}
    >
      <Icon name={icon} size={17} color={solid ? Theme.accent : Theme.text} />
    </Pressable>
  );
}

/**
 * The ready transport row, presentational so it can drive the flipbook or
 * an expo-video player: play/pause, a scrub rail (ink fill), a small busy
 * slot, the clock and trailing buttons. Positions are in seconds.
 */
export function TransportRow({
  playing,
  position,
  duration,
  onToggle,
  onScrub,
  onScrubStart,
  onScrubEnd,
  canPlay = true,
  busy = false,
  trailing,
  playTestID = "preview-play",
  scrubLabel,
}: {
  playing: boolean;
  /** Seconds shown now. */
  position: number;
  /** Seconds in all (0 hides nothing but disables scrubbing). */
  duration: number;
  onToggle: () => void;
  /** Called while dragging (and for VoiceOver steps) with the new seconds. */
  onScrub: (seconds: number) => void;
  /** The finger went down on the rail (pause here if needed). */
  onScrubStart?: () => void;
  /** The finger left the rail. */
  onScrubEnd?: (seconds: number) => void;
  canPlay?: boolean;
  /** Shows the small spinner next to the clock. */
  busy?: boolean;
  trailing?: ReactNode;
  playTestID?: string;
  /** VoiceOver name of the rail; default "Önizleme konumu". */
  scrubLabel?: string;
}) {
  const t = useT();
  const [width, setWidth] = useState(0);
  const last = useRef(position);
  const toSeconds = (x: number) =>
    width > 0 && duration > 0
      ? Math.min(duration, Math.max(0, (x / width) * duration))
      : 0;
  const scrub = (event: GestureResponderEvent) => {
    const seconds = toSeconds(event.nativeEvent.locationX);
    last.current = seconds;
    onScrub(seconds);
  };
  const share =
    duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0;
  return (
    <View style={styles.row}>
      <TransportButton
        testID={playTestID}
        icon={playing ? "pause.fill" : "play.fill"}
        label={playing ? t("Durdur", "Pause") : t("Oynat", "Play")}
        disabled={!canPlay}
        solid
        onPress={onToggle}
      />
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={
          scrubLabel ?? t("Önizleme konumu", "Preview position")
        }
        accessibilityValue={{ text: clockLabel(position) }}
        onAccessibilityAction={(event) => {
          if (!(duration > 0)) return;
          const step = duration / 10;
          if (event.nativeEvent.actionName === "increment")
            onScrub(Math.min(duration, position + step));
          if (event.nativeEvent.actionName === "decrement")
            onScrub(Math.max(0, position - step));
        }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => duration > 0}
        onMoveShouldSetResponder={() => duration > 0}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(event) => {
          onScrubStart?.();
          scrub(event);
        }}
        onResponderMove={scrub}
        onResponderRelease={() => onScrubEnd?.(last.current)}
        style={styles.track}
      >
        <View style={styles.rail} pointerEvents="none">
          <View style={[styles.fill, { width: `${share * 100}%` }]} />
        </View>
        <View
          pointerEvents="none"
          style={[styles.knob, { left: `${share * 100}%` }]}
        />
      </View>
      <View style={styles.busySlot}>
        {busy && <ActivityIndicator size="small" color={Theme.muted} />}
      </View>
      <Text maxFontSizeMultiplier={CHROME_SCALE} style={styles.time}>
        {clockLabel(duration)}
      </Text>
      {trailing}
    </View>
  );
}

/**
 * The editor's live preview: flips through the native frames in a loop.
 * Nothing is drawn on the frame. The transport row under it carries every
 * state: loading, failed (tap to retry), ready (play, scrub, clock), the
 * render's progress with İptal, busy work and a short success line.
 */
export function PreviewPlayer({
  box,
  rowWidth,
  flipbook,
  updating,
  failed = false,
  onRetry,
  placeholder,
  trailing,
  status = null,
  paused = false,
  autoPlay = true,
  onPlayback,
  lifted = false,
  compact = false,
}: {
  /** Size of the video frame; the transport row is added below it. */
  box: { width: number; height: number };
  /** Width of the transport row (the stage width), at least the frame's. */
  rowWidth?: number;
  /** Extra buttons at the end of the transport row (mute, last video, photo). */
  trailing?: ReactNode;
  flipbook: Flipbook | null;
  updating: boolean;
  /** The preview passes gave up for this spec. */
  failed?: boolean;
  onRetry?: () => void;
  placeholder: ReactNode;
  status?: TransportStatus;
  /** Stops playback (e.g. while the real video renders). */
  paused?: boolean;
  /** Start playing on its own; false with Reduce Motion. */
  autoPlay?: boolean;
  /**
   * Called when playback starts, stops or loops, with the time shown, so
   * the preview music can follow the frames.
   */
  onPlayback?: (playing: boolean, time: number) => void;
  /** Vitrin: lifted frame with one soft shadow. */
  lifted?: boolean;
  /** Thumbnail mode: the transport row is hidden (state stays alive). */
  compact?: boolean;
}) {
  const t = useT();
  const [playing, setPlaying] = useState(autoPlay),
    [index, setIndex] = useState(0),
    [slowUpdate, setSlowUpdate] = useState(false);
  const count = flipbook?.uris.length ?? 0,
    duration = flipbook?.duration ?? 0,
    current = count > 0 ? index % count : 0,
    // The frame underneath is the one shown before; it covers the moment a
    // new frame is still being decoded, so the preview never flashes empty.
    below = count > 0 ? (current + count - 1) % count : 0,
    running = playing && !paused && !failed && count > 1;

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(
      () => setIndex((value) => (value + 1) % count),
      frameInterval(duration, count),
    );
    return () => clearInterval(timer);
  }, [running, count, duration]);

  // Reduce Motion switched on while open: stop the loop.
  useEffect(() => {
    if (!autoPlay) setPlaying(false);
  }, [autoPlay]);

  // The small busy spinner shows only when an update takes a moment.
  useEffect(() => {
    if (!updating) {
      setSlowUpdate(false);
      return;
    }
    const timer = setTimeout(() => setSlowUpdate(true), 300);
    return () => clearTimeout(timer);
  }, [updating]);

  // A failure is said once, not shown silently.
  const failText = t(
    "Önizleme hazırlanamadı.",
    "The preview could not be made.",
  );
  useEffect(() => {
    if (failed) AccessibilityInfo.announceForAccessibility(failText);
    // Only when it starts failing.
  }, [failed]);

  // Report start, stop and each loop back to the first frame.
  const startTime = count > 0 ? (current / count) * duration : 0;
  const looped = running && current === 0;
  const report = useRef(onPlayback);
  report.current = onPlayback;
  const timeAtChange = useRef(startTime);
  timeAtChange.current = startTime;
  const last = useRef<{
    running: boolean;
    looped: boolean;
    flipbook: Flipbook | null;
  }>({ running: false, looped: false, flipbook: null });
  useEffect(() => {
    const before = last.current;
    last.current = { running, looped, flipbook };
    const changed =
      before.running !== running ||
      before.flipbook !== flipbook ||
      (looped && !before.looped);
    if (changed) report.current?.(running, running ? timeAtChange.current : 0);
  }, [running, looped, flipbook]);
  useEffect(() => () => report.current?.(false, 0), []);

  const time = count > 0 ? (current / count) * duration : 0;
  const canPlay = count > 1 && !paused;

  let row: ReactNode;
  if (status?.kind === "rendering") {
    const percent = Math.round(Math.min(1, Math.max(0, status.progress)) * 100);
    // One line says what is true now: cancelling, taking long, still
    // preparing (no progress yet), or the percentage.
    const started = status.started ?? true,
      cancelling = status.cancelling ?? false,
      stalled = status.stalled ?? false;
    const line = cancelling
      ? status.cancelSlow
        ? t(
            "İptal uzun sürüyor. Ekrandan çıkıp tekrar açabilirsin.",
            "Cancelling is taking long. You can leave this screen and reopen it.",
          )
        : t("İptal ediliyor…", "Cancelling…")
      : stalled
        ? t(
            "Beklenenden uzun sürüyor. Bekleyebilir ya da iptal edebilirsin.",
            "Taking longer than expected. You can wait or cancel.",
          )
        : !started
          ? t(
              "Hazırlanıyor… · Bitene kadar açık kalsın",
              "Preparing… · Keep Vidora open",
            )
          : t(
              "%" + percent + " · Bitene kadar açık kalsın",
              percent + "% · Keep Vidora open",
            );
    row = (
      <View style={styles.renderRow}>
        <View style={styles.renderColumn}>
          <View style={styles.renderLine}>
            {!started && !cancelling && !stalled && (
              <ActivityIndicator size="small" color={Theme.muted} />
            )}
            <Text
              numberOfLines={2}
              maxFontSizeMultiplier={CHROME_SCALE}
              style={styles.footnote}
            >
              {line}
            </Text>
          </View>
          <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={t("Video hazırlanıyor", "Rendering the video")}
            accessibilityValue={{ min: 0, max: 100, now: percent }}
            style={styles.renderTrack}
          >
            <View style={[styles.renderFill, { width: `${percent}%` }]} />
          </View>
        </View>
        <Button
          plain
          testID="render-cancel"
          label={t("İptal", "Cancel")}
          disabled={cancelling}
          onPress={status.onCancel}
        />
      </View>
    );
  } else if (status?.kind === "busy" || status?.kind === "done") {
    row = (
      <View style={styles.statusLine} accessibilityLiveRegion="polite">
        {status.kind === "busy" ? (
          <ActivityIndicator size="small" color={Theme.muted} />
        ) : (
          <Icon name="checkmark" size={13} color={Theme.text} />
        )}
        <Text
          maxFontSizeMultiplier={CHROME_SCALE}
          numberOfLines={2}
          style={styles.footnote}
        >
          {status.text}
        </Text>
      </View>
    );
  } else if (failed && count === 0) {
    row = (
      <Pressable
        testID="preview-retry"
        accessibilityRole="button"
        accessibilityLabel={failText + " " + t("Tekrar dene", "Try again")}
        onPress={onRetry}
        style={({ pressed }) => [
          styles.statusLine,
          pressed && { opacity: 0.6 },
        ]}
      >
        <Icon name="exclamationmark.circle" size={15} color={Theme.text} />
        <Text
          maxFontSizeMultiplier={CHROME_SCALE}
          numberOfLines={2}
          style={styles.footnote}
        >
          {failText + " "}
          <Text style={styles.retry}>{t("Tekrar dene", "Try again")}</Text>
        </Text>
      </Pressable>
    );
  } else if (count === 0 && updating) {
    row = (
      <View
        style={styles.statusLine}
        accessible
        accessibilityState={{ busy: true }}
        accessibilityLabel={t("Önizleme hazırlanıyor", "Preparing the preview")}
      >
        <ActivityIndicator size="small" color={Theme.muted} />
        <Text maxFontSizeMultiplier={CHROME_SCALE} style={styles.footnote}>
          {t("Önizleme hazırlanıyor", "Preparing the preview")}
        </Text>
        <View style={{ flex: 1 }} />
        {trailing}
      </View>
    );
  } else if (count > 0) {
    row = (
      <TransportRow
        playing={running}
        position={time}
        duration={duration}
        canPlay={canPlay}
        busy={slowUpdate}
        onToggle={() => setPlaying((value) => !value)}
        onScrubStart={() => setPlaying(false)}
        onScrub={(seconds) =>
          setIndex(
            Math.min(
              count - 1,
              Math.max(
                0,
                Math.floor((seconds / Math.max(0.001, duration)) * count),
              ),
            ),
          )
        }
        trailing={trailing}
      />
    );
  } else {
    // No frames and nothing on the way: an empty row (never a dead 0:00).
    row = (
      <>
        <View style={{ flex: 1 }} />
        {trailing}
      </>
    );
  }

  return (
    <View
      style={{
        width: Math.max(box.width, rowWidth ?? 0),
        alignItems: "center",
      }}
    >
      <View style={lifted ? [styles.lift, box] : undefined}>
        <View style={[styles.frame, box]}>
          {flipbook ? (
            <Pressable
              accessibilityRole="image"
              accessibilityLabel={t("Video önizlemesi", "Video preview")}
              accessibilityHint={t(
                "Oynatmak veya durdurmak için dokun",
                "Tap to play or pause",
              )}
              // While the video renders (or the result covers it) the frame
              // is frozen: a tap must not flip the play state it resumes in.
              onPress={() => {
                if (!paused) setPlaying((value) => !value);
              }}
              style={StyleSheet.absoluteFill}
            >
              <Image
                source={{ uri: flipbook.uris[below] }}
                resizeMode="cover"
                style={StyleSheet.absoluteFill}
              />
              <Image
                source={{ uri: flipbook.uris[current] }}
                resizeMode="cover"
                style={StyleSheet.absoluteFill}
              />
            </Pressable>
          ) : (
            placeholder
          )}
        </View>
      </View>
      <View style={[styles.controls, compact && { display: "none" }]}>
        {row}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: Radius.xl,
    overflow: "hidden",
    backgroundColor: Theme.surface,
  },
  controls: {
    alignSelf: "stretch",
    minHeight: TRANSPORT_HEIGHT - Space.xs,
    marginTop: Space.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s,
  },
  lift: {
    borderRadius: Radius.xl,
    backgroundColor: Theme.surface,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
  },
  buttonSolid: { backgroundColor: Theme.text },
  knob: {
    position: "absolute",
    top: 9,
    width: 18,
    height: 18,
    marginLeft: -9,
    borderRadius: 9,
    backgroundColor: Theme.accent,
    borderWidth: 3,
    borderColor: Theme.text,
  },
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  row: { flex: 1, flexDirection: "row", alignItems: "center", gap: Space.s },
  track: { flex: 1, minWidth: 48, height: 36, justifyContent: "center" },
  rail: {
    height: 5,
    borderRadius: 3,
    overflow: "hidden",
    backgroundColor: Theme.line,
  },
  fill: { height: "100%", backgroundColor: Theme.text },
  busySlot: { width: 20, alignItems: "center" },
  time: {
    fontSize: 13,
    lineHeight: 18,
    color: Theme.muted,
    fontVariant: ["tabular-nums"],
  },
  statusLine: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s,
    minHeight: 36,
  },
  footnote: { flexShrink: 1, fontSize: 13, lineHeight: 18, color: Theme.muted },
  retry: { fontWeight: "600", color: Theme.text },
  renderColumn: { flex: 1, justifyContent: "center", gap: Space.xs },
  renderLine: { flexDirection: "row", alignItems: "center", gap: Space.s },
  renderRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s,
  },
  renderTrack: {
    alignSelf: "stretch",
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
    backgroundColor: Theme.line,
  },
  renderFill: { height: "100%", backgroundColor: Theme.text },
  percent: {
    minWidth: 40,
    textAlign: "right",
    fontSize: 13,
    fontWeight: "600",
    color: Theme.muted,
    fontVariant: ["tabular-nums"],
  },
});
