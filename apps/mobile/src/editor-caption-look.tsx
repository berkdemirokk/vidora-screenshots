import { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { CaptionLine } from "./caption-overlay";
import {
  CAPTION_COLORS,
  CAPTION_FONTS,
  CAPTION_POSITIONS,
  CAPTION_STYLES,
  WORDS_PER_CUE,
  decorateCue,
  type CaptionFont,
  type CaptionLocale,
  type CaptionPosition,
  type CaptionState,
  type CaptionStyle,
  type Cue,
} from "./captions";
import { ChipRow, PanelLabel } from "./studio/controls";
import { Icon, MaxScale, Radius, Space, Theme, s, tap, useT } from "./ui";

const WORD_SECONDS = 0.45;
function sampleCue(text: string): Cue {
  const words = text.split(" ").map((word, index) => ({
    text: word,
    start: index * WORD_SECONDS,
    end: (index + 1) * WORD_SECONDS,
  }));
  return { start: 0, end: words.length * WORD_SECONDS, words };
}

/** A looping miniature of the chosen style; still when motion is reduced. */
function Sample({ look }: { look: CaptionState }) {
  const t = useT();
  const cue = decorateCue(
    sampleCue(
      t("Para kazanmanın en hızlı yolu", "The fastest way to make money"),
    ),
    look,
    t("tr-TR", "en-US") as CaptionLocale,
  );
  const count = cue.words.length;
  const [step, setStep] = useState(0);
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduced) => {
        if (live && !reduced)
          timer = setInterval(() => setStep((current) => current + 1), 450);
      });
    return () => {
      live = false;
      if (timer) clearInterval(timer);
    };
  }, []);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={t("Altyazı stili örneği", "Caption style sample")}
      style={[styles.sample, { justifyContent: JUSTIFY[look.position] }]}
    >
      <CaptionLine
        cue={cue}
        time={(step % count) * WORD_SECONDS}
        style={look.style}
        color={look.color}
        font={look.font}
        locale={t("tr-TR", "en-US") as CaptionLocale}
        size={16}
      />
    </View>
  );
}

const JUSTIFY: Record<CaptionPosition, "flex-start" | "center" | "flex-end"> = {
  top: "flex-start",
  center: "center",
  bottom: "flex-end",
};

/** A labelled switch line inside a panel (ink when on). */
export function SwitchLine({
  label,
  value,
  disabled,
  onChange,
  testID,
}: {
  label: string;
  value: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
  testID?: string;
}) {
  return (
    <View style={styles.switchLine}>
      <Text
        maxFontSizeMultiplier={MaxScale.chrome}
        style={[s.text, { flex: 1 }]}
      >
        {label}
      </Text>
      <Switch
        testID={testID}
        accessibilityLabel={label}
        value={value}
        disabled={disabled}
        trackColor={{ false: Theme.line, true: Theme.text }}
        onValueChange={onChange}
      />
    </View>
  );
}

/** Style, font, position and accent colour pickers with a live sample. */
export function CaptionLook({
  captions,
  disabled,
  onChange,
}: {
  captions: CaptionState;
  disabled: boolean;
  onChange: (patch: Partial<CaptionState>) => void;
}) {
  const t = useT();
  const styleLabel: Record<CaptionStyle, string> = {
    classic: t("Klasik", "Classic"),
    highlight: t("Vurgulu", "Highlight"),
    pop: "Pop",
    box: t("Kutu", "Box"),
    karaoke: "Karaoke",
    typewriter: t("Daktilo", "Typewriter"),
    outline: t("Kontur", "Outline"),
    neon: "Neon",
    impact: t("Dev", "Impact"),
  };
  const fontLabel: Record<CaptionFont, string> = {
    system: t("Standart", "Standard"),
    rounded: t("Yuvarlak", "Rounded"),
    serif: "Serif",
    condensed: t("Dar", "Condensed"),
    mono: "Mono",
  };
  const positionLabel: Record<CaptionPosition, string> = {
    top: t("Üst", "Top"),
    center: t("Orta", "Center"),
    bottom: t("Alt", "Bottom"),
  };
  const colorNames = [
    t("Sarı", "Yellow"),
    t("Beyaz", "White"),
    t("Açık yeşil", "Lime"),
    t("Turkuaz", "Cyan"),
    t("Pembe", "Pink"),
    t("Turuncu", "Orange"),
  ];
  const colorLabel = t("Vurgu rengi", "Accent color");
  return (
    <>
      <View style={styles.padded}>
        <Sample look={captions} />
      </View>
      <View style={styles.group}>
        <PanelLabel>{t("Altyazı stili", "Caption style")}</PanelLabel>
        <ChipRow<CaptionStyle>
          label={t("Altyazı stili", "Caption style")}
          options={CAPTION_STYLES.map((value) => ({
            value,
            label: styleLabel[value],
          }))}
          value={captions.style}
          disabled={disabled}
          onChange={(style) => onChange({ style })}
          testIDFor={(value) => "desk-caption-style-" + value}
        />
      </View>
      <View style={styles.group}>
        <PanelLabel>{t("Yazı tipi", "Font")}</PanelLabel>
        <ChipRow<CaptionFont>
          label={t("Yazı tipi", "Font")}
          options={CAPTION_FONTS.map((value) => ({
            value,
            label: fontLabel[value],
          }))}
          value={captions.font}
          disabled={disabled}
          onChange={(font) => onChange({ font })}
        />
      </View>
      {captions.style !== "pop" && (
        <>
          <View style={styles.group}>
            <PanelLabel>
              {t("Satır başına kelime", "Words per line")}
            </PanelLabel>
            <ChipRow<string>
              label={t("Satır başına kelime", "Words per line")}
              options={WORDS_PER_CUE.map((value) => ({
                value: value === null ? "auto" : String(value),
                label: value === null ? t("Otomatik", "Auto") : String(value),
              }))}
              value={
                captions.wordsPerCue === null
                  ? "auto"
                  : String(captions.wordsPerCue)
              }
              disabled={disabled}
              onChange={(value) =>
                onChange({
                  wordsPerCue: value === "auto" ? null : Number(value),
                })
              }
            />
          </View>
          <View style={styles.padded}>
            <SwitchLine
              label={t("Anahtar kelimeleri vurgula", "Highlight key words")}
              value={captions.keywords}
              disabled={disabled}
              onChange={(keywords) => onChange({ keywords })}
            />
            <SwitchLine
              label={t("Konuya uygun emoji ekle", "Add matching emoji")}
              value={captions.emoji}
              disabled={disabled}
              onChange={(emoji) => onChange({ emoji })}
            />
          </View>
        </>
      )}
      <View style={styles.group}>
        <PanelLabel>{t("Altyazı konumu", "Caption position")}</PanelLabel>
        <ChipRow<CaptionPosition>
          label={t("Altyazı konumu", "Caption position")}
          options={CAPTION_POSITIONS.map((value) => ({
            value,
            label: positionLabel[value],
          }))}
          value={captions.position}
          disabled={disabled}
          onChange={(position) => onChange({ position })}
        />
      </View>
      <View style={styles.group}>
        <PanelLabel>{colorLabel}</PanelLabel>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={colorLabel}
          style={[styles.padded, styles.swatches]}
        >
          {CAPTION_COLORS.map((color, index) => {
            const selected = color === captions.color;
            return (
              <Pressable
                key={color}
                accessibilityRole="radio"
                accessibilityLabel={colorLabel + ": " + colorNames[index]}
                accessibilityState={{ selected, disabled }}
                disabled={disabled}
                onPress={() => {
                  if (!selected) tap("select");
                  onChange({ color });
                }}
                style={[
                  styles.swatch,
                  { backgroundColor: color },
                  selected && styles.swatchSelected,
                  disabled && { opacity: 0.4 },
                ]}
              >
                {selected && (
                  <Icon name="checkmark" size={17} color={Theme.text} />
                )}
              </Pressable>
            );
          })}
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  group: { gap: Space.s },
  padded: { paddingHorizontal: Space.gutter },
  sample: {
    height: 96,
    padding: Space.m,
    alignItems: "center",
    borderRadius: Radius.m,
    backgroundColor: Theme.text,
  },
  switchLine: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: Space.m,
  },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: Space.s },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.line,
    alignItems: "center",
    justifyContent: "center",
  },
  swatchSelected: { borderWidth: 2, borderColor: Theme.text },
});
