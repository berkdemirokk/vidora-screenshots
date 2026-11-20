import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import type { Ratio } from "./studio";
import { clockLabel } from "./studio/flipbook";
import {
  TRANSPORT_HEIGHT,
  TransportButton,
  type TransportStatus,
} from "./studio/preview-player";
import { CaptionOverlay, PLATE, type PreviewCaptions } from "./caption-overlay";
import { CAPTION_LAYOUT } from "./captions";
import type { Fit, TitlePosition } from "./project-state";
import { Button, Icon, MaxScale, Radius, Space, Theme, useT } from "./ui";

/** Width / height of each export shape. */
export const ASPECT: Record<Ratio, number> = {
  "16:9": 16 / 9,
  "9:16": 9 / 16,
  "1:1": 1,
};

/**
 * The desk's preview: the selected clip in a frame of the export shape
 * (ink letterbox, Radius.xl), looping between `start` and `end` (seconds).
 * Tapping the video plays or pauses. The transport row under it carries
 * play, a scrub rail over the trimmed range and a clock relative to the
 * trim, or the export's progress with İptal. The title and captions are
 * drawn in proportion to the frame like the exporter draws them.
 *
 * TODO(app-flow Transport row): preview-player.tsx exports TransportButton
 * and TransportStatus but its row is built into the flipbook PreviewPlayer;
 * swap this row for the shared one once it is exported for video players.
 */
export function DeskPreview({
  uri,
  box,
  rowWidth,
  fit,
  start,
  end,
  volume,
  title,
  titlePosition,
  captions,
  status = null,
  paused = false,
}: {
  uri: string;
  /** Size of the video frame; the transport row is added below it. */
  box: { width: number; height: number };
  /** Width of the transport row (the stage width), at least the frame's. */
  rowWidth?: number;
  fit: Fit;
  start: number;
  /** `end <= start` plays the whole file (duration unknown). */
  end: number;
  volume: number;
  title: string;
  titlePosition: TitlePosition;
  /** Cues on the final timeline plus this file's offset into it. */
  captions: PreviewCaptions | null;
  status?: TransportStatus;
  /** Stops playback (e.g. while the export runs). */
  paused?: boolean;
}) {
  const t = useT();
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(start);
  const [titleHeight, setTitleHeight] = useState(0);
  const [railWidth, setRailWidth] = useState(0);
  const range = useRef({ start, end });
  const player = useVideoPlayer(uri, (created) => {
    created.loop = true;
    created.timeUpdateEventInterval = 0.1;
    created.volume = Math.min(1, Math.max(0, volume));
    if (start > 0) created.currentTime = start;
  });
  // The player may already be released while effects clean up; ignore that.
  function withPlayer(change: () => void) {
    try {
      change();
    } catch {
      // Released player: nothing left to control.
    }
  }

  useEffect(() => {
    const previous = range.current;
    range.current = { start, end };
    if (previous.start !== start) {
      withPlayer(() => {
        player.currentTime = start;
      });
      setTime(start);
    } else if (previous.end !== end && end > start) {
      // Show the frame at the new out-point while it is being adjusted.
      const at = Math.max(start, end - 0.05);
      withPlayer(() => {
        player.pause();
        player.currentTime = at;
      });
      setPlaying(false);
      setTime(at);
    }
  }, [player, start, end]);

  useEffect(() => {
    withPlayer(() => {
      player.volume = Math.min(1, Math.max(0, volume));
    });
  }, [player, volume]);

  useEffect(() => {
    if (!paused) return;
    withPlayer(() => player.pause());
    setPlaying(false);
  }, [player, paused]);

  useEffect(() => {
    const subscription = player.addListener("timeUpdate", (event) => {
      setTime(event.currentTime);
      const { start: from, end: to } = range.current;
      if (to <= from) return;
      if (event.currentTime >= to || event.currentTime < from - 0.25)
        withPlayer(() => {
          player.currentTime = from;
        });
    });
    return () => subscription.remove();
  }, [player]);

  function toggle() {
    if (paused) return;
    withPlayer(() => {
      if (playing) {
        player.pause();
      } else {
        const { start: from, end: to } = range.current;
        const now = player.currentTime;
        if (to > from && (now >= to - 0.06 || now < from))
          player.currentTime = from;
        player.play();
      }
      setPlaying(!playing);
    });
  }

  const trimmed = end > start;
  const length = trimmed ? end - start : 0;
  const position = trimmed ? Math.min(length, Math.max(0, time - start)) : time;
  function seek(seconds: number) {
    const at = trimmed
      ? Math.min(end - 0.05, Math.max(start, start + seconds))
      : Math.max(0, seconds);
    withPlayer(() => {
      player.currentTime = at;
    });
    setTime(at);
  }
  function scrub(event: GestureResponderEvent) {
    if (!trimmed || railWidth <= 0) return;
    const fraction = Math.min(
      1,
      Math.max(0, event.nativeEvent.locationX / railWidth),
    );
    seek(fraction * length);
  }

  let row: ReactNode;
  if (status?.kind === "rendering") {
    const percent = Math.round(Math.min(1, Math.max(0, status.progress)) * 100);
    row = (
      <>
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={t("Dışa aktarılıyor", "Exporting")}
          accessibilityValue={{ min: 0, max: 100, now: percent }}
          style={styles.renderTrack}
        >
          <View style={[styles.renderFill, { width: `${percent}%` }]} />
        </View>
        <Text maxFontSizeMultiplier={MaxScale.chrome} style={styles.percent}>
          {t("%" + percent, percent + "%")}
        </Text>
        <Button
          plain
          testID="desk-export-cancel"
          label={t("İptal", "Cancel")}
          accessibilityLabel={t("Dışa aktarmayı iptal et", "Cancel export")}
          onPress={status.onCancel}
        />
      </>
    );
  } else if (status?.kind === "busy" || status?.kind === "done") {
    row = (
      <View style={styles.statusLine}>
        {status.kind === "busy" ? (
          <ActivityIndicator size="small" color={Theme.muted} />
        ) : (
          <Icon name="checkmark" size={13} color={Theme.text} />
        )}
        <Text
          maxFontSizeMultiplier={MaxScale.chrome}
          numberOfLines={2}
          style={styles.footnote}
        >
          {status.text}
        </Text>
      </View>
    );
  } else {
    const fill = trimmed && length > 0 ? position / length : 0;
    row = (
      <>
        <TransportButton
          testID="desk-play"
          icon={playing ? "pause.fill" : "play.fill"}
          label={playing ? t("Durdur", "Pause") : t("Oynat", "Play")}
          disabled={paused}
          onPress={toggle}
        />
        <View
          testID="desk-scrub"
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={t("Önizleme konumu", "Preview position")}
          accessibilityValue={{ text: clockLabel(position) }}
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
          onAccessibilityAction={(event) => {
            if (!trimmed) return;
            const step = Math.max(0.5, length / 10);
            if (event.nativeEvent.actionName === "increment")
              seek(position + step);
            if (event.nativeEvent.actionName === "decrement")
              seek(position - step);
          }}
          onLayout={(event: LayoutChangeEvent) =>
            setRailWidth(event.nativeEvent.layout.width)
          }
          onStartShouldSetResponder={() => trimmed}
          onMoveShouldSetResponder={() => trimmed}
          onResponderTerminationRequest={() => false}
          onResponderGrant={(event) => {
            withPlayer(() => player.pause());
            setPlaying(false);
            scrub(event);
          }}
          onResponderMove={scrub}
          style={styles.track}
        >
          <View style={styles.rail} pointerEvents="none">
            <View style={[styles.fill, { width: `${fill * 100}%` }]} />
          </View>
        </View>
        <Text maxFontSizeMultiplier={MaxScale.chrome} style={styles.time}>
          {clockLabel(position)}
          {trimmed ? " / " + clockLabel(length) : ""}
        </Text>
      </>
    );
  }

  const hasTitle = !!title.trim();
  // The exporter's title box: font 3.5 % of the height, 5 % from the edge,
  // padding 0.7 / 0.4 × the font size on a dark plate.
  const titleFont = box.height * CAPTION_LAYOUT.titleFont;
  const titleMargin = box.height * CAPTION_LAYOUT.titleMargin;
  const titlePad = { x: titleFont * 0.7, y: titleFont * 0.4 };
  return (
    <View
      style={{
        width: Math.max(box.width, rowWidth ?? 0),
        alignItems: "center",
      }}
    >
      <View style={[styles.frame, box]}>
        <VideoView
          style={StyleSheet.absoluteFill}
          player={player}
          nativeControls={false}
          contentFit={fit}
        />
        <Pressable
          testID="desk-preview"
          accessibilityRole="button"
          accessibilityLabel={t("Klip önizlemesi", "Clip preview")}
          accessibilityHint={t(
            "Oynatmak veya durdurmak için dokun",
            "Tap to play or pause",
          )}
          onPress={toggle}
          style={StyleSheet.absoluteFill}
        />
        {hasTitle && (
          <View
            accessible={false}
            style={[
              styles.overlay,
              titlePosition === "top"
                ? { top: titleMargin }
                : titlePosition === "bottom"
                  ? { bottom: titleMargin }
                  : { top: 0, bottom: 0, justifyContent: "center" },
            ]}
          >
            <View
              onLayout={(event: LayoutChangeEvent) =>
                setTitleHeight(event.nativeEvent.layout.height)
              }
              style={{
                backgroundColor: PLATE,
                borderRadius: titleFont * 0.35,
                paddingHorizontal: titlePad.x,
                paddingVertical: titlePad.y,
                maxHeight: box.height * 0.4 + 2 * titlePad.y,
                overflow: "hidden",
              }}
            >
              <Text
                allowFontScaling={false}
                style={[
                  styles.title,
                  {
                    fontSize: titleFont,
                    maxWidth: box.width - 2 * titleMargin - 2 * titlePad.x,
                  },
                ]}
              >
                {title}
              </Text>
            </View>
          </View>
        )}
        {captions && (
          <CaptionOverlay
            player={player}
            captions={captions}
            frame={{
              ...box,
              title: hasTitle
                ? { position: titlePosition, height: titleHeight }
                : null,
            }}
          />
        )}
      </View>
      <View style={styles.controls}>{row}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: Radius.xl,
    overflow: "hidden",
    // Letterbox around a fitted clip.
    backgroundColor: Theme.text,
  },
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    pointerEvents: "none",
  },
  title: { color: Theme.onMedia, fontWeight: "700", textAlign: "center" },
  controls: {
    alignSelf: "stretch",
    minHeight: TRANSPORT_HEIGHT - Space.xs,
    marginTop: Space.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s,
  },
  track: { flex: 1, minWidth: 48, height: 36, justifyContent: "center" },
  rail: {
    height: 3,
    borderRadius: 2,
    overflow: "hidden",
    backgroundColor: Theme.line,
  },
  fill: { height: "100%", backgroundColor: Theme.text },
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
  renderTrack: {
    flex: 1,
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
