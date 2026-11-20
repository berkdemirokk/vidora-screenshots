import { sanitizeWords, type CaptionLocale, type Word } from "./captions";
import { LocalizedError, nativeEditor, uri, type Clip } from "./media";

export type SpeechErrorCode =
  | "denied"
  | "unavailable"
  | "no-speech"
  | "unsupported"
  | "cancelled"
  | "timeout";

/** A transcription failure with a user-facing message in both languages. */
export class SpeechError extends LocalizedError {
  readonly code: SpeechErrorCode;
  constructor(code: SpeechErrorCode, tr: string, en: string) {
    super(tr, en);
    this.name = "SpeechError";
    this.code = code;
  }
}

export function canTranscribe(): boolean {
  return typeof nativeEditor?.transcribe === "function";
}

/** Older native builds have no cancel; the UI hides the button then. */
export function canCancelTranscription(): boolean {
  return typeof nativeEditor?.cancelTranscribe === "function";
}

export function cancelTranscription(): void {
  nativeEditor?.cancelTranscribe?.();
}

/** Turn the native module's coded rejections into friendly messages. */
function speechError(error: unknown): unknown {
  // The code may be wrapped in a longer bridge message, so search for it.
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("speech-denied:"))
    return new SpeechError(
      "denied",
      "Konuşma tanıma izni verilmedi. Ayarlar > Vidora > Konuşma Tanıma bölümünden izin verebilirsin.",
      "Speech recognition permission was denied. You can allow it in Settings > Vidora > Speech Recognition.",
    );
  if (message.includes("speech-unavailable:"))
    return new SpeechError(
      "unavailable",
      "Bu dil için konuşma tanıma şu anda kullanılamıyor. İnternet bağlantını kontrol et ya da başka bir dil seç.",
      "Speech recognition is not available for this language right now. Check your connection or choose another language.",
    );
  if (message.includes("speech-cancelled:"))
    return new SpeechError(
      "cancelled",
      "Altyazı oluşturma durduruldu.",
      "Caption generation was stopped.",
    );
  if (message.includes("speech-timeout:"))
    return new SpeechError(
      "timeout",
      "Konuşma tanıma çok uzun sürdü. Tekrar dene ya da klibi kısalt.",
      "Speech recognition took too long. Try again or shorten the clip.",
    );
  if (message.includes("speech-busy:"))
    return new SpeechError(
      "unavailable",
      "Altyazılar zaten oluşturuluyor.",
      "Captions are already being generated.",
    );
  if (message.includes("no-speech:"))
    return new SpeechError(
      "no-speech",
      "Bu klipte konuşma bulunamadı.",
      "No speech was found in this clip.",
    );
  return error;
}

/**
 * Recognise the speech of a whole source clip. Words come back cleaned and
 * timed in seconds from the start of the file.
 */
export async function transcribeClip(
  clip: Clip,
  locale: CaptionLocale,
  onProgress: (progress: number) => void,
): Promise<{ words: Word[]; onDevice: boolean }> {
  const editor = nativeEditor;
  if (!editor || typeof editor.transcribe !== "function")
    throw new SpeechError(
      "unsupported",
      "Altyazı oluşturmak için iOS uygulama derlemesi gerekir.",
      "Generating captions requires the native iOS build.",
    );
  const subscription = editor.addListener("onTranscribeProgress", (event) => {
    const progress = Number(event?.progress);
    if (Number.isFinite(progress))
      onProgress(Math.min(1, Math.max(0, progress)));
  });
  try {
    const result = await editor.transcribe(uri(clip), locale);
    const words = sanitizeWords(result?.words);
    if (!words.length) throw Error("no-speech: empty result");
    return { words, onDevice: result?.onDevice === true };
  } catch (error) {
    throw speechError(error);
  } finally {
    subscription.remove();
  }
}
