import { useEffect, useRef, useState, type ComponentRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Image,
  useWindowDimensions,
} from "react-native";
import {
  Button,
  Face,
  Icon,
  Press,
  Radius,
  Space,
  Theme,
  Type,
  displayMetrics,
  useT,
  type IconName,
} from "../ui";
import sampleProduct from "../../assets/sample-product.jpg";
import { useReduceMotion } from "./controls";
import { SINGLE_FLOW } from "../config";
import { POSTER_BACKDROP, useTemplatePoster } from "../sample-frames";
import { TEMPLATES, type TemplateId } from "../product-templates";
import { TemplateCard } from "./panels";

/**
 * First step of the flow, under the native inline title "Ürün videosu":
 * the photo button and the sample right away, three one-line hints, and
 * the templates so people see what they can make.
 */
type StartProps = {
  jumpToTemplates?: boolean;
  template: TemplateId;
  onTemplate: (id: TemplateId) => void;
  onChoosePhoto: () => void;
  onTrySample: () => void;
  busy: string | null;
};

export function StartView(props: StartProps) {
  return SINGLE_FLOW ? (
    <ViewfinderStart {...props} />
  ) : (
    <LegacyStartView {...props} />
  );
}

/**
 * Single-flow start (Vitrin): poster headline, a viewfinder holding the
 * sample photo with ink corner brackets and a scan line, two buttons, one
 * claim line. The viewfinder takes whatever height is left.
 */
function ViewfinderStart({ onChoosePhoto, onTrySample, busy }: StartProps) {
  const t = useT();
  const reduceMotion = useReduceMotion();
  const [vfHeight, setVfHeight] = useState(0);
  const sweep = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion || vfHeight <= 0) {
      sweep.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(sweep, {
        toValue: 1,
        duration: 2400,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, vfHeight, sweep]);
  // Reduced motion: the line rests at 44% like the target frame.
  const lineY = reduceMotion
    ? vfHeight * 0.44
    : sweep.interpolate({
        inputRange: [0, 1],
        outputRange: [0, Math.max(0, vfHeight - 5)],
      });
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.vContent}
      showsVerticalScrollIndicator={false}
      bounces={false}
    >
      <Text
        accessibilityRole="header"
        maxFontSizeMultiplier={1}
        style={styles.vHead}
      >
        {t("ÜRÜNÜN\nFOTOĞRAFI", "PHOTO OF\nYOUR PRODUCT")}
      </Text>
      <View
        style={styles.vf}
        accessible
        accessibilityLabel={t("Örnek ürün fotoğrafı", "Sample product photo")}
        onLayout={(e) => setVfHeight(Math.round(e.nativeEvent.layout.height))}
      >
        <Image
          accessibilityIgnoresInvertColors
          source={sampleProduct}
          resizeMode="cover"
          style={styles.vfImage}
        />
        <View style={[styles.br, styles.brA]} />
        <View style={[styles.br, styles.brB]} />
        <View style={[styles.br, styles.brC]} />
        <View style={[styles.br, styles.brD]} />
        {vfHeight > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[styles.scan, { transform: [{ translateY: lineY }] }]}
          >
            <View style={styles.scanCore} />
          </Animated.View>
        )}
        <View style={styles.vfLabel}>
          <Text style={styles.vfLabelText}>
            {t("ÖRNEK ÜRÜN", "SAMPLE PRODUCT")}
          </Text>
        </View>
      </View>
      <View style={styles.acts}>
        <Button
          testID="pick-photo"
          primary
          label={t("Fotoğraf seç", "Choose photo")}
          disabled={!!busy}
          onPress={onChoosePhoto}
        />
        <Button
          testID="sample-product"
          label={t("Örnekle dene", "Try a sample")}
          disabled={!!busy}
          onPress={onTrySample}
        />
      </View>
      {busy ? (
        <View style={styles.busy} accessibilityLiveRegion="polite">
          <ActivityIndicator size="small" color={Theme.muted} />
          <Text style={styles.busyText}>{busy}</Text>
        </View>
      ) : (
        <Text style={styles.claim}>
          <Text style={styles.claimBold}>
            {t("Ürünün yeniden çizilmez.", "Your product is never redrawn.")}
          </Text>{" "}
          {t(
            "Arka plan telefonunda silinir, fotoğrafın dışarı çıkmaz.",
            "The background is removed on your phone; the photo never leaves it.",
          )}
        </Text>
      )}
    </ScrollView>
  );
}

function LegacyStartView({
  template,
  onTemplate,
  onChoosePhoto,
  onTrySample,
  busy,
  jumpToTemplates = false,
}: StartProps) {
  const t = useT();
  const window = useWindowDimensions();
  // One finished example frame (Kampanya), drawn on the phone from the sample.
  const example = useTemplatePoster("campaign", null, undefined, {
    backdrop: POSTER_BACKDROP.campaign,
    ratio: "9:16",
  });
  const [exampleFailed, setExampleFailed] = useState(false);
  // The frame takes the height left under the button (minus its caption),
  // so the whole start screen fits without scrolling when there is room.
  const [room, setRoom] = useState(398 + 26);
  const exampleHeight = Math.round(
      Math.max(
        176,
        Math.min(398, room - 26, ((window.width - 2 * Space.gutter) * 16) / 9),
      ),
    ),
    exampleWidth = Math.round((exampleHeight * 9) / 16);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null),
    jumped = useRef(false);
  const hints: { icon: IconName; text: string }[] = [
    {
      icon: "camera.aperture",
      text: t(
        "Sade bir zeminde çek, ürün kadrajı doldursun.",
        "Shoot on a plain surface and fill the frame.",
      ),
    },
    {
      icon: "scissors",
      text: t(
        "Ürün arka plandan telefonunda ayrılır.",
        "The product is cut out on your phone.",
      ),
    },
    {
      icon: "play.rectangle",
      text: t(
        "Önizleme ücretsiz; her değişiklikte yeniden oynar.",
        "The preview is free and replays after every change.",
      ),
    },
  ];
  return (
    <ScrollView
      ref={scroller}
      onContentSizeChange={() => {
        if (!jumpToTemplates || jumped.current) return;
        jumped.current = true;
        scroller.current?.scrollToEnd({ animated: false });
      }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.group}>
        <Text style={styles.lead}>
          {t(
            "Bir ürün fotoğrafından reklam videosu.",
            "An ad video from one product photo.",
          )}
        </Text>
        {SINGLE_FLOW && (
          <View style={styles.captions}>
            {hints.slice(0, 2).map((hint) => (
              <Text key={hint.text} style={styles.caption}>
                {hint.text}
              </Text>
            ))}
          </View>
        )}
        <View style={SINGLE_FLOW ? styles.primaryGap : undefined}>
          <Button
            testID="pick-photo"
            primary
            icon={SINGLE_FLOW ? undefined : "photo.on.rectangle"}
            label={t("Ürün fotoğrafını seç", "Choose a product photo")}
            disabled={!!busy}
            onPress={onChoosePhoto}
          />
        </View>
        <View style={styles.center}>
          <Pressable
            testID="sample-product"
            accessibilityRole="link"
            accessibilityLabel={t("Örnek ürünle dene", "Try a sample product")}
            disabled={!!busy}
            onPress={onTrySample}
            hitSlop={{ left: 8, right: 8 }}
            style={({ pressed }) => [styles.link, pressed && Press.text]}
          >
            <Text style={styles.linkText}>
              {t("Örnek ürünle dene", "Try a sample product")}
            </Text>
          </Pressable>
        </View>
        {busy && (
          <View style={styles.busy} accessibilityLiveRegion="polite">
            <ActivityIndicator size="small" color={Theme.muted} />
            <Text style={styles.busyText}>{busy}</Text>
          </View>
        )}
      </View>

      {!SINGLE_FLOW && (
        <View style={styles.hints}>
          {hints.map((hint, index) => (
            <View
              key={hint.text}
              style={[styles.hint, index > 0 && styles.hintDivider]}
            >
              <Icon name={hint.icon} size={18} color={Theme.muted} />
              <Text style={styles.hintText}>{hint.text}</Text>
            </View>
          ))}
        </View>
      )}

      {SINGLE_FLOW && example && !exampleFailed && (
        <View
          style={styles.example}
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (h > 0 && Math.abs(h - room) > 1) setRoom(h);
          }}
        >
          <Image
            accessible={false}
            accessibilityIgnoresInvertColors
            source={{ uri: example }}
            resizeMode="cover"
            style={{
              width: exampleWidth,
              height: exampleHeight,
              borderRadius: Radius.xl,
              backgroundColor: Theme.surface,
            }}
            onError={() => setExampleFailed(true)}
          />
          <Text style={styles.footnote}>
            {t("Örnek çıktı", "Sample output")}
          </Text>
        </View>
      )}

      {!SINGLE_FLOW && (
        <View style={styles.group}>
          <View style={styles.sectionHead}>
            <Text accessibilityRole="header" style={styles.section}>
              {t("Şablonlar", "Templates")}
            </Text>
            <Text style={styles.footnote}>
              {t(
                "Dokun, sonra fotoğrafı seç",
                "Tap one, then choose the photo",
              )}
            </Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.gallery}
            style={{ marginHorizontal: -Space.gutter }}
          >
            {TEMPLATES.map((item) => (
              <TemplateCard
                key={item.id}
                wide
                item={item}
                selected={item.id === template}
                disabled={!!busy}
                onPress={() => onTemplate(item.id)}
              />
            ))}
          </ScrollView>
          <Text style={styles.footnote}>
            {t(
              "Şablonu ve rengi editörde istediğin zaman değiştirebilirsin.",
              "You can change the template and color in the editor at any time.",
            )}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const BRACKET = {
  position: "absolute",
  width: 30,
  height: 30,
  borderColor: Theme.text,
  borderWidth: 0,
} as const;
const styles = StyleSheet.create({
  vContent: {
    flexGrow: 1,
    paddingHorizontal: Space.gutter,
    paddingTop: Space.s,
    paddingBottom: Space.l,
    gap: Space.m,
  },
  // The poster line does not grow with Dynamic Type (cap 1): only 8 pt of room
  // above it, and the marks of Ü need 7 pt at 1x.
  vHead: { ...Type.display, ...displayMetrics(52, 1) },
  vf: {
    flex: 1,
    minHeight: 160,
    borderRadius: Radius.xl,
    overflow: "hidden",
    backgroundColor: Theme.surface,
  },
  vfImage: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
  },
  br: BRACKET,
  brA: { left: 10, top: 10, borderLeftWidth: 4, borderTopWidth: 4 },
  brB: { right: 10, top: 10, borderRightWidth: 4, borderTopWidth: 4 },
  brC: { left: 10, bottom: 10, borderLeftWidth: 4, borderBottomWidth: 4 },
  brD: { right: 10, bottom: 10, borderRightWidth: 4, borderBottomWidth: 4 },
  scan: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: 5,
    backgroundColor: Theme.text,
    padding: 1,
  },
  scanCore: { flex: 1, backgroundColor: Theme.accent },
  vfLabel: {
    position: "absolute",
    left: 12,
    bottom: 12,
    backgroundColor: Theme.text,
    paddingVertical: 6,
    paddingHorizontal: 9,
    borderRadius: 6,
  },
  vfLabelText: {
    fontFamily: Face.extra,
    fontWeight: "800",
    fontSize: 10.5,
    letterSpacing: 1.4,
    color: Theme.accent,
  },
  acts: { gap: 10 },
  claim: {
    fontFamily: Face.bold,
    fontWeight: "700",
    fontSize: 12.5,
    lineHeight: 17,
    color: Theme.muted,
  },
  claimBold: { color: Theme.text },
  // Section gap 32 > group gap 12 > row gap 8.
  content: {
    paddingHorizontal: Space.gutter,
    paddingTop: Space.s,
    paddingBottom: Space.l,
    gap: Space.xxl,
    flexGrow: 1,
  },
  group: { gap: Space.m },
  captions: { gap: Space.s },
  primaryGap: { marginTop: Space.gutter },
  caption: { fontSize: 15, lineHeight: 20, color: Theme.muted },
  example: { alignItems: "center", gap: Space.s, flex: 1, minHeight: 202 },
  link: { minHeight: 44, justifyContent: "center" },
  linkText: {
    fontSize: 17,
    fontWeight: "500",
    color: Theme.text,
    textDecorationLine: "underline",
  },
  lead: { fontSize: 17, lineHeight: 22, color: Theme.muted },
  center: {
    flexDirection: "row",
    justifyContent: SINGLE_FLOW ? "flex-start" : "center",
  },
  busy: { flexDirection: "row", alignItems: "center", gap: Space.s },
  busyText: { fontSize: 15, color: Theme.muted },
  // Plain rows with hairlines, no grey box.
  hints: {},
  hint: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.m,
    minHeight: 52,
    paddingVertical: Space.s,
  },
  hintDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.line,
  },
  hintText: { flex: 1, fontSize: 15, lineHeight: 20, color: Theme.text },
  sectionHead: { gap: 2 },
  section: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "700",
    letterSpacing: -0.3,
    color: Theme.text,
  },
  gallery: { gap: Space.m, paddingHorizontal: Space.gutter - 4 },
  footnote: { fontSize: 13, lineHeight: 18, color: Theme.muted },
});
