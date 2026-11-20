import type { Ratio } from "../../../packages/shared/studio";
type Spec = {
  src: string;
  start: number;
  end: number;
  ratio: Ratio;
  volume: number;
  title: string;
};
function ready(video: HTMLVideoElement, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
        cleanup();
        resolve();
      },
      error = () => {
        cleanup();
        reject(Error("Media decode failed"));
      },
      timeout = setTimeout(error, 12000);
    const cleanup = () => {
      clearTimeout(timeout);
      video.removeEventListener(event, done);
      video.removeEventListener("error", error);
    };
    video.addEventListener(event, done, { once: true });
    video.addEventListener("error", error, { once: true });
  });
}
export async function encode(
  spec: Spec,
  signal: AbortSignal,
  onProgress: (n: number) => void,
): Promise<Blob> {
  const mime = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4;codecs=avc1",
    "video/mp4",
  ].find(
    (v) =>
      typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(v),
  );
  if (!mime) throw Error("MP4 encoding unavailable");
  const video = document.createElement("video"),
    canvas = document.createElement("canvas");
  const [w, h] =
    spec.ratio === "16:9"
      ? [960, 540]
      : spec.ratio === "9:16"
        ? [540, 960]
        : [720, 720];
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw Error("Canvas unavailable");
  const audio = new AudioContext(),
    gain = audio.createGain(),
    output = audio.createMediaStreamDestination();
  let stream: MediaStream | undefined,
    timer: ReturnType<typeof setInterval> | undefined,
    recorder: MediaRecorder | undefined;
  try {
    await audio.resume();
    audio.createMediaElementSource(video).connect(gain);
    gain.gain.value = spec.volume;
    gain.connect(output);
    video.playsInline = true;
    video.preload = "auto";
    const loaded = ready(video, "loadeddata");
    video.src = spec.src;
    await loaded;
    if (spec.start > 0) {
      const seeked = ready(video, "seeked");
      video.currentTime = spec.start;
      await seeked;
    }
    const render = () => {
      const scale = Math.min(w / video.videoWidth, h / video.videoHeight),
        dw = video.videoWidth * scale,
        dh = video.videoHeight * scale;
      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(video, (w - dw) / 2, (h - dh) / 2, dw, dh);
      if (spec.title) {
        ctx.font = "bold 26px sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(0,0,0,.65)";
        ctx.fillRect(12, h - 62, w - 24, 48);
        ctx.fillStyle = "white";
        ctx.fillText(spec.title, w / 2, h - 29, w - 44);
      }
    };
    render();
    stream = canvas.captureStream(30);
    for (const track of output.stream.getAudioTracks()) stream.addTrack(track);
    recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: 3500000,
    });
    const chunks: BlobPart[] = [];
    const result = new Promise<Blob>((resolve, reject) => {
      recorder!.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      recorder!.onerror = () => reject(Error("Encoder error"));
      recorder!.onstop = () =>
        signal.aborted
          ? reject(new DOMException("Cancelled", "AbortError"))
          : chunks.length
            ? resolve(new Blob(chunks, { type: "video/mp4" }))
            : reject(Error("Empty export"));
    });
    const finish = () => {
      if (recorder?.state === "recording") recorder.stop();
    };
    signal.throwIfAborted();
    recorder.start();
    signal.addEventListener("abort", finish, { once: true });
    video.onended = finish;
    try {
      await video.play();
      const deadline = performance.now() + (spec.end - spec.start + 15) * 1000;
      timer = setInterval(() => {
        render();
        onProgress(
          Math.min(
            1,
            Math.max(
              0,
              (video.currentTime - spec.start) / (spec.end - spec.start),
            ),
          ),
        );
        if (video.currentTime >= spec.end) finish();
        else if (performance.now() > deadline) {
          recorder?.dispatchEvent(new Event("error"));
          finish();
        }
      }, 32);
      return await result;
    } finally {
      signal.removeEventListener("abort", finish);
    }
  } finally {
    clearInterval(timer);
    if (recorder?.state === "recording") recorder.stop();
    video.pause();
    video.removeAttribute("src");
    video.load();
    stream?.getTracks().forEach((t) => t.stop());
    await audio.close();
  }
}
