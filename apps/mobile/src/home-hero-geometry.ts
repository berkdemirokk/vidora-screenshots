/**
 * Where Home's full-bleed hero sits so the product stays above the sheet.
 * Pure, so `home-hero-geometry.test.mjs` runs it in Node; `app/(tabs)/(studio)
 * /index.tsx` applies the answers.
 *
 * The hero (the engine's sample poster, or the latest video, both the same
 * 9:16 campaign composition) is drawn from the top edge, P = posterHeight tall.
 * The paper sheet covers the window's lower part. On a tall phone the product
 * band of the poster ends well above the sheet; on a short one (16:9) it does
 * not, so the hero moves UP by `heroOffset` points. The tag and the title may
 * leave the top: that is accepted.
 */

/**
 * The product (cap to base, shadow included) in the campaign poster, as
 * fractions of the poster height. Measured on the simulator (440x956, run 23):
 * cap at 239.0 pt and base at 532.3 pt of a 782 pt poster, i.e. 0.306 and
 * 0.681; 375x667 shows the cap at 205 pt of 667 (0.307).
 */
export const PRODUCT_TOP = 0.305;
export const PRODUCT_BOTTOM = 0.683;
/** The product's base stays at least this far above the sheet's top edge. */
export const BOTTOM_GAP = 12;
/** The product's top stays at least this far below the safe-area top. */
export const TOP_GAP = 8;

/**
 * Short (16:9) windows, e.g. iPhone SE / the iPad's iPhone window (375x667).
 * There the sheet's bottom padding is trimmed by SHEET_TRIM: the tab inset
 * counts the tab bar (49 pt) on top of a safe-area inset that already
 * includes it on iOS 26, which leaves a ~65 pt dead gap between the claim and
 * the bar. Without the trim the 12 pt bottom rule and the 8 pt top rule
 * cannot both hold on 375x667 (needs 197.6, room 175.4); with it they do. It
 * stays under ~40 pt so the claim never reaches the tab bar.
 */
export const SHORT_SCREEN = 700;
export const SHEET_TRIM = 30;

/** The sheet's bottom padding: the tab inset, trimmed on short windows. */
export function sheetPaddingBottom(
  windowHeight: number,
  tabInset: number,
): number {
  const inset = Math.max(0, finite(tabInset));
  return finite(windowHeight) < SHORT_SCREEN
    ? Math.max(0, inset - SHEET_TRIM)
    : inset;
}

/**
 * The bundled first-paint photo (assets/sample-product.jpg, 1080x1440): the
 * bottle spans about 8-93 % of its height (measured 0.089-0.938).
 */
export const PHOTO_ASPECT = 1080 / 1440;
export const PHOTO_BOTTLE_TOP = 0.089;
export const PHOTO_BOTTLE_BOTTOM = 0.938;

const finite = (n: number) => (Number.isFinite(n) ? n : 0);

/** The hero keeps its 9:16 shape from the top edge, never taller than the window. */
export function posterHeightFor(width: number, windowHeight: number): number {
  return Math.min(Math.round((finite(width) * 16) / 9), finite(windowHeight));
}

export type HeroGeometry = {
  /** Hero height (9:16 at the window width, at most the window height). */
  posterHeight: number;
  windowHeight: number;
  /** Measured height of the sheet (0 or unknown gives offset 0). */
  sheetHeight: number;
  /** Safe-area top (status bar / Dynamic Island). */
  safeTop: number;
};

/**
 * How far (points, whole, never negative) the hero moves up. The product's
 * base must end BOTTOM_GAP above the sheet; the move is capped so the
 * product's top keeps TOP_GAP below the safe area. When both cannot hold the
 * cap wins (the lowest bit of the base goes under the sheet).
 */
export function heroOffset(g: HeroGeometry): number {
  const posterHeight = finite(g.posterHeight);
  const sheetHeight = Math.max(0, finite(g.sheetHeight));
  const visible = finite(g.windowHeight) - sheetHeight;
  if (posterHeight <= 0 || sheetHeight <= 0) return 0;
  const need = PRODUCT_BOTTOM * posterHeight + BOTTOM_GAP - visible;
  const room =
    PRODUCT_TOP * posterHeight - (Math.max(0, finite(g.safeTop)) + TOP_GAP);
  return Math.max(0, Math.min(Math.ceil(need), Math.floor(room)));
}

/**
 * The first-paint photo, in window coordinates: as tall as the visible hero
 * area (safe-area top + TOP_GAP down to the sheet's top edge), centred, never
 * so tall that the bottle's base would come closer than BOTTOM_GAP to the
 * sheet. Contained (the width follows the aspect; a wide window crops the
 * sides), the rest is the surface colour. All zero when nothing is known.
 */
export function photoFrame(
  g: HeroGeometry & { width: number },
): { top: number; left: number; width: number; height: number } {
  const none = { top: 0, left: 0, width: 0, height: 0 };
  const sheetHeight = Math.max(0, finite(g.sheetHeight));
  if (sheetHeight <= 0) return none;
  const top = Math.max(0, finite(g.safeTop)) + TOP_GAP;
  const sheetTop = finite(g.windowHeight) - sheetHeight;
  const height = Math.min(
    sheetTop - top,
    (sheetTop - BOTTOM_GAP - top) / PHOTO_BOTTLE_BOTTOM,
  );
  if (!(height > 0)) return none;
  const width = height * PHOTO_ASPECT;
  return { top, left: (finite(g.width) - width) / 2, width, height };
}
