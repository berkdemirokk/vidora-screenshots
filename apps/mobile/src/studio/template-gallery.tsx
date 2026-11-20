/**
 * The template gallery: Home's shelves ("Yeni", "İndirim", "Tanıtım") of
 * recipe variant cards, and the editor's Şablon panel in recipe mode (the
 * variants of the same recipe plus the way back to the classic templates).
 *
 * Cards are plain Pressables (never Link asChild: its Slot drops function
 * styles and the tile ends up 0x0, docs/qa/DERSLER.md). Posters are drawn
 * lazily: nothing until Home says the gallery may draw (`armed`), then only
 * the cards a shelf has scrolled near, one frame at a time in the shared
 * renderer queue. A neutral surface shows until a poster is there.
 */
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import {
  GALLERY_CARD,
  galleryShelves,
  variantsOfRecipe,
  type GalleryCard,
} from "../gallery";
import { pruneGalleryPosters, useGalleryPoster } from "../gallery-posters";
import { usePanelSpace } from "./controls";
import type { RecipeVariant } from "../recipes";
import {
  Face,
  MaxScale,
  Press,
  Radius,
  Space,
  Theme,
  Type,
  spokenDuration,
  tap,
  useT,
} from "../ui";

/** Card width on Home; the poster is 9:16 above the texts. */
const CARD_WIDTH = GALLERY_CARD.width;
const CARD_GAP = GALLERY_CARD.gap;
/** Cards past the last visible one that may already draw their poster. */
const LOOK_AHEAD = 2;

/** "1-5 fotoğraf", or "2 fotoğraf" when both limits are the same. */
function usePhotoRange() {
  const t = useT();
  return useCallback(
    (min: number, max: number) =>
      min === max
        ? t(`${min} fotoğraf`, `${min} photos`)
        : t(`${min}-${max} fotoğraf`, `${min}-${max} photos`),
    [t],
  );
}

const GalleryCardView = memo(function GalleryCardView({
  card,
  draw,
  onPick,
  onSample,
}: {
  card: GalleryCard;
  /** True once this card may draw its poster. */
  draw: boolean;
  onPick: (variant: RecipeVariant) => void;
  onSample: (variant: RecipeVariant) => void;
}) {
  const t = useT(),
    photoRange = usePhotoRange();
  const { variant, recipe } = card;
  const uri = useGalleryPoster(variant, draw);
  const name = t(recipe.tr, recipe.en),
    look = t(variant.tr, variant.en),
    photos = photoRange(card.minPhotos, card.maxPhotos);
  return (
    <View style={styles.card}>
      <Pressable
        testID={"gallery-" + variant.id}
        accessibilityRole="button"
        accessibilityLabel={[
          name,
          look,
          photos,
          spokenDuration(t, card.seconds),
        ].join(", ")}
        accessibilityHint={t(
          "Fotoğraflarını seç, video hazırlansın.",
          "Choose your photos to make the video.",
        )}
        onPress={() => onPick(variant)}
        style={({ pressed }) => [styles.cardPress, pressed && Press.media]}
      >
        <View style={styles.poster}>
          {uri ? (
            <Image
              accessible={false}
              accessibilityIgnoresInvertColors
              source={{ uri }}
              resizeMode="cover"
              style={StyleSheet.absoluteFill}
            />
          ) : null}
        </View>
        <View style={styles.texts}>
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={MaxScale.chrome}
            style={styles.name}
          >
            {name}
          </Text>
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={MaxScale.chrome}
            style={styles.detail}
          >
            {look}
          </Text>
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={MaxScale.chrome}
            style={styles.detail}
          >
            {photos + " · " + card.clock}
          </Text>
        </View>
      </Pressable>
      {/* Recipes that need 2 photos (Önce/Sonra) never start on the one
          sample photo. */}
      {card.minPhotos <= 1 ? (
      <Pressable
        testID={"gallery-sample-" + variant.id}
        accessibilityRole="button"
        accessibilityLabel={t("Örnekle dene", "Try a sample") + ": " + name + ", " + look}
        onPress={() => onSample(variant)}
        hitSlop={{ top: 4, bottom: 4 }}
        style={({ pressed }) => [styles.sample, pressed && Press.text]}
      >
        <Text maxFontSizeMultiplier={MaxScale.chrome} style={styles.sampleText}>
          {t("Örnekle dene", "Try a sample")}
        </Text>
      </Pressable>
      ) : null}
    </View>
  );
});

function Shelf({
  title,
  cards,
  armed,
  onPick,
  onSample,
}: {
  title: string;
  cards: GalleryCard[];
  armed: boolean;
  onPick: (variant: RecipeVariant) => void;
  onSample: (variant: RecipeVariant) => void;
}) {
  const { width } = useWindowDimensions();
  const step = CARD_WIDTH + CARD_GAP;
  // How many cards may draw: the ones on screen plus a few ahead. It only
  // grows, so a poster once asked for is never dropped.
  const [reach, setReach] = useState(
    () => Math.ceil(width / step) + LOOK_AHEAD - 1,
  );
  const reachNow = useRef(reach);
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = event.nativeEvent.contentOffset.x;
    const next = Math.ceil((x + width) / step) + LOOK_AHEAD - 1;
    if (next > reachNow.current) {
      reachNow.current = next;
      setReach(next);
    }
  };
  return (
    <View style={styles.shelf}>
      <Text
        accessibilityRole="header"
        maxFontSizeMultiplier={MaxScale.chrome}
        style={styles.shelfTitle}
      >
        {title}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        onScroll={onScroll}
        scrollEventThrottle={100}
      >
        {cards.map((card, i) => (
          <GalleryCardView
            key={card.variant.id}
            card={card}
            draw={armed && i < reach}
            onPick={onPick}
            onSample={onSample}
          />
        ))}
      </ScrollView>
    </View>
  );
}

/**
 * Home's shelves. The first shelf is on Home's first screen and draws its
 * posters right after mount; `armed` lets the other shelves draw (Home turns
 * it on when the seller scrolls). `bottomInset` keeps the last shelf clear of
 * the tab bar. Memoised: Home re-renders never redraw the 30 cards (the
 * callbacks Home passes are stable).
 */
export const TemplateGallery = memo(function TemplateGallery({
  armed,
  bottomInset,
  onPick,
  onSample,
}: {
  armed: boolean;
  bottomInset: number;
  onPick: (variant: RecipeVariant) => void;
  onSample: (variant: RecipeVariant) => void;
}) {
  const t = useT();
  // Older posters go once the gallery is on screen (never during render).
  useEffect(() => {
    pruneGalleryPosters();
  }, []);
  return (
    <View
      testID="template-gallery"
      style={[styles.gallery, { paddingBottom: bottomInset }]}
    >
      {galleryShelves().map((shelf, i) => (
        <Shelf
          key={shelf.id}
          title={t(shelf.tr, shelf.en)}
          cards={shelf.cards}
          armed={i === 0 || armed}
          onPick={onPick}
          onSample={onSample}
        />
      ))}
    </View>
  );
});

/** Height of the editor panel's switch row ("Klasik şablonlar"). */
export const VARIANT_SWITCH_HEIGHT = 44 + Space.xs;

/**
 * The Şablon panel in recipe mode: the five looks (palette and type) of the
 * same recipe, and "Klasik şablonlar" to go back to the three templates.
 */
export function VariantChoicePanel({
  variant,
  onVariant,
  onClassic,
  disabled,
  header,
  headerHeight = 0,
}: {
  variant: RecipeVariant;
  onVariant: (id: string) => void;
  onClassic: () => void;
  disabled: boolean;
  /** The photo strip, shown above the looks; `headerHeight` is its height. */
  header?: ReactNode;
  headerHeight?: number;
}) {
  const t = useT(),
    space = usePanelSpace(),
    { fontScale } = useWindowDimensions();
  const looks = variantsOfRecipe(variant.recipe.id);
  // The tiles shrink so strip, looks and the switch row fit the panel.
  const caption = 16 * Math.min(fontScale, MaxScale.chrome) + Space.xs,
    room =
      space === undefined
        ? undefined
        : space - headerHeight - VARIANT_SWITCH_HEIGHT - caption - Space.m,
    width =
      room === undefined
        ? LOOK_WIDTH
        : Math.max(40, Math.min(LOOK_WIDTH, Math.floor((room * 9) / 16)));
  return (
    <View>
      {header}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.looks}
        accessibilityRole="radiogroup"
        accessibilityLabel={t(variant.recipe.tr, variant.recipe.en)}
      >
        {looks.map((look) => (
          <LookTile
            key={look.id}
            look={look}
            width={width}
            selected={look.id === variant.id}
            disabled={disabled}
            onPress={() => {
              if (look.id !== variant.id) tap("select");
              onVariant(look.id);
            }}
          />
        ))}
      </ScrollView>
      <Pressable
        testID="template-classic"
        accessibilityRole="button"
        disabled={disabled}
        onPress={onClassic}
        style={({ pressed }) => [
          styles.switchRow,
          pressed && Press.text,
          disabled && { opacity: 0.4 },
        ]}
      >
        <Text maxFontSizeMultiplier={MaxScale.chrome} style={styles.switchText}>
          {t("Klasik şablonlar", "Classic templates")}
        </Text>
      </Pressable>
    </View>
  );
}

/** The editor's way back from a classic template to the recipe it came from. */
export function RecipeReturn({
  variant,
  onPress,
  disabled,
}: {
  variant: RecipeVariant;
  onPress: () => void;
  disabled: boolean;
}) {
  const t = useT();
  const name = t(variant.recipe.tr, variant.recipe.en);
  return (
    <Pressable
      testID="template-recipe-return"
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.switchRow,
        pressed && Press.text,
        disabled && { opacity: 0.4 },
      ]}
    >
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={MaxScale.chrome}
        style={styles.switchText}
      >
        {t(`${name} şablonuna dön`, `Back to ${name}`)}
      </Text>
    </Pressable>
  );
}

const LOOK_WIDTH = 72;

function LookTile({
  look,
  width,
  selected,
  disabled,
  onPress,
}: {
  look: RecipeVariant;
  width: number;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const t = useT();
  // Sample posters of this look (the gallery's cached ones).
  const uri = useGalleryPoster(look, true);
  const name = t(look.tr, look.en);
  return (
    <Pressable
      testID={"variant-" + look.id}
      accessibilityRole="radio"
      accessibilityLabel={name}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.look,
        { width },
        pressed && Press.media,
        disabled && { opacity: 0.4 },
      ]}
    >
      <View
        style={[
          styles.lookPoster,
          { width, height: Math.round((width * 16) / 9) },
        ]}
      >
        {uri ? (
          <Image
            accessible={false}
            accessibilityIgnoresInvertColors
            source={{ uri }}
            resizeMode="cover"
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        {selected && <View style={styles.ring} />}
      </View>
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={MaxScale.chrome}
        style={[styles.lookName, selected && styles.lookNameOn]}
      >
        {name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  gallery: {
    backgroundColor: Theme.bg,
    paddingTop: Space.l,
    gap: Space.xl,
  },
  shelf: { gap: Space.s },
  shelfTitle: { ...Type.title, paddingHorizontal: Space.gutter },
  row: { paddingHorizontal: Space.gutter, gap: CARD_GAP },
  card: { width: CARD_WIDTH },
  cardPress: { width: CARD_WIDTH, gap: Space.s },
  poster: {
    width: CARD_WIDTH,
    height: Math.round((CARD_WIDTH * 16) / 9),
    borderRadius: Radius.m,
    overflow: "hidden",
    backgroundColor: Theme.surface,
  },
  texts: { gap: 1 },
  name: {
    fontFamily: Face.bold,
    fontWeight: "700",
    fontSize: 15,
    lineHeight: 20,
    color: Theme.text,
  },
  detail: {
    fontFamily: Face.medium,
    fontWeight: "500",
    fontSize: 13,
    lineHeight: 18,
    color: Theme.muted,
    fontVariant: ["tabular-nums"],
  },
  sample: { minHeight: 44, justifyContent: "center" },
  sampleText: {
    fontFamily: Face.bold,
    fontWeight: "700",
    fontSize: 13,
    lineHeight: 18,
    color: Theme.text,
    textDecorationLine: "underline",
  },
  looks: {
    flexDirection: "row",
    gap: Space.s,
    paddingHorizontal: Space.gutter,
    paddingTop: Space.xs,
    paddingBottom: Space.s,
  },
  look: { gap: Space.xs, alignItems: "center" },
  lookPoster: {
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
  lookName: {
    fontFamily: Face.bold,
    fontWeight: "700",
    fontSize: 13,
    lineHeight: 16,
    color: Theme.muted,
    textAlign: "center",
  },
  lookNameOn: { color: Theme.text, fontWeight: "800" },
  switchRow: {
    minHeight: 44,
    marginBottom: Space.xs,
    justifyContent: "center",
    alignItems: "center",
  },
  switchText: {
    fontFamily: Face.bold,
    fontWeight: "700",
    fontSize: 15,
    lineHeight: 20,
    color: Theme.text,
    textDecorationLine: "underline",
  },
});
