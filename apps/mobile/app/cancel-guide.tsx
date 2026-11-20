import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { usePro } from "../src/pro-context";
import {
  Button,
  Notice,
  Screen,
  Space,
  Txt,
  openPage,
  s,
  useT,
} from "../src/ui";

const MANAGE_URL = "https://apps.apple.com/account/subscriptions";
/** Apple's own page for asking about a refund. Apple decides; we promise nothing. */
const REFUND_URL = "https://reportaproblem.apple.com";

/** How to cancel a Vidora Pro subscription and where to ask Apple about a refund. */
export default function CancelGuide() {
  const t = useT(),
    pro = usePro(),
    [problem, setProblem] = useState(false);
  const failed = () => setProblem(true);
  const steps = [
    t(
      "iPhone'da Ayarlar'ı aç.",
      "Open Settings on your iPhone.",
    ),
    t(
      "En üstteki adına (Apple Hesabın) dokun.",
      "Tap your name (Apple Account) at the top.",
    ),
    t("Abonelikler'e dokun.", "Tap Subscriptions."),
    t(
      "Vidora Pro'yu seç ve Aboneliği İptal Et'e dokun.",
      "Choose Vidora Pro and tap Cancel Subscription.",
    ),
  ];
  const manage = () => {
    setProblem(false);
    pro.manage().catch(() => openPage(MANAGE_URL, failed));
  };
  return (
    <Screen back title={t("Abonelik iptal ve iade", "Cancel and refunds")}>
      <Txt muted>
        {t(
          "Aboneliğini istediğin zaman iptal edebilirsin. Abonelik Apple Hesabın üzerinden yönetilir; iptal edersen dönem sonuna kadar Pro açık kalır. Yenilenme tarihinden en az 24 saat önce iptal etmelisin.",
          "You can cancel your subscription at any time. It is managed through your Apple Account; if you cancel, Pro stays on until the end of the period. Cancel at least 24 hours before the renewal date.",
        )}
      </Txt>
      <View style={styles.steps}>
        {steps.map((step, index) => (
          <View key={index} style={styles.step}>
            <Text style={[s.footnoteStrong, styles.number]}>{index + 1}</Text>
            <Text style={[s.text, { flex: 1 }]}>{step}</Text>
          </View>
        ))}
      </View>
      {problem && (
        <Notice
          text={t(
            "Sayfa açılamadı. İnternet bağlantını kontrol edip tekrar dene.",
            "The page could not be opened. Check your connection and try again.",
          )}
        />
      )}
      <Button
        primary
        testID="cancel-open-subscriptions"
        label={t("Aboneliklerimi aç", "Open my subscriptions")}
        onPress={manage}
      />
      <Txt muted>
        {t(
          "İade istekleri Apple tarafından değerlendirilir; sonucu Apple belirler. Başvuru için Apple'ın sayfasını kullanabilirsin.",
          "Refund requests are handled by Apple, which makes the decision. You can use Apple's page to submit one.",
        )}
      </Txt>
      <Button
        testID="cancel-refund-link"
        label={t("İade için Apple'a başvur", "Request a refund from Apple")}
        onPress={() => openPage(REFUND_URL, failed)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  steps: { gap: Space.m },
  step: { flexDirection: "row", alignItems: "flex-start", gap: Space.m },
  number: { width: 20, textAlign: "center" },
});
