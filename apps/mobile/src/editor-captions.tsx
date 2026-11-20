import { useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  CAPTION_LOCALES,
  applyCueEdit,
  withTranscript,
  type CaptionLocale,
  type CaptionState,
  type PlacedCue,
} from "./captions";
import { CaptionLook, SwitchLine } from "./editor-caption-look";
import { clipLabel } from "./editor-clips";
import { CueList } from "./editor-cues";
import { PanelBody } from "./editor-options";
import type { TimelineItem } from "./editor-state";
import { describeError, thumbnailUri, type Clip } from "./media";
import { ChipRow, PanelLabel } from "./studio/controls";
import {
  SpeechError,
  canCancelTranscription,
  canTranscribe,
  cancelTranscription,
  transcribeClip,
} from "./transcribe";
import {
  Button,
  Language,
  ProgressBar,
  Row,
  Space,
  Theme,
  Thumb,
  s,
  useT,
} from "./ui";

type Job = { clipId: string; index: number; total: number; progress: number };
const LOCALE_LABEL: Record<CaptionLocale, string> = {
  "tr-TR": "Türkçe",
  "en-US": "English",
};

/**
 * Speech recognition for the timeline's clips. Owned by the desk screen, so
 * closing the Altyazı panel does not stop it; leaving the desk does.
 */
export function useCaptionJobs({
  items,
  captions,
  onChange,
  run,
}: {
  items: TimelineItem[];
  captions: CaptionState;
  onChange: (update: (current: CaptionState) => CaptionState) => void;
  /** Runs a job while the editor is marked busy. */
  run: (job: () => Promise<void>) => void;
}) {
  const t = useT();
  const { lang } = useContext(Language);
  const clips = useMemo(() => {
    const unique = new Map<string, Clip>();
    for (const item of items) unique.set(item.clip.id, item.clip);
    return [...unique.values()];
  }, [items]);
  const [locale, chooseLocale] = useState<CaptionLocale>(
    lang === "tr" ? "tr-TR" : "en-US",
  );
  // Until the user picks a language, follow the one already transcribed.
  const localeChosen = useRef(false);
  useEffect(() => {
    if (localeChosen.current) return;
    for (const clip of clips) {
      const used = captions.transcripts[clip.id]?.locale;
      if (used) {
        chooseLocale(used);
        return;
      }
    }
  }, [clips, captions.transcripts]);
  const [job, setJob] = useState<Job | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Speech permission was denied: offer a shortcut to the app settings.
  const [denied, setDenied] = useState(false);
  const [onDevice, setOnDevice] = useState<Record<string, boolean>>({});
  const live = useRef(true);
  // True while a generate() loop runs; read on unmount (the `job` state
  // would be stale there).
  const transcribing = useRef(false);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      // Leaving the editor stops recognition; otherwise the native job keeps
      // running and the next Generate fails with "already being generated".
      if (transcribing.current) cancelTranscription();
    };
  }, []);

  function generate(targets: Clip[]) {
    if (!targets.length) return;
    run(async () => {
      setErrors((current) => {
        const next = { ...current };
        for (const clip of targets) delete next[clip.id];
        return next;
      });
      transcribing.current = true;
      try {
        for (let index = 0; index < targets.length; index++) {
          const clip = targets[index];
          const total = targets.length;
          setJob({ clipId: clip.id, index, total, progress: 0 });
          try {
            const result = await transcribeClip(clip, locale, (progress) => {
              if (live.current)
                setJob((current) =>
                  current?.clipId === clip.id
                    ? { ...current, progress }
                    : current,
                );
            });
            if (!live.current) return;
            onChange((current) => ({
              ...withTranscript(current, clip.id, {
                locale,
                words: result.words,
              }),
              enabled: true,
            }));
            setOnDevice((current) => ({
              ...current,
              [clip.id]: result.onDevice,
            }));
          } catch (error) {
            if (!live.current) return;
            const code = error instanceof SpeechError ? error.code : null;
            if (code === "denied") setDenied(true);
            // The user stopped it: no error, and skip the remaining clips.
            if (code === "cancelled") break;
            if (code === "no-speech") {
              // Remember the silence so the clip is not recognised again.
              onChange((current) =>
                withTranscript(current, clip.id, { locale, words: [] }),
              );
              continue;
            }
            setErrors((current) => ({
              ...current,
              [clip.id]: describeError(error, t),
            }));
            // Permission and availability problems repeat for every clip; a
            // timeout is specific to this clip, so try the next one.
            if (code && code !== "timeout") break;
          }
        }
      } finally {
        transcribing.current = false;
        if (live.current) setJob(null);
      }
    });
  }

  function regenerate(clip: Clip) {
    if (!captions.edits[clip.id]) return generate([clip]);
    Alert.alert(
      t("Yeniden oluşturulsun mu?", "Generate again?"),
      t(
        "Bu klipteki altyazı düzeltmelerin silinecek.",
        "Your caption edits for this clip will be lost.",
      ),
      [
        { text: t("Vazgeç", "Cancel"), style: "cancel" },
        {
          text: t("Yeniden oluştur", "Generate again"),
          style: "destructive",
          onPress: () => generate([clip]),
        },
      ],
    );
  }

  return {
    clips,
    locale,
    setLocale: (value: CaptionLocale) => {
      localeChosen.current = true;
      chooseLocale(value);
    },
    job,
    errors,
    denied,
    setDenied,
    onDevice,
    generate,
    regenerate,
    available: canTranscribe(),
    pending: clips.filter((clip) => !captions.transcripts[clip.id]),
    hasWords: clips.some(
      (clip) => (captions.transcripts[clip.id]?.words.length ?? 0) > 0,
    ),
  };
}
export type CaptionJobs = ReturnType<typeof useCaptionJobs>;

/** "Altyazı oluşturuluyor (1/2)". */
export function jobLabel(
  t: (tr: string, en: string) => string,
  job: Job,
): string {
  return t(
    `Altyazı oluşturuluyor (${job.index + 1}/${job.total})`,
    `Generating captions (${job.index + 1}/${job.total})`,
  );
}

/**
 * The Altyazı panel: language, Generate while clips are waiting, one row per
 * clip, then the look and the text of the captions.
 */
export function CaptionsPanel({
  jobs,
  items,
  captions,
  cues,
  disabled,
  onChange,
}: {
  jobs: CaptionJobs;
  items: TimelineItem[];
  captions: CaptionState;
  /** Cues of the current timeline, built from `captions`. */
  cues: PlacedCue[];
  disabled: boolean;
  onChange: (update: (current: CaptionState) => CaptionState) => void;
}) {
  const t = useT();
  const { job, pending, available } = jobs;
  const [showCues, setShowCues] = useState(false);
  // The last deleted line, until the next edit.
  const [undo, setUndo] = useState<{
    index: number;
    clipId: string;
    edits: CaptionState["edits"][string] | undefined;
  } | null>(null);

  function status(clip: Clip): string {
    if (job?.clipId === clip.id) return t("Tanınıyor…", "Recognising…");
    if (jobs.errors[clip.id]) return jobs.errors[clip.id];
    const transcript = captions.transcripts[clip.id];
    if (!transcript)
      return job
        ? t("Sırada", "Waiting")
        : t("Henüz altyazı yok", "No captions yet");
    if (!transcript.words.length)
      return t("Konuşma bulunamadı", "No speech found");
    const parts = [
      t(
        `Hazır · ${transcript.words.length} kelime`,
        `Ready · ${transcript.words.length} words`,
      ),
      LOCALE_LABEL[transcript.locale],
    ];
    if (captions.edits[clip.id]) parts.push(t("düzenlendi", "edited"));
    if (jobs.onDevice[clip.id] !== undefined)
      parts.push(
        jobs.onDevice[clip.id]
          ? t("cihazda işlendi", "processed on device")
          : t("Apple tarafından işlendi", "processed by Apple"),
      );
    return parts.join(" · ");
  }

  return (
    <PanelBody>
      <View style={styles.group}>
        <PanelLabel>{t("Konuşma dili", "Spoken language")}</PanelLabel>
        <ChipRow<CaptionLocale>
          label={t("Konuşma dili", "Spoken language")}
          options={CAPTION_LOCALES.map((value) => ({
            value,
            label: LOCALE_LABEL[value],
          }))}
          value={jobs.locale}
          disabled={disabled}
          onChange={jobs.setLocale}
          testIDFor={(value) => "desk-locale-" + value}
        />
      </View>
      {(job || pending.length > 0 || !available || jobs.denied) && (
        <View style={[styles.padded, styles.group]}>
          {job ? (
            <>
              {job.index + job.progress > 0 ? (
                <ProgressBar
                  progress={(job.index + job.progress) / job.total}
                  label={jobLabel(t, job)}
                />
              ) : (
                // Recognition reports nothing until its first piece is done:
                // a spinner instead of a bar that sits at 0 %.
                <View
                  accessible
                  accessibilityRole="progressbar"
                  accessibilityLabel={jobLabel(t, job)}
                  accessibilityState={{ busy: true }}
                  style={styles.spinnerLine}
                >
                  <ActivityIndicator color={Theme.muted} />
                  <Text style={s.footnote}>{jobLabel(t, job)}</Text>
                </View>
              )}
              {canCancelTranscription() && (
                <Button
                  plain
                  testID="desk-captions-stop"
                  label={t("Durdur", "Stop")}
                  accessibilityLabel={t(
                    "Altyazı oluşturmayı durdur",
                    "Stop generating captions",
                  )}
                  onPress={cancelTranscription}
                />
              )}
            </>
          ) : (
            pending.length > 0 &&
            available && (
              <Button
                testID="desk-captions-generate"
                icon="captions.bubble"
                label={t("Altyazı oluştur", "Generate captions")}
                disabled={disabled}
                onPress={() => jobs.generate(pending)}
              />
            )
          )}
          {pending.length > 0 && available && (
            <Text style={s.footnote}>
              {t(
                "Konuşma, iOS konuşma tanıma ile yazıya dökülür; cihazına ve dile göre ses telefonunda ya da Apple'da işlenebilir.",
                "Speech is transcribed by iOS speech recognition; depending on your device and language, the audio may be processed on your phone or by Apple.",
              )}
            </Text>
          )}
          {!available && (
            <Text style={s.footnote}>
              {t(
                "Altyazı oluşturmak için iOS uygulama derlemesi gerekir.",
                "Generating captions requires the native iOS build.",
              )}
            </Text>
          )}
          {jobs.denied && (
            <Button
              plain
              label={t("Ayarları aç", "Open Settings")}
              accessibilityLabel={t(
                "Konuşma tanıma iznini Ayarlar'da aç",
                "Allow speech recognition in Settings",
              )}
              onPress={() => {
                jobs.setDenied(false);
                void Linking.openSettings();
              }}
            />
          )}
        </View>
      )}
      <View>
        {jobs.clips.map((clip, index) => {
          const failed = !!jobs.errors[clip.id];
          const done = !!captions.transcripts[clip.id];
          const at = items.findIndex((item) => item.clip.id === clip.id);
          return (
            <Row
              key={clip.id}
              first={index === 0}
              leading={<Thumb uri={thumbnailUri(clip)} size={40} ratio={1} />}
              label={clipLabel(t, at)}
              detail={status(clip)}
              trailing={
                (failed || done) && (
                  <Button
                    plain
                    label={
                      failed ? t("Yeniden dene", "Retry") : t("Yenile", "Redo")
                    }
                    accessibilityLabel={
                      t(
                        "Altyazıyı yeniden oluştur: ",
                        "Generate captions again: ",
                      ) + clipLabel(t, at)
                    }
                    disabled={disabled || !available}
                    onPress={() => jobs.regenerate(clip)}
                  />
                )
              }
            />
          );
        })}
      </View>
      {jobs.hasWords && (
        <>
          <View style={styles.padded}>
            <SwitchLine
              testID="desk-captions-switch"
              label={t("Altyazıları göster", "Show captions")}
              value={captions.enabled}
              disabled={disabled}
              onChange={(enabled) =>
                onChange((current) => ({ ...current, enabled }))
              }
            />
          </View>
          {captions.enabled && (
            <>
              <CaptionLook
                captions={captions}
                disabled={disabled}
                onChange={(patch) =>
                  onChange((current) => ({ ...current, ...patch }))
                }
              />
              <View style={styles.padded}>
                <Button
                  testID="desk-captions-edit"
                  icon="text.alignleft"
                  label={t(
                    `Metni düzenle (${cues.length} satır)`,
                    `Edit text (${cues.length} lines)`,
                  )}
                  selected={showCues}
                  onPress={() => setShowCues(!showCues)}
                />
              </View>
              {showCues && (
                <CueList
                  cues={cues}
                  disabled={disabled}
                  onEdit={(index, text) => {
                    const placed = cues[index];
                    setUndo(null);
                    if (placed)
                      onChange((current) =>
                        applyCueEdit(current, placed, text),
                      );
                  }}
                  onDelete={(index) => {
                    const placed = cues[index];
                    if (!placed) return;
                    setUndo({
                      index,
                      clipId: placed.clipId,
                      edits: captions.edits[placed.clipId],
                    });
                    onChange((current) => applyCueEdit(current, placed, null));
                  }}
                  undo={
                    undo && {
                      index: undo.index,
                      onUndo: () => {
                        const { clipId, edits } = undo;
                        setUndo(null);
                        // Only that clip's edits go back; other changes stay.
                        onChange((current) => {
                          const next = { ...current.edits };
                          if (edits) next[clipId] = edits;
                          else delete next[clipId];
                          return { ...current, edits: next };
                        });
                      },
                    }
                  }
                />
              )}
            </>
          )}
        </>
      )}
    </PanelBody>
  );
}

const styles = StyleSheet.create({
  group: { gap: Space.s },
  padded: { paddingHorizontal: Space.gutter },
  spinnerLine: { flexDirection: "row", alignItems: "center", gap: Space.s },
});
