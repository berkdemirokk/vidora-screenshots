import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  Alert,
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type AccessibilityActionEvent,
  type LayoutChangeEvent,
} from "react-native";
import { clipRange } from "./studio";
import { MIN_TRIM_SECONDS, formatTime, roundTime } from "./project-state";
import {
  Field,
  MaxScale,
  Press,
  Radius,
  Space,
  Theme,
  Txt,
  s,
  useT,
} from "./ui";

/** Minimum touch target. */
const TARGET = 44;
/** Trimmer strip height and the ink handle bars beside the kept range. */
const STRIP = 56;
const BAR = 16;
/** Slider thumb. */
const THUMB = 28;

/** Follows a PanResponder drag in track units; `latest` keeps props fresh. */
function useDrag(
  latest: RefObject<{
    value: number;
    min: number;
    max: number;
    span: number;
    trackWidth: number;
    disabled?: boolean;
    onChange: (value: number) => void;
  }>,
) {
  const grabbedAt = useRef(0);
  return useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !latest.current.disabled,
        onMoveShouldSetPanResponder: () => !latest.current.disabled,
        // Keep the gesture while a surrounding ScrollView wants to scroll.
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          grabbedAt.current = latest.current.value;
        },
        onPanResponderMove: (_event, gesture) => {
          const { trackWidth, span, min, max, onChange } = latest.current;
          if (trackWidth <= 0 || span <= 0) return;
          const moved = grabbedAt.current + (gesture.dx / trackWidth) * span;
          onChange(Math.min(max, Math.max(min, moved)));
        },
      }),
    [latest],
  );
}

/** VoiceOver increment / decrement for an adjustable control. */
function adjust(
  event: AccessibilityActionEvent,
  value: number,
  step: number,
  min: number,
  max: number,
  onChange: (value: number) => void,
) {
  const direction =
    event.nativeEvent.actionName === "increment"
      ? 1
      : event.nativeEvent.actionName === "decrement"
        ? -1
        : 0;
  if (direction)
    onChange(Math.min(max, Math.max(min, value + direction * step)));
}

function useWidth() {
  const [width, setWidth] = useState(0);
  const onLayout = (event: LayoutChangeEvent) =>
    setWidth(event.nativeEvent.layout.width);
  return { width, onLayout };
}

/** One trimmer handle: an ink bar outside the kept range, a 44 pt box. */
function TrimHandle({
  side,
  x,
  value,
  min,
  max,
  span,
  trackWidth,
  step,
  label,
  disabled,
  onChange,
  testID,
}: {
  side: "start" | "end";
  /** Edge of the kept range in strip coordinates. */
  x: number;
  value: number;
  min: number;
  max: number;
  span: number;
  trackWidth: number;
  step: number;
  label: string;
  disabled: boolean;
  onChange: (value: number) => void;
  testID: string;
}) {
  const latest = useRef({
    value,
    min,
    max,
    span,
    trackWidth,
    disabled,
    onChange,
  });
  useEffect(() => {
    latest.current = { value, min, max, span, trackWidth, disabled, onChange };
  });
  const responder = useDrag(latest);
  // The box grows away from the kept range, so the two never overlap.
  const left = side === "start" ? x - TARGET : x;
  return (
    <View
      {...responder.panHandlers}
      testID={testID}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: formatTime(value) }}
      accessibilityState={{ disabled }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(event) => {
        if (!disabled) adjust(event, value, step, min, max, onChange);
      }}
      style={[styles.trimHandle, { left }]}
    >
      <View
        style={[
          styles.trimBar,
          side === "start"
            ? {
                right: 0,
                borderTopLeftRadius: Radius.s,
                borderBottomLeftRadius: Radius.s,
              }
            : {
                left: 0,
                borderTopRightRadius: Radius.s,
                borderBottomRightRadius: Radius.s,
              },
          disabled && { opacity: 0.4 },
        ]}
      >
        <View style={styles.grip} />
      </View>
    </View>
  );
}

/**
 * Photos-style trimmer for one clip: the clip's frame along a 56 pt strip,
 * the cut parts dimmed, the kept range framed in ink with handle bars outside
 * it. The start and end values below open a prompt for an exact time.
 */
export function Trimmer({
  duration,
  start,
  end,
  thumbnail,
  disabled = false,
  onChange,
}: {
  duration: number;
  start: number;
  end: number;
  thumbnail: string | null;
  disabled?: boolean;
  onChange: (start: number, end: number) => void;
}) {
  const t = useT();
  const strip = useWidth();
  const minimum = Math.min(MIN_TRIM_SECONDS, duration);
  const step = duration > 20 ? 1 : 0.1;
  const startX = duration > 0 ? (start / duration) * strip.width : 0;
  const endX = duration > 0 ? (end / duration) * strip.width : strip.width;
  const tiles = strip.width > 0 ? Math.ceil(strip.width / STRIP) : 0;

  function ask(which: "start" | "end") {
    const current = which === "start" ? start : end;
    Alert.prompt(
      which === "start"
        ? t("Başlangıç (sn)", "Start (s)")
        : t("Bitiş (sn)", "End (s)"),
      t(
        `0 ile ${roundTime(duration)} sn arasında bir değer gir.`,
        `Enter a value from 0 to ${roundTime(duration)} s.`,
      ),
      [
        { text: t("Vazgeç", "Cancel"), style: "cancel" },
        {
          text: t("Tamam", "OK"),
          onPress: (text?: string) => {
            const typed = text ?? "";
            const range =
              which === "start"
                ? clipRange(typed, String(end), duration)
                : clipRange(String(start), typed, duration);
            if (range && range.end - range.start >= minimum)
              onChange(roundTime(range.start), roundTime(range.end));
            else
              Alert.alert(
                t("Bu süre kullanılamaz", "That time can't be used"),
                t(
                  "Başlangıç bitişten önce olmalı ve ikisi de klibin içinde kalmalı.",
                  "The start must come before the end, and both must be inside the clip.",
                ),
              );
          },
        },
      ],
      "plain-text",
      String(roundTime(current)),
      "decimal-pad",
    );
  }

  return (
    <View style={{ gap: Space.s }}>
      <View style={styles.trimArea}>
        <View onLayout={strip.onLayout} style={styles.strip}>
          <View style={styles.frames} pointerEvents="none">
            {Array.from({ length: tiles }, (_, index) =>
              thumbnail ? (
                <Image
                  key={index}
                  accessible={false}
                  source={{ uri: thumbnail }}
                  resizeMode="cover"
                  style={styles.frame}
                />
              ) : (
                <View key={index} style={styles.frame} />
              ),
            )}
          </View>
          {/* The parts that are cut away. */}
          <View
            pointerEvents="none"
            style={[styles.cut, { left: 0, width: Math.max(0, startX) }]}
          />
          <View
            pointerEvents="none"
            style={[
              styles.cut,
              { left: endX, width: Math.max(0, strip.width - endX) },
            ]}
          />
          <View
            pointerEvents="none"
            style={[
              styles.kept,
              { left: startX, width: Math.max(0, endX - startX) },
            ]}
          />
          {duration > 0 && strip.width > 0 && (
            <>
              <TrimHandle
                side="start"
                testID="desk-trim-start-handle"
                x={startX}
                value={start}
                min={0}
                max={end - minimum}
                span={duration}
                trackWidth={strip.width}
                step={step}
                disabled={disabled}
                label={t("Kırpma başlangıcı", "Trim start")}
                onChange={(value) => onChange(roundTime(value), end)}
              />
              <TrimHandle
                side="end"
                testID="desk-trim-end-handle"
                x={endX}
                value={end}
                min={start + minimum}
                max={duration}
                span={duration}
                trackWidth={strip.width}
                step={step}
                disabled={disabled}
                label={t("Kırpma bitişi", "Trim end")}
                onChange={(value) => onChange(start, roundTime(value))}
              />
            </>
          )}
        </View>
      </View>
      <View style={styles.values}>
        <TimeValue
          testID="desk-trim-start"
          label={t("Başlangıç", "Start")}
          seconds={start}
          disabled={disabled}
          onPress={() => ask("start")}
        />
        <Text maxFontSizeMultiplier={MaxScale.chrome} style={styles.selected}>
          {t("Seçili ", "Selected ") + formatTime(end - start)}
        </Text>
        <TimeValue
          testID="desk-trim-end"
          label={t("Bitiş", "End")}
          seconds={end}
          disabled={disabled}
          onPress={() => ask("end")}
        />
      </View>
    </View>
  );
}

/** A 44 pt tabular time that opens a prompt for an exact value. */
function TimeValue({
  label,
  seconds,
  disabled,
  onPress,
  testID,
}: {
  label: string;
  seconds: number;
  disabled: boolean;
  onPress: () => void;
  testID: string;
}) {
  const t = useT();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label + ", " + formatTime(seconds)}
      accessibilityHint={t(
        "Tam süreyi yazmak için dokun",
        "Tap to type an exact time",
      )}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.timeValue,
        pressed && Press.text,
        disabled && { opacity: 0.4 },
      ]}
    >
      <Text maxFontSizeMultiplier={MaxScale.chrome} style={styles.timeText}>
        {formatTime(seconds)}
      </Text>
    </Pressable>
  );
}

/**
 * Single-thumb level, 0..1: the label left, the percent right, a 4 pt track
 * with an ink fill and a white round thumb.
 */
export function LevelSlider({
  label,
  value,
  disabled = false,
  onChange,
  testID,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
  testID?: string;
}) {
  const track = useWidth();
  const percent = Math.round(value * 100);
  const latest = useRef({
    value,
    min: 0,
    max: 1,
    span: 1,
    trackWidth: track.width,
    disabled,
    onChange: (next: number) => onChange(Math.round(next * 100) / 100),
  });
  useEffect(() => {
    latest.current = {
      value,
      min: 0,
      max: 1,
      span: 1,
      trackWidth: track.width,
      disabled,
      onChange: (next: number) => onChange(Math.round(next * 100) / 100),
    };
  });
  const responder = useDrag(latest);
  return (
    <View style={{ gap: Space.xs }}>
      <View style={styles.sliderHead}>
        <Text maxFontSizeMultiplier={MaxScale.chrome} style={s.text}>
          {label}
        </Text>
        <Text
          maxFontSizeMultiplier={MaxScale.chrome}
          style={[s.label, { fontVariant: ["tabular-nums"] }]}
        >
          %{percent}
        </Text>
      </View>
      <View
        {...responder.panHandlers}
        testID={testID}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{
          min: 0,
          max: 100,
          now: percent,
          text: "%" + percent,
        }}
        accessibilityState={{ disabled }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(event) => {
          if (!disabled)
            adjust(event, value, 0.1, 0, 1, (next) =>
              onChange(Math.round(next * 100) / 100),
            );
        }}
        style={[styles.sliderBox, disabled && { opacity: 0.4 }]}
      >
        <View onLayout={track.onLayout} style={styles.sliderTrack}>
          <View style={[styles.sliderFill, { width: value * track.width }]} />
          <View
            style={[
              styles.sliderThumb,
              { left: value * track.width - THUMB / 2 },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

function fieldText(seconds: number) {
  return String(roundTime(seconds));
}

/**
 * Numeric trim for clips whose duration is unknown (no native module):
 * accepts "1,5" and "1.5".
 */
export function TrimFields({
  duration,
  start,
  end,
  disabled = false,
  onChange,
}: {
  duration: number;
  start: number;
  end: number;
  disabled?: boolean;
  onChange: (start: number, end: number) => void;
}) {
  const t = useT();
  const [startText, setStartText] = useState(fieldText(start));
  const [endText, setEndText] = useState(fieldText(end));
  // Unknown duration (no native module): accept any positive range.
  const limit = duration > 0 ? duration : Number.MAX_SAFE_INTEGER;
  const typed = clipRange(startText, endText, limit);
  const inSync = typed !== null && typed.start === start && typed.end === end;
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    // Follow outside changes unless the user is in the middle of typing.
    if (!inSync && !editing) {
      setStartText(fieldText(start));
      setEndText(fieldText(end));
    }
  }, [start, end, inSync, editing]);
  function commit(nextStart: string, nextEnd: string) {
    const range = clipRange(nextStart, nextEnd, limit);
    if (range && range.end - range.start >= Math.min(MIN_TRIM_SECONDS, limit))
      onChange(roundTime(range.start), roundTime(range.end));
  }
  // Inputs sit on the surface sheet, so they fill with `raised`.
  const input = [s.input, { backgroundColor: Theme.raised }];
  return (
    <View style={{ gap: Space.s }}>
      <Field
        label={t("Başlangıç (sn)", "Start (s)")}
        keyboardType="decimal-pad"
        editable={!disabled}
        value={startText}
        style={input}
        onFocus={() => setEditing(true)}
        onBlur={() => setEditing(false)}
        onChangeText={(text) => {
          setStartText(text);
          commit(text, endText);
        }}
      />
      <Field
        label={t("Bitiş (sn)", "End (s)")}
        keyboardType="decimal-pad"
        editable={!disabled}
        value={endText}
        style={input}
        onFocus={() => setEditing(true)}
        onBlur={() => setEditing(false)}
        onChangeText={(text) => {
          setEndText(text);
          commit(startText, text);
        }}
      />
      {!typed && (
        <Txt small>
          {duration > 0
            ? t(
                `Geçerli aralık: 0 – ${fieldText(duration)} sn, bitiş başlangıçtan büyük olmalı.`,
                `Valid range: 0 – ${fieldText(duration)} s, and end must be after start.`,
              )
            : t("Bitiş başlangıçtan büyük olmalı.", "End must be after start.")}
        </Txt>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // A full target of room each side, so a handle at 0 or at the end keeps
  // its whole 44 pt box inside the trimmer.
  trimArea: { paddingHorizontal: TARGET },
  strip: { height: STRIP },
  frames: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    overflow: "hidden",
    borderRadius: Radius.s,
    backgroundColor: Theme.raised,
  },
  frame: { width: STRIP, height: STRIP, backgroundColor: Theme.raised },
  cut: {
    position: "absolute",
    top: 0,
    bottom: 0,
    backgroundColor: Theme.scrim,
  },
  kept: {
    position: "absolute",
    top: 0,
    bottom: 0,
    borderTopWidth: 3,
    borderBottomWidth: 3,
    borderColor: Theme.text,
  },
  trimHandle: {
    position: "absolute",
    top: 0,
    width: TARGET,
    height: STRIP,
  },
  trimBar: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: BAR,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.text,
  },
  grip: { width: 2, height: 20, borderRadius: 1, backgroundColor: Theme.bg },
  values: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Space.gutter,
  },
  timeValue: { minHeight: TARGET, minWidth: TARGET, justifyContent: "center" },
  timeText: {
    fontSize: 17,
    lineHeight: 22,
    color: Theme.text,
    fontVariant: ["tabular-nums"],
  },
  selected: {
    fontSize: 13,
    lineHeight: 18,
    color: Theme.muted,
    fontVariant: ["tabular-nums"],
  },
  sliderHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Space.s,
  },
  // Half a thumb of room each side keeps the thumb inside at 0 % and 100 %.
  sliderBox: {
    height: TARGET,
    justifyContent: "center",
    paddingHorizontal: THUMB / 2,
  },
  sliderTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: Theme.raised,
    justifyContent: "center",
  },
  sliderFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 2,
    backgroundColor: Theme.text,
  },
  sliderThumb: {
    position: "absolute",
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: Theme.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.line,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
});
