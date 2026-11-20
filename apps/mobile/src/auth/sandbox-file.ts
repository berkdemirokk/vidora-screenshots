/**
 * The sandbox KV of session.ts: `{ "<key>": "<value>" }` in one small file in
 * the app's document directory. It disappears with the app, the Keychain does
 * not, which is the whole point (plan.md section 2, item 2): a launch marker
 * that is gone while the Keychain still holds a session means "reinstalled".
 *
 * Pure: the file system is injected (context.tsx passes expo-file-system), so
 * node --test covers the part that must never go wrong, namely that an
 * unreadable file never reads as "missing" (which would wipe the Keychain).
 */
import { SANDBOX_KEYS } from "./config.ts";
import type { KV } from "./session.ts";

export const SANDBOX_FILE = "vidora-auth-local.json";
/** Suffix of the copy a write goes through before it is moved over the real name. */
export const TMP = ".tmp";

export type Fs = {
  exists(name: string): boolean;
  /** Throws on an I/O error. */
  read(name: string): string;
  /** Atomic: writes `<name>.tmp`, then moves it over `<name>`. Throws on failure. */
  write(name: string, text: string): void;
};

type Entries = Record<string, string>;

type Read =
  { kind: "none" } | { kind: "ok"; entries: Entries } | { kind: "corrupt" };

const has = (o: object, k: string) =>
  Object.prototype.hasOwnProperty.call(o, k);

function parseEntries(text: string): Entries | null {
  try {
    const v: unknown = JSON.parse(text);
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    const out: Entries = {};
    for (const [k, val] of Object.entries(v))
      if (typeof val === "string") out[k] = val;
    return out;
  } catch {
    return null;
  }
}

export function createSandboxKV(fs: Fs, name: string = SANDBOX_FILE): KV {
  /**
   * Throws on an I/O error (callers must not conclude anything from it).
   * "none" only when there is no readable file at all; a complete `.tmp` copy
   * (a move that was cut short) counts, a lone half-written one does not (a
   * first write that never finished).
   */
  function read(): Read {
    const mainExists = fs.exists(name);
    if (mainExists) {
      const entries = parseEntries(fs.read(name));
      if (entries) return { kind: "ok", entries };
    }
    if (fs.exists(name + TMP)) {
      const entries = parseEntries(fs.read(name + TMP));
      if (entries) return { kind: "ok", entries };
    }
    return mainExists ? { kind: "corrupt" } : { kind: "none" };
  }

  /** Each write is a read-modify-write of the whole file, so they run one at a time. */
  let queue: Promise<unknown> = Promise.resolve();
  const exclusive = (job: () => void): Promise<void> => {
    const p = queue.then(job);
    queue = p.catch(() => undefined);
    return p;
  };

  return {
    /** Throws on any read problem except "the file does not exist" (then null). */
    async get(key) {
      const r = read();
      if (r.kind === "none") return null;
      if (r.kind === "corrupt") throw new Error("sandbox file unreadable");
      return has(r.entries, key) ? r.entries[key] : null;
    },
    /**
     * Rejects on I/O errors and leaves the file as it was. A file whose
     * content is garbage is replaced; since the app is evidently running in
     * this sandbox, the launch marker is written along with the value.
     */
    set(key, value) {
      return exclusive(() => {
        const r = read();
        const entries: Entries =
          r.kind === "ok"
            ? r.entries
            : r.kind === "corrupt"
              ? { [SANDBOX_KEYS.launched]: "1" }
              : {};
        entries[key] = value;
        fs.write(name, JSON.stringify(entries));
      });
    },
    del(key) {
      return exclusive(() => {
        const r = read();
        if (r.kind !== "ok" || !has(r.entries, key)) return;
        const entries = { ...r.entries };
        delete entries[key];
        fs.write(name, JSON.stringify(entries));
      });
    },
  };
}
