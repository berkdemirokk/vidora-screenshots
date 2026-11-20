/**
 * "Hepsini çıkar" / Export all: the plan and the sequential runner. One Pro
 * gate sits in front of the whole run (in the screen); here the steps run one
 * after another because the native renderer and Photos handle one job at a
 * time. Pure (no imports of native modules), so it is tested in Node.
 */
import { translate } from "./i18n/index.ts";
import type { Lang } from "./i18n/lang.ts";
import type { AspectRatio } from "./product-templates";
import type { StillStyleId } from "./marketplace-images";

export type ExportStep =
  | { id: string; kind: "video"; ratio: AspectRatio; tr: string; en: string }
  | { id: string; kind: "still"; still: StillStyleId; tr: string; en: string };

/** 9:16, 4:5 and 1:1 videos, then the main image, the post and the story. */
export const EXPORT_ALL_STEPS: readonly ExportStep[] = [
  { id: "video-9-16", kind: "video", ratio: "9:16", tr: "Video 9:16", en: "Video 9:16" },
  { id: "video-4-5", kind: "video", ratio: "4:5", tr: "Video 4:5", en: "Video 4:5" },
  { id: "video-1-1", kind: "video", ratio: "1:1", tr: "Video 1:1", en: "Video 1:1" },
  { id: "still-main", kind: "still", still: "main", tr: "Ana görsel", en: "Main image" },
  { id: "still-instagram", kind: "still", still: "instagram", tr: "Instagram gönderi", en: "Instagram post" },
  { id: "still-story", kind: "still", still: "story", tr: "Hikâye kapağı", en: "Story cover" },
];

export type ExportAllSummary = {
  total: number;
  saved: number;
  failed: ExportStep[];
  cancelled: boolean;
  firstError: unknown;
  /** The run stopped early on an error that every later step would hit. */
  aborted: boolean;
};

/**
 * Run the steps in order. `isFatal(error)` (e.g. Photos permission denied)
 * stops the run; any other failure is counted and the next step still runs.
 * `isCancelled` is checked before each step.
 */
export async function runExportAll(
  steps: readonly ExportStep[],
  run: (step: ExportStep, index: number) => Promise<void>,
  hooks: {
    onStep?: (index: number, step: ExportStep) => void;
    isCancelled?: () => boolean;
    isFatal?: (error: unknown) => boolean;
  } = {},
): Promise<ExportAllSummary> {
  const summary: ExportAllSummary = {
    total: steps.length,
    saved: 0,
    failed: [],
    cancelled: false,
    firstError: null,
    aborted: false,
  };
  for (let index = 0; index < steps.length; index++) {
    if (hooks.isCancelled?.()) {
      summary.cancelled = true;
      break;
    }
    const step = steps[index];
    hooks.onStep?.(index, step);
    try {
      await run(step, index);
      summary.saved++;
    } catch (error) {
      if (hooks.isCancelled?.()) {
        summary.cancelled = true;
        break;
      }
      summary.failed.push(step);
      summary.firstError ??= error;
      if (hooks.isFatal?.(error)) {
        summary.aborted = true;
        break;
      }
    }
  }
  return summary;
}

/** "Hazırlanıyor 2/6: Video 4:5" for the progress line. */
export function exportAllLabel(
  index: number,
  total: number,
  step: ExportStep,
  lang: Lang,
): string {
  return translate(
    lang,
    `Hazırlanıyor ${index + 1}/${total}: ${step.tr}`,
    `Preparing ${index + 1}/${total}: ${step.en}`,
  );
}

/** Closing line; says exactly what was saved and what was not. */
export function exportAllSummaryLine(
  summary: ExportAllSummary,
  lang: Lang,
): string {
  const { saved, total, failed } = summary;
  const t = (tr: string, en: string) => translate(lang, tr, en);
  const names = failed.map((s) => translate(lang, s.tr, s.en)).join(", ");
  if (summary.cancelled)
    return t(
      `Durduruldu. ${saved}/${total} dosya Fotoğraflar'a kaydedildi.`,
      `Stopped. ${saved}/${total} files saved to Photos.`,
    );
  if (failed.length === 0)
    return t(
      `${saved} dosya Fotoğraflar'a kaydedildi.`,
      `${saved} files saved to Photos.`,
    );
  return t(
    `${saved}/${total} dosya kaydedildi. Hazırlanamayan: ${names}.`,
    `${saved}/${total} files saved. Not made: ${names}.`,
  );
}
