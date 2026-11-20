import type { ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { thumbnailUri } from "./media";
import type { TimelineItem } from "./editor-state";
import { clipLabel } from "./editor-clips";
import {
  FITS,
  MAX_TITLE_LENGTH,
  QUALITIES,
  RATIOS,
  TITLE_POSITIONS,
  type EditOptions,
  type Fit,
  type Quality,
  type TitlePosition,
} from "./project-state";
import type { Ratio } from "./studio";
import { ChipRow, PanelLabel, usePanelSpace } from "./studio/controls";
import { LevelSlider, TrimFields, Trimmer } from "./timeline";
import {
  Field,
  Row,
  Space,
  Theme,
  chooseAction,
  displayName,
  s,
  useT,
} from "./ui";

/** A desk panel's scrolling body, capped to the space SwipePanel leaves. */
export function PanelBody({ children }: { children: ReactNode }) {
  const space = usePanelSpace();
  return (
    <ScrollView
      style={{ maxHeight: space }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      contentContainerStyle={styles.body}
    >
      {children}
    </ScrollView>
  );
}

/** Kırp: the selected clip's trimmer. */
export function TrimPanel({
  item,
  index,
  disabled,
  onChange,
}: {
  item: TimelineItem;
  index: number;
  disabled: boolean;
  onChange: (start: number, end: number) => void;
}) {
  const t = useT();
  const known = item.clip.duration > 0;
  return (
    <PanelBody>
      <View style={styles.group}>
        <PanelLabel>
          {t("Kırpma · ", "Trim · ") + clipLabel(t, index)}
        </PanelLabel>
        {known ? (
          <Trimmer
            key={item.key}
            duration={item.clip.duration}
            start={item.start}
            end={item.end}
            thumbnail={thumbnailUri(item.clip)}
            disabled={disabled}
            onChange={onChange}
          />
        ) : (
          <View style={[styles.padded, styles.group]}>
            <Text style={s.footnote}>
              {t(
                "Klip süresi bilinmiyor; kırpma için iOS uygulama derlemesi gerekir.",
                "The clip length is unknown; trimming needs the native iOS build.",
              )}
            </Text>
            <TrimFields
              key={item.key}
              duration={item.clip.duration}
              start={item.start}
              end={item.end}
              disabled={disabled}
              onChange={onChange}
            />
          </View>
        )}
      </View>
    </PanelBody>
  );
}

/** Metin: the title over the video and where it sits. */
export function TextPanel({
  options,
  disabled,
  onChange,
}: {
  options: EditOptions;
  disabled: boolean;
  onChange: (patch: Partial<EditOptions>) => void;
}) {
  const t = useT();
  const positionLabel: Record<TitlePosition, string> = {
    top: t("Üst", "Top"),
    center: t("Orta", "Center"),
    bottom: t("Alt", "Bottom"),
  };
  return (
    <PanelBody>
      <View style={styles.padded}>
        <Field
          testID="desk-title-field"
          label={t("Başlık metni", "Title text")}
          value={options.title}
          maxLength={MAX_TITLE_LENGTH}
          editable={!disabled}
          returnKeyType="done"
          // Inputs on the surface sheet fill with `raised`.
          style={[s.input, { backgroundColor: Theme.raised }]}
          onChangeText={(title) => onChange({ title })}
        />
      </View>
      <View style={styles.group}>
        <PanelLabel>{t("Konum", "Position")}</PanelLabel>
        <ChipRow<TitlePosition>
          label={t("Başlık konumu", "Title position")}
          options={TITLE_POSITIONS.map((value) => ({
            value,
            label: positionLabel[value],
          }))}
          value={options.titlePosition}
          disabled={disabled}
          onChange={(titlePosition) => onChange({ titlePosition })}
          testIDFor={(value) => "desk-title-" + value}
        />
      </View>
    </PanelBody>
  );
}

/** Müzik: the clip sound level and an optional music file. */
export function MusicPanel({
  options,
  disabled,
  onChange,
  onPickMusic,
  onRemoveMusic,
}: {
  options: EditOptions;
  disabled: boolean;
  onChange: (patch: Partial<EditOptions>) => void;
  onPickMusic: () => void;
  onRemoveMusic: () => void;
}) {
  const t = useT();
  const music = options.music;
  function choose() {
    const picks = [
      music
        ? t("Müziği değiştir", "Change music")
        : t("Müzik dosyası seç", "Choose a music file"),
      ...(music ? [t("Müziği kaldır", "Remove music")] : []),
    ];
    chooseAction(
      t("Müzik", "Music"),
      picks,
      t("Vazgeç", "Cancel"),
      music ? 1 : undefined,
      (index) => (index === 0 ? onPickMusic() : onRemoveMusic()),
    );
  }
  return (
    <PanelBody>
      <View style={styles.padded}>
        <LevelSlider
          testID="desk-volume"
          label={t("Özgün ses", "Original sound")}
          value={options.volume}
          disabled={disabled}
          onChange={(volume) => onChange({ volume })}
        />
      </View>
      <View>
        <Row
          first
          testID="desk-music-row"
          label={t("Müzik", "Music")}
          value={music ? displayName(music.name) : t("Yok", "None")}
          disabled={disabled}
          onPress={choose}
        />
      </View>
      {music && (
        <View style={styles.padded}>
          <LevelSlider
            testID="desk-music-volume"
            label={t("Müzik düzeyi", "Music level")}
            value={music.volume}
            disabled={disabled}
            onChange={(volume) => onChange({ music: { ...music, volume } })}
          />
        </View>
      )}
    </PanelBody>
  );
}

/** Format: shape, framing and quality, with the one note that export needs Pro. */
export function FormatPanel({
  options,
  disabled,
  proNote,
  onChange,
}: {
  options: EditOptions;
  disabled: boolean;
  /** Shown to people without Pro. */
  proNote: string | null;
  onChange: (patch: Partial<EditOptions>) => void;
}) {
  const t = useT();
  const fitLabel: Record<Fit, string> = {
    contain: t("Sığdır", "Fit"),
    cover: t("Doldur (kırp)", "Fill (crop)"),
  };
  return (
    <PanelBody>
      <View style={styles.group}>
        <PanelLabel>{t("Kare oranı", "Aspect ratio")}</PanelLabel>
        <ChipRow<Ratio>
          label={t("Kare oranı", "Aspect ratio")}
          options={RATIOS.map((value) => ({ value, label: value }))}
          value={options.ratio}
          disabled={disabled}
          onChange={(ratio) => onChange({ ratio })}
          testIDFor={(value) => "desk-ratio-" + value.replace(":", "x")}
        />
      </View>
      <View style={styles.group}>
        <PanelLabel>{t("Yerleşim", "Framing")}</PanelLabel>
        <ChipRow<Fit>
          label={t("Yerleşim", "Framing")}
          options={FITS.map((value) => ({ value, label: fitLabel[value] }))}
          value={options.fit}
          disabled={disabled}
          onChange={(fit) => onChange({ fit })}
          testIDFor={(value) => "desk-fit-" + value}
        />
      </View>
      <View style={styles.group}>
        <PanelLabel>{t("Kalite", "Quality")}</PanelLabel>
        <ChipRow<Quality>
          label={t("Kalite", "Quality")}
          options={QUALITIES.map((value) => ({ value, label: value }))}
          value={options.quality}
          disabled={disabled}
          onChange={(quality) => onChange({ quality })}
          testIDFor={(value) => "desk-quality-" + value}
        />
      </View>
      {!!proNote && <Text style={[s.footnote, styles.padded]}>{proNote}</Text>}
    </PanelBody>
  );
}

const styles = StyleSheet.create({
  // Section gap (between groups) > group gap (label, control) > row gap.
  body: { gap: Space.l, paddingTop: Space.s, paddingBottom: Space.l },
  group: { gap: Space.s },
  padded: { paddingHorizontal: Space.gutter },
});
