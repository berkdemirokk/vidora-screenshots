"use client";
import { useEffect, useRef, useState } from "react";
import {
  clipRange,
  type Ratio,
  type Lang,
} from "../../../packages/shared/studio";
import { items, save, remove, download, erase, type Saved } from "./local";
import { encode } from "./encode";
import Remote from "./remote";

export default function Page() {
  const [lang, L] = useState<Lang>("tr"),
    t = (a: string, b: string) => (lang === "tr" ? a : b);
  const [view, V] = useState<"editor" | "library" | "engine">("editor"),
    [engineOpened, setEngineOpened] = useState(false),
    [shot, setShot] = useState<{
      prompt: string;
      shotId: string;
      aspect: Ratio;
      seconds: number;
      shortened: boolean;
    } | null>(null),
    [files, F] = useState<Saved[]>([]),
    [current, C] = useState<Saved | null>(null),
    [src, U] = useState("/dunes.mp4"),
    [duration, D] = useState(4),
    [start, S] = useState("0"),
    [end, E] = useState("4"),
    [ratio, R] = useState<Ratio>("16:9"),
    [volume, A] = useState(1),
    [title, T] = useState(""),
    [message, M] = useState(""),
    [progress, P] = useState<number | null>(null),
    [play, H] = useState(false),
    [now, N] = useState(0);
  const video = useRef<HTMLVideoElement>(null),
    picker = useRef<HTMLInputElement>(null),
    stop = useRef<AbortController | null>(null);
  const range = clipRange(start, end, duration);
  useEffect(() => {
    if (new URLSearchParams(location.search).get("shot") === "1") {
      try {
        const raw = sessionStorage.getItem("karevia-shot-transfer");
        const data: unknown = raw ? JSON.parse(raw) : null;
        if (
          data &&
          typeof data === "object" &&
          "prompt" in data &&
          typeof data.prompt === "string" &&
          data.prompt.length <= 1000 &&
          "shotId" in data &&
          typeof data.shotId === "string" &&
          /^[a-f0-9-]{36}$/.test(data.shotId) &&
          "aspect" in data &&
          (data.aspect === "16:9" ||
            data.aspect === "9:16" ||
            data.aspect === "1:1") &&
          "seconds" in data &&
          typeof data.seconds === "number" &&
          Number.isInteger(data.seconds) &&
          data.seconds >= 1 &&
          data.seconds <= 10 &&
          "shortened" in data &&
          typeof data.shortened === "boolean"
        ) {
          setShot({
            prompt: data.prompt,
            shotId: data.shotId,
            aspect: data.aspect,
            seconds: data.seconds,
            shortened: data.shortened,
          });
          V("engine");
        }
        sessionStorage.removeItem("karevia-shot-transfer");
        history.replaceState(null, "", location.pathname);
      } catch {
        /* Ignore unavailable or malformed local transfer data. */
      }
    }
    const l = localStorage.getItem("karevia-language");
    if (l === "en") L("en");
    items()
      .then(F)
      .catch((e) => M(String(e)));
    return () => stop.current?.abort();
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    localStorage.setItem("karevia-language", lang);
  }, [lang]);
  useEffect(() => {
    if (view === "engine") setEngineOpened(true);
  }, [view]);
  useEffect(() => {
    const url = current ? URL.createObjectURL(current.blob) : "/dunes.mp4";
    U(url);
    S("0");
    N(0);
    H(false);
    return () => {
      if (current) URL.revokeObjectURL(url);
    };
  }, [current]);
  useEffect(() => {
    if (video.current) video.current.volume = volume;
  }, [volume, src, view]);
  async function refresh() {
    F(await items());
  }
  async function loadFile(file: File) {
    try {
      if (file.size > 300 * 1024 * 1024)
        throw Error(
          t("Dosya 300 MB sınırını aşıyor.", "The file exceeds 300 MB."),
        );
      const item: Saved = {
        id: crypto.randomUUID(),
        name: file.name,
        blob: file,
        kind: "source",
        created: Date.now(),
      };
      await save(item);
      await refresh();
      C(item);
      M("");
      V("editor");
    } catch (e) {
      M(String(e));
    }
  }
  async function exportVideo() {
    if (!range) return;
    video.current?.pause();
    const ctl = new AbortController();
    stop.current = ctl;
    P(0);
    M("");
    try {
      const blob = await encode(
        { src, ...range, ratio, volume, title },
        ctl.signal,
        P,
      );
      const name =
        (current?.name.replace(/\.[^.]+$/, "") ?? "Dunes") + "-cut.mp4";
      await save({
        id: crypto.randomUUID(),
        name,
        blob,
        kind: "export",
        created: Date.now(),
      });
      await refresh();
      download(blob, name);
      M(
        t(
          "MP4 indirildi ve kitaplığa kaydedildi.",
          "MP4 downloaded and saved to your library.",
        ),
      );
    } catch (e) {
      M(
        ctl.signal.aborted
          ? t("Dışa aktarma iptal edildi.", "Export cancelled.")
          : String(e),
      );
    } finally {
      stop.current = null;
      P(null);
    }
  }
  const name = current?.name ?? t("Kum çizgileri", "Dune lines");
  return (
    <>
      <header>
        <div className="brand">
          <img src="/icon.png" alt="" width="36" height="36" />
          <strong>
            Karevia<span> Studio</span>
          </strong>
        </div>
        <nav aria-label={t("Çalışma alanı", "Workspace")}>
          {(
            [
              ["editor", "Düzenle", "Editor"],
              ["library", "Kitaplık", "Library"],
              ["engine", "AI Üretim", "Generation"],
            ] as const
          ).map(([v, tr, en]) => (
            <button
              disabled={progress !== null}
              aria-current={view === v ? "page" : undefined}
              key={v}
              onClick={() => {
                V(v);
                M("");
              }}
            >
              {t(tr, en)}
            </button>
          ))}
          <a href="/shot-planner/index.html">
            {t("Sahne planı", "Storyboard")}
          </a>
        </nav>
        <button
          className="lang"
          aria-label={t("Change language to English", "Dili Türkçeye değiştir")}
          onClick={() => L(lang === "tr" ? "en" : "tr")}
        >
          {lang === "tr" ? "EN" : "TR"}
        </button>
      </header>
      <main>
        <div className="pagehead">
          <div>
            <p className="over">
              {t("ÇALIŞMA ALANI", "WORKSPACE")} <span>/</span>{" "}
              {view === "editor"
                ? t("KURGU", "EDIT")
                : view === "library"
                  ? t("ARŞİV", "ARCHIVE")
                  : t("MOTOR", "ENGINE")}
            </p>
            <h1>
              {view === "editor"
                ? t("Kurgu masası", "Editing desk")
                : view === "library"
                  ? t("Proje kitaplığı", "Project library")
                  : t("AI Video Studio", "AI Video Studio")}
            </h1>
          </div>
          {view !== "engine" && (
            <button
              className="import"
              disabled={progress !== null}
              onClick={() => picker.current?.click()}
            >
              <b>＋</b> {t("Video içe aktar", "Import video")}
            </button>
          )}
        </div>
        <input
          ref={picker}
          hidden
          type="file"
          accept="video/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void loadFile(file);
            e.target.value = "";
          }}
        />
        {view === "editor" && (
          <div className="workspace">
            <section className="monitor">
              <div className="panelbar">
                <strong>{t("Önizleme", "Preview")}</strong>
                <span>
                  {current
                    ? t("CİHAZDA", "ON DEVICE")
                    : t("ÖRNEK KLİP", "SAMPLE CLIP")}
                </span>
              </div>
              <div
                className="frame"
                style={{ aspectRatio: ratio.replace(":", "/") }}
              >
                <video
                  aria-label={name}
                  src={src}
                  ref={video}
                  playsInline
                  preload="auto"
                  poster={current ? undefined : "/dunes.jpg"}
                  onLoadedMetadata={(e) => {
                    const d = e.currentTarget.duration;
                    D(d);
                    E(String(Math.floor(d * 1000) / 1000));
                    e.currentTarget.volume = volume;
                  }}
                  onError={() => {
                    D(0);
                    M(
                      t(
                        "Video bu tarayıcıda açılamadı.",
                        "This browser cannot decode the clip.",
                      ),
                    );
                  }}
                  onTimeUpdate={(e) => N(e.currentTarget.currentTime)}
                  onPlay={() => H(true)}
                  onPause={() => H(false)}
                  onEnded={() => H(false)}
                />
                {title && <span className="subtitle">{title}</span>}
              </div>
              <div className="transport">
                <button
                  aria-label={
                    play ? t("Duraklat", "Pause") : t("Oynat", "Play")
                  }
                  onClick={() => {
                    if (play) video.current?.pause();
                    else video.current?.play().catch((e) => M(String(e)));
                  }}
                >
                  {play ? "Ⅱ" : "▶"}
                </button>
                <span className="time">
                  {now.toFixed(1)} / {duration.toFixed(1)} s
                </span>
                <strong>{name}</strong>
              </div>
              <div className="timeline">
                <div className="ticks">
                  <span>0 s</span>
                  <span>{(duration / 2).toFixed(1)} s</span>
                  <span>{duration.toFixed(1)} s</span>
                </div>
                <input
                  type="range"
                  aria-label={t("Oynatma konumu", "Playhead")}
                  min={0}
                  max={duration || 1}
                  step=".02"
                  value={now}
                  onChange={(e) => {
                    if (video.current)
                      video.current.currentTime = Number(e.target.value);
                  }}
                />
                <div
                  className="clip"
                  style={{
                    marginLeft:
                      (range ? (range.start / duration) * 100 : 0) + "%",
                    width:
                      (range
                        ? ((range.end - range.start) / duration) * 100
                        : 100) + "%",
                  }}
                >
                  <span>▏</span>
                  <b>{name}</b>
                  <span>▕</span>
                </div>
              </div>
            </section>
            <section className="inspector">
              <div className="panelbar">
                <strong>{t("Çıktı ayarları", "Output settings")}</strong>
                <span>H.264 / MP4</span>
              </div>
              <fieldset disabled={progress !== null}>
                <legend>{t("Kare oranı", "Aspect ratio")}</legend>
                <div className="segments">
                  {(["16:9", "9:16", "1:1"] as const).map((r) => (
                    <button
                      key={r}
                      aria-pressed={ratio === r}
                      onClick={() => R(r)}
                    >
                      <i style={{ aspectRatio: r.replace(":", "/") }} />
                      {r}
                    </button>
                  ))}
                </div>
                <div className="fields">
                  <label>
                    {t("Başlangıç (sn)", "Start (s)")}
                    <input
                      inputMode="decimal"
                      value={start}
                      onChange={(e) => S(e.target.value)}
                    />
                  </label>
                  <label>
                    {t("Bitiş (sn)", "End (s)")}
                    <input
                      inputMode="decimal"
                      value={end}
                      onChange={(e) => E(e.target.value)}
                    />
                  </label>
                </div>
                <label>
                  {t("Başlık", "Title overlay")}
                  <input
                    placeholder={t("İsteğe bağlı", "Optional")}
                    maxLength={100}
                    value={title}
                    onChange={(e) => T(e.target.value)}
                  />
                </label>
                <label>
                  {t("Ses düzeyi", "Volume")} <b>{Math.round(volume * 100)}%</b>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step=".01"
                    value={volume}
                    onChange={(e) => A(Number(e.target.value))}
                  />
                </label>
              </fieldset>
              <div className="output">
                <span>
                  {range
                    ? (range.end - range.start).toFixed(2) + " s"
                    : t("Geçersiz aralık", "Invalid range")}
                </span>
                <b>{ratio} · MP4</b>
              </div>
              <button
                className="primary"
                disabled={!range || progress !== null}
                onClick={() => void exportVideo()}
              >
                {progress === null
                  ? t("MP4 dışa aktar", "Export MP4")
                  : Math.floor(progress * 100) + "%"}{" "}
                <span>↗</span>
              </button>
              {progress !== null && (
                <button onClick={() => stop.current?.abort()}>
                  {t("İptal", "Cancel")}
                </button>
              )}
            </section>
          </div>
        )}
        {view === "library" && (
          <section className="remote">
            <h2>{t("Bu cihazdaki medya", "Media on this device")}</h2>
            {!files.length && (
              <p>
                {t(
                  "İçe aktarılan videolar ve dışa aktarılan kurgular burada görünür.",
                  "Imported videos and exported edits appear here.",
                )}
              </p>
            )}
            {files.map((f) => (
              <div key={f.id} className="file">
                <div>
                  <strong>{f.name}</strong>
                  <small>
                    {(f.blob.size / 1024 / 1024).toFixed(1)} MB ·{" "}
                    {f.kind === "export"
                      ? t("Dışa aktarım", "Export")
                      : t("Kaynak", "Source")}
                  </small>
                </div>
                <button
                  onClick={() => {
                    C(f);
                    V("editor");
                  }}
                >
                  {t("Aç", "Open")}
                </button>
                <button onClick={() => download(f.blob, f.name)}>
                  {t("İndir", "Download")}
                </button>
                <button
                  onClick={async () => {
                    if (confirm(t("Bu dosyayı sil?", "Delete this file?"))) {
                      await remove(f.id);
                      if (current?.id === f.id) C(null);
                      await refresh();
                    }
                  }}
                >
                  {t("Sil", "Delete")}
                </button>
              </div>
            ))}
            {files.length > 0 && (
              <button
                onClick={async () => {
                  if (
                    confirm(
                      t(
                        "Bu cihazdaki tüm proje dosyaları silinsin mi?",
                        "Erase all project files on this device?",
                      ),
                    )
                  ) {
                    await erase();
                    C(null);
                    await refresh();
                  }
                }}
              >
                {t("Yerel kitaplığı temizle", "Erase local library")}
              </button>
            )}
          </section>
        )}
        {(view === "engine" || engineOpened) && (
          <div hidden={view !== "engine"}>
            <Remote lang={lang} onEdit={loadFile} initialShot={shot} />
          </div>
        )}
        <p role="status" className="message">
          {message}
        </p>
      </main>
    </>
  );
}
