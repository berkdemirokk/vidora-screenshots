import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { baseLang } from "../../../src/i18n/lang";
import {
  Alert,
  Animated,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useVideoPlayer, VideoView } from "expo-video";
import {
  libraryVersion,
  list,
  listSync,
  thumbnailUri,
  uri as clipUri,
  type Clip,
} from "../../../src/media";
import { FEATURES, QA_DIAG, SINGLE_FLOW } from "../../../src/config";
import sampleProduct from "../../../assets/sample-product.jpg";
import {
  editRatio,
  isSampleCutout,
  listDrafts,
} from "../../../src/draft-store";
import { templateById, type TemplateId } from "../../../src/product-templates";
import type { BackdropId } from "../../../src/backdrops";
import {
  HOME_POSTER_COPY,
  POSTER_BACKDROP,
  SAMPLE_COPY,
  usePosterDiag,
  useTemplatePoster,
} from "../../../src/sample-frames";
import { compactHeroLayout, missingPhotos } from "../../../src/gallery";
import { openEditor } from "../../../src/studio/open-editor";
import { TemplateGallery } from "../../../src/studio/template-gallery";
import { pickProductPhotos } from "../../../src/product";
import type { RecipeVariant } from "../../../src/recipes";
import { diag } from "../../../src/diag";
import { useReduceMotion } from "../../../src/studio/controls";
import {
  Button,
  EdgeFacts,
  HeaderText,
  Pill,
  Press,
  Radius,
  Row,
  Screen,
  Section,
  Space,
  Face,
  Language,
  Theme,
  Txt,
  Type,
  displayBox,
  displayMetrics,
  useTabBarInset,
  deskOpenGuard,
  displayName,
  formatClock,
  ratioWords,
  spokenDuration,
  useT,
} from "../../../src/ui";

const exportsOf = (clips: Clip[]) =>
  clips
    .filter((clip) => clip.kind === "export")
    .sort((a, b) => b.created - a.created);

/** The draft Home offers to resume: the newest real one (null if none). */
type ResumeDraft = { id: string; sourceClip: string | null };
function newestRealDraft(): ResumeDraft | null {
  try {
    for (const draft of listDrafts()) {
      // An untouched sample is not worth resuming (no marker is stored, so
      // it is recognised by its bundled copy).
      const untouched = (["tr", "en"] as const).some(
        (code) =>
          draft.headline === SAMPLE_COPY[code].headline &&
          draft.price === SAMPLE_COPY[code].price,
      );
      // A changed photo is real work even when the texts still match.
      const samePhoto = isSampleCutout(draft.cutout) !== false;
      if (!untouched || !samePhoto)
        return { id: draft.id, sourceClip: draft.sourceClip };
    }
  } catch {
    // Unreadable drafts: no resume button.
  }
  return null;
}

/** The frame shape of an export ("9:16" when unknown). */
function clipRatio(clip: Clip): string {
  try {
    return editRatio(clip.id) ?? "9:16";
  } catch {
    return "9:16";
  }
}
const RATIO_ASPECT: Record<string, number> = {
  "9:16": 9 / 16,
  "4:5": 4 / 5,
  "1:1": 1,
  "2:3": 2 / 3,
};

/** Name and one detail under the hero video, never on top of it. */
function Caption({ title, detail }: { title: string; detail?: string }) {
  return (
    <View style={styles.caption}>
      <Text style={styles.captionTitle}>{title}</Text>
      {!!detail && <Text style={styles.captionDetail}>{detail}</Text>}
    </View>
  );
}

/**
 * The latest video, whole (contain) at its real shape, muted and looping
 * while Home is visible. Under Reduce Motion it shows a still.
 */
function Showcase({ clip, onPress }: { clip: Clip; onPress: () => void }) {
  const t = useT(),
    window = useWindowDimensions(),
    reduceMotion = useReduceMotion();
  const [aspect, setAspect] = useState(
    () => RATIO_ASPECT[clipRatio(clip)] ?? 9 / 16,
  );
  const player = useVideoPlayer(clipUri(clip), (created) => {
    created.loop = true;
    created.muted = true;
  });
  useFocusEffect(
    useCallback(() => {
      const subscription = player.addListener("sourceLoad", (event) => {
        const size = event.availableVideoTracks[0]?.size;
        if (size && size.width > 0 && size.height > 0)
          setAspect(size.width / size.height);
      });
      if (!reduceMotion) player.play();
      return () => {
        subscription.remove();
        player.pause();
      };
    }, [player, reduceMotion]),
  );
  const h = Math.round(
    Math.min((window.width - 2 * Space.gutter) / aspect, window.height * 0.5),
  );
  const w = Math.round(h * aspect);
  const still = reduceMotion ? thumbnailUri(clip) : null;
  return (
    <Pressable
      testID="home-hero"
      accessibilityRole="button"
      accessibilityLabel={t(
        `Son video: ${displayName(clip.name)}, ${spokenDuration(t, clip.duration)}. Aç`,
        `Latest video: ${displayName(clip.name)}, ${spokenDuration(t, clip.duration)}. Open`,
      )}
      onPress={onPress}
      style={({ pressed }) => [
        styles.heroBlock,
        { width: w },
        pressed && Press.media,
      ]}
    >
      <View style={[styles.hero, { width: w, height: h }]}>
        {still ? (
          <Image
            accessible={false}
            accessibilityIgnoresInvertColors
            source={{ uri: still }}
            resizeMode="cover"
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <VideoView
            style={StyleSheet.absoluteFill}
            player={player}
            nativeControls={false}
            contentFit="contain"
          />
        )}
      </View>
      <Caption
        title={displayName(clip.name)}
        detail={formatClock(clip.duration)}
      />
    </Pressable>
  );
}

/** Dynamic Type cap of the Anton texts here; their padding is derived at it. */
const POSTER_SCALE = 1.2;

/**
 * Home before the first video: the engine's own Kampanya frame of the sample
 * fills the screen from the top edge; a paper sheet with the headline and the
 * two ways in sits over its lower part. The ad content is the engine's.
 */
/** Fades an image in once it has decoded (no fade under Reduce Motion). */
function useImageFade(ready: boolean) {
  const reduceMotion = useReduceMotion();
  const fade = useRef(new Animated.Value(0)).current;
  const [decoded, setDecoded] = useState(false);
  useEffect(() => {
    if (!ready || !decoded) return;
    if (reduceMotion) fade.setValue(1);
    else
      Animated.timing(fade, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
  }, [ready, decoded, reduceMotion, fade]);
  return { fade, onLoad: () => setDecoded(true) };
}

/**
 * The bundled sample photo is the first paint, so the hero is never blank; the
 * engine's sample poster fades in over it once it has decoded. If the poster
 * never arrives (no renderer, cut-out failed) the photo simply stays. The
 * photo is sized to the hero area above the sheet (`photo`, in the hero's own
 * coordinates, see photoFrame) so its whole bottle shows on every screen.
 */
function PosterMedia({
  width,
  height,
  photo,
  diagTop,
}: {
  width: number;
  height: number;
  photo: { top: number; left: number; width: number; height: number };
  /** Moves the QA marker back to the window's top edge. */
  diagTop: number;
}) {
  const { lang } = useContext(Language);
  const poster = useTemplatePoster("campaign", null, undefined, {
    backdrop: POSTER_BACKDROP.campaign,
    ratio: "9:16",
    copy: HOME_POSTER_COPY[baseLang(lang)],
  });
  const { fade, onLoad } = useImageFade(!!poster);
  const diagLine = usePosterDiag("campaign");
  return (
    <>
      <Image
        accessible={false}
        accessibilityIgnoresInvertColors
        source={sampleProduct}
        resizeMode="cover"
        style={[styles.homePoster, photo]}
      />
      <Animated.Image
        accessible={false}
        accessibilityIgnoresInvertColors
        source={poster ? { uri: poster } : undefined}
        onLoad={onLoad}
        resizeMode="cover"
        style={[styles.homePoster, { width, height, opacity: fade }]}
      />
      {QA_DIAG && diagLine ? (
        // QA builds only: a 4 px, nearly transparent element whose label a UI
        // test reads from the accessibility tree. It sits at the corner and
        // takes no touches, so nothing moves or is covered.
        <View
          testID="poster-diag"
          accessible
          accessibilityLabel={diagLine}
          pointerEvents="none"
          style={[styles.posterDiag, { top: diagTop }]}
        />
      ) : null}
    </>
  );
}

/**
 * The latest video in the same frame: its still fades in, the muted looping
 * video plays over it while Home is focused (a still under Reduce Motion).
 */
function ClipMedia({
  clip,
  width,
  height,
  playing,
}: {
  clip: Clip;
  width: number;
  height: number;
  /** False while the hero is scrolled out of view: the video pauses. */
  playing: boolean;
}) {
  const reduceMotion = useReduceMotion();
  const still = thumbnailUri(clip);
  const { fade, onLoad } = useImageFade(!!still);
  const fit = clipRatio(clip) === "9:16" ? "cover" : "contain";
  const videoFade = useRef(new Animated.Value(0)).current;
  const showVideo = () =>
    Animated.timing(videoFade, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  const player = useVideoPlayer(clipUri(clip), (created) => {
    created.loop = true;
    created.muted = true;
  });
  useFocusEffect(
    useCallback(() => {
      if (!reduceMotion && playing) player.play();
      return () => {
        player.pause();
      };
    }, [player, reduceMotion, playing]),
  );
  return (
    <View
      style={[
        styles.homePoster,
        { width, height, backgroundColor: Theme.surface },
      ]}
    >
      {still ? (
        <Animated.Image
          accessible={false}
          accessibilityIgnoresInvertColors
          source={{ uri: still }}
          onLoad={onLoad}
          resizeMode={fit}
          style={[StyleSheet.absoluteFill, { opacity: fade }]}
        />
      ) : null}
      {!reduceMotion && (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { opacity: videoFade }]}
        >
          <VideoView
            style={StyleSheet.absoluteFill}
            player={player}
            nativeControls={false}
            contentFit={fit}
            onFirstFrameRender={showVideo}
          />
        </Animated.View>
      )}
    </View>
  );
}

/**
 * Home's hero, compact so the template gallery shows on the first screen
 * (fix round 1): the engine's sample poster (or the latest video) as a 9:16
 * picture on the left, with the VIDORA badge, and the approved headline,
 * "Fotoğraf seç", the sample / resume links and the claim on the right. At
 * most 45 % of the window height (compactHeroLayout); the column may grow
 * past it at large text sizes.
 */
function CompactHero({
  clip,
  onOpen,
  onCreate,
  onSample,
  onResume,
  playing,
}: {
  clip?: Clip;
  onOpen?: () => void;
  onCreate: () => void;
  onSample: () => void;
  /** Set only when a real draft exists; replaces the sample link. */
  onResume?: () => void;
  /** False while the hero is scrolled out of view. */
  playing: boolean;
}) {
  const t = useT(),
    window = useWindowDimensions(),
    insets = useSafeAreaInsets();
  const layout = compactHeroLayout({
    width: window.width,
    height: window.height,
    safeTop: insets.top,
  });
  const pw = layout.posterWidth,
    ph = layout.posterHeight;
  return (
    <View
      style={[
        styles.compact,
        { paddingTop: layout.top, minHeight: layout.heroHeight },
      ]}
    >
      <View style={[styles.compactPoster, { width: pw, height: ph }]}>
        {clip ? (
          <ClipMedia
            key={clip.id}
            clip={clip}
            width={pw}
            height={ph}
            playing={playing}
          />
        ) : (
          <PosterMedia
            width={pw}
            height={ph}
            photo={{ top: 0, left: 0, width: pw, height: ph }}
            diagTop={0}
          />
        )}
        {clip && onOpen ? (
          <Pressable
            testID="home-hero"
            accessibilityRole="button"
            accessibilityLabel={t(
              `Son video: ${displayName(clip.name)}, ${spokenDuration(t, clip.duration)}. Aç`,
              `Latest video: ${displayName(clip.name)}, ${spokenDuration(t, clip.duration)}. Open`,
            )}
            onPress={onOpen}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <View
          accessible
          accessibilityLabel={
            clip ? t("Son videon", "Your latest video") : "Vidora"
          }
          pointerEvents="none"
          style={styles.compactBadge}
        >
          <Text maxFontSizeMultiplier={POSTER_SCALE} style={styles.compactBadgeText}>
            {clip ? t("SON VİDEON", "LATEST") : "VIDORA"}
          </Text>
        </View>
      </View>
      <View style={styles.compactColumn}>
        <View accessible accessibilityRole="header">
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            maxFontSizeMultiplier={POSTER_SCALE}
            style={styles.compactHeadline}
          >
            {t("BİR FOTOĞRAF.", "ONE PHOTO.")}
          </Text>
          <View style={styles.compactBlock}>
            <View pointerEvents="none" style={styles.compactBlockFill} />
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              maxFontSizeMultiplier={POSTER_SCALE}
              style={styles.compactHeadline}
            >
              {t("BİR REKLAM.", "ONE AD.")}
            </Text>
          </View>
        </View>
        <View style={styles.compactButton}>
          <Button
            primary
            testID="home-create"
            label={t("Fotoğraf seç", "Choose a photo")}
            onPress={onCreate}
          />
        </View>
        {/* A real draft replaces the sample link; else the sample starts. */}
        {onResume ? (
          <>
            <Button
              plain
              testID="home-resume-draft"
              label={t("Taslağına devam et", "Resume your draft")}
              onPress={onResume}
            />
            <Button
              plain
              testID="home-sample"
              label={t("Örnekle dene", "Try a sample")}
              onPress={onSample}
            />
          </>
        ) : (
          <Button
            plain
            testID="sample-try"
            label={t("Örnekle dene", "Try a sample")}
            onPress={onSample}
          />
        )}
        <Text style={styles.compactClaim}>
          {t(
            "Önizleme ücretsiz. Video için Vidora Pro gerekir.",
            "Preview is free. Videos need Vidora Pro.",
          )}
        </Text>
      </View>
    </View>
  );
}

type Intent = {
  id: string;
  template: TemplateId;
  ratio: "9x16" | "4x5" | "1x1";
  goal?: "image";
  backdrop?: BackdropId;
  tr: string;
  en: string;
};

/** Ways in by what the seller wants to make; /create reads these params. */
const INTENTS: readonly Intent[] = [
  {
    id: "marketplace",
    template: "showcase",
    ratio: "9x16",
    // Not white marble: that poster is already the proof frame above.
    backdrop: "concrete",
    tr: "Pazaryeri videosu",
    en: "Marketplace video",
  },
  {
    id: "discount",
    template: "discount",
    ratio: "1x1",
    tr: "İndirim duyurusu",
    en: "Sale announcement",
  },
  {
    id: "image",
    template: "editorial",
    ratio: "4x5",
    goal: "image",
    tr: "Kampanya görseli",
    en: "Campaign image",
  },
  {
    id: "store",
    template: "store",
    ratio: "9x16",
    tr: "Mağaza tanıtımı",
    en: "Store intro",
  },
];

/** An engine poster of the intent's template, name and length under it. */
function IntentTile({
  intent,
  width,
  radius,
  onPress,
}: {
  intent: Intent;
  width: number;
  radius: number;
  onPress: () => void;
}) {
  const t = useT();
  const uri = useTemplatePoster(intent.template, null, undefined, {
    ratio: "4:5",
    backdrop: intent.backdrop,
  });
  const name = t(intent.tr, intent.en);
  const seconds = templateById(intent.template).duration;
  const detail =
    intent.goal === "image" ? t("Görsel", "Image") : `${seconds} sn`;
  const spoken =
    intent.goal === "image"
      ? t("görsel", "image")
      : t(`${seconds} saniyelik video`, `${seconds}-second video`);
  return (
    <Pressable
      testID={"intent-" + intent.id}
      accessibilityRole="button"
      accessibilityLabel={name + ", " + spoken}
      onPress={onPress}
      style={({ pressed }) => [
        styles.intent,
        { width },
        pressed && Press.media,
      ]}
    >
      <View style={[styles.intentPicture, { borderRadius: radius }]}>
        {uri && (
          <Image
            accessible={false}
            accessibilityIgnoresInvertColors
            source={{ uri }}
            resizeMode="cover"
            style={StyleSheet.absoluteFill}
          />
        )}
      </View>
      <View style={{ gap: 2 }}>
        <Text style={styles.intentName}>{name}</Text>
        <Text style={styles.intentDetail}>{detail}</Text>
      </View>
    </Pressable>
  );
}

/** Title on the left, one text action on the right. */
function SectionHeader({
  title,
  action,
  onAction,
  testID,
}: {
  title: string;
  action: string;
  onAction: () => void;
  testID?: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={{ flex: 1 }}>
        <Txt title>{title}</Txt>
      </View>
      <HeaderText
        label={action}
        accessibilityLabel={action + ": " + title}
        testID={testID}
        onPress={onAction}
      />
    </View>
  );
}

const GRID_GAP = 6;

export default function Studio() {
  const router = useRouter(),
    t = useT(),
    { width, fontScale } = useWindowDimensions();
  // Read synchronously, so Home opens in its final layout.
  const [recent, setRecent] = useState<Clip[]>(() => {
    try {
      return exportsOf(listSync());
    } catch {
      return [];
    }
  });
  const [seen, setSeen] = useState(() => libraryVersion());
  const [draft, setDraft] = useState<ResumeDraft | null>(newestRealDraft);
  // saveDraft does not bump libraryVersion, so re-read on every focus.
  useFocusEffect(
    useCallback(() => {
      setDraft(newestRealDraft());
    }, []),
  );

  useFocusEffect(
    useCallback(() => {
      const now = libraryVersion();
      if (now === seen) return;
      list()
        .then((clips) => {
          setRecent(exportsOf(clips));
          setSeen(now);
        })
        // A failed refresh keeps the previous list.
        .catch(() => {});
    }, [seen]),
  );

  const [latest, ...older] = recent;
  const empty = recent.length === 0;
  // "Fotoğraf seç" opens the photo source sheet straight away (create.tsx
  // reads `pick`); a short guard stops a double tap pushing two editors.
  const pickTapped = useRef(0);
  const create = () => {
    const now = Date.now();
    if (now - pickTapped.current < 1000) return;
    pickTapped.current = now;
    openEditor(router, { start: {}, pick: true });
  };
  // The same editor, started on the bundled sample (create.tsx reads
  // `sample`). openEditor has no such param, so a short guard stops a double
  // tap from pushing two editors.
  const sampleTapped = useRef(0);
  const sample = () => {
    const now = Date.now();
    if (now - sampleTapped.current < 1000) return;
    sampleTapped.current = now;
    router.push({ pathname: "/create", params: { sample: "1" } });
  };
  // The gallery under the compact hero is on the first screen: its first
  // shelf draws posters right after mount, the others once the seller
  // scrolls (`armed`). The hero video pauses while scrolled out of view.
  const window = useWindowDimensions(),
    insets = useSafeAreaInsets(),
    tabInset = useTabBarInset();
  const heroBottom = compactHeroLayout({
    width: window.width,
    height: window.height,
    safeTop: insets.top,
  }).heroHeight;
  const [armed, setArmed] = useState(false);
  const [heroVisible, setHeroVisible] = useState(true);
  // Stable callbacks (through refs), so the memoised gallery never redraws
  // its 30 cards when Home re-renders.
  const routerNow = useRef(router);
  routerNow.current = router;
  // A card opens the photo library for as many photos as its recipe uses;
  // nothing picked keeps Home. A recipe that needs more (Önce/Sonra: 2) asks
  // for the rest and never starts short. One picker at a time.
  const picking = useRef(false);
  const pickVariant = useCallback(
    async (variant: RecipeVariant) => {
      if (picking.current) return;
      picking.current = true;
      try {
        let photos = await pickProductPhotos(variant.recipe.maxPhotos);
        if (photos.length === 0) return;
        while (missingPhotos(variant.recipe, photos.length) > 0) {
          const need = variant.recipe.minPhotos;
          const more = await new Promise<boolean>((resolve) =>
            Alert.alert(
              t(
                `Bu şablon için ${need} fotoğraf seç: önce ve sonra.`,
                `Choose ${need} photos for this template: before and after.`,
              ),
              undefined,
              [
                {
                  text: t("Vazgeç", "Cancel"),
                  style: "cancel",
                  onPress: () => resolve(false),
                },
                {
                  text: t("Fotoğraf ekle", "Add photos"),
                  onPress: () => resolve(true),
                },
              ],
              { cancelable: true, onDismiss: () => resolve(false) },
            ),
          );
          if (!more) return;
          const added = await pickProductPhotos(
            missingPhotos(variant.recipe, photos.length),
          );
          photos = photos
            .concat(added.filter((uri) => !photos.includes(uri)))
            .slice(0, variant.recipe.maxPhotos);
        }
        openEditor(routerNow.current, {
          start: { variant: variant.id },
          photos,
        });
      } catch (error) {
        diag("gallery photo pick failed", { error });
      } finally {
        picking.current = false;
      }
    },
    [t],
  );
  const onPickVariant = useCallback(
    (variant: RecipeVariant) => void pickVariant(variant),
    [pickVariant],
  );
  // "Örnekle dene" under a card: the same variant on the bundled sample.
  const sampleVariant = useCallback((variant: RecipeVariant) => {
    const now = Date.now();
    if (now - sampleTapped.current < 1000) return;
    sampleTapped.current = now;
    routerNow.current.push({
      pathname: "/create",
      params: { sample: "1", variant: variant.id },
    });
  }, []);
  // The Editoryal card: up to 8 photos, then the editor in editorial mode
  // (it asks the cloud for the AI shots); nothing picked keeps Home.
  const pickEditorial = useCallback(async () => {
    if (picking.current) return;
    picking.current = true;
    try {
      const photos = await pickProductPhotos(8);
      if (photos.length === 0) return;
      openEditor(routerNow.current, { start: { editorial: "1" }, photos });
    } catch (error) {
      diag("gallery photo pick failed", { error });
    } finally {
      picking.current = false;
    }
  }, []);
  const onPickEditorial = useCallback(() => void pickEditorial(), [pickEditorial]);
  // Its "Örnekle dene": the editorial video on the bundled sample shots.
  const sampleEditorial = useCallback(() => {
    const now = Date.now();
    if (now - sampleTapped.current < 1000) return;
    sampleTapped.current = now;
    routerNow.current.push({
      pathname: "/create",
      params: { sample: "1", editorial: "1" },
    });
  }, []);
  const openClip = (clip: Clip) => {
    if (deskOpenGuard("video:" + clip.id))
      router.push({ pathname: "/video", params: { id: clip.id } });
  };
  // Three columns inside the gutters.
  const cell = Math.floor((width - 2 * Space.gutter - 2 * GRID_GAP) / 3);
  // Four small intent tiles in one row; two at large text sizes.
  const columns = fontScale > 1.2 ? 2 : 4;
  const intentGap = columns === 4 ? Space.s : Space.m;
  const intentWidth = Math.floor(
    (width - 2 * Space.gutter - (columns - 1) * intentGap) / columns,
  );

  // One layout: the compact hero (the approved ad and its two ways in; once
  // there are videos, the latest one) and right under it the template
  // gallery's shelves, the first one on the first screen.
  if (SINGLE_FLOW)
    return (
      <ScrollView
        style={styles.scroll}
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={200}
        onScroll={(event) => {
          const y = event.nativeEvent.contentOffset.y;
          // Same values bail out in React: no re-render while scrolling.
          if (y > 24) setArmed(true);
          setHeroVisible(y < heroBottom);
        }}
      >
        <CompactHero
          clip={latest}
          onOpen={latest ? () => openClip(latest) : undefined}
          onCreate={create}
          onSample={sample}
          playing={heroVisible}
          onResume={
            draft
              ? () =>
                  openEditor(router, {
                    draft: { id: draft.id, sourceClip: draft.sourceClip },
                  })
              : undefined
          }
        />
        <TemplateGallery
          armed={armed}
          bottomInset={tabInset}
          onPick={onPickVariant}
          onSample={sampleVariant}
          onEditorial={onPickEditorial}
          onEditorialSample={sampleEditorial}
        />
      </ScrollView>
    );

  return (
    <Screen title={t("Stüdyo", "Studio")}>
      {latest ? (
        <Showcase
          key={latest.id}
          clip={latest}
          onPress={() => openClip(latest)}
        />
      ) : null}

      <View style={styles.cta}>
        <Button
          primary
          testID="home-create"
          icon={SINGLE_FLOW ? undefined : "video.badge.plus"}
          label={t("Ürün videosu oluştur", "Create a product video")}
          onPress={create}
        />
        {/* Part of the pitch: gone once the seller has made a video. */}
        {empty && !FEATURES.aiStudio && !SINGLE_FLOW && <EdgeFacts />}
      </View>

      {!SINGLE_FLOW && (
        <View style={styles.section}>
          <SectionHeader
            title={t("Ne yapmak istiyorsun?", "What do you want to make?")}
            action={t("Tüm şablonlar", "All templates")}
            testID="home-all-templates"
            onAction={() =>
              router.push({
                pathname: "/create",
                params: { browse: "templates" },
              })
            }
          />
          <View
            style={[styles.intents, { columnGap: intentGap, rowGap: Space.xl }]}
          >
            {INTENTS.map((intent) => (
              <IntentTile
                key={intent.id}
                intent={intent}
                width={intentWidth}
                radius={columns === 4 ? Radius.s : Radius.m}
                onPress={() =>
                  openEditor(router, {
                    start: {
                      template: intent.template,
                      ratio: intent.ratio,
                      goal: intent.goal,
                    },
                  })
                }
              />
            ))}
          </View>
        </View>
      )}

      {!SINGLE_FLOW && older.length > 0 && (
        <View style={styles.section}>
          <SectionHeader
            title={t("Son videolar", "Recent videos")}
            action={t("Tümü", "All")}
            testID="home-all-videos"
            onAction={() => router.push("/library")}
          />
          <View style={styles.grid}>
            {older.slice(0, 6).map((clip) => {
              const thumb = thumbnailUri(clip);
              const ratio = clipRatio(clip);
              return (
                <Pressable
                  key={clip.id}
                  accessibilityRole="button"
                  accessibilityLabel={[
                    displayName(clip.name),
                    ratioWords(t, ratio),
                    spokenDuration(t, clip.duration),
                  ].join(", ")}
                  onPress={() => openClip(clip)}
                  style={({ pressed }) => [
                    styles.gridCell,
                    { width: cell },
                    pressed && Press.media,
                  ]}
                >
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
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {!SINGLE_FLOW && (
        <View style={styles.section}>
          <Section>
            <Row
              first
              icon="film.stack"
              label={t("Kurgu masası", "Editing desk")}
              detail={t(
                "Kendi videolarını kırp, birleştir, altyazı ekle.",
                "Trim and join your own clips, add captions.",
              )}
              onPress={() => {
                if (deskOpenGuard("desk:new")) router.push("/editor");
              }}
            />
            {FEATURES.aiStudio && (
              <Row
                icon="photo.on.rectangle.angled"
                label={t("AI Stüdyo", "AI Studio")}
                onPress={() => router.push("/engine")}
              />
            )}
          </Section>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Theme.bg },
  compact: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
    paddingHorizontal: Space.gutter,
    paddingBottom: 12,
    backgroundColor: Theme.bg,
  },
  compactPoster: {
    borderRadius: Radius.xl,
    overflow: "hidden",
    backgroundColor: Theme.surface,
  },
  compactBadge: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: Theme.text,
    borderRadius: Radius.s,
    paddingHorizontal: 7,
    paddingTop: 3,
    paddingBottom: 2,
  },
  compactBadgeText: {
    ...Type.display,
    // 14/17 and 3 pt above line 1; the padding for the marks of İ is added
    // on top of it (and taken back by marginTop), as for the big badge.
    ...displayBox(14, 17, 3, POSTER_SCALE),
    letterSpacing: 0.8,
    color: Theme.bg,
  },
  compactColumn: { flex: 1, gap: 4 },
  compactHeadline: { ...Type.display, ...displayMetrics(30, POSTER_SCALE) },
  // As `block` below, scaled from 41 to 30 pt.
  compactBlock: { alignSelf: "flex-start", marginTop: -2 },
  compactBlockFill: {
    position: "absolute",
    top: -7,
    bottom: 0,
    left: -4,
    right: -4,
    backgroundColor: Theme.accent,
  },
  compactButton: { marginTop: Space.m },
  compactClaim: {
    ...Type.body,
    fontFamily: Face.bold,
    fontWeight: "700",
    fontSize: 13,
    lineHeight: 17,
    color: Theme.muted,
  },
  home: { flex: 1, backgroundColor: Theme.surface },
  homePoster: { position: "absolute", top: 0, left: 0 },
  // QA only (poster-diag): tiny and nearly transparent, still in the tree.
  posterDiag: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 4,
    height: 4,
    opacity: 0.08,
    backgroundColor: Theme.text,
  },
  badge: {
    position: "absolute",
    right: Space.gutter,
    backgroundColor: Theme.text,
    borderRadius: Radius.s,
    paddingHorizontal: 11,
    paddingTop: 5,
    paddingBottom: 4,
  },
  badgeText: {
    ...Type.display,
    // 22/26 and 5 pt above line 1 as laid out; the padding for the marks of
    // İ is added on top of it (and taken back by marginTop).
    ...displayBox(22, 26, 5, POSTER_SCALE),
    letterSpacing: 1.3,
    color: Theme.bg,
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Theme.bg,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingTop: Space.xl - 12,
    paddingHorizontal: Space.gutter,
  },
  headline: { ...Type.display, ...displayMetrics(41, POSTER_SCALE) },
  // The accent sits behind the text (never clips it): the block is a
  // padded absolute layer, the text keeps its full line box. Like the mock's
  // inline background it is the font's content area (1.177 em above the
  // baseline of line 2 down to 0.33 em below it), so the dot of the İ sits
  // inside the band. Line 1's baseline is 1.3 pt above the band's top edge.
  block: { alignSelf: "flex-start", marginTop: -3 },
  blockFill: {
    position: "absolute",
    top: -9,
    bottom: 0,
    left: -6,
    right: -6,
    backgroundColor: Theme.accent,
  },
  sheetButton: { marginTop: Space.l },
  sheetLink: { alignItems: "center", marginTop: 6 },
  sheetSample: { marginTop: Space.s },
  claim: {
    ...Type.body,
    fontFamily: Face.bold,
    fontWeight: "700",
    fontSize: 13,
    lineHeight: 17,
    color: Theme.muted,
    textAlign: "center",
  },
  heroBlock: { gap: Space.s, alignSelf: "center" },
  hero: {
    borderRadius: Radius.xl,
    overflow: "hidden",
    backgroundColor: Theme.surface,
  },
  caption: { gap: 2 },
  captionTitle: {
    color: Theme.text,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "600",
  },
  captionDetail: {
    color: Theme.muted,
    fontSize: 13,
    lineHeight: 18,
    fontVariant: ["tabular-nums"],
  },
  cta: { gap: Space.m, marginTop: SINGLE_FLOW ? Space.l : Space.s },
  section: { gap: Space.m, marginTop: Space.l },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.m,
  },
  intents: { flexDirection: "row", flexWrap: "wrap" },
  intent: { gap: Space.s },
  intentPicture: {
    width: "100%",
    aspectRatio: 4 / 5,
    overflow: "hidden",
    backgroundColor: Theme.surface,
  },
  intentName: { fontSize: 15, lineHeight: 20, color: Theme.text },
  intentDetail: {
    fontSize: 13,
    lineHeight: 18,
    color: Theme.muted,
    fontVariant: ["tabular-nums"],
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GRID_GAP },
  gridCell: {
    aspectRatio: 3 / 4,
    borderRadius: Radius.s,
    overflow: "hidden",
    backgroundColor: Theme.surface,
  },
  duration: { position: "absolute", right: 6, bottom: 6 },
});
