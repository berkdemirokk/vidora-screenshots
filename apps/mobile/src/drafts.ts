/**
 * Pure (de)serialisation of the product-video editor state. Used for drafts
 * (work in progress) and for the sidecar kept next to each rendered video so
 * it can be edited or duplicated later. File access lives in draft-store.ts.
 */
import type {
  AspectRatio,
  FontStyle,
  PaletteId,
  ProductQuality,
  SceneInput,
  TemplateId,
} from "./product-templates";
import type { CategoryId, ExportPreset } from "./product-catalog";
import type { BackdropId } from "./backdrops";
import { PRICE_TAGS, type PriceTagId } from "./price-tags.ts";
import { parseOwnBackdrop, type OwnBackdrop } from "./backdrop-rules.ts";

export const DRAFT_VERSION = 1;

const TEMPLATE_IDS = [
  "showcase",
  "lightTour",
  "turntable",
  "campaign",
  "unboxing",
  "store",
  "editorial",
  "detail",
  "discount",
  "minimal",
] as const satisfies readonly TemplateId[];
// Lists are written out (not imported) so this file stays free of assets and
// native modules and runs under node --test.
const BACKDROP_IDS = [
  "marble-white",
  "marble-black",
  "travertine",
  "oak",
  "walnut",
  "concrete",
  "terrazzo",
  "linen",
  "paper-blush",
  "paper-sage",
  "paper-sand",
  "paper-night",
] as const satisfies readonly BackdropId[];
const RATIO_IDS = [
  "9:16",
  "4:5",
  "1:1",
] as const satisfies readonly AspectRatio[];
const FONT_IDS = [
  "system",
  "modern",
  "elegant",
  "editorial",
  "impact",
  "poster",
] as const satisfies readonly FontStyle[];
const PALETTE_IDS = [
  "noir",
  "blush",
  "ivory",
  "ocean",
  "emerald",
] as const satisfies readonly PaletteId[];
const CATEGORY_IDS = [
  "cosmetics",
  "jewellery",
  "fashion",
  "home",
  "food",
  "electronics",
] as const satisfies readonly CategoryId[];
const PRESETS = [
  "trendyol",
  "reels",
] as const satisfies readonly ExportPreset[];
const QUALITIES = [
  "720p",
  "1080p",
] as const satisfies readonly ProductQuality[];

/** Text limits match the text panel's maxLength values (with headroom). */
const MAX_TEXT = 120;

/** Everything the editor needs to show the same video again. */
export type EditState = {
  template: TemplateId;
  palette: PaletteId;
  category: CategoryId;
  /** True once the user picked a template or colour themselves (B6). */
  styleChosen: boolean;
  headline: string;
  price: string;
  badge: string;
  cta: string;
  store: string;
  /** A music file copied into the media folder by pickMusic(). */
  music: { file: string; name: string } | null;
  preset: ExportPreset;
  quality: ProductQuality;
  /** AI scene only; a bundled backdrop is stored by id in `backdrop`. */
  scene: SceneInput | null;
  /** Bundled studio backdrop; null for a plain palette or an AI scene. */
  backdrop: BackdropId | null;
  /**
   * The user's own backdrop photo (file name, not URI) with its settings.
   * Kept while another background is shown, so it comes back as it was.
   */
  ownBackdrop: OwnBackdrop | null;
  /** True when the own photo is the background now. */
  ownActive: boolean;
  ratio: AspectRatio;
  /** null follows the template's default type family. */
  fontStyle: FontStyle | null;
  /** Price before the discount; empty hides it. */
  oldPrice: string;
  /** Price tag layout (src/price-tags.ts); null keeps the template's own. */
  priceTag: PriceTagId | null;
  /** Brand accent in use (src/brand-kit.ts); null for the template's own. */
  brandAccent: { accent: string; onAccent: string } | null;
  /** The cut-out size; the image itself is stored next to the JSON. */
  cutout: { width: number; height: number };
};

export type Draft = EditState & {
  version: typeof DRAFT_VERSION;
  id: string;
  created: number;
  updated: number;
  /** The rendered video this draft re-edits; a re-render replaces it. */
  sourceClip: string | null;
};

const UUID = /^[0-9a-f-]{36}$/i;
/** File names written by pickMusic(): `<uuid>.<ext>`. */
const MUSIC_FILE = /^[0-9a-f-]{36}\.[a-z0-9]{1,8}$/i;

export const isDraftId = (value: unknown): value is string =>
  typeof value === "string" && UUID.test(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const PRICE_TAG_IDS = PRICE_TAGS.map((tag) => tag.id);
const HEX6 = /^#[0-9A-Fa-f]{6}$/;
function parseBrandAccent(value: unknown): EditState["brandAccent"] {
  const v = value as { accent?: unknown; onAccent?: unknown } | null;
  return v &&
    typeof v.accent === "string" &&
    typeof v.onAccent === "string" &&
    HEX6.test(v.accent) &&
    HEX6.test(v.onAccent)
    ? { accent: v.accent, onAccent: v.onAccent }
    : null;
}
const oneOf = <T extends string>(list: readonly T[], value: unknown) =>
  typeof value === "string" && (list as readonly string[]).includes(value)
    ? (value as T)
    : null;
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const text = (value: unknown) =>
  typeof value === "string" ? value.slice(0, MAX_TEXT) : "";

function parseScene(value: unknown): SceneInput | null {
  if (!isRecord(value) || typeof value.uri !== "string" || !value.uri)
    return null;
  const crop = value.crop,
    rect = value.productRect;
  if (!isRecord(crop) || !finite(crop.x) || !finite(crop.width)) return null;
  if (
    !isRecord(rect) ||
    !finite(rect.x) ||
    !finite(rect.y) ||
    !finite(rect.width) ||
    !finite(rect.height)
  )
    return null;
  return {
    uri: value.uri,
    crop: { x: crop.x, width: crop.width },
    productRect: {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    },
  };
}

/** Validate an edit state read from disk; null when it cannot be used. */
export function parseEditState(value: unknown): EditState | null {
  if (!isRecord(value)) return null;
  // An id this build does not know (e.g. a template removed later) falls
  // back to a default instead of losing the whole draft; a draft with no
  // template at all is not one of ours.
  if (typeof value.template !== "string") return null;
  const template = oneOf(TEMPLATE_IDS, value.template) ?? "showcase",
    palette = oneOf(PALETTE_IDS, value.palette) ?? "ivory",
    category = oneOf(CATEGORY_IDS, value.category) ?? "cosmetics";
  const cutout = value.cutout;
  if (
    !isRecord(cutout) ||
    !finite(cutout.width) ||
    !finite(cutout.height) ||
    cutout.width <= 0 ||
    cutout.height <= 0
  )
    return null;
  const ownBackdrop = parseOwnBackdrop(value.ownBackdrop);
  const music =
    isRecord(value.music) &&
    typeof value.music.file === "string" &&
    MUSIC_FILE.test(value.music.file)
      ? {
          file: value.music.file,
          name: text(value.music.name) || value.music.file,
        }
      : null;
  return {
    template,
    palette,
    category,
    styleChosen: value.styleChosen === true,
    headline: text(value.headline),
    price: text(value.price),
    badge: text(value.badge),
    cta: text(value.cta),
    store: text(value.store),
    music,
    preset: oneOf(PRESETS, value.preset) ?? "trendyol",
    quality: oneOf(QUALITIES, value.quality) ?? "720p",
    scene: parseScene(value.scene),
    // Fields added later default so older drafts and videos still open.
    backdrop: oneOf(BACKDROP_IDS, value.backdrop),
    ownBackdrop,
    // Drafts from before this field showed their photo whenever they had one.
    ownActive: ownBackdrop
      ? typeof value.ownActive === "boolean"
        ? value.ownActive
        : true
      : false,
    ratio: oneOf(RATIO_IDS, value.ratio) ?? "9:16",
    fontStyle: oneOf(FONT_IDS, value.fontStyle),
    oldPrice: text(value.oldPrice),
    priceTag: oneOf(PRICE_TAG_IDS, value.priceTag),
    brandAccent: parseBrandAccent(value.brandAccent),
    cutout: { width: cutout.width, height: cutout.height },
  };
}

/** Parse a draft file; null for anything damaged or from another version. */
export function parseDraft(raw: string, expectedId?: string): Draft | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value) || value.version !== DRAFT_VERSION) return null;
  if (!isDraftId(value.id)) return null;
  if (expectedId !== undefined && value.id !== expectedId) return null;
  if (!finite(value.created) || !finite(value.updated)) return null;
  const state = parseEditState(value);
  if (!state) return null;
  return {
    ...state,
    version: DRAFT_VERSION,
    id: value.id,
    created: value.created,
    updated: value.updated,
    sourceClip: isDraftId(value.sourceClip) ? value.sourceClip : null,
  };
}

/** Only the known fields, so nothing unexpected is written to disk. */
export function pickEditState(state: EditState): EditState {
  return {
    template: state.template,
    palette: state.palette,
    category: state.category,
    styleChosen: state.styleChosen,
    headline: state.headline,
    price: state.price,
    badge: state.badge,
    cta: state.cta,
    store: state.store,
    music: state.music
      ? { file: state.music.file, name: state.music.name }
      : null,
    preset: state.preset,
    quality: state.quality,
    scene: state.scene,
    backdrop: state.backdrop,
    ownBackdrop: state.ownBackdrop ? { ...state.ownBackdrop } : null,
    ownActive: !!state.ownBackdrop && state.ownActive,
    ratio: state.ratio,
    fontStyle: state.fontStyle,
    oldPrice: state.oldPrice,
    priceTag: state.priceTag,
    brandAccent: state.brandAccent ? { ...state.brandAccent } : null,
    cutout: { width: state.cutout.width, height: state.cutout.height },
  };
}

export function serializeDraft(draft: Draft): string {
  return JSON.stringify({
    version: DRAFT_VERSION,
    id: draft.id,
    created: draft.created,
    updated: draft.updated,
    sourceClip: draft.sourceClip,
    ...pickEditState(draft),
  });
}
export function serializeEditState(state: EditState): string {
  return JSON.stringify(pickEditState(state));
}

/** True when two states would make the same video. */
export function sameEditState(a: EditState, b: EditState): boolean {
  return serializeEditState(a) === serializeEditState(b);
}

/** A short name for lists: the headline, else the template name. */
export function draftTitle(
  draft: Pick<EditState, "headline">,
  templateName: string,
): string {
  const headline = draft.headline.trim();
  return headline ? headline.slice(0, 40) : templateName;
}

/** Newest first; damaged entries are dropped. */
export function sortDrafts<T extends { updated: number }>(drafts: T[]): T[] {
  return [...drafts].sort((a, b) => b.updated - a.updated);
}
