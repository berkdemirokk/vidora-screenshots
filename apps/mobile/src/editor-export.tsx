import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { Lang } from "./i18n/lang";
import type { Ratio } from "./studio";
import { ResultView } from "./studio/result-view";
import { ChipRow, PanelLabel, useReduceMotion, usePanelSpace } from "./studio/controls";
import { ASPECT } from "./editor-preview";
import { uri, musicUri, type Clip } from "./media";
import { productPlacement } from "./cloud-rules";
import {
  OWN_TEXT_COLORS,
  ownBackdropScene,
} from "./backdrop-rules";
import { backdropById, backdropScene } from "./backdrops";
import { ownBackdropUri } from "./draft-store";
import type { EditState } from "./drafts";
import {
  RATIOS,
  buildSpec,
  type AspectRatio,
  type ProductQuality,
  type SceneInput,
} from "./product-templates";
import { STILL_STYLES, type StillStyleId } from "./marketplace-images";
import {
  guardAiScene,
  resolveMusicPattern,
  shownProductScene,
} from "./editor-media";
import { musicFile } from "./music";
import type { ReactNode } from "react";
import { Button, Space, s, useT } from "./ui";


/** Shown under the filmstrip while the desk export runs. */
export function keepOpenNote(t: (tr: string, en: string) => string): string {
  return t(
    "Dışa aktarma bitene kadar Vidora'yı açık tut.",
    "Keep Vidora open until the export finishes.",
  );
}

/**
 * The finished desk video over the editor, in its own shape, with Save and
 * Share (the shared ResultView). The navigation bar carries "Video hazır"
 * with Düzenle / Bitti.
 */
export function DeskResult({
  clip,
  ratio,
  busy,
  onSave,
  onShare,
}: {
  clip: Clip;
  ratio: Ratio;
  busy: boolean;
  onSave: () => void;
  onShare: () => void;
}) {
  const reduceMotion = useReduceMotion();
  return (
    <ResultView
      uri={uri(clip)}
      busy={busy}
      autoPlay={!reduceMotion}
      aspect={ASPECT[ratio]}
      onSave={onSave}
      onShare={onShare}
    />
  );
}

/**
 * The video spec of a stored edit state (a draft, an edit sidecar or a batch
 * default) for any shape and quality. Mirrors the editor's own `specInput`,
 * so Export all and Batch draw what the editor shows.
 */
export async function specFromState(
  state: EditState,
  cutoutUri: string,
  options: {
    ratio?: AspectRatio;
    quality: ProductQuality;
    watermark: boolean;
    lang: Lang;
    withMusic?: boolean;
  },
) {
  const { cutout } = state;
  const productRect = productPlacement(cutout.width, cutout.height);
  const own = state.ownActive ? state.ownBackdrop : null;
  let scene: SceneInput | null = null;
  if (own) scene = ownBackdropScene(ownBackdropUri(own.file), own, productRect);
  else if (state.backdrop)
    scene = await backdropScene(state.backdrop, cutout.width, cutout.height);
  else if (state.scene) scene = { ...state.scene, productRect };
  const { backdrop } = state;
  const spec = buildSpec({
    template: state.template,
    palette: state.palette,
    product: cutoutUri,
    productSize: { width: cutout.width, height: cutout.height },
    headline: state.headline,
    price: state.price,
    oldPrice: state.oldPrice,
    priceTag: state.priceTag,
    brandAccent: state.brandAccent,
    badge: state.badge,
    cta: state.cta,
    store: state.store,
    bitrate: state.preset === "trendyol" ? "compact" : "high",
    safeArea: state.preset === "reels" ? "social" : "none",
    relief: true,
    scene,
    colors: own
      ? OWN_TEXT_COLORS[own.text]
      : backdrop &&
          !(
            state.template === "campaign" &&
            !state.styleChosen &&
            !backdropById(backdrop).dark
          )
        ? backdropById(backdrop).colors
        : null,
    ratio: options.ratio ?? state.ratio,
    fontStyle: state.fontStyle ?? undefined,
    textLang: options.lang,
    music:
      options.withMusic !== false && state.music
        ? { uri: musicUri(state.music.file), volume: 0.8 }
        : null,
    quality: options.quality,
    watermark: options.watermark,
  });
  // An AI picture that already shows the product: no cut-out over it.
  const guarded = guardAiScene(
    spec,
    shownProductScene(state.scene, {
      ownActive: !!own,
      backdrop: state.backdrop,
    }),
  );
  // The chosen beat (stored as a pattern, made here for this length).
  const pattern = resolveMusicPattern(state.musicPattern ?? null, false);
  if (options.withMusic === false || state.music || !pattern) return guarded;
  return {
    ...guarded,
    music: {
      uri: await musicFile(pattern, BEAT_BPM, guarded.duration),
      volume: 0.8,
    },
  };
}

/** Tempo of the editor's beats ("Ritim 1-4"). */
export const BEAT_BPM = 120;

const RATIO_NAMES: Record<AspectRatio, { tr: string; en: string }> = {
  "9:16": { tr: "Dikey", en: "Vertical" },
  "4:5": { tr: "Akış", en: "Feed" },
  "1:1": { tr: "Kare", en: "Square" },
};

/**
 * The editor's Çıktı tab: the shape (9:16, 4:5, 1:1), the three still
 * styles, "Hepsini çıkar" and the entry to Batch. Every action that saves
 * shows "PRO" for people without Pro; the gates live in the screen.
 */
export function ExportPanel({
  ratio,
  onRatio,
  onStill,
  onExportAll,
  onCancelAll,
  onBatch,
  progress,
  proBadge,
  disabled,
  music,
}: {
  /** The beat chips ("Müzik"), shown first. */
  music?: ReactNode;
  ratio: AspectRatio;
  onRatio: (value: AspectRatio) => void;
  onStill?: (id: StillStyleId) => void;
  onExportAll?: () => void;
  onCancelAll: () => void;
  onBatch: () => void;
  /** "Hazırlanıyor 2/6: Video 4:5" while Export all runs, else null. */
  progress: string | null;
  proBadge?: string;
  disabled: boolean;
}) {
  const t = useT(),
    space = usePanelSpace();
  return (
    <ScrollView
      style={{ maxHeight: space }}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.sheet}
    >
      {music}
      <View style={styles.group}>
        <PanelLabel>{t("Oran", "Shape")}</PanelLabel>
        <ChipRow<AspectRatio>
          label={t("Oran", "Shape")}
          options={RATIOS.map((value) => ({
            value,
            label:
              t(RATIO_NAMES[value].tr, RATIO_NAMES[value].en) + " " + value,
          }))}
          value={ratio}
          onChange={onRatio}
          disabled={disabled}
          testIDFor={(value) => "ratio-" + value.replace(":", "-")}
        />
      </View>
      {onStill && (
        <View style={styles.group}>
          <PanelLabel>{t("Görsel olarak kaydet", "Save as image")}</PanelLabel>
          <View style={styles.buttons}>
            {STILL_STYLES.map((style) => (
              <Button
                key={style.id}
                testID={style.testID}
                icon="photo"
                label={t(style.tr, style.en)}
                badge={proBadge}
                disabled={disabled}
                onPress={() => onStill(style.id)}
              />
            ))}
          </View>
        </View>
      )}
      <View style={styles.group}>
        <PanelLabel>{t("Hepsi bir arada", "All in one go")}</PanelLabel>
        <View style={styles.buttons}>
          {onExportAll && (
            <Button
              testID="export-all"
              icon="square.and.arrow.down"
              label={t("Hepsini çıkar", "Export all")}
              badge={proBadge}
              disabled={disabled}
              onPress={onExportAll}
            />
          )}
          {progress !== null && (
            <>
              <Text
                testID="export-all-progress"
                accessibilityLiveRegion="polite"
                maxFontSizeMultiplier={1.3}
                style={s.footnote}
              >
                {progress}
              </Text>
              <Button
                testID="export-all-cancel"
                label={t("Durdur", "Stop")}
                onPress={onCancelAll}
              />
            </>
          )}
          <Text maxFontSizeMultiplier={1.3} style={s.footnote}>
            {t(
              "9:16, 4:5 ve 1:1 video, ana görsel, gönderi ve hikâye kapağı sırayla Fotoğraflar'a kaydedilir. Vidora açık kalmalı.",
              "9:16, 4:5 and 1:1 videos, the main image, a post and a story cover are saved to Photos one by one. Keep Vidora open.",
            )}
          </Text>
          <Button
            testID="open-batch"
            icon="square.grid.2x2"
            label={t("Toplu video (10 fotoğrafa kadar)", "Batch (up to 10 photos)")}
            badge={proBadge}
            disabled={disabled}
            onPress={onBatch}
          />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sheet: { gap: Space.l, paddingTop: Space.s, paddingBottom: Space.l },
  group: { gap: Space.s },
  buttons: { gap: Space.s, paddingHorizontal: Space.gutter },
});
