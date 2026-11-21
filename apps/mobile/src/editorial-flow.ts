/**
 * The editorial video's app flow, pure (editorial-flow.test.mjs runs it in
 * Node): how the editor opens, the bundled sample's shot mapping and the
 * note when the AI shots could not be made. The video itself is built by
 * recipes/editorial.ts (buildEditorialSpec); the sample files are resolved
 * by editorial-sample.ts.
 */
import {
  cloudErrorText,
  remaining,
  type CloudErrorCode,
  type CloudQuota,
} from "./cloud-rules.ts";

/** The video's name (Home card, render file name). */
export const EDITORIAL_NAME = { tr: "Editoryal", en: "Editorial" } as const;

/**
 * The bundled sample (assets/editorial/<name>.jpg): the AI shots
 * [context, hand, macro] and the seller photos.
 */
export const EDITORIAL_SAMPLE = {
  ai: ["ref-lavanta", "hand", "macro"],
  photos: ["flatlay", "ref-spa", "vanity"],
} as const;

/** No AI shot made (or kept): the video uses the seller's photos only. */
export const NO_SHOTS: readonly (string | null)[] = [null, null, null];

/**
 * How a new editor opens: `editorial` (route `editorial=1`, or the QA build's
 * sample flow), on the bundled `sample`, and whether to ask the cloud for
 * `shots` (photos picked on Home). A draft, a video or a gallery variant's
 * sample is never started here: a draft brings its own mode.
 */
export function editorialStart(
  params: {
    editorial?: string;
    sample?: string;
    variant?: string;
    draft?: string;
    edit?: string;
    duplicate?: string;
  },
  qaEditorial: boolean,
): { editorial: boolean; sample: boolean; shots: boolean } {
  const reopened = !!(params.draft || params.edit || params.duplicate);
  const sample = params.sample === "1";
  const editorial =
    !reopened &&
    (params.editorial === "1" || (qaEditorial && sample && !params.variant));
  return {
    editorial,
    sample: editorial && sample,
    shots: editorial && !sample,
  };
}

/** A re-shoot keeps an old shot where the new request made none. */
export function mergeShots(
  old: readonly (string | null)[],
  fresh: readonly (string | null)[],
): (string | null)[] {
  return [0, 1, 2].map((i) => fresh[i] ?? old[i] ?? null);
}

/**
 * How many of the 3 shots to ask for: what is left of today's allowance
 * when the app knows it (the last cloud answer), else all 3. A count from
 * before the daily reset is stale and ignored.
 */
export function shotsToRequest(
  quota: CloudQuota | null,
  now: number = Date.now(),
): number {
  if (!quota) return 3;
  const resets = Date.parse(quota.resetsAt);
  if (Number.isFinite(resets) && resets <= now) return 3;
  return Math.min(3, remaining(quota));
}

/** The note when fewer than 3 shots are left today (1 or 2). */
export function fewShotsNote(
  t: (tr: string, en: string) => string,
  left: number,
): string {
  return t(
    `Bugün ${left} çekim hakkın kaldı; kalanlar kendi fotoğraflarınla tamamlanacak.`,
    `You have ${left} shots left today; the rest will use your own photos.`,
  );
}

const OWN_PHOTOS = {
  tr: "Videon kendi fotoğraflarınla hazırlanacak.",
  en: "Your video will be made from your own photos.",
};

/**
 * Why the shots did not come: the cloud's error text, plus "made from your
 * own photos" when no shot is in use. Each sentence is translated on its own
 * (`t` looks up the Turkish text).
 */
export function shotsNote(
  t: (tr: string, en: string) => string,
  code: CloudErrorCode,
  resetsAt: string | null,
  ownPhotos: boolean,
): string {
  const text = cloudErrorText(code, resetsAt);
  const base = t(text.tr, text.en);
  return ownPhotos ? base + " " + t(OWN_PHOTOS.tr, OWN_PHOTOS.en) : base;
}
