import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import {
  PRO_PRODUCT_IDS,
  nativeStore,
  type ProValue,
  type ProductsState,
} from "./pro";
import { FEATURES } from "./config";
import {
  parseEntitlement,
  parseProducts,
  parsePurchaseStatus,
  type ProProduct,
} from "./pro-rules";

const ENTITLEMENT_WAIT_MS = 4000;
const PRODUCTS_WAIT_MS = 12000;

const unavailable = () =>
  Promise.reject(new Error("store-unavailable: native store module missing"));

/**
 * Sample plans for simulator screenshots only (the simulator has no App
 * Store products). Store builds never use them: FEATURES.screenshotMode is
 * forced off in eas.json.
 */
const DEMO_PRODUCTS: ProProduct[] = [
  {
    id: PRO_PRODUCT_IDS[0],
    displayName: "Vidora Pro",
    // Sample prices for screenshots only: the owner's fixed amounts (weekly ₺399,99, monthly ₺999,99, yearly ₺2.999,99); real prices always come from StoreKit.
    displayPrice: "₺2.999,99",
    price: 2999.99,
    currencyCode: "TRY",
    priceLocale: "tr_TR",
    period: "year",
    hasTrial: true,
    trialDays: 3,
  },
  {
    id: PRO_PRODUCT_IDS[1],
    displayName: "Vidora Pro",
    displayPrice: "₺999,99",
    price: 999.99,
    currencyCode: "TRY",
    priceLocale: "tr_TR",
    period: "month",
    hasTrial: true,
    trialDays: 3,
  },
  {
    id: PRO_PRODUCT_IDS[2],
    displayName: "Vidora Pro",
    displayPrice: "₺399,99",
    price: 399.99,
    currencyCode: "TRY",
    priceLocale: "tr_TR",
    period: "week",
    hasTrial: true,
    trialDays: 3,
  },
];

const ProContext = createContext<ProValue>({
  isPro: false,
  loading: false,
  products: [],
  productsState: "failed",
  storeAvailable: false,
  demo: false,
  purchase: unavailable,
  restore: unavailable,
  manage: unavailable,
  reloadProducts: () => Promise.resolve(),
});

export function usePro(): ProValue {
  return useContext(ProContext);
}

export function ProProvider({ children }: { children: ReactNode }) {
  const [isPro, setIsPro] = useState(false),
    [loading, setLoading] = useState(nativeStore !== null),
    [products, setProducts] = useState<ProProduct[]>([]),
    [productsState, setProductsState] = useState<ProductsState>(
      nativeStore ? "loading" : "failed",
    );
  const live = useRef(true);
  const seq = useRef(0);
  const productsSeq = useRef(0);

  const apply = useCallback((payload: unknown) => {
    const active = parseEntitlement(payload).active;
    if (live.current) setIsPro(active);
    return active;
  }, []);

  /** A failed check keeps the last known state rather than revoking Pro. */
  const refresh = useCallback(async () => {
    if (!nativeStore) return;
    const id = ++seq.current;
    try {
      const result = await nativeStore.entitlement();
      // A newer refresh or a purchase superseded this one: drop the stale answer.
      if (id === seq.current) apply(result);
    } catch {
      // Offline or StoreKit hiccup: try again on the next foreground.
    } finally {
      if (live.current) setLoading(false);
    }
  }, [apply]);

  const reloadProducts = useCallback(async () => {
    if (!nativeStore) return;
    const id = ++productsSeq.current;
    setProductsState("loading");
    try {
      // Only the products fetch is capped; the purchase call is never timed out.
      const found = parseProducts(
        await Promise.race([
          nativeStore.products([...PRO_PRODUCT_IDS]),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), PRODUCTS_WAIT_MS),
          ),
        ]),
        PRO_PRODUCT_IDS,
      );
      // A newer attempt superseded this one: drop the stale answer.
      if (!live.current || id !== productsSeq.current) return;
      setProducts(found);
      setProductsState(found.length ? "ready" : "failed");
    } catch {
      if (live.current && id === productsSeq.current)
        setProductsState("failed");
    }
  }, []);

  useEffect(() => {
    live.current = true;
    void refresh();
    void reloadProducts();
    // Fail safe: if StoreKit never answers, stop blocking the UI after 4s and
    // treat the user as not subscribed (paywall opens). refresh() keeps
    // running and upgrades isPro if it answers later.
    const cap = setTimeout(() => {
      if (live.current) setLoading(false);
    }, ENTITLEMENT_WAIT_MS);
    const change = nativeStore?.addListener("onEntitlementChange", apply);
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => {
      live.current = false;
      clearTimeout(cap);
      change?.remove();
      appState.remove();
    };
  }, [refresh, reloadProducts, apply]);

  const value = useMemo<ProValue>(
    () => ({
      isPro: isPro || FEATURES.screenshotMode || FEATURES.testerPro,
      loading: loading && !FEATURES.screenshotMode && !FEATURES.testerPro,
      products:
        FEATURES.screenshotMode && products.length === 0
          ? DEMO_PRODUCTS
          : products,
      productsState: FEATURES.screenshotMode ? "ready" : productsState,
      storeAvailable: nativeStore !== null,
      demo: FEATURES.screenshotMode,
      reloadProducts,
      purchase: async (id) => {
        if (!nativeStore) return unavailable();
        const status = parsePurchaseStatus(await nativeStore.purchase(id));
        if (status === "purchased") {
          seq.current++;
          // The purchase was verified natively, so grant Pro even if the
          // follow-up check fails or lags; the next refresh corrects it.
          let active = false;
          try {
            active = apply(await nativeStore.entitlement());
          } catch {
            active = false;
          }
          if (!active && live.current) setIsPro(true);
        }
        return status;
      },
      restore: async () => {
        if (!nativeStore) return unavailable();
        return apply(await nativeStore.restore());
      },
      manage: async () => {
        if (!nativeStore) return unavailable();
        await nativeStore.manage();
        await refresh();
      },
    }),
    [isPro, loading, products, productsState, reloadProducts, apply, refresh],
  );
  return <ProContext.Provider value={value}>{children}</ProContext.Provider>;
}
