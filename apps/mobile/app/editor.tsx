import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { LANG_LOCALE } from "../src/i18n/lang";
import { translate } from "../src/i18n";
import {
  AccessibilityInfo,
  Alert,
  Keyboard,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Redirect,
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import {
  Button,
  EmptyState,
  Icon,
  Language,
  MaxScale,
  Press,
  Radius,
  Space,
  Theme,
  chooseAction,
  displayName,
  enPlural,
  useAnnounce,
  useT,
  type IconName,
  goBack,
} from "../src/ui";
import {
  cancelExport,
  describeError,
  exportTimeline,
  list,
  LocalizedError,
  nativeEditor,
  PermissionError,
  pickFromFiles,
  pickFromPhotos,
  pickMusic,
  removeMusic,
  saveToPhotos,
  share,
  uri,
  type Clip,
  type ImportResult,
} from "../src/media";
import {
  MAX_CLIPS,
  cleanName,
  defaultOptions,
  exportFailureText,
  isUuid,
  moveItem,
  type EditOptions,
  type Project,
} from "../src/project-state";
import { loadProject, newProjectId } from "../src/projects";
import { SINGLE_FLOW } from "../src/config";
import {
  buildCues,
  decorateCue,
  defaultCaptions,
  exportCaptions,
  type CaptionState,
} from "../src/captions";
import {
  CaptionsPanel,
  jobLabel,
  useCaptionJobs,
} from "../src/editor-captions";
import { FILMSTRIP_HEIGHT, Filmstrip, LibrarySheet } from "../src/editor-clips";
import {
  exportable,
  newItem,
  restoreTimeline,
  useAutosave,
  type TimelineItem,
} from "../src/editor-state";
import {
  FormatPanel,
  MusicPanel,
  TextPanel,
  TrimPanel,
} from "../src/editor-options";
import { DeskResult, keepOpenNote } from "../src/editor-export";
import { ASPECT, DeskPreview } from "../src/editor-preview";
import {
  offerAfterPurchase,
  offerFreeExport,
  type PaywallReason,
} from "../src/pro";
import { usePro } from "../src/pro-context";
import {
  Banner,
  HeaderAction,
  HeaderBack,
  HeaderText,
  SwipePanel,
  ToolBar,
} from "../src/studio/controls";
import {
  TRANSPORT_HEIGHT,
  type TransportStatus,
} from "../src/studio/preview-player";
import type { Ratio } from "../src/studio";
import type { Lang } from "../src/i18n/lang";

type DeskTool = "trim" | "captions" | "text" | "music" | "format";
/** One message under the stage: problems stay, successes fade after 3 s. */
type Notice = {
  text: string;
  /** A second, muted line (e.g. the names of files that failed). */
  detail?: string;
  error?: boolean;
  /** A save or other finished work (checkmark). */
  done?: boolean;
  /** Offer "Ayarları aç" (a permission was denied). */
  settings?: boolean;
};

/** The smallest panel height; the preview keeps the rest. */
const MIN_PANEL = 200;

/** The desk export's coded native failures, as plain sentences. */
function exportFailure(error: unknown): unknown {
  const text = exportFailureText(
    error instanceof Error ? error.message : String(error),
  );
  return text ? new LocalizedError(text.tr, text.en) : error;
}

/** "Proje 16 Kasım": a new project's name until the user renames it. */
function datedName(lang: Lang): string {
  let day = "";
  try {
    day = new Intl.DateTimeFormat(LANG_LOCALE[lang], {
      day: "numeric",
      month: "long",
    }).format(new Date());
  } catch {
    // No Intl date support: the name without the date.
  }
  return (translate(lang, "Proje", "Project") + " " + day).trim();
}

/** The navigation bar title: the project name, a menu behind a chevron. */
function TitleButton({
  title,
  disabled,
  onPress,
}: {
  title: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const t = useT();
  return (
    <Pressable
      testID="desk-title"
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={t(
        "Yeniden adlandır ya da yeni proje başlat",
        "Rename, or start a new project",
      )}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.titleButton, pressed && Press.text]}
    >
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={MaxScale.chrome}
        style={styles.titleText}
      >
        {title}
      </Text>
      <Icon name="chevron.down" size={13} color={Theme.text} />
    </Pressable>
  );
}

// The editing desk is not part of this build; a deep link goes Home instead.
// (A wrapper, so the desk's hooks keep a stable order.)
export default function Editor() {
  if (SINGLE_FLOW) return <Redirect href="/" />;
  return <EditorScreen />;
}

function EditorScreen() {
  const params = useLocalSearchParams<{ id?: string; project?: string }>(),
    t = useT(),
    { lang } = useContext(Language),
    router = useRouter(),
    screen = useWindowDimensions(),
    insets = useSafeAreaInsets(),
    { isPro, loading: proLoading } = usePro();
  // Read at export time, so an export started right after a purchase on the
  // paywall already uses the Pro settings.
  const isProRef = useRef(isPro);
  isProRef.current = isPro;
  const defaultName = useMemo(() => datedName(lang), [lang]);
  const [projectId, setProjectId] = useState(() =>
    isUuid(params.project) ? params.project : newProjectId(),
  );
  const [name, setName] = useState(""),
    [items, setItems] = useState<TimelineItem[]>([]),
    [selectedKey, setSelectedKey] = useState<string | null>(null),
    [options, setOptions] = useState<EditOptions>(defaultOptions),
    [captions, setCaptions] = useState<CaptionState>(defaultCaptions),
    [library, setLibrary] = useState<Clip[]>([]),
    [libraryOpen, setLibraryOpen] = useState(false),
    [output, setOutput] = useState<{ clip: Clip; ratio: Ratio } | null>(null),
    [showResult, setShowResult] = useState(false),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState<number | null>(null),
    [tool, setTool] = useState<DeskTool | null>(null),
    [notice, setNotice] = useState<Notice | null>(null),
    [screenReader, setScreenReader] = useState(false),
    // Layout: the root, the stage above the panel, and the keyboard.
    [area, setArea] = useState(0),
    [stage, setStage] = useState({ width: 0, height: 0 }),
    [keyboard, setKeyboard] = useState(0);
  const exporting = useRef(false),
    cancelled = useRef(false);
  const {
    flush: flushSave,
    persisted,
    skipNext: skipNextSave,
  } = useAutosave(
    { ready, projectId, name, items, options, captions },
    (error) => setNotice({ text: describeError(error, t), error: true }),
  );
  const jobs = useCaptionJobs({
    items,
    captions,
    onChange: setCaptions,
    run: (job) => void action(job),
  });

  const title = cleanName(name) ?? defaultName;
  const selected =
    items.find((item) => item.key === selectedKey) ?? items[0] ?? null;
  const selectedIndex = selected ? items.indexOf(selected) : -1;
  const remaining = MAX_CLIPS - items.length;
  const librarySources = library.filter((clip) => clip.kind === "source");
  const canExport =
    !!nativeEditor && items.length > 0 && items.every(exportable);
  const result = showResult && output ? output : null;
  // Caption cues on the final timeline, in the chosen style.
  const cues = useMemo(
    () =>
      buildCues(
        items.map((item) => ({
          id: item.clip.id,
          start: item.start,
          end: item.end,
        })),
        captions,
      ),
    [items, captions],
  );
  const previewCaptions = useMemo(() => {
    if (!captions.enabled || selectedIndex < 0) return null;
    const own = cues.filter((entry) => entry.clipIndex === selectedIndex);
    if (!own.length) return null;
    const locale = captions.transcripts[items[selectedIndex].clip.id]?.locale;
    return {
      cues: own.map((entry) => decorateCue(entry.cue, captions, locale)),
      // The preview plays the source file; shift it onto the timeline.
      offset: -own[0].shift,
      style: captions.style,
      position: captions.position,
      color: captions.color,
      font: captions.font,
      locale,
    };
  }, [cues, selectedIndex, captions, items]);

  // Every notice is read out; successes go away on their own unless a
  // screen reader is running.
  useAnnounce(
    notice ? notice.text + (notice.detail ? " " + notice.detail : "") : null,
  );
  useEffect(() => {
    void AccessibilityInfo.isScreenReaderEnabled()
      .then(setScreenReader)
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener(
      "screenReaderChanged",
      setScreenReader,
    );
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!notice || notice.error || notice.settings || screenReader) return;
    const timer = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(timer);
  }, [notice, screenReader]);

  useEffect(() => {
    const show = Keyboard.addListener("keyboardWillShow", (event) =>
      setKeyboard(event.endCoordinates.height),
    );
    const hide = Keyboard.addListener("keyboardWillHide", () => setKeyboard(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Initial load: restore a saved project, or start from one library clip.
  useEffect(() => {
    let live = true;
    (async () => {
      const all = await list();
      if (!live) return;
      setLibrary(all);
      if (params.project) {
        const project = await loadProject(params.project);
        if (!live) return;
        if (project) restore(project, all);
        else {
          setProjectId(newProjectId());
          setNotice({
            text: t(
              "Proje açılamadı; yeni bir projeyle devam ediliyor.",
              "The project could not be opened; continuing with a new one.",
            ),
            error: true,
          });
        }
      } else if (params.id) {
        const clip = all.find((entry) => entry.id === params.id);
        if (clip) {
          // "Kurguda aç" only opens the clip: nothing is written until the
          // user changes something (these updates commit together, so the
          // autosave effect skips exactly this one state).
          skipNextSave.current = true;
          addClips([clip]);
        }
      }
      setReady(true);
    })().catch((error) => {
      if (!live) return;
      setNotice({ text: describeError(error, t), error: true });
      setReady(true);
    });
    return () => {
      live = false;
    };
    // Deliberately keyed on the route params only: they identify this screen.
  }, [params.project, params.id]);

  function restore(project: Project, all: Clip[]) {
    const restored = restoreTimeline(project, all);
    const { missingClips: missing, musicMissing } = restored;
    persisted.current = true;
    // Opening a project unchanged should not bump its "updated" time.
    skipNextSave.current = missing === 0 && !musicMissing;
    setProjectId(project.id);
    setName(project.name);
    setItems(restored.items);
    setSelectedKey(restored.items[0]?.key ?? null);
    setOptions(restored.options);
    setCaptions(project.captions);
    const notes: string[] = [];
    if (missing)
      notes.push(
        t(
          `${missing} klip artık kitaplıkta olmadığı için projeden çıkarıldı.`,
          `${missing} ${enPlural(missing, "clip", "clips")} no longer in the library ${missing === 1 ? "was" : "were"} removed from the project.`,
        ),
      );
    if (musicMissing)
      notes.push(
        t(
          "Müzik dosyası bulunamadı ve kaldırıldı.",
          "The music file was missing and has been removed.",
        ),
      );
    setNotice(notes.length ? { text: notes.join(" "), error: true } : null);
  }

  // Leaving the screen: stop a running export.
  useEffect(
    () => () => {
      if (exporting.current) cancelExport();
      offerFreeExport(null);
      offerAfterPurchase(null);
    },
    [],
  );

  // Coming back (e.g. from the library): forget clips deleted meanwhile.
  useFocusEffect(
    useCallback(() => {
      if (!ready) return;
      let live = true;
      list()
        .then((all) => {
          if (!live) return;
          const ids = new Set(all.map((clip) => clip.id));
          setLibrary(all);
          setItems((current) =>
            current.every((item) => ids.has(item.clip.id))
              ? current
              : current.filter((item) => ids.has(item.clip.id)),
          );
          setOutput((current) =>
            current && !ids.has(current.clip.id) ? null : current,
          );
        })
        .catch(() => {});
      return () => {
        live = false;
      };
    }, [ready]),
  );

  /** Runs a job while the screen is busy; a failure becomes the notice. */
  async function action(run: () => Promise<void>) {
    setBusy(true);
    setNotice(null);
    try {
      await run();
    } catch (error) {
      setNotice({
        text: describeError(error, t),
        error: true,
        settings: error instanceof PermissionError,
      });
    } finally {
      setBusy(false);
    }
  }

  function addClips(clips: Clip[]) {
    if (!clips.length) return;
    const added = clips.map(newItem);
    setItems((current) => [
      ...current,
      ...added.slice(0, Math.max(0, MAX_CLIPS - current.length)),
    ]);
    setSelectedKey(added[0].key);
    // Never a file name: a new project is named by the day.
    setName((current) => (current.trim() ? current : defaultName));
    setOutput(null);
  }

  async function importWith(pick: () => Promise<ImportResult>) {
    const room = remaining;
    const result = await pick();
    addClips(result.clips);
    if (result.clips.length) setLibrary(await list());
    const limit = t(
      `Zaman çizelgesine en fazla ${MAX_CLIPS} klip sığar; fazlası kitaplıkta.`,
      `The timeline holds up to ${MAX_CLIPS} clips; the rest stay in the library.`,
    );
    const over = result.clips.length > room;
    const failed = result.failed.length;
    if (failed)
      setNotice({
        text:
          t(
            `${failed} video eklenemedi.`,
            `${failed} ${enPlural(failed, "video", "videos")} could not be added.`,
          ) + (over ? " " + limit : ""),
        detail: result.failed
          .map(({ name: file }) => displayName(file))
          .join(", "),
        error: true,
      });
    else if (over) setNotice({ text: limit, error: true });
  }
  function importFrom(source: "photos" | "files") {
    const room = remaining;
    void action(() =>
      importWith(
        source === "photos" ? () => pickFromPhotos(room) : pickFromFiles,
      ),
    );
  }
  function chooseSource() {
    const picks = [
      { label: t("Fotoğraflar", "Photos"), run: () => importFrom("photos") },
      { label: t("Dosyalar", "Files"), run: () => importFrom("files") },
      ...(librarySources.length
        ? [{ label: t("Kitaplık", "Library"), run: () => setLibraryOpen(true) }]
        : []),
    ];
    chooseAction(
      t("Klip ekle", "Add clips"),
      picks.map((pick) => pick.label),
      t("Vazgeç", "Cancel"),
      undefined,
      (index) => picks[index]?.run(),
    );
  }

  function updateTrim(key: string, start: number, end: number) {
    setItems((current) =>
      current.map((item) =>
        item.key === key ? { ...item, start, end } : item,
      ),
    );
  }
  function removeItem(key: string) {
    const index = items.findIndex((item) => item.key === key);
    const next = items.filter((item) => item.key !== key);
    setItems(next);
    if (key === selected?.key)
      setSelectedKey(next[Math.min(index, next.length - 1)]?.key ?? null);
    if (!next.length) setTool(null);
  }
  function patchOptions(patch: Partial<EditOptions>) {
    setOptions((current) => ({ ...current, ...patch }));
  }

  async function chooseMusic() {
    const picked = await pickMusic();
    if (!picked) return;
    const previous = options.music;
    setOptions((current) => ({
      ...current,
      music: { ...picked, volume: previous?.volume ?? 0.5 },
    }));
    if (previous) removeMusic(previous.file);
  }
  function dropMusic() {
    const previous = options.music;
    setOptions((current) => ({ ...current, music: null }));
    try {
      if (previous) removeMusic(previous.file);
    } catch (error) {
      setNotice({ text: describeError(error, t), error: true });
    }
  }

  async function runExport() {
    // No free plan: exporting always needs Vidora Pro.
    if (!isProRef.current) return;
    cancelled.current = false;
    exporting.current = true;
    setTool(null);
    setProgress(0);
    try {
      const clip = await exportTimeline(
        items.map(({ clip: source, start, end }) => ({
          clip: source,
          start,
          end,
        })),
        options,
        cleanName(name) ?? defaultName,
        setProgress,
        exportCaptions(captions, cues),
        false,
      );
      setOutput({ clip, ratio: options.ratio });
      setShowResult(true);
      setLibrary(await list());
    } catch (error) {
      if (!cancelled.current) throw exportFailure(error);
      setNotice({ text: t("Dışa aktarma iptal edildi.", "Export cancelled.") });
    } finally {
      exporting.current = false;
      setProgress(null);
    }
  }

  // Without Pro the paywall opens first; a purchase there starts this export.
  // The paywall calls back after this screen re-renders with Pro; the ref
  // makes that call use the fresh (Pro) export settings.
  const exportLatest = useRef(runExport);
  exportLatest.current = runExport;

  /** Exports need Vidora Pro; there is no free export. */
  function pressExport() {
    if (isPro) return void action(runExport);
    offerFreeExport(null);
    offerAfterPurchase(() => void action(() => exportLatest.current()));
    const reason: PaywallReason = "desk";
    router.push({ pathname: "/paywall", params: { reason } });
  }

  function startNewProject() {
    flushSave();
    if (!persisted.current && options.music) removeMusic(options.music.file);
    persisted.current = false;
    setProjectId(newProjectId());
    setName("");
    setItems([]);
    setSelectedKey(null);
    setOptions(defaultOptions());
    setCaptions(defaultCaptions());
    setOutput(null);
    setShowResult(false);
    setTool(null);
    setNotice(null);
  }
  function rename() {
    Alert.prompt(
      t("Projeyi yeniden adlandır", "Rename project"),
      undefined,
      [
        { text: t("Vazgeç", "Cancel"), style: "cancel" },
        {
          text: t("Kaydet", "Save"),
          onPress: (value?: string) => {
            const clean = cleanName(value ?? "");
            if (clean) setName(clean);
          },
        },
      ],
      "plain-text",
      title,
    );
  }
  function confirmNewProject() {
    // Save first, so the message can say where this project stays.
    flushSave();
    const kept = persisted.current;
    Alert.alert(
      t("Yeni proje başlatılsın mı?", "Start a new project?"),
      kept
        ? t(
            "Bu proje Kitaplık › Taslaklar'da kalır.",
            "This project stays in Library › Drafts.",
          )
        : t("Klipler kitaplıkta kalır.", "The clips stay in the library."),
      [
        { text: t("Vazgeç", "Cancel"), style: "cancel" },
        {
          text: t("Yeni proje", "New project"),
          onPress: () => {
            startNewProject();
            if (kept)
              setNotice({
                text: t(
                  "Önceki proje Taslaklar'a kaydedildi.",
                  "The previous project was saved to Drafts.",
                ),
                done: true,
              });
          },
        },
      ],
    );
  }
  function projectMenu() {
    const picks = [
      { label: t("Yeniden adlandır", "Rename"), run: rename },
      ...(items.length
        ? [
            {
              label: t("Yeni proje başlat", "Start a new project"),
              run: confirmNewProject,
            },
          ]
        : []),
    ];
    chooseAction(
      title,
      picks.map((pick) => pick.label),
      t("Vazgeç", "Cancel"),
      undefined,
      (index) => picks[index]?.run(),
    );
  }

  // ---- Layout: the preview as large as the stage allows (create.tsx's
  // previewShare formula), the transport row and filmstrip under it, and
  // panels that shrink (and scroll) to leave that room.
  const aspect = ASPECT[options.ratio],
    inner = {
      width: stage.width - 2 * Space.l,
      height:
        stage.height -
        2 * Space.s -
        TRANSPORT_HEIGHT -
        Space.s -
        (items.length ? FILMSTRIP_HEIGHT : 0),
    },
    boxHeight = Math.max(0, Math.min(inner.height, inner.width / aspect)),
    box = { width: boxHeight * aspect, height: boxHeight };
  const previewShare = Math.min(
      0.5,
      Math.max(0.42, 0.42 + ((screen.height - 667) / (932 - 667)) * 0.08),
    ),
    toolBarHeight = Space.s + 48 + Math.max(insets.bottom, 8),
    roomy =
      area > 0
        ? Math.max(
            MIN_PANEL,
            area -
              toolBarHeight -
              screen.height * previewShare -
              TRANSPORT_HEIGHT -
              FILMSTRIP_HEIGHT -
              2 * Space.s,
          )
        : undefined,
    // With the keyboard up the panel shrinks too, so the focused field and
    // the tool bar stay above the keyboard (the stage keeps 120 pt).
    panelMax =
      roomy !== undefined && keyboard > 0
        ? Math.max(120, Math.min(roomy, area - keyboard - toolBarHeight - 120))
        : roomy;

  const proNote =
    !isPro && !proLoading
      ? t(
          "Önizleme ücretsiz. Dışa aktarmak için Vidora Pro gerekir.",
          "The preview is free. Exporting needs Vidora Pro.",
        )
      : null;

  const tools: {
    id: DeskTool;
    icon: IconName;
    label: string;
    testID: string;
  }[] = [
    {
      id: "trim",
      icon: "scissors",
      label: t("Kırp", "Trim"),
      testID: "desk-tool-trim",
    },
    {
      id: "captions",
      icon: "captions.bubble",
      label: t("Altyazı", "Captions"),
      testID: "desk-tool-captions",
    },
    {
      id: "text",
      icon: "textformat",
      label: t("Metin", "Text"),
      testID: "desk-tool-text",
    },
    {
      id: "music",
      icon: "music.note",
      label: t("Müzik", "Music"),
      testID: "desk-tool-music",
    },
    {
      id: "format",
      icon: "slider.horizontal.3",
      label: t("Format", "Format"),
      testID: "desk-tool-format",
    },
  ];

  const transportStatus: TransportStatus =
    progress !== null
      ? {
          kind: "rendering",
          progress,
          onCancel: () => {
            cancelled.current = true;
            cancelExport();
          },
        }
      : jobs.job && tool !== "captions"
        ? { kind: "busy", text: jobLabel(t, jobs.job) }
        : null;

  let panel: ReactNode = null;
  if (tool === "trim" && selected)
    panel = (
      <TrimPanel
        item={selected}
        index={selectedIndex}
        disabled={busy}
        onChange={(start, end) => updateTrim(selected.key, start, end)}
      />
    );
  else if (tool === "captions")
    panel = (
      <CaptionsPanel
        jobs={jobs}
        items={items}
        captions={captions}
        cues={cues}
        disabled={busy}
        onChange={setCaptions}
      />
    );
  else if (tool === "text")
    panel = (
      <TextPanel options={options} disabled={busy} onChange={patchOptions} />
    );
  else if (tool === "music")
    panel = (
      <MusicPanel
        options={options}
        disabled={busy}
        onChange={patchOptions}
        onPickMusic={() => void action(chooseMusic)}
        onRemoveMusic={dropMusic}
      />
    );
  else if (tool === "format")
    panel = (
      <FormatPanel
        options={options}
        disabled={busy}
        proNote={proNote}
        onChange={patchOptions}
      />
    );

  const noticeBanner = notice && (
    <Banner
      text={notice.text}
      detail={notice.detail}
      icon={
        notice.error
          ? "exclamationmark.circle"
          : notice.done
            ? "checkmark.circle"
            : undefined
      }
      closeLabel={t("Kapat", "Close")}
      onClose={() => setNotice(null)}
      action={
        notice.settings ? (
          <View style={{ flexDirection: "row" }}>
            <Button
              label={t("Ayarları aç", "Open Settings")}
              onPress={() => void Linking.openSettings()}
            />
          </View>
        ) : undefined
      }
    />
  );

  const empty = ready && items.length === 0;
  let body: ReactNode;
  if (empty)
    body = (
      <View style={styles.empty}>
        <EmptyState
          icon="film.stack"
          title={t("Henüz klip yok", "No clips yet")}
          line={t(
            "Telefonundaki videoları kırp, birleştir, altyazı ekle.",
            "Trim and join the videos on your phone, and add captions.",
          )}
          action={{
            label: t("Fotoğraflardan ekle", "Add from Photos"),
            disabled: busy,
            testID: "desk-empty-photos",
            onPress: () => importFrom("photos"),
          }}
        />
        <View style={styles.emptyMore}>
          <Button
            plain
            testID="desk-empty-files"
            label={t("Dosyalardan ekle", "Add from Files")}
            disabled={busy}
            onPress={() => importFrom("files")}
          />
          {librarySources.length > 0 && (
            <Button
              plain
              testID="desk-empty-library"
              label={t("Kitaplıktan ekle", "Add from Library")}
              disabled={busy}
              onPress={() => setLibraryOpen(true)}
            />
          )}
        </View>
        {noticeBanner}
      </View>
    );
  else
    body = (
      <View style={{ flex: 1, paddingBottom: keyboard }}>
        <View
          style={styles.stage}
          onLayout={(event) => {
            const { width, height } = event.nativeEvent.layout;
            setStage({ width, height });
          }}
        >
          {!ready ? (
            // Opening a project: the frame's place, in its shape.
            box.height > 0 && <View style={[styles.loadingBox, box]} />
          ) : (
            <>
              {selected && box.height > 0 && (
                <DeskPreview
                  key={selected.key}
                  uri={uri(selected.clip)}
                  box={box}
                  rowWidth={inner.width}
                  fit={options.fit}
                  start={selected.start}
                  end={selected.end}
                  volume={options.volume}
                  title={options.title}
                  titlePosition={options.titlePosition}
                  captions={previewCaptions}
                  status={transportStatus}
                  paused={progress !== null || !!result}
                />
              )}
              <Filmstrip
                items={items}
                selectedKey={selected?.key ?? null}
                disabled={busy}
                canAdd={remaining > 0}
                note={progress !== null ? keepOpenNote(t) : null}
                onSelect={setSelectedKey}
                onMove={(index, delta) =>
                  setItems((current) => moveItem(current, index, delta))
                }
                onRemove={removeItem}
                onAdd={chooseSource}
              />
            </>
          )}
        </View>
        {notice && !result && (
          <View style={styles.noticeFlow}>{noticeBanner}</View>
        )}
        {ready && tool && !result && (
          <SwipePanel
            key={tool}
            onDismiss={() => setTool(null)}
            closeLabel={t("Paneli kapat", "Close the panel")}
            maxHeight={panelMax}
          >
            {panel}
          </SwipePanel>
        )}
        {ready && (
          <ToolBar<DeskTool>
            tools={tools}
            active={tool}
            onChange={setTool}
            disabled={progress !== null}
          />
        )}
      </View>
    );

  return (
    <View
      style={styles.root}
      onLayout={(event) => setArea(event.nativeEvent.layout.height)}
    >
      <Stack.Screen
        options={{
          title: result ? t("Video hazır", "Video ready") : title,
          headerLargeTitleEnabled: false,
          headerTitle: result
            ? undefined
            : () => (
                <TitleButton
                  title={title}
                  disabled={busy || progress !== null}
                  onPress={projectMenu}
                />
              ),
          headerLeft: () =>
            result ? (
              <HeaderText
                testID="desk-result-edit"
                label={t("Düzenle", "Edit")}
                onPress={() => setShowResult(false)}
              />
            ) : (
              <HeaderBack
                testID="desk-back"
                label={t("Geri", "Back")}
                onPress={() => goBack(router)}
              />
            ),
          headerRight: () =>
            result ? (
              <HeaderText
                strong
                testID="desk-result-done"
                label={t("Bitti", "Done")}
                onPress={() => goBack(router)}
              />
            ) : ready && items.length > 0 && progress === null ? (
              <HeaderAction
                testID="desk-export"
                label={t("Videoyu oluştur", "Create video")}
                badge={!isPro && !proLoading ? "PRO" : undefined}
                disabled={!canExport || busy || proLoading}
                onPress={pressExport}
              />
            ) : null,
        }}
      />
      {body}
      {result && (
        <DeskResult
          clip={result.clip}
          ratio={result.ratio}
          busy={busy}
          onSave={() =>
            void action(async () => {
              await saveToPhotos(result.clip);
              setNotice({
                text: t("Fotoğraflar'a kaydedildi.", "Saved to Photos."),
                done: true,
              });
            })
          }
          onShare={() => void action(() => share(result.clip))}
        />
      )}
      {notice && result && (
        <View style={styles.noticeTop} pointerEvents="box-none">
          {noticeBanner}
        </View>
      )}
      <LibrarySheet
        visible={libraryOpen}
        clips={librarySources}
        limit={remaining}
        onClose={() => setLibraryOpen(false)}
        onAdd={(clips) => {
          setLibraryOpen(false);
          addClips(clips);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Theme.bg },
  stage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Space.s,
    paddingHorizontal: Space.l,
    paddingVertical: Space.s,
    minHeight: 120,
  },
  loadingBox: { borderRadius: Radius.xl, backgroundColor: Theme.surface },
  noticeFlow: { paddingHorizontal: Space.l, paddingBottom: Space.s },
  noticeTop: {
    position: "absolute",
    top: Space.s,
    left: Space.l,
    right: Space.l,
  },
  empty: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: Space.gutter,
    gap: Space.s,
  },
  emptyMore: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Space.xl,
  },
  titleButton: {
    minHeight: 44,
    maxWidth: 220,
    flexDirection: "row",
    alignItems: "center",
    gap: Space.xs,
  },
  titleText: {
    flexShrink: 1,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "600",
    color: Theme.text,
  },
});
