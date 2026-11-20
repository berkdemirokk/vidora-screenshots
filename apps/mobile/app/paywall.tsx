import { useContext, useEffect, useRef, useState } from "react";
import { baseLang } from "../src/i18n/lang";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { PRIVACY_URL } from "../src/pairing";
import { SINGLE_FLOW } from "../src/config";
import {
  PRO_MONTHLY,
  TERMS_URL,
  offerAfterPurchase,
  offerFreeExport,
  pendingAfterPurchase,
  type PaywallReason,
} from "../src/pro";
import { usePro } from "../src/pro-context";
import {
  bestValueId,
  formatMoney,
  storeProblem,
  yearlySaving,
  type ProProduct,
} from "../src/pro-rules";
import { aiAvailable } from "../src/product";
import { usePaywallProof } from "../src/paywall-proof";
import { trialNote, trialRenewal } from "../src/trial-copy";
import { ProofPair } from "../src/proof";
import {
  Button,
  Icon,
  Language,
  MaxScale,
  Notice,
  Press,
  Radius,
  Space,
  Theme,
  Type,
  displayMetrics,
  openPage,
  s,
  tap,
  useAnnounce,
  useT,
  useUpper,
} from "../src/ui";

const REASONS: readonly PaywallReason[] = [
  "video",
  "image",
  "marketplace",
  "ai",
  "desk",
];
const RATIO_ASPECT: Record<string, number> = {
  "9x16": 9 / 16,
  "4x5": 4 / 5,
  "1x1": 1,
  "2x3": 2 / 3,
};
type Busy = null | "buy" | "restore";

export default function Paywall() {
  const router = useRouter(),
    t = useT(),
    upper = useUpper(),
    { lang } = useContext(Language),
    pro = usePro(),
    insets = useSafeAreaInsets(),
    { fontScale, height } = useWindowDimensions(),
    params = useLocalSearchParams<{
      frame?: string;
      ratio?: string;
      reason?: string;
      qa?: string;
    }>();
  // Only a local file (the editor's preview frame) is shown; a deep link can
  // never make the app load a remote image.
  const frame: string | null =
    typeof params.frame === "string" && params.frame.startsWith("file://")
      ? params.frame
      : null;
  // The user's own last rendered result, when the editor has set one; it is
  // shown with a watermark and never saved to Photos.
  const proof = usePaywallProof();
  const shown = frame ?? proof;
  const frameAspect = RATIO_ASPECT[params.ratio ?? ""] ?? 0.8;
  // This build only makes videos: deep-link reasons for hidden features fall
  // back to the video copy.
  // Opened from the editor (export gate) rather than Settings or the AI desk.
  const fromEditor =
    params.reason === "video" ||
    params.reason === "image" ||
    params.reason === "desk";
  const reason = SINGLE_FLOW
    ? ("video" as const)
    : (REASONS.find((item) => item === params.reason) ?? null);

  const [chosen, setChosen] = useState(PRO_MONTHLY),
    [busy, setBusy] = useState<Busy>(null),
    [waiting, setWaiting] = useState(false),
    [restored, setRestored] = useState(false),
    [message, setMessage] = useState(""),
    [aiOn, setAiOn] = useState(false);
  useAnnounce(message);
  // Screenshot builds (pro.demo) show the not-subscribed state with sample
  // plans; buying or restoring there only closes the screen.
  const demo = pro.demo;
  const subscribed = pro.isPro && !demo;
  const storeAvailable = pro.storeAvailable || demo;
  // Taken once: the action to resume after a purchase or a restore. There
  // is no free export any more, so the free-export callback is only cleared.
  const [exportAfterPurchase] = useState(pendingAfterPurchase);
  const [purchased, setPurchased] = useState(false);
  // After a purchase (or a restore with an action waiting), wait until Pro
  // is actually on in the shared context. Effects run after every consumer
  // has committed, so the calling screen has re-rendered with Pro and its
  // pending action uses the Pro settings. Deterministic, unlike a timer.
  const handedOff = useRef(false);
  useEffect(() => {
    if (!purchased || !pro.isPro || handedOff.current) return;
    handedOff.current = true;
    close();
    exportAfterPurchase?.();
  });
  useEffect(
    () => () => {
      offerFreeExport(null);
      offerAfterPurchase(null);
    },
    [],
  );
  // A failed launch fetch is retried once when the paywall opens.
  useEffect(() => {
    if (!pro.demo && pro.productsState === "failed") void pro.reloadProducts();
    // Mount only: an empty list must not loop between failed and loading.
  }, []);
  useEffect(() => {
    let live = true;
    aiAvailable(baseLang(lang))
      .then((value) => {
        if (live) setAiOn(value);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [lang]);

  const close = () =>
    router.canGoBack() ? router.back() : router.replace("/");
  const plan =
    pro.products.find((product) => product.id === chosen) ??
    pro.products[0] ??
    null;

  const periodLabel = (product: ProProduct) =>
    product.period === "week"
      ? t("Haftalık", "Weekly")
      : product.period === "month"
        ? t("Aylık", "Monthly")
        : product.period === "year"
          ? t("Yıllık", "Yearly")
          : product.displayName || "Vidora Pro";
  // 3.1.2(c): the subscription's title is always shown with its period.
  const planTitle = (product: ProProduct) =>
    product.period === "week" ||
    product.period === "month" ||
    product.period === "year"
      ? "Vidora Pro · " + periodLabel(product)
      : "Vidora Pro";
  const perPeriod = (product: ProProduct) =>
    product.period === "week"
      ? t("/ hafta", "/ week")
      : product.period === "month"
        ? t("/ ay", "/ month")
        : product.period === "year"
          ? t("/ yıl", "/ year")
          : "";

  function explain(error: unknown) {
    const problem = storeProblem(error);
    setMessage(
      problem === "unverified"
        ? t(
            "App Store bu işlemi doğrulayamadı. Ücret alındıysa “Satın alımları geri yükle”ye dokun.",
            "The App Store could not verify this transaction. If you were charged, tap “Restore purchases”.",
          )
        : problem === "unavailable"
          ? t(
              "App Store'a şu anda ulaşılamıyor. Bağlantını kontrol edip tekrar dene.",
              "The App Store is unavailable right now. Check your connection and try again.",
            )
          : t(
              "İşlem tamamlanamadı. Lütfen tekrar dene.",
              "The request could not be completed. Please try again.",
            ),
    );
  }
  async function run(kind: Exclude<Busy, null>, job: () => Promise<void>) {
    setBusy(kind);
    setMessage("");
    try {
      await job();
    } catch (error) {
      explain(error);
    } finally {
      setBusy(null);
    }
  }
  const buy = (id: string) => {
    if (demo) return close();
    void run("buy", async () => {
      const status = await pro.purchase(id);
      if (status === "purchased") setPurchased(true);
      else if (status === "pending") {
        setWaiting(true);
        setMessage(
          t(
            "Satın alma onay bekliyor (ör. Satın Alma İzni). Onaylandığında Pro kendiliğinden açılır. Onaylanınca Videoyu oluştur düğmesine tekrar dokun.",
            "The purchase is waiting for approval (e.g. Ask to Buy). Pro unlocks automatically once it is approved. When it is, tap the create button again.",
          ),
        );
      }
      // "cancelled": the user changed their mind; nothing to report.
    });
  };
  const restore = () => {
    if (demo) return close();
    void run("restore", async () => {
      if (await pro.restore()) {
        setMessage(t("Vidora Pro geri yüklendi.", "Vidora Pro restored."));
        // Resume what the user asked for; otherwise stay and say so.
        if (exportAfterPurchase) setPurchased(true);
        else setRestored(true);
      } else
        setMessage(
          t(
            "Bu Apple Hesabında etkin bir Vidora Pro aboneliği bulunamadı.",
            "No active Vidora Pro subscription was found for this Apple Account.",
          ),
        );
    });
  };
  const open = (url: string) =>
    openPage(url, () =>
      setMessage(
        t(
          "Sayfa açılamadı. İnternet bağlantını kontrol edip tekrar dene.",
          "The page could not be opened. Check your connection and try again.",
        ),
      ),
    );
  // "Devam et" resumes the pending action once, tied to this tap.
  const proceed = () => {
    if (handedOff.current) return close();
    handedOff.current = true;
    close();
    exportAfterPurchase?.();
  };

  const heading =
    reason === "video"
      ? t("Videonu oluştur ve kaydet", "Make and save your video")
      : reason === "image"
        ? t("Görselini kaydet", "Save your image")
        : reason === "marketplace"
          ? t("Pazaryeri görselini kaydet", "Save your marketplace image")
          : reason === "ai"
            ? t("Yapay zekâyla öneri al", "Get AI suggestions")
            : reason === "desk"
              ? t("Kurgunu video olarak kaydet", "Save your edit as a video")
              : t(
                  "Videolarını ve görsellerini kaydet",
                  "Save your videos and images",
                );

  // Three quiet facts: the lead benefit (what this build unlocks, nothing
  // more) and the two promises about how videos are made.
  const leadFact =
    reason === "marketplace"
      ? t("Pazaryeri görselleri", "Marketplace images")
      : reason === "ai" && aiOn
        ? t("Yapay zekâyla metin önerileri", "AI text suggestions")
        : reason === "desk"
          ? t("Kurgu masası", "Editing desk")
          : SINGLE_FLOW
            ? t(
                "1080p videolar Fotoğraflar'a kaydedilir, filigran yok",
                "1080p videos saved to Photos, no watermark",
              )
            : t("1080p video ve görseller", "1080p videos and images");
  const facts = [
    leadFact,
    t("Video başına ödeme yok", "No per-video charges"),
    t(
      "Ürünün olduğu gibi kalır, video telefonunda hazırlanır",
      "Your product stays as it is; the video is made on your phone",
    ),
  ];

  const periodRank = (product: ProProduct) =>
    product.period === "year" ? 0 : product.period === "month" ? 1 : 2;
  const plans = [...pro.products].sort((a, b) => periodRank(a) - periodRank(b));
  // Demo builds can show the failed state for QA: vidora://paywall?qa=failed.
  const productsState = demo
    ? params.qa === "failed"
      ? "failed"
      : "ready"
    : pro.productsState;
  const ready =
    !subscribed &&
    storeAvailable &&
    !pro.loading &&
    productsState === "ready" &&
    !!plan;
  const showBuy =
    !subscribed &&
    storeAvailable &&
    (productsState === "loading" || (productsState === "ready" && !!plan));

  // Computed from the numeric StoreKit prices only; nothing when unknown.
  const saving = yearlySaving(pro.products);
  const bestId = bestValueId(pro.products);
  const money = (amount: number) =>
    saving
      ? formatMoney(amount, saving.currencyCode, saving.priceLocale)
      : null;
  const perMonth = saving ? money(saving.perMonth) : null;
  const saved = saving ? money(saving.saved) : null;

  // 3.1.2: with a trial, the trial length and the price that follows are
  // stated right above the button and again in the renewal sentence.
  const note = trialNote(plan, lang);
  const trialSentence = trialRenewal(plan, lang);
  const cancelPath = t(
    "İstediğin zaman iptal: Ayarlar › Apple Hesabın › Abonelikler.",
    "Cancel anytime: Settings › Apple Account › Subscriptions.",
  );
  const renewal = plan
    ? trialSentence
      ? trialSentence + " " + cancelPath
      : t(
          `${plan.displayPrice} ${perPeriod(plan)}, otomatik yenilenir. ${cancelPath}`,
          `${plan.displayPrice} ${perPeriod(plan)}, renews automatically. ${cancelPath}`,
        )
    : "";
  // The selected plan's price and period sit on the button itself.
  const buyLabel = waiting
    ? t("Onay bekleniyor", "Waiting for approval")
    : plan
      ? planTitle(plan) +
        ": " +
        plan.displayPrice +
        (perPeriod(plan) ? " " + perPeriod(plan) : "")
      : t("Abone ol", "Subscribe");

  // At large text sizes the footer scrolls with the content: the renewal
  // sentence wraps to many lines there and would squeeze the plan list.
  const bigText = fontScale >= 1.5;
  // Short phones: drop the proof image so every plan row sits above the footer.
  const compact = height < 700;
  const footer = (
    <View
      style={[
        styles.footer,
        !bigText && styles.footerPinned,
        { paddingBottom: Math.max(insets.bottom, Space.l) },
      ]}
    >
      {!!message && <Notice text={message} />}
      {subscribed ? (
        <Button
          primary
          label={t("Devam et", "Continue")}
          testID="paywall-continue"
          onPress={proceed}
        />
      ) : (
        showBuy && (
          <>
            {ready && !!note && !waiting && (
              <Text
                testID="paywall-trial-note"
                maxFontSizeMultiplier={MaxScale.paywallTitle}
                style={styles.trialNote}
              >
                {note}
              </Text>
            )}
            <Button
              primary
              testID="paywall-buy"
              busy={busy === "buy"}
              disabled={!ready || busy === "restore" || waiting}
              label={buyLabel}
              maxFontSizeMultiplier={MaxScale.paywallTitle}
              onPress={() => plan && buy(plan.id)}
            />
            {ready && (
              <Text
                maxFontSizeMultiplier={MaxScale.paywallTitle}
                style={styles.renewal}
              >
                {renewal}
              </Text>
            )}
          </>
        )
      )}
      <View style={styles.links}>
        {!subscribed && storeAvailable && (
          <FooterLink
            label={
              busy === "restore"
                ? t("Geri yükleniyor…", "Restoring…")
                : t("Satın alımları geri yükle", "Restore purchases")
            }
            testID="paywall-restore"
            disabled={busy !== null}
            onPress={restore}
          />
        )}
        {!subscribed && (
          <FooterLink
            label={t("Şimdi değil", "Not now")}
            testID="paywall-notnow"
            onPress={close}
          />
        )}
        <FooterLink
          label={t("İptal ve iade", "Cancel and refunds")}
          accessibilityLabel={t("Abonelik iptal ve iade", "Cancel and refunds")}
          testID="paywall-cancel-guide"
          onPress={() => router.push("/cancel-guide")}
        />
        <FooterLink
          label={t("Koşullar", "Terms")}
          accessibilityLabel={t("Kullanım Koşulları", "Terms of Use")}
          testID="paywall-terms"
          link
          onPress={() => open(TERMS_URL)}
        />
        <FooterLink
          label={t("Gizlilik", "Privacy")}
          accessibilityLabel={t("Gizlilik Politikası", "Privacy Policy")}
          testID="paywall-privacy"
          link
          onPress={() => open(PRIVACY_URL)}
        />
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: Theme.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: bigText ? 0 : Space.xl }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.body}>
          <View style={{ gap: Space.m }}>
            <Text
              accessibilityRole="header"
              maxFontSizeMultiplier={MaxScale.paywallTitle}
              style={styles.heading}
            >
              {upper(heading)}
            </Text>
            <View style={styles.mark} />
          </View>

          {compact ? null : shown ? (
            // The user's own frame with a visible watermark.
            <View style={styles.frameBlock}>
              <View
                testID="paywall-proof"
                accessible
                accessibilityLabel={t(
                  "Senin videondan bir kare, Vidora filigranlı",
                  "A frame from your video, with a Vidora watermark",
                )}
                style={[styles.frame, { width: Math.round(150 * frameAspect) }]}
              >
                <Image
                  accessible={false}
                  accessibilityIgnoresInvertColors
                  source={{ uri: shown }}
                  resizeMode="cover"
                  style={StyleSheet.absoluteFill}
                />
                <View pointerEvents="none" style={styles.watermark}>
                  <Text style={styles.watermarkText}>VIDORA</Text>
                </View>
              </View>
              <Text style={s.footnote}>
                {t(
                  "Senin videondan bir kare. Filigran yalnızca burada görünür; Pro ile kaydettiğin videoda yok.",
                  "A frame from your own video. The watermark only appears here; videos you save with Pro have none.",
                )}
              </Text>
            </View>
          ) : (
            <ProofPair maxHeight={120} />
          )}

          {subscribed ? (
            <Text style={[Type.title, { color: Theme.text }]}>
              {restored
                ? t(
                    "Vidora Pro geri yüklendi. Teşekkürler!",
                    "Vidora Pro restored. Thank you!",
                  )
                : t(
                    "Vidora Pro etkin. Teşekkürler!",
                    "Vidora Pro is active. Thank you!",
                  )}
            </Text>
          ) : !storeAvailable ? (
            <Notice
              text={t(
                "Bu derlemede App Store satın alımları kullanılamıyor. Abonelik yalnızca App Store ya da TestFlight sürümünde açılır.",
                "In-app purchases are not available in this build. Subscriptions work only in the App Store or TestFlight version.",
              )}
            />
          ) : productsState === "loading" ? (
            <View
              accessible
              accessibilityLabel={t("Planlar yükleniyor", "Loading plans")}
              accessibilityState={{ busy: true }}
              style={{ gap: Space.s }}
            >
              <View style={styles.skeleton} />
              <View style={styles.skeleton} />
              <View style={styles.skeleton} />
            </View>
          ) : productsState === "failed" || !plan ? (
            <View style={styles.failed}>
              <Text
                maxFontSizeMultiplier={MaxScale.paywallTitle}
                style={Type.title}
              >
                {t("Planlar şu an alınamadı.", "Plans could not be loaded.")}
              </Text>
              <Text style={s.muted}>
                {t(
                  "Bağlantını kontrol edip yeniden dene. Satın alımlarını geri yükleyebilirsin.",
                  "Check your connection and try again. You can still restore purchases.",
                )}
              </Text>
              <Button
                testID="paywall-retry"
                label={t("Yeniden dene", "Try again")}
                disabled={busy !== null}
                onPress={() => void pro.reloadProducts()}
              />
            </View>
          ) : (
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel={t("Abonelik planı", "Subscription plan")}
              style={{ gap: Space.s }}
            >
              {plans.map((product) => {
                const selected = product.id === plan.id;
                const yearly = product.period === "year";
                const best =
                  yearly && product.id === bestId
                    ? t("EN AVANTAJLI", "BEST VALUE")
                    : "";
                // Exact figures from StoreKit; no "months free", no
                // struck-through reference price.
                const ownMonth =
                  yearly && product.price && product.currencyCode
                    ? formatMoney(
                        Math.round((product.price / 12) * 100) / 100,
                        product.currencyCode,
                        product.priceLocale,
                      )
                    : null;
                const monthText = perMonth ?? ownMonth;
                const weeklyYear =
                  product.period === "week" &&
                  product.price &&
                  product.currencyCode
                    ? formatMoney(
                        Math.round(product.price * 52 * 100) / 100,
                        product.currencyCode,
                        product.priceLocale,
                      )
                    : null;
                const detail = !yearly
                  ? weeklyYear
                    ? t(`yılda ~${weeklyYear}`, `~${weeklyYear} per year`)
                    : ""
                  : [
                      monthText
                        ? t(`ay başına ${monthText}`, `${monthText} per month`)
                        : t("yılda bir faturalanır", "billed once a year"),
                      saved
                        ? t(
                            `aylık plana göre ${saved} tasarruf`,
                            `${saved} less than monthly`,
                          )
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" · ");
                return (
                  <Pressable
                    key={product.id}
                    testID={"paywall-plan-" + product.period}
                    accessibilityRole="radio"
                    accessibilityLabel={[
                      planTitle(product),
                      best,
                      product.displayPrice + " " + perPeriod(product),
                      detail,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                    accessibilityState={{
                      selected,
                      checked: selected,
                      disabled: busy !== null,
                    }}
                    disabled={busy !== null}
                    onPress={() => {
                      if (selected) return;
                      tap("select");
                      setChosen(product.id);
                    }}
                    style={({ pressed }) => [
                      styles.plan,
                      selected && styles.chosen,
                      pressed && !selected && { backgroundColor: Theme.pressed },
                    ]}
                  >
                    <Icon
                      name={selected ? "checkmark.circle.fill" : "circle"}
                      size={26}
                      color={selected ? Theme.accent : Theme.muted}
                    />
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <View style={styles.planName}>
                        <Text
                          maxFontSizeMultiplier={MaxScale.paywallTitle}
                          style={[
                            styles.planTitle,
                            selected && { color: Theme.accent },
                          ]}
                        >
                          {planTitle(product)}
                        </Text>
                        {!!best && (
                          <View
                            style={[
                              styles.best,
                              selected && { backgroundColor: Theme.accent },
                            ]}
                          >
                            <Text
                              style={[
                                styles.bestText,
                                selected && { color: Theme.onAccent },
                              ]}
                            >
                              {best}
                            </Text>
                          </View>
                        )}
                      </View>
                      {!!detail && (
                        <Text
                          maxFontSizeMultiplier={MaxScale.paywallTitle}
                          style={[
                            s.footnote,
                            styles.tabular,
                            selected && { color: Theme.onMedia },
                          ]}
                        >
                          {detail}
                        </Text>
                      )}
                    </View>
                    <View style={styles.priceBlock}>
                      <Text
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.7}
                        maxFontSizeMultiplier={MaxScale.paywallTitle}
                        style={[
                          styles.price,
                          selected && { color: Theme.accent },
                        ]}
                      >
                        {product.displayPrice}
                      </Text>
                      <Text
                        style={[s.footnote, selected && { color: Theme.onMedia }]}
                      >
                        {perPeriod(product)}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}

          <Text style={s.muted}>
            {SINGLE_FLOW
              ? t(
                  "Önizleme ücretsiz. Videoyu oluşturup kaydetmek için Vidora Pro gerekir." +
                    (fromEditor
                      ? " Kapatırsan düzenlemelerin taslak olarak kalır."
                      : ""),
                  "The preview is free. Creating and saving a video needs Vidora Pro." +
                    (fromEditor ? " If you close this, your edits stay as a draft." : ""),
                )
              : t(
                  "Önizleme ücretsiz. Videoyu ya da görseli oluşturup kaydetmek için Vidora Pro gerekir.",
                  "The preview is free. Creating and saving a video or an image needs Vidora Pro.",
                )}
          </Text>

          <View style={{ gap: Space.s }}>
            {facts.map((fact) => (
              <View key={fact} style={styles.fact}>
                <Icon name="checkmark" size={14} color={Theme.text} />
                <Text style={[s.muted, { flex: 1 }]}>{fact}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.legal}>
            {t(
              "Ödeme, satın alma onayında Apple Hesabından alınır. Abonelik, geçerli dönemin bitiminden en az 24 saat önce iptal edilmezse otomatik olarak yenilenir. App Store hesap ayarlarından dilediğin zaman yönetebilir veya iptal edebilirsin.",
              "Payment is charged to your Apple Account at confirmation of purchase. The subscription renews automatically unless it is cancelled at least 24 hours before the end of the current period. Manage or cancel it anytime in your App Store account settings.",
            )}
          </Text>
        </View>
        {bigText && footer}
      </ScrollView>

      {/* Outside the scroll view, so it stays visible. */}
      <Pressable
        testID="paywall-close"
        accessibilityRole="button"
        accessibilityLabel={t("Pro ekranını kapat", "Close the Pro screen")}
        onPress={close}
        style={({ pressed }) => [styles.close, pressed && Press.filled]}
      >
        <View
          style={[
            styles.closeDisc,
            { backgroundColor: shown ? Theme.scrim : Theme.raised },
          ]}
        >
          <Icon
            name="xmark"
            size={15}
            color={shown ? Theme.onMedia : Theme.text}
          />
        </View>
      </Pressable>

      {!bigText && footer}
    </View>
  );
}

function FooterLink({
  label,
  accessibilityLabel,
  onPress,
  disabled = false,
  link = false,
  testID,
}: {
  label: string;
  testID?: string;
  accessibilityLabel?: string;
  onPress: () => void;
  disabled?: boolean;
  link?: boolean;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole={link ? "link" : "button"}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={{ top: 0, bottom: 0, left: 4, right: 4 }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.link,
        (pressed || disabled) && Press.text,
      ]}
    >
      <Text
        maxFontSizeMultiplier={MaxScale.paywallTitle}
        style={styles.linkText}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frameBlock: { gap: Space.s },
  frame: {
    height: 150,
    borderRadius: Radius.xl,
    overflow: "hidden",
    backgroundColor: Theme.surface,
  },
  close: {
    position: "absolute",
    top: Space.s,
    right: Space.s,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  watermark: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  watermarkText: {
    ...s.caption,
    color: Theme.onMedia,
    backgroundColor: Theme.scrim,
    paddingHorizontal: Space.s,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
    letterSpacing: 2,
  },
  trialNote: {
    color: Theme.text,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "600",
    textAlign: "center",
  },
  closeDisc: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    paddingHorizontal: Space.gutter,
    paddingTop: Space.xl,
    gap: Space.l,
  },
  // Room on the right for the close button.
  // Padding derived at the cap the heading Text uses (MaxScale.paywallTitle).
  heading: {
    ...Type.display,
    ...displayMetrics(36, MaxScale.paywallTitle),
    paddingRight: 40,
  },
  mark: {
    width: 48,
    height: 6,
    borderRadius: 3,
    backgroundColor: Theme.accent,
  },
  fact: { flexDirection: "row", alignItems: "flex-start", gap: Space.s },
  failed: { gap: Space.m },
  plan: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.m,
    minHeight: 76,
    paddingHorizontal: Space.l,
    paddingVertical: Space.m,
    borderRadius: Radius.l,
    borderWidth: 1.5,
    borderColor: Theme.text,
  },
  chosen: { backgroundColor: Theme.text },
  planName: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: Space.s,
  },
  planTitle: { ...Type.title, fontSize: 20, lineHeight: 26 },
  priceBlock: { alignItems: "flex-end", gap: 2, flexShrink: 1, maxWidth: 150 },
  price: {
    ...Type.numeric,
    color: Theme.text,
    fontSize: 22,
    lineHeight: 28,
  },
  tabular: { fontVariant: ["tabular-nums"] },
  best: {
    paddingHorizontal: Space.s,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: Theme.text,
  },
  bestText: { ...s.caption, color: Theme.accent },
  skeleton: {
    height: 76,
    borderRadius: Radius.l,
    backgroundColor: Theme.surface,
  },
  legal: { color: Theme.muted, fontSize: 13, lineHeight: 18 },
  footer: {
    paddingHorizontal: Space.gutter,
    paddingTop: Space.m,
    gap: Space.s,
    backgroundColor: Theme.bg,
  },
  footerPinned: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.line,
  },
  renewal: {
    color: Theme.text,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  links: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
    columnGap: Space.m,
  },
  link: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: Space.xs,
  },
  linkText: { color: Theme.muted, fontSize: 13, lineHeight: 18 },
});
