import { File, Paths } from "expo-file-system";
import { renderLoop, type PatternId } from "./synth.ts";
import { encodeWav } from "./wav.ts";

export { renderLoop, PATTERN_IDS, type PatternId } from "./synth.ts";
export { encodeWav } from "./wav.ts";

/** Bump when the synthesis changes so stale cached loops are not reused. */
const MUSIC_VERSION = 1;
const SAMPLE_RATE = 44100;

/**
 * Render a loop once and keep it in the cache folder; returns the file uri.
 * The name carries pattern, bpm, seconds and version.
 */
export async function musicFile(
  pattern: PatternId,
  bpm: number,
  seconds: number,
): Promise<string> {
  const name = `vidora-music-v${MUSIC_VERSION}-${pattern}-${Math.round(bpm * 100)}-${Math.round(seconds * 1000)}.wav`;
  const file = new File(Paths.cache, name);
  if (file.exists && file.size > 44) return file.uri;
  const wav = encodeWav(renderLoop(pattern, bpm, seconds, SAMPLE_RATE), SAMPLE_RATE);
  if (file.exists) file.delete();
  file.create();
  file.write(wav);
  return file.uri;
}
