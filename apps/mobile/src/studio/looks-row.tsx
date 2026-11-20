import { memo, useEffect, useState, type ReactNode } from "react";
import { FlatList, Image, Pressable, StyleSheet, View } from "react-native";
import { Radius, Space, Theme, TileCaption, tap, useT } from "../ui";
import { LOOKS, type Look } from "../looks";
import { backdropById, type BackdropId } from "../backdrops";
import {
  TEMPLATES,
  paletteById,
  type FontStyle,
  type PaletteId,
  type TemplateId,
} from "../product-templates";
import { VIDEO_KINDS, type CategoryId } from "../product-catalog";
import {
  useLookPoster,
  useTemplatePoster,
  type PosterCopy,
} from "../sample-frames";
import { FILL, useListActive } from "./controls";

/** Wait before posters start, so the live preview is drawn first. */
const POSTER_DELAY_MS = 700;

/**
 * True a moment after mounting, and only while this list is the visible
 * one: the hidden mode draws nothing, so the visible one goes first.
 */
function useReady(): boolean {
  const active = useListActive();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!active) {
      setReady(false);
      return;
    }
    const timer = setTimeout(() => setReady(true), POSTER_DELAY_MS);
    return () => clearTimeout(timer);
  }, [active]);
  return ready;
}

/** The background a poster stands on while it is drawn. */
type StandIn = { backdrop: BackdropId | null; palette: PaletteId };

/**
 * One 9:16 card for the looks and the templates: the engine's poster over a
 * stand-in, an inset ink ring when selected, the name on up to two centred
 * lines under it.
 */
const PosterTile = memo(function PosterTile({
  width,
  name,
  hint,
  selected,
  disabled,
  onPress,
  testID,
  standIn,
  poster,
  gapBefore = 0,
}: {
  width: number;
  name: string;
  hint?: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
  testID: string;
  standIn: StandIn;
  /** The poster image, null until drawn. */
  poster: ReactNode;
  /** Extra space before the tile (start of another group). */
  gapBefore?: number;
}) {
  const height = (width * 16) / 9;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityLabel={name}
      accessibilityHint={hint}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={() => {
        if (!selected) tap("select");
        onPress();
      }}
      style={({ pressed }) => [
        styles.card,
        { width, marginLeft: gapBefore },
        pressed && { opacity: 0.8 },
        disabled && { opacity: 0.4 },
      ]}
    >
      <View style={[styles.poster, { width, height }]}>
        <StandInImage standIn={standIn} width={width} height={height} />
        {poster}
        {selected && <View style={styles.ring} />}
      </View>
      <TileCaption selected={selected}>{name}</TileCaption>
    </Pressable>
  );
});

function StandInImage({
  standIn,
  width,
  height,
}: {
  standIn: StandIn;
  width: number;
  height: number;
}) {
  if (standIn.backdrop)
    return (
      <Image
        accessible={false}
        source={backdropById(standIn.backdrop).thumb}
        resizeMode="cover"
        style={[FILL, { width, height }]}
      />
    );
  const palette = paletteById(standIn.palette);
  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={{ flex: 11, backgroundColor: palette.background.top }} />
      <View style={{ flex: 9, backgroundColor: palette.background.bottom }} />
    </View>
  );
}

function PosterImage({ uri }: { uri: string | null }) {
  return uri ? (
    <Image
      accessible={false}
      accessibilityIgnoresInvertColors
      source={{ uri }}
      resizeMode="cover"
      style={StyleSheet.absoluteFill}
    />
  ) : null;
}

function LookPoster(props: {
  look: Look;
  product: string;
  copy: PosterCopy;
  safeArea: "none" | "social";
}) {
  return (
    <PosterImage
      uri={useLookPoster(props.look, props.product, props.copy, props.safeArea)}
    />
  );
}

function TemplatePoster(props: {
  template: TemplateId;
  product: string;
  backdrop: BackdropId | null;
  palette: PaletteId;
  fontStyle: FontStyle | null;
  copy: PosterCopy;
  safeArea: "none" | "social";
}) {
  // The template's own cached sample poster shows at once (never a bare
  // backdrop); the seller's product replaces it when its poster is ready.
  const sample = useTemplatePoster(props.template, null, undefined, {
    priority: "idle",
  });
  return (
    <>
      <PosterImage uri={sample} />
      <PosterImage
        uri={useTemplatePoster(
          props.template,
          props.product,
          props.backdrop ? undefined : props.palette,
          {
            backdrop: props.backdrop,
            fontStyle: props.fontStyle ?? undefined,
            copy: props.copy,
            safeArea: props.safeArea,
            priority: "idle",
          },
        )}
      />
    </>
  );
}

/** Space between tiles in a row. */
const GAP = Space.s;

/** Looks: this category's first, then the rest after a small gap. */
export function orderedLooks(category: CategoryId): {
  looks: Look[];
  firstOther: number;
} {
  const mine = LOOKS.filter((look) => look.categories.includes(category)),
    rest = LOOKS.filter((look) => !look.categories.includes(category));
  return { looks: [...mine, ...rest], firstOther: mine.length };
}

/** Templates in video-kind order (stable); the kind goes to VoiceOver only. */
export function orderedTemplates() {
  const order = VIDEO_KINDS.map((kind) => kind.id as string);
  return [...TEMPLATES].sort(
    (a, b) => order.indexOf(a.kind) - order.indexOf(b.kind),
  );
}

/**
 * "Görünümler": curated looks drawn with the seller's product and texts,
 * this category's first. Posters start after the preview, one at a time.
 */
export function LooksList({
  category,
  product,
  copy,
  selected,
  onLook,
  disabled,
  width,
  safeArea = "none",
}: {
  category: CategoryId;
  product: string;
  /** Frozen for the visit by the caller. */
  copy: PosterCopy;
  selected: string | null;
  onLook: (look: Look) => void;
  disabled: boolean;
  width: number;
  safeArea?: "none" | "social";
}) {
  const t = useT(),
    ready = useReady();
  const { looks, firstOther } = orderedLooks(category);
  const index = looks.findIndex((look) => look.id === selected);
  const step = width + GAP;
  return (
    <FlatList
      horizontal
      data={looks}
      keyExtractor={(item) => item.id}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.list}
      initialNumToRender={7}
      windowSize={3}
      getItemLayout={(_, i) => ({
        length: step,
        offset: i * step + (i >= firstOther && firstOther > 0 ? Space.l : 0),
        index: i,
      })}
      initialScrollIndex={Math.max(0, index - 1)}
      accessibilityRole="radiogroup"
      accessibilityLabel={t("Görünümler", "Looks")}
      renderItem={({ item, index: i }) => (
        <View style={{ marginRight: GAP }}>
          <PosterTile
            width={width}
            name={t(item.tr, item.en)}
            selected={item.id === selected}
            disabled={disabled}
            testID={"look-" + item.id}
            onPress={() => onLook(item)}
            standIn={{ backdrop: item.backdrop, palette: item.palette }}
            gapBefore={i === firstOther && firstOther > 0 ? Space.l : 0}
            poster={
              ready ? (
                <LookPoster
                  look={item}
                  product={product}
                  copy={copy}
                  safeArea={safeArea}
                />
              ) : null
            }
          />
        </View>
      )}
    />
  );
}

/**
 * "Şablonlar": all ten templates, drawn on the seller's background, type and
 * texts. Choosing one changes only the template.
 */
export function TemplatesList({
  template,
  onTemplate,
  disabled,
  width,
  product,
  backdrop,
  palette,
  fontStyle,
  copy,
  safeArea = "none",
}: {
  template: TemplateId;
  onTemplate: (id: TemplateId) => void;
  disabled: boolean;
  width: number;
  product: string;
  /** null while an own photo or AI scene is the background. */
  backdrop: BackdropId | null;
  palette: PaletteId;
  fontStyle: FontStyle | null;
  copy: PosterCopy;
  safeArea?: "none" | "social";
}) {
  const t = useT(),
    ready = useReady();
  const items = orderedTemplates();
  const index = items.findIndex((item) => item.id === template);
  const step = width + GAP;
  return (
    <FlatList
      horizontal
      data={items}
      keyExtractor={(item) => item.id}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.list}
      getItemLayout={(_, i) => ({ length: step, offset: i * step, index: i })}
      initialScrollIndex={Math.max(0, index - 1)}
      accessibilityRole="radiogroup"
      accessibilityLabel={t("Şablonlar", "Templates")}
      renderItem={({ item }) => {
        const kind = VIDEO_KINDS.find((k) => k.id === item.kind);
        return (
          <View style={{ marginRight: GAP }}>
            <PosterTile
              width={width}
              name={t(item.tr, item.en)}
              hint={
                (kind ? t(kind.tr, kind.en) + ". " : "") +
                t(`${item.duration} sn`, `${item.duration} s`)
              }
              selected={item.id === template}
              disabled={disabled}
              testID={"template-" + item.id}
              onPress={() => onTemplate(item.id)}
              standIn={{ backdrop, palette }}
              poster={
                ready ? (
                  <TemplatePoster
                    template={item.id}
                    product={product}
                    backdrop={backdrop}
                    palette={palette}
                    fontStyle={fontStyle}
                    copy={copy}
                    safeArea={safeArea}
                  />
                ) : null
              }
            />
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: Space.gutter },
  card: { gap: Space.xs },
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
});
