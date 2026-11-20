/**
 * Campaign helpers above the Metin fields (Batch 4): tappable text presets
 * (badge), price tag layouts and, in Turkish, the seasonal sets whose date
 * window is open. Each row scrolls sideways; every chip is a plain Pressable
 * (no function styles, no layout animation) with a 44 pt target.
 */
import { baseLang } from "./i18n/lang";
import { useContext, useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  CAMPAIGN_PRESETS,
  activePreset,
  presetText,
} from "./campaign-presets";
import { seasonalSets, type SeasonSet } from "./product-catalog";
import { PRICE_TAGS, type PriceTagId } from "./price-tags";
import {
  Language,
  MaxScale,
  Space,
  Theme,
  s,
  tap,
  useT,
  useUpper,
} from "./ui";

function Chip({
  testID,
  label,
  selected,
  disabled,
  onPress,
}: {
  testID: string;
  label: string;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={() => {
        tap("select");
        onPress();
      }}
      style={[
        s.chip,
        selected && s.chipSelected,
        disabled && { opacity: 0.4 },
      ]}
    >
      <Text
        maxFontSizeMultiplier={MaxScale.chrome}
        style={[s.chipText, selected && { color: Theme.accent }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ChipLine({
  caption,
  children,
}: {
  caption: string;
  children: React.ReactNode;
}) {
  const upper = useUpper();
  return (
    <View style={styles.line}>
      <Text maxFontSizeMultiplier={MaxScale.chrome} style={[s.caps, styles.caption]}>
        {upper(caption)}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        contentContainerStyle={styles.chips}
        style={styles.scroll}
      >
        {children}
      </ScrollView>
    </View>
  );
}

export function CampaignStrip({
  badge,
  onBadge,
  headline,
  onHeadline,
  priceTag,
  onPriceTag,
  risk,
  disabled,
}: {
  badge: string;
  onBadge: (value: string) => void;
  headline: string;
  onHeadline: (value: string) => void;
  priceTag: PriceTagId | null;
  onPriceTag: (value: PriceTagId | null) => void;
  /** marketplaceTextRisk(...) for the current texts. */
  risk: boolean;
  disabled: boolean;
}) {
  const t = useT();
  const { lang: appLang } = useContext(Language);
  // Seasonal sets and campaign presets are Turkish-market content: Turkish
  // or English only.
  const lang = baseLang(appLang);
  const seasons = useMemo(() => seasonalSets(new Date(), lang), [lang]);
  const preset = activePreset(badge, lang);
  const seasonOn = (set: SeasonSet) =>
    badge.trim().toLocaleLowerCase("tr") === set.badge.toLocaleLowerCase("tr");
  const touched =
    preset !== null || priceTag !== null || seasons.some(seasonOn);
  return (
    <View style={styles.wrap}>
      <ChipLine caption={t("Yazı", "Text")}>
        {CAMPAIGN_PRESETS.map((item) => (
          <Chip
            key={item.id}
            testID={item.testID}
            label={presetText(item, lang)}
            selected={preset === item.id}
            disabled={disabled}
            onPress={() =>
              onBadge(preset === item.id ? "" : presetText(item, lang))
            }
          />
        ))}
        {seasons.map((set) => (
          <Chip
            key={set.id}
            testID={set.testID}
            label={set.label}
            selected={seasonOn(set)}
            disabled={disabled}
            onPress={() => {
              if (seasonOn(set)) return onBadge("");
              onBadge(set.badge);
              if (!headline.trim()) onHeadline(set.headline);
            }}
          />
        ))}
      </ChipLine>
      <ChipLine caption={t("Fiyat", "Price")}>
        {PRICE_TAGS.map((tag) => (
          <Chip
            key={tag.id}
            testID={tag.testID}
            label={t(tag.tr, tag.en)}
            selected={priceTag === tag.id}
            disabled={disabled}
            onPress={() => onPriceTag(priceTag === tag.id ? null : tag.id)}
          />
        ))}
      </ChipLine>
      {risk && touched && (
        <Text testID="campaign-risk-hint" style={s.footnote}>
          {t(
            "Trendyol görsellerde fiyat ve indirim yazısını reddediyor; ürün sayfası videosunda boş bırakmak daha güvenli.",
            "Trendyol rejects price and discount text on images; leaving it empty is safer for a product page video.",
          )}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Space.s },
  line: { flexDirection: "row", alignItems: "center", gap: Space.s },
  caption: { width: 56 },
  scroll: { flex: 1 },
  chips: { gap: Space.s, paddingRight: Space.gutter },
});
