/**
 * QA diagnostics. In the simulator QA build (a Release build with
 * `FEATURES.screenshotMode`) React Native drops console.log/warn before the
 * system log, so diagnostics go out as console.error there (no LogBox in
 * release builds); elsewhere they are console.warn, dev-only noise.
 *
 * Never pass user content: no texts, no prices, no full file paths. `clean`
 * cuts any path down to its file name.
 */
import { FEATURES } from "./config.ts";

/** Paths in a message or value shortened to the file name. */
export function clean(value: unknown): unknown {
  if (typeof value === "string")
    return value.replace(/(?:file:\/\/)?\/[^\s'"()]*\/([^\s/'"()]+)/g, "…/$1");
  if (value instanceof Error) return clean(value.message);
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) out[key] = clean(item);
    return out;
  }
  return value;
}

export function diag(message: string, data?: unknown): void {
  const line = "[vidora] " + message;
  const args = data === undefined ? [line] : [line, clean(data)];
  if (FEATURES.screenshotMode) console.error(...args);
  else console.warn(...args);
}
