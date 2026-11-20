import { useCallback, useContext, useEffect, useState } from "react";
import { LANG_LOCALE, type Lang } from "../src/i18n/lang";
import {
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { File } from "expo-file-system";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import {
  PermissionError,
  describeError,
  list,
  remove,
  saveToPhotos,
  share,
  uri as clipUri,
  type Clip,
} from "../src/media";
import { editRatio, hasEdit, removeEdit } from "../src/draft-store";
import { isDraftId } from "../src/drafts";
import { listProjects } from "../src/projects";
import { useReduceMotion } from "../src/studio/controls";
import {
  Button,
  Language,
  Notice,
  Radius,
  Row,
  SaveShareRow,
  Section,
  Space,
  Theme,
  deleteClipMessage,
  deskOpenGuard,
  displayName,
  formatClock,
  useAnnounce,
  useT,
  goBack,
} from "../src/ui";
import { openEditor } from "../src/studio/open-editor";
import { SINGLE_FLOW } from "../src/config";

type TrackInfo = { width: number; height: number; fps: number | null };

/** "9:16", "4:5", "1:1" (or w:h) for the exported sizes. */
function ratioOf(width: number, height: number): string {
  const known: [number, number][] = [
    [9, 16],
    [4, 5],
    [1, 1],
    [16, 9],
  ];
  const match = known.find(([w, h]) => Math.abs(width / height - w / h) < 0.01);
  return match ? `${match[0]}:${match[1]}` : `${width}:${height}`;
}

/** File size in MB/KB from the real file; null when it cannot be read. */
function fileSize(uri: string, lang: Lang): string | null {
  try {
    const bytes = new File(uri).size;
    if (!bytes) return null;
    const mb = bytes / (1024 * 1024);
    const number = (value: number, digits: number) =>
      value.toLocaleString(LANG_LOCALE[lang], {
        maximumFractionDigits: digits,
      });
    return mb >= 1 ? `${number(mb, 1)} MB` : `${number(bytes / 1024, 0)} KB`;
  } catch {
    return null;
  }
}

const RATIO_ASPECT: Record<string, number> = {
  "9:16": 9 / 16,
  "4:5": 4 / 5,
  "1:1": 1,
  "2:3": 2 / 3,
};

/** The finished video, playing, with its actions. Route: /video?id=<clipId> */
export default function VideoDetail() {
  const { id } = useLocalSearchParams<{ id?: string }>(),
    router = useRouter(),
    t = useT(),
    { lang } = useContext(Language),
    insets = useSafeAreaInsets(),
    reduceMotion = useReduceMotion();
  const [clip, setClip] = useState<Clip | null>(null),
    [missing, setMissing] = useState(false),
    [editable, setEditable] = useState(false),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false),
    [message, setMessage] = useState(""),
    [needsSettings, setNeedsSettings] = useState(false),
    [track, setTrack] = useState<TrackInfo | null>(null),
    [usedBy, setUsedBy] = useState(0);

  // Reload on focus: the video may have been replaced or deleted meanwhile.
  useFocusEffect(
    useCallback(() => {
      let live = true;
      if (!isDraftId(id)) {
        setMissing(true);
        return;
      }
      list()
        .then((clips) => {
          if (!live) return;
          const found = clips.find((item) => item.id === id) ?? null;
          setClip(found);
          setMissing(!found);
          setEditable(!!found && found.kind === "export" && hasEdit(found.id));
        })
        .catch(() => {
          if (live) setMissing(true);
        });
      listProjects()
        .then((projects) => {
          if (live)
            setUsedBy(
              projects.filter((project) =>
                project.clips.some((entry) => entry.clipId === id),
              ).length,
            );
        })
        .catch(() => {});
      return () => {
        live = false;
        // The saved state is for this visit only.
        setSaved(false);
        setMessage("");
      };
    }, [id]),
  );

  useAnnounce(message);

  async function action(job: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    setNeedsSettings(false);
    try {
      await job();
    } catch (error) {
      setMessage(describeError(error, t));
      setNeedsSettings(error instanceof PermissionError);
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete(target: Clip) {
    Alert.alert(
      t("Bu video silinsin mi?", "Delete this video?"),
      deleteClipMessage(t, usedBy),
      [
        { text: t("Vazgeç", "Cancel"), style: "cancel" },
        {
          text: t("Videoyu sil", "Delete video"),
          style: "destructive",
          onPress: () => {
            try {
              remove(target);
              removeEdit(target.id);
              goBack(router);
            } catch (error) {
              setMessage(describeError(error, t));
            }
          },
        },
      ],
    );
  }

  const title = clip ? displayName(clip.name) : t("Video", "Video");
  const size = clip ? fileSize(clipUri(clip), lang) : null;
  const facts: [string, string][] = clip
    ? [
        ...(track
          ? ([
              [
                t("Çözünürlük", "Resolution"),
                `${track.width} × ${track.height}`,
              ],
            ] as [string, string][])
          : []),
        ...(track?.fps
          ? ([
              [t("Kare hızı", "Frame rate"), `${Math.round(track.fps)} fps`],
            ] as [string, string][])
          : []),
        ...(size
          ? ([[t("Dosya boyutu", "File size"), size]] as [string, string][])
          : []),
      ]
    : [];
  let storedRatio: string | null = null;
  try {
    storedRatio = clip ? editRatio(clip.id) : null;
  } catch {
    storedRatio = null;
  }
  const aspect = track
    ? track.width / track.height
    : storedRatio
      ? (RATIO_ASPECT[storedRatio] ?? 9 / 16)
      : 9 / 16;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: "", headerLargeTitleEnabled: false }} />
      {missing ? (
        <View style={styles.missing}>
          <Text style={styles.body} accessibilityLiveRegion="polite">
            {t(
              "Bu video bulunamadı. Silinmiş ya da yenisiyle değiştirilmiş olabilir.",
              "This video was not found. It may have been deleted or replaced.",
            )}
          </Text>
          <Button
            label={t("Kitaplığa dön", "Back to Library")}
            onPress={() => goBack(router)}
          />
        </View>
      ) : clip ? (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(insets.bottom, Space.l) + Space.l },
          ]}
        >
          <Player
            key={clip.id}
            uri={clipUri(clip)}
            autoPlay={!reduceMotion}
            aspect={aspect}
            onTrack={setTrack}
          />
          <View style={styles.meta}>
            <Text style={styles.title} accessibilityRole="header">
              {title}
            </Text>
            <Text style={styles.body}>
              {[
                new Date(clip.created).toLocaleDateString(
                  LANG_LOCALE[lang],
                  { day: "numeric", month: "long", year: "numeric" },
                ),
                track ? ratioOf(track.width, track.height) : storedRatio,
                formatClock(clip.duration),
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </View>
          <SaveShareRow
            busy={busy}
            saved={saved}
            saveTestID="video-save"
            shareTestID="video-share"
            onSave={() =>
              void action(async () => {
                await saveToPhotos(clip);
                setSaved(true);
                setMessage(t("Fotoğraflar'a kaydedildi.", "Saved to Photos."));
              })
            }
            onShare={() => void action(() => share(clip))}
          />
          {!!message && !saved && (
            <Notice
              text={message}
              action={
                needsSettings
                  ? {
                      label: t("Ayarları aç", "Open Settings"),
                      onPress: () => void Linking.openSettings(),
                    }
                  : undefined
              }
            />
          )}
          <View style={styles.group}>
            <Section>
              {editable ? (
                <>
                  <Row
                    first
                    testID="video-edit"
                    icon="slider.horizontal.3"
                    label={t("Düzenle", "Edit")}
                    detail={t(
                      "Yeni video bunun yerini alır. Farklı bir sürüm için Çoğalt.",
                      "The new video replaces this one. Use Duplicate for a different version.",
                    )}
                    disabled={busy}
                    onPress={() =>
                      openEditor(router, { edit: clip.id }, "replace")
                    }
                  />
                  <Row
                    testID="video-duplicate"
                    icon="plus.square.on.square"
                    label={t("Çoğalt", "Duplicate")}
                    detail={t(
                      "Kopyasından yeni bir video yapar",
                      "Makes a new video from a copy",
                    )}
                    disabled={busy}
                    onPress={() => openEditor(router, { duplicate: clip.id })}
                  />
                </>
              ) : SINGLE_FLOW ? null : (
                <Row
                  first
                  testID="video-editor"
                  icon="scissors"
                  label={t("Kurguda aç", "Open in editor")}
                  disabled={busy}
                  onPress={() => {
                    if (deskOpenGuard("desk:" + clip.id))
                      router.push({
                        pathname: "/editor",
                        params: { id: clip.id },
                      });
                  }}
                />
              )}
            </Section>
          </View>
          {facts.length > 0 && (
            <View style={styles.group}>
              <Section>
                {facts.map(([key, value], index) => (
                  <Row
                    key={key}
                    first={index === 0}
                    label={key}
                    value={value}
                  />
                ))}
              </Section>
            </View>
          )}
          <View style={styles.group}>
            <Section>
              <Row
                first
                danger
                testID="video-delete"
                icon="trash"
                label={t("Videoyu sil", "Delete video")}
                disabled={busy}
                onPress={() => confirmDelete(clip)}
              />
            </Section>
          </View>
        </ScrollView>
      ) : null}
    </View>
  );
}

function Player({
  uri,
  autoPlay,
  aspect,
  onTrack,
}: {
  uri: string;
  autoPlay: boolean;
  /** Width / height of the video. */
  aspect: number;
  /** Size and frame rate of the video track, read from the file. */
  onTrack: (info: TrackInfo | null) => void;
}) {
  const window = useWindowDimensions();
  // The real shape, as wide as the screen allows but no taller than ~60%.
  const width = Math.min(
    window.width - 2 * Space.gutter,
    window.height * 0.6 * aspect,
  );
  const player = useVideoPlayer(uri, (created) => {
    created.loop = true;
  });
  // Follows Reduce Motion while the screen is open.
  useEffect(() => {
    if (autoPlay) player.play();
    else player.pause();
  }, [autoPlay, player]);
  useEffect(() => {
    const subscription = player.addListener("sourceLoad", (event) => {
      const video = event.availableVideoTracks[0];
      onTrack(
        video && video.size.width > 0 && video.size.height > 0
          ? {
              width: Math.round(video.size.width),
              height: Math.round(video.size.height),
              fps: video.frameRate,
            }
          : null,
      );
    });
    return () => subscription.remove();
  }, [player, onTrack]);
  return (
    <View style={[styles.video, { width, height: width / aspect }]}>
      <VideoView
        style={StyleSheet.absoluteFill}
        player={player}
        nativeControls
        contentFit="contain"
        allowsPictureInPicture={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Theme.bg },
  content: {
    gap: Space.group,
    paddingHorizontal: Space.gutter,
    paddingTop: Space.s,
  },
  video: {
    alignSelf: "center",
    borderRadius: Radius.xl,
    overflow: "hidden",
    backgroundColor: Theme.surface,
  },
  meta: { gap: Space.xs, paddingTop: Space.s },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "700",
    letterSpacing: -0.3,
    color: Theme.text,
  },
  body: { fontSize: 15, lineHeight: 20, color: Theme.muted },
  group: { marginTop: Space.section - Space.group },
  missing: {
    flex: 1,
    gap: Space.l,
    padding: Space.gutter,
    justifyContent: "center",
  },
});
