import { useCallback, useContext, useState } from "react";
import {
  Alert,
  Text,
  useWindowDimensions,
} from "react-native";
import Constants from "expo-constants";
import { useFocusEffect, useRouter } from "expo-router";
import {
  Icon,
  Language,
  Row,
  Screen,
  Section,
  Theme,
  openPage,
  s,
  useT,
} from "../../../src/ui";
import { showActionSheet } from "../../../src/action-sheet";
import { clear } from "../../../src/media";
import { forgetPosters } from "../../../src/sample-frames";
import { FEATURES } from "../../../src/config";
import { PRIVACY_URL, SUPPORT_URL, forgetPairing } from "../../../src/pairing";
import { TERMS_URL } from "../../../src/pro";
import { usePro } from "../../../src/pro-context";
import { storeProblem } from "../../../src/pro-rules";
import { hasAiConsent, revokeAiConsent } from "../../../src/ai-consent";
import { cloudAvailable } from "../../../src/cloud";
import { useAuth } from "../../../src/auth/context";
import { COPY } from "../../../src/auth/copy";
import { LANGS, LANG_NAMES, type LangChoice } from "../../../src/i18n/lang";

/** Apple's own subscription management page. */
const MANAGE_URL = "https://apps.apple.com/account/subscriptions";

/**
 * The "Hesap" section: one row that opens the account screen. Rendered only
 * when FEATURES.accounts is on (see the call site), so with the flag off none
 * of this exists. While the session is still being restored it shows the
 * signed-out value. The value sits at the right and is cut in the middle when
 * long; from Dynamic Type "xLarge" up it moves under the label and wraps.
 */
function AccountSection() {
  const { lang } = useContext(Language),
    router = useRouter(),
    { session } = useAuth(),
    { fontScale } = useWindowDimensions();
  const value =
    session.status === "signedIn" ? session.email : COPY.notSignedIn[lang];
  const stacked = fontScale > 1.05;
  return (
    <Section inset title={COPY.settingsSection[lang]}>
      <Row
        first
        testID="settings-account"
        icon="person.crop.circle"
        label={COPY.settingsRow[lang]}
        accessibilityLabel={COPY.settingsRow[lang] + ", " + value}
        detail={stacked ? value : undefined}
        trailing={
          stacked ? undefined : (
            <Text
              numberOfLines={1}
              ellipsizeMode="middle"
              style={[s.rowValue, { flexShrink: 1, maxWidth: "62%" }]}
            >
              {value}
            </Text>
          )
        }
        chevron
        onPress={() => router.push("/account")}
      />
    </Section>
  );
}

export default function Settings() {
  const { lang, choice, setChoice } = useContext(Language),
    [langOpen, setLangOpen] = useState(false),
    t = useT(),
    router = useRouter(),
    pro = usePro(),
    [storeJob, setStoreJob] = useState<null | "restore" | "manage">(null),
    [aiConsent, setAiConsent] = useState(false);
  useFocusEffect(
    useCallback(() => {
      let live = true;
      void hasAiConsent().then((value) => {
        if (live) setAiConsent(value);
      });
      return () => {
        live = false;
      };
    }, []),
  );

  function storeFailed(error: unknown) {
    Alert.alert(
      t("App Store'a ulaşılamadı", "Couldn't reach the App Store"),
      storeProblem(error) === "unverified"
        ? t(
            "App Store bu işlemi doğrulayamadı.",
            "The App Store could not verify this transaction.",
          )
        : t(
            "App Store'a şu anda ulaşılamıyor. Daha sonra tekrar dene.",
            "The App Store is unavailable right now. Try again later.",
          ),
    );
  }
  const restore = () => {
    setStoreJob("restore");
    pro
      .restore()
      .then((found) =>
        found
          ? Alert.alert(t("Vidora Pro geri yüklendi", "Vidora Pro restored"))
          : Alert.alert(
              t("Etkin abonelik bulunamadı", "No active subscription found"),
              t(
                "Bu Apple Hesabında etkin bir Vidora Pro aboneliği yok.",
                "This Apple Account has no active Vidora Pro subscription.",
              ),
            ),
      )
      .catch(storeFailed)
      .finally(() => setStoreJob(null));
  };
  const manage = () => {
    setStoreJob("manage");
    pro
      .manage()
      // Without the system sheet, Apple's subscription page in the browser.
      .catch(() => openPage(MANAGE_URL, pageFailed))
      .finally(() => setStoreJob(null));
  };
  const pageFailed = () =>
    Alert.alert(
      t("Sayfa açılamadı", "The page could not be opened"),
      t(
        "İnternet bağlantını kontrol edip tekrar dene.",
        "Check your internet connection and try again.",
      ),
    );

  const version = Constants.expoConfig?.version ?? "—";
  const build =
    Constants.platform?.ios?.buildNumber ??
    Constants.expoConfig?.ios?.buildNumber ??
    null;

  const eraseLibrary = () =>
    showActionSheet(
      {
        title: t("Yerel kitaplık temizlensin mi?", "Erase the local library?"),
        message: FEATURES.aiStudio
          ? t(
              "Videolar, taslaklar, içe aktarılan klipler, müzikler, kurgu projeleri ve kayıtlı iş istasyonu eşleştirmesi bu iPhone'dan silinir. Fotoğraflar'a kaydettiklerin kalır. Bu işlem geri alınamaz.",
              "Videos, drafts, imported clips, music, editing projects and the saved workstation pairing are removed from this iPhone. What you saved to Photos stays. This can't be undone.",
            )
          : t(
              "Videolar, taslaklar, içe aktarılan klipler, müzikler ve kurgu projeleri bu iPhone'dan silinir. Fotoğraflar'a kaydettiklerin kalır. Bu işlem geri alınamaz.",
              "Videos, drafts, imported clips, music and editing projects are removed from this iPhone. What you saved to Photos stays. This can't be undone.",
            ),
        options: [
          t("Kitaplığı temizle", "Erase library"),
          t("Vazgeç", "Cancel"),
        ],
        destructiveButtonIndex: 0,
        cancelButtonIndex: 1,
      },
      (index) => {
        if (index !== 0) return;
        void (async () => {
          try {
            // Media, drafts, edit states, projects and the app's caches
            // (posters, preview frames, cut-outs, picked photos).
            clear();
            forgetPosters();
            await forgetPairing();
            Alert.alert(t("Kitaplık temizlendi", "Library erased"));
          } catch (error) {
            console.warn("[settings] erase failed", error);
            Alert.alert(
              t("Kitaplık temizlenemedi", "The library could not be erased"),
              t(
                "Uygulamayı kapatıp tekrar dene.",
                "Close the app and try again.",
              ),
            );
          }
        })();
      },
    );

  const pickLanguage = (next: LangChoice) => {
    setChoice(next);
    setLangOpen(false);
  };
  const langMark = (selected: boolean) =>
    selected ? <Icon name="checkmark" size={16} color={Theme.text} /> : null;
  const revokeAi = () =>
    void revokeAiConsent().then(() => {
      setAiConsent(false);
      Alert.alert(
        t("AI Sahne izni geri alındı", "AI Scene permission withdrawn"),
        t(
          "Bir sonraki kullanımda yeniden sorulur.",
          "You will be asked again next time.",
        ),
      );
    });

  const basePrivacyText = FEATURES.aiStudio
    ? t(
        "Yerel düzenleyici, medya ve çıktıları uygulama alanında saklar. Üretim motoruna gönderilen sahne tarifleri ve görseller yalnızca eşleştirdiğin kendi iş istasyonuna iletilir. İş istasyonu adresi ve erişim anahtarı bu cihazın iOS Anahtar Zinciri'nde saklanır. İş istasyonundaki verilerini AI Stüdyo ekranından silebilirsin.",
        "The local editor stores media and exports inside this app. Generation prompts and images go only to the workstation you pair. The workstation address and access key are stored in this device's iOS Keychain. Delete your workstation data from the AI Studio screen.",
      )
    : t(
        "Ürün fotoğrafların, ayırma sonuçların ve videoların yalnızca bu cihazda işlenir ve saklanır. Vidora hesap açtırmaz ve seni takip etmez. Uygulama açılırken güncelleme olup olmadığına bakar; bu istek uygulama sürümünü, platformu, rastgele bir kurulum kimliğini ve IP adresini (çökme sonrasında kısa bir hata günlüğünü de) Expo'nun güncelleme hizmetine iletir, seninle ilişkilendirilmez ve takip için kullanılmaz.",
        "Your product photos, cut-outs and videos are processed and stored only on this device. Vidora has no account and does not track you. When the app opens it checks for updates; this sends the app version, platform, a random installation ID and your IP address (after a crash, a short error log) to Expo's update service, and is not linked to you or used for tracking.",
      );
  // Accounts on: only the "no account" sentence changes (the account is
  // optional; its e-mail address is kept by Firebase Authentication, as the
  // privacy policy says). Off: the text above, untouched.
  const privacyText = FEATURES.accounts
    ? basePrivacyText.replace(
        t(
          "Vidora hesap açtırmaz ve seni takip etmez.",
          "Vidora has no account and does not track you.",
        ),
        t(
          "Hesap isteğe bağlıdır; açarsan e-posta adresin ve şifren Google Firebase Authentication'a gönderilir ve e-posta adresin orada saklanır. Vidora seni takip etmez.",
          "An account is optional; if you create one, your email address and password are sent to Google Firebase Authentication, which keeps your email address. Vidora does not track you.",
        ),
      )
    : basePrivacyText;

  return (
    <Screen title={t("Ayarlar", "Settings")}>
      {FEATURES.accounts ? <AccountSection /> : null}

      <Section inset title={t("Abonelik", "Subscription")}>
        <Row
          first
          testID="settings-pro"
          icon="star"
          label="Vidora Pro"
          value={
            pro.loading
              ? t("Denetleniyor…", "Checking…")
              : pro.isPro
                ? t("Etkin", "Active")
                : t("Abone değil", "Not subscribed")
          }
          detail={
            !pro.loading && !pro.isPro
              ? t("Video oluşturmak için", "To create videos")
              : undefined
          }
          onPress={pro.isPro ? manage : () => router.push("/paywall")}
        />
        {pro.isPro && (
          <Row
            testID="settings-manage"
            icon="creditcard"
            label={t("Aboneliği yönet", "Manage subscription")}
            chevron={false}
            busy={storeJob === "manage"}
            disabled={storeJob === "restore"}
            onPress={manage}
          />
        )}
        {pro.storeAvailable && (
          <Row
            testID="settings-restore"
            icon="arrow.clockwise"
            label={t("Satın alımları geri yükle", "Restore purchases")}
            chevron={false}
            busy={storeJob === "restore"}
            disabled={storeJob === "manage"}
            onPress={restore}
          />
        )}
      </Section>

      <Section inset>
        <Row
          first
          testID="settings-language"
          icon="globe"
          label={t("Dil", "Language")}
          value={
            choice === "system" ? t("Sistem", "System") : LANG_NAMES[lang]
          }
          onPress={() => setLangOpen((open) => !open)}
        />
        {langOpen && (
          <Row
            testID="lang-system"
            label={t("Sistem dili", "System language")}
            trailing={langMark(choice === "system")}
            onPress={() => pickLanguage("system")}
          />
        )}
        {langOpen &&
          LANGS.map((code) => (
            <Row
              key={code}
              testID={`lang-option-${code}`}
              label={LANG_NAMES[code]}
              trailing={langMark(choice === code)}
              onPress={() => pickLanguage(code)}
            />
          ))}
        <Row
          testID="brandkit-open"
          icon="paintpalette"
          label={t("Marka kiti", "Brand kit")}
          onPress={() => router.push("/brand-kit")}
        />
      </Section>

      <Section inset title={t("Veri", "Data")}>
        {cloudAvailable() && aiConsent && (
          <Row
            first
            icon="photo.on.rectangle.angled"
            label={t("AI Sahne iznini geri al", "Withdraw AI Scene permission")}
            detail={t(
              "Bir sonraki kullanımda yeniden sorulur.",
              "You will be asked again next time.",
            )}
            chevron={false}
            onPress={revokeAi}
          />
        )}
        <Row
          first={!(cloudAvailable() && aiConsent)}
          danger
          testID="settings-erase"
          icon="trash"
          label={t("Yerel kitaplığı temizle", "Erase local library")}
          onPress={eraseLibrary}
        />
      </Section>

      <Section
        inset
        title={t("Hakkında ve destek", "About and support")}
        footer={privacyText}
      >
        <Row
          first
          external
          testID="settings-privacy"
          icon="hand.raised"
          label={t("Gizlilik Politikası", "Privacy Policy")}
          onPress={() => openPage(PRIVACY_URL, pageFailed)}
        />
        <Row
          external
          testID="settings-terms"
          icon="doc.text"
          label={t("Kullanım Koşulları", "Terms of Use")}
          onPress={() => openPage(TERMS_URL, pageFailed)}
        />
        <Row
          testID="settings-cancel-guide"
          icon="questionmark"
          label={t("Abonelik iptal ve iade", "Cancel and refunds")}
          onPress={() => router.push("/cancel-guide")}
        />
        <Row
          external
          testID="settings-support"
          icon="questionmark"
          label={t("Destek", "Support")}
          onPress={() => openPage(SUPPORT_URL, pageFailed)}
        />
        <Row
          testID="settings-licenses"
          icon="doc.text"
          label={t("Lisanslar", "Licenses")}
          onPress={() => router.push("/licenses")}
        />
      </Section>

      {FEATURES.testerPro ? (
        <Text style={[s.footnote, { textAlign: "center" }]}>
          {t("Deneme sürümü: Pro açık", "Test build: Pro unlocked")}
        </Text>
      ) : null}

      <Text style={[s.footnote, { textAlign: "center" }]}>
        {t("Vidora sürüm ", "Vidora version ") +
          (build ? `${version} (${build})` : version)}
      </Text>
    </Screen>
  );
}
