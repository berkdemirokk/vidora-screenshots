import { QA_DIAG } from "../config";
import { diag } from "../diag";
import {
  useEffect,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
} from "react";
import {
  findNodeHandle,
  Image,
  InputAccessoryView,
  Keyboard,
  Pressable,
  useWindowDimensions,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  Button,
  Face,
  Icon,
  INERT_ACCESSORY_HOST,
  MaxScale,
  Radius,
  Segmented,
  Space,
  Theme,
  tap,
  useInputAccessoryIds,
  useT,
  useUpper,
  type IconName,
} from "../ui";
import { showActionSheet } from "../action-sheet";
import { useTemplatePoster, type PosterCopy } from "../sample-frames";
import {
  FONT_SAMPLE_FAMILY,
  FONT_SIZE_FACTOR,
  FONT_STYLES,
  PALETTES,
  RATIOS,
  TEMPLATES,
  type AspectRatio,
  type FontStyle,
  type PaletteId,
  type ProductQuality,
  type TemplateId,
  type TemplateInfo,
} from "../product-templates";
import {
  CATEGORIES,
  EXPORT_PRESETS,
  type CategoryId,
  type ExportPreset,
} from "../product-catalog";
import { BACKDROPS, type BackdropId } from "../backdrops";
import { OWN_OFFSET, OWN_SCALE } from "../backdrop-rules";
import {
  CHROME_SCALE,
  ChipRow,
  FILL,
  ListActive,
  PanelLabel,
  SegmentRow,
  usePanelSpace,
} from "./controls";

/** Pressed highlight for selectable tiles (rows highlight, they do not shrink). */
const PRESSED = Theme.pressed;

/**
 * A real frame of a template, drawn on the phone. Shows the user's cut-out
 * when `product` is given, else the bundled sample. A neutral tile stands in
 * while it is drawn or when the build has no renderer.
 */
export function Poster({
  template,
  product,
  palette,
  uri,
  style,
}: {
  template: TemplateId;
  product?: string | null;
  palette?: PaletteId;
  /** A frame to show instead (e.g. the editor's current preview). */
  uri?: string | null;
  style?: StyleProp<ViewStyle>;
}) {
  const poster = useTemplatePoster(template, product, palette);
  const source = uri ?? poster;
  return (
    <View style={[styles.poster, style]}>
      {source ? (
        <Image
          accessible={false}
          accessibilityIgnoresInvertColors
          source={{ uri: source }}
          resizeMode="cover"
          style={StyleSheet.absoluteFill}
        />
      ) : null}
    </View>
  );
}

/**
 * A template as a 9:16 poster card with its name below. Selection is a 2 pt
 * ring around the poster; the name wraps rather than clipping at large
 * Dynamic Type sizes.
 */
export function TemplateCard({
  item,
  selected,
  disabled,
  onPress,
  wide = false,
  product,
  palette,
}: {
  item: TemplateInfo;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
  /** Larger card for the start screen gallery. */
  wide?: boolean;
  /** The user's cut-out; the sample product is shown without it. */
  product?: string | null;
  /** Palette to draw the poster in; each template's own when left out. */
  palette?: PaletteId;
}) {
  const t = useT(),
    name = t(item.tr, item.en),
    width = wide ? 136 : 104,
    radius = wide ? Radius.m : Radius.s,
    length = t(`${item.duration} sn`, `${item.duration} s`);
  return (
    <Pressable
      accessibilityRole={wide ? "button" : "radio"}
      accessibilityLabel={t("Şablon", "Template") + ": " + name}
      accessibilityHint={t(item.descriptionTr, item.descriptionEn)}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={() => {
        if (!selected) tap("select");
        onPress();
      }}
      style={({ pressed }) => [
        styles.card,
        { width: width + (RING + RING_GAP) * 2 },
        pressed && { opacity: 0.8 },
        disabled && { opacity: 0.4 },
      ]}
    >
      <View
        style={[
          styles.ring,
          { borderRadius: radius + RING + RING_GAP },
          selected && { borderColor: Theme.text },
        ]}
      >
        <Poster
          template={item.id}
          product={product}
          palette={palette}
          style={{ width, borderRadius: radius }}
        />
      </View>
      <View style={styles.cardText}>
        <Text
          numberOfLines={2}
          style={[styles.cardName, selected && styles.cardNameSelected]}
        >
          {name}
        </Text>
        <Text style={styles.cardDuration}>{length}</Text>
      </View>
    </Pressable>
  );
}

/**
 * The single flow's Şablon tool: only the offered templates, three large
 * tiles in one row. The poster shows the seller's product and texts; the
 * selected tile has an ink ring and a check. A template outside `ids` (an
 * old draft) simply leaves every tile unselected.
 */
export function TemplateChoicePanel({
  ids,
  template,
  onTemplate,
  disabled,
  product,
  backdrop,
  palette,
  fontStyle,
  copy,
  safeArea,
}: {
  ids: readonly TemplateId[];
  template: TemplateId;
  onTemplate: (id: TemplateId) => void;
  disabled: boolean;
  product: string;
  /** null while an own photo or AI scene is the background. */
  backdrop: BackdropId | null;
  palette: PaletteId;
  fontStyle: FontStyle | null;
  copy: PosterCopy;
  safeArea: "none" | "social";
}) {
  const space = usePanelSpace(),
    { width: screenWidth } = useWindowDimensions(),
    { fontScale } = useWindowDimensions(),
    t = useT();
  const items = ids
    .map((id) => TEMPLATES.find((item) => item.id === id))
    .filter((item): item is TemplateInfo => !!item);
  const gap = Space.s,
    rowWidth = screenWidth - 2 * Space.gutter,
    byWidth = Math.floor((rowWidth - gap * (items.length - 1)) / items.length),
    // The caption takes about 32 pt (more with large type) under the poster.
    caption = 32 * Math.min(fontScale, MaxScale.chrome) + Space.s,
    byHeight =
      space === undefined
        ? byWidth
        : Math.floor(((space - caption - Space.l) * 9) / 16),
    width = Math.max(56, Math.min(byWidth, byHeight));
  return (
    <ScrollView
      style={space === undefined ? undefined : { maxHeight: space }}
      contentContainerStyle={choiceStyles.row}
      accessibilityRole="radiogroup"
      accessibilityLabel={t("Şablonlar", "Templates")}
    >
      {items.map((item) => (
        <TemplateChoiceTile
          key={item.id}
          item={item}
          width={width}
          selected={item.id === template}
          disabled={disabled}
          onPress={() => onTemplate(item.id)}
          product={product}
          backdrop={backdrop}
          palette={palette}
          fontStyle={fontStyle}
          copy={copy}
          safeArea={safeArea}
        />
      ))}
    </ScrollView>
  );
}

function TemplateChoiceTile({
  item,
  width,
  selected,
  disabled,
  onPress,
  product,
  backdrop,
  palette,
  fontStyle,
  copy,
  safeArea,
}: {
  item: TemplateInfo;
  width: number;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
  product: string;
  backdrop: BackdropId | null;
  palette: PaletteId;
  fontStyle: FontStyle | null;
  copy: PosterCopy;
  safeArea: "none" | "social";
}) {
  const t = useT(),
    name = t(item.tr, item.en);
  // The template's own cached sample shows at once; the seller's product
  // replaces it when its poster is ready.
  const sample = useTemplatePoster(item.id, null, undefined, {
    priority: "idle",
  });
  const mine = useTemplatePoster(
    item.id,
    product,
    backdrop ? undefined : palette,
    {
      backdrop,
      fontStyle: fontStyle ?? undefined,
      copy,
      safeArea,
      priority: "idle",
    },
  );
  const layer = (uri: string | null) =>
    uri ? (
      <Image
        accessible={false}
        accessibilityIgnoresInvertColors
        source={{ uri }}
        resizeMode="cover"
        style={StyleSheet.absoluteFill}
      />
    ) : null;
  return (
    <Pressable
      testID={"template-" + item.id}
      accessibilityRole="radio"
      accessibilityLabel={name}
      accessibilityHint={t(item.descriptionTr, item.descriptionEn)}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={() => {
        // QA builds only: proves in the device log that the tile was pressed.
        if (QA_DIAG)
          diag("template:press " + item.id + " disabled=" + disabled);
        if (!selected) tap("select");
        onPress();
      }}
      style={({ pressed }) => [
        choiceStyles.tile,
        { width },
        pressed && { opacity: 0.8 },
        disabled && { opacity: 0.4 },
      ]}
    >
      <View
        style={[
          choiceStyles.poster,
          { width, height: Math.round((width * 16) / 9) },
        ]}
      >
        {layer(sample)}
        {layer(mine)}
        {selected && <View style={choiceStyles.ring} />}
        {selected && (
          <View style={choiceStyles.check}>
            <Icon name="checkmark" size={12} color={Theme.accent} />
          </View>
        )}
      </View>
      <Text
        numberOfLines={2}
        maxFontSizeMultiplier={MaxScale.chrome}
        style={[choiceStyles.name, selected && choiceStyles.nameOn]}
      >
        {name}
      </Text>
    </Pressable>
  );
}

const choiceStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "flex-start",
    gap: Space.s,
    paddingTop: Space.xs,
    paddingBottom: Space.s,
  },
  tile: { gap: Space.xs, alignItems: "center", minHeight: 44 },
  poster: {
    borderRadius: Radius.s,
    overflow: "hidden",
    backgroundColor: Theme.raised,
  },
  ring: {
    ...StyleSheet.absoluteFill,
    borderRadius: Radius.s,
    borderWidth: 2,
    borderColor: Theme.text,
  },
  check: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Theme.text,
    alignItems: "center",
    justifyContent: "center",
  },
  name: {
    fontFamily: Face.bold,
    fontWeight: "700",
    fontSize: 13,
    lineHeight: 16,
    color: Theme.muted,
    textAlign: "center",
  },
  nameOn: { color: Theme.text, fontWeight: "800" },
});

export type TemplateMode = "looks" | "templates";

/**
 * The Şablon tool: a header with "Görünümler | Şablonlar" and the product
 * category, then one horizontal list. It opens on the current choice: the
 * caller decides the first segment once; it never switches by itself. Both
 * lists stay mounted so switching keeps their scroll position.
 */
export function TemplatePanel({
  initialMode,
  category,
  onCategory,
  looks,
  templates,
  disabled,
}: {
  initialMode: TemplateMode;
  category: CategoryId;
  onCategory: (id: CategoryId) => void;
  /** The looks list (LooksList). */
  looks: ReactNode;
  /** The templates list (TemplatesList). */
  templates: ReactNode;
  disabled: boolean;
}) {
  const space = usePanelSpace();
  const t = useT();
  // The switch grows with the text (up to the chrome cap) so labels fit.
  const { fontScale } = useWindowDimensions();
  const [mode, setMode] = useState<TemplateMode>(() => initialMode);
  const current = CATEGORIES.find((item) => item.id === category);
  const currentName = current ? t(current.tr, current.en) : "";
  function openCategories() {
    showActionSheet(
      {
        title: t("Ürün kategorisi", "Product category"),
        message: t(
          "Görünümler ve metin önerileri buna göre değişir.",
          "The looks and text ideas follow it.",
        ),
        options: [
          ...CATEGORIES.map((item) => t(item.tr, item.en)),
          t("Vazgeç", "Cancel"),
        ],
        cancelButtonIndex: CATEGORIES.length,
      },
      (index) => {
        const picked = CATEGORIES[index];
        if (picked && picked.id !== category) {
          tap("select");
          onCategory(picked.id);
        }
      },
    );
  }
  return (
    <ScrollView
      style={{ maxHeight: space }}
      contentContainerStyle={styles.compactPanel}
    >
      <View style={styles.templateHead}>
        <View style={{ width: 200 * Math.min(fontScale, MaxScale.chrome) }}>
          <Segmented<TemplateMode>
            label={t("Şablon", "Template")}
            options={[
              {
                value: "looks",
                label: t("Görünümler", "Looks"),
                testID: "template-mode-looks",
              },
              {
                value: "templates",
                label: t("Şablonlar", "Templates"),
                testID: "template-mode-templates",
              },
            ]}
            value={mode}
            onChange={setMode}
          />
        </View>
        <Pressable
          testID="category-menu"
          accessibilityRole="button"
          accessibilityLabel={
            t("Ürün kategorisi", "Product category") + ": " + currentName
          }
          accessibilityState={{ disabled }}
          disabled={disabled}
          hitSlop={{ top: 10, bottom: 10 }}
          onPress={openCategories}
          style={({ pressed }) => [
            styles.categoryPull,
            pressed && { opacity: 0.5 },
            disabled && { opacity: 0.4 },
          ]}
        >
          <Text
            maxFontSizeMultiplier={CHROME_SCALE}
            style={styles.categoryText}
          >
            {currentName}
          </Text>
          <Icon name="chevron.down" size={13} color={Theme.text} />
        </Pressable>
      </View>
      <ListActive.Provider value={mode === "looks"}>
        <View style={mode === "looks" ? undefined : styles.hidden}>
          {looks}
        </View>
      </ListActive.Provider>
      <ListActive.Provider value={mode === "templates"}>
        <View style={mode === "templates" ? undefined : styles.hidden}>
          {templates}
        </View>
      </ListActive.Provider>
    </ScrollView>
  );
}

export function ColorPanel({
  palette,
  onPalette,
  disabled,
  bare = false,
  compact = false,
  after,
}: {
  /** null when a backdrop or scene is chosen instead of a plain colour. */
  palette: PaletteId | null;
  onPalette: (id: PaletteId) => void;
  disabled: boolean;
  /** Only the swatch row, for use inside another panel. */
  bare?: boolean;
  /** Small round swatches without names (names stay in VoiceOver). */
  compact?: boolean;
  /** Drawn at the end of the compact row, e.g. the AI scene entry. */
  after?: ReactNode;
}) {
  const t = useT();
  if (compact)
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.smallSwatches}
      >
        <Text maxFontSizeMultiplier={CHROME_SCALE} style={styles.swatchLabel}>
          {t("Düz renk", "Plain color")}
        </Text>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={t("Düz renkler", "Plain colors")}
          style={styles.smallSwatchGroup}
        >
          {PALETTES.map((item) => {
            const selected = item.id === palette;
            return (
              <Pressable
                key={item.id}
                testID={"palette-" + item.id}
                accessibilityRole="radio"
                accessibilityLabel={
                  t("Renk", "Color") + ": " + t(item.tr, item.en)
                }
                accessibilityState={{ selected, disabled }}
                disabled={disabled}
                onPress={() => {
                  if (!selected) tap("select");
                  onPalette(item.id);
                }}
                style={({ pressed }) => [
                  styles.smallSwatchRing,
                  selected && { borderColor: Theme.text },
                  pressed && { opacity: 0.7 },
                  disabled && { opacity: 0.4 },
                ]}
              >
                <View style={styles.smallSwatch}>
                  <View
                    style={{ flex: 11, backgroundColor: item.background.top }}
                  />
                  <View
                    style={{
                      flex: 9,
                      backgroundColor: item.background.bottom,
                    }}
                  />
                </View>
              </Pressable>
            );
          })}
        </View>
        {after}
      </ScrollView>
    );
  return (
    <View style={bare ? undefined : styles.panel}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="radiogroup"
        accessibilityLabel={t("Renk", "Color")}
        contentContainerStyle={styles.swatches}
      >
        {PALETTES.map((item) => {
          const selected = item.id === palette;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="radio"
              accessibilityLabel={
                t("Renk", "Color") + ": " + t(item.tr, item.en)
              }
              accessibilityState={{ selected, disabled }}
              disabled={disabled}
              onPress={() => {
                if (!selected) tap("select");
                onPalette(item.id);
              }}
              style={({ pressed }) => [
                styles.swatchCell,
                pressed && { backgroundColor: PRESSED },
                disabled && { opacity: 0.4 },
              ]}
            >
              <View
                style={[
                  styles.swatchRing,
                  selected && { borderColor: Theme.text },
                ]}
              >
                <View style={styles.swatch}>
                  <View
                    style={{ flex: 11, backgroundColor: item.background.top }}
                  />
                  <View
                    style={{
                      flex: 9,
                      backgroundColor: item.background.bottom,
                    }}
                  />
                  <View
                    style={[styles.swatchDot, { backgroundColor: item.accent }]}
                  />
                </View>
              </View>
              <Text
                style={[styles.swatchName, selected && { color: Theme.text }]}
              >
                {t(item.tr, item.en)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/**
 * The "Arka plan" tool: the seller's own photo, bundled studio backdrops,
 * plain colours and (when the cloud is available) the AI scene entry.
 * The own photo stays when another background is picked; tapping its tile
 * brings it back exactly as it was.
 */
export function BackgroundPanel({
  backdrop,
  onBackdrop,
  palette,
  onPalette,
  scene,
  disabled,
  own,
  ownSelected = false,
  onPickOwn,
  onSelectOwn,
  onRemoveOwn,
  onOwnScale,
  onOwnOffset,
  onOwnText,
}: {
  /** The seller's photo, when one exists (active or not). */
  own?: {
    uri: string;
    scale: number;
    offset: number;
    text: "light" | "dark";
  } | null;
  /** The photo is the background now. */
  ownSelected?: boolean;
  /** Opens the photo picker (empty tile, or "Başka fotoğraf seç"). */
  onPickOwn?: () => void;
  onSelectOwn?: () => void;
  onRemoveOwn?: () => void;
  onOwnScale?: (direction: 1 | -1) => void;
  onOwnOffset?: (direction: 1 | -1) => void;
  onOwnText?: (text: "light" | "dark") => void;
  /** The bundled backdrop shown now, or null. */
  backdrop: BackdropId | null;
  onBackdrop: (id: BackdropId) => void;
  /** The palette, or null when a backdrop, photo or AI scene is shown. */
  palette: PaletteId | null;
  onPalette: (id: PaletteId) => void;
  /** The AI scene buttons; left out when the cloud is not available. */
  scene?: ReactNode;
  disabled: boolean;
}) {
  const space = usePanelSpace();
  const t = useT(),
    ownName = t("Kendi fotoğrafın", "Your photo");
  function pressOwn() {
    if (!onPickOwn) return;
    if (!own) return onPickOwn();
    if (!ownSelected) {
      tap("select");
      return onSelectOwn?.();
    }
    showActionSheet(
      {
        options: [
          t("Başka fotoğraf seç", "Choose another photo"),
          t("Fotoğrafı kaldır", "Remove the photo"),
          t("Vazgeç", "Cancel"),
        ],
        destructiveButtonIndex: 1,
        cancelButtonIndex: 2,
      },
      (index) => {
        if (index === 0) onPickOwn();
        else if (index === 1) onRemoveOwn?.();
      },
    );
  }
  const atMin = (value: number, min: number) => value <= min + 1e-6,
    atMax = (value: number, max: number) => value >= max - 1e-6;
  const percent = own ? Math.round(own.scale * 100) : 100,
    steps = own ? Math.round(Math.abs(own.offset) / OWN_OFFSET.step) : 0;
  return (
    <ScrollView
      style={{ maxHeight: space }}
      contentContainerStyle={styles.compactPanel}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="radiogroup"
        accessibilityLabel={t("Stüdyo zeminleri", "Studio backdrops")}
        contentContainerStyle={styles.tiles}
      >
        {onPickOwn && (
          <Pressable
            testID="backdrop-own"
            accessibilityRole="radio"
            accessibilityLabel={t("Zemin", "Backdrop") + ": " + ownName}
            accessibilityHint={
              !own
                ? t(
                    "Fotoğraflarından bir zemin seçer",
                    "Chooses a backdrop from your photos",
                  )
                : !ownSelected
                  ? t("Fotoğrafını zemin yapar", "Uses your photo again")
                  : t(
                      "Başka fotoğraf seçme ya da kaldırma seçeneklerini açar",
                      "Opens choices to replace or remove the photo",
                    )
            }
            accessibilityState={{ selected: ownSelected, disabled }}
            disabled={disabled}
            onPress={pressOwn}
            style={({ pressed }) => [
              styles.tile,
              { width: BACKDROP_WIDTH },
              pressed && { opacity: 0.8 },
              disabled && { opacity: 0.4 },
            ]}
          >
            <View style={[styles.backdropThumb, styles.ownThumb]}>
              {own ? (
                <Image
                  accessible={false}
                  accessibilityIgnoresInvertColors
                  source={{ uri: own.uri }}
                  resizeMode="cover"
                  style={StyleSheet.absoluteFill}
                />
              ) : (
                <Icon name="plus" size={20} color={Theme.text} />
              )}
              {ownSelected && <View style={styles.tileRing} />}
            </View>
            <Text
              numberOfLines={2}
              maxFontSizeMultiplier={CHROME_SCALE}
              style={[
                styles.tileName,
                styles.tileNameTwo,
                ownSelected && styles.tileNameSelected,
              ]}
            >
              {ownName}
            </Text>
          </Pressable>
        )}
        {BACKDROPS.map((item) => {
          const selected = item.id === backdrop,
            name = t(item.tr, item.en);
          return (
            <Pressable
              key={item.id}
              testID={"backdrop-" + item.id}
              accessibilityRole="radio"
              accessibilityLabel={t("Zemin", "Backdrop") + ": " + name}
              accessibilityState={{ selected, disabled }}
              disabled={disabled}
              onPress={() => {
                if (!selected) tap("select");
                onBackdrop(item.id);
              }}
              style={({ pressed }) => [
                styles.tile,
                { width: BACKDROP_WIDTH },
                pressed && { opacity: 0.8 },
                disabled && { opacity: 0.4 },
              ]}
            >
              <View style={styles.backdropThumb}>
                <Image
                  accessible={false}
                  accessibilityIgnoresInvertColors
                  source={item.thumb}
                  resizeMode="cover"
                  style={[
                    FILL,
                    { width: BACKDROP_WIDTH, height: BACKDROP_HEIGHT },
                  ]}
                />
                {selected && <View style={styles.tileRing} />}
              </View>
              <Text
                numberOfLines={2}
                maxFontSizeMultiplier={CHROME_SCALE}
                style={[
                  styles.tileName,
                  styles.tileNameTwo,
                  selected && styles.tileNameSelected,
                ]}
              >
                {name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {own && ownSelected && onOwnScale && onOwnOffset && onOwnText && (
        <View style={styles.ownControls}>
          <Stepper
            label={t("Boyut", "Size")}
            value={t("%" + percent, percent + "%")}
            lessLabel={t("Küçült", "Smaller")}
            moreLabel={t("Büyüt", "Larger")}
            lessIcon="minus"
            moreIcon="plus"
            testID="own-size"
            disabled={disabled}
            lessDisabled={atMin(own.scale, OWN_SCALE.min)}
            moreDisabled={atMax(own.scale, OWN_SCALE.max)}
            onStep={onOwnScale}
          />
          <Stepper
            label={t("Konum", "Position")}
            value={
              steps === 0
                ? t("Orta", "Middle")
                : own.offset < 0
                  ? t(`${steps} yukarı`, `${steps} up`)
                  : t(`${steps} aşağı`, `${steps} down`)
            }
            lessLabel={t("Yukarı taşı", "Move up")}
            moreLabel={t("Aşağı taşı", "Move down")}
            lessIcon="arrow.up"
            moreIcon="arrow.down"
            testID="own-position"
            disabled={disabled}
            lessDisabled={atMin(own.offset, OWN_OFFSET.min)}
            moreDisabled={atMax(own.offset, OWN_OFFSET.max)}
            onStep={onOwnOffset}
          />
          <View style={styles.ownStepRow}>
            <Text maxFontSizeMultiplier={CHROME_SCALE} style={styles.ownLabel}>
              {t("Yazı rengi", "Text color")}
            </Text>
            <ChipRow<"light" | "dark">
              label={t("Yazı rengi", "Text color")}
              options={[
                { value: "light", label: t("Açık", "Light") },
                { value: "dark", label: t("Koyu", "Dark") },
              ]}
              value={own.text}
              onChange={onOwnText}
              disabled={disabled}
              testIDFor={(value) => "own-text-" + value}
            />
          </View>
        </View>
      )}
      <ColorPanel
        palette={palette}
        onPalette={onPalette}
        disabled={disabled}
        compact
        after={
          scene ? <View style={styles.sceneEntry}>{scene}</View> : undefined
        }
      />
    </ScrollView>
  );
}

/** A label, then − value + on one 44 pt row; `onStep` gets -1 or 1. */
function Stepper({
  label,
  value,
  lessLabel,
  moreLabel,
  lessIcon,
  moreIcon,
  testID,
  disabled,
  lessDisabled = false,
  moreDisabled = false,
  onStep,
}: {
  label: string;
  value: string;
  lessLabel: string;
  moreLabel: string;
  lessIcon: IconName;
  moreIcon: IconName;
  testID: string;
  disabled: boolean;
  lessDisabled?: boolean;
  moreDisabled?: boolean;
  onStep: (direction: 1 | -1) => void;
}) {
  const button = (direction: 1 | -1) => {
    const off = disabled || (direction < 0 ? lessDisabled : moreDisabled);
    return (
      <Pressable
        testID={testID + (direction < 0 ? "-less" : "-more")}
        accessibilityRole="button"
        accessibilityLabel={direction < 0 ? lessLabel : moreLabel}
        accessibilityState={{ disabled: off }}
        disabled={off}
        hitSlop={4}
        onPress={() => {
          tap("select");
          onStep(direction);
        }}
        style={({ pressed }) => [
          styles.stepButton,
          pressed && { backgroundColor: PRESSED },
          off && { opacity: 0.4 },
        ]}
      >
        <Icon
          name={direction < 0 ? lessIcon : moreIcon}
          size={14}
          color={Theme.text}
        />
      </Pressable>
    );
  };
  return (
    <View style={styles.ownStepRow}>
      <Text
        maxFontSizeMultiplier={CHROME_SCALE}
        style={[styles.ownLabel, { flex: 1 }]}
      >
        {label}
      </Text>
      {button(-1)}
      <Text
        maxFontSizeMultiplier={CHROME_SCALE}
        style={styles.stepValue}
        accessibilityLabel={label + ": " + value}
      >
        {value}
      </Text>
      {button(1)}
    </View>
  );
}

/** The Metin tool's tabs, in reading order. */
type TextTab = "headline" | "store" | "price" | "badge" | "cta" | "font";

/**
 * The Metin tool, shaped to fit the capped panel: underline tabs (a dot on a
 * filled one), and under them one editor. Fiyat holds the price and the old
 * price side by side; Yazı tipi shows the six families in their own faces.
 * Return walks to the next field.
 */
export function TextPanel({
  headline,
  onHeadline,
  headlineIdeas,
  price,
  onPrice,
  oldPrice,
  onOldPrice,
  fontStyle,
  defaultFontStyle,
  onFontStyle,
  badge,
  onBadge,
  badgeIdeas,
  cta,
  onCta,
  ctaIdeas,
  store,
  onStore,
  showStore,
  aiNote,
  onAskAi,
  aiBadge,
  disabled,
  droppedNote,
  allFields = false,
  stacked = false,
  onFocusChange,
  extras,
}: {
  /** Campaign chips shown above the fields in the single flow. */
  extras?: ReactNode;
  /** Single flow: Ürün adı, Fiyat, Etiket and Buton yazısı at once, no tabs. */
  allFields?: boolean;
  /** Keyboard open: the four fields stack at full width. */
  stacked?: boolean;
  onFocusChange?: (name: string | null) => void;
  /** Texts the engine left out so the product stays large enough. */
  droppedNote?: string | null;
  headline: string;
  onHeadline: (value: string) => void;
  headlineIdeas: string[];
  price: string;
  onPrice: (value: string) => void;
  oldPrice: string;
  onOldPrice: (value: string) => void;
  /** null follows the template's type family (`defaultFontStyle`). */
  fontStyle: FontStyle | null;
  defaultFontStyle: FontStyle;
  onFontStyle: (value: FontStyle | null) => void;
  badge: string;
  onBadge: (value: string) => void;
  badgeIdeas: string[];
  cta: string;
  onCta: (value: string) => void;
  ctaIdeas: string[];
  store: string;
  onStore: (value: string) => void;
  showStore: boolean;
  aiNote: string;
  /** Left out on devices without Apple Intelligence: no button then. */
  onAskAi?: () => void;
  /** "PRO" when the AI suggestions need Pro. */
  aiBadge?: string;
  disabled: boolean;
}) {
  const space = usePanelSpace();
  const t = useT();
  const [picked, setPicked] = useState<TextTab>("headline");
  // Set when Return moved here, so the new input takes the keyboard.
  const [focusNext, setFocusNext] = useState(false);
  const oldPriceInput = useRef<ComponentRef<typeof TextInput>>(null);

  type Field = {
    id: Exclude<TextTab, "price" | "font">;
    tab: string;
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    maxLength: number;
    testID: string;
    ideas: string[];
    ideasLabel: string;
  };
  const fields: Field[] = [
    {
      id: "headline",
      tab: t("Başlık", "Headline"),
      value: headline,
      onChange: onHeadline,
      placeholder: t("Örn. Gül & Amber Parfüm", "e.g. Rose & Amber Perfume"),
      maxLength: 60,
      testID: "field-headline",
      ideas: headlineIdeas,
      ideasLabel: t("Başlık önerileri", "Headline ideas"),
    },
    ...(showStore
      ? [
          {
            id: "store" as const,
            tab: t("Mağaza", "Store"),
            value: store,
            onChange: onStore,
            placeholder: t("Örn. Atölye Nur", "e.g. Nur Studio"),
            maxLength: 30,
            testID: "field-store",
            ideas: [],
            ideasLabel: "",
          },
        ]
      : []),
    {
      id: "badge",
      tab: t("Etiket", "Label"),
      value: badge,
      onChange: onBadge,
      placeholder: t("Örn. Sınırlı stok", "e.g. Limited stock"),
      maxLength: 30,
      testID: "field-badge",
      ideas: badgeIdeas,
      ideasLabel: t("Etiket önerileri", "Label ideas"),
    },
    {
      id: "cta",
      tab: t("Buton yazısı", "Button text"),
      value: cta,
      onChange: onCta,
      placeholder: t("Örn. Hemen incele", "e.g. Shop now"),
      maxLength: 40,
      testID: "field-cta",
      ideas: ctaIdeas,
      ideasLabel: t("Buton yazısı önerileri", "Button text ideas"),
    },
  ];
  const order: TextTab[] = [
    "headline",
    ...(showStore ? (["store"] as const) : []),
    "price",
    "badge",
    "cta",
    "font",
  ];
  const tab: TextTab = order.includes(picked) ? picked : "headline";
  const field = fields.find((f) => f.id === tab) ?? null;
  const next = order[order.indexOf(tab) + 1] ?? null;
  const filled: Record<TextTab, boolean> = {
    headline: !!headline.trim(),
    store: !!store.trim(),
    price: !!price.trim() || !!oldPrice.trim(),
    badge: !!badge.trim(),
    cta: !!cta.trim(),
    font: fontStyle !== null,
  };
  const labels: Record<TextTab, string> = {
    headline: t("Başlık", "Headline"),
    store: t("Mağaza", "Store"),
    price: t("Fiyat", "Price"),
    badge: t("Etiket", "Label"),
    cta: t("Buton yazısı", "Button text"),
    font: t("Yazı tipi", "Type"),
  };

  if (allFields) {
    return (
      <TextFields
        fields={[
          { ...fields[0], tab: t("Ürün adı", "Product name") },
          fields.find((f) => f.id === "badge")!,
          fields.find((f) => f.id === "cta")!,
        ]}
        price={price}
        onPrice={onPrice}
        oldPrice={oldPrice}
        onOldPrice={onOldPrice}
        note={droppedNote ?? ""}
        space={space ?? 10000}
        stacked={stacked}
        disabled={disabled}
        onFocusChange={onFocusChange}
        extras={extras}
      />
    );
  }

  function go(to: TextTab, withKeyboard: boolean) {
    setFocusNext(withKeyboard && to !== "font");
    setPicked(to);
    if (to === "font") Keyboard.dismiss();
  }

  // One quiet line under the editor.
  const note =
    droppedNote ||
    (tab === "headline" && aiNote) ||
    (tab === "price" && oldPrice.trim() && !price.trim()
      ? t(
          "Eski fiyat, fiyat da yazılınca görünür.",
          "The old price shows once a price is entered too.",
        )
      : "") ||
    (tab === "font"
      ? t(
          "Şablonun yazı tipi: " + fontName(defaultFontStyle, t),
          "The template's type: " + fontName(defaultFontStyle, t),
        )
      : "") ||
    (field && !field.value.trim()
      ? t(
          "Boş bıraktığın alan videoda görünmez.",
          "Fields you leave empty do not appear in the video.",
        )
      : "");

  return (
    <ScrollView
      style={{ maxHeight: space }}
      contentContainerStyle={styles.textTool}
      keyboardShouldPersistTaps="handled"
    >
      <SegmentRow<TextTab>
        label={t("Metin", "Text")}
        options={order.map((id) => ({
          value: id,
          label: labels[id],
          style: id === "font" ? { marginLeft: Space.s } : undefined,
        }))}
        value={tab}
        onChange={(id) => go(id, false)}
        marked={(id) => filled[id]}
        testIDFor={(id) => "text-tab-" + id}
      />

      {tab === "price" ? (
        <View style={styles.priceRow}>
          <View style={styles.priceField}>
            <Text style={styles.priceLabel}>{t("Fiyat", "Price")}</Text>
            <TextInput
              testID="field-price"
              accessibilityLabel={t("Fiyat", "Price")}
              value={price}
              onChangeText={onPrice}
              placeholder="1.249 TL"
              placeholderTextColor={Theme.muted}
              maxLength={30}
              editable={!disabled}
              autoFocus={focusNext}
              keyboardType="numbers-and-punctuation"
              maxFontSizeMultiplier={MaxScale.chrome}
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => oldPriceInput.current?.focus()}
              style={styles.priceInput}
            />
          </View>
          <View style={styles.priceField}>
            <Text style={styles.priceLabel}>
              {t("Eski fiyat", "Old price")}
            </Text>
            <TextInput
              ref={oldPriceInput}
              testID="field-old-price"
              accessibilityLabel={t("Eski fiyat", "Old price")}
              value={oldPrice}
              onChangeText={onOldPrice}
              placeholder="1.599 TL"
              placeholderTextColor={Theme.muted}
              maxLength={30}
              editable={!disabled}
              keyboardType="numbers-and-punctuation"
              maxFontSizeMultiplier={MaxScale.chrome}
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => {
                if (next) go(next, true);
              }}
              style={styles.priceInput}
            />
          </View>
        </View>
      ) : field ? (
        <>
          <TextInput
            key={field.id}
            testID={field.testID}
            accessibilityLabel={field.tab}
            value={field.value}
            onChangeText={field.onChange}
            placeholder={field.placeholder}
            placeholderTextColor={Theme.muted}
            maxLength={field.maxLength}
            editable={!disabled}
            autoFocus={focusNext}
            maxFontSizeMultiplier={MaxScale.chrome}
            returnKeyType={next && next !== "font" ? "next" : "done"}
            submitBehavior={
              next && next !== "font" ? "submit" : "blurAndSubmit"
            }
            onSubmitEditing={() => {
              if (next) go(next, true);
            }}
            style={styles.input}
          />
          {field.ideas.length > 0 && (
            <ChipRow<string>
              label={field.ideasLabel}
              options={field.ideas.map((item) => ({
                value: item,
                label: item,
              }))}
              value={null}
              onChange={field.onChange}
              disabled={disabled}
            />
          )}
          {tab === "headline" && onAskAi && (
            <View style={styles.aiRow}>
              <Button
                plain
                testID="ai-suggest"
                label={t(
                  "Apple Intelligence ile öner",
                  "Suggest with Apple Intelligence",
                )}
                badge={aiBadge}
                disabled={disabled}
                onPress={onAskAi}
              />
            </View>
          )}
        </>
      ) : (
        <ChipRow<FontStyle>
          label={t("Yazı tipi", "Type")}
          options={FONT_STYLES.map((item) => ({
            value: item.id,
            label: t(item.tr, item.en),
          }))}
          value={fontStyle ?? defaultFontStyle}
          // The template's own family is stored as null, so a later template
          // change keeps following its default.
          onChange={(value) =>
            onFontStyle(value === defaultFontStyle ? null : value)
          }
          testIDFor={(value) => "font-" + value}
          labelStyleFor={(value) =>
            FONT_SAMPLE_FAMILY[value]
              ? {
                  fontFamily: FONT_SAMPLE_FAMILY[value],
                  fontSize: Math.round(15 * FONT_SIZE_FACTOR[value]),
                }
              : undefined
          }
          disabled={disabled}
        />
      )}
      {!!note && (
        <Text
          testID={droppedNote ? "dropped-note" : undefined}
          accessibilityLiveRegion="polite"
          numberOfLines={3}
          style={[styles.note, styles.gutter]}
        >
          {note}
        </Text>
      )}
    </ScrollView>
  );
}

type FieldSpec = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  maxLength: number;
  testID: string;
  tab: string;
};

/**
 * The single flow's Metin panel (Vitrin): the four texts at once in a 2x2
 * grid (stacked at full width while the keyboard is up). A field is a small
 * tracked caps label over an ink underline; the focused one takes the accent
 * fill. An ink bar above the keyboard names the focused field and has an
 * accent "Bitti". The label taps keep the ids of the old tabs
 * (text-tab-headline, text-tab-price) and focus the field.
 *
 * Every field has its OWN InputAccessoryView with its own nativeID: iOS
 * (RCTInputAccessoryComponentView.didMoveToWindow) hands an accessory to the
 * first input with a matching id, once, so a shared id would serve only the
 * first field. The accessories are rendered from the same list as the inputs,
 * in the same parent, so a field and its bar mount and unmount together.
 */
function TextFields({
  fields,
  price,
  onPrice,
  oldPrice,
  onOldPrice,
  note,
  space,
  stacked,
  disabled,
  onFocusChange,
  extras,
}: {
  onFocusChange?: (name: string | null) => void;
  /** Campaign chips at the top of the grid (hidden while the keyboard stacks the fields). */
  extras?: ReactNode;
  fields: FieldSpec[];
  price: string;
  onPrice: (value: string) => void;
  oldPrice: string;
  onOldPrice: (value: string) => void;
  note: string;
  space: number;
  stacked: boolean;
  disabled: boolean;
}) {
  const t = useT();
  const upper = useUpper();
  // Price and old price share a row; past this text size they stack.
  const { fontScale } = useWindowDimensions();
  const splitPrice = fontScale <= 1.3;
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const refs = useRef<Record<string, ComponentRef<typeof TextInput> | null>>(
    {},
  );
  const rowY = useRef<Record<string, number>>({});
  const [focused, setFocused] = useState<string | null>(null);
  const doneId = useInputAccessoryIds();
  const [name, badge, cta] = fields;
  const priceField: FieldSpec = {
    value: price,
    onChange: onPrice,
    placeholder: t("₺1.249", "$49"),
    maxLength: 30,
    testID: "field-price",
    tab: t("Fiyat", "Price"),
  };
  const oldPriceField: FieldSpec = {
    value: oldPrice,
    onChange: onOldPrice,
    placeholder: t("₺1.599", "$62"),
    maxLength: 30,
    testID: "field-old-price",
    tab: t("Eski fiyat", "Old price"),
  };
  const order = [
    name.testID,
    priceField.testID,
    oldPriceField.testID,
    badge.testID,
    cta.testID,
  ];
  const fieldList = [name, priceField, oldPriceField, badge, cta];
  const focusedName = fieldList.find((f) => f.testID === focused)?.tab;
  useEffect(() => {
    onFocusChange?.(focusedName ?? null);
  }, [focusedName, onFocusChange]);
  // QA only: does the panel remount between taps (field ids only, no text).
  useEffect(() => {
    if (QA_DIAG) diag("fields:mount");
    return () => {
      if (QA_DIAG) diag("fields:unmount");
    };
  }, []);

  function input(field: FieldSpec, numeric = false) {
    const index = order.indexOf(field.testID),
      nextId = order[index + 1],
      on = focused === field.testID;
    return (
      <Pressable
        accessible={false}
        disabled={disabled}
        onPressIn={() => {
          if (QA_DIAG) diag("field:pressIn box " + field.testID);
        }}
        onPress={() => refs.current[field.testID]?.focus()}
        style={[styles.fieldBox, on && styles.fieldBoxOn]}
      >
        <Pressable
          testID={
            field.testID === "field-headline"
              ? "text-tab-headline"
              : field.testID === "field-price"
                ? "text-tab-price"
                : undefined
          }
          accessible={false}
          disabled={disabled}
          onPressIn={() => {
            if (QA_DIAG) diag("field:pressIn label " + field.testID);
          }}
          onPress={() => refs.current[field.testID]?.focus()}
        >
          <Text
            maxFontSizeMultiplier={MaxScale.chrome}
            style={[styles.fieldLabel, on && { color: Theme.onAccent }]}
          >
            {upper(field.tab)}
          </Text>
        </Pressable>
        <TextInput
          ref={(node) => {
            refs.current[field.testID] = node;
          }}
          testID={field.testID}
          accessibilityLabel={field.tab}
          value={field.value}
          onChangeText={field.onChange}
          placeholder={field.placeholder}
          placeholderTextColor={on ? Theme.text : Theme.muted}
          selectionColor={Theme.text}
          maxLength={field.maxLength}
          editable={!disabled}
          keyboardType={numeric ? "numbers-and-punctuation" : "default"}
          returnKeyType={nextId ? "next" : "done"}
          submitBehavior={nextId ? "submit" : "blurAndSubmit"}
          onSubmitEditing={() => {
            if (nextId) refs.current[nextId]?.focus();
          }}
          inputAccessoryViewID={doneId(field.testID)}
          onFocus={() => {
            if (QA_DIAG) diag("field:focus " + field.testID);
            setFocused(field.testID);
            scroll.current?.scrollTo({
              y: Math.max(0, (rowY.current[field.testID] ?? 0) - Space.s),
              animated: true,
            });
          }}
          onBlur={() => {
            if (QA_DIAG) diag("field:blur " + field.testID);
            setFocused((now) => (now === field.testID ? null : now));
          }}
          maxFontSizeMultiplier={MaxScale.chrome}
          style={[styles.fieldInput, on && styles.fieldInputFocus]}
        />
      </Pressable>
    );
  }

  const cell = (f: FieldSpec, numeric = false, half = !stacked) => (
    <View
      key={f.testID}
      style={{ width: half ? "47.5%" : "100%" }}
      onLayout={(event) => {
        rowY.current[f.testID] = event.nativeEvent.layout.y;
      }}
    >
      {input(f, numeric)}
    </View>
  );

  return (
    <ScrollView
      ref={scroll}
      style={{ maxHeight: space }}
      contentContainerStyle={[styles.fieldsTool, styles.fieldGrid]}
      // No keyboardDismissMode on purpose: "on-drag" would close the keyboard
      // (and re-lay-out the whole editor) the moment someone scrolls to reach
      // another stacked field. The keyboard closes with Bitti, the Return
      // chain, or a tap on the stage (create.tsx), never from a tap inside
      // this panel: "always" keeps ScrollView from blurring the focused input
      // when a tap lands on a label, a gap or anything no child handles.
      keyboardShouldPersistTaps="always"
      onTouchStart={(event) => {
        // QA only: which element took the touch (ids and numbers, no text).
        if (!QA_DIAG) return;
        const n = event.nativeEvent;
        const hit = Object.entries(refs.current).find(
          ([, node]) => node && findNodeHandle(node) === n.target,
        )?.[0];
        diag("fields:touch", {
          x: Math.round(n.pageX),
          y: Math.round(n.pageY),
          hit: hit ?? "other:" + n.target,
          focused: !!TextInput.State.currentlyFocusedInput(),
        });
      }}
    >
      {!stacked && !!extras && <View style={{ width: "100%" }}>{extras}</View>}
      {cell(name, false, false)}
      {cell(priceField, true, splitPrice)}
      {cell(oldPriceField, true, splitPrice)}
      {cell(badge)}
      {cell(cta)}
      {!!note && (
        <Text
          testID="dropped-note"
          accessibilityLiveRegion="polite"
          style={[styles.note, { width: "100%" }]}
        >
          {note}
        </Text>
      )}
      {fieldList.map((field) => (
        <InputAccessoryView
          key={field.testID}
          nativeID={doneId(field.testID)}
          style={INERT_ACCESSORY_HOST}
        >
          <View style={styles.doneBar}>
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={MaxScale.chrome}
              style={styles.doneName}
            >
              {field.tab}
            </Text>
            <Pressable
              testID={"done-" + field.testID}
              accessibilityRole="button"
              accessibilityLabel={t("Bitti", "Done")}
              onPress={() => Keyboard.dismiss()}
              style={styles.doneButton}
            >
              <Text style={styles.doneButtonText}>{t("Bitti", "Done")}</Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      ))}
    </ScrollView>
  );
}

/** "Mixkit Summer.m4a" → "Mixkit Summer". */
const musicTitle = (name: string) => name.replace(/\.[a-z0-9]{1,5}$/i, "");

export function MusicPanel({
  music,
  onPick,
  onRemove,
  disabled,
}: {
  music: { name: string } | null;
  onPick: () => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  const t = useT();
  return (
    <View style={[styles.panel, styles.padded]}>
      <View style={styles.musicRow}>
        <Icon
          name="music.note"
          size={22}
          color={music ? Theme.text : Theme.muted}
        />
        <View style={{ flex: 1 }}>
          <Text
            numberOfLines={1}
            ellipsizeMode="middle"
            style={styles.musicName}
          >
            {music ? musicTitle(music.name) : t("Müzik yok", "No music")}
          </Text>
          <Text style={styles.note}>
            {music
              ? t(
                  "Yalnızca kullanma hakkın olan müziği ekle.",
                  "Only add music you have the rights to use.",
                )
              : t(
                  "Dosyalar'dan bir ses dosyası seç, en çok 50 MB. Yalnızca kullanma hakkın olan müziği ekle.",
                  "Choose an audio file from Files, up to 50 MB. Only add music you have the rights to use.",
                )}
          </Text>
        </View>
      </View>
      <View style={styles.buttons}>
        <Button
          icon={music ? undefined : "doc"}
          label={
            music
              ? t("Müziği değiştir", "Change music")
              : t("Müzik dosyası seç", "Choose a music file")
          }
          disabled={disabled}
          onPress={onPick}
        />
        {music && (
          <Button
            plain
            label={t("Kaldır", "Remove")}
            accessibilityLabel={t("Müziği kaldır", "Remove the music")}
            disabled={disabled}
            onPress={onRemove}
          />
        )}
      </View>
    </View>
  );
}

const fontName = (id: FontStyle, t: (tr: string, en: string) => string) => {
  const item = FONT_STYLES.find((f) => f.id === id);
  return item ? t(item.tr, item.en) : id;
};

const RATIO_NAMES: Record<AspectRatio, { tr: string; en: string }> = {
  "9:16": { tr: "Dikey", en: "Vertical" },
  "4:5": { tr: "Akış", en: "Feed" },
  "1:1": { tr: "Kare", en: "Square" },
};

/**
 * Format: shape, then the one still action, then where it goes and the
 * quality. The image choices (last frame, more backdrops, marketplace
 * sizes) open from "Görsel olarak kaydet".
 */
export function FormatPanel({
  ratio,
  onRatio,
  onSaveStill,
  saveImageBadge,
  preset,
  onPreset,
  quality,
  onQuality,
  proNote,
  disabled,
  textRisk = false,
  qualityByPreset = false,
}: {
  ratio: AspectRatio;
  onRatio: (value: AspectRatio) => void;
  /** Opens the still choices; left out when the build cannot save stills. */
  onSaveStill?: () => void;
  /** "PRO" when saving needs Pro. */
  saveImageBadge?: string;
  preset: ExportPreset;
  onPreset: (id: ExportPreset) => void;
  quality: ProductQuality;
  onQuality: (value: ProductQuality) => void;
  /** Shown to people without Pro. */
  proNote: string | null;
  disabled: boolean;
  /** Pazaryeri with price, old price or label filled: one quiet line. */
  textRisk?: boolean;
  /** The quality follows the preset (the user has not picked one). */
  qualityByPreset?: boolean;
}) {
  const space = usePanelSpace();
  const t = useT(),
    info = EXPORT_PRESETS.find((item) => item.id === preset);
  // The safe-area sentence is true only for vertical social video.
  const safeNote =
    preset === "reels" && ratio === "9:16"
      ? " " +
        t(
          "Dikey videoda yazılar Reels ve TikTok düğmelerinin altında kalmaz.",
          "In vertical video, texts stay clear of the Reels and TikTok buttons.",
        )
      : "";
  return (
    <ScrollView
      style={{ maxHeight: space }}
      contentContainerStyle={[styles.panel, { paddingBottom: Space.l }]}
    >
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
          testIDFor={(value) => "ratio-" + value.replace(":", "x")}
        />
        {onSaveStill && (
          <View style={[styles.buttons, styles.gutter]}>
            <Button
              testID="save-image"
              icon="photo"
              label={t("Görsel olarak kaydet", "Save as image")}
              badge={saveImageBadge}
              disabled={disabled}
              onPress={onSaveStill}
            />
          </View>
        )}
      </View>
      <View style={styles.group}>
        <PanelLabel>
          {t("Nerede paylaşacaksın?", "Where will you post it?")}
        </PanelLabel>
        <ChipRow
          label={t("Nerede paylaşacaksın?", "Where will you post it?")}
          options={EXPORT_PRESETS.map((item) => ({
            value: item.id,
            label: t(item.tr, item.en),
          }))}
          value={preset}
          onChange={onPreset}
          disabled={disabled}
          testIDFor={(id) =>
            id === "trendyol" ? "dest-marketplace" : "dest-social"
          }
        />
        {info && (
          <Text style={[styles.note, styles.gutter]}>
            {t(info.noteTr, info.noteEn) + safeNote}
          </Text>
        )}
        {textRisk && (
          <Text
            testID="marketplace-text-hint"
            style={[styles.note, styles.gutter]}
          >
            {t(
              "Trendyol görsellerde fiyat ve indirim yazısını reddediyor; ürün sayfası videosunda boş bırakmak daha güvenli.",
              "Trendyol rejects price and discount text on images; leaving it empty is safer for a product page video.",
            )}
          </Text>
        )}
      </View>
      <View style={styles.group}>
        <PanelLabel>{t("Kalite", "Quality")}</PanelLabel>
        <ChipRow<ProductQuality>
          label={t("Kalite", "Quality")}
          options={[
            { value: "720p", label: "720p" },
            { value: "1080p", label: "1080p" },
          ]}
          value={quality}
          onChange={onQuality}
          disabled={disabled}
        />
        {preset === "trendyol" && qualityByPreset && (
          <Text style={[styles.note, styles.gutter]}>
            {t(
              "Trendyol 720×1280 önerir; bu yüzden 720p ile başlar.",
              "Trendyol recommends 720×1280, so it starts at 720p.",
            )}
          </Text>
        )}
        {proNote && <Text style={[styles.note, styles.gutter]}>{proNote}</Text>}
      </View>
    </ScrollView>
  );
}

/** Selection ring: 2 pt line with a 2 pt gap around the poster. */
const RING = 2,
  RING_GAP = 2;
/** Backdrop tile: 3:4, like the bundled 300x400 thumbnails. */
const BACKDROP_WIDTH = 75,
  BACKDROP_HEIGHT = 100;

const styles = StyleSheet.create({
  // Section gap (between groups) > group gap (label, control, note) > row gap.
  panel: { gap: Space.l, paddingTop: Space.s },
  group: { gap: Space.s },
  padded: { paddingHorizontal: Space.gutter },
  gutter: { paddingHorizontal: Space.gutter },
  cards: {
    gap: Space.s,
    paddingHorizontal: Space.gutter,
    paddingBottom: Space.xs,
  },
  card: { gap: Space.s },
  ring: {
    padding: RING_GAP,
    borderWidth: RING,
    borderColor: "transparent",
    alignSelf: "flex-start",
  },
  poster: {
    aspectRatio: 9 / 16,
    overflow: "hidden",
    borderRadius: Radius.m,
    backgroundColor: Theme.raised,
  },
  cardText: { gap: 2, paddingHorizontal: RING },
  cardName: { fontSize: 15, lineHeight: 20, color: Theme.text },
  cardNameSelected: { fontWeight: "600" },
  cardDuration: {
    fontSize: 13,
    lineHeight: 18,
    color: Theme.muted,
    fontVariant: ["tabular-nums"],
  },
  swatches: {
    gap: Space.s,
    paddingHorizontal: Space.gutter - Space.xs,
    paddingBottom: Space.s,
  },
  swatchCell: {
    alignItems: "center",
    gap: 6,
    padding: Space.xs,
    borderRadius: Radius.m,
  },
  swatchRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  swatch: {
    width: 54,
    height: 54,
    borderRadius: 27,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.line,
  },
  swatchDot: {
    position: "absolute",
    top: 20,
    left: 20,
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  swatchName: { fontSize: 13, lineHeight: 18, color: Theme.muted },
  // Editor panels: rows sized so a panel fits under a large preview.
  // Bottom room so the last row is never cut by the panel's edge; the panel
  // scrolls when its content is taller than the cap.
  compactPanel: { gap: Space.s, paddingTop: Space.xs, paddingBottom: Space.l },
  typeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: Space.gutter,
    gap: Space.xs,
  },
  menuChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: 150,
    minHeight: 36,
    paddingHorizontal: Space.m,
    borderRadius: 999,
    backgroundColor: Theme.raised,
  },
  menuChipText: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "600",
    color: Theme.text,
  },
  tiles: { gap: Space.s, paddingHorizontal: Space.gutter },
  tile: { gap: Space.xs },
  tileRing: {
    ...StyleSheet.absoluteFill,
    borderRadius: Radius.s,
    borderWidth: 2,
    borderColor: Theme.text,
  },
  tileName: { fontSize: 13, lineHeight: 16, color: Theme.muted },
  tileNameSelected: { color: Theme.text, fontWeight: "600" },
  // Backdrop names: two centred lines at a fixed height, never cut.
  tileNameTwo: { height: 32, textAlign: "center" },
  backdropThumb: {
    width: BACKDROP_WIDTH,
    height: BACKDROP_HEIGHT,
    borderRadius: Radius.s,
    overflow: "hidden",
    backgroundColor: Theme.raised,
  },
  smallSwatches: {
    alignItems: "center",
    gap: Space.m,
    paddingHorizontal: Space.gutter - 4,
  },
  smallSwatchGroup: { flexDirection: "row", gap: Space.xs },
  smallSwatchRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  smallSwatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.line,
  },
  smallSwatchDot: {
    position: "absolute",
    top: 12,
    left: 12,
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  sceneEntry: { flexDirection: "row", gap: Space.s },
  templateHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.m,
    paddingHorizontal: Space.gutter,
  },
  categoryPull: {
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 44,
  },
  categoryText: { flexShrink: 1, fontSize: 15, color: Theme.text },
  hidden: { display: "none" },
  swatchLabel: { fontSize: 13, color: Theme.muted, marginRight: Space.xs },
  ownStepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s,
    minHeight: 44,
    paddingHorizontal: Space.gutter,
  },
  priceRow: {
    flexDirection: "row",
    gap: Space.s,
    paddingHorizontal: Space.gutter,
  },
  priceField: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s,
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: Radius.m,
    backgroundColor: Theme.raised,
  },
  priceLabel: { fontSize: 13, color: Theme.muted },
  priceInput: { flex: 1, fontSize: 17, color: Theme.text, paddingVertical: 11 },
  fieldsTool: { paddingVertical: Space.xs, paddingHorizontal: Space.s },
  fieldGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: Space.s,
  },
  fieldBox: {
    gap: 2,
    minHeight: 52,
    borderBottomWidth: 2,
    borderBottomColor: Theme.text,
    paddingBottom: 5,
  },
  fieldBoxOn: {
    backgroundColor: Theme.accent,
    borderBottomWidth: 3,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    paddingHorizontal: 8,
    marginHorizontal: -8,
    paddingTop: 4,
  },
  fieldLabel: {
    fontFamily: Face.extra,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    letterSpacing: 1.1,
    color: Theme.muted,
  },
  fieldInput: {
    minHeight: 30,
    fontFamily: Face.bold,
    fontSize: 17,
    fontWeight: "700",
    color: Theme.text,
    paddingVertical: 0,
  },
  fieldInputFocus: {},
  doneBar: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: Space.gutter,
    paddingRight: Space.s,
    backgroundColor: Theme.text,
  },
  doneName: {
    flex: 1,
    fontFamily: Face.extra,
    fontSize: 14,
    fontWeight: "800",
    color: Theme.bg,
  },
  doneButton: {
    minWidth: 84,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.accent,
  },
  doneButtonText: {
    fontFamily: Face.extra,
    fontSize: 14,
    fontWeight: "800",
    color: Theme.onAccent,
  },
  textTool: { gap: Space.s, paddingTop: Space.xs, paddingBottom: Space.s },
  textTabs: { gap: Space.xs, paddingHorizontal: Space.gutter },
  textTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 36,
    paddingHorizontal: Space.m,
    borderRadius: 999,
    backgroundColor: Theme.raised,
  },
  textTabLabel: { fontSize: 13, fontWeight: "600", color: Theme.text },
  textTabDot: { width: 6, height: 6, borderRadius: 3 },
  ownThumb: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.line,
  },
  ownControls: { gap: Space.xs },
  ownRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.m,
    paddingLeft: Space.gutter,
  },
  ownLabel: { fontSize: 13, color: Theme.muted },
  stepper: { flexDirection: "row", alignItems: "center", gap: Space.xs },
  stepButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.raised,
  },
  stepValue: {
    minWidth: 44,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "600",
    color: Theme.text,
    fontVariant: ["tabular-nums"],
  },
  wrap: { flexWrap: "wrap" },
  input: {
    fontSize: 17,
    minHeight: 48,
    color: Theme.text,
    backgroundColor: Theme.raised,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: Radius.m,
    marginHorizontal: Space.gutter,
  },
  aiRow: { flexDirection: "row", paddingHorizontal: Space.gutter },
  note: { fontSize: 13, lineHeight: 18, color: Theme.muted },
  musicRow: { flexDirection: "row", alignItems: "center", gap: Space.m },
  musicName: { fontSize: 17, fontWeight: "600", color: Theme.text },
  buttons: { flexDirection: "row", gap: Space.s, paddingBottom: Space.s },
});
