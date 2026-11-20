// Turkish campaign text presets (Batch 4): one tap fills the badge with a
// ready phrase. Plain data, no React Native imports (see campaign-presets.test.mjs).
export type CampaignPresetId =
  | "kargo-bedava"
  | "son-3"
  | "indirim-40"
  | "kapida-odeme";

export type CampaignPreset = {
  id: CampaignPresetId;
  testID: string;
  tr: string;
  en: string;
};

/** The badge field holds at most this many characters (templates upper-case it). */
export const PRESET_MAX = 18;

export const CAMPAIGN_PRESETS: readonly CampaignPreset[] = [
  { id: "kargo-bedava", testID: "preset-kargo-bedava", tr: "Kargo bedava", en: "Free shipping" },
  { id: "son-3", testID: "preset-son-3", tr: "Son 3 ürün", en: "Last 3 left" },
  { id: "indirim-40", testID: "preset-indirim-40", tr: "%40 indirim", en: "40% off" },
  { id: "kapida-odeme", testID: "preset-kapida-odeme", tr: "Kapıda ödeme", en: "Pay on delivery" },
];

export const presetText = (preset: CampaignPreset, lang: "tr" | "en"): string =>
  preset[lang];

/** The preset whose text the badge currently shows, if any. */
export function activePreset(
  badge: string,
  lang: "tr" | "en",
): CampaignPresetId | null {
  const text = badge.trim().toLocaleLowerCase(lang === "tr" ? "tr" : "en");
  return (
    CAMPAIGN_PRESETS.find(
      (p) => presetText(p, lang).toLocaleLowerCase(lang === "tr" ? "tr" : "en") === text,
    )?.id ?? null
  );
}
