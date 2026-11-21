import type { useRouter } from "expo-router";
import type { PaywallReason } from "../pro";
import {
  createOpenGuard,
  editorSessionKey,
  singularEditor,
} from "../editor-session";

type Router = ReturnType<typeof useRouter>;

/** A double tap opens the editor once. */
const guard = createOpenGuard();

/**
 * Open the product editor on a draft, a video (Düzenle) or a copy of a video
 * (Çoğalt). One draft or video never gets two editors: a second open within
 * a second is ignored, and an older editor on the same work is taken out of
 * the history (`dangerouslySingular`), so a stale editor can never write the
 * draft again (data-safety finding 3).
 */
export function openEditor(
  router: Router,
  target: {
    draft?: { id: string; sourceClip: string | null };
    edit?: string;
    duplicate?: string;
    /**
     * For a new video: template, ratio, goal (Home's intent tiles) or a
     * gallery variant (Home's template gallery), or `editorial: "1"`
     * (Home's Editoryal card).
     */
    start?: {
      template?: string;
      ratio?: string;
      goal?: string;
      variant?: string;
      editorial?: string;
    };
    /** Open the photo source sheet at once (Home's "Fotoğraf seç"). */
    pick?: boolean;
    /** Photos already picked on Home (gallery card): photo 1 first. */
    photos?: string[];
  },
  mode: "push" | "replace" = "push",
): void {
  const session = editorSessionKey(target);
  const key =
    session ?? (target.duplicate ? "duplicate:" + target.duplicate : "new");
  if (!guard(key)) return;
  const params: Record<string, string> = {};
  if (target.draft) params.draft = target.draft.id;
  if (target.edit) params.edit = target.edit;
  if (target.duplicate) params.duplicate = target.duplicate;
  if (session) params.session = session;
  // Every new-video entry point shares the "new" key, so a double tap on
  // any of them opens one editor (audit F35).
  if (!target.draft && !target.edit && !target.duplicate && target.start)
    for (const [key, value] of Object.entries(target.start))
      if (value) params[key] = value;
  const fresh = !target.draft && !target.edit && !target.duplicate;
  if (target.pick && fresh) params.pick = "1";
  // A JSON list of local file URIs; create.tsx validates it (parsePhotosParam).
  if (target.photos && target.photos.length > 0 && fresh)
    params.photos = JSON.stringify(target.photos);
  const href = { pathname: "/create" as const, params };
  const options = session ? { dangerouslySingular: singularEditor } : undefined;
  if (mode === "replace") router.replace(href, options);
  else router.push(href, options);
}

/** Why the paywall opened (it explains the gated action). */
export type PaywallEntry = PaywallReason;

/**
 * Open the paywall once, however fast the gated button is tapped (audit
 * F35). `frame` is the current end card (a local image) for its hero;
 * `ratio` its shape.
 */
export function openPaywall(
  router: Router,
  reason: PaywallEntry,
  extra: { frame?: string | null; ratio?: string } = {},
): void {
  if (!guard("paywall")) return;
  const params: Record<string, string> = { reason };
  if (extra.frame) params.frame = extra.frame;
  if (extra.ratio) params.ratio = extra.ratio;
  router.push({ pathname: "/paywall", params });
}
