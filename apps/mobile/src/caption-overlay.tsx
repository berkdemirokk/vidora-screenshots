import { useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  type TextLayoutEvent,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import type { VideoPlayer } from "expo-video";
import {
  CAPTION_LAYOUT,
  CAPTION_SCALES,
  activeCue,
  activeWordIndex,
  captionCase,
  captionFits,
  captionInsets,
  type CaptionFont,
  type CaptionLocale,
  type CaptionPosition,
  type CaptionStyle,
  type Cue,
} from "./captions";

export type PreviewCaptions = {
  /** Already decorated (keywords, emoji) for display. */
  cues: Cue[];
  /** timeline time = player time + offset */
  offset: number;
  style: CaptionStyle;
  position: CaptionPosition;
  color: string;
  font: CaptionFont;
  /** Recognition language of the shown clip (for Turkish upper case). */
  locale?: CaptionLocale;
};

/** The preview frame (points) and the title plate drawn in it. */
export type PreviewFrame = {
  width: number;
  height: number;
  /** Captions keep clear of the title, as in the exported video. */
  title: { position: CaptionPosition; height: number } | null;
};

/**
 * Font families for the preview. The exporter (KareviaEditorModule.swift,
 * OverlayText.font) uses the same iOS faces; sizes, positions and the
 * shrink-to-two-lines rule follow its proportions (CAPTION_LAYOUT).
 */
export const FONT_FAMILY: Record<CaptionFont, string | undefined> = {
  system: undefined,
  rounded: "Arial Rounded MT Bold",
  serif: "Georgia-Bold",
  condensed: "AvenirNextCondensed-Heavy",
  mono: "Menlo-Bold",
};

/** The plate behind the title and the box style in the exported video. */
export const PLATE = "rgba(0,0,0,0.65)";
/** Pop's word size relative to the other styles (exporter: 0.09 vs 0.055). */
const POP_SCALE = CAPTION_LAYOUT.popFont / CAPTION_LAYOUT.font;
/** Line spacing as exported: UIFont.lineHeight (≈ 1.19 × size) × 1.12. */
const LINE_HEIGHT = 1.19 * 1.12;

/** How each style looks; mirrors CaptionRenderer in the Swift exporter. */
function lookFor(style: CaptionStyle, color: string, size: number) {
  const base: TextStyle = {
    fontSize: size,
    lineHeight: Math.ceil(size * LINE_HEIGHT),
  };
  switch (style) {
    case "outline":
      return { ...base, textShadowRadius: Math.max(3, size * 0.25) };
    case "neon":
      return {
        ...base,
        textShadowColor: color,
        textShadowRadius: Math.max(6, size * 0.6),
      };
    case "impact": {
      const big = Math.round(size * 1.3);
      return {
        ...base,
        color,
        fontSize: big,
        lineHeight: Math.ceil(big * LINE_HEIGHT),
      };
    }
    default:
      return base;
  }
}

/** One cue drawn in a caption style at the given moment. */
export function CaptionLine({
  cue,
  time,
  style,
  color,
  size = 17,
  font = "system",
  locale,
  maxWidth,
}: {
  cue: Cue;
  time: number;
  style: CaptionStyle;
  color: string;
  size?: number;
  font?: CaptionFont;
  locale?: CaptionLocale;
  /**
   * Line width inside a video frame. When set, a long cue shrinks the way
   * the exported one does (CAPTION_SCALES) instead of taking more lines.
   */
  maxWidth?: number;
}) {
  // The shrink step belongs to one cue; a new cue starts at full size.
  const [fit, setFit] = useState({ cue, step: 0 });
  if (!cue.words.length) return null;
  const step = maxWidth !== undefined && fit.cue === cue ? fit.step : 0;
  const scaled = size * CAPTION_SCALES[step];
  const current = activeWordIndex(cue, time);
  const family = FONT_FAMILY[font];
  const shown = (index: number) =>
    cue.words[index].emoji
      ? cue.words[index].text
      : captionCase(cue.words[index].text, style, locale);

  // Pop cues hold one word and are never decorated; a long word shrinks to
  // fit one line, as in the export.
  if (style === "pop")
    return (
      <Text
        numberOfLines={maxWidth === undefined ? undefined : 1}
        adjustsFontSizeToFit={maxWidth !== undefined}
        style={[
          styles.text,
          {
            color,
            fontSize: Math.round(size * POP_SCALE),
            fontFamily: family,
            maxWidth,
          },
        ]}
      >
        {shown(current)}
      </Text>
    );

  const onTextLayout =
    maxWidth === undefined
      ? undefined
      : (event: TextLayoutEvent) => {
          if (!captionFits(step, event.nativeEvent.lines.length))
            setFit({ cue, step: step + 1 });
        };
  const look = lookFor(style, color, scaled);
  const line = (
    <Text
      onTextLayout={onTextLayout}
      style={[styles.text, look, { fontFamily: family, maxWidth }]}
    >
      {cue.words.map((word, index) => {
        const started = word.start <= time;
        let wordColor: string | undefined;
        if (style === "highlight" && index === current) wordColor = color;
        else if (style === "karaoke" && started) wordColor = color;
        else if (word.emphasis && style !== "impact") wordColor = color;
        const hidden = style === "typewriter" && !started;
        return (
          <Text
            key={index}
            style={[
              wordColor ? { color: wordColor } : undefined,
              hidden ? styles.hidden : undefined,
            ]}
          >
            {(index ? " " : "") + shown(index)}
          </Text>
        );
      })}
    </Text>
  );
  if (style !== "box") return line;
  // The exporter's plate: 0.4 × the font size around the widest line.
  const pad = scaled * 0.4;
  return (
    <View
      style={{
        backgroundColor: PLATE,
        borderRadius: pad,
        paddingHorizontal: pad,
        paddingVertical: pad * 0.35,
      }}
    >
      {line}
    </View>
  );
}

/**
 * Draws the cue under the playhead on top of a preview player, sized and
 * placed in proportion to the frame like the exported captions.
 */
export function CaptionOverlay({
  player,
  captions,
  frame,
}: {
  player: VideoPlayer;
  captions: PreviewCaptions;
  frame: PreviewFrame;
}) {
  const { cues, offset, style, position, color, font, locale } = captions;
  const [time, setTime] = useState(0);

  useEffect(() => {
    // Time updates only arrive while playing, so also read the position now
    // and once a pending seek (trim change) has settled.
    const read = () => {
      try {
        setTime(player.currentTime);
      } catch {
        // Released player: nothing to show.
      }
    };
    read();
    const timer = setTimeout(read, 250);
    const subscription = player.addListener("timeUpdate", (event) =>
      setTime(event.currentTime),
    );
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [player, offset, cues]);

  const cue = activeCue(cues, time + offset);
  if (!cue) return null;
  const maxWidth =
    frame.width *
    (style === "pop"
      ? CAPTION_LAYOUT.popWidth
      : style === "box"
        ? CAPTION_LAYOUT.boxWidth
        : CAPTION_LAYOUT.width);
  const inset = captionInsets(frame.height, frame.title);
  const place: ViewStyle =
    position === "top"
      ? { top: inset.top }
      : position === "bottom"
        ? { bottom: inset.bottom }
        : inset.centerTop !== null
          ? { top: inset.centerTop }
          : { top: 0, bottom: 0, justifyContent: "center" };
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[styles.overlay, place]}
    >
      <CaptionLine
        cue={cue}
        time={time + offset}
        style={style}
        color={color}
        font={font}
        locale={locale}
        size={frame.height * CAPTION_LAYOUT.font}
        maxWidth={maxWidth}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    pointerEvents: "none",
  },
  text: {
    color: "#ffffff",
    fontWeight: "800",
    textAlign: "center",
    textShadowColor: "#000000",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  hidden: { color: "transparent", textShadowColor: "transparent" },
});
