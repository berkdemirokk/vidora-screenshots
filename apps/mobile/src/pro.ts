import { requireOptionalNativeModule } from "expo";
import type { ProProduct, PurchaseStatus } from "./pro-rules";

export const PRO_WEEKLY = "com.berkdemirok.vidora.pro.weekly";
export const PRO_YEARLY = "com.berkdemirok.vidora.pro.yearly";
/** Create in App Store Connect before release; missing products are simply not shown. */
export const PRO_MONTHLY = "com.berkdemirok.vidora.pro.monthly";
/** Display order only (yearly row first); the paywall preselects monthly. */
export const PRO_PRODUCT_IDS: readonly string[] = [
  PRO_YEARLY,
  PRO_MONTHLY,
  PRO_WEEKLY,
];

/** Apple's standard licence agreement, used as the Terms of Use. */
export const TERMS_URL =
  "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";

type Subscription = { remove: () => void };
/** Payloads are validated in pro-rules before use, hence `unknown`. */
type NativeStore = {
  products: (ids: string[]) => Promise<unknown>;
  purchase: (id: string) => Promise<unknown>;
  entitlement: () => Promise<unknown>;
  restore: () => Promise<unknown>;
  manage: () => Promise<void>;
  addListener: (
    event: "onEntitlementChange",
    listener: (payload: unknown) => void,
  ) => Subscription;
};
/** Null in Expo Go and other builds without the native module. */
export const nativeStore =
  requireOptionalNativeModule<NativeStore>("KareviaStore");

export type ProductsState = "loading" | "ready" | "failed";
/** Why the paywall opened; it picks the heading and the first benefit. */
export type PaywallReason = "video" | "image" | "marketplace" | "ai" | "desk";
export type ProValue = {
  isPro: boolean;
  /** True until the first entitlement check has finished. */
  loading: boolean;
  products: ProProduct[];
  productsState: ProductsState;
  storeAvailable: boolean;
  /**
   * True only in simulator screenshot builds (FEATURES.screenshotMode):
   * `products` then holds sample plans so the paywall can be captured.
   * Always false in App Store and TestFlight builds.
   */
  demo: boolean;
  /** Rejects on store errors; a cancelled purchase resolves normally. */
  purchase: (id: string) => Promise<PurchaseStatus>;
  /** Resolves to whether an active subscription was found. */
  restore: () => Promise<boolean>;
  manage: () => Promise<void>;
  reloadProducts: () => Promise<void>;
};

// The editor leaves its "export with free settings" action here so the
// paywall, a separate modal route, can offer it as the secondary button.
let freeExport: (() => void) | null = null;
export function offerFreeExport(action: (() => void) | null): void {
  freeExport = action;
}
export function pendingFreeExport(): (() => void) | null {
  return freeExport;
}

// The editor also leaves the export the user asked for, to run once a
// purchase on the paywall succeeds (with the Pro settings).
let afterPurchase: (() => void) | null = null;
export function offerAfterPurchase(action: (() => void) | null): void {
  afterPurchase = action;
}
export function pendingAfterPurchase(): (() => void) | null {
  return afterPurchase;
}
