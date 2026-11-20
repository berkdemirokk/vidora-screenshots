import { useCallback, useEffect, useRef, useState } from "react";
import { useVideoPlayer } from "expo-video";
import { Image } from "react-native";
import { hasPlayingPreview, previewFlipbook } from "../product";
import { specProblems, type ProductVideoSpec } from "../product-templates";
import { nativePreviewQueue } from "../native-queue";
import { createPreviewSchedule } from "../preview-schedule";
import { previewFreezeStep } from "../preview-freeze";
import { diag } from "../diag";
import { FLIPBOOK_FPS, QUICK_FPS, flipbookTimes } from "./flipbook";

export type Flipbook = { uris: string[]; duration: number };

/** Wait after the last edit before drawing new frames. */
const DEBOUNCE_MS = 400;
/** Wait before asking again when a pass came back empty (e.g. stale). */
const RETRY_MS = 600;
const MAX_RETRIES = 8;

/**
 * Frames of the video for the looping preview, redrawn shortly after each
 * edit. A quick pass (3 fps) arrives first, then the full pass (12 fps).
 * The previous frames stay on screen until new ones are ready.
 *
 * Calls go through the shared native preview queue (posters use it too), so
 * a poster never cancels the preview; a pass that still comes back empty is
 * retried (`preview-schedule.ts`).
 *
 * `frozen` (a video render is running): no native call is made, the retry
 * timer is dropped and a pass still in flight is ignored, so no new frames
 * are committed and the frame on screen stays. The native render takes the
 * device to itself and makes every pending preview pass stale (its
 * PreviewGate.invalidate), so a preview asking during the render would only
 * come back empty and be retried again and again. When `frozen` ends the
 * preview continues exactly as before: nothing is asked again if the last
 * ask had finished for this spec (the frames are still valid); an ask that
 * was cut short, or a spec that changed meanwhile, is asked again.
 */
export function usePlayingPreview(
  spec: ProductVideoSpec | null,
  boxWidth = 0,
  frozen = false,
): {
  flipbook: Flipbook | null;
  updating: boolean;
  /** The passes gave up and this spec has no frames. */
  failed: boolean;
  /** Ask again for the current spec. */
  retry: () => void;
} {
  const [flipbook, setFlipbook] = useState<Flipbook | null>(null),
    [updating, setUpdating] = useState(false),
    [failed, setFailed] = useState(false);
  // Read by the full pass; kept outside the schedule so a resize alone does
  // not redraw. TODO(render-quality): pass flipbookWidth(ratio, box, scale)
  // once previewFlipbook(spec, times, width?) exists in src/product.ts.
  const box = useRef(boxWidth);
  box.current = boxWidth;
  // Read by every callback below; set while rendering, so it is current
  // before the commit that shows the frozen state.
  const frozenNow = useRef(frozen);
  frozenNow.current = frozen;
  /** The spec the schedule was last asked for, and whether that ask ended. */
  const asked = useRef<ProductVideoSpec | null>(null);
  const settled = useRef(false);
  /** The freeze cut an ask short or skipped a changed spec. */
  const wasFrozen = useRef(false);
  const schedule = useRef<ReturnType<
    typeof createPreviewSchedule<ProductVideoSpec>
  > | null>(null);
  if (!schedule.current)
    schedule.current = createPreviewSchedule<ProductVideoSpec>({
      request: (next, pass) =>
        nativePreviewQueue.enqueue(
          () =>
            // A job queued before the render began must not reach the
            // native side; its token is stale, so the null is ignored.
            frozenNow.current
              ? Promise.resolve(null)
              : hasPlayingPreview()
              ? previewFlipbook(
                  next,
                  flipbookTimes(
                    next.duration,
                    pass === "quick" ? QUICK_FPS : FLIPBOOK_FPS,
                  ),
                )
              : // Older builds: the three still frames.
                previewFlipbook(next, []),
          "high",
        ),
      onFrames: (next, uris) => {
        // A render started meanwhile: the frame on screen stays.
        if (frozenNow.current) return;
        // Decode ahead so flipping never waits on the disk.
        uris.forEach((uri) => void Image.prefetch(uri).catch(() => false));
        setFlipbook({ uris, duration: next.duration });
      },
      onUpdating: (busy) => {
        if (!busy) settled.current = true;
        setUpdating(busy);
      },
      isValid: (next) => specProblems(next).length === 0,
      twoPasses: hasPlayingPreview,
      debounceMs: DEBOUNCE_MS,
      retryMs: RETRY_MS,
      maxRetries: MAX_RETRIES,
      // A preview that does not start (QA run 13) shows up in the log.
      onRetry: (tries) => diag("preview retry", { tries }),
      onFailed: () => setFailed(true),
      onGiveUp: () => diag("preview stalled", { tries: MAX_RETRIES }),
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (handle) =>
        clearTimeout(handle as ReturnType<typeof setTimeout>),
    });

  const latestSpec = useRef(spec);
  latestSpec.current = spec;
  /** Ask the schedule for these frames (debounced, quick pass then full). */
  const ask = useCallback((next: ProductVideoSpec | null) => {
    asked.current = next;
    settled.current = false;
    schedule.current?.update(next);
  }, []);
  useEffect(() => {
    if (!spec) setFlipbook(null);
    setFailed(false);
    // While frozen nothing is asked; the thaw below asks for the latest spec.
    if (!frozenNow.current) ask(spec);
  }, [spec, ask]);
  const retry = useCallback(() => {
    if (frozenNow.current) return;
    setFailed(false);
    ask(latestSpec.current);
  }, [ask]);
  useEffect(() => {
    const step = previewFreezeStep({
      frozen,
      wasFrozen: wasFrozen.current,
      settled: settled.current,
      askedIsLatest: asked.current === latestSpec.current,
    });
    wasFrozen.current = frozen;
    if (step === "drop") {
      // Drop what is waiting (debounce, retry timer) and ignore a pass in
      // flight (its frames are never committed). An ask that already ended
      // keeps its frames ("keep"): they stay valid for this spec.
      schedule.current?.dispose();
      setUpdating(false);
    } else if (step === "restart") {
      ask(latestSpec.current);
    }
  }, [frozen, ask]);
  useEffect(() => () => schedule.current?.dispose(), []);

  return { flipbook, updating, failed, retry };
}

/** The mute choice lasts for the app session, across editor visits. */
let mutedThisSession = false;

/**
 * Plays the chosen music with the looping preview: it starts, stops and
 * jumps back to the start together with the frames (PreviewPlayer's
 * onPlayback). Muting lets other apps' audio keep playing.
 */
export function usePreviewMusic(
  uri: string | null,
  duration: number,
  volume: number,
): {
  onPlayback: (playing: boolean, time: number) => void;
  muted: boolean;
  setMuted: (muted: boolean) => void;
} {
  const [muted, setMutedState] = useState(mutedThisSession);
  const player = useVideoPlayer(uri ? { uri } : null, (created) => {
    created.loop = false;
    created.volume = volume;
    created.muted = mutedThisSession;
    // "auto": other apps keep playing while the preview is muted.
    created.audioMixingMode = "auto";
    created.showNowPlayingNotification = false;
    created.staysActiveInBackground = false;
  });
  /** Last state reported by the preview, to resume a newly chosen track. */
  const clock = useRef({ playing: false, time: 0, at: 0 });

  useEffect(() => {
    player.muted = muted;
  }, [player, muted]);
  useEffect(() => {
    player.volume = volume;
  }, [player, volume]);

  // A new track (or the first one) joins in at the preview's current time.
  useEffect(() => {
    const { playing, time, at } = clock.current;
    if (!uri || !playing) return;
    try {
      const elapsed = time + (Date.now() - at) / 1000;
      player.currentTime = duration > 0 ? elapsed % duration : 0;
      player.play();
    } catch {
      // The player is being replaced; the next loop restarts the music.
    }
  }, [player, uri, duration]);

  const onPlayback = useCallback(
    (playing: boolean, time: number) => {
      clock.current = { playing, time, at: Date.now() };
      if (!uri) return;
      try {
        if (playing) {
          player.currentTime = time;
          player.play();
        } else player.pause();
      } catch {
        // Released player (screen closing): nothing to stop.
      }
    },
    [player, uri],
  );

  const setMuted = useCallback((next: boolean) => {
    mutedThisSession = next;
    setMutedState(next);
  }, []);

  return { onPlayback, muted, setMuted };
}
