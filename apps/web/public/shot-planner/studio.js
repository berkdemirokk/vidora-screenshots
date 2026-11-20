const strings = {
  tr: {
    title: "Sahne masası",
    sub: "Çekim sırasını, sahne sürelerini ve yönetmen notlarını düzenle. Taslak bu tarayıcıda saklanır.",
    project: "Proje",
    kind: "Şablon",
    template: "Şablon sahneleri ekle",
    add: "+ Sahne",
    save: "Storyboard indir",
    load: "Taslak aç",
    shot: "SAHNE",
    note: "Çekim ve hareket",
    seconds: "Süre (sn)",
    clipStart: "Klipte başlangıç (sn)",
    clipVolume: "Klip ses düzeyi (0–2)",
    shotFraming: "Sahne kadrajı",
    previewClip: "Önizleme için yerel video seç (dosya yüklenmez)",
    previewHelp:
      "Önizleme yaklaşık kadrajı gösterir; sesi açabilirsin. 1 üzeri ses düzeyi yalnızca montajda uygulanır. Dosyayı montaj planıyla aynı klasöre taşı.",
    previewRangeError: "Seçilen başlangıç ve süre video uzunluğunu aşıyor.",
    cropX: "Yatay kırpma konumu (0: sol, 1: sağ)",
    cropY: "Dikey kırpma konumu (0: üst, 1: alt)",
    inheritFraming: "Proje ayarı",
    fitFraming: "Sığdır",
    fillFraming: "Kırp",
    file: "Klip dosyası (montaj dosyasıyla aynı klasörde)",
    rights: "Tüm klipleri, müziği ve altyazıları kullanma hakkına sahibim",
    musicLabel: "Müzik dosyası (isteğe bağlı, montaj dosyasıyla aynı klasörde)",
    musicVolumeLabel: "Müzik ses düzeyi (0–2)",
    musicStartLabel: "Müziğin başlangıç noktası (sn)",
    musicDelayLabel: "Müziğin videoda başlama zamanı (sn)",
    subtitlesLabel: "Altyazı dosyası (isteğe bağlı, SRT)",
    invalidExtras:
      "Müzik veya altyazı dosya adını ya da ses düzeyini kontrol et.",
    aspect: "Montaj oranı",
    resolution:
      "Çıktı çözünürlüğü (düşük çözünürlüklü kaynaklara yeni detay eklemez)",
    framing: "Kadraj (kırpma görüntünün merkezini korur)",
    timeline: "Montaj planını indir",
    invalidTimeline:
      "Her sahne için klip adı ve kullanım hakkı gerekli. En fazla 30 klip, 180 saniye ve sahne başına 60 saniye.",
    up: "Yukarı",
    down: "Aşağı",
    remove: "Sil",
    generate: "Bu sahneyi üretime hazırla",
    transferError: "Sahne aktarılamadı. Tarayıcı depolama iznini kontrol et.",
    emptyNote: "Önce sahne tarifini yaz.",
    returned:
      "Klip adı sahneye eklendi. İndirilen dosyayı montaj planıyla aynı klasöre taşı.",
    missingShot: "Sahne bulunamadı; klip adı otomatik eklenmedi.",
    replaceClip: "Bu sahnedeki klip adı değiştirilsin mi?",
    shortenClip:
      "Üretilen klip sahne süresinden kısa. Sahne süresi klibe göre kısaltılsın mı?",
    durationWarning:
      "Klip süresi sahneden kısa olabilir; montajdan önce süreyi kontrol et.",
    fresh: "Yeni proje",
    empty: "Henüz sahne yok.",
    error: "Taslak okunamadı.",
    limit: "En fazla 50 sahne.",
    storage: "Tarayıcı kaydedemedi. JSON olarak indir.",
    film: ["Açılış planı", "Dönüm noktası", "Kapanış"],
    ad: ["Ürünü tanıt", "Kullanımı göster", "Eyleme çağrı"],
    music: ["Giriş", "Nakarat", "Çıkış"],
  },
  en: {
    title: "Shot desk",
    sub: "Arrange shots, set their length and leave direction notes. This browser stores the draft.",
    project: "Project",
    kind: "Template",
    template: "Append template shots",
    add: "+ Shot",
    save: "Download storyboard",
    load: "Open draft",
    shot: "SHOT",
    note: "Direction and movement",
    seconds: "Seconds",
    clipStart: "Start within clip (s)",
    clipVolume: "Clip volume (0–2)",
    shotFraming: "Shot framing",
    previewClip: "Choose a local video to preview (not uploaded)",
    previewHelp:
      "Preview shows approximate framing; you can unmute it. Volume above 1 applies only to the export. Move the file next to the edit plan.",
    previewRangeError:
      "The selected start and duration exceed the video length.",
    cropX: "Horizontal crop position (0: left, 1: right)",
    cropY: "Vertical crop position (0: top, 1: bottom)",
    inheritFraming: "Project setting",
    fitFraming: "Fit",
    fillFraming: "Fill",
    file: "Clip file (in the same folder as the timeline)",
    rights: "I have rights to use all clips, music and subtitles",
    musicLabel: "Music file (optional, in the same folder as the timeline)",
    musicVolumeLabel: "Music volume (0–2)",
    musicStartLabel: "Start at this position in the music (s)",
    musicDelayLabel: "Start music at this time in the video (s)",
    subtitlesLabel: "Subtitle file (optional, SRT)",
    invalidExtras: "Check the music or subtitle filename and volume.",
    aspect: "Export aspect ratio",
    resolution: "Output resolution (upscaling does not add source detail)",
    framing: "Framing (fill crops around the center)",
    timeline: "Download edit plan",
    invalidTimeline:
      "Each shot needs a clip name and rights confirmation. Maximum 30 clips, 180 seconds, and 60 seconds per shot.",
    up: "Move up",
    down: "Move down",
    remove: "Delete",
    generate: "Prepare this shot for generation",
    transferError:
      "Could not transfer the shot. Check browser storage permissions.",
    emptyNote: "Enter a shot description first.",
    returned:
      "Clip name added to the shot. Move the downloaded file next to the edit plan.",
    missingShot: "The shot was not found; the clip name was not added.",
    replaceClip: "Replace this shot's clip name?",
    shortenClip:
      "The generated clip is shorter than this shot. Shorten the shot to match?",
    durationWarning:
      "The clip may be shorter than the shot; check the duration before assembly.",
    fresh: "Untitled project",
    empty: "No shots yet.",
    error: "Could not read this draft.",
    limit: "Maximum 50 shots.",
    storage: "Browser storage unavailable. Download JSON.",
    film: ["Establishing shot", "Turning point", "Final shot"],
    ad: ["Introduce the product", "Demonstrate its use", "Call to action"],
    music: ["Intro", "Chorus", "Outro"],
  },
};
const $ = (id) => document.getElementById(id),
  key = "karevia.shotdesk.v1";
const previews = new Map();
function clearPreview(id) {
  const old = previews.get(id);
  if (old) URL.revokeObjectURL(old);
  previews.delete(id);
}
window.addEventListener("beforeunload", () => {
  for (const id of previews.keys()) clearPreview(id);
});
let storageReadable = true,
  lang = "tr",
  doc = { version: 1, name: "", shots: [] };
function validate(x) {
  if (
    x?.version !== 1 ||
    typeof x.name !== "string" ||
    x.name.length > 90 ||
    !Array.isArray(x.shots) ||
    (x.aspect !== undefined && !["16:9", "9:16", "1:1"].includes(x.aspect)) ||
    (x.resolution !== undefined &&
      !["standard", "hd", "fullhd"].includes(x.resolution)) ||
    (x.framing !== undefined && !["fit", "fill"].includes(x.framing)) ||
    (x.music !== undefined &&
      (typeof x.music !== "string" || x.music.length > 160)) ||
    (x.subtitles !== undefined &&
      (typeof x.subtitles !== "string" || x.subtitles.length > 160)) ||
    (x.musicVolume !== undefined &&
      (typeof x.musicVolume !== "string" || x.musicVolume.length > 20)) ||
    (x.musicStart !== undefined &&
      (typeof x.musicStart !== "string" || x.musicStart.length > 20)) ||
    (x.musicDelay !== undefined &&
      (typeof x.musicDelay !== "string" || x.musicDelay.length > 20)) ||
    x.shots.length > 50 ||
    x.shots.some(
      (s) =>
        !s ||
        typeof s.note !== "string" ||
        s.note.length > 1000 ||
        (s.file !== undefined &&
          (typeof s.file !== "string" || s.file.length > 160)) ||
        (s.start !== undefined &&
          (typeof s.start !== "number" ||
            !Number.isFinite(s.start) ||
            s.start < 0 ||
            s.start > 300)) ||
        (s.volume !== undefined &&
          (typeof s.volume !== "number" ||
            !Number.isFinite(s.volume) ||
            s.volume < 0 ||
            s.volume > 2)) ||
        (s.framing !== undefined &&
          !["project", "fit", "fill"].includes(s.framing)) ||
        [s.cropX, s.cropY].some(
          (v) =>
            v !== undefined &&
            (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1),
        ) ||
        !Number.isInteger(s.seconds) ||
        s.seconds < 1 ||
        s.seconds > 120,
    )
  )
    throw Error();
  const ids = new Set();
  return {
    version: 1,
    name: x.name,
    aspect: x.aspect || "16:9",
    resolution: x.resolution || "standard",
    framing: x.framing || "fit",
    music: x.music || "",
    subtitles: x.subtitles || "",
    musicVolume: x.musicVolume ?? "0.5",
    musicStart: x.musicStart ?? "0",
    musicDelay: x.musicDelay ?? "0",
    shots: x.shots.map(
      ({ note, seconds, file, id, start, volume, framing, cropX, cropY }) => {
        const safeId =
          typeof id === "string" && /^[a-f0-9-]{36}$/.test(id) && !ids.has(id)
            ? id
            : crypto.randomUUID();
        ids.add(safeId);
        return {
          id: safeId,
          note,
          seconds,
          file: file || "",
          start: start ?? 0,
          volume: volume ?? 1,
          framing: framing || "project",
          cropX: cropX ?? 0.5,
          cropY: cropY ?? 0.5,
        };
      },
    ),
  };
}
try {
  lang = localStorage.getItem(key + ".lang") === "en" ? "en" : "tr";
  const data = localStorage.getItem(key);
  if (data) doc = validate(JSON.parse(data));
} catch {
  storageReadable = false;
}
function persist() {
  try {
    localStorage.setItem(key, JSON.stringify(doc));
    localStorage.setItem(key + ".lang", lang);
  } catch {
    $("status").textContent = strings[lang].storage;
  }
}
// Assign IDs to older local drafts before sending a shot to production.
doc.shots = doc.shots.map((s) => ({ ...s, id: s.id || crypto.randomUUID() }));
if (storageReadable) persist();
try {
  const raw = sessionStorage.getItem("karevia-shot-result");
  if (raw) {
    const result = JSON.parse(raw);
    const shot = doc.shots.find((s) => s.id === result.shotId);
    if (
      storageReadable &&
      shot &&
      /^[a-f0-9]{32}\.mp4$/.test(result.file) &&
      (!shot.file ||
        shot.file === result.file ||
        confirm(strings[lang].replaceClip))
    ) {
      shot.file = result.file;
      let warning = true;
      if (
        Number.isInteger(result.seconds) &&
        result.seconds >= 1 &&
        result.seconds <= 10
      ) {
        const available = Math.floor(result.seconds - (shot.start ?? 0));
        if (available >= shot.seconds) warning = false;
        else if (available >= 1 && confirm(strings[lang].shortenClip)) {
          shot.seconds = available;
          warning = false;
        }
      }
      persist();
      $("status").textContent =
        strings[lang].returned +
        (warning ? " " + strings[lang].durationWarning : "");
    } else $("status").textContent = strings[lang].missingShot;
    sessionStorage.removeItem("karevia-shot-result");
  }
} catch {
  $("status").textContent = strings[lang].missingShot;
}
function btn(text, action, disabled = false) {
  const b = document.createElement("button");
  b.textContent = text;
  b.disabled = disabled;
  b.onclick = action;
  return b;
}
function field(text, input) {
  const l = document.createElement("label");
  l.append(text, input);
  return l;
}
function draw() {
  const t = strings[lang];
  document.documentElement.lang = lang;
  for (const [id, k] of Object.entries({
    heading: "title",
    sub: "sub",
    projectLabel: "project",
    typeLabel: "kind",
    template: "template",
    add: "add",
    export: "save",
    importlabel: "load",
    rightsLabel: "rights",
    aspectLabel: "aspect",
    resolutionLabel: "resolution",
    framingLabel: "framing",
    musicLabel: "musicLabel",
    musicVolumeLabel: "musicVolumeLabel",
    musicStartLabel: "musicStartLabel",
    musicDelayLabel: "musicDelayLabel",
    subtitlesLabel: "subtitlesLabel",
    timeline: "timeline",
  }))
    $(id).textContent = t[k];
  $("language").textContent = lang === "tr" ? "English" : "Türkçe";
  $("name").value = doc.name;
  $("name").placeholder = t.fresh;
  $("aspect").value = doc.aspect || "16:9";
  $("resolution").value = doc.resolution || "standard";
  $("framing").value = doc.framing || "fit";
  $("music").value = doc.music || "";
  $("subtitles").value = doc.subtitles || "";
  $("musicVolume").value = doc.musicVolume ?? "0.5";
  $("musicStart").value = doc.musicStart ?? "0";
  $("musicDelay").value = doc.musicDelay ?? "0";
  $("shots").replaceChildren();
  if (!doc.shots.length) $("shots").textContent = t.empty;
  doc.shots.forEach((s, i) => {
    const el = document.createElement("section");
    el.className = "shot";
    const h = document.createElement("h2");
    h.textContent = t.shot + " / " + String(i + 1).padStart(2, "0");
    const area = document.createElement("textarea");
    area.maxLength = 1000;
    area.value = s.note;
    area.oninput = () => {
      s.note = area.value;
      persist();
    };
    const n = document.createElement("input");
    const shotFraming = document.createElement("select");
    for (const [value, label] of [
      ["project", t.inheritFraming],
      ["fit", t.fitFraming],
      ["fill", t.fillFraming],
    ]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      shotFraming.append(option);
    }
    shotFraming.value = s.framing || "project";
    shotFraming.onchange = () => {
      s.framing = shotFraming.value;
      persist();
      updatePreview();
    };
    const clipStart = document.createElement("input"),
      clipVolume = document.createElement("input");
    const cropX = document.createElement("input"),
      cropY = document.createElement("input");
    for (const [input, key] of [
      [cropX, "cropX"],
      [cropY, "cropY"],
    ]) {
      input.type = "number";
      input.min = "0";
      input.max = "1";
      input.step = "0.1";
      input.value = String(s[key] ?? 0.5);
      input.onchange = () => {
        const v = Number(input.value);
        s[key] =
          input.value.trim() && Number.isFinite(v)
            ? Math.max(0, Math.min(1, v))
            : 0.5;
        input.value = String(s[key]);
        persist();
        updatePreview();
      };
    }
    for (const [input, key, max, defaultValue] of [
      [clipStart, "start", 300, 0],
      [clipVolume, "volume", 2, 1],
    ]) {
      input.type = "number";
      input.min = "0";
      input.max = String(max);
      input.step = "0.1";
      input.value = String(s[key] ?? defaultValue);
      input.onchange = () => {
        const value = Number(input.value);
        s[key] =
          input.value.trim() && Number.isFinite(value)
            ? Math.max(0, Math.min(max, value))
            : defaultValue;
        input.value = String(s[key]);
        persist();
        if (key === "start") updateRange(true);
        if (key === "volume") preview.volume = Math.min(1, s.volume);
      };
    }
    const file = document.createElement("input");
    file.maxLength = 160;
    file.value = s.file || "";
    file.placeholder = "clip.mp4";
    file.oninput = () => {
      if (s.file !== file.value) clearPreview(s.id);
      s.file = file.value;
      persist();
      updatePreview();
    };
    const previewPicker = document.createElement("input");
    previewPicker.type = "file";
    previewPicker.accept = "video/mp4,video/quicktime,video/x-m4v";
    const preview = document.createElement("video");
    preview.controls = true;
    preview.muted = true;
    preview.playsInline = true;
    preview.className = "shot-preview";
    preview.setAttribute("aria-label", t.shot + " " + (i + 1));
    const hint = document.createElement("p");
    hint.textContent = t.previewHelp;
    const rangeStatus = document.createElement("p");
    rangeStatus.setAttribute("role", "status");
    function updateRange(seek) {
      if (!previews.has(s.id) || !Number.isFinite(preview.duration)) {
        rangeStatus.textContent = "";
        return;
      }
      const start = s.start ?? 0;
      const invalid =
        start + s.seconds > preview.duration + 0.025 ||
        start >= preview.duration;
      rangeStatus.textContent = invalid ? t.previewRangeError : "";
      if (seek && !invalid) preview.currentTime = start;
    }
    preview.addEventListener("loadedmetadata", () => updateRange(true));
    preview.addEventListener("play", () => {
      const start = s.start ?? 0,
        end = start + s.seconds;
      if (preview.currentTime < start || preview.currentTime >= end)
        preview.currentTime = start;
    });
    preview.addEventListener("timeupdate", () => {
      if (preview.currentTime >= (s.start ?? 0) + s.seconds) preview.pause();
    });
    function updatePreview() {
      const url = previews.get(s.id);
      preview.hidden = !url;
      hint.hidden = !url;
      if (!url) {
        rangeStatus.textContent = "";
        preview.pause();
        preview.removeAttribute("src");
        preview.load();
        return;
      }
      if (preview.getAttribute("src") !== url) preview.src = url;
      preview.volume = Math.min(1, s.volume ?? 1);
      preview.style.aspectRatio = $("aspect").value.replace(":", "/");
      const mode =
        s.framing && s.framing !== "project" ? s.framing : $("framing").value;
      preview.style.objectFit = mode === "fill" ? "cover" : "contain";
      preview.style.objectPosition = `${(s.cropX ?? 0.5) * 100}% ${(s.cropY ?? 0.5) * 100}%`;
    }
    previewPicker.onchange = () => {
      const selected = previewPicker.files[0];
      if (!selected) return;
      clearPreview(s.id);
      previews.set(s.id, URL.createObjectURL(selected));
      s.file = selected.name;
      file.value = s.file;
      persist();
      updatePreview();
      previewPicker.value = "";
    };
    updatePreview();
    n.type = "number";
    n.min = "1";
    n.max = "120";
    n.value = s.seconds;
    n.onchange = () => {
      s.seconds = Math.min(120, Math.max(1, Math.round(Number(n.value) || 1)));
      n.value = s.seconds;
      persist();
      updateRange(false);
    };
    const controls = document.createElement("div");
    controls.className = "controls";
    function move(d) {
      [doc.shots[i], doc.shots[i + d]] = [doc.shots[i + d], doc.shots[i]];
      persist();
      draw();
    }
    controls.append(
      btn(t.up, () => move(-1), i === 0),
      btn(t.down, () => move(1), i === doc.shots.length - 1),
      btn(t.generate, () => {
        if (!s.note.trim()) {
          $("status").textContent = t.emptyNote;
          return;
        }
        try {
          sessionStorage.setItem(
            "karevia-shot-transfer",
            JSON.stringify({
              prompt: s.note,
              shotId: s.id,
              aspect: $("aspect").value,
              seconds: Math.min(10, s.seconds),
              shortened: s.seconds > 10,
            }),
          );
          location.href = "/?shot=1";
        } catch {
          $("status").textContent = t.transferError;
        }
      }),
      btn(t.remove, () => {
        clearPreview(s.id);
        doc.shots.splice(i, 1);
        persist();
        draw();
      }),
    );
    el.append(
      h,
      field(t.note, area),
      field(t.seconds, n),
      field(t.file, file),
      field(t.previewClip, previewPicker),
      preview,
      hint,
      rangeStatus,
      field(t.clipStart, clipStart),
      field(t.clipVolume, clipVolume),
      field(t.shotFraming, shotFraming),
      field(t.cropX, cropX),
      field(t.cropY, cropY),
      controls,
    );
    $("shots").append(el);
  });
}
function append(notes) {
  if (doc.shots.length + notes.length > 50) {
    $("status").textContent = strings[lang].limit;
    return;
  }
  doc.shots.push(
    ...notes.map((note) => ({ id: crypto.randomUUID(), note, seconds: 4 })),
  );
  persist();
  draw();
}
$("name").oninput = (e) => {
  doc.name = e.target.value;
  persist();
};
for (const id of [
  "music",
  "subtitles",
  "musicVolume",
  "musicStart",
  "musicDelay",
]) {
  $(id).oninput = (e) => {
    doc[id] = e.target.value;
    persist();
  };
}
$("aspect").onchange = (e) => {
  doc.aspect = e.target.value;
  persist();
  draw();
};
$("resolution").onchange = (e) => {
  doc.resolution = e.target.value;
  persist();
};
$("framing").onchange = (e) => {
  doc.framing = e.target.value;
  persist();
  draw();
};
$("language").onclick = () => {
  lang = lang === "tr" ? "en" : "tr";
  persist();
  draw();
};
$("template").onclick = () => append(strings[lang][$("kind").value]);
$("add").onclick = () => append([""]);
$("timeline").onclick = () => {
  const shots = doc.shots;
  if (
    !$("rights").checked ||
    !shots.length ||
    shots.length > 30 ||
    shots.some(
      (s) =>
        !/^[^\\/:*?"<>|]+\.(mp4|mov|m4v)$/i.test(s.file || "") ||
        s.seconds > 60,
    ) ||
    shots.reduce((sum, s) => sum + s.seconds, 0) > 180
  ) {
    $("status").textContent = strings[lang].invalidTimeline;
    return;
  }
  const plan = {
    rights_confirmed: true,
    aspect: $("aspect").value,
    resolution: $("resolution").value,
    framing: $("framing").value,
    clips: shots.map((s) => ({
      file: s.file,
      seconds: s.seconds,
      start: s.start ?? 0,
      volume: s.volume ?? 1,
      crop_x: s.cropX ?? 0.5,
      crop_y: s.cropY ?? 0.5,
      ...(s.framing && s.framing !== "project" ? { framing: s.framing } : {}),
    })),
  };
  const music = $("music").value.trim(),
    subtitles = $("subtitles").value.trim();
  const volume = Number($("musicVolume").value);
  const start = Number($("musicStart").value),
    delay = Number($("musicDelay").value);
  if (
    (music && !/^[^\\/:*?"<>|]+\.(m4a|wav|mp3|aac|flac)$/i.test(music)) ||
    (subtitles && !/^[^\\/:*?"<>|]+\.srt$/i.test(subtitles)) ||
    (music &&
      (!$("musicVolume").value.trim() ||
        !Number.isFinite(volume) ||
        volume < 0 ||
        volume > 2 ||
        !$("musicStart").value.trim() ||
        !Number.isFinite(start) ||
        start < 0 ||
        start > 3600 ||
        !$("musicDelay").value.trim() ||
        !Number.isFinite(delay) ||
        delay < 0 ||
        delay > shots.reduce((sum, s) => sum + s.seconds, 0)))
  ) {
    $("status").textContent = strings[lang].invalidExtras;
    return;
  }
  if (music) {
    plan.music = music;
    plan.music_volume = volume;
    plan.music_start = start;
    plan.music_delay = delay;
  }
  if (subtitles) plan.subtitles = subtitles;
  const a = document.createElement("a");
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(plan, null, 2)], { type: "application/json" }),
  );
  a.href = url;
  a.download = "karevia-timeline.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  $("status").textContent = "";
};
$("export").onclick = () => {
  const a = document.createElement("a");
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" }),
  );
  a.href = url;
  a.download = "karevia-storyboard.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$("load").onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    if (f.size > 300000) throw Error();
    const next = validate(JSON.parse(await f.text()));
    for (const id of previews.keys()) clearPreview(id);
    doc = next;
    persist();
    draw();
    $("status").textContent = "";
  } catch {
    $("status").textContent = strings[lang].error;
  }
  e.target.value = "";
};
draw();
