/**
 * What happens to the library after a render. Pure (the store functions are
 * passed in), so `render-commit.test.mjs` runs it against the real draft
 * store on a fake file system.
 *
 * Rules (data-safety review, findings 1 and 6):
 * - Nothing is deleted unless the new video's edit state was saved. A failed
 *   save leaves the previous video, its edit state and the draft as they were.
 * - A render replaces an earlier video only when the editor was opened with
 *   Düzenle on that video and the new render has the same frame shape; a new
 *   video, a duplicate or another shape is added and the earlier one stays.
 */
export type EditTarget = { clipId: string; ratio: string };

/** The video this render replaces, or null when it is added. */
export function replaceTarget(
  target: EditTarget | null,
  ratio: string,
): string | null {
  return target && target.ratio === ratio ? target.clipId : null;
}

export type CommitStore<State, Clip> = {
  saveEdit: (clipId: string, state: State, cutoutUri: string) => void;
  findClip: (clipId: string) => Promise<Clip | null>;
  removeClip: (clip: Clip) => void;
  removeEdit: (clipId: string) => void;
  deleteDraft: (draftId: string) => void;
};

export type CommitResult = {
  /** The new video's edit state was written (Düzenle / Çoğalt work). */
  saved: boolean;
  /** An earlier video was removed in favour of the new one. */
  replaced: boolean;
};

export async function commitRender<State, Clip>(
  input: {
    clipId: string;
    state: State | null;
    cutoutUri: string | null;
    draftId: string;
    replace: string | null;
  },
  store: CommitStore<State, Clip>,
): Promise<CommitResult> {
  if (!input.state || !input.cutoutUri)
    return { saved: false, replaced: false };
  try {
    store.saveEdit(input.clipId, input.state, input.cutoutUri);
  } catch {
    // Keep everything: the draft still holds the work, the old video stays.
    return { saved: false, replaced: false };
  }
  let replaced = false;
  if (input.replace && input.replace !== input.clipId) {
    try {
      const old = await store.findClip(input.replace);
      if (old) {
        // Only the in-app copy; anything saved to Photos stays untouched.
        store.removeClip(old);
        replaced = true;
      }
      store.removeEdit(input.replace);
    } catch {
      // The old entry stays; the user can delete it in the library.
    }
  }
  try {
    // The work now lives with the new video.
    store.deleteDraft(input.draftId);
  } catch {
    // A leftover draft can be deleted from the library.
  }
  return { saved: true, replaced };
}
