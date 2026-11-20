"use client";
import { useEffect, useState } from "react";
import {
  api,
  endpoint,
  validSrt,
  type Capabilities,
  type Job,
  type Lang,
  type Project,
  type Ratio,
} from "../../../packages/shared/studio";
import { download } from "./local";
export default function Remote({
  lang,
  onEdit,
  initialShot,
}: {
  lang: Lang;
  onEdit: (file: File) => Promise<void>;
  initialShot: {
    prompt: string;
    shotId: string;
    aspect: Ratio;
    seconds: number;
    shortened: boolean;
  } | null;
}) {
  const t = (a: string, b: string) => (lang === "tr" ? a : b);
  const [base, B] = useState("http://127.0.0.1:8787"),
    [token, T] = useState(""),
    [connected, C] = useState<ReturnType<typeof api> | null>(null),
    [caps, A] = useState<Capabilities | null>(null),
    [ps, P] = useState<Project[]>([]),
    [pid, I] = useState(""),
    [jobs, J] = useState<Job[]>([]),
    [name, N] = useState(""),
    [prompt, Q] = useState(initialShot?.prompt ?? ""),
    [rights, R] = useState(false),
    [ratio, Y] = useState<Ratio>(initialShot?.aspect ?? "16:9"),
    [seconds, S] = useState(initialShot?.seconds ?? 2),
    [image, F] = useState<File | null>(null),
    [speech, setSpeech] = useState<File | null>(null),
    [speechLanguage, setSpeechLanguage] = useState<"auto" | "tr" | "en">(
      "auto",
    ),
    [speechRights, setSpeechRights] = useState(false),
    [captionText, setCaptionText] = useState(""),
    [captionJob, setCaptionJob] = useState(""),
    [previewBlob, setPreviewBlob] = useState<Blob | null>(null),
    [previewUrl, setPreviewUrl] = useState(""),
    [previewName, setPreviewName] = useState(""),
    [savedCaption, setSavedCaption] = useState<{
      id: string;
      text: string;
    } | null>(null),
    [msg, M] = useState(""),
    [busy, Z] = useState(false);
  const [shotJobs, setShotJobs] = useState<
    Record<string, { shotId: string; seconds?: number }>
  >({});
  useEffect(() => {
    try {
      const parsed: unknown = JSON.parse(
        sessionStorage.getItem("karevia-shot-jobs") || "{}",
      );
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const safe = Object.entries(parsed).flatMap(([job, value]) => {
          const shot = typeof value === "string" ? { shotId: value } : value;
          if (
            !/^[a-f0-9]{32}$/.test(job) ||
            !shot ||
            typeof shot !== "object" ||
            !("shotId" in shot) ||
            typeof shot.shotId !== "string" ||
            !/^[a-f0-9-]{36}$/.test(shot.shotId)
          )
            return [];
          const seconds =
            "seconds" in shot &&
            typeof shot.seconds === "number" &&
            Number.isInteger(shot.seconds) &&
            shot.seconds >= 1 &&
            shot.seconds <= 10
              ? shot.seconds
              : undefined;
          return [[job, { shotId: shot.shotId, seconds }] as const];
        });
        setShotJobs(Object.fromEntries(safe.slice(-100)));
      }
    } catch {
      /* Keep the workspace usable without session storage. */
    }
  }, []);
  async function action(fn: () => Promise<void>) {
    Z(true);
    M("");
    try {
      await fn();
    } catch (e) {
      M(String(e));
    } finally {
      Z(false);
    }
  }
  useEffect(() => {
    if (!previewBlob) {
      setPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(previewBlob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [previewBlob]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("karevia-caption-draft");
      if (!raw) return;
      const draft: unknown = JSON.parse(raw);
      if (
        draft &&
        typeof draft === "object" &&
        "id" in draft &&
        "text" in draft &&
        typeof draft.id === "string" &&
        typeof draft.text === "string" &&
        draft.id.length <= 128 &&
        draft.text.length <= 2_000_000
      )
        setSavedCaption({ id: draft.id, text: draft.text });
    } catch {
      M(
        t(
          "Yerel altyazı taslağı okunamadı.",
          "Could not read the local caption draft.",
        ),
      );
    }
  }, []);
  useEffect(() => {
    if (!connected || !pid) {
      J([]);
      return;
    }
    let active = true;
    const poll = async () => {
      try {
        const j = await connected.jobs(pid);
        if (active) J(j);
      } catch (e) {
        if (active) M(String(e));
      }
    };
    void poll();
    const timer = setInterval(poll, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [connected, pid]);
  const captionEditor = (
    <>
      {savedCaption && (
        <section className="caption-editor">
          <p>
            {t(
              "Bu tarayıcıda kayıtlı bir altyazı taslağı var.",
              "A caption draft is saved in this browser.",
            )}
          </p>
          <button
            onClick={() => {
              if (
                captionJob &&
                !confirm(
                  t(
                    "Açık altyazı taslağı değiştirilsin mi?",
                    "Replace the open caption draft?",
                  ),
                )
              )
                return;
              setCaptionJob(savedCaption.id);
              setCaptionText(savedCaption.text);
            }}
          >
            {t("Taslağı aç", "Open draft")}
          </button>
          <button
            onClick={() => {
              if (
                !confirm(
                  t("Kayıtlı taslak silinsin mi?", "Delete the saved draft?"),
                )
              )
                return;
              try {
                localStorage.removeItem("karevia-caption-draft");
                setSavedCaption(null);
              } catch {
                M(t("Taslak silinemedi.", "Could not delete the draft."));
              }
            }}
          >
            {t("Kayıtlı taslağı sil", "Delete saved draft")}
          </button>
        </section>
      )}
      {captionJob && (
        <section className="caption-editor">
          <label>
            {t("Altyazı metni ve zamanları", "Caption text and timings")}
            <textarea
              rows={14}
              value={captionText}
              onChange={(e) => setCaptionText(e.target.value)}
            />
          </label>
          <button
            disabled={!captionText.trim()}
            onClick={() =>
              download(
                new Blob([captionText], {
                  type: "application/x-subrip;charset=utf-8",
                }),
                captionJob + "-edited.srt",
              )
            }
          >
            {t("Düzenlenmiş SRT indir", "Download edited SRT")}
          </button>
          <button
            onClick={() => {
              if (
                savedCaption &&
                !confirm(
                  t(
                    "Kayıtlı taslak değiştirilsin mi?",
                    "Replace the saved draft?",
                  ),
                )
              )
                return;
              try {
                if (captionText.length > 2_000_000 || captionJob.length > 128)
                  throw Error("Draft exceeds local storage limit");
                const draft = { id: captionJob, text: captionText };
                localStorage.setItem(
                  "karevia-caption-draft",
                  JSON.stringify(draft),
                );
                setSavedCaption(draft);
                M(
                  t(
                    "Taslak bu tarayıcıya kaydedildi.",
                    "Draft saved in this browser.",
                  ),
                );
              } catch {
                M(
                  t(
                    "Taslak kaydedilemedi. Dosyayı indir.",
                    "Could not save the draft. Download the file.",
                  ),
                );
              }
            }}
          >
            {t("Taslağı bu cihaza kaydet", "Save draft on this device")}
          </button>
          {!validSrt(captionText) && (
            <p role="alert">
              {t(
                "SRT biçimi veya zaman aralıkları geçersiz. Taslağı yine indirebilirsin.",
                "SRT format or cue timings are invalid. You can still download the draft.",
              )}
            </p>
          )}
          <p>
            {t(
              "Değişiklikler indirdiğin dosyaya kaydedilir.",
              "Changes are saved to the downloaded file.",
            )}
          </p>
        </section>
      )}
    </>
  );
  if (!connected)
    return (
      <section className="remote">
        <h2>{t("Üretim motoruna bağlan", "Connect a generation engine")}</h2>
        <p>
          {t(
            "Adres ve anahtar yalnızca açık sekmede tutulur.",
            "The address and key stay in this tab.",
          )}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void action(async () => {
              const client = api(endpoint(base), token);
              const [c, p] = await Promise.all([
                client.caps(),
                client.projects(),
              ]);
              A(c);
              P(p);
              I(p[0]?.id ?? "");
              C(client);
            });
          }}
        >
          <label>
            {t("API adresi", "API address")}
            <input value={base} onChange={(e) => B(e.target.value)} required />
          </label>
          <label>
            {t("Erişim anahtarı", "Access key")}
            <input
              autoComplete="off"
              type="password"
              required
              value={token}
              onChange={(e) => T(e.target.value)}
            />
          </label>
          <button className="primary" disabled={busy}>
            {t("Bağlan", "Connect")}
          </button>
        </form>
        {captionEditor}
        <p role="status">{msg}</p>
      </section>
    );
  const available = image ? caps?.image_to_video : caps?.text_to_video;
  return (
    <section className="remote">
      <div className="row">
        <h2>{t("Üretim motoru", "Generation engine")}</h2>
        <button
          onClick={() => {
            C(null);
            T("");
            F(null);
            setSpeech(null);
            setSpeechRights(false);
            setCaptionText("");
            setCaptionJob("");
            setPreviewBlob(null);
            J([]);
            Q("");
          }}
        >
          {t("Bağlantıyı kes", "Disconnect")}
        </button>
      </div>
      <label>
        {t("Proje", "Project")}
        <select
          value={pid}
          onChange={(e) => {
            I(e.target.value);
            setPreviewBlob(null);
          }}
        >
          {ps.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <button
        disabled={busy || !pid}
        onClick={() => {
          if (
            !confirm(
              t(
                "Seçili proje ve dosyaları silinsin mi?",
                "Delete the selected project and its files?",
              ),
            )
          )
            return;
          void action(async () => {
            await connected.remove(pid);
            setPreviewBlob(null);
            const remaining = ps.filter((p) => p.id !== pid);
            P(remaining);
            I(remaining[0]?.id ?? "");
            J([]);
          });
        }}
      >
        {t("Projeyi sil", "Delete project")}
      </button>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          void action(async () => {
            const p = await connected.create(name.trim());
            P([p, ...ps]);
            I(p.id);
            N("");
          });
        }}
      >
        <input
          aria-label={t("Proje adı", "Project name")}
          placeholder={t("Yeni proje adı", "New project name")}
          required
          maxLength={80}
          value={name}
          onChange={(e) => N(e.target.value)}
        />
        <button disabled={busy || !name.trim()}>
          {t("Proje oluştur", "Create project")}
        </button>
      </form>
      <label>
        {t("Sahne tarifi", "Scene prompt")}
        <textarea
          value={prompt}
          onChange={(e) => Q(e.target.value)}
          maxLength={1000}
        />
      </label>
      {initialShot?.shortened && (
        <p>
          {t(
            "Motor sınırı nedeniyle süre 10 saniyeye ayarlandı.",
            "Duration was set to 10 seconds to fit the engine limit.",
          )}
        </p>
      )}
      <label>
        {t("Başlangıç görseli (isteğe bağlı)", "Starting image (optional)")}
        <input
          type="file"
          accept="image/jpeg,image/png"
          onChange={(e) => F(e.target.files?.[0] ?? null)}
        />
      </label>
      <div className="fields">
        <label>
          {t("Oran", "Ratio")}
          <select value={ratio} onChange={(e) => Y(e.target.value as Ratio)}>
            {["16:9", "9:16", "1:1"].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label>
          {t("Süre (sn)", "Duration (s)")}
          <input
            type="number"
            min={1}
            max={10}
            value={seconds}
            onChange={(e) => S(Number(e.target.value))}
          />
        </label>
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={rights}
          onChange={(e) => R(e.target.checked)}
        />
        {t(
          "İçeriği kullanma hakkım ve gerekli kişi izinleri var.",
          "I hold the rights and necessary personal consents.",
        )}
      </label>
      {!available && (
        <p>
          {t(
            "Bu üretim modu motorda kullanılamıyor.",
            "This generation mode is unavailable on the engine.",
          )}
        </p>
      )}
      <button
        className="primary"
        disabled={
          busy ||
          !available ||
          !pid ||
          !rights ||
          !prompt.trim() ||
          !Number.isInteger(seconds) ||
          seconds < 1 ||
          seconds > 10
        }
        onClick={() =>
          void action(async () => {
            const media = image
              ? await connected.upload(pid, image, image.type)
              : null;
            const job = await connected.submit(pid, {
              kind: image ? "image_to_video" : "text_to_video",
              media_id: media?.id,
              prompt,
              aspect_ratio: ratio,
              duration_seconds: seconds,
              rights_confirmed: rights,
            });
            if (initialShot) {
              const next = {
                ...shotJobs,
                [job.id]: { shotId: initialShot.shotId, seconds },
              };
              setShotJobs(next);
              try {
                sessionStorage.setItem(
                  "karevia-shot-jobs",
                  JSON.stringify(next),
                );
              } catch {
                /* The job still runs without a stored association. */
              }
            }
            J([job, ...jobs]);
          })
        }
      >
        {t("Üretimi başlat", "Start generation")}
      </button>
      <p role="status">{msg}</p>
      <h3>{t("Üretimler", "Jobs")}</h3>
      <hr />
      <h3>{t("Otomatik altyazı", "Automatic captions")}</h3>
      <p>
        {t(
          "Video iş istasyonunda yazıya çevrilir. İndirdiğin SRT dosyasını gözden geçir.",
          "The workstation transcribes the video. Review the downloaded SRT.",
        )}
      </p>
      <label>
        {t("Ses içeren MP4", "MP4 with audio")}
        <input
          type="file"
          accept="video/mp4"
          onChange={(e) => setSpeech(e.target.files?.[0] ?? null)}
        />
      </label>
      <label>
        {t("Konuşma dili", "Speech language")}
        <select
          value={speechLanguage}
          onChange={(e) =>
            setSpeechLanguage(e.target.value as "auto" | "tr" | "en")
          }
        >
          <option value="auto">{t("Otomatik", "Automatic")}</option>
          <option value="tr">Türkçe</option>
          <option value="en">English</option>
        </select>
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={speechRights}
          onChange={(e) => setSpeechRights(e.target.checked)}
        />
        {t(
          "Videoyu kullanma hakkım var.",
          "I have the right to use this video.",
        )}
      </label>
      <button
        disabled={busy || !caps?.transcribe || !pid || !speech || !speechRights}
        onClick={() =>
          void action(async () => {
            if (!speech) return;
            const media = await connected.upload(pid, speech, "video/mp4");
            const job = await connected.submit(pid, {
              kind: "transcribe",
              media_id: media.id,
              language: speechLanguage,
              aspect_ratio: "16:9",
              duration_seconds: 1,
              rights_confirmed: true,
            });
            J([job, ...jobs]);
          })
        }
      >
        {t("Altyazı oluştur", "Generate captions")}
      </button>
      {!caps?.transcribe && (
        <p>
          {t(
            "İş istasyonunda altyazı modeli yapılandırılmamış.",
            "No caption model is configured on the workstation.",
          )}
        </p>
      )}
      {jobs.map((j) => (
        <div className="row" key={j.id}>
          <span>
            {j.kind} · {j.status} {j.error}
          </span>
          {["queued", "running"].includes(j.status) && (
            <button
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  await connected.cancel(j.id);
                  J(await connected.jobs(pid));
                })
              }
            >
              {t("İptal", "Cancel")}
            </button>
          )}
          {j.status === "failed" && (
            <button
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  await connected.retry(j.id);
                  J(await connected.jobs(pid));
                })
              }
            >
              {t("Yeniden dene", "Retry")}
            </button>
          )}
          {j.status === "succeeded" && (
            <button
              disabled={busy}
              onClick={() =>
                void action(async () =>
                  download(
                    await (await connected.output(j.id)).blob(),
                    j.id + (j.kind === "transcribe" ? ".srt" : ".mp4"),
                  ),
                )
              }
            >
              {t("İndir", "Download")}
            </button>
          )}
          {j.status === "succeeded" &&
            j.kind !== "transcribe" &&
            shotJobs[j.id] && (
              <button
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    const file = j.id + ".mp4";
                    const blob = await (await connected.output(j.id)).blob();
                    if (!blob.size || !blob.type.startsWith("video/"))
                      throw Error(
                        t("Video açılamadı.", "Video could not be opened."),
                      );
                    sessionStorage.setItem(
                      "karevia-shot-result",
                      JSON.stringify({ ...shotJobs[j.id], file }),
                    );
                    download(blob, file);
                    location.href = "/shot-planner/index.html";
                  })
                }
              >
                {t("İndir ve sahneye ekle", "Download and add to shot")}
              </button>
            )}
          {j.status === "succeeded" && j.kind !== "transcribe" && (
            <button
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  const response = await connected.output(j.id);
                  const blob = await response.blob();
                  if (!blob.size || !blob.type.startsWith("video/"))
                    throw Error(
                      t("Video açılamadı.", "Video could not be opened."),
                    );
                  setPreviewBlob(blob);
                  setPreviewName("Karevia-" + j.id.slice(0, 8) + ".mp4");
                })
              }
            >
              {t("Önizle", "Preview")}
            </button>
          )}
          {j.status === "succeeded" && j.kind === "transcribe" && (
            <button
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  if (
                    captionJob &&
                    !confirm(
                      t(
                        "Açık altyazı taslağı değiştirilsin mi?",
                        "Replace the open caption draft?",
                      ),
                    )
                  )
                    return;
                  const response = await connected.output(j.id);
                  setCaptionText(await response.text());
                  setCaptionJob(j.id);
                })
              }
            >
              {t("Altyazıyı düzenle", "Edit captions")}
            </button>
          )}
        </div>
      ))}
      {previewUrl && (
        <section className="caption-editor">
          <h3>{t("Video önizleme", "Video preview")}</h3>
          <video
            src={previewUrl}
            controls
            playsInline
            aria-label={t(
              "Üretilen video önizlemesi",
              "Generated video preview",
            )}
            style={{ width: "100%", maxHeight: 500 }}
          />
          <button onClick={() => setPreviewBlob(null)}>
            {t("Önizlemeyi kapat", "Close preview")}
          </button>
          <button
            disabled={busy || !previewBlob}
            onClick={() => {
              if (previewBlob)
                void action(() =>
                  onEdit(
                    new File([previewBlob], previewName, { type: "video/mp4" }),
                  ),
                );
            }}
          >
            {t("Kurgu masasında aç", "Open in editor")}
          </button>
        </section>
      )}
      {captionEditor}
      <hr />
      <button
        disabled={busy}
        onClick={() => {
          if (
            confirm(
              t(
                "Sunucudaki hesabı ve tüm proje dosyalarını kalıcı olarak sil?",
                "Permanently delete the server account and all its projects?",
              ),
            )
          )
            void action(async () => {
              await connected.erase();
              C(null);
              T("");
              J([]);
              Q("");
              F(null);
              setSpeech(null);
              setSpeechRights(false);
              setCaptionText("");
              setCaptionJob("");
              setPreviewBlob(null);
            });
        }}
      >
        {t("Sunucu hesabını sil", "Delete server account")}
      </button>
    </section>
  );
}
