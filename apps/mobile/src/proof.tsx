/**
 * Proof before promises: the bundled sample photo next to a frame the engine
 * made from it on the phone. Used on Home (before the first video) and at the
 * top of the paywall.
 *
 * Sized from the window, so both tiles have their final size on the first
 * frame and nothing below them moves. The pictures, labels and caption fade
 * in together once both pictures have loaded; if either fails the block is
 * left out, because an empty tile proves nothing.
 *
 * Run 14's blank photo tile was the old 1500 x 2000 photo (since replaced by
 * a 1080 x 1440 one) drawn at its intrinsic size from the tile's top-left
 * corner (its pixels matched the photo's top rows): the Image had no size of
 * its own. Both Images now get the tile's exact size.
 */
import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, View, useWindowDimensions } from "react-native";
import { Asset } from "expo-asset";
import sampleProduct from "../assets/sample-product.jpg";
import {
  POSTER_BACKDROP,
  canDrawPosters,
  useTemplatePosterState,
} from "./sample-frames";
import { diag } from "./diag";
import { Icon, Radius, Space, Theme, s, useT } from "./ui";
import { useReduceMotion } from "./studio/controls";

/** The photo is 3:4 and the frame 4:5; both get the same height. */
const PHOTO_RATIO = 3 / 4;
const FRAME_RATIO = 4 / 5;
const ARROW_GAP = 28;
/** Whatever has not loaded by then counts as failed. */
const TIMEOUT_MS = 12000;

type Load = "loading" | "ready" | "failed";

/** A local file URI for the bundled sample photo. */
function useSamplePhoto(onFail: () => void): string | null {
  const [uri, setUri] = useState<string | null>(null);
  const fail = useRef(onFail);
  fail.current = onFail;
  useEffect(() => {
    let live = true;
    Asset.fromModule(sampleProduct)
      .downloadAsync()
      .then((asset) => {
        const local = asset.localUri ?? asset.uri;
        if (!live) return;
        if (local) setUri(local);
        else fail.current();
      })
      .catch((error: unknown) => {
        diag("proof: sample photo could not be resolved", { error });
        if (live) fail.current();
      });
    return () => {
      live = false;
    };
  }, []);
  return uri;
}

export function ProofPair({
  maxHeight,
  width,
  editorial = false,
}: {
  /** Caps the tiles' height (the paywall keeps its plans in view). */
  maxHeight?: number;
  /** Row width; default the window minus the gutters. */
  width?: number;
  /** Home: two equal 9:16 tiles side by side, no arrow, quiet captions. */
  editorial?: boolean;
}) {
  const t = useT(),
    window = useWindowDimensions(),
    reduceMotion = useReduceMotion();
  const [photoLoad, setPhotoLoad] = useState<Load>("loading"),
    [frameLoad, setFrameLoad] = useState<Load>(() =>
      canDrawPosters() ? "loading" : "failed",
    );
  const photo = useSamplePhoto(() => setPhotoLoad("failed"));
  const { uri: frame, failed: frameGaveUp } = useTemplatePosterState(
    "showcase",
    null,
    undefined,
    {
      backdrop: POSTER_BACKDROP.showcase,
      ratio: editorial ? "9:16" : "4:5",
    },
  );
  // The poster hook has no tries left: leave now, not after the timeout.
  useEffect(() => {
    if (frameGaveUp) setFrameLoad((load) => (load === "loading" ? "failed" : load));
  }, [frameGaveUp]);

  // One timer for both pictures, started on mount.
  useEffect(() => {
    const timer = setTimeout(() => {
      setPhotoLoad((load) => (load === "loading" ? "failed" : load));
      setFrameLoad((load) => (load === "loading" ? "failed" : load));
    }, TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  const ready = photoLoad === "ready" && frameLoad === "ready";
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!ready) return;
    if (reduceMotion) fade.setValue(1);
    else
      Animated.timing(fade, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
  }, [ready, reduceMotion, fade]);

  if (photoLoad === "failed" || frameLoad === "failed") return null;

  const rowWidth = width ?? window.width - 2 * Space.gutter;
  const height = Math.round(
    Math.min(
      (rowWidth - ARROW_GAP) / (PHOTO_RATIO + FRAME_RATIO),
      maxHeight ?? Infinity,
    ),
  );
  const tileWidth = Math.floor((rowWidth - Space.m) / 2);
  const photoWidth = editorial
    ? tileWidth
    : Math.round(height * PHOTO_RATIO);
  const frameWidth = editorial
    ? tileWidth
    : Math.round(height * FRAME_RATIO);
  const tileHeight = editorial
    ? Math.round((tileWidth * 16) / 9)
    : height;
  const captionStyle = editorial ? s.footnote : s.headline;
  const shown = { opacity: fade };

  return (
    <View
      testID={ready ? "proof-ready" : "proof-loading"}
      accessible
      accessibilityLabel={t(
        "Solda örnek ürün fotoğrafı, sağda bu fotoğraftan telefonda hazırlanan video karesi. Ürün yeniden çizilmedi.",
        "On the left a sample product photo, on the right a video frame made from it on the phone. The product was not redrawn.",
      )}
      accessibilityState={{ busy: !ready }}
      style={styles.block}
    >
      <View style={[styles.row, editorial && { gap: Space.m }]}>
        <View style={[styles.column, { width: photoWidth }]}>
          <View style={[styles.tile, { width: photoWidth, height: tileHeight }, editorial && styles.tileEditorial]}>
            {photo && (
              <Animated.Image
                accessible={false}
                accessibilityIgnoresInvertColors
                source={{ uri: photo }}
                resizeMode="cover"
                style={[{ width: photoWidth, height: tileHeight }, shown]}
                onLoad={() => setPhotoLoad("ready")}
                onError={(event) => {
                  diag("proof: sample photo failed to load", {
                    error: event.nativeEvent.error,
                  });
                  setPhotoLoad("failed");
                }}
              />
            )}
          </View>
          {/* Labels stay in the layout (transparent) while loading. */}
          <Animated.Text style={[captionStyle, shown]}>
            {t("Örnek fotoğraf", "Sample photo")}
          </Animated.Text>
        </View>
        {!editorial && (
          <View style={[styles.arrow, { height }]}>
            <Icon name="arrow.right" size={15} color={Theme.muted} />
          </View>
        )}
        <View style={[styles.column, { width: frameWidth }]}>
          <View style={[styles.tile, { width: frameWidth, height: tileHeight }, editorial && styles.tileEditorial]}>
            {frame && (
              <Animated.Image
                accessible={false}
                accessibilityIgnoresInvertColors
                source={{ uri: frame }}
                resizeMode="cover"
                style={[{ width: frameWidth, height: tileHeight }, shown]}
                onLoad={() => setFrameLoad("ready")}
                onError={() => {
                  diag("proof: engine frame failed to load");
                  setFrameLoad("failed");
                }}
              />
            )}
          </View>
          <Animated.Text style={[captionStyle, shown]}>
            {t("Video karesi", "Video frame")}
          </Animated.Text>
        </View>
      </View>
      <Animated.Text style={[editorial ? s.footnote : s.muted, shown]}>
        {t(
          "Sağdaki kare bu fotoğraftan telefonda hazırlandı.",
          "The frame on the right was made on the phone from this photo.",
        )}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: Space.s },
  row: { flexDirection: "row", alignItems: "flex-start" },
  column: { gap: Space.s },
  tile: {
    borderRadius: Radius.l,
    overflow: "hidden",
    backgroundColor: Theme.surface,
  },
  // Centred in the gap and on the pictures' height (not the labels').
  tileEditorial: { borderRadius: Radius.xl },
  arrow: { width: ARROW_GAP, alignItems: "center", justifyContent: "center" },
});
