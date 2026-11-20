/**
 * Pure rules for backdrops chosen by the user: their own photo as the scene
 * ("Kendi fotoğrafın") and the set of backdrops for "Diğer zeminlerde de
 * üret". No assets and no native calls, so `backdrop-rules.test.mjs` runs in
 * Node.
 */
import { translate } from "./i18n/index.ts";
import type { Lang } from "./i18n/lang.ts";
import {
  sceneCrop,
  textColorsForScene,
  type SceneInput,
  type TextColors,
} from "./product-templates.ts";

/** The user's own photo as the backdrop, as stored in drafts. */
export type OwnBackdrop = {
  /** File name inside KareviaMedia/backdrops (never a URI). */
  file: string;
  /** Pixel size of the photo. */
  width: number;
  height: number;
  /** Product size relative to the normal placement. */
  scale: number;
  /** Vertical move of the product's base, in frame heights (+ is down). */
  offset: number;
  /** Text colour over the photo. */
  text: "light" | "dark";
};

export const OWN_SCALE = { min: 0.6, max: 1.4, step: 0.1 } as const;
export const OWN_OFFSET = { min: -0.24, max: 0.12, step: 0.04 } as const;

/** File names written for own backdrops: `<uuid>.<ext>`. */
export const OWN_FILE = /^[0-9a-f-]{36}\.(jpg|jpeg|png|heic|webp)$/i;

type Rect = { x: number; y: number; width: number; height: number };

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const round = (value: number) => Math.round(value * 1000) / 1000;

/** One step of a stepper, kept on the step grid and within the range. */
export function stepValue(
  value: number,
  direction: 1 | -1,
  range: { min: number; max: number; step: number },
): number {
  return round(clamp(value + direction * range.step, range.min, range.max));
}

/** Validate a stored own backdrop; null when it cannot be used. */
export function parseOwnBackdrop(value: unknown): OwnBackdrop | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.file !== "string" || !OWN_FILE.test(v.file)) return null;
  if (!finite(v.width) || !finite(v.height) || v.width <= 0 || v.height <= 0)
    return null;
  return {
    file: v.file,
    width: v.width,
    height: v.height,
    scale: finite(v.scale) ? clamp(v.scale, OWN_SCALE.min, OWN_SCALE.max) : 1,
    offset: finite(v.offset)
      ? clamp(v.offset, OWN_OFFSET.min, OWN_OFFSET.max)
      : 0,
    text: v.text === "dark" ? "dark" : "light",
  };
}

/** The centred 9:16 part of a photo (the engine's `sceneCrop`). */
export function centerCrop(width: number, height: number): SceneInput["crop"] {
  const crop = sceneCrop(width, height);
  return {
    x: round(crop.x),
    width: round(crop.width),
    y: round(crop.y),
    height: round(crop.height),
  };
}

/**
 * The product's place on an own photo: the normal placement (`base`, from
 * `productPlacement`) grown or shrunk around its base centre and moved up or
 * down, always kept inside the frame.
 */
export function ownProductRect(
  base: Rect,
  scale: number,
  offset: number,
): Rect {
  const s = clamp(scale, OWN_SCALE.min, OWN_SCALE.max);
  let width = base.width * s,
    height = base.height * s;
  // Never larger than the frame allows.
  const fit = Math.min(1, 0.96 / width, 0.9 / height);
  width *= fit;
  height *= fit;
  const centre = base.x + base.width / 2,
    bottom =
      base.y + base.height + clamp(offset, OWN_OFFSET.min, OWN_OFFSET.max);
  return {
    x: round(clamp(centre - width / 2, 0.02, 0.98 - width)),
    y: round(clamp(bottom - height, 0.04, 0.96 - height)),
    width: round(width),
    height: round(height),
  };
}

/** Text colours over an own photo. */
export const OWN_TEXT_COLORS: Record<OwnBackdrop["text"], TextColors> = {
  light: {
    ink: "#FFFFFF",
    accent: "#FFFFFF",
    onAccent: "#161412",
    sparkle: "#FFFFFF",
  },
  dark: {
    ink: "#1A1714",
    accent: "#1A1714",
    onAccent: "#FFFFFF",
    sparkle: "#FFFFFF",
  },
};

/**
 * Darkening over an own photo: half strength under light text so it stays
 * readable; none under dark text, which the darkening would fight.
 */
export const ownShade = (text: OwnBackdrop["text"]) =>
  text === "light" ? 0.5 : 0;

/** The scene for an own photo stored at `uri`. */
export function ownBackdropScene(
  uri: string,
  own: OwnBackdrop,
  base: Rect,
): SceneInput {
  return {
    uri,
    crop: centerCrop(own.width, own.height),
    productRect: ownProductRect(base, own.scale, own.offset),
    shade: ownShade(own.text),
  };
}

/**
 * Default text colour from the native `imageInfo` result (`topLuma` and
 * `bottomLuma`, 0...1), decided by the engine's `textColorsForScene`. Light
 * text when the result is missing or unreadable.
 */
export function textForImage(info: unknown): OwnBackdrop["text"] {
  if (!info || typeof info !== "object") return "light";
  const v = info as Record<string, unknown>;
  if (!finite(v.topLuma) || !finite(v.bottomLuma)) return "light";
  const colors = textColorsForScene({
    topLuma: v.topLuma,
    bottomLuma: v.bottomLuma,
  });
  return colors.ink.toUpperCase() === "#FFFFFF" ? "light" : "dark";
}

/**
 * Backdrops to pre-tick for "Diğer zeminlerde de üret": the current one
 * (when it is a bundled backdrop) and others that contrast with it, light
 * and dark alternating, starting with the opposite of the current one.
 */
export function contrastingBackdrops<Id extends string>(
  current: Id | null,
  all: readonly { id: Id; dark: boolean }[],
  total = 5,
): Id[] {
  const now = all.find((item) => item.id === current) ?? null;
  const picked: Id[] = now ? [now.id] : [];
  const others = all.filter((item) => item.id !== now?.id);
  const opposite = others.filter((item) => item.dark !== (now?.dark ?? false)),
    same = others.filter((item) => item.dark === (now?.dark ?? false));
  // Spread picks over each list so neighbours (similar papers) are skipped.
  const spread = (list: typeof others, n: number) => {
    if (n >= list.length) return list;
    const out: typeof others = [];
    for (let i = 0; i < n; i++)
      out.push(list[Math.floor((i * list.length) / n)]);
    return out;
  };
  const want = total - picked.length;
  const fromOpposite = spread(
    opposite,
    Math.min(opposite.length, Math.ceil(want / 2)),
  );
  const fromSame = spread(same, want - fromOpposite.length);
  const mixed: Id[] = [];
  for (let i = 0; i < Math.max(fromOpposite.length, fromSame.length); i++) {
    if (fromOpposite[i]) mixed.push(fromOpposite[i].id);
    if (fromSame[i]) mixed.push(fromSame[i].id);
  }
  for (const item of others)
    if (picked.length + mixed.length < total && !mixed.includes(item.id))
      mixed.push(item.id);
  return [...picked, ...mixed].slice(0, total);
}

/** At most this many backdrops in one image set. */
export const MAX_IMAGE_SET = 5;

/** The words for the result of an image set. */
export function imageSetSummary(
  result: {
    saved: number;
    /** Images the renderer could not make. */
    renderFailed: number;
    /** Images made but not added to Photos. */
    saveFailed: number;
    cancelled: boolean;
    /** The first failure in plain words, shown once. */
    reason?: string | null;
  },
  lang: Lang,
): string {
  const { saved, renderFailed, saveFailed, cancelled, reason } = result;
  const t = (tr: string, en: string) => translate(lang, tr, en);
  const img = (n: number) => (n === 1 ? "image" : "images");
  const parts: string[] = [];
  parts.push(
    saved === 0
      ? t("Hiç görsel kaydedilmedi.", "No images were saved.")
      : t(
          `${saved} görsel Fotoğraflar'a kaydedildi.`,
          `${saved} ${img(saved)} saved to Photos.`,
        ),
  );
  if (renderFailed > 0)
    parts.push(
      t(
        `${renderFailed} zeminde görsel hazırlanamadı.`,
        `${renderFailed} ${img(renderFailed)} could not be made.`,
      ),
    );
  if (saveFailed > 0)
    parts.push(
      t(
        `${saveFailed} görsel Fotoğraflar'a kaydedilemedi.`,
        `${saveFailed} ${img(saveFailed)} could not be added to Photos.`,
      ),
    );
  if (cancelled) parts.unshift(t("İptal edildi.", "Cancelled."));
  if (reason && renderFailed + saveFailed > 0) parts.push(reason);
  return parts.join(" ");
}
