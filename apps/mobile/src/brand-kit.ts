/**
 * Brand kit (Batch 4): a logo, an accent colour and a type family that new
 * videos start with. Stored like drafts: a small JSON plus the copied logo
 * inside the media folder (KareviaMedia/brand/), so they stay out of iCloud
 * backup and "delete all data" removes them.
 *
 *   KareviaMedia/brand/brand-kit.json
 *   KareviaMedia/brand/logo.<ext>
 *
 * Applied at editor start: the accent colour and font are used now. The
 * native video engine has no way to draw an image over the video yet, so the
 * logo is stored and shown in the kit screen only (a later native item).
 *
 * The pure half (parse, colours) has no React Native imports so `node --test`
 * can load it; file access loads expo-file-system lazily.
 */
import { FONT_STYLES, type FontStyle } from "./product-templates.ts";

export type BrandKit = {
  /** "#RRGGBB" accent, or null to keep the template's own. */
  accent: string | null;
  /** Bundled type family, or null for the template's own. */
  font: FontStyle | null;
  /** File name inside the brand folder, or null. */
  logo: string | null;
};

export const EMPTY_BRAND_KIT: BrandKit = {
  accent: null,
  font: null,
  logo: null,
};

/** Accent swatches; each reads with ink or white type on it. */
export const BRAND_SWATCHES: readonly {
  id: string;
  hex: string;
  tr: string;
  en: string;
}[] = [
  { id: "orange", hex: "#FF7A00", tr: "Turuncu", en: "Orange" },
  { id: "red", hex: "#D7263D", tr: "Kırmızı", en: "Red" },
  { id: "navy", hex: "#1F3A93", tr: "Lacivert", en: "Navy" },
  { id: "green", hex: "#1B7F5C", tr: "Yeşil", en: "Green" },
  { id: "purple", hex: "#6B3FA0", tr: "Mor", en: "Purple" },
  { id: "ink", hex: "#141210", tr: "Siyah", en: "Black" },
];

/** Families offered: the ones already bundled with the app (FONT_STYLES). */
export const BRAND_FONTS = FONT_STYLES;

const LOGO_FILE = /^logo\.(jpg|jpeg|png|heic|webp)$/;

export const isBrandKitEmpty = (kit: BrandKit | null): boolean =>
  !kit || (!kit.accent && !kit.font && !kit.logo);

/** Parses a stored kit; anything unknown or malformed is dropped. */
export function parseBrandKit(raw: string | null | undefined): BrandKit | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || typeof value !== "object") return null;
    const swatch =
      typeof value.accent === "string"
        ? BRAND_SWATCHES.find(
            (s) => s.hex.toLowerCase() === (value.accent as string).toLowerCase(),
          )
        : undefined;
    const font =
      typeof value.font === "string" &&
      FONT_STYLES.some((f) => f.id === value.font)
        ? (value.font as FontStyle)
        : null;
    const logo =
      typeof value.logo === "string" && LOGO_FILE.test(value.logo)
        ? value.logo
        : null;
    const kit: BrandKit = { accent: swatch?.hex ?? null, font, logo };
    return isBrandKitEmpty(kit) ? null : kit;
  } catch {
    return null;
  }
}

export const serializeBrandKit = (kit: BrandKit): string =>
  JSON.stringify({ accent: kit.accent, font: kit.font, logo: kit.logo });

const channel = (v: number) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
}
/** WCAG contrast ratio of two "#RRGGBB" colours. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Type colour that reads best on `fill`: ink or white. */
export function onColor(fill: string): string {
  return contrastRatio(fill, "#141210") >= contrastRatio(fill, "#FFFFFF")
    ? "#141210"
    : "#FFFFFF";
}

/**
 * The kit's accent with the type colour on it, for `TemplateInput.brandAccent`
 * (the template keeps its own ink and decides where the accent shows).
 */
export function brandAccent(
  kit: BrandKit | null,
): { accent: string; onAccent: string } | null {
  return kit?.accent
    ? { accent: kit.accent, onAccent: onColor(kit.accent) }
    : null;
}

// File access (lazy so node tests never load the native modules).

async function brandFolder() {
  const { Directory } = await import("expo-file-system");
  const { mediaFolder } = await import("./media");
  const folder = new Directory(mediaFolder(), "brand");
  if (!folder.exists) folder.create({ intermediates: true, idempotent: true });
  return folder;
}

const TMP = ".tmp";

/** The stored kit, or null (also when nothing is stored or reading fails). */
export async function loadBrandKit(): Promise<BrandKit | null> {
  try {
    const { File } = await import("expo-file-system");
    const folder = await brandFolder();
    for (const name of ["brand-kit.json", "brand-kit.json" + TMP]) {
      const file = new File(folder, name);
      if (!file.exists) continue;
      const kit = parseBrandKit(file.textSync());
      if (kit) return kit;
    }
  } catch {
    // Best effort: a missing kit just means template defaults.
  }
  return null;
}

/**
 * Saves the kit. A newly picked logo (`pickedLogoUri`) is copied into the
 * brand folder first; the returned kit's `logo` names the copy. Writes go to
 * a `.tmp` first so a kill never leaves a half file.
 */
export async function saveBrandKit(
  kit: BrandKit,
  pickedLogoUri?: string | null,
): Promise<BrandKit> {
  const { File } = await import("expo-file-system");
  const folder = await brandFolder();
  let logo = kit.logo;
  const dropLogos = () => {
    for (const old of folder.list())
      if (old instanceof File && /^logo\./.test(old.name)) old.delete();
  };
  if (pickedLogoUri) {
    const match = /\.([a-z0-9]{1,5})(?:\?.*)?$/i.exec(pickedLogoUri);
    const ext = match ? match[1].toLowerCase() : "png";
    logo =
      "logo." +
      (["jpg", "jpeg", "png", "heic", "webp"].includes(ext) ? ext : "png");
    const source = new File(pickedLogoUri);
    if (!source.exists) throw new Error("missing logo");
    dropLogos();
    source.copySync(new File(folder, logo));
  } else if (!logo) {
    dropLogos();
  }
  const next: BrandKit = { ...kit, logo };
  const dest = new File(folder, "brand-kit.json");
  const temp = new File(dest.uri + TMP);
  if (temp.exists) temp.delete();
  temp.create();
  temp.writeSync(serializeBrandKit(next));
  temp.moveSync(dest, { overwrite: true });
  return next;
}

/** Local URI of the stored logo, or null. */
export async function brandLogoUri(
  kit: BrandKit | null,
): Promise<string | null> {
  if (!kit?.logo) return null;
  try {
    const { File } = await import("expo-file-system");
    const file = new File(await brandFolder(), kit.logo);
    return file.exists ? file.uri : null;
  } catch {
    return null;
  }
}
