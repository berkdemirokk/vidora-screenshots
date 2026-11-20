import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, AppState, Switch, View } from "react-native";
import * as Picker from "expo-document-picker";
import { File } from "expo-file-system";
import { Redirect, useRouter } from "expo-router";
import { FEATURES } from "../src/config";
import {
  api,
  type Capabilities,
  type Job,
  type Project,
  type Ratio,
} from "../src/studio";
import { Button, Field, Screen, Theme, Txt, s, useT } from "../src/ui";
import { storeOutput, share, shareCaptions } from "../src/media";
import {
  PAIRING_PLACEHOLDER,
  checkAddress,
  forgetPairing,
  forgetPairingToken,
  isAuthError,
  loadPairing,
  savePairing,
  type AddressProblem,
} from "../src/pairing";

type Translate = ReturnType<typeof useT>;
type StudioClient = ReturnType<typeof api>;

function addressProblemText(problem: AddressProblem, t: Translate): string {
  switch (problem) {
    case "empty":
      return t(
        "İş istasyonu adresini gir (ör. " + PAIRING_PLACEHOLDER + ").",
        "Enter the workstation address (e.g. " + PAIRING_PLACEHOLDER + ").",
      );
    case "invalid":
      return t(
        "Bu geçerli bir adres değil. https:// ile başlayan tam adresi gir.",
        "That is not a valid address. Enter the full address starting with https://.",
      );
    case "not_https":
      return t(
        "Adres https:// ile başlamalı. iOS şifrelenmemiş HTTP bağlantılarını engeller.",
        "The address must start with https://. iOS blocks unencrypted HTTP connections.",
      );
    case "loopback":
      return t(
        "localhost / 127.0.0.1 iPhone'un kendisini gösterir, bilgisayarını değil. İş istasyonunun özel ağ (ör. Tailscale) HTTPS adresini kullan.",
        "localhost / 127.0.0.1 points at the iPhone itself, not your computer. Use the workstation's private-network (e.g. Tailscale) HTTPS address.",
      );
    case "has_path":
      return t(
        "Yalnızca sunucu adresini gir; yol, sorgu veya # ekleme.",
        "Enter only the server address, without a path, query or #.",
      );
    case "has_credentials":
      return t(
        "Adrese kullanıcı adı veya parola ekleme; erişim anahtarını aşağıdaki alana gir.",
        "Do not put a username or password in the address; enter the access key below.",
      );
  }
}

function describeError(error: unknown, t: Translate): string {
  const text = String(error);
  if (isAuthError(error))
    return t(
      "İş istasyonu erişim anahtarını reddetti. Anahtarı kontrol edip yeniden gir.",
      "The workstation rejected the access key. Check it and enter it again.",
    );
  if (/Network request failed|Failed to fetch|timed out/i.test(text))
    return t(
      "İş istasyonuna ulaşılamadı. Bilgisayarın açık, Vidora API çalışıyor ve iPhone aynı özel ağda (ör. Tailscale) olmalı.",
      "Could not reach the workstation. Make sure the computer is on, the Vidora API is running and the iPhone is on the same private network (e.g. Tailscale).",
    );
  return error instanceof Error ? error.message : text;
}

function PairingHelp({ t }: { t: Translate }) {
  const [open, setOpen] = useState(false);
  const steps = [
    t(
      "Bilgisayarında (iş istasyonu) Vidora API'yi çalıştır.",
      "Run the Vidora API on your computer (the workstation).",
    ),
    t(
      "API'yi özel bir ağ üzerinden HTTPS ile aç: ör. Tailscale HTTPS (`tailscale serve`) ya da geçerli sertifikalı bir ters proxy.",
      "Expose the API over HTTPS on a private network: e.g. Tailscale HTTPS (`tailscale serve`) or a reverse proxy with a valid certificate.",
    ),
    t(
      "O HTTPS adresini ve çalışma alanı erişim anahtarını aşağıya gir.",
      "Enter that HTTPS address and the workspace access key below.",
    ),
  ];
  return (
    <View style={{ gap: 8 }}>
      <Button
        label={
          open
            ? t("Eşleştirme yardımını gizle", "Hide pairing help")
            : t("Nasıl eşleştirilir?", "How to pair")
        }
        selected={open}
        onPress={() => setOpen(!open)}
      />
      {open && (
        <View style={{ gap: 6 }}>
          {steps.map((step, index) => (
            <Txt key={index} muted>
              {index + 1 + ". " + step}
            </Txt>
          ))}
          <Txt muted>
            {t(
              "Video üretimi tamamen kendi bilgisayarında çalışır; Vidora bir bulut sunucusu sağlamaz. Uygulamadaki düzenleyici iş istasyonu olmadan da çalışır.",
              "Generation runs entirely on your own computer; Vidora does not provide a cloud server. The app's editor works without a workstation.",
            )}
          </Txt>
        </View>
      )}
    </View>
  );
}

function PairingForm({
  base,
  token,
  onChangeBase,
  onChangeToken,
  onConnect,
  onForget,
  busy,
  connecting,
  hasSaved,
}: {
  base: string;
  token: string;
  onChangeBase: (value: string) => void;
  onChangeToken: (value: string) => void;
  onConnect: () => void;
  onForget: () => void;
  busy: boolean;
  connecting: boolean;
  hasSaved: boolean;
}) {
  const t = useT();
  if (connecting)
    return (
      <View
        style={[s.panel, { alignItems: "center" }]}
        accessible
        accessibilityLiveRegion="polite"
        accessibilityLabel={t(
          "Kayıtlı iş istasyonuna bağlanılıyor",
          "Connecting to saved workstation",
        )}
      >
        <ActivityIndicator color={Theme.text} />
        <Txt muted>
          {t(
            "Kayıtlı iş istasyonuna bağlanılıyor…",
            "Connecting to saved workstation…",
          )}
        </Txt>
      </View>
    );
  return (
    <View style={s.panel}>
      <Txt muted>
        {t(
          "Kendi bilgisayarındaki Vidora iş istasyonuyla eşleştir. Adres ve erişim anahtarı bu cihazın iOS Anahtar Zinciri'nde saklanır ve uygulama açıldığında otomatik bağlanılır.",
          "Pair with the Vidora workstation on your own computer. The address and access key are stored in this device's iOS Keychain and the app reconnects automatically on launch.",
        )}
      </Txt>
      <PairingHelp t={t} />
      <Field
        label={t("İş istasyonu adresi (HTTPS)", "Workstation address (HTTPS)")}
        value={base}
        onChangeText={onChangeBase}
        placeholder={PAIRING_PLACEHOLDER}
        keyboardType="url"
        textContentType="URL"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Field
        label={t("Erişim anahtarı", "Access key")}
        value={token}
        onChangeText={onChangeToken}
        secureTextEntry
        textContentType="password"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Button
        primary
        disabled={busy || !base.trim() || !token.trim()}
        label={
          busy ? t("Bağlanılıyor…", "Connecting…") : t("Bağlan", "Connect")
        }
        onPress={onConnect}
      />
      {hasSaved && (
        <Button
          label={t("Kayıtlı iş istasyonunu unut", "Forget saved workstation")}
          disabled={busy}
          onPress={onForget}
        />
      )}
    </View>
  );
}

// v1 ships without the AI studio; a deep link to /engine goes home instead.
export default function EngineRoute() {
  if (!FEATURES.aiStudio) return <Redirect href="/" />;
  return <Engine />;
}

function Engine() {
  const t = useT();
  const router = useRouter();
  const [base, setBase] = useState(""),
    [token, setToken] = useState(""),
    [hasSaved, setHasSaved] = useState(false),
    [connecting, setConnecting] = useState(false),
    [client, setClient] = useState<StudioClient | null>(null),
    [caps, setCaps] = useState<Capabilities | null>(null);
  const [projects, setProjects] = useState<Project[]>([]),
    [project, setProject] = useState(""),
    [jobs, setJobs] = useState<Job[]>([]),
    [name, setName] = useState(""),
    [prompt, setPrompt] = useState(""),
    [source, setSource] = useState<Picker.DocumentPickerAsset | null>(null),
    [captionSource, setCaptionSource] =
      useState<Picker.DocumentPickerAsset | null>(null),
    [captionLanguage, setCaptionLanguage] = useState<"auto" | "tr" | "en">(
      "auto",
    ),
    [captionRights, setCaptionRights] = useState(false),
    [ratio, setRatio] = useState<Ratio>("16:9"),
    [seconds, setSeconds] = useState("2"),
    [rights, setRights] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const clearSession = () => {
    setClient(null);
    setToken("");
    setCaps(null);
    setProjects([]);
    setProject("");
    setJobs([]);
    setSource(null);
    setCaptionSource(null);
    setCaptionRights(false);
    setPrompt("");
    setName("");
    setRights(false);
  };
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage(describeError(e, t));
    } finally {
      setBusy(false);
    }
  }
  /** Validate, connect, and on success persist the pairing in the Keychain. */
  async function connect(rawBase: string, rawToken: string) {
    const check = checkAddress(rawBase);
    if (!check.ok) throw Error(addressProblemText(check.problem, t));
    const accessKey = rawToken.trim();
    if (!accessKey)
      throw Error(t("Erişim anahtarını gir.", "Enter the access key."));
    const session = api(check.base, accessKey),
      [capabilities, projectList] = await Promise.all([
        session.caps(),
        session.projects(),
      ]);
    await savePairing({ base: check.base, token: accessKey });
    if (!mounted.current) return;
    setBase(check.base);
    setHasSaved(true);
    setCaps(capabilities);
    setProjects(projectList);
    setProject(projectList[0]?.id ?? "");
    setClient(session);
  }
  // Auto-reconnect once on mount when a pairing is stored.
  useEffect(() => {
    let active = true;
    void (async () => {
      let saved: Awaited<ReturnType<typeof loadPairing>>;
      try {
        saved = await loadPairing();
      } catch {
        return;
      }
      if (!active) return;
      if (saved.base) {
        setBase(saved.base);
        setHasSaved(true);
      }
      if (!saved.base || !saved.token) return;
      setToken(saved.token);
      setConnecting(true);
      try {
        await connect(saved.base, saved.token);
      } catch (e) {
        if (!active) return;
        if (isAuthError(e)) {
          await forgetPairingToken().catch(() => {});
          setToken("");
          setMessage(
            t(
              "Kayıtlı erişim anahtarı artık geçerli değil (iş istasyonunda değişmiş veya iptal edilmiş olabilir). Güvenlik için silindi; yeni anahtarı gir.",
              "The saved access key is no longer valid (it may have been changed or revoked on the workstation). It was removed for safety; enter the new key.",
            ),
          );
        } else {
          setMessage(describeError(e, t));
        }
      } finally {
        if (active) setConnecting(false);
      }
    })();
    return () => {
      active = false;
    };
    // Run once on mount; language changes should not trigger a reconnect.
  }, []);
  const forgetWorkstation = () =>
    Alert.alert(
      t("Bu iş istasyonu unutulsun mu?", "Forget this workstation?"),
      t(
        "Kayıtlı adres ve erişim anahtarı bu iPhone'dan silinir. İş istasyonundaki projeler silinmez.",
        "The saved address and access key are removed from this iPhone. Projects on the workstation are not deleted.",
      ),
      [
        { text: t("Vazgeç", "Cancel"), style: "cancel" },
        {
          text: t("Unut", "Forget"),
          style: "destructive",
          onPress: () =>
            void run(async () => {
              await forgetPairing();
              clearSession();
              setBase("");
              setHasSaved(false);
              setMessage(t("İş istasyonu unutuldu.", "Workstation forgotten."));
            }),
        },
      ],
    );
  useEffect(() => {
    if (!client || !project) {
      setJobs([]);
      return;
    }
    let active = true;
    const load = async () => {
      if (AppState.currentState === "background") return;
      try {
        const results = await client.jobs(project);
        if (active) setJobs(results);
      } catch (e) {
        if (active) setMessage(describeError(e, t));
      }
    };
    void load();
    const timer = setInterval(load, 3000);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void load();
    });
    return () => {
      active = false;
      clearInterval(timer);
      sub.remove();
    };
    // `t` only formats messages; polling should not restart on language change.
  }, [client, project]);
  const durationSeconds = Number(seconds),
    validDuration =
      Number.isInteger(durationSeconds) &&
      durationSeconds >= 1 &&
      durationSeconds <= 10,
    generationMode = source ? "image_to_video" : "text_to_video",
    generationAvailable = caps?.[generationMode] === true;
  const unavailableModeText = (() => {
    if (generationAvailable) return "";
    if (!caps?.text_to_video && !caps?.image_to_video)
      return t(
        "Bağlı iş istasyonunda video üretim modeli yapılandırılmamış, bu yüzden üretim kapalı. İş istasyonunda bir metinden/görselden videoya modeli etkinleştir ve yeniden bağlan.",
        "No video generation model is configured on the connected workstation, so generation is off. Enable a text- or image-to-video model on the workstation and reconnect.",
      );
    if (source)
      return t(
        "Bu iş istasyonu görselden video üretimini desteklemiyor. Görseli kaldırarak yalnızca metinle üretebilirsin.",
        "This workstation does not support image-to-video. Remove the image to generate from text only.",
      );
    return t(
      "Bu iş istasyonu yalnızca metinden video üretimini desteklemiyor. Başlangıç görseli ekleyerek görselden video üretebilirsin.",
      "This workstation does not support text-only generation. Add a starting image to generate image-to-video.",
    );
  })();
  return (
    <Screen back title="AI Video Studio">
      {!client ? (
        <PairingForm
          base={base}
          token={token}
          onChangeBase={setBase}
          onChangeToken={setToken}
          busy={busy}
          connecting={connecting}
          hasSaved={hasSaved}
          onForget={forgetWorkstation}
          onConnect={() => void run(() => connect(base, token))}
        />
      ) : (
        <>
          <View style={s.panel}>
            <Txt>{t("Proje", "Project")}</Txt>
            {projects.map((p) => (
              <Button
                key={p.id}
                label={p.name}
                disabled={busy}
                selected={p.id === project}
                onPress={() => setProject(p.id)}
              />
            ))}
            <Button
              label={t("Seçili projeyi sil", "Delete selected project")}
              disabled={busy || !project}
              onPress={() =>
                Alert.alert(
                  t("Projeyi sil", "Delete project"),
                  t(
                    "Proje ve dosyaları silinsin mi?",
                    "Delete the project and its files?",
                  ),
                  [
                    { text: t("Vazgeç", "Cancel"), style: "cancel" },
                    {
                      text: t("Sil", "Delete"),
                      style: "destructive",
                      onPress: () =>
                        void run(async () => {
                          await client.remove(project);
                          const remaining = projects.filter(
                            (p) => p.id !== project,
                          );
                          setProjects(remaining);
                          setProject(remaining[0]?.id ?? "");
                          setJobs([]);
                        }),
                    },
                  ],
                )
              }
            />
            <Field
              label={t("Yeni proje adı", "New project name")}
              value={name}
              onChangeText={setName}
              maxLength={100}
            />
            <Button
              label={t("Proje oluştur", "Create project")}
              disabled={busy || !name.trim()}
              onPress={() =>
                void run(async () => {
                  const p = await client.create(name);
                  setProjects([p, ...projects]);
                  setProject(p.id);
                  setName("");
                })
              }
            />
          </View>
          <View style={s.panel}>
            <Field
              label={t("Sahne tarifi", "Scene prompt")}
              multiline
              maxLength={1200}
              value={prompt}
              onChangeText={setPrompt}
            />
            <Button
              label={
                source
                  ? source.name
                  : t("Başlangıç görseli ekle", "Add starting image")
              }
              onPress={() =>
                void run(async () => {
                  const choice = await Picker.getDocumentAsync({
                    type: ["image/jpeg", "image/png"],
                    copyToCacheDirectory: true,
                  });
                  if (!choice.canceled) {
                    const image = choice.assets[0];
                    if (
                      (image.size ?? new File(image.uri).size) >
                      64 * 1024 * 1024
                    )
                      throw Error("64 MB limit");
                    setSource(image);
                  }
                })
              }
            />
            {source && (
              <Button
                label={t("Görseli kaldır", "Remove image")}
                onPress={() => setSource(null)}
              />
            )}
            <View style={s.row}>
              {(["16:9", "9:16", "1:1"] as const).map((r) => (
                <Button
                  key={r}
                  selected={ratio === r}
                  label={r}
                  onPress={() => setRatio(r)}
                />
              ))}
            </View>
            <Field
              label={t("Süre (1–10 sn)", "Duration (1–10 s)")}
              value={seconds}
              keyboardType="number-pad"
              onChangeText={setSeconds}
            />
            <Txt>
              {t(
                "İçeriğin ve yüz/ses kullanımının izinleri bende.",
                "I hold the content rights and face/voice permissions.",
              )}
            </Txt>
            <Switch
              accessibilityLabel={t("Kullanım izinleri", "Usage consent")}
              value={rights}
              onValueChange={setRights}
            />
            {!generationAvailable && <Txt muted>{unavailableModeText}</Txt>}
            {generationAvailable && !validDuration && (
              <Txt muted>
                {t(
                  "Süre 1 ile 10 arasında tam sayı olmalı.",
                  "Duration must be a whole number from 1 to 10.",
                )}
              </Txt>
            )}
            <Button
              primary
              label={
                busy
                  ? t("İşleniyor…", "Working…")
                  : t("Üretimi başlat", "Start generation")
              }
              disabled={
                busy ||
                !generationAvailable ||
                !project ||
                !prompt.trim() ||
                !rights ||
                !validDuration
              }
              onPress={() =>
                void run(async () => {
                  let mediaId: string | undefined;
                  if (source) {
                    const image = new File(source.uri),
                      bytes = await image.bytes();
                    mediaId = (
                      await client.upload(
                        project,
                        bytes,
                        source.mimeType ?? image.type,
                      )
                    ).id;
                  }
                  await client.submit(project, {
                    kind: generationMode,
                    media_id: mediaId,
                    prompt,
                    aspect_ratio: ratio,
                    duration_seconds: durationSeconds,
                    rights_confirmed: true,
                  });
                  setJobs(await client.jobs(project));
                })
              }
            />
          </View>
          <View style={s.panel}>
            <Txt>{t("Otomatik altyazı", "Automatic captions")}</Txt>
            <Txt muted>
              {t(
                "Video iş istasyonunda yazıya çevrilir. Sonucu paylaşmadan önce gözden geçir.",
                "The workstation transcribes the video. Review the result before sharing.",
              )}
            </Txt>
            <Button
              label={captionSource?.name ?? t("MP4 seç", "Choose MP4")}
              disabled={busy}
              onPress={() =>
                void run(async () => {
                  const result = await Picker.getDocumentAsync({
                    type: "video/mp4",
                    copyToCacheDirectory: true,
                  });
                  if (!result.canceled) setCaptionSource(result.assets[0]);
                })
              }
            />
            <Txt>{t("Konuşma dili", "Speech language")}</Txt>
            <View style={s.row}>
              {(["auto", "tr", "en"] as const).map((language) => (
                <Button
                  key={language}
                  label={
                    language === "auto"
                      ? t("Otomatik", "Automatic")
                      : language.toUpperCase()
                  }
                  selected={captionLanguage === language}
                  disabled={busy}
                  onPress={() => setCaptionLanguage(language)}
                />
              ))}
            </View>
            <View style={s.row}>
              <Switch
                accessibilityLabel={t(
                  "Video kullanım hakkı",
                  "Video usage rights",
                )}
                value={captionRights}
                onValueChange={setCaptionRights}
                disabled={busy}
              />
              <Txt>
                {t(
                  "Videoyu kullanma hakkım var.",
                  "I have the right to use this video.",
                )}
              </Txt>
            </View>
            {!caps?.transcribe && (
              <Txt muted>
                {t(
                  "İş istasyonunda altyazı (konuşmayı yazıya çevirme) modeli yapılandırılmamış, bu yüzden altyazı oluşturma kapalı. Modeli iş istasyonunda etkinleştirip yeniden bağlan.",
                  "No caption (speech-to-text) model is configured on the workstation, so caption generation is off. Enable it on the workstation and reconnect.",
                )}
              </Txt>
            )}
            <Button
              label={t("Altyazı oluştur", "Generate captions")}
              disabled={
                busy ||
                !caps?.transcribe ||
                !project ||
                !captionSource ||
                !captionRights
              }
              onPress={() =>
                void run(async () => {
                  if (!captionSource) return;
                  const file = new File(captionSource.uri);
                  if (file.size > 64 * 1024 * 1024)
                    throw Error(
                      t(
                        "Video 64 MiB sınırını aşıyor.",
                        "Video exceeds 64 MiB.",
                      ),
                    );
                  const asset = await client.upload(
                    project,
                    await file.bytes(),
                    "video/mp4",
                  );
                  await client.submit(project, {
                    kind: "transcribe",
                    media_id: asset.id,
                    language: captionLanguage,
                    aspect_ratio: "16:9",
                    duration_seconds: 1,
                    rights_confirmed: true,
                  });
                  setJobs(await client.jobs(project));
                })
              }
            />
          </View>
          <Txt>{t("Üretimler", "Jobs")}</Txt>
          {jobs.map((j) => (
            <View key={j.id} style={s.panel}>
              <Txt>
                {j.kind} · {j.status}
              </Txt>
              {j.error && <Txt muted>{j.error}</Txt>}
              {["queued", "running"].includes(j.status) && (
                <Button
                  label={t("İptal", "Cancel")}
                  disabled={busy}
                  onPress={() =>
                    void run(async () => {
                      await client.cancel(j.id);
                      setJobs(await client.jobs(project));
                    })
                  }
                />
              )}{" "}
              {j.status === "failed" && (
                <Button
                  label={t("Yeniden dene", "Retry")}
                  disabled={busy}
                  onPress={() =>
                    void run(async () => {
                      await client.retry(j.id);
                      setJobs(await client.jobs(project));
                    })
                  }
                />
              )}{" "}
              {j.status === "succeeded" && (
                <Button
                  label={
                    j.kind === "transcribe"
                      ? t("Altyazıyı paylaş", "Share captions")
                      : t("Kaydet ve paylaş", "Save and share")
                  }
                  disabled={busy}
                  onPress={() =>
                    void run(async () => {
                      const data = await (
                        await client.output(j.id)
                      ).arrayBuffer();
                      if (j.kind === "transcribe") {
                        await shareCaptions(data);
                        return;
                      }
                      const clip = await storeOutput(
                        data,
                        "Vidora-" + j.id.slice(0, 8) + ".mp4",
                      );
                      setMessage(
                        t("Kitaplığa kaydedildi.", "Saved to library."),
                      );
                      await share(clip);
                    })
                  }
                />
              )}
              {j.status === "succeeded" && j.kind !== "transcribe" && (
                <Button
                  label={t("Düzenle", "Edit")}
                  disabled={busy}
                  onPress={() =>
                    void run(async () => {
                      const data = await (
                        await client.output(j.id)
                      ).arrayBuffer();
                      const clip = await storeOutput(
                        data,
                        "Vidora-" + j.id.slice(0, 8) + ".mp4",
                      );
                      router.push({
                        pathname: "/editor",
                        params: { id: clip.id },
                      });
                    })
                  }
                />
              )}
            </View>
          ))}
          <Button
            label={t("Bağlantıyı kes", "Disconnect")}
            disabled={busy}
            onPress={() => {
              clearSession();
              setMessage(
                t(
                  "Bağlantı kesildi. Eşleştirme kayıtlı kaldı; uygulama yeniden açıldığında otomatik bağlanılır.",
                  "Disconnected. The pairing stays saved and reconnects when the app is reopened.",
                ),
              );
            }}
          />
          <Button
            label={t(
              "Bağlantıyı kes ve bu iş istasyonunu unut",
              "Disconnect and forget this workstation",
            )}
            disabled={busy}
            onPress={forgetWorkstation}
          />
          <Button
            label={t("İş istasyonu verilerini sil", "Delete workstation data")}
            disabled={busy}
            onPress={() =>
              Alert.alert(
                t(
                  "İş istasyonu verileri silinsin mi?",
                  "Delete workstation data?",
                ),
                t(
                  "Tüm sunucu projeleri ve medya kalıcı olarak silinir.",
                  "All server projects and media will be deleted permanently.",
                ),
                [
                  { text: t("Vazgeç", "Cancel"), style: "cancel" },
                  {
                    text: t("Hesabı sil", "Delete account"),
                    style: "destructive",
                    onPress: () =>
                      void run(async () => {
                        await client.erase();
                        await forgetPairing();
                        clearSession();
                        setBase("");
                        setHasSaved(false);
                        setMessage(t("Hesap silindi.", "Account deleted."));
                      }),
                  },
                ],
              )
            }
          />
        </>
      )}
      {message && <Txt>{message}</Txt>}
    </Screen>
  );
}
