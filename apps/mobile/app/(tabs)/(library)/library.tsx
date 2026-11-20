import {
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { LANG_LOCALE } from "../../../src/i18n/lang";
import { useFocusEffect, useRouter } from "expo-router";
import {
  Alert,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  PermissionError,
  describeError,
  libraryVersion,
  list,
  remove,
  removeMusic,
  saveToPhotos,
  share,
  thumbnailUri,
  type Clip,
} from "../../../src/media";
import {
  deleteDraft,
  editRatio,
  hasEdit,
  listDrafts,
  removeEdit,
  type DraftSummary,
} from "../../../src/draft-store";
import { draftTitle } from "../../../src/drafts";
import { templateById } from "../../../src/product-templates";
import {
  listProjects,
  removeProject,
  renameProject,
  type Project,
} from "../../../src/projects";
import { cleanName } from "../../../src/project-state";
import { Banner } from "../../../src/studio/controls";
import {
  Button,
  HeaderText,
  Icon,
  Language,
  MaxScale,
  Pill,
  Press,
  Radius,
  Row,
  RowMenuButton,
  ScreenList,
  Space,
  Theme,
  Thumb,
  Type,
  chipStyle,
  chooseAction,
  deleteClipMessage,
  deskOpenGuard,
  displayName,
  enPlural,
  formatClock,
  ratioWords,
  s,
  setTabBarHidden,
  spokenDuration,
  tap,
  useAnnounce,
  useT,
  useUpper,
} from "../../../src/ui";
import { openEditor } from "../../../src/studio/open-editor";
import { FEATURES, QA_DIAG, SINGLE_FLOW } from "../../../src/config";
import { diag } from "../../../src/diag";
import { useAuth } from "../../../src/auth/context";
import { COPY } from "../../../src/auth/copy";

type Segment = "videos" | "drafts";
/** Gutter between grid tiles. */
const GAP = 6;
/** Native tab bar height (for the floating banner). */
const TAB_BAR = 49;

type Note = { text: string; error: boolean; settings: boolean };
type Item =
  | { kind: "row"; key: string; clips: Clip[] }
  | { kind: "draft"; key: string; draft: DraftSummary; first: boolean }
  | { kind: "project"; key: string; project: Project; first: boolean };
type ListSection = { key: string; title?: string; data: Item[] };

const clipRatio = (clip: Clip): string => {
  try {
    return editRatio(clip.id) ?? "9:16";
  } catch {
    return "9:16";
  }
};

/**
 * One grid tile: a plain Pressable of exactly width x height, a direct child
 * of the grid row. Tap opens the video, long press shows the actions in the
 * action sheet. (Not a Link asChild: its Slot merges the Pressable's style
 * FUNCTION into `{}`, which left the tile at 0 x 0 in run 23.)
 */
const ClipTile = memo(function ClipTile({
  clip,
  width,
  height,
  selecting,
  selected,
  busy,
  onToggle,
  onOpen,
  onAction,
}: {
  clip: Clip;
  width: number;
  height: number;
  selecting: boolean;
  selected: boolean;
  busy: boolean;
  onToggle: (id: string) => void;
  onOpen: (clip: Clip) => void;
  onAction: (clip: Clip, action: ClipAction) => void;
}) {
  const t = useT();
  const thumb = thumbnailUri(clip);
  const ratio = clipRatio(clip);
  const label = [
    displayName(clip.name),
    ratioWords(t, ratio),
    spokenDuration(t, clip.duration),
  ].join(", ");
  const actions = clipActions(clip, t);
  const body = (
    <>
      {thumb && (
        <Image
          accessible={false}
          accessibilityIgnoresInvertColors
          source={{ uri: thumb }}
          resizeMode="cover"
          style={StyleSheet.absoluteFill}
        />
      )}
      <View style={styles.duration}>
        <Pill
          label={
            ratio !== "9:16"
              ? `${ratio} · ${formatClock(clip.duration)}`
              : formatClock(clip.duration)
          }
        />
      </View>
      {selecting && selected && (
        <>
          <View style={styles.ring} />
          <View style={styles.ringInner} />
        </>
      )}
      {selecting && (
        <View style={[styles.check, selected && styles.checkOn]}>
          {selected && (
            <Icon name="checkmark" size={13} color={Theme.onMedia} />
          )}
        </View>
      )}
    </>
  );
  const box = [styles.tile, { width, height }];

  if (selecting || busy)
    return (
      <Pressable
        testID="library-tile"
        accessibilityRole={selecting ? "checkbox" : "button"}
        accessibilityState={
          selecting ? { checked: selected } : { disabled: true }
        }
        accessibilityLabel={label}
        disabled={!selecting}
        onPress={() => onToggle(clip.id)}
        style={({ pressed }) => [box, pressed && Press.media]}
      >
        {body}
      </Pressable>
    );

  // Long press: the same actions, in the same grouping order, as an action
  // sheet through the project's one gate (src/action-sheet.ts via chooseAction).
  const showActions = () => {
    tap("action");
    const destructive = actions.findIndex((action) => action.id === "delete");
    chooseAction(
      displayName(clip.name),
      actions.map((action) => action.label),
      t("Vazgeç", "Cancel"),
      destructive >= 0 ? destructive : undefined,
      (index) => {
        const action = actions[index];
        if (action) onAction(clip, action.id);
      },
    );
  };

  return (
    <Pressable
      testID="library-tile"
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={t("Videoyu açar.", "Opens the video.")}
      accessibilityActions={actions.map((action) => ({
        name: action.id,
        label: action.label,
      }))}
      onAccessibilityAction={(event) => {
        const action = actions.find(
          (item) => item.id === event.nativeEvent.actionName,
        );
        if (action) onAction(clip, action.id);
      }}
      onPress={() => onOpen(clip)}
      onLongPress={showActions}
      style={({ pressed }) => [box, pressed && Press.media]}
    >
      {body}
    </Pressable>
  );
});

type ClipAction = "save" | "share" | "edit" | "duplicate" | "editor" | "delete";
function clipActions(
  clip: Clip,
  t: (tr: string, en: string) => string,
): { id: ClipAction; label: string }[] {
  const editable = clip.kind === "export" && hasEdit(clip.id);
  return [
    { id: "save", label: t("Fotoğraflar'a kaydet", "Save to Photos") },
    { id: "share", label: t("Paylaş", "Share") },
    ...(editable
      ? ([
          { id: "edit", label: t("Düzenle", "Edit") },
          { id: "duplicate", label: t("Çoğalt", "Duplicate") },
        ] as const)
      : SINGLE_FLOW
        ? ([] as const)
        : ([
            { id: "editor", label: t("Kurguda aç", "Open in editor") },
          ] as const)),
    { id: "delete", label: t("Sil", "Delete") },
  ];
}

/** A designed empty state: Anton line, one muted sentence, one ink button. */
function Empty({
  title,
  line,
  label,
  testID,
  onCreate,
}: {
  title: string;
  line: string;
  label: string;
  testID?: string;
  onCreate: () => void;
}) {
  const upper = useUpper();
  return (
    <View style={styles.empty}>
      <Text
        accessibilityRole="header"
        maxFontSizeMultiplier={MaxScale.largeTitle}
        style={[Type.display, styles.emptyTitle]}
      >
        {upper(title)}
      </Text>
      <Text style={[s.muted, styles.emptyLine]}>{line}</Text>
      <View style={styles.emptyAction}>
        <Button primary testID={testID} label={label} onPress={onCreate} />
      </View>
    </View>
  );
}

/** The empty Videos segment. */
function EmptyVideos({ onCreate }: { onCreate: () => void }) {
  const t = useT();
  return (
    <Empty
      title={t("Henüz video yok", "No videos yet")}
      line={t(
        "Ürün fotoğrafından yaptığın videolar burada görünür.",
        "Videos you make from a product photo appear here.",
      )}
      label={t("Fotoğraf seç", "Choose a photo")}
      testID="library-create"
      onCreate={onCreate}
    />
  );
}

/** Videos / Drafts as ink and outlined pills, like the editor's tools. */
function SegmentPills({
  value,
  onChange,
}: {
  value: Segment;
  onChange: (next: Segment) => void;
}) {
  const t = useT();
  const options: { value: Segment; label: string; testID: string }[] = [
    {
      value: "videos",
      label: t("Videolar", "Videos"),
      testID: "library-segment-videos",
    },
    {
      value: "drafts",
      label: t("Taslaklar", "Drafts"),
      testID: "library-segment-drafts",
    },
  ];
  return (
    <View
      testID="library-segment"
      accessibilityRole="tablist"
      accessibilityLabel={t("Kitaplık bölümü", "Library section")}
      style={styles.pills}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            testID={option.testID}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected }}
            onPress={() => {
              if (selected) return;
              tap("select");
              onChange(option.value);
            }}
            style={({ pressed }) => [
              chipStyle.chip,
              selected && chipStyle.chipSelected,
              pressed && Press.filled,
            ]}
          >
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={MaxScale.chrome}
              style={[chipStyle.chipText, selected && { color: Theme.accent }]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The one quiet welcome line (docs/giris/plan.md, decision 1): an optional
 * account, never a wall. The open link carries the whole sentence; both
 * controls are plain links of at least 44 pt, and at large type they wrap onto
 * their own lines instead of clipping.
 */
function AccountWelcome({
  onOpen,
  onDismiss,
}: {
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const { lang } = useContext(Language);
  return (
    <View testID="account-welcome" style={styles.welcome}>
      <View style={styles.welcomeOpen}>
        <Button
          plain
          testID="account-welcome-open"
          label={COPY.welcomeOpen[lang]}
          onPress={onOpen}
        />
      </View>
      <Button
        plain
        testID="account-welcome-dismiss"
        label={COPY.welcomeDismiss[lang]}
        onPress={onDismiss}
      />
    </View>
  );
}

/** Pinned under the grid in select mode, in place of the tab bar. */
function SelectionToolbar({
  count,
  busy,
  onDelete,
}: {
  count: number;
  busy: boolean;
  onDelete: () => void;
}) {
  const t = useT(),
    insets = useSafeAreaInsets();
  const none = count === 0;
  return (
    <View style={[styles.toolbar, { paddingBottom: insets.bottom }]}>
      <View style={styles.toolbarRow}>
        <View style={{ width: 44 }} />
        <Text style={[s.muted, styles.toolbarText]}>
          {none
            ? t("Video seç", "Select videos")
            : t(
                `${count} video seçildi`,
                `${count} ${enPlural(count, "video", "videos")} selected`,
              )}
        </Text>
        <Pressable
          testID="library-delete-selected"
          accessibilityRole="button"
          accessibilityLabel={t("Seçilenleri sil", "Delete selected")}
          accessibilityState={{ disabled: none || busy }}
          disabled={none || busy}
          onPress={onDelete}
          style={({ pressed }) => [
            styles.toolbarButton,
            (none || busy) && { opacity: 0.4 },
            pressed && Press.filled,
          ]}
        >
          <Icon
            name="trash"
            size={22}
            color={none ? Theme.muted : Theme.danger}
          />
        </Pressable>
      </View>
    </View>
  );
}

export default function Library() {
  const router = useRouter(),
    t = useT(),
    { lang } = useContext(Language),
    { session, welcome, dismissWelcome } = useAuth(),
    { width } = useWindowDimensions(),
    insets = useSafeAreaInsets(),
    [clips, setClips] = useState<Clip[]>([]),
    [projects, setProjects] = useState<Project[]>([]),
    [drafts, setDrafts] = useState<DraftSummary[]>([]),
    [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [segment, setSegment] = useState<Segment>("videos"),
    [selecting, setSelecting] = useState(false),
    [selected, setSelected] = useState<Set<string>>(new Set()),
    [note, setNote] = useState<Note | null>(null);
  useAnnounce(note?.text);
  // Three columns, edge to edge, 6 pt apart; the third takes the remainder.
  const inner = width - 2 * GAP;
  const tile = Math.floor(inner / 3);
  const lastTile = inner - 2 * tile;
  const tileH = Math.round((tile * 4) / 3);

  const fail = useCallback(
    (error: unknown) =>
      setNote({
        text: describeError(error, t),
        error: true,
        settings: error instanceof PermissionError,
      }),
    [t],
  );
  const seen = useRef(-1);
  const refresh = useCallback(
    (force = false) => {
      const now = libraryVersion();
      if (!force && now === seen.current) return;
      seen.current = now;
      Promise.all([list().then(setClips), listProjects().then(setProjects)])
        .catch(fail)
        .finally(() => setLoaded(true));
      try {
        setDrafts(listDrafts());
      } catch (error) {
        fail(error);
      }
    },
    [fail],
  );

  const stopSelecting = useCallback(() => {
    setSelecting(false);
    setSelected(new Set());
  }, []);
  // `refresh` changes identity on every render (it depends on `t`, a new
  // function each render). As a useFocusEffect dependency that re-ran the
  // effect after EVERY render, and each re-run first called the cleanup below:
  // setSelecting(true) rendered, the cleanup called stopSelecting() at once.
  // So the effect depends on nothing and reads the latest refresh from a ref.
  // Guard test: src/library-select.test.mjs.
  const refreshRef = useRef(refresh);
  useLayoutEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);
  useFocusEffect(
    useCallback(() => {
      if (QA_DIAG) diag("library:focus");
      refreshRef.current();
      return () => {
        if (QA_DIAG) diag("library:blur");
        stopSelecting();
        setTabBarHidden(false);
        setNote(null);
      };
    }, [stopSelecting]),
  );
  useEffect(() => {
    if (QA_DIAG) diag("select:mode " + selecting);
  }, [selecting]);
  useLayoutEffect(() => setTabBarHidden(selecting), [selecting]);
  // Successes go away on their own; errors stay until closed.
  useEffect(() => {
    if (!note || note.error) return;
    const timer = setTimeout(() => setNote(null), 3000);
    return () => clearTimeout(timer);
  }, [note]);

  async function action(run: () => Promise<void>) {
    setBusy(true);
    setNote(null);
    try {
      await run();
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }
  function confirmDelete(
    title: string,
    detail: string,
    confirmLabel: string,
    run: () => void,
  ) {
    Alert.alert(title, detail, [
      { text: t("Vazgeç", "Cancel"), style: "cancel" },
      {
        text: confirmLabel,
        style: "destructive",
        onPress: () => {
          try {
            run();
          } catch (error) {
            fail(error);
          }
          refresh(true);
        },
      },
    ]);
  }
  const deleteClip = (clip: Clip) => {
    remove(clip);
    removeEdit(clip.id);
  };
  const projectsUsing = (ids: Set<string>) =>
    projects.filter((project) =>
      project.clips.some((entry) => ids.has(entry.clipId)),
    ).length;

  const onAction = useCallback(
    (clip: Clip, id: ClipAction) => {
      if (id === "save")
        void action(async () => {
          await saveToPhotos(clip);
          setNote({
            text: t("Fotoğraflar'a kaydedildi.", "Saved to Photos."),
            error: false,
            settings: false,
          });
        });
      else if (id === "share") void action(() => share(clip));
      else if (id === "edit") openEditor(router, { edit: clip.id });
      else if (id === "duplicate") openEditor(router, { duplicate: clip.id });
      else if (id === "editor") {
        if (deskOpenGuard("desk:" + clip.id))
          router.push({ pathname: "/editor", params: { id: clip.id } });
      } else if (id === "delete")
        confirmDelete(
          t("Bu video silinsin mi?", "Delete this video?"),
          displayName(clip.name) +
            "\n" +
            deleteClipMessage(t, projectsUsing(new Set([clip.id]))),
          t("Videoyu sil", "Delete video"),
          () => deleteClip(clip),
        );
    },
    [router, t, projects],
  );
  // Tap on a tile: the video screen, once however fast it is tapped.
  const openClip = useCallback(
    (clip: Clip) => {
      if (deskOpenGuard("video:" + clip.id))
        router.push({ pathname: "/video", params: { id: clip.id } });
    },
    [router],
  );

  function draftMenu(draft: DraftSummary, title: string) {
    chooseAction(
      title,
      [t("Devam et", "Continue"), t("Sil", "Delete")],
      t("Vazgeç", "Cancel"),
      1,
      (index) => {
        if (index === 0) openEditor(router, { draft });
        else deleteDraftAsk(draft, title);
      },
    );
  }
  const deleteDraftAsk = (draft: DraftSummary, title: string) =>
    confirmDelete(
      t("Bu taslak silinsin mi?", "Delete this draft?"),
      title,
      t("Taslağı sil", "Delete draft"),
      () => deleteDraft(draft.id),
    );

  function renameAsk(project: Project) {
    Alert.prompt(
      t("Projeyi yeniden adlandır", "Rename project"),
      undefined,
      [
        { text: t("Vazgeç", "Cancel"), style: "cancel" },
        {
          text: t("Kaydet", "Save"),
          isPreferred: true,
          onPress: (value?: string) => {
            const name = cleanName(value ?? "");
            if (!name || name === project.name) return;
            void action(async () => {
              await renameProject(project.id, name);
              refresh(true);
            });
          },
        },
      ],
      "plain-text",
      project.name,
    );
  }
  const deleteProjectAsk = (project: Project) =>
    confirmDelete(
      t("Bu proje silinsin mi?", "Delete this project?"),
      t(
        project.name + "\nKlipler kitaplıkta kalır.",
        project.name + "\nIts clips stay in the library.",
      ),
      t("Projeyi sil", "Delete project"),
      () => {
        removeProject(project.id);
        if (project.options.music) removeMusic(project.options.music.file);
      },
    );
  function projectMenu(project: Project) {
    chooseAction(
      project.name,
      [t("Yeniden adlandır", "Rename"), t("Sil", "Delete")],
      t("Vazgeç", "Cancel"),
      1,
      (index) => (index === 0 ? renameAsk(project) : deleteProjectAsk(project)),
    );
  }

  const exports = useMemo(
    () =>
      clips
        .filter((clip) => clip.kind === "export")
        .sort((a, b) => b.created - a.created),
    [clips],
  );
  const sources = useMemo(
    () => clips.filter((clip) => clip.kind === "source"),
    [clips],
  );
  const clipIds = useMemo(() => new Set(clips.map((clip) => clip.id)), [clips]);

  const toggle = useCallback((id: string) => {
    tap("select");
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const deleteSelected = () => {
    const chosen = clips.filter((clip) => selected.has(clip.id));
    if (chosen.length === 0) return;
    const n = chosen.length;
    confirmDelete(
      t(
        `${n} video silinsin mi?`,
        `Delete ${n} ${enPlural(n, "video", "videos")}?`,
      ),
      deleteClipMessage(t, projectsUsing(new Set(chosen.map((c) => c.id)))),
      n === 1
        ? t("Videoyu sil", "Delete video")
        : t(`${n} videoyu sil`, `Delete ${n} videos`),
      () => {
        chosen.forEach(deleteClip);
        stopSelecting();
      },
    );
  };

  const rowsOf = (items: Clip[], prefix: string): Item[] => {
    const rows: Item[] = [];
    for (let i = 0; i < items.length; i += 3)
      rows.push({
        kind: "row",
        key: prefix + items[i].id,
        clips: items.slice(i, i + 3),
      });
    return rows;
  };
  const sections: ListSection[] = useMemo(() => {
    if (!loaded) return [];
    if (segment === "videos")
      return [
        { key: "exports", data: rowsOf(exports, "e") },
        ...(sources.length > 0
          ? [
              {
                key: "sources",
                title: t("İçe aktarılan klipler", "Imported clips"),
                data: rowsOf(sources, "s"),
              },
            ]
          : []),
      ];
    return [
      {
        key: "drafts",
        data: drafts.map((draft, index) => ({
          kind: "draft" as const,
          key: draft.id,
          draft,
          first: index === 0,
        })),
      },
      ...(projects.length > 0 && !SINGLE_FLOW
        ? [
            {
              key: "projects",
              title: t("Kurgu masası projeleri", "Editing desk projects"),
              data: projects.map((project, index) => ({
                kind: "project" as const,
                key: project.id,
                project,
                first: index === 0,
              })),
            },
          ]
        : []),
    ];
  }, [loaded, segment, exports, sources, drafts, projects, lang]);

  const renderItem = ({ item }: { item: Item }) => {
    if (item.kind === "row")
      return (
        <View style={styles.gridRow}>
          {item.clips.map((clip, index) => (
            <ClipTile
              key={clip.id}
              clip={clip}
              width={index === 2 ? lastTile : tile}
              height={tileH}
              selecting={selecting}
              selected={selected.has(clip.id)}
              busy={busy}
              onToggle={toggle}
              onOpen={openClip}
              onAction={onAction}
            />
          ))}
        </View>
      );
    if (item.kind === "draft") {
      const { draft } = item;
      const info = templateById(draft.template);
      const date = new Date(draft.updated).toLocaleString(
        LANG_LOCALE[lang],
        { dateStyle: "medium", timeStyle: "short" },
      );
      // No headline yet: a dated title tells drafts apart (not the template).
      const title = draft.headline.trim()
        ? draftTitle(draft, t(info.tr, info.en))
        : t("Taslak", "Draft") + " · " + date;
      const isEdit = !!draft.sourceClip && clipIds.has(draft.sourceClip);
      return (
        <Row
          first={item.first}
          leading={
            <Thumb
              uri={draft.thumbnail}
              size={54}
              ratio={3 / 4}
              fit="contain"
            />
          }
          label={title}
          detail={
            (isEdit ? t("Video düzenlemesi · ", "Video edit · ") : "") + date
          }
          chevron={false}
          disabled={busy}
          accessibilityLabel={
            t("Taslağa devam et: ", "Continue draft: ") + title
          }
          accessibilityHint={date}
          accessibilityActions={[{ name: "delete", label: t("Sil", "Delete") }]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === "delete")
              deleteDraftAsk(draft, title);
          }}
          testID="draft-resume"
          onPress={() => openEditor(router, { draft })}
          onLongPress={() => draftMenu(draft, title)}
          trailing={
            <RowMenuButton
              disabled={busy}
              onPress={() => draftMenu(draft, title)}
            />
          }
        />
      );
    }
    const { project } = item;
    const available = project.clips.filter((entry) =>
      clipIds.has(entry.clipId),
    ).length;
    return (
      <Row
        first={item.first}
        icon="film.stack"
        label={project.name}
        detail={
          t(
            `${available} klip`,
            `${available} ${enPlural(available, "clip", "clips")}`,
          ) +
          " · " +
          new Date(project.updated).toLocaleDateString(
            LANG_LOCALE[lang],
          )
        }
        chevron={false}
        disabled={busy}
        accessibilityLabel={t("Projeyi aç: ", "Open project: ") + project.name}
        accessibilityActions={[
          { name: "rename", label: t("Yeniden adlandır", "Rename") },
          { name: "delete", label: t("Sil", "Delete") },
        ]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "rename") renameAsk(project);
          else if (event.nativeEvent.actionName === "delete")
            deleteProjectAsk(project);
        }}
        onPress={() =>
          deskOpenGuard("desk:project:" + project.id) &&
          router.push({ pathname: "/editor", params: { project: project.id } })
        }
        onLongPress={() => projectMenu(project)}
        trailing={
          <RowMenuButton disabled={busy} onPress={() => projectMenu(project)} />
        }
      />
    );
  };

  const canSelect = segment === "videos" && clips.length > 0;
  const countLine = t(
    `${exports.length} video, ${drafts.length} taslak`,
    `${exports.length} ${enPlural(exports.length, "video", "videos")}, ${drafts.length} ${enPlural(drafts.length, "draft", "drafts")}`,
  );
  // The welcome line (plan.md decision 1): accounts on, flag read, not yet
  // dismissed, nobody signed in, and at least one saved video.
  const showWelcome =
    FEATURES.accounts &&
    loaded &&
    welcome.ready &&
    !welcome.dismissed &&
    session.status === "signedOut" &&
    exports.length > 0;
  // QA builds only: the welcome line's inputs, each time one of them changes.
  useEffect(() => {
    if (!QA_DIAG) return;
    diag(
      `welcome:state ready=${welcome.ready} dismissed=${welcome.dismissed} session=${session.status} exports=${exports.length} show=${showWelcome}`,
    );
  }, [
    welcome.ready,
    welcome.dismissed,
    session.status,
    exports.length,
    showWelcome,
  ]);
  const emptyVideos =
    segment === "videos" && exports.length === 0 && sources.length === 0;
  const emptyDrafts =
    segment === "drafts" && drafts.length === 0 && projects.length === 0;

  return (
    <View style={{ flex: 1, backgroundColor: Theme.bg }}>
      <ScreenList<Item, ListSection>
        title={t("Kitaplık", "Library")}
        action={
          canSelect ? (
            <HeaderText
              label={selecting ? t("Bitti", "Done") : t("Seç", "Select")}
              strong={selecting}
              testID="library-select"
              onPress={() => {
                if (QA_DIAG) diag("select:press");
                if (selecting) stopSelecting();
                else setSelecting(true);
              }}
            />
          ) : null
        }
        sections={sections}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        renderSectionHeader={({ section }) =>
          section.title ? (
            <Text
              accessibilityRole="header"
              style={[s.headline, styles.sectionTitle]}
            >
              {section.title}
            </Text>
          ) : null
        }
        ItemSeparatorComponent={({ leadingItem }: { leadingItem?: Item }) =>
          leadingItem?.kind === "row" ? <View style={{ height: GAP }} /> : null
        }
        initialNumToRender={Math.ceil(800 / tileH) + 1}
        windowSize={5}
        maxToRenderPerBatch={4}
        extraData={[selecting, selected, busy]}
        ListHeaderComponent={
          <View style={styles.header}>
            <SegmentPills
              value={segment}
              onChange={(next) => {
                stopSelecting();
                setSegment(next);
              }}
            />
            {segment === "videos" && drafts.length > 0 ? (
              <Row
                testID="library-drafts"
                first
                icon="doc.text"
                label={t("Taslaklar", "Drafts")}
                value={String(drafts.length)}
                onPress={() => {
                  stopSelecting();
                  setSegment("drafts");
                }}
              />
            ) : null}
            {segment === "videos" ? (
              <Row
                testID="library-batch"
                first={drafts.length === 0}
                icon="square.grid.2x2"
                label={t("Toplu video", "Batch")}
                detail={t("10 fotoğrafa kadar", "Up to 10 photos")}
                onPress={() => router.push("/batch")}
              />
            ) : null}
            {showWelcome ? (
              <AccountWelcome
                onOpen={() => {
                  router.push({
                    pathname: "/account",
                    params: { from: "welcome" },
                  });
                  // Opening counts as an answer too: the line does not come back.
                  void dismissWelcome();
                }}
                onDismiss={() => {
                  // QA builds only: proves in the device log that the press arrived.
                  if (QA_DIAG) diag("welcome:press dismiss");
                  void dismissWelcome();
                }}
              />
            ) : null}
          </View>
        }
        ListFooterComponent={
          loaded ? (
            <View style={{ paddingBottom: Space.xl }}>
              {emptyVideos ? (
                <EmptyVideos
                  onCreate={() => openEditor(router, { start: {}, pick: true })}
                />
              ) : emptyDrafts ? (
                <Empty
                  title={t("Taslak yok", "No drafts")}
                  line={t(
                    "Düzenlediğin videolar burada kendiliğinden saklanır.",
                    "Videos you edit are kept here automatically.",
                  )}
                  label={t("Fotoğraf seç", "Choose a photo")}
                  onCreate={() => openEditor(router, { start: {}, pick: true })}
                />
              ) : (
                exports.length + drafts.length > 0 && (
                  <Text style={[s.footnote, styles.count]}>{countLine}</Text>
                )
              )}
            </View>
          ) : undefined
        }
        footer={
          selecting ? (
            <SelectionToolbar
              count={selected.size}
              busy={busy}
              onDelete={deleteSelected}
            />
          ) : null
        }
      />
      {note && (
        <View
          pointerEvents="box-none"
          style={[styles.banner, { bottom: insets.bottom + TAB_BAR + Space.s }]}
        >
          <Banner
            text={note.text}
            closeLabel={t("Kapat", "Close")}
            onClose={() => setNote(null)}
            action={
              note.settings ? (
                <HeaderText
                  strong
                  label={t("Ayarları aç", "Open Settings")}
                  onPress={() => void Linking.openSettings()}
                />
              ) : undefined
            }
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: Space.gutter,
    paddingTop: Space.s,
    paddingBottom: Space.l,
  },
  sectionTitle: {
    paddingHorizontal: Space.gutter,
    paddingTop: Space.xl,
    paddingBottom: Space.s,
  },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: Space.s },
  // One row; at large type the dismiss link wraps below instead of clipping.
  welcome: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: Space.m,
    marginTop: Space.s,
  },
  welcomeOpen: { flexShrink: 1 },
  empty: {
    alignItems: "center",
    gap: Space.m,
    paddingTop: Space.xxl,
    paddingHorizontal: Space.gutter,
  },
  emptyTitle: { textAlign: "center" },
  emptyLine: { textAlign: "center", maxWidth: 320 },
  emptyAction: { alignSelf: "stretch", marginTop: Space.m },
  gridRow: { flexDirection: "row", gap: GAP },
  tile: {
    backgroundColor: Theme.surface,
    borderRadius: Radius.s,
    overflow: "hidden",
  },
  duration: { position: "absolute", right: 6, bottom: 6 },
  // Selected: a 2 pt ink ring inset, with a 1 pt white line inside it.
  ring: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: Radius.s,
    borderWidth: 2,
    borderColor: Theme.text,
  },
  ringInner: {
    position: "absolute",
    top: 2,
    left: 2,
    right: 2,
    bottom: 2,
    borderRadius: Radius.s - 2,
    borderWidth: 1,
    borderColor: Theme.onMedia,
  },
  check: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Theme.onMedia,
    backgroundColor: Theme.scrim,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: { backgroundColor: Theme.text, borderColor: Theme.onMedia },
  toolbar: {
    backgroundColor: Theme.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.line,
  },
  toolbarRow: {
    minHeight: 49,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Space.s,
  },
  toolbarText: { flex: 1, textAlign: "center" },
  toolbarButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  banner: { position: "absolute", left: Space.gutter, right: Space.gutter },
  count: { textAlign: "center", marginTop: Space.l },
});
