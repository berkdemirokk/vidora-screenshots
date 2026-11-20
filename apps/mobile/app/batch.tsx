import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { baseLang } from "../src/i18n/lang";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { randomUUID } from "expo-crypto";
import { Button, Language, Row, Space, Theme, s, useT, tap } from "../src/ui";
import { usePro } from "../src/pro-context";
import { offerAfterPurchase, offerFreeExport } from "../src/pro";
import { openPaywall } from "../src/studio/open-editor";
import { FEATURES, QA_DIAG } from "../src/config";
import { describeError } from "../src/media";
import {
  BATCH_LIMIT,
  addPhotos,
  batchProgress,
  createBatch,
  resumeBatch,
  retryFailed,
  runBatch,
  type BatchItem,
  type BatchQueue,
} from "../src/batch-queue";
import {
  clearBatchQueue,
  discardEditorFile,
  importBatchPhoto,
  loadBatchQueue,
  saveBatchQueue,
  saveEdit,
} from "../src/draft-store";
import type { EditState } from "../src/drafts";
import { cancelProductRender, cutOut, pickProductPhotos, renderProductVideo } from "../src/product";
import { SAMPLE_COPY, sampleEditorCutout } from "../src/sample-frames";
import { CATEGORY_BACKDROP } from "../src/backdrops";
import { specFromState } from "../src/editor-export";
import { recordSuccessfulSave } from "../src/review-prompt";

/** Stands for the bundled sample product (the photo picker hangs on CI). */
const SAMPLE_PHOTO = "sample:product";

/** The look every batch video gets: the single flow's default design. */
function defaultState(
  cutout: { width: number; height: number },
  lang: "tr" | "en",
  sample: boolean,
): EditState {
  const copy = SAMPLE_COPY[lang];
  return {
    template: "campaign",
    palette: "blush",
    category: "cosmetics",
    styleChosen: false,
    headline: sample ? copy.headline : "",
    price: sample ? copy.price : "",
    badge: sample ? copy.badge : "",
    cta: lang === "en" ? "Order now" : "Hemen sipariş ver",
    store: "",
    music: null,
    preset: "reels",
    quality: "1080p",
    scene: null,
    backdrop: CATEGORY_BACKDROP.cosmetics,
    ownBackdrop: null,
    ownActive: false,
    ratio: "9:16",
    fontStyle: null,
    oldPrice: sample ? copy.oldPrice : "",
    priceTag: null,
    brandAccent: null,
    cutout: { width: cutout.width, height: cutout.height },
  };
}

/** Toplu video: up to 10 photos, one video each, one at a time. */
export default function Batch() {
  const t = useT(),
    router = useRouter(),
    { lang } = useContext(Language),
    lng = baseLang(lang),
    { isPro, loading: proLoading } = usePro();
  const [queue, setQueue] = useState<BatchQueue | null>(null),
    [running, setRunning] = useState(false),
    [message, setMessage] = useState("");
  const live = useRef<BatchQueue | null>(null),
    cancelled = useRef(false),
    mounted = useRef(true),
    busy = useRef(false);
  const langRef = useRef<"tr" | "en">(lng);
  langRef.current = lng;

  const store = useCallback((next: BatchQueue | null) => {
    live.current = next;
    if (mounted.current) setQueue(next);
  }, []);

  // An unfinished queue from an earlier launch comes back (not started).
  useEffect(() => {
    mounted.current = true;
    const saved = loadBatchQueue();
    if (saved) store(resumeBatch(saved));
    return () => {
      mounted.current = false;
    };
  }, [store]);

  const room = BATCH_LIMIT - (queue?.items.length ?? 0);
  const progress = queue ? batchProgress(queue) : null;

  function addToQueue(photos: string[]) {
    const current = live.current;
    const next = current
      ? addPhotos(current, photos, randomUUID)
      : createBatch(randomUUID(), photos, randomUUID);
    try {
      saveBatchQueue(next);
    } catch {
      // Still usable this session.
    }
    store(next);
  }

  async function pick() {
    if (busy.current || running || room <= 0) return;
    busy.current = true;
    try {
      const picked = await pickProductPhotos(room);
      if (picked.length === 0) return;
      addToQueue(picked.slice(0, room).map((uri) => importBatchPhoto(uri)));
    } catch (error) {
      setMessage(describeError(error, t));
    } finally {
      busy.current = false;
    }
  }

  async function process(item: BatchItem): Promise<string> {
    const sample = item.photo === SAMPLE_PHOTO;
    const cut = sample ? await sampleEditorCutout() : await cutOut(item.photo);
    try {
      const state = defaultState(cut, langRef.current, sample);
      const index = (live.current?.items.findIndex((i) => i.id === item.id) ?? 0) + 1;
      const spec = await specFromState(state, cut.uri, {
        quality: "1080p",
        watermark: false,
        lang: langRef.current,
      });
      const clip = await renderProductVideo(
        spec,
        (state.headline || t("Video", "Video")) + " · " + index + ".mp4",
        () => {},
      );
      try {
        saveEdit(clip.id, state, cut.uri);
      } catch {
        // The video is in the Library; only Düzenle is lost.
      }
      return clip.id;
    } finally {
      discardEditorFile(cut.uri);
    }
  }

  async function start() {
    const current = live.current;
    if (!current || busy.current) return;
    busy.current = true;
    cancelled.current = false;
    setRunning(true);
    setMessage("");
    try {
      const done = await runBatch(current, {
        process,
        save: saveBatchQueue,
        onChange: store,
        isCancelled: () => cancelled.current,
        describe: (error) => ({
          tr: describeError(error, (tr) => tr),
          en: describeError(error, (_tr, en) => en),
        }),
      });
      store(done);
      if (batchProgress(done).done > 0) {
        tap("action");
        void recordSuccessfulSave();
      }
    } finally {
      busy.current = false;
      if (mounted.current) setRunning(false);
    }
  }
  const startLatest = useRef(start);
  startLatest.current = start;

  /** One Pro gate for the whole batch, up front. */
  function pressStart() {
    if (isPro) return void start();
    offerFreeExport(null);
    offerAfterPurchase(() => void startLatest.current());
    openPaywall(router, "video");
  }

  function stop() {
    cancelled.current = true;
    cancelProductRender();
  }

  function clear() {
    if (running) return;
    clearBatchQueue();
    store(null);
  }

  function retry() {
    if (!live.current || running) return;
    const next = retryFailed(live.current);
    try {
      saveBatchQueue(next);
    } catch {
      // Session only.
    }
    store(next);
  }

  function statusText(item: BatchItem): string {
    switch (item.status) {
      case "done":
        return t("Hazır, Kitaplık'ta", "Done, in your Library");
      case "working":
        return t("Hazırlanıyor…", "Working…");
      case "failed":
        return item.error ? (lng === "tr" ? item.error.tr : item.error.en) : t("Olmadı", "Failed");
      default:
        return t("Sırada", "Waiting");
    }
  }

  const finished = !!progress && progress.pending === 0 && progress.total > 0;
  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          title: t("Toplu video", "Batch"),
          headerLargeTitleEnabled: false,
        }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        <Text style={s.footnote}>
          {t(
            `En fazla ${BATCH_LIMIT} fotoğraf seç. Her biri sırayla arka plandan ayrılır ve kendi videosu olarak Kitaplık'a kaydedilir. İşlem bitene kadar Vidora'yı açık tut.`,
            `Choose up to ${BATCH_LIMIT} photos. Each is cut out in turn and saved to your Library as its own video. Keep Vidora open until it finishes.`,
          )}
        </Text>
        {!!message && (
          <Text accessibilityLiveRegion="polite" style={s.footnote}>
            {message}
          </Text>
        )}
        {progress && (
          <Text
            testID="batch-progress"
            accessibilityLiveRegion="polite"
            style={s.footnote}
          >
            {t(
              `${progress.done}/${progress.total} hazır` +
                (progress.failed ? `, ${progress.failed} olmadı` : ""),
              `${progress.done}/${progress.total} done` +
                (progress.failed ? `, ${progress.failed} failed` : ""),
            )}
          </Text>
        )}
        <View style={styles.list}>
          {queue?.items.map((item, index) => (
            <Row
              key={item.id}
              testID={"batch-item-" + (index + 1)}
              first={index === 0}
              label={t(`Fotoğraf ${index + 1}`, `Photo ${index + 1}`)}
              detail={statusText(item)}
              chevron={false}
            />
          ))}
        </View>
        <View style={styles.buttons}>
          <Button
            testID="batch-pick"
            icon="photo"
            label={t("Fotoğraf seç", "Choose photos")}
            disabled={running || room <= 0 || proLoading}
            onPress={() => void pick()}
          />
          {!!progress && progress.failed > 0 && !running && (
            <Button
              testID="batch-retry"
              label={t("Olmayanları tekrar dene", "Retry the failed ones")}
              onPress={retry}
            />
          )}
          {running ? (
            <Button
              testID="batch-cancel"
              label={t("Durdur", "Stop")}
              onPress={stop}
            />
          ) : (
            <Button
              primary
              testID="batch-start"
              label={
                finished
                  ? t("Bitti", "Finished")
                  : t("Videoları oluştur", "Create videos")
              }
              badge={!isPro && !proLoading ? "PRO" : undefined}
              disabled={!progress || progress.pending === 0 || proLoading}
              onPress={pressStart}
            />
          )}
          {finished && !running && (
            <Button
              testID="batch-clear"
              label={t("Listeyi temizle", "Clear the list")}
              onPress={clear}
            />
          )}
        </View>
      </ScrollView>
      {(FEATURES.screenshotMode || QA_DIAG) && (
        // QA only: the photo picker hangs on the simulator, so this adds the
        // bundled sample product. Invisible, still a 44 pt touch target.
        <Pressable
          testID="batch-add-sample"
          accessibilityRole="button"
          accessibilityLabel="Add sample"
          disabled={running || room <= 0}
          onPress={() => addToQueue([SAMPLE_PHOTO])}
          style={styles.hidden}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Theme.bg },
  content: { padding: Space.gutter, gap: Space.m },
  list: { gap: 0 },
  buttons: { gap: Space.s },
  hidden: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 44,
    height: 44,
    opacity: 0.02,
  },
});
