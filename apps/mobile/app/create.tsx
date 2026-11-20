import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { baseLang } from "../src/i18n/lang";
import {
  AccessibilityInfo,
  AppState,
  Alert,
  Image,
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
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  usePreventRemove,
  useRouter,
  useIsFocused,
} from "expo-router";
import { showActionSheet } from "../src/action-sheet";
import {
  QA_DIAG,
  QA_QUALITY,
  QA_RECIPE,
  QA_SLOW_RENDER,
  SINGLE_FLOW,
  SINGLE_FLOW_TEMPLATES,
} from "../src/config";
import { cloudAvailable, takeChosenScene } from "../src/cloud";
import { productPlacement } from "../src/cloud-rules";
import type { SceneInput } from "../src/product-templates";
import { Asset } from "expo-asset";
import sampleProduct from "../assets/sample-product.jpg";
import { buildRecipeSpec } from "../src/recipes/build";
import { YENI_KOLEKSIYON } from "../src/recipes/yeni-koleksiyon";
import {
  Button,
  Face,
  Language,
  Space,
  Theme,
  useT,
  tap,
  HeaderText,
  type IconName,
  goBack,
} from "../src/ui";
import { usePro } from "../src/pro-context";
import { setPaywallProof } from "../src/paywall-proof";
import { recordSuccessfulSave } from "../src/review-prompt";
import { offerAfterPurchase, offerFreeExport } from "../src/pro";
import {
  LocalizedError,
  PermissionError,
  describeError,
  list as listClips,
  musicExists,
  musicUri,
  pickMusic,
  remove as removeClip,
  saveToPhotos,
  share,
  takeProductPhoto,
  uri as clipUri,
  type Clip,
} from "../src/media";
import {
  draftTitle,
  isDraftId,
  serializeEditState,
  type Draft,
  type EditState,
} from "../src/drafts";
import {
  deleteDraft,
  loadDraft,
  loadEdit,
  newDraftId,
  removeEdit,
  saveDraft,
  releaseMusic,
  discardEditorFile,
  saveEdit,
  sweepEditorCache,
  importOwnBackdrop,
  rememberSampleCutout,
  draftForClip,
  editRatio,
  ownBackdropExists,
  ownBackdropUri,
  releaseOwnBackdrop,
} from "../src/draft-store";
import {
  OWN_OFFSET,
  OWN_SCALE,
  OWN_TEXT_COLORS,
  contrastingBackdrops,
  imageSetSummary,
  ownBackdropScene,
  stepValue,
  textForImage,
  type OwnBackdrop,
} from "../src/backdrop-rules";
import { matchingLook, type Look } from "../src/looks";
import { diag } from "../src/diag";
import {
  RENDER_DIAG_IDLE,
  renderDiagCancelled,
  renderDiagDone,
  renderDiagFail,
  renderDiagProgress,
  renderDiagStart,
  renderFailCode,
  secondsBetween,
} from "../src/render-diag";
import {
  createRenderWatchdog,
  CANCEL_SLOW_AFTER_MS,
  monotonicNow,
  stallBudgetMs,
} from "../src/render-watchdog";
import { loadLastLook, saveLastLook } from "../src/last-look";
import {
  SAMPLE_COPY,
  forgetUserPosters,
  sampleEditorCutout,
} from "../src/sample-frames";
import {
  autosaveDelay,
  createEditorRegistry,
  createReleaseQueue,
  missingFilesNote,
} from "../src/editor-session";
import {
  commitRender,
  replaceTarget,
  type EditTarget,
} from "../src/render-commit";
import { ExportPanel, specFromState } from "../src/editor-export";
import { CampaignStrip } from "../src/campaign-strip";
import { brandAccent, loadBrandKit, type BrandKit } from "../src/brand-kit";
import type { PriceTagId } from "../src/price-tags";
import {
  EXPORT_ALL_STEPS,
  exportAllLabel,
  exportAllSummaryLine,
  runExportAll,
  type ExportStep,
} from "../src/export-all";
import {
  MARKETPLACE_IMAGES,
  marketplaceImageById,
  stillStyleById,
  type StillStyleId,
  marketplaceTextRisk,
  presetQuality,
  type MarketplaceImageId,
} from "../src/marketplace-images";
import {
  aiCopySuggestions,
  cancelProductRender,
  cutOut,
  hasStillExport,
  imageInfo,
  pickProductPhoto,
  renderProductVideo,
  type Cutout,
} from "../src/product";
import {
  BACKDROPS,
  CATEGORY_BACKDROP,
  DEFAULT_BACKGROUND,
  backdropById,
  backdropScene,
  type BackdropId,
} from "../src/backdrops";
import {
  PhotosSaveError,
  ensurePhotosAccess,
  saveMarketplaceImage,
  saveStill,
  saveStillToPhotos,
} from "../src/studio/still";
import { ImageSetSheet } from "../src/studio/image-set-sheet";
import { LooksList, TemplatesList } from "../src/studio/looks-row";
import { openPaywall, type PaywallEntry } from "../src/studio/open-editor";
import {
  RATIOS,
  TEMPLATES,
  DEFAULT_FONT_STYLE,
  buildSpec,
  isWholePhotoCutout,
  photoWarnings,
  paletteById,
  templateById,
  type AspectRatio,
  type FontStyle,
  type PaletteId,
  type ProductQuality,
  type ProductVideoSpec,
  type TemplateId,
} from "../src/product-templates";
import {
  CATEGORIES,
  bankSuggestions,
  categoryById,
  type CategoryId,
  type CopySuggestions,
  type ExportPreset,
} from "../src/product-catalog";
import {
  Banner,
  EditorSheet,
  EditorTabs,
  FILL,
  HeaderAction,
  HeaderBack,
  SwipePanel,
  posterWidth,
  ToolBar,
  useReduceMotion,
  type ToolId,
} from "../src/studio/controls";
import {
  BackgroundPanel,
  FormatPanel,
  MusicPanel,
  TemplateChoicePanel,
  TemplatePanel,
  TextPanel,
} from "../src/studio/panels";
import {
  PreviewPlayer,
  TRANSPORT_HEIGHT,
  TransportButton,
  type TransportStatus,
} from "../src/studio/preview-player";
import { ResultView } from "../src/studio/result-view";
import { StartView } from "../src/studio/start-view";
import {
  usePlayingPreview,
  usePreviewMusic,
} from "../src/studio/use-playing-preview";

const unique = (items: string[], max: number) =>
  items
    .filter(
      (item, index) =>
        items.findIndex(
          (other) => other.toLowerCase() === item.toLowerCase(),
        ) === index,
    )
    .slice(0, max);

/** Width / height for a frame shape. */
const aspectOf = (ratio: AspectRatio) =>
  ratio === "1:1" ? 1 : ratio === "4:5" ? 4 / 5 : 9 / 16;

/** Pixel size of a local image; null when it cannot be read. */
const imageSizeOf = (uri: string) =>
  new Promise<{ width: number; height: number } | null>((resolve) =>
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      () => resolve(null),
    ),
  );

/** Route values like "4x5" for Home's intent tiles. */
const ratioParam = (value: unknown): AspectRatio | null => {
  if (typeof value !== "string") return null;
  const ratio = value.replace("x", ":");
  return (RATIOS as readonly string[]).includes(ratio)
    ? (ratio as AspectRatio)
    : null;
};

/** Height of the photo hint: two footnote lines, growing with the text cap. */
/** A remembered button text that is a stock line of the OTHER language. */
const otherLangCta = (cta: string, lang: "tr" | "en") => {
  const other = lang === "tr" ? "en" : "tr";
  return CATEGORIES.some((item) => item.ctas[other].includes(cta));
};
/** Pixel size of a picked photo; null when it cannot be read. */
const photoPixelSize = (uri: string) =>
  new Promise<{ width: number; height: number } | null>((resolve) =>
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      () => resolve(null),
    ),
  );
const photoHintHeight = (fontScale: number) =>
  Math.max(44, 4 + 2 * Math.ceil(18 * Math.min(fontScale, 1.3)));

/**
 * Editors on screen: the opening cache sweep may only run when no other
 * editor is mounted, or it deletes that editor's working cut-out.
 */
const editors = createEditorRegistry();

/**
 * Whether this device can write AI suggestions (Apple Intelligence), per
 * language. A "no" from an error is never kept, and the cache is cleared
 * when the app comes back to the front (it may have been turned on).
 * TODO(render-quality): use a native copyAvailability(lang) with reasons
 * (device / off / notReady / language) instead of a probe generation
 * (audit F19); until then every "no" reads as "device".
 */
const aiProbes = new Map<string, Promise<boolean>>();
function aiAvailable(lang: "tr" | "en"): Promise<boolean> {
  let probe = aiProbes.get(lang);
  if (!probe) {
    probe = aiCopySuggestions(
      "cosmetics",
      lang === "tr" ? "ürün" : "product",
      lang,
    )
      .then((result) => result !== null)
      .catch(() => {
        aiProbes.delete(lang);
        return false;
      });
    aiProbes.set(lang, probe);
  }
  return probe;
}
AppState.addEventListener("change", (state) => {
  if (state === "active") aiProbes.clear();
});

/** Where the draft is written and which library video a render replaces. */
type DraftMeta = { id: string; created: number; sourceClip: string | null };

/**
 * Layout changes (a panel opening or closing, the keyboard coming and going,
 * the result replacing the editor) apply at once. There is deliberately no
 * layout animation: on Fabric it delays the removal of views and crashed the
 * mounting layer when the render started (QA run 22;
 * `no-layout-animation.test.mjs`).
 */

/** Longest wait for the keyboard to finish hiding before a render starts. */
const KEYBOARD_HIDE_WAIT_MS = 800;

/**
 * Hides the keyboard and resolves once it is gone (at once when none is up).
 * A render starts only after this, so the keyboard's own layout change (the
 * thumbnail back to the full preview) is over and never overlaps the first
 * commit of the render. A missing event cannot hang it.
 */
function keyboardGone(): Promise<void> {
  if (!Keyboard.isVisible()) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const subscription = Keyboard.addListener("keyboardDidHide", () => done());
    function done() {
      subscription.remove();
      if (timer) clearTimeout(timer);
      resolve();
    }
    timer = setTimeout(done, KEYBOARD_HIDE_WAIT_MS);
    Keyboard.dismiss();
  });
}

/**
 * The watchdog gave up on a render that sent no sign of life: the screen's
 * existing "could not be made" copy (src/product.ts), shown as the banner;
 * the Videoyu oluştur button is the way to try again.
 */
const stalledRenderError = () =>
  new LocalizedError(
    "Video hazırlanamadı. Tekrar dene.",
    "The video could not be made. Please try again.",
  );

// Vitrin: the single flow uses the paper sheet; the full editor keeps the
// swipe panel (hidden, not deleted).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PanelShell: ComponentType<any> = SINGLE_FLOW ? EditorSheet : SwipePanel;

/** QA_RECIPE only: file uri of the bundled sample photo. */
async function qaSamplePhotoUri(): Promise<string | null> {
  const asset = await Asset.fromModule(sampleProduct).downloadAsync();
  return asset.localUri ?? asset.uri ?? null;
}

export default function CreateProductVideo() {
  const params = useLocalSearchParams<{
      draft?: string;
      edit?: string;
      duplicate?: string;
      /** Home's intent tiles; only for a new video. */
      template?: string;
      ratio?: string;
      goal?: string;
      /** Home's "Tüm şablonlar": open the start view at the templates. */
      browse?: string;
      /** Home's "Örnekle dene": start on the bundled sample photo. */
      sample?: string;
      /** Home's "Fotoğraf seç": open the photo source sheet once. */
      pick?: string;
    }>(),
    router = useRouter(),
    t = useT(),
    { isPro, loading: proLoading } = usePro(),
    { lang } = useContext(Language),
    insets = useSafeAreaInsets(),
    screen = useWindowDimensions(),
    isFocused = useIsFocused(),
    reduceMotion = useReduceMotion();
  const [focusedField, setFocusedField] = useState<string | null>(null);
  // QA_RECIPE only: the picked photo that `cutout` was made from; not saved.
  const [sourcePhoto, setSourcePhoto] = useState<{
    cutout: string;
    photo: string;
  } | null>(null),
    [cutout, setCutout] = useState<Cutout | null>(null),
    [category, setCategory] = useState<CategoryId>("cosmetics"),
    // True once the user picked a template or colour; then a category
    // change no longer replaces them (it still updates the copy ideas).
    [styleChosen, setStyleChosen] = useState(false),
    [template, setTemplate] = useState<TemplateId>(
      SINGLE_FLOW ? "campaign" : "showcase",
    ),
    [palette, setPalette] = useState<PaletteId>("blush"),
    // A bundled studio backdrop (by id); null for a plain palette or AI scene.
    [backdrop, setBackdrop] = useState<BackdropId | null>(
      DEFAULT_BACKGROUND === "backdrop" ? CATEGORY_BACKDROP.cosmetics : null,
    ),
    // The resolved scene of `backdrop` for the current cut-out size.
    [backdropShown, setBackdropShown] = useState<{
      key: string;
      scene: SceneInput;
    } | null>(null),
    // The seller's own backdrop photo, kept while another background shows.
    [ownBackdrop, setOwnBackdrop] = useState<OwnBackdrop | null>(null),
    // The photo is the background now (wins over `backdrop` and `scene`).
    [ownActive, setOwnActive] = useState(false),
    // The rendered video was saved to Photos (the result view says so).
    [savedClip, setSavedClip] = useState<string | null>(null),
    // A short success line in the transport row.
    [flash, setFlash] = useState<string | null>(null),
    [imageSetOpen, setImageSetOpen] = useState(false),
    [imageSetProgress, setImageSetProgress] = useState<{
      done: number;
      total: number;
    } | null>(null),
    [ratio, setRatio] = useState<AspectRatio>("9:16"),
    // null follows the template's own type family.
    [fontStyle, setFontStyle] = useState<FontStyle | null>(null),
    [oldPrice, setOldPrice] = useState(""),
    // Price tag layout (src/price-tags.ts); null keeps the template's own.
    [priceTag, setPriceTag] = useState<PriceTagId | null>(null),
    // Brand kit read when a NEW video starts (accent colour; the font is set once).
    [brandKit, setBrandKit] = useState<BrandKit | null>(null),
    [store, setStore] = useState(""),
    [preset, setPreset] = useState<ExportPreset>("trendyol"),
    [aiCopy, setAiCopy] = useState<CopySuggestions | null>(null),
    [aiNote, setAiNote] = useState(""),
    [headline, setHeadline] = useState(""),
    [price, setPrice] = useState(""),
    [badge, setBadge] = useState(""),
    [cta, setCta] = useState(t("Hemen sipariş ver", "Order now")),
    [quality, setQuality] = useState<ProductQuality>("720p"),
    [busy, setBusy] = useState<string | null>(null),
    [progress, setProgress] = useState<number | null>(null),
    // The first progress event arrived; until then the native side prepares.
    [progressSeen, setProgressSeen] = useState(false),
    // Nothing moved for a while: the quiet note next to İptal.
    [stalled, setStalled] = useState(false),
    // İptal was pressed (or the watchdog gave up): waiting for the render to end.
    [cancelling, setCancelling] = useState(false),
    // The cancel has not settled for CANCEL_SLOW_AFTER_MS.
    [cancelSlow, setCancelSlow] = useState(false),
    // QA only: the render timeline (testID "render-diag").
    [diagLine, setDiagLine] = useState(RENDER_DIAG_IDLE),
    [output, setOutput] = useState<Clip | null>(null),
    [showResult, setShowResult] = useState(false),
    [message, setMessage] = useState(""),
    [needsSettings, setNeedsSettings] = useState(false),
    [music, setMusic] = useState<{ file: string; name: string } | null>(null),
    [tool, setTool] = useState<ToolId | null>(
      SINGLE_FLOW ? "text" : "template",
    ),
    [stage, setStage] = useState({ width: 0, height: 0 }),
    // Height of the screen under the navigation bar.
    [area, setArea] = useState(0),
    // Height of the on-screen keyboard; 0 when hidden.
    [keyboard, setKeyboard] = useState(0),
    [scene, setScene] = useState<SceneInput | null>(null),
    [dirty, setDirty] = useState(false),
    [aiReady, setAiReady] = useState<boolean | null>(null),
    [resultNote, setResultNote] = useState(""),
    // Shape of the last rendered video (the editor's may change after).
    [outputRatio, setOutputRatio] = useState<AspectRatio>("9:16"),
    // "Hepsini çıkar" running: the progress line ("Hazırlanıyor 2/6: …").
    [exportAllLine, setExportAllLine] = useState<string | null>(null);
  const exportAllCancel = useRef(false);
  // Mirrors `exportAllLine !== null` for the unmount cleanup (a stale closure).
  const exportAllActive = useRef(false);
  exportAllActive.current = exportAllLine !== null;
  // The cut-out (by uri) that came out as the whole photo: nothing separated.
  const [wholePhotoUri, setWholePhotoUri] = useState<string | null>(null);

  const draftMeta = useRef<DraftMeta>({
    id: newDraftId(),
    created: Date.now(),
    sourceClip: null,
  });
  /**
   * What was last written (or loaded); null until the first cut-out; ""
   * forces the next autosave to write (a new photo, a duplicate).
   */
  const savedKey = useRef<string | null>(null);
  /** The video this editor re-edits (Düzenle) and its frame shape. */
  const editTarget = useRef<EditTarget | null>(null);
  /** False after unmount: late async work must not change the files. */
  const mounted = useRef(true);
  /** Replaced music / own photos, released only after the next save. */
  const releases = useRef(createReleaseQueue()).current;
  /** When the oldest unsaved change happened (autosave max wait). */
  const pendingSince = useRef<number | null>(null);
  /** A failed autosave is told once until a save works again. */
  const saveFailTold = useRef(false);
  const qualityChosen = useRef(false);
  /** The user changed the backdrop or button text; a late last look yields. */
  const lookTouched = useRef(false);
  /** One action at a time: a second tap is ignored (audit F43). */
  const running = useRef(false);
  /** The AI availability wait is running (audit F19). */
  const aiChecking = useRef(false);
  /** The open tool before a render; back after a cancel or error. */
  const toolBeforeRender = useRef<ToolId | null>(null);
  /**
   * Frame shape the panel height is planned for; it follows the ratio except
   * while Format is open, so trying shapes does not resize the panel.
   */
  const reserveAspect = useRef(9 / 16);

  /** Put a stored draft or video state back into the editor. */
  function applyState(state: EditState, cutoutUri: string) {
    setCutout({ uri: cutoutUri, ...state.cutout });
    setTemplate(state.template);
    setPalette(state.palette);
    setCategory(state.category);
    setStyleChosen(state.styleChosen);
    setHeadline(state.headline);
    setPrice(state.price);
    setBadge(state.badge);
    setCta(state.cta);
    setStore(state.store);
    setMusic(state.music);
    setPreset(state.preset);
    setQuality(state.quality);
    setScene(state.scene);
    setBackdrop(state.backdrop);
    // An own photo deleted meanwhile is dropped; the backdrop id (if any) or
    // the palette shows instead.
    const ownStored =
      state.ownBackdrop && ownBackdropExists(state.ownBackdrop.file)
        ? state.ownBackdrop
        : null;
    setOwnBackdrop(ownStored);
    setOwnActive(!!ownStored && state.ownActive);
    setRatio(state.ratio);
    setFontStyle(state.fontStyle);
    setOldPrice(state.oldPrice);
    setPriceTag(state.priceTag);
    setBrandKit(
      state.brandAccent
        ? { accent: state.brandAccent.accent, font: null, logo: null }
        : null,
    );
    qualityChosen.current = true;
  }

  // Opened from the library: a draft, or a finished video to edit/duplicate.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    // Leftover cut-outs and AI scenes from earlier visits are not in use,
    // unless another editor is still mounted underneath this one.
    const session = editors.enter();
    leaveEditors.current = session.leave;
    if (session.sweep) {
      sweepEditorCache();
      // Posters of an earlier cut-out are not needed any more (audit F54).
      forgetUserPosters();
    }
    const { draft, edit, duplicate } = params;
    if (!draft && !edit && !duplicate) {
      // A new video from one of Home's intent tiles; unknown values are
      // ignored.
      const fromTile = TEMPLATES.find((item) => item.id === params.template);
      if (fromTile && !SINGLE_FLOW) {
        setTemplate(fromTile.id);
        setStyleChosen(true);
      }
      const shape = ratioParam(params.ratio);
      if (shape && !SINGLE_FLOW) setRatio(shape);
      if (params.goal === "image" && !SINGLE_FLOW) setTool("format");
      // The next new video starts with the last backdrop and button text.
      // Skipped for the sample (its own copy) and once the user chose a look.
      void loadBrandKit().then((kit) => {
        if (!kit || !mounted.current) return;
        setBrandKit(kit);
        if (kit.font) setFontStyle((current) => current ?? kit.font);
      });
      if (params.sample !== "1") {
        void loadLastLook(BACKDROPS.map((item) => item.id)).then((look) => {
          if (!look || !mounted.current || lookTouched.current) return;
          const id = BACKDROPS.find((item) => item.id === look.backdrop)?.id;
          if (id) {
            setBackdrop(id);
            setStyleChosen(true);
          }
          if (look.cta && !otherLangCta(look.cta, baseLang(lang)))
            setCta(look.cta);
        });
      }
      return;
    }
    let loaded: { draft: Draft; cutoutUri: string } | null = null;
    try {
      if (isDraftId(draft)) {
        loaded = loadDraft(draft);
        if (loaded)
          draftMeta.current = {
            id: draft,
            created: loaded.draft.created,
            sourceClip: loaded.draft.sourceClip,
          };
      } else if (isDraftId(edit)) {
        // Düzenle: edits already made to this video come back.
        const existing = draftForClip(edit);
        const fromDraft = existing ? loadDraft(existing) : null;
        loaded = fromDraft ?? loadEdit(edit);
        if (loaded)
          draftMeta.current =
            fromDraft && existing
              ? {
                  id: existing,
                  created: fromDraft.draft.created,
                  sourceClip: edit,
                }
              : { id: newDraftId(), created: Date.now(), sourceClip: edit };
      } else if (isDraftId(duplicate)) {
        // Çoğalt: a new video from a copy, written as a draft right away.
        loaded = loadEdit(duplicate);
        if (loaded)
          draftMeta.current = {
            id: newDraftId(),
            created: Date.now(),
            sourceClip: null,
          };
      }
    } catch {
      loaded = null;
    }
    if (!loaded) {
      setMessage(
        t(
          "Bu çalışma açılamadı; dosyaları silinmiş olabilir.",
          "This work could not be opened; its files may have been deleted.",
        ),
      );
      return;
    }
    // A music file or own photo deleted meanwhile is dropped, and said once.
    const missing = {
      music: !!loaded.draft.music && !musicExists(loaded.draft.music.file),
      backdrop:
        !!loaded.draft.ownBackdrop &&
        !ownBackdropExists(loaded.draft.ownBackdrop.file),
    };
    if (missing.music)
      loaded = { ...loaded, draft: { ...loaded.draft, music: null } };
    const note = missingFilesNote(missing, lang);
    if (note) setMessage(note);
    applyState(loaded.draft, loaded.cutoutUri);
    // A render replaces a video only for Düzenle on it, in the same shape.
    const source = draftMeta.current.sourceClip;
    const sourceRatio = source ? editRatio(source) : null;
    editTarget.current =
      source && sourceRatio ? { clipId: source, ratio: sourceRatio } : null;
    // A duplicate is written at once, so it exists even if nothing changes.
    savedKey.current = isDraftId(duplicate)
      ? ""
      : serializeEditState(loaded.draft) + "|" + loaded.cutoutUri;
    setTool(
      SINGLE_FLOW || isDraftId(edit) || isDraftId(duplicate)
        ? "text"
        : "template",
    );
    // Restores once on mount; later param changes do not reload.
  }, []);

  // Coming back from AI Sahne with a chosen scene: use it as the background.
  useFocusEffect(
    useCallback(() => {
      const chosen = takeChosenScene();
      if (chosen) {
        setScene({
          uri: chosen.backgroundUri,
          crop: chosen.crop,
          productRect: chosen.productRect,
        });
        setBackdrop(null);
        // The own photo stays for later; only the scene shows now.
        setOwnActive(false);
        setStyleChosen(true);
      }
    }, []),
  );
  const cancelled = useRef(false);
  /** When the cancel was issued (monotonic ms), for the slow-cancel line. */
  const cancelAt = useRef<number | null>(null);
  /** The watchdog (not the user) cancelled this render. */
  const stalledOut = useRef(false);
  const [watchdog] = useState(() =>
    createRenderWatchdog({
      now: monotonicNow,
      cancelAfterMs: stallBudgetMs(QA_SLOW_RENDER),
    }),
  );
  /** QA timeline: when this render began and its latest progress (0..1). */
  const renderClock = useRef({ startedAt: 0, percent: 0 });
  /** The preview frame's size, for the QA timeline. */
  const boxNow = useRef({ width: 0, height: 0 });
  // True while a native render runs; leaving the screen cancels it so it
  // does not keep running (and draining the battery) with nobody watching.
  const rendering = useRef(false);
  useEffect(
    () => () => {
      if (exportAllActive.current) {
        exportAllCancel.current = true;
        cancelProductRender();
      }
      if (!rendering.current) return;
      cancelled.current = true;
      cancelProductRender();
    },
    [],
  );

  // The preview shrinks to a thumbnail and the fields restack with the
  // keyboard; the change applies at once.
  useEffect(() => {
    const show = Keyboard.addListener("keyboardWillShow", (event) => {
      if (QA_DIAG)
        diag("kb:willShow h=" + Math.round(event.endCoordinates.height));
      setKeyboard(event.endCoordinates.height);
    });
    const hide = Keyboard.addListener("keyboardWillHide", () => {
      if (QA_DIAG) diag("kb:willHide");
      setKeyboard(0);
    });
    // QA only: proves the keyboard came up and stayed after a field tap.
    const shown = Keyboard.addListener("keyboardDidShow", (event) => {
      if (QA_DIAG)
        diag("kb:didShow h=" + Math.round(event.endCoordinates.height));
    });
    const hidden = Keyboard.addListener("keyboardDidHide", () => {
      if (QA_DIAG) diag("kb:didHide");
    });
    return () => {
      show.remove();
      hide.remove();
      shown.remove();
      hidden.remove();
    };
  }, []);

  // Until the user picks a quality it follows the preset: Pazaryeri starts
  // at 720p (Trendyol recommends 720x1280), Sosyal medya at 1080p. Worked
  // out during render, so a render started right after a purchase already
  // uses it (audit F14). People without Pro preview at 720p. QA builds can
  // force one quality (EXPO_PUBLIC_QA_QUALITY); null everywhere else.
  const effectiveQuality: ProductQuality =
    QA_QUALITY ??
    (!isPro
      ? "720p"
      : SINGLE_FLOW
        ? "1080p"
        : qualityChosen.current
          ? quality
          : presetQuality(preset));

  // Photo hints: quiet, never blocking. "blurry" stays hidden until its
  // threshold is calibrated; the measured values are logged for that.
  const photoHint = useMemo(() => {
    if (cutout && wholePhotoUri === cutout.uri)
      return t(
        "Ürün zeminden tam ayrılmamış olabilir. Sade bir zeminde tekrar çek.",
        "The product may not be fully separated. Shoot it again on a plain background.",
      );
    if (!cutout?.quality) return null;
    const warnings = photoWarnings(cutout);
    if (warnings.includes("dark"))
      return t(
        "Fotoğraf karanlık: daha aydınlık bir yerde çek.",
        "The photo is dark: shoot in brighter light.",
      );
    if (warnings.includes("small"))
      return t(
        "Ürün karede küçük kalmış: daha yakından çekersen yakın planlar net çıkar.",
        "The product is small in the frame: shoot closer for sharper close-ups.",
      );
    return null;
    // `t` changes identity every render; the language is in `lang`.
  }, [cutout, lang, wholePhotoUri]);
  const loggedQuality = useRef<string | null>(null);
  useEffect(() => {
    if (!cutout?.quality || loggedQuality.current === cutout.uri) return;
    loggedQuality.current = cutout.uri;
    diag("photo quality", {
      ...cutout.quality,
      width: cutout.width,
      height: cutout.height,
      warnings: photoWarnings(cutout),
    });
  }, [cutout]);

  // The bundled backdrop as a scene for the renderer (`backdropScene`
  // resolves the image to a local file). The URI can change between
  // launches, so only the id is stored.
  const cutoutWidth = cutout?.width ?? 0,
    cutoutHeight = cutout?.height ?? 0;
  useEffect(() => {
    if (!backdrop || cutoutWidth <= 0) return;
    let live = true;
    const key = `${backdrop}|${cutoutWidth}x${cutoutHeight}`;
    backdropScene(backdrop, cutoutWidth, cutoutHeight)
      .then((scene) => {
        if (live)
          setBackdropShown((current) =>
            current?.key === key ? current : { key, scene },
          );
      })
      .catch(() => {
        if (live)
          setMessage(
            t(
              "Zemin görseli açılamadı. Başka bir zemin ya da renk seç.",
              "The backdrop image could not be opened. Choose another backdrop or colour.",
            ),
          );
      });
    return () => {
      live = false;
    };
  }, [backdrop, cutoutWidth, cutoutHeight]);

  /** Everything the video is made of, before quality and watermark. */
  const specInput = useMemo(() => {
    if (!cutout) return null;
    // The product's place on a backdrop or kept scene always follows the
    // current cut-out's size.
    const productRect = productPlacement(cutout.width, cutout.height);
    const resolved =
      backdrop &&
      backdropShown?.key === `${backdrop}|${cutout.width}x${cutout.height}`
        ? backdropShown.scene
        : null;
    const own = ownActive ? ownBackdrop : null;
    const shown: SceneInput | null = own
      ? ownBackdropScene(ownBackdropUri(own.file), own, productRect)
      : backdrop
        ? resolved
        : scene
          ? { ...scene, productRect }
          : null;
    return {
      template,
      palette,
      product: cutout.uri,
      // Lets the engine keep close-ups within the photo's real resolution.
      productSize: { width: cutout.width, height: cutout.height },
      headline,
      price,
      oldPrice,
      priceTag,
      brandAccent: brandAccent(brandKit),
      badge,
      cta,
      store,
      bitrate: preset === "trendyol" ? ("compact" as const) : ("high" as const),
      // Sosyal medya keeps 9:16 texts clear of the Reels/TikTok buttons. The
      // preview, render, stills and image set all build from this input.
      safeArea: preset === "reels" ? ("social" as const) : ("none" as const),
      // Everyone previews the full look; making the video needs Pro.
      relief: true,
      scene: shown,
      // Kampanya keeps its approved scheme (null) until a look is chosen.
      colors: own
        ? OWN_TEXT_COLORS[own.text]
        : backdrop &&
            !(
              template === "campaign" &&
              !styleChosen &&
              !backdropById(backdrop).dark
            )
          ? backdropById(backdrop).colors
          : null,
      ratio,
      fontStyle: fontStyle ?? undefined,
      // Upper case follows the language of the texts (audit F3).
      textLang: lang,
      music: music ? { uri: musicUri(music.file), volume: 0.8 } : null,
    };
  }, [
    cutout,
    scene,
    backdrop,
    backdropShown,
    ownBackdrop,
    ownActive,
    styleChosen,
    lang,
    template,
    palette,
    headline,
    price,
    oldPrice,
    priceTag,
    brandKit,
    badge,
    cta,
    store,
    preset,
    ratio,
    fontStyle,
    music,
  ]);

  /** The spec as it would be rendered now; drives both preview and render. */
  const spec = useMemo(() => {
    if (!specInput) return null;
    // QA only: the editor has just the cut-out, so it stands in for the photo.
    if (QA_RECIPE && cutout)
      return buildRecipeSpec(YENI_KOLEKSIYON, {
        photos: [
          sourcePhoto?.cutout === cutout.uri ? sourcePhoto.photo : cutout.uri,
        ],
        cutouts: [cutout.uri],
        name: headline,
        price,
        oldPrice,
        badge,
        cta,
        palette,
        ratio,
        quality: effectiveQuality,
      }) as ProductVideoSpec & { ratio: AspectRatio };
    return buildSpec({
      ...specInput,
      quality: effectiveQuality,
      watermark: !isPro,
    });
  }, [
    specInput,
    cutout,
    sourcePhoto,
    headline,
    price,
    oldPrice,
    badge,
    cta,
    palette,
    ratio,
    effectiveQuality,
    isPro,
  ]);

  // Texts the user typed that the engine left out to keep the product large.
  const dropped = spec?.dropped ?? [];
  const droppedNote =
    dropped.length === 0
      ? null
      : dropped.includes("cta") && dropped.includes("badge")
        ? t(
            "Ürün küçülmesin diye buton yazısı ve etiket bu videoda gösterilmiyor.",
            "The button text and the label are left out of this video so the product stays large.",
          )
        : dropped.includes("cta")
          ? t(
              "Ürün küçülmesin diye buton yazısı bu videoda gösterilmiyor.",
              "The button text is left out of this video so the product stays large.",
            )
          : t(
              "Ürün küçülmesin diye etiket bu videoda gösterilmiyor.",
              "The label is left out of this video so the product stays large.",
            );

  // Real frames from the native renderer, redrawn shortly after each change.
  const stageBox = useRef(0);
  const {
    flipbook,
    updating,
    failed: previewFailed,
    retry: retryPreview,
  } = usePlayingPreview(
    spec,
    stageBox.current,
    progress !== null || exportAllLine !== null,
  );

  /** The editable state as stored in drafts and next to rendered videos. */
  const editState = useMemo<EditState | null>(
    () =>
      cutout
        ? {
            template,
            palette,
            category,
            styleChosen,
            headline,
            price,
            badge,
            cta,
            store,
            music,
            preset,
            quality: effectiveQuality,
            scene,
            backdrop,
            ownBackdrop,
            ownActive,
            ratio,
            fontStyle,
            oldPrice,
            priceTag,
            brandAccent: brandAccent(brandKit),
            cutout: { width: cutout.width, height: cutout.height },
          }
        : null,
    [
      cutout,
      template,
      palette,
      category,
      styleChosen,
      headline,
      price,
      badge,
      cta,
      store,
      music,
      preset,
      effectiveQuality,
      scene,
      backdrop,
      ownBackdrop,
      ownActive,
      ratio,
      fontStyle,
      oldPrice,
      priceTag,
      brandKit,
    ],
  );
  const latest = useRef<{ state: EditState | null; uri: string | null }>({
    state: null,
    uri: null,
  });
  latest.current = { state: editState, uri: cutout?.uri ?? null };

  /** Write the draft now if anything changed; false when writing failed. */
  const flushSave = useCallback((): boolean => {
    const { state, uri } = latest.current;
    if (!state || !uri) return true;
    const key = serializeEditState(state) + "|" + uri;
    if (key === savedKey.current) return true;
    try {
      saveDraft(draftMeta.current, state, uri);
      savedKey.current = key;
      pendingSince.current = null;
      saveFailTold.current = false;
      setDirty(false);
    } catch {
      return false;
    }
    // The saved draft no longer names the replaced files: release them now.
    releases.afterSave({
      music: (file) => releaseMusic(file),
      backdrop: (file) => releaseOwnBackdrop(file),
    });
    return true;
  }, [releases]);

  // Autosave shortly after each change, and at least every few seconds while
  // the user keeps typing. A new photo is saved too (savedKey "").
  useEffect(() => {
    if (!editState || !cutout) return;
    const key = serializeEditState(editState) + "|" + cutout.uri;
    if (savedKey.current === null) savedKey.current = "";
    const changed = key !== savedKey.current;
    setDirty(changed);
    if (!changed) return;
    pendingSince.current ??= Date.now();
    const timer = setTimeout(
      () => {
        if (flushSave() || saveFailTold.current) return;
        saveFailTold.current = true;
        setMessage(
          t(
            "Taslak kaydedilemedi. Değişikliklerin şimdilik yalnızca bu ekranda; yer açıp tekrar dene.",
            "The draft could not be saved. Your changes are only on this screen for now; free some space and try again.",
          ),
        );
      },
      autosaveDelay(pendingSince.current, Date.now()),
    );
    return () => clearTimeout(timer);
    // `t` changes identity every render; the language does not matter here.
  }, [editState, cutout, flushSave]);

  // Going to the background (or being closed from there) saves first.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") flushSave();
    });
    return () => subscription.remove();
  }, [flushSave]);
  // Closing the screen any other way still keeps the work.
  // A replaced cut-out or AI scene is deleted from the cache; drafts and
  // videos keep their own copies in app storage.
  const shownFiles = useRef<{ cutout: string | null; scene: string | null }>({
    cutout: null,
    scene: null,
  });
  useEffect(() => {
    const before = shownFiles.current;
    const now = { cutout: cutout?.uri ?? null, scene: scene?.uri ?? null };
    if (before.cutout && before.cutout !== now.cutout)
      discardEditorFile(before.cutout);
    if (before.scene && before.scene !== now.scene)
      discardEditorFile(before.scene);
    shownFiles.current = now;
  }, [cutout, scene]);
  const leaveEditors = useRef<(() => void) | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      leaveEditors.current?.();
      // Files are released only when the draft on disk matches this screen:
      // after a failed save it still names the older files.
      if (flushSave()) {
        // Music and own photo stay while a draft or a saved video uses them.
        const music = latest.current.state?.music;
        if (music) releaseMusic(music.file);
        const own = latest.current.state?.ownBackdrop;
        if (own) releaseOwnBackdrop(own.file);
      }
      discardEditorFile(shownFiles.current.cutout);
      discardEditorFile(shownFiles.current.scene);
    };
  }, [flushSave]);

  // The chosen music plays with the preview frames (not over the result).
  const preview = usePreviewMusic(
    music && !showResult ? musicUri(music.file) : null,
    spec?.duration ?? 0,
    0.8,
  );

  // Messages and progress are read out by VoiceOver.
  useEffect(() => {
    if (message) AccessibilityInfo.announceForAccessibility(message);
  }, [message]);
  useEffect(() => {
    if (busy) AccessibilityInfo.announceForAccessibility(busy);
  }, [busy]);
  // A success line in the transport row for 3 s, announced.
  useEffect(() => {
    if (!flash) return;
    AccessibilityInfo.announceForAccessibility(flash);
    const timer = setTimeout(() => setFlash(null), 3000);
    return () => clearTimeout(timer);
  }, [flash]);

  // Probe Apple Intelligence once the editor is open (once per launch).
  useEffect(() => {
    if (!cutout || aiReady !== null) return;
    let live = true;
    void aiAvailable(baseLang(lang)).then((ok) => {
      if (live) setAiReady(ok);
    });
    return () => {
      live = false;
    };
  }, [cutout, aiReady, lang]);

  // Leaving: from the result go back to editing (B11); during a render ask
  // first; otherwise make sure the draft is written.
  const [leave, setLeave] = useState<(() => void) | null>(null);
  useEffect(() => {
    if (leave) leave();
  }, [leave]);
  usePreventRemove(
    !leave &&
      ((showResult && !!output) ||
        progress !== null ||
        exportAllLine !== null ||
        dirty),
    ({ repeat }) => {
      if (rendering.current || exportAllLine !== null) {
        Alert.alert(
          t("Video hazırlanıyor", "The video is rendering"),
          t(
            "Çıkarsan video iptal edilir. Düzenlemelerin taslak olarak kalır.",
            "If you leave, the video is cancelled. Your edits stay as a draft.",
          ),
          [
            { text: t("Kal", "Stay"), style: "cancel" },
            {
              text: t("Çık", "Leave"),
              style: "destructive",
              onPress: () => {
                cancelled.current = true;
                exportAllCancel.current = true;
                cancelProductRender();
                flushSave();
                setLeave(() => repeat);
              },
            },
          ],
        );
        return;
      }
      if (showResult && output) {
        setShowResult(false);
        return;
      }
      if (flushSave()) {
        setLeave(() => repeat);
        return;
      }
      Alert.alert(
        t("Taslak kaydedilemedi", "The draft could not be saved"),
        t(
          "Çıkarsan son değişikliklerin kaybolur.",
          "If you leave, your latest changes are lost.",
        ),
        [
          { text: t("Kal", "Stay"), style: "cancel" },
          {
            text: t("Çık", "Leave"),
            style: "destructive",
            onPress: () => setLeave(() => repeat),
          },
        ],
      );
    },
  );

  async function run(label: string, job: () => Promise<void>) {
    // One action at a time: a second tap is ignored, not a second sheet.
    if (running.current) return;
    running.current = true;
    setBusy(label);
    setMessage("");
    setNeedsSettings(false);
    try {
      await job();
    } catch (error) {
      // Saves, renders and cut-outs: the cause for QA (no user content).
      diag("action failed", { action: label, error });
      setMessage(describeError(error, t));
      setNeedsSettings(error instanceof PermissionError);
    } finally {
      running.current = false;
      setBusy(null);
    }
  }

  /** Leave the editor (Bitti): the draft is written first, as on Back. */
  function leaveEditor() {
    flushSave();
    setLeave(() => () => goBack(router));
  }

  /**
   * The paywall for a gated action, with the current end card as its hero
   * (the frame shown near the end of the preview) and the frame shape.
   */
  function showPaywall(reason: PaywallEntry) {
    const frame =
      flipbook && flipbook.uris.length > 0
        ? flipbook.uris[
            Math.max(
              0,
              Math.round(
                flipbook.uris.length *
                  (1 - 0.5 / Math.max(1, flipbook.duration)),
              ) - 1,
            )
          ]
        : null;
    openPaywall(router, reason, { frame, ratio });
  }

  const openEditor = (next: Cutout) => {
    // A new photo is a new video: never replace the library video being edited.
    editTarget.current = null;
    draftMeta.current = { ...draftMeta.current, sourceClip: null };
    setOutput(null);
    setShowResult(false);
    // A new photo is worth a draft right away (finding 7).
    savedKey.current = "";
    // A new photo: the AI scene was made for the old product (B7).
    setScene(null);
    setCutout(next);
  };

  /** A bundled product photo, so anyone (and App Review) can try the flow. */
  const trySample = () =>
    run(
      t("Ürün arka plandan ayrılıyor…", "Cutting out the product…"),
      async () => {
        // The same cut-out the posters use: the phone's own, or the bundled
        // one when that fails (never the "no product found" banner).
        const sampleCutout = await sampleEditorCutout();
        rememberSampleCutout(sampleCutout.width, sampleCutout.height);
        openEditor(sampleCutout);
        if (QA_RECIPE) {
          const uri = await qaSamplePhotoUri();
          if (uri) setSourcePhoto({ cutout: sampleCutout.uri, photo: uri });
        }
        const copy = SAMPLE_COPY[baseLang(lang)];
        setHeadline(copy.headline);
        setPrice(copy.price);
        setOldPrice(copy.oldPrice);
        setBadge(copy.badge);
        setCta(copy.cta);
      },
    );

  // Pro became active while the editor is open (after the paywall).
  // The paywall shows the user's own latest frame (end card), memory only.
  useEffect(() => {
    const uris = flipbook?.uris;
    if (!uris || uris.length === 0) return;
    setPaywallProof(uris[Math.max(0, uris.length - 2)] ?? uris[0]);
  }, [flipbook]);

  // ?sample=1 goes on to a first video at once (Pro or the screenshot
  // build); without Pro the preview stays and the paywall gate is kept.
  const sampleRendered = useRef(false);
  useEffect(() => {
    if (params.sample !== "1" || sampleRendered.current) return;
    if (!spec || proLoading || !isPro || !cutout || !headline) return;
    if (!flipbook || running.current || rendering.current) return;
    sampleRendered.current = true;
    void renderLatest.current();
  }, [spec, proLoading, isPro, cutout, headline, flipbook]);

  const proWas = useRef<boolean | null>(null);
  useEffect(() => {
    if (proLoading) return;
    if (proWas.current === false && isPro)
      setFlash(
        t(
          "Vidora Pro etkin. Videoyu oluşturabilirsin.",
          "Vidora Pro is active. You can create the video.",
        ),
      );
    proWas.current = isPro;
  }, [isPro, proLoading]);

  // "Örnekle dene" on Home: the sample starts once, right after opening.
  const sampleStarted = useRef(false);
  useEffect(() => {
    if (sampleStarted.current || params.sample !== "1") return;
    if (params.draft || params.edit || params.duplicate) return;
    sampleStarted.current = true;
    void trySample();
    // Runs once on mount; `trySample` is rebuilt every render.
  }, []);

  // Home's "Fotoğraf seç": the photo source sheet opens once; cancelling
  // leaves the start view. `pickStarted` is also set by a sheet the user
  // opened first, and the timer reads the live focus and busy state.
  const pickStarted = useRef(false);
  const focusedNow = useRef(isFocused);
  focusedNow.current = isFocused;
  useEffect(() => {
    if (pickStarted.current || params.pick !== "1") return;
    if (params.draft || params.edit || params.duplicate || params.sample)
      return;
    const timer = setTimeout(() => {
      if (pickStarted.current || running.current) return;
      if (mounted.current && focusedNow.current) choosePhotoSource();
    }, 350);
    return () => clearTimeout(timer);
    // Runs once on mount; `choosePhotoSource` is rebuilt every render.
  }, []);

  const openPhoto = async (photo: string) => {
    const [next, size] = await Promise.all([
      cutOut(photo),
      photoPixelSize(photo),
    ]);
    openEditor(next);
    if (QA_RECIPE) setSourcePhoto({ cutout: next.uri, photo });
    setWholePhotoUri(isWholePhotoCutout(next, size) ? next.uri : null);
  };

  const choosePhoto = () =>
    run(
      t("Ürün arka plandan ayrılıyor…", "Cutting out the product…"),
      async () => {
        const photo = await pickProductPhoto();
        if (!photo) return;
        await openPhoto(photo);
      },
    );

  const takePhoto = () =>
    run(
      t("Ürün arka plandan ayrılıyor…", "Cutting out the product…"),
      async () => {
        const photo = await takeProductPhoto();
        if (!photo) return;
        await openPhoto(photo);
      },
    );

  /** Camera or library, as an iOS action sheet. */
  function choosePhotoSource() {
    // Not while a cut-out runs: the picker could not be presented over it.
    if (running.current) return;
    pickStarted.current = true;
    showActionSheet(
      {
        message: t(
          "Sade zeminde çek, ürün kadrajı doldursun.",
          "Shoot on a plain surface and fill the frame.",
        ),
        options: [
          t("Fotoğraf çek", "Take photo"),
          t("Galeriden seç", "Choose from library"),
          t("Vazgeç", "Cancel"),
        ],
        cancelButtonIndex: 2,
      },
      (index) => {
        if (index === 0) void takePhoto();
        else if (index === 1) void choosePhoto();
      },
    );
  }

  /**
   * Keep the editable state with the video. Only when that worked does the
   * draft go, and only for Düzenle in the same shape is the earlier video
   * replaced; anything else is added (data-safety findings 1 and 6).
   */
  async function afterRender(clip: Clip, ratio: AspectRatio) {
    const state = latest.current.state,
      uri = latest.current.uri;
    const replace = replaceTarget(editTarget.current, ratio);
    const result = await commitRender(
      {
        clipId: clip.id,
        state,
        cutoutUri: uri,
        draftId: draftMeta.current.id,
        replace,
      },
      {
        saveEdit,
        findClip: async (id) =>
          (await listClips()).find((item) => item.id === id) ?? null,
        removeClip,
        removeEdit,
        deleteDraft,
      },
    );
    if (!result.saved) {
      // The draft and any earlier video stay exactly as they were.
      setResultNote(
        t(
          "Kitaplık'a ayrı bir video olarak eklendi. Düzenleme bilgisi kaydedilemedi; taslağın ve önceki videolar duruyor.",
          "Added to your Library as a separate video. Its edit details could not be saved; your draft and earlier videos are kept.",
        ),
      );
      return;
    }
    // After a replace, the session re-edits the new video.
    if (result.replaced) editTarget.current = { clipId: clip.id, ratio };
    // Further edits continue as a new draft.
    draftMeta.current = {
      id: newDraftId(),
      created: Date.now(),
      sourceClip: editTarget.current?.clipId ?? null,
    };
    if (state && uri) savedKey.current = serializeEditState(state) + "|" + uri;
    // The next new video starts with this backdrop and button text only.
    if (state && params.sample !== "1")
      void saveLastLook(
        {
          backdrop: state.ownActive ? null : state.backdrop,
          cta: state.cta,
        },
        BACKDROPS.map((item) => item.id),
      );
    pendingSince.current = null;
    setDirty(false);
    setResultNote(
      SINGLE_FLOW
        ? ""
        : result.replaced
          ? t(
              "Kitaplık'taki önceki sürümün yerini aldı. Fotoğraflar'a kaydettiğin kopyalar değişmez.",
              "It replaced the previous version in your Library. Copies saved to Photos are unchanged.",
            )
          : t(
              "Kitaplık'a ayrı bir video olarak eklendi.",
              "Added to your Library as a separate video.",
            ),
    );
  }

  /** QA only: the latest line of the render timeline, also in the log. */
  const noteRender = (line: string) => {
    if (!QA_DIAG) return;
    diag(line);
    setDiagLine(line);
  };

  /**
   * The render tap, in the order it happens (all state changes below are one
   * batch, so the mounting layer gets one quiet commit):
   *  1. the keyboard is dismissed and awaited (no layout change overlaps);
   *  2. busy + progress 0 + the result and saved marks cleared: the fields
   *     lock (`disabled`/`editable`), the transport row swaps to the render
   *     row, the preview freezes (use-playing-preview `frozen`);
   *  3. the draft is written; the watchdog starts; the native render begins.
   * The open tool panel stays (Metin, Arka plan): closing it unmounted the
   * text fields and their input accessory views and resized the stage (a
   * second commit from the stage's onLayout); `locked` already disables
   * everything in it. Two panels do step aside: the Şablon panel, whose
   * posters keep asking the renderer for frames (every one made stale by the
   * render, then retried), and the swipe panel of the hidden full editor.
   */
  const render = () => {
    // One render at a time: a second tap must not reset the first one's
    // state (finding 1). Nor while another action (a save) is running.
    if (rendering.current || running.current || !spec) return;
    rendering.current = true;
    return keyboardGone().then(() => {
      if (!mounted.current || running.current) {
        rendering.current = false;
        return;
      }
      return run(t("Video hazırlanıyor…", "Rendering the video…"), async () => {
        cancelled.current = false;
        stalledOut.current = false;
        const startedAt = monotonicNow();
        const seconds = () => secondsBetween(startedAt, monotonicNow());
        renderClock.current = { startedAt, percent: 0 };
        watchdog.start();
        setOutput(null);
        setShowResult(false);
        setSavedClip(null);
        setProgress(0);
        setProgressSeen(false);
        setStalled(false);
        setCancelling(false);
        setCancelSlow(false);
        cancelAt.current = null;
        const closesPanel = !SINGLE_FLOW || tool === "template";
        if (closesPanel) {
          // The tool comes back after a cancel or an error.
          toolBeforeRender.current = tool;
          chooseTool(null);
        }
        noteRender(renderDiagStart(spec.quality, boxNow.current));
        // The work is on disk before the long render starts.
        flushSave();
        let finished = false;
        try {
          // English users get an English template name (audit F20).
          const info = templateById(template),
            name = t(info.tr, info.en);
          const fileName =
            (headline.trim() ? headline.trim() + " · " + name : name).slice(
              0,
              60,
            ) + ".mp4";
          const clip = await renderProductVideo(spec, fileName, (value) => {
            // The first event ends the silent preparation phase.
            watchdog.feed();
            renderClock.current.percent = value;
            setProgress(value);
            setProgressSeen(true);
            noteRender(renderDiagProgress(value, seconds()));
          });
          // Left (or cancelled) while the last frames were written: the user
          // chose to leave, so the new video goes and nothing else changes.
          if (cancelled.current || !mounted.current) {
            try {
              removeClip(clip);
            } catch {
              // It can be deleted in the library.
            }
            if (mounted.current) {
              if (stalledOut.current) {
                noteRender(renderDiagFail("stalled", seconds()));
                setMessage(describeError(stalledRenderError(), t));
              } else {
                noteRender(renderDiagCancelled(seconds()));
                setFlash(t("Video iptal edildi.", "Video cancelled."));
              }
            }
            return;
          }
          await afterRender(clip, spec.ratio ?? "9:16");
          setOutputRatio(spec.ratio ?? "9:16");
          setOutput(clip);
          setShowResult(true);
          finished = true;
          noteRender(renderDiagDone(seconds()));
          // iOS has no live regions: say it (audit F21).
          AccessibilityInfo.announceForAccessibility(
            t(
              "Video hazır ve Kitaplık'a eklendi.",
              "The video is ready and in your Library.",
            ),
          );
        } catch (error) {
          if (!cancelled.current) {
            noteRender(renderDiagFail(renderFailCode(error), seconds()));
            throw error;
          }
          if (stalledOut.current) {
            // The existing failure state (banner + the button to try again).
            noteRender(renderDiagFail("stalled", seconds()));
            throw stalledRenderError();
          }
          noteRender(renderDiagCancelled(seconds()));
          setFlash(t("Video iptal edildi.", "Video cancelled."));
        } finally {
          watchdog.finish();
          rendering.current = false;
          setProgress(null);
          setProgressSeen(false);
          setStalled(false);
          setCancelling(false);
          setCancelSlow(false);
          cancelAt.current = null;
          if (!finished && mounted.current && closesPanel)
            chooseTool(toolBeforeRender.current);
        }
      });
    });
  };

  /** İptal: one press; the render is waited for, a second render is refused. */
  const cancelRender = () => {
    if (cancelled.current || !rendering.current) return;
    cancelled.current = true;
    watchdog.cancelPressed();
    cancelAt.current = monotonicNow();
    setCancelling(true);
    cancelProductRender();
  };

  // While a render runs, once a second: the watchdog decides (quiet note, or
  // cancel through the normal path after a long silence) and the QA timeline
  // gets its heartbeat. State is set only when something changed.
  const renderingNow = progress !== null;
  const onTick = useRef<() => void>(() => {});
  onTick.current = () => {
    if (!rendering.current) return;
    const verdict = watchdog.check();
    if (verdict.cancel && !cancelled.current) {
      stalledOut.current = true;
      cancelled.current = true;
      setStalled(false);
      cancelAt.current = monotonicNow();
      setCancelling(true);
      cancelProductRender();
    } else {
      setStalled(verdict.warning);
    }
    if (
      cancelAt.current !== null &&
      monotonicNow() - cancelAt.current >= CANCEL_SLOW_AFTER_MS
    )
      setCancelSlow(true);
    if (QA_DIAG) {
      const clock = renderClock.current;
      noteRender(
        renderDiagProgress(
          clock.percent,
          secondsBetween(clock.startedAt, monotonicNow()),
        ),
      );
    }
  };
  useEffect(() => {
    if (!renderingNow) return;
    const timer = setInterval(() => onTick.current(), 1000);
    return () => clearInterval(timer);
  }, [renderingNow]);

  // After a purchase the paywall calls back once this screen has re-rendered
  // with Pro; the refs make sure that call uses the fresh (Pro) spec.
  const renderLatest = useRef(render);
  renderLatest.current = render;
  const writeLatest = useRef<() => void>(() => {});

  /** No free renders: the preview is free, making the video needs Pro. */
  function pressRender() {
    if (isPro) return void render();
    offerFreeExport(null);
    offerAfterPurchase(() => void renderLatest.current());
    showPaywall("video");
  }

  const colors = paletteById(palette),
    bank = bankSuggestions(category, baseLang(lang)),
    locked = !!busy;

  /** Swap the music; the old file goes unless another draft or video uses it. */
  function replaceMusic(next: { file: string; name: string } | null) {
    const old = music;
    setMusic(next);
    if (next) releases.keep(next.file);
    // The stored draft still names the old file until the next save.
    if (old && old.file !== next?.file) releases.music(old.file);
  }

  /** Category defaults apply only until the user picked a look (B6). */
  function chooseCategory(id: CategoryId) {
    lookTouched.current = true;
    const next = categoryById(id);
    setCategory(id);
    if (!styleChosen) {
      setPalette(next.palette);
      // The single flow keeps its one template.
      if (!SINGLE_FLOW) setTemplate(next.template);
      setBackdrop(
        DEFAULT_BACKGROUND === "backdrop" ? CATEGORY_BACKDROP[id] : null,
      );
    }
    setAiCopy(null);
    setAiNote("");
  }
  function pickTemplate(id: TemplateId) {
    // QA builds only: proves in the device log that the pick arrived.
    if (QA_DIAG) diag("template:pick " + id);
    lookTouched.current = true;
    setTemplate(id);
    setStyleChosen(true);
  }
  /** Swap the own photo; the old file goes unless a draft or video uses it. */
  function replaceOwn(next: OwnBackdrop | null) {
    const old = ownBackdrop;
    setOwnBackdrop(next);
    if (next) releases.keep(next.file);
    // The stored draft still names the old file until the next save.
    if (old && old.file !== next?.file) releases.backdrop(old.file);
  }
  // Exploring backgrounds never deletes the seller's photo: picks only make
  // it inactive; it comes back with its size, position and text colour.
  function pickPalette(id: PaletteId) {
    lookTouched.current = true;
    setPalette(id);
    setBackdrop(null);
    setOwnActive(false);
    setStyleChosen(true);
  }
  function pickBackdrop(id: BackdropId) {
    lookTouched.current = true;
    setBackdrop(id);
    setScene(null);
    setOwnActive(false);
    setStyleChosen(true);
  }
  function selectOwn() {
    if (!ownBackdrop) return;
    setOwnActive(true);
    setStyleChosen(true);
  }
  /** "Fotoğrafı kaldır": the photo goes; the background before it shows. */
  function removeOwn() {
    replaceOwn(null);
    setOwnActive(false);
  }
  /** A curated look: template, background and type family together. */
  function chooseLook(look: Look) {
    lookTouched.current = true;
    setTemplate(look.template);
    // The template's own family is stored as null (it follows the template).
    setFontStyle(
      look.fontStyle === DEFAULT_FONT_STYLE[look.template]
        ? null
        : look.fontStyle,
    );
    setPalette(look.palette);
    setBackdrop(look.backdrop);
    setScene(null);
    setOwnActive(false);
    setStyleChosen(true);
  }
  /** "Kendi fotoğrafın": a photo from the library becomes the scene. */
  const pickOwnBackdrop = () =>
    run(t("Fotoğraf hazırlanıyor…", "Preparing the photo…"), async () => {
      const picked = await pickProductPhoto();
      if (!picked) return;
      const file = importOwnBackdrop(picked);
      const local = ownBackdropUri(file);
      // The native reading gives the upright size and the brightness where
      // texts sit; older builds fall back to the image size and light text.
      const info = await imageInfo(local).catch(() => null);
      const size = info ?? (await imageSizeOf(local));
      // Left meanwhile: the new photo is used nowhere, so it goes.
      if (!mounted.current) {
        releaseOwnBackdrop(file);
        return;
      }
      if (!size || size.width <= 0 || size.height <= 0) {
        releaseOwnBackdrop(file, draftMeta.current.id);
        throw new LocalizedError(
          "Bu fotoğraf okunamadı. Başka bir fotoğraf seç.",
          "This photo could not be read. Choose another photo.",
        );
      }
      tap("select");
      replaceOwn({
        file,
        width: size.width,
        height: size.height,
        scale: 1,
        offset: 0,
        text: textForImage(info),
      });
      setOwnActive(true);
      setStyleChosen(true);
    });
  const updateOwn = (change: Partial<OwnBackdrop>) =>
    setOwnBackdrop((own) => (own ? { ...own, ...change } : own));

  /** The end card as a 1080p image in the chosen shape, saved to Photos. */
  const saveImage = () =>
    run(t("Görsel hazırlanıyor…", "Preparing the image…"), async () => {
      if (!specInput) return;
      await saveStillToPhotos(
        buildSpec({
          ...specInput,
          quality: "1080p",
          watermark: false,
          music: null,
        }),
      );
      setFlash(t("Görsel Fotoğraflar'a kaydedildi.", "Image saved to Photos."));
    });
  const saveImageLatest = useRef(saveImage);
  saveImageLatest.current = saveImage;
  /** Same gate as the video: nothing is saved without Pro. */
  function pressSaveImage() {
    if (isPro) return void saveImage();
    offerFreeExport(null);
    offerAfterPurchase(() => void saveImageLatest.current());
    showPaywall("image");
  }
  const canSaveImage = hasStillExport();

  /** "Pazaryeri görseli": text-free on white, same gate as saving an image. */
  const saveMarketplace = (id: MarketplaceImageId) =>
    run(t("Görsel hazırlanıyor…", "Preparing the image…"), async () => {
      if (!cutout) return;
      const preset = marketplaceImageById(id);
      const { bytes, oversize } = await saveMarketplaceImage(
        preset,
        cutout.uri,
        { width: cutout.width, height: cutout.height },
      );
      const name = t(preset.tr, preset.en);
      // Still over the cap at the lowest JPEG quality: saved anyway, with
      // the real size on a second line.
      const megabytes = (bytes / 1_000_000).toFixed(1);
      setMessage(
        t(
          `${name} görseli Fotoğraflar'a kaydedildi.`,
          `${name} image saved to Photos.`,
        ) +
          (oversize
            ? "\n" +
              t(
                `Dosya ${megabytes.replace(".", ",")} MB; 2 MB sınırı olan pazaryerleri kabul etmeyebilir.`,
                `The file is ${megabytes} MB; marketplaces with a 2 MB limit may refuse it.`,
              )
            : ""),
      );
    });
  const saveMarketplaceLatest = useRef(saveMarketplace);
  saveMarketplaceLatest.current = saveMarketplace;
  function pressMarketplace(id: MarketplaceImageId) {
    if (isPro) return void saveMarketplace(id);
    offerFreeExport(null);
    offerAfterPurchase(() => void saveMarketplaceLatest.current(id));
    showPaywall("marketplace");
  }
  /**
   * One still style: the white main image (text-free) or the end card of the
   * current design in a social shape. Same Pro gate as the other images.
   */
  async function saveStillStyle(id: StillStyleId) {
    if (!cutout) return;
    const style = stillStyleById(id);
    if (style.kind === "white") {
      await saveMarketplaceImage(
        {
          ...marketplaceImageById("trendyol"),
          ratio: style.ratio,
          width: style.width,
          fill: style.fill,
        },
        cutout.uri,
        { width: cutout.width, height: cutout.height },
      );
      return;
    }
    if (!specInput) return;
    await saveStillToPhotos(
      buildSpec({
        ...specInput,
        ratio: style.ratio as AspectRatio,
        quality: "1080p",
        watermark: false,
        music: null,
      }),
    );
  }
  const stillStyle = (id: StillStyleId) => {
    const style = stillStyleById(id);
    return run(t("Görsel hazırlanıyor…", "Preparing the image…"), async () => {
      await saveStillStyle(id);
      setFlash(
        t(style.tr, style.en) +
          t(" Fotoğraflar'a kaydedildi.", " saved to Photos."),
      );
      void recordSuccessfulSave();
    });
  };
  const stillStyleLatest = useRef(stillStyle);
  stillStyleLatest.current = stillStyle;
  function pressStillStyle(id: StillStyleId) {
    if (isPro) return void stillStyle(id);
    offerFreeExport(null);
    offerAfterPurchase(() => void stillStyleLatest.current(id));
    showPaywall("image");
  }

  /**
   * "Hepsini çıkar": 9:16, 4:5 and 1:1 videos, then the main image, the post
   * and the story cover, one at a time, each saved to Photos. The Pro gate
   * is once, up front; the 9:16 video then goes to the share sheet.
   */
  const exportAll = () => {
    if (!cutout || !editState) return;
    const state = editState,
      cutoutUri = cutout.uri;
    return run(t("Hepsi hazırlanıyor…", "Preparing everything…"), async () => {
      exportAllCancel.current = false;
      flushSave();
      await ensurePhotosAccess();
      const lng = baseLang(lang);
      const made: { first: Clip | null } = { first: null };
      setExportAllLine(
        exportAllLabel(0, EXPORT_ALL_STEPS.length, EXPORT_ALL_STEPS[0], lng),
      );
      try {
        const summary = await runExportAll(
          EXPORT_ALL_STEPS,
          async (step: ExportStep) => {
            if (step.kind === "still") return saveStillStyle(step.still);
            const videoSpec = await specFromState(state, cutoutUri, {
              ratio: step.ratio,
              quality: "1080p",
              watermark: false,
              lang: lng,
            });
            const clip = await renderProductVideo(
              videoSpec,
              (state.headline.trim() || t("Video", "Video")).slice(0, 50) +
                " · " +
                step.ratio.replace(":", "x") +
                ".mp4",
              () => {},
            );
            try {
              await saveToPhotos(clip);
            } catch (error) {
              removeClip(clip);
              throw error;
            }
            try {
              saveEdit(clip.id, { ...state, ratio: step.ratio }, cutoutUri);
            } catch {
              // The video is in Photos and the Library; only Düzenle is lost.
            }
            if (step.ratio === "9:16") made.first = clip;
          },
          {
            onStep: (index, step) =>
              setExportAllLine(
                exportAllLabel(index, EXPORT_ALL_STEPS.length, step, lng),
              ),
            isCancelled: () => exportAllCancel.current,
            isFatal: (error) => error instanceof PermissionError,
          },
        );
        setExportAllLine(null);
        setFlash(exportAllSummaryLine(summary, lng));
        if (summary.failed.length > 0 && summary.firstError)
          setMessage(describeError(summary.firstError, t));
        if (summary.saved > 0) {
          tap("action");
          void recordSuccessfulSave();
          if (made.first && !summary.cancelled)
            await share(made.first).catch(() => {
              // No share sheet on this device: everything is in Photos.
            });
        }
      } finally {
        setExportAllLine(null);
      }
    });
  };
  const exportAllLatest = useRef(exportAll);
  exportAllLatest.current = exportAll;
  function pressExportAll() {
    if (isPro) return void exportAll();
    offerFreeExport(null);
    offerAfterPurchase(() => void exportAllLatest.current());
    showPaywall("video");
  }
  function cancelExportAll() {
    exportAllCancel.current = true;
    cancelProductRender();
  }
  /** Batch has the same Pro gate as one video. */
  function pressBatch() {
    flushSave();
    if (isPro) return void router.push("/batch");
    offerFreeExport(null);
    offerAfterPurchase(() => router.push("/batch"));
    showPaywall("video");
  }

  /**
   * "Görsel olarak kaydet": the last frame at 1080p, the same design on more
   * backdrops, or a text-free marketplace image on white. The Pro gates stay
   * in the press functions.
   */
  function chooseStill() {
    showActionSheet(
      {
        title: t("Görsel olarak kaydet", "Save as image"),
        message: t(
          "Son kare seçtiğin oranda 1080p kaydedilir. Pazaryeri görselleri beyaz fonlu ve yazısızdır.",
          "The last frame is saved at 1080p in your shape. Marketplace images are text-free on white.",
        ),
        options: [
          t("Son kare · 1080p", "Last frame · 1080p"),
          t("Diğer zeminlerde de üret…", "Make it on more backdrops…"),
          ...MARKETPLACE_IMAGES.map((item) => t(item.tr, item.en)),
          t("Vazgeç", "Cancel"),
        ],
        cancelButtonIndex: MARKETPLACE_IMAGES.length + 2,
      },
      (index) => {
        if (index === 0) pressSaveImage();
        else if (index === 1) pressSaveImageSet();
        else {
          const picked = MARKETPLACE_IMAGES[index - 2];
          if (picked) pressMarketplace(picked.id);
        }
      },
    );
  }

  /** "Diğer zeminlerde de üret": same gate as saving one image. */
  function pressSaveImageSet() {
    if (isPro) {
      // Open again if the last open never reached the screen (audit F36).
      if (imageSetOpen && !imageSetShown.current) {
        setImageSetOpen(false);
        requestAnimationFrame(() => setImageSetOpen(true));
        return;
      }
      imageSetShown.current = false;
      return setImageSetOpen(true);
    }
    offerFreeExport(null);
    // After a purchase the paywall is still closing; a sheet presented now
    // would be refused, so it opens a moment later (audit F36).
    offerAfterPurchase(() => {
      imageSetTimer.current = setTimeout(() => {
        imageSetShown.current = false;
        setImageSetOpen(true);
      }, 700);
    });
    showPaywall("image");
  }
  const imageSetShown = useRef(false),
    imageSetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (imageSetTimer.current) clearTimeout(imageSetTimer.current);
    },
    [],
  );
  const imageSetCancel = useRef(false);
  /** The end card on each backdrop, one after another; failures are counted. */
  async function startImageSet(ids: BackdropId[]) {
    if (!specInput || !cutout || ids.length === 0) return;
    imageSetCancel.current = false;
    setImageSetProgress({ done: 0, total: ids.length });
    try {
      await ensurePhotosAccess();
    } catch (error) {
      setImageSetProgress(null);
      setImageSetOpen(false);
      setMessage(describeError(error, t));
      setNeedsSettings(error instanceof PermissionError);
      return;
    }
    let saved = 0,
      renderFailed = 0,
      saveFailed = 0,
      firstError: unknown = null;
    for (const id of ids) {
      if (imageSetCancel.current) break;
      try {
        const sceneFor = await backdropScene(id, cutout.width, cutout.height);
        await saveStill(
          buildSpec({
            ...specInput,
            scene: sceneFor,
            colors: backdropById(id).colors,
            quality: "1080p",
            watermark: false,
            music: null,
          }),
        );
        saved++;
      } catch (error) {
        diag("image set failed", {
          backdrop: id,
          stage: error instanceof PhotosSaveError ? "save" : "render",
          error,
        });
        if (error instanceof PhotosSaveError) saveFailed++;
        else renderFailed++;
        firstError ??= error;
      }
      setImageSetProgress({
        done: saved + renderFailed + saveFailed,
        total: ids.length,
      });
    }
    const done = saved + renderFailed + saveFailed;
    const stopped = imageSetCancel.current && done < ids.length;
    setImageSetProgress(null);
    setImageSetOpen(false);
    setNeedsSettings(false);
    setMessage(
      imageSetSummary(
        {
          saved,
          renderFailed,
          saveFailed,
          cancelled: stopped,
          reason: firstError ? describeError(firstError, t) : null,
        },
        lang,
      ),
    );
    if (saved > 0) tap("action");
  }
  const askAi = async (): Promise<void> => {
    // Repeat taps while the check runs are ignored (audit F19).
    if (aiChecking.current) return;
    aiChecking.current = true;
    let ok: boolean;
    try {
      if (aiReady !== null) ok = aiReady;
      else {
        setBusy(
          t("Apple Intelligence denetleniyor…", "Checking Apple Intelligence…"),
        );
        ok = await aiAvailable(baseLang(lang));
      }
    } finally {
      aiChecking.current = false;
      setBusy(null);
    }
    // Never send anyone to the paywall for a feature their device lacks.
    if (!ok) {
      setAiReady(false);
      setAiNote(
        t(
          "Bu cihaz Apple Intelligence desteklemiyor; yukarıdaki hazır öneriler kullanılabilir.",
          "This device does not support Apple Intelligence; the ready-made ideas above are available.",
        ),
      );
      return;
    }
    if (!isPro) {
      offerFreeExport(null);
      offerAfterPurchase(() => writeLatest.current());
      showPaywall("ai");
      return;
    }
    void writeWithAi();
  };
  const writeWithAi = () =>
    run(t("Öneriler yazılıyor…", "Writing suggestions…"), async () => {
      const result = await aiCopySuggestions(
        category,
        headline,
        baseLang(lang),
      );
      setAiCopy(result);
      setAiNote(
        result
          ? t(
              "Öneriler telefonunda Apple Intelligence ile yazıldı. Paylaşmadan önce kontrol et.",
              "Written on your phone with Apple Intelligence. Check before posting.",
            )
          : t(
              "Öneri yazılamadı; hazır öneriler gösteriliyor. Tekrar deneyebilirsin.",
              "Couldn't write suggestions; showing ready-made ideas. You can try again.",
            ),
      );
    });

  writeLatest.current = () => void writeWithAi();

  function chooseTool(next: ToolId | null) {
    setTool(next);
  }

  const settingsButton = needsSettings ? (
    <View style={{ flexDirection: "row" }}>
      <Button
        label={t("Ayarları aç", "Open Settings")}
        onPress={() => void Linking.openSettings()}
      />
    </View>
  ) : undefined;
  // Problems sit in normal flow, never over the frame.
  const banner = !!message && (
    <View style={styles.banner}>
      <Banner
        icon="exclamationmark.circle"
        text={message}
        closeLabel={t("Kapat", "Close")}
        onClose={() => setMessage("")}
        action={settingsButton}
      />
    </View>
  );

  if (!cutout) {
    return (
      <>
        <Stack.Screen
          options={{
            title: SINGLE_FLOW ? "" : t("Ürün videosu", "Product video"),
            headerLargeTitleEnabled: false,
            headerLeft: () => (
              <HeaderBack
                testID="editor-back"
                label={t("Geri", "Back")}
                onPress={() => goBack(router)}
              />
            ),
            headerRight: SINGLE_FLOW
              ? () => (
                  <Text
                    maxFontSizeMultiplier={1.2}
                    style={{
                      fontFamily: Face.extra,
                      fontWeight: "800",
                      fontSize: 15,
                      color: Theme.text,
                    }}
                  >
                    {t("Yeni video", "New video")}
                  </Text>
                )
              : undefined,
          }}
        />
        <StartView
          template={template}
          onTemplate={(id) => {
            pickTemplate(id);
            choosePhotoSource();
          }}
          onChoosePhoto={choosePhotoSource}
          onTrySample={() => void trySample()}
          busy={busy}
          jumpToTemplates={
            params.browse === "1" || params.browse === "templates"
          }
        />
        {banner}
      </>
    );
  }

  const allTools: {
    id: ToolId;
    icon: IconName;
    label: string;
    testID: string;
  }[] = [
    {
      id: "template",
      icon: "square.grid.2x2",
      label: t("Şablon", "Template"),
      testID: "tool-template",
    },
    {
      id: "color",
      icon: "square.2.layers.3d.bottom.filled",
      label: t("Arka plan", "Background"),
      testID: "tool-background",
    },
    {
      id: "text",
      icon: "textformat",
      label: t("Metin", "Text"),
      testID: "tool-text",
    },
    {
      id: "music",
      icon: "music.note",
      label: t("Müzik", "Music"),
      testID: "tool-music",
    },
    {
      id: "format",
      icon: "slider.horizontal.3",
      label: SINGLE_FLOW ? t("Çıktı", "Export") : t("Format", "Format"),
      testID: "tool-format",
    },
  ];
  // The single flow offers Şablon (three templates), Arka plan, Metin and
  // Çıktı (shape, stills, Export all, Batch).
  const tools = SINGLE_FLOW
    ? allTools.filter(
        (item) =>
          item.id === "template" ||
          item.id === "color" ||
          item.id === "text" ||
          item.id === "format",
      )
    : allTools;
  // No guidance line over the panels: each panel shows its controls
  // straight away so the preview can stay large.
  const hints: Partial<Record<ToolId, string>> = {};

  const result = showResult ? output : null;
  const activeOwn = ownActive ? ownBackdrop : null;
  const hintHeight = photoHint ? photoHintHeight(screen.fontScale) : 0;

  // The preview as large as the stage allows, in the chosen shape, with
  // the transport row under it.
  const aspect = aspectOf(ratio),
    inner = {
      width: stage.width - 2 * Space.l,
      height: stage.height - 2 * Space.s - TRANSPORT_HEIGHT - hintHeight,
    },
    boxHeight = Math.max(0, Math.min(inner.height, inner.width / aspect)),
    fullBox = { width: boxHeight * aspect, height: boxHeight },
    // Keyboard open (single flow): the preview is a corner thumbnail.
    kbMode = SINGLE_FLOW && keyboard > 0,
    // The thumbnail grows with the screen: 30% of the space above the
    // keyboard on a 667 pt phone (96 pt), 47% on an 844 pt one (about 195 pt).
    thumbShare =
      0.3 +
      Math.min(1, Math.max(0, (screen.height - 667) / (844 - 667))) * 0.17,
    // It never takes the room of the four stacked fields (4 x 48 pt + gaps).
    thumbRoom = area - keyboard - 216 - 2 * Space.m - Space.s,
    thumbH = Math.round(
      Math.max(96, Math.min(200, (area - keyboard) * thumbShare, thumbRoom)),
    ),
    box = kbMode ? { width: thumbH * aspect, height: thumbH } : fullBox;
  stageBox.current = box.width;
  boxNow.current = box;
  if (tool !== "format") reserveAspect.current = aspect;
  // The preview is the largest thing on screen on every tool: at least half
  // the screen on a large phone, 42% on the smallest. A frame that is bound
  // by the width needs less, and the panel gets the rest (critique 11).
  const previewShare = Math.min(
      0.5,
      Math.max(0.42, 0.42 + ((screen.height - 667) / (932 - 667)) * 0.08),
    ),
    toolBarHeight =
      Space.s +
      48 +
      Math.max(insets.bottom, 8) +
      Math.ceil(13 * (Math.min(screen.fontScale, 1.3) - 1)),
    previewH = Math.min(
      screen.height * previewShare,
      (screen.width - 2 * Space.l) / reserveAspect.current,
    ),
    roomy =
      area > 0
        ? Math.max(
            160,
            area -
              toolBarHeight -
              previewH -
              TRANSPORT_HEIGHT -
              2 * Space.s -
              hintHeight,
          )
        : undefined,
    // With the keyboard up the panel shrinks too, so the focused field and
    // the tool bar stay above the keyboard (the stage keeps 120 pt).
    panelMax =
      roomy !== undefined && keyboard > 0
        ? Math.max(
            SINGLE_FLOW ? 112 : 120,
            Math.min(
              roomy,
              area - keyboard - (SINGLE_FLOW ? 0 : toolBarHeight) - 120,
            ),
          )
        : roomy,
    // The single flow's sheet: room for the panel between the preview and
    // the render button (or, with the keyboard up, under the thumbnail).
    sheetSpace =
      area > 0
        ? kbMode
          ? Math.max(112, area - keyboard - thumbH - 2 * Space.m - Space.s)
          : Math.max(120, area * 0.6 - 150 - (!isPro && !proLoading ? 20 : 0))
        : undefined;

  const proNote =
    !isPro && !proLoading
      ? SINGLE_FLOW
        ? t(
            "Önizleme ücretsiz. Videoyu oluşturup kaydetmek için Vidora Pro gerekir.",
            "The preview is free. Creating and saving a video needs Vidora Pro.",
          )
        : t(
            "Önizleme ücretsiz. Videoyu ya da görseli oluşturup kaydetmek için Vidora Pro gerekir.",
            "The preview is free. Creating and saving a video or an image needs Vidora Pro.",
          )
      : null;

  // Every state of the preview lives in the transport row (critique 2).
  const transportStatus: TransportStatus =
    progress !== null
      ? {
          kind: "rendering",
          progress,
          started: progressSeen,
          stalled: stalled && !cancelling,
          cancelling,
          cancelSlow,
          onCancel: cancelRender,
        }
      : busy && !result
        ? { kind: "busy", text: busy }
        : flash
          ? { kind: "done", text: flash }
          : null;

  // The posters show the seller's texts as they are when the panel opens.
  const posterCopy = {
    headline: headline.trim() || t("Ürün adı", "Product name"),
    price,
    oldPrice,
    badge,
    cta,
    store,
  };
  const currentLook =
    activeOwn || scene
      ? null
      : (matchingLook({ template, backdrop, palette, fontStyle })?.id ?? null);
  const tileWidth = posterWidth(panelMax);

  return (
    <View
      style={[styles.root, SINGLE_FLOW && { backgroundColor: Theme.surface }]}
      onLayout={(event) => setArea(event.nativeEvent.layout.height)}
    >
      <Stack.Screen
        options={{
          // Single flow: the result is full-bleed, its own bar holds "Bitti".
          headerShown: !(SINGLE_FLOW && result),
          // The bar truncates a long headline; it never pushes the action.
          title: result
            ? t("Videon hazır", "Your video is ready")
            : progress !== null
              ? t("Video hazırlanıyor", "Rendering")
              : SINGLE_FLOW
                ? t("Ürün videosu", "Product video")
                : draftTitle({ headline }, t("Ürün videosu", "Product video")),
          headerLargeTitleEnabled: false,
          headerLeft: () =>
            result ? (
              SINGLE_FLOW ? (
                <HeaderBack
                  testID="result-edit"
                  label={t("Geri", "Back")}
                  onPress={() => setShowResult(false)}
                />
              ) : (
                <HeaderText
                  testID="result-edit"
                  label={t("Düzenle", "Edit")}
                  onPress={() => setShowResult(false)}
                />
              )
            ) : (
              // Same rules as the swipe: the draft is saved first.
              <HeaderBack
                testID="editor-back"
                label={t("Geri", "Back")}
                onPress={() => goBack(router)}
              />
            ),
          headerRight: () =>
            result ? (
              <HeaderText
                strong
                testID="result-done"
                label={t("Bitti", "Done")}
                onPress={leaveEditor}
              />
            ) : SINGLE_FLOW ? (
              <Text
                maxFontSizeMultiplier={1.2}
                style={{
                  fontFamily: Face.extra,
                  fontWeight: "800",
                  fontSize: 15,
                  color: Theme.text,
                }}
              >
                {t("Düzenleyici", "Editor")}
              </Text>
            ) : progress === null ? (
              <HeaderAction
                testID="render-button"
                label={t("Videoyu oluştur", "Create video")}
                badge={!isPro && !proLoading ? "PRO" : undefined}
                disabled={locked || proLoading}
                onPress={pressRender}
              />
            ) : null,
        }}
      />
      {/* Plain padding from the keyboard height held in state: the stock
          avoiding view animates layout on every keyboard change. */}
      <View
        style={{ flex: 1, paddingBottom: keyboard }}
        // The result covers the editor; VoiceOver must not reach it (F21).
        accessibilityElementsHidden={!!result}
        importantForAccessibility={result ? "no-hide-descendants" : "auto"}
      >
        {/* The stage dismisses the keyboard when it is tapped: the empty
            space around the preview and the thumbnail itself (see the
            pointerEvents note below). Presses on the stage's own controls
            (pills, back, transport) win: the responder is the deepest
            pressable. Off (disabled) when no keyboard is up. */}
        <Pressable
          accessible={false}
          disabled={keyboard === 0}
          onPress={() => Keyboard.dismiss()}
          style={[styles.stage, kbMode && styles.stageThumb]}
          onLayout={(event) => {
            // The thumbnail row is sized by its content: not a stage size.
            if (kbMode) return;
            const { width, height } = event.nativeEvent.layout;
            setStage({ width, height });
          }}
        >
          {box.height > 0 && (
            // Keyboard up in the single flow: the thumbnail has no controls
            // (its transport row is hidden), so a tap on it is a tap on the
            // stage: "box-only" makes this wrapper the touch target instead
            // of the frame's play/pause press. Otherwise unchanged ("auto").
            <View
              collapsable={false}
              pointerEvents={kbMode ? "box-only" : "auto"}
            >
              <PreviewPlayer
                box={box}
                rowWidth={kbMode ? box.width : inner.width}
                lifted={SINGLE_FLOW}
                compact={kbMode}
                flipbook={flipbook}
                updating={updating}
                failed={previewFailed}
                onRetry={retryPreview}
                status={transportStatus}
                // Paused under the paywall or the result too (audit F38).
                paused={progress !== null || !!result || !isFocused}
                autoPlay={!reduceMotion}
                onPlayback={preview.onPlayback}
                placeholder={
                  <View
                    style={[
                      StyleSheet.absoluteFill,
                      { backgroundColor: colors.background.top },
                    ]}
                    accessible
                    accessibilityLabel={t(
                      "Ürün, seçtiğin zeminde",
                      "Your product on the chosen backdrop",
                    )}
                  >
                    {backdrop && !activeOwn ? (
                      // The full image, not the picker thumbnail: the placeholder
                      // then shows the same backdrop composition as the frames.
                      <Image
                        source={backdropById(backdrop).image}
                        resizeMode="cover"
                        // Numeric size: the asset's own size never leaks in.
                        style={[FILL, { width: box.width, height: box.height }]}
                      />
                    ) : (
                      <View
                        style={[
                          StyleSheet.absoluteFill,
                          {
                            top: "55%",
                            backgroundColor: colors.background.bottom,
                          },
                        ]}
                      />
                    )}
                    <Image
                      source={{ uri: cutout.uri }}
                      resizeMode="contain"
                      style={styles.product}
                    />
                  </View>
                }
                trailing={
                  <>
                    {music && (
                      <TransportButton
                        testID="preview-mute"
                        icon={
                          preview.muted
                            ? "speaker.slash.fill"
                            : "speaker.wave.2.fill"
                        }
                        label={
                          preview.muted
                            ? t("Müziği aç", "Unmute music")
                            : t("Müziği kapat", "Mute music")
                        }
                        onPress={() => preview.setMuted(!preview.muted)}
                      />
                    )}
                    {output && !showResult && (
                      <TransportButton
                        testID="open-last-video"
                        icon="film"
                        label={t("Son videoyu aç", "Open the last video")}
                        onPress={() => setShowResult(true)}
                      />
                    )}
                    <TransportButton
                      testID="pick-photo"
                      icon="photo.on.rectangle"
                      label={t("Fotoğrafı değiştir", "Change photo")}
                      disabled={locked || !!result}
                      onPress={choosePhotoSource}
                    />
                  </>
                }
              />
            </View>
          )}
          {kbMode && !result && (
            <View style={styles.thumbSide}>
              <EditorTabs
                tabs={tools}
                active={tool}
                onChange={chooseTool}
                disabled={progress !== null}
              />
              <Text maxFontSizeMultiplier={1.3} style={styles.thumbHint}>
                {tool === "text" && focusedField ? (
                  <>
                    {t("", "The video updates live as you type the ")}
                    <Text style={styles.thumbHintName}>{focusedField}</Text>
                    {t(" yazılırken videodaki metin canlı değişir.", ".")}
                  </>
                ) : null}
              </Text>
            </View>
          )}
          {photoHint && box.height > 0 && !kbMode && (
            <Pressable
              testID="photo-hint-change"
              accessibilityRole="button"
              accessibilityLabel={`${photoHint} ${t(
                "Başka fotoğraf seç.",
                "Choose another photo.",
              )}`}
              disabled={locked || !!result}
              onPress={choosePhotoSource}
              style={{ maxWidth: inner.width, height: hintHeight }}
            >
              <Text
                testID="photo-hint"
                numberOfLines={2}
                maxFontSizeMultiplier={1.3}
                style={styles.photoHint}
              >
                {photoHint}
              </Text>
            </Pressable>
          )}
        </Pressable>

        {!result && banner}

        {(tool || SINGLE_FLOW) && !result && (
          <PanelShell
            key={SINGLE_FLOW ? "sheet" : tool}
            {...(SINGLE_FLOW
              ? {
                  space: sheetSpace,
                  flex: kbMode,
                  keyboard: kbMode,
                  head: kbMode ? undefined : (
                    <EditorTabs
                      tabs={tools}
                      active={tool}
                      onChange={chooseTool}
                      disabled={progress !== null || exportAllLine !== null}
                    />
                  ),
                  footer: kbMode ? undefined : (
                    <>
                      {!isPro && !proLoading && (
                        <Text
                          testID="pro-caption"
                          maxFontSizeMultiplier={1.3}
                          style={styles.proCaption}
                        >
                          {t(
                            "Kaydetmek için Vidora Pro gerekir.",
                            "Saving needs Vidora Pro.",
                          )}
                        </Text>
                      )}
                      <Button
                        primary
                        testID="render-button"
                        label={t("Videoyu oluştur", "Create video")}
                        badge={!isPro && !proLoading ? "PRO" : undefined}
                        disabled={locked || proLoading}
                        busy={proLoading && !locked}
                        onPress={pressRender}
                      />
                    </>
                  ),
                }
              : {
                  onDismiss: () => chooseTool(null),
                  closeLabel: t("Paneli kapat", "Close the panel"),
                  hint: tool ? hints[tool] : undefined,
                  maxHeight: panelMax,
                })}
          >
            {tool === "template" && SINGLE_FLOW && (
              <TemplateChoicePanel
                ids={SINGLE_FLOW_TEMPLATES}
                template={template}
                onTemplate={pickTemplate}
                disabled={locked}
                product={cutout.uri}
                backdrop={activeOwn || scene ? null : backdrop}
                palette={palette}
                fontStyle={fontStyle}
                copy={posterCopy}
                safeArea={preset === "reels" ? "social" : "none"}
              />
            )}
            {tool === "template" && !SINGLE_FLOW && (
              <TemplatePanel
                initialMode={currentLook ? "looks" : "templates"}
                category={category}
                onCategory={chooseCategory}
                disabled={locked}
                looks={
                  <LooksList
                    category={category}
                    product={cutout.uri}
                    copy={posterCopy}
                    selected={currentLook}
                    onLook={chooseLook}
                    disabled={locked}
                    width={tileWidth}
                    safeArea={preset === "reels" ? "social" : "none"}
                  />
                }
                templates={
                  <TemplatesList
                    template={template}
                    onTemplate={pickTemplate}
                    disabled={locked}
                    width={tileWidth}
                    product={cutout.uri}
                    backdrop={activeOwn || scene ? null : backdrop}
                    palette={palette}
                    fontStyle={fontStyle}
                    copy={posterCopy}
                    safeArea={preset === "reels" ? "social" : "none"}
                  />
                }
              />
            )}
            {tool === "color" && (
              <BackgroundPanel
                own={
                  ownBackdrop
                    ? {
                        uri: ownBackdropUri(ownBackdrop.file),
                        scale: ownBackdrop.scale,
                        offset: ownBackdrop.offset,
                        text: ownBackdrop.text,
                      }
                    : null
                }
                ownSelected={!!activeOwn}
                onPickOwn={() => void pickOwnBackdrop()}
                onSelectOwn={selectOwn}
                onRemoveOwn={removeOwn}
                onOwnScale={(direction) =>
                  ownBackdrop &&
                  updateOwn({
                    scale: stepValue(ownBackdrop.scale, direction, OWN_SCALE),
                  })
                }
                onOwnOffset={(direction) =>
                  ownBackdrop &&
                  updateOwn({
                    offset: stepValue(
                      ownBackdrop.offset,
                      direction,
                      OWN_OFFSET,
                    ),
                  })
                }
                onOwnText={(text) => updateOwn({ text })}
                backdrop={activeOwn ? null : backdrop}
                onBackdrop={pickBackdrop}
                palette={backdrop || scene || activeOwn ? null : palette}
                onPalette={pickPalette}
                disabled={locked}
                scene={
                  cloudAvailable() && cutout ? (
                    <>
                      <Button
                        icon="photo.artframe"
                        label={
                          scene
                            ? t("Sahneyi değiştir", "Change scene")
                            : t("Yapay zekâ sahnesi", "AI scene")
                        }
                        disabled={locked}
                        onPress={() =>
                          router.push({
                            pathname: "/ai-studio",
                            params: {
                              cutout: cutout.uri,
                              width: String(cutout.width),
                              height: String(cutout.height),
                              category,
                            },
                          })
                        }
                      />
                      {scene && (
                        <Button
                          plain
                          label={t("Sahneyi kaldır", "Remove scene")}
                          disabled={locked}
                          onPress={() => setScene(null)}
                        />
                      )}
                    </>
                  ) : undefined
                }
              />
            )}
            {tool === "text" && (
              <TextPanel
                extras={
                  <CampaignStrip
                    badge={badge}
                    onBadge={setBadge}
                    headline={headline}
                    onHeadline={setHeadline}
                    priceTag={priceTag}
                    onPriceTag={setPriceTag}
                    risk={marketplaceTextRisk(preset, {
                      price,
                      oldPrice,
                      badge,
                    })}
                    disabled={locked}
                  />
                }
                headline={headline}
                onHeadline={setHeadline}
                headlineIdeas={unique(
                  [...(aiCopy?.headlines ?? []), ...bank.headlines],
                  6,
                )}
                price={price}
                onPrice={setPrice}
                oldPrice={oldPrice}
                onOldPrice={setOldPrice}
                fontStyle={fontStyle}
                defaultFontStyle={DEFAULT_FONT_STYLE[template]}
                onFontStyle={setFontStyle}
                badge={badge}
                onBadge={setBadge}
                badgeIdeas={bank.badges}
                cta={cta}
                onCta={(value: string) => {
                  lookTouched.current = true;
                  setCta(value);
                }}
                ctaIdeas={unique([...(aiCopy?.ctas ?? []), ...bank.ctas], 5)}
                store={store}
                onStore={setStore}
                showStore={template === "store"}
                aiNote={aiNote}
                droppedNote={droppedNote}
                onAskAi={aiReady === false ? undefined : () => void askAi()}
                aiBadge={isPro || aiReady === false ? undefined : "PRO"}
                disabled={locked}
                allFields={SINGLE_FLOW}
                stacked={kbMode}
                onFocusChange={setFocusedField}
              />
            )}
            {tool === "music" && (
              <MusicPanel
                music={music}
                disabled={locked}
                onPick={() =>
                  void run(
                    t("Müzik seçiliyor…", "Choosing music…"),
                    async () => {
                      const picked = await pickMusic();
                      if (picked) {
                        tap("select");
                        replaceMusic(picked);
                      }
                    },
                  )
                }
                onRemove={() => replaceMusic(null)}
              />
            )}
            {tool === "format" && SINGLE_FLOW && (
              <ExportPanel
                ratio={ratio}
                onRatio={setRatio}
                onStill={canSaveImage ? pressStillStyle : undefined}
                onExportAll={canSaveImage ? pressExportAll : undefined}
                onCancelAll={cancelExportAll}
                onBatch={pressBatch}
                progress={exportAllLine}
                proBadge={isPro ? undefined : "PRO"}
                disabled={locked && exportAllLine === null}
              />
            )}
            {tool === "format" && !SINGLE_FLOW && (
              <FormatPanel
                ratio={ratio}
                onRatio={setRatio}
                onSaveStill={canSaveImage ? chooseStill : undefined}
                textRisk={marketplaceTextRisk(preset, {
                  price,
                  oldPrice,
                  badge,
                })}
                qualityByPreset={!qualityChosen.current}
                saveImageBadge={isPro ? undefined : "PRO"}
                preset={preset}
                onPreset={setPreset}
                quality={effectiveQuality}
                onQuality={(value) => {
                  qualityChosen.current = true;
                  setQuality(value);
                }}
                proNote={proNote}
                disabled={locked}
              />
            )}
          </PanelShell>
        )}

        {!SINGLE_FLOW && (
          <ToolBar
            tools={tools}
            active={tool}
            onChange={chooseTool}
            disabled={progress !== null || !!result}
          />
        )}
      </View>

      {result && (
        <ResultView
          uri={clipUri(result)}
          busy={locked}
          busyLabel={busy}
          saved={savedClip === result.id}
          error={message || null}
          errorAction={settingsButton}
          autoPlay={!reduceMotion}
          note={resultNote}
          aspect={aspectOf(outputRatio)}
          duration={spec?.duration}
          onDone={leaveEditor}
          onEdit={() => setShowResult(false)}
          onSaveStill={canSaveImage ? chooseStill : undefined}
          onSave={() =>
            void run(t("Kaydediliyor…", "Saving…"), async () => {
              await saveToPhotos(result);
              setSavedClip(result.id);
              void recordSuccessfulSave();
              AccessibilityInfo.announceForAccessibility(
                t("Fotoğraflar'a kaydedildi.", "Saved to Photos."),
              );
            })
          }
          onShare={() =>
            void run(t("Paylaşım açılıyor…", "Opening share…"), () =>
              share(result),
            )
          }
        />
      )}
      {QA_DIAG ? (
        // QA builds only: a 4 px, nearly transparent element whose label is
        // the render's timeline (render:start / p=17 t=21s / done / fail), read
        // by a UI test from the accessibility tree. Same technique as
        // "poster-diag" on Home: it takes no touches and moves nothing.
        <View
          testID="render-diag"
          accessible
          accessibilityLabel={diagLine}
          pointerEvents="none"
          style={styles.renderDiag}
        />
      ) : null}
      <ImageSetSheet
        visible={imageSetOpen}
        initial={contrastingBackdrops(backdrop, BACKDROPS)}
        progress={imageSetProgress}
        onShow={() => {
          imageSetShown.current = true;
        }}
        onStart={(ids) => void startImageSet(ids)}
        onCancel={() => {
          imageSetCancel.current = true;
        }}
        onClose={() => setImageSetOpen(false)}
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
    paddingHorizontal: Space.l,
    paddingVertical: Space.s,
    minHeight: 120,
  },
  product: {
    position: "absolute",
    left: "15%",
    top: "20%",
    width: "70%",
    height: "55%",
  },
  photoHint: {
    paddingTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: Theme.muted,
    textAlign: "center",
  },
  proCaption: {
    fontSize: 13,
    lineHeight: 18,
    color: Theme.muted,
    textAlign: "center",
    paddingBottom: Space.s,
  },
  stageThumb: {
    flex: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "flex-start",
    gap: Space.l,
    paddingTop: Space.m,
    paddingHorizontal: Space.gutter,
    minHeight: 0,
  },
  thumbSide: { flex: 1, gap: Space.m },
  thumbHintName: {
    fontFamily: Face.extra,
    fontWeight: "800",
    color: Theme.text,
  },
  thumbHint: {
    fontFamily: Face.bold,
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: "700",
    color: Theme.muted,
  },
  banner: { paddingHorizontal: Space.l, paddingBottom: Space.s },
  // QA only (render-diag): tiny and nearly transparent, still in the tree.
  renderDiag: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 4,
    height: 4,
    opacity: 0.08,
    backgroundColor: Theme.text,
  },
});
