/**
 * The AI consent sheet (App Review 5.1.2(i)), shown before the first cloud
 * request: AI Sahne (app/ai-studio.tsx) and the editorial video's shots
 * (app/create.tsx). The answer is stored by src/ai-consent.ts.
 */
import { Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Linking from "expo-linking";
import { AI_PROVIDER } from "../cloud-rules";
import { PRIVACY_URL } from "../pairing";
import { Button, Icon, Space, Theme, Txt, s, useT, type IconName } from "../ui";

/** App Review 5.1.2(i): names the provider and what is sent, before the first request. */
export function ConsentSheet({
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
        "Ürün fotoğrafın (arka planı kaldırılmış, düz zeminli hâli) buluta gönderilir. Yapay zekâ ürünü seçtiğin sahneye yerleştiren yeni bir fotoğraf üretir.",
        "Your product photo (cut out, on a plain background) is sent to the cloud. The AI makes a new photo that places your product in the scene you chose.",
      ),
    },
    {
      icon: "paperplane",
      text: t(
        "Gönderilen: ürün fotoğrafın, seçtiğin sahne stili ve aboneliğini doğrulamak için App Store'un imzaladığı abonelik bilgisi (ürün, işlem numarası, bitiş tarihi). Adın, e-postan veya ödeme bilgin gönderilmez.",
        "Sent: your product photo, the scene style you choose and the App Store-signed subscription record used to verify your subscription (product, transaction number, expiry). No name, email or payment details.",
      ),
    },
    {
      icon: "server.rack",
      text: t(
        `İşleyen: ${AI_PROVIDER}, FLUX.2 [klein] modeliyle. Vidora'nın sunucusu fotoğrafı saklamaz; yalnızca günlük kullanım sayacını tutar.`,
        `Processed by: ${AI_PROVIDER}, with the FLUX.2 [klein] model. Vidora's server does not keep the photo; it keeps only a daily usage counter.`,
      ),
    },
    {
      icon: "hand.raised",
      text: t(
        "Vidora'nın diğer tüm özellikleri, şablonlar dahil, telefonunda çalışmaya devam eder. AI Sahne'yi kullanmayı bıraktığında hiçbir şey gönderilmez.",
        "Every other Vidora feature, templates included, keeps working on your phone. If you stop using AI Scene, nothing is sent.",
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
              "Sahneyi telefon değil, üçüncü taraf bir yapay zekâ servisi üretir. Devam etmeden önce neyin paylaşıldığını bil:",
              "The scene is made by a third-party AI service, not your phone. Before you continue, here is what is shared:",
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
  sheet: {
    paddingHorizontal: Space.gutter,
    paddingTop: Space.xl,
    paddingBottom: Space.xxl * 2,
    gap: Space.l,
  },
  point: { flexDirection: "row", gap: Space.m, alignItems: "flex-start" },
});
