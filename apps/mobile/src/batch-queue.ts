/**
 * Batch: up to 10 photos, cut out and rendered one at a time, each saved as
 * its own video (with its edit state, so it opens in the editor like any
 * other). The queue is plain JSON and is written after every step, so a
 * killed app resumes where it stopped. Pure (the disk functions live in
 * draft-store.ts), so it is tested in Node.
 */
export const BATCH_LIMIT = 10;
export const BATCH_VERSION = 1;

export type BatchStatus = "pending" | "working" | "done" | "failed";

export type BatchItem = {
  id: string;
  /** A copy of the photo inside the app's storage (the picker's cache goes). */
  photo: string;
  status: BatchStatus;
  /** The saved video once done. */
  clipId: string | null;
  /** Why it failed, in both languages. */
  error: { tr: string; en: string } | null;
};

export type BatchQueue = {
  version: typeof BATCH_VERSION;
  id: string;
  created: number;
  items: BatchItem[];
};

export function createBatch(
  id: string,
  photos: readonly string[],
  newId: () => string,
  now = Date.now(),
): BatchQueue {
  const unique = [...new Set(photos.filter((p) => !!p))].slice(0, BATCH_LIMIT);
  return {
    version: BATCH_VERSION,
    id,
    created: now,
    items: unique.map((photo) => ({
      id: newId(),
      photo,
      status: "pending" as const,
      clipId: null,
      error: null,
    })),
  };
}

/** Add photos to an unfinished queue, never past the limit. */
export function addPhotos(
  queue: BatchQueue,
  photos: readonly string[],
  newId: () => string,
): BatchQueue {
  const room = BATCH_LIMIT - queue.items.length;
  const have = new Set(queue.items.map((item) => item.photo));
  const fresh = [...new Set(photos)].filter((p) => !!p && !have.has(p));
  return {
    ...queue,
    items: [
      ...queue.items,
      ...fresh.slice(0, Math.max(0, room)).map((photo) => ({
        id: newId(),
        photo,
        status: "pending" as const,
        clipId: null,
        error: null,
      })),
    ],
  };
}

/** Anything left "working" died with the app: it runs again. */
export function resumeBatch(queue: BatchQueue): BatchQueue {
  return {
    ...queue,
    items: queue.items.map((item) =>
      item.status === "working" ? { ...item, status: "pending" } : item,
    ),
  };
}

/** Failed photos get another go ("Tekrar dene"). */
export function retryFailed(queue: BatchQueue): BatchQueue {
  return {
    ...queue,
    items: queue.items.map((item) =>
      item.status === "failed"
        ? { ...item, status: "pending", error: null }
        : item,
    ),
  };
}

export const nextItem = (queue: BatchQueue): BatchItem | null =>
  queue.items.find((item) => item.status === "pending") ?? null;

export function patchItem(
  queue: BatchQueue,
  id: string,
  patch: Partial<BatchItem>,
): BatchQueue {
  return {
    ...queue,
    items: queue.items.map((item) =>
      item.id === id ? { ...item, ...patch } : item,
    ),
  };
}

export function batchProgress(queue: BatchQueue) {
  const count = (status: BatchStatus) =>
    queue.items.filter((item) => item.status === status).length;
  return {
    total: queue.items.length,
    done: count("done"),
    failed: count("failed"),
    pending: count("pending") + count("working"),
  };
}

const STATUSES: readonly BatchStatus[] = [
  "pending",
  "working",
  "done",
  "failed",
];
const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

export function serializeBatch(queue: BatchQueue): string {
  return JSON.stringify(queue);
}

/** Validate a queue read from disk; null when it cannot be used. */
export function parseBatch(raw: string): BatchQueue | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value) || value.version !== BATCH_VERSION) return null;
  if (typeof value.id !== "string" || typeof value.created !== "number")
    return null;
  if (!Array.isArray(value.items)) return null;
  const items: BatchItem[] = [];
  for (const entry of value.items.slice(0, BATCH_LIMIT)) {
    if (!isRecord(entry)) return null;
    const { id, photo, status, clipId, error } = entry;
    if (typeof id !== "string" || typeof photo !== "string") return null;
    if (!STATUSES.includes(status as BatchStatus)) return null;
    items.push({
      id,
      photo,
      status: status as BatchStatus,
      clipId: typeof clipId === "string" ? clipId : null,
      error:
        isRecord(error) &&
        typeof error.tr === "string" &&
        typeof error.en === "string"
          ? { tr: error.tr, en: error.en }
          : null,
    });
  }
  return { version: BATCH_VERSION, id: value.id, created: value.created, items };
}

/**
 * Process the pending items one at a time. `process` does the cut-out and
 * the render and returns the saved clip id; `save` persists the queue after
 * each change; a cancel leaves the running item pending; any other error
 * marks just that photo failed and the run goes on.
 */
export async function runBatch(
  start: BatchQueue,
  deps: {
    process: (item: BatchItem) => Promise<string>;
    save: (queue: BatchQueue) => void;
    onChange?: (queue: BatchQueue) => void;
    isCancelled?: () => boolean;
    describe: (error: unknown) => { tr: string; en: string };
  },
): Promise<BatchQueue> {
  let queue = start;
  const commit = (next: BatchQueue) => {
    queue = next;
    try {
      deps.save(queue);
    } catch {
      // The run goes on; only resuming after a kill is lost.
    }
    deps.onChange?.(queue);
  };
  for (;;) {
    if (deps.isCancelled?.()) break;
    const item = nextItem(queue);
    if (!item) break;
    commit(patchItem(queue, item.id, { status: "working", error: null }));
    try {
      const clipId = await deps.process(item);
      commit(patchItem(queue, item.id, { status: "done", clipId }));
    } catch (error) {
      if (deps.isCancelled?.()) {
        commit(patchItem(queue, item.id, { status: "pending" }));
        break;
      }
      commit(
        patchItem(queue, item.id, {
          status: "failed",
          error: deps.describe(error),
        }),
      );
    }
  }
  return queue;
}
