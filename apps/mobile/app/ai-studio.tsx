/**
 * AI stüdyo (Vidora Pro): AI Sahne. The cloud (Cloudflare Workers AI, free
 * tier) paints an empty photorealistic scene; the original cut-out product
 * is laid on top on the phone, so the product is never altered and its
 * photo never leaves the device. Motion is added on the phone by the
 * editor's templates (cloud video is off: CLOUD_MOTION_ENABLED).
 *
 * Route: /ai-studio?cutout=<file URI>&width=<px>&height=<px>&category=<id>
 * - cutout (required): the PNG from product.cutOut(), cropped to the product.
 * - width/height (optional): the cut-out's size; read from the file if absent.
 * - category (optional): orders the scene styles for that category.
 * "Bu sahneyi kullan" calls offerChosenScene() and goes back; the editor
 * picks it up with takeChosenScene().
 */
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { SINGLE_FLOW } from "../src/config";
import {
  AI_PROVIDER,
  CloudError,
  SCENE_CROP,
  VARIANT_CHOICES,
  cloudAvailable,
  cloudErrorText,
  discardScenes,
  generateScenes,
  getQuota,
  offerChosenScene,
  productPlacement,
  remaining,
  saveSceneToPhotos,
  shareScene,
  stylesFor,
  type CloudQuota,
  type ProductRect,
  type Scene,
  type SceneStyleId,
} from "../src/cloud";
import { grantAiConsent, hasAiConsent } from "../src/ai-consent";
import { CATEGORIES, type CategoryId } from "../src/product-catalog";
import { PRIVACY_URL } from "../src/pairing";
import { offerFreeExport } from "../src/pro";
import { usePro } from "../src/pro-context";
import { describeError } from "../src/media";
import {
  Button,
  Choice,
  Icon,
  Pill,
  Screen,
  Space,
  Theme,
  Txt,
  s,
  useT,
  type IconName,
} from "../src/ui";

type Busy = null | "scenes" | "saving";

function positive(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export default function AiStudio() {
  const router = useRouter(),
    t = useT(),
    pro = usePro();
  const params = useLocalSearchParams<{
    cutout?: string;
    width?: string;
    height?: string;
    category?: string;
  }>();
  const cutout = typeof params.cutout === "string" ? params.cutout : "";
  const category = CATEGORIES.some((c) => c.id === params.category)
    ? (params.category as CategoryId)
    : null;
  const styleOptions = stylesFor(category);

  const [size, setSize] = useState({
    width: positive(params.width),
    height: positive(params.height),
  });
  const [style, setStyle] = useState<SceneStyleId>(
    styleOptions[0]?.id ?? "studio-marble",
  );
  const [variants, setVariants] = useState<string>(String(VARIANT_CHOICES[0]));
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [chosen, setChosen] = useState(0);
  const [quota, setQuota] = useState<CloudQuota | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [message, setMessage] = useState("");
  const [consentOpen, setConsentOpen] = useState(false);
  const pendingAfterConsent = useRef<(() => void) | null>(null);
  const mounted = useRef(true);
  const sceneList = useRef<Scene[]>([]);
  const kept = useRef<string | null>(null);

  useEffect(() => {
    sceneList.current = scenes;
  }, [scenes]);
  // Cached scenes the user did not keep are deleted when leaving.
  useEffect(
    () => () => {
      mounted.current = false;
      discardScenes(sceneList.current.filter((x) => x.uri !== kept.current));
    },
    [],
  );

  // The cut-out's size decides where the product stands in the scene.
  useEffect(() => {
    if (!cutout || (size.width && size.height)) return;
    Image.getSize(
      cutout,
      (width, height) => mounted.current && setSize({ width, height }),
      () => {},
    );
  }, [cutout, size.width, size.height]);

  // Quota is shown to subscribers only; failures just hide it.
  useEffect(() => {
    if (!pro.isPro || !cloudAvailable()) return;
    getQuota()
      .then((q) => mounted.current && setQuota(q))
      .catch(() => {});
  }, [pro.isPro]);

  const toPaywall = () => {
    offerFreeExport(null);
    router.push("/paywall");
  };

  function explain(error: unknown) {
    if (error instanceof CloudError) {
      if (error.quota) setQuota(error.quota);
      if (error.code === "not-pro") {
        toPaywall();
        return;
      }
      const text = cloudErrorText(error.code);
      setMessage(t(text.tr, text.en));
    } else setMessage(describeError(error, t));
  }

  /** Runs `job` after making sure the user agreed to the cloud request. */
  async function withConsent(job: () => void) {
    if (await hasAiConsent()) job();
    else {
      pendingAfterConsent.current = job;
      setConsentOpen(true);
    }
  }

  async function run(kind: Busy, job: () => Promise<void>) {
    setBusy(kind);
    setMessage("");
    try {
      await job();
    } catch (error) {
      if (mounted.current) explain(error);
    } finally {
      if (mounted.current) setBusy(null);
    }
  }

  const makeScenes = () =>
    withConsent(() =>
      run("scenes", async () => {
        const result = await generateScenes({
          style,
          count: Number(variants),
        });
        if (!mounted.current) {
          discardScenes(result.scenes);
          return;
        }
        discardScenes(sceneList.current);
        setScenes(result.scenes);
        setChosen(0);
        if (result.quota) setQuota(result.quota);
      }),
    );

  const rect = productPlacement(size.width, size.height);
  const scene = scenes[chosen] ?? null;

  const chooseScene = () => {
    if (!scene) return;
    kept.current = scene.uri;
    offerChosenScene({
      backgroundUri: scene.uri,
      crop: SCENE_CROP,
      productRect: rect,
      style: scene.style,
    });
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };
  const saveBackground = () => {
    if (!scene) return;
    void run("saving", async () => {
      const saved = await saveSceneToPhotos(scene.uri);
      setMessage(
        saved
          ? t(
              "Arka plan Fotoğraflar'a kaydedildi.",
              "Background saved to Photos.",
            )
          : t(
              "Fotoğraflar'a ekleme izni verilmedi. Ayarlar > Vidora > Fotoğraflar bölümünden izin verebilirsin.",
              "Permission to add to Photos was denied. You can allow it in Settings > Vidora > Photos.",
            ),
      );
    });
  };
  const shareBackground = () => {
    if (!scene) return;
    void run("saving", () => shareScene(scene.uri));
  };

  // ------------------------------------------------------------- states --

  // Without the cloud URL (version 1.0) the feature does not exist: go home.
  if (SINGLE_FLOW || !cloudAvailable()) return <Redirect href="/" />;
  if (!cutout) {
    const text = cloudErrorText("not-configured");
    return (
      <Screen back title={t("AI stüdyo", "AI studio")}>
        <Txt muted>
          {!cutout
            ? t(
                "Önce bir ürün fotoğrafı seçip arka planını kaldır.",
                "First choose a product photo and remove its background.",
              )
            : t(text.tr, text.en)}
        </Txt>
      </Screen>
    );
  }

  if (!pro.loading && !pro.isPro) {
    return (
      <Screen back title={t("AI stüdyo", "AI studio")}>
        <Image
          accessible={false}
          source={{ uri: cutout }}
          resizeMode="contain"
          style={local.cutout}
        />
        <Txt title>
          {t("Ürünün, gerçek bir sahnede", "Your product, in a real scene")}
        </Txt>
        <Txt muted>
          {t(
            "AI Sahne ürününü mermer stüdyodan sahile kadar fotoğraf gerçekliğinde sahnelere yerleştirir. Ürünün ve logon hiç değişmez; fotoğrafın telefonundan çıkmaz.",
            "AI Scene places your product in photorealistic scenes, from a marble studio to the beach. Your product and logo never change, and your photo never leaves your phone.",
          )}
        </Txt>
        <Button
          primary
          label={t("Vidora Pro'ya geç", "Get Vidora Pro")}
          onPress={toPaywall}
        />
      </Screen>
    );
  }

  const working = busy !== null;
  const left = quota ? remaining(quota) : null;
  const count = Number(variants);
  const canMake = !working && (left === null || left >= count);

  return (
    <Screen
      back
      title={t("AI stüdyo", "AI studio")}
      action={
        quota ? (
          <Pill label={quota.plan === "trial" ? t("DENEME", "TRIAL") : "PRO"} />
        ) : undefined
      }
    >
      <Txt muted>
        {t(
          "Yapay zekâ yalnızca boş sahneyi çizer; ürünün telefonunda, olduğu gibi üstüne yerleştirilir.",
          "The AI only draws the empty scene; your product is placed on top on your phone, exactly as it is.",
        )}
      </Txt>

      {scenes.length === 0 ? (
        <View style={local.stage}>
          <Image
            accessible
            accessibilityLabel={t(
              "Arka planı kaldırılmış ürün",
              "Cut-out product",
            )}
            source={{ uri: cutout }}
            resizeMode="contain"
            style={local.cutout}
          />
        </View>
      ) : (
        <View style={local.grid} accessibilityRole="radiogroup">
          {scenes.map((item, index) => {
            const selected = index === chosen;
            return (
              <Pressable
                key={item.uri}
                accessibilityRole="radio"
                accessibilityLabel={t(
                  `Sahne ${index + 1}`,
                  `Scene ${index + 1}`,
                )}
                accessibilityState={{ selected, disabled: working }}
                disabled={working}
                onPress={() => setChosen(index)}
                style={[local.tile, selected && local.tileSelected]}
              >
                <Composite background={item.uri} product={cutout} rect={rect} />
                {selected && (
                  <View style={local.check}>
                    <Icon name="checkmark" size={13} color={Theme.bg} />
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      )}

      <Choice
        label={t("Sahne", "Scene")}
        options={styleOptions.map((item) => ({
          value: item.id,
          label: t(item.tr, item.en),
        }))}
        value={style}
        onChange={setStyle}
        disabled={working}
      />
      <Choice
        label={t("Varyasyon", "Variations")}
        options={VARIANT_CHOICES.map((n) => ({
          value: String(n),
          label: String(n),
        }))}
        value={variants}
        onChange={setVariants}
        disabled={working}
      />

      {quota && (
        <Text style={s.label}>
          {t(`Bugün kalan: ${left} sahne`, `Left today: ${left} scenes`)}
        </Text>
      )}

      {working && (
        <View style={[s.row, { justifyContent: "flex-start" }]}>
          <ActivityIndicator color={Theme.muted} />
          <Text style={s.label}>
            {busy === "scenes"
              ? t("Sahneler hazırlanıyor (5–20 sn)…", "Making scenes (5–20 s)…")
              : t("Hazırlanıyor…", "Preparing…")}
          </Text>
        </View>
      )}
      {!!message && (
        <Text accessibilityLiveRegion="polite" style={[s.text, s.muted]}>
          {message}
        </Text>
      )}

      {/* One primary action: the next step of the flow. */}
      {scene ? (
        <>
          <Button
            primary
            label={t("Bu sahneyi kullan", "Use this scene")}
            onPress={chooseScene}
            disabled={working}
          />
          <Text style={s.label}>
            {t(
              "Hareket, videoyu oluştururken telefondaki şablonlarla eklenir.",
              "Motion is added on your phone by the templates when you make the video.",
            )}
          </Text>
          <View style={local.actions}>
            <Button
              label={t("Arka planı kaydet", "Save background")}
              icon="square.and.arrow.down"
              onPress={saveBackground}
              disabled={working}
            />
            <Button
              label={t("Paylaş", "Share")}
              icon="square.and.arrow.up"
              onPress={shareBackground}
              disabled={working}
            />
          </View>
          <Button
            plain
            label={t(
              `Yeni sahneler oluştur (${count})`,
              `Make new scenes (${count})`,
            )}
            onPress={() => void makeScenes()}
            disabled={!canMake}
          />
        </>
      ) : (
        <Button
          primary
          label={t(`Sahne oluştur (${count})`, `Create scenes (${count})`)}
          onPress={() => void makeScenes()}
          disabled={!canMake}
        />
      )}

      <Text style={s.label}>
        {t(
          "Buluta yalnızca seçtiğin sahne stili ve abonelik doğrulaması gider; ürün fotoğrafın gönderilmez.",
          "Only the scene style you pick and a subscription check go to the cloud; your product photo is not sent.",
        )}
      </Text>

      <ConsentSheet
        visible={consentOpen}
        onCancel={() => {
          pendingAfterConsent.current = null;
          setConsentOpen(false);
          const text = cloudErrorText("consent-required");
          setMessage(t(text.tr, text.en));
        }}
        onAccept={async () => {
          await grantAiConsent().catch(() => {});
          setConsentOpen(false);
          const job = pendingAfterConsent.current;
          pendingAfterConsent.current = null;
          job?.();
        }}
      />
    </Screen>
  );
}

/**
 * Scene with the original cut-out on top. The square background is cropped
 * to its centre 9:16 column (SCENE_CROP); the product sits at `rect`.
 */
function Composite({
  background,
  product,
  rect,
}: {
  background: string;
  product: string;
  rect: ProductRect;
}) {
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  const side = frame.height; // square background, as tall as the frame
  const pw = rect.width * frame.width,
    ph = rect.height * frame.height;
  return (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={(e) =>
        setFrame({
          width: e.nativeEvent.layout.width,
          height: e.nativeEvent.layout.height,
        })
      }
    >
      {frame.width > 0 && (
        <>
          <Image
            accessibilityIgnoresInvertColors
            source={{ uri: background }}
            resizeMode="cover"
            style={{
              position: "absolute",
              top: 0,
              left: -SCENE_CROP.x * side,
              width: side,
              height: side,
            }}
          />
          {/* Soft contact shadow so the product sits on the surface. */}
          <View
            style={{
              position: "absolute",
              left: rect.x * frame.width + pw * 0.12,
              top: rect.y * frame.height + ph - Math.max(4, ph * 0.04),
              width: pw * 0.76,
              height: Math.max(8, ph * 0.08),
              borderRadius: 999,
              backgroundColor: Theme.shadowSoft,
            }}
          />
          <Image
            accessibilityIgnoresInvertColors
            source={{ uri: product }}
            resizeMode="contain"
            style={{
              position: "absolute",
              left: rect.x * frame.width,
              top: rect.y * frame.height,
              width: pw,
              height: ph,
            }}
          />
        </>
      )}
    </View>
  );
}

/** App Review 5.1.2(i): names the provider and what is sent, before the first request. */
function ConsentSheet({
  visible,
  onAccept,
  onCancel,
}: {
  visible: boolean;
  onAccept: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const points: { icon: IconName; text: string }[] = [
    {
      icon: "photo",
      text: t(
        "Ürün fotoğrafın telefonundan çıkmaz. Yapay zekâ yalnızca boş bir sahne çizer; ürünün telefonunda üstüne yerleştirilir.",
        "Your product photo never leaves your phone. The AI only draws an empty scene; your product is placed on top on your phone.",
      ),
    },
    {
      icon: "paperplane",
      text: t(
        "Gönderilen: seçtiğin sahne stili ve aboneliğini doğrulamak için App Store'un imzaladığı abonelik bilgisi (ürün, işlem numarası, bitiş tarihi). Adın, e-postan veya ödeme bilgin gönderilmez.",
        "Sent: the scene style you choose and the App Store-signed subscription record used to verify your subscription (product, transaction number, expiry). No name, email or payment details.",
      ),
    },
    {
      icon: "server.rack",
      text: t(
        `İşleyen: ${AI_PROVIDER}, FLUX.1 [schnell] modeliyle. Vidora'nın sunucusu yalnızca günlük kullanım sayacını tutar (2 gün).`,
        `Processed by: ${AI_PROVIDER}, with the FLUX.1 [schnell] model. Vidora's server keeps only a daily usage counter (2 days).`,
      ),
    },
    {
      icon: "hand.raised",
      text: t(
        "Vidora'nın diğer tüm özellikleri telefonunda çalışmaya devam eder. AI Sahne'yi kullanmayı bıraktığında hiçbir şey gönderilmez.",
        "Every other Vidora feature keeps working on your phone. If you stop using AI Scene, nothing is sent.",
      ),
    },
  ];
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: Theme.bg }}>
        <ScrollView contentContainerStyle={local.sheet}>
          <Txt big>
            {t("AI Sahne bulutta çalışır", "AI Scene runs in the cloud")}
          </Txt>
          <Txt muted>
            {t(
              "Sahneyi telefon değil, üçüncü taraf bir yapay zekâ servisi çizer. Devam etmeden önce neyin paylaşıldığını bil:",
              "The scene is drawn by a third-party AI service, not your phone. Before you continue, here is what is shared:",
            )}
          </Txt>
          {points.map((point) => (
            <View key={point.text} style={local.point}>
              <Icon name={point.icon} size={18} color={Theme.muted} />
              <Text style={[s.text, { flex: 1 }]}>{point.text}</Text>
            </View>
          ))}
          <Button
            plain
            label={t("Gizlilik politikası", "Privacy policy")}
            onPress={() => void Linking.openURL(PRIVACY_URL).catch(() => {})}
          />
          <Button
            primary
            label={t("İzin ver ve devam et", "Allow and continue")}
            onPress={onAccept}
          />
          <Button label={t("Vazgeç", "Not now")} onPress={onCancel} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const local = StyleSheet.create({
  stage: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Space.xl,
    borderRadius: 16,
    backgroundColor: Theme.surface,
  },
  cutout: { width: "60%", aspectRatio: 1, alignSelf: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: Space.m },
  tile: {
    width: "47%",
    aspectRatio: 9 / 16,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: Theme.raised,
    borderWidth: 2,
    borderColor: "transparent",
  },
  tileSelected: { borderColor: Theme.text },
  check: {
    position: "absolute",
    top: Space.s,
    right: Space.s,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.text,
  },
  actions: { flexDirection: "row", gap: Space.m },
  sheet: {
    paddingHorizontal: Space.gutter,
    paddingTop: Space.xl,
    paddingBottom: Space.xxl * 2,
    gap: Space.l,
  },
  point: { flexDirection: "row", gap: Space.m, alignItems: "flex-start" },
});
