export type Clip = {
  id: string;
  file: string;
  name: string;
  kind: "source" | "export";
  created: number;
  duration: number;
  /** Optional poster frame stored next to the media as `<id>.jpg`. */
  thumbnail?: string;
};

export function parseClipMetadata(text: string, filename: string): Clip | null {
  try {
    const clip: unknown = JSON.parse(text);
    if (!clip || typeof clip !== "object") return null;
    const c = clip as Record<string, unknown>;
    if (
      typeof c.id !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(c.id) ||
      filename !== c.id + ".json" ||
      typeof c.file !== "string" ||
      !c.file.startsWith(c.id + ".") ||
      !/^[0-9a-f-]{36}\.[a-z0-9]{1,8}$/i.test(c.file) ||
      typeof c.name !== "string" ||
      (c.kind !== "source" && c.kind !== "export") ||
      typeof c.created !== "number" ||
      !Number.isFinite(c.created) ||
      typeof c.duration !== "number" ||
      !Number.isFinite(c.duration) ||
      c.duration < 0 ||
      (c.thumbnail !== undefined && c.thumbnail !== c.id + ".jpg")
    )
      return null;
    return c as Clip;
  } catch {
    return null;
  }
}
