import { useCallback, useEffect, useRef, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import {
  BRAND_FONTS,
  BRAND_SWATCHES,
  EMPTY_BRAND_KIT,
  brandLogoUri,
  loadBrandKit,
  saveBrandKit,
  type BrandKit,
} from "../src/brand-kit";
import { pickProductPhoto } from "../src/product";
import {
  Button,
  MaxScale,
  Screen,
  Section,
  Space,
  Theme,
  Txt,
  s,
  tap,
  useT,
} from "../src/ui";

/**
 * Brand kit: the logo, accent colour and type family new videos start with.
 * Colour and font apply at editor start; the logo is stored for now (the
 * video engine cannot draw an image over the video yet) and says so.
 */
export default function BrandKitScreen() {
  const t = useT(),
    live = useRef(true),
    [kit, setKit] = useState<BrandKit>(EMPTY_BRAND_KIT),
    // A logo picked now, copied into app storage on save.
    [picked, setPicked] = useState<string | null>(null),
    [logoUri, setLogoUri] = useState<string | null>(null),
    [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);

  useEffect(() => {
    live.current = true;
    void (async () => {
      const stored = await loadBrandKit();
      const uri = await brandLogoUri(stored);
      if (!live.current) return;
      if (stored) setKit(stored);
      setLogoUri(uri);
    })();
    return () => {
      live.current = false;
    };
  }, []);

  const edit = useCallback((patch: Partial<BrandKit>) => {
    setSaved(false);
    setError(null);
    setKit((current) => ({ ...current, ...patch }));
  }, []);

  async function pickLogo() {
    if (busy) return;
    setBusy(true);
    try {
      const uri = await pickProductPhoto();
      if (uri && live.current) {
        setPicked(uri);
        setLogoUri(uri);
        edit({ logo: kit.logo ?? "logo.png" });
      }
    } catch {
      if (live.current)
        setError(t("Fotoğraf açılamadı.", "Could not open the photo."));
    } finally {
      if (live.current) setBusy(false);
    }
  }

  function removeLogo() {
    setPicked(null);
    setLogoUri(null);
    edit({ logo: null });
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      const next = await saveBrandKit(kit, picked);
      if (!live.current) return;
      setKit(next);
      setPicked(null);
      setSaved(true);
    } catch {
      if (live.current)
        setError(t("Kaydedilemedi, tekrar dene.", "Could not save, try again."));
    } finally {
      if (live.current) setBusy(false);
    }
  }

  return (
    <Screen back title={t("Marka kiti", "Brand kit")}>
      <Txt muted>
        {t(
          "Yeni videolar bu renk ve yazı tipiyle başlar. İstediğin zaman videoda değiştirebilirsin.",
          "New videos start with this colour and type. You can still change them in the video.",
        )}
      </Txt>

      <Section
        title={t("Logo", "Logo")}
        footer={t(
          "Logo cihazında saklanır. Videoda görünmesi sonraki güncellemede gelecek.",
          "The logo is stored on your device. Showing it in the video comes in a later update.",
        )}
      >
        <View style={styles.logoRow}>
          <View style={styles.logoBox}>
            {logoUri ? (
              <Image
                source={{ uri: logoUri }}
                accessibilityLabel={t("Seçili logo", "Chosen logo")}
                resizeMode="contain"
                style={styles.logoImage}
              />
            ) : (
              <Text style={s.footnote}>{t("Logo yok", "No logo")}</Text>
            )}
          </View>
          <View style={{ flex: 1, gap: Space.s }}>
            <Button
              testID="brandkit-logo-pick"
              label={logoUri ? t("Logoyu değiştir", "Change logo") : t("Logo seç", "Choose logo")}
              disabled={busy}
              onPress={() => void pickLogo()}
            />
            {!!logoUri && (
              <Button
                plain
                testID="brandkit-logo-remove"
                label={t("Logoyu kaldır", "Remove logo")}
                onPress={removeLogo}
              />
            )}
          </View>
        </View>
      </Section>

      <Section title={t("Vurgu rengi", "Accent colour")}>
        <View style={styles.swatches}>
          <Pressable
            testID="brandkit-color-none"
            accessibilityRole="button"
            accessibilityLabel={t("Şablonun rengi", "Template colour")}
            accessibilityState={{ selected: kit.accent === null }}
            onPress={() => {
              tap("select");
              edit({ accent: null });
            }}
            style={[styles.swatch, styles.swatchNone, kit.accent === null && styles.swatchOn]}
          >
            <Text maxFontSizeMultiplier={MaxScale.chrome} style={s.footnote}>
              {t("Yok", "None")}
            </Text>
          </Pressable>
          {BRAND_SWATCHES.map((swatch) => (
            <Pressable
              key={swatch.id}
              testID={"brandkit-color-" + swatch.id}
              accessibilityRole="button"
              accessibilityLabel={t(swatch.tr, swatch.en)}
              accessibilityState={{ selected: kit.accent === swatch.hex }}
              onPress={() => {
                tap("select");
                edit({ accent: swatch.hex });
              }}
              style={[
                styles.swatch,
                { backgroundColor: swatch.hex },
                kit.accent === swatch.hex && styles.swatchOn,
              ]}
            />
          ))}
        </View>
      </Section>

      <Section title={t("Yazı tipi", "Type")}>
        <View style={styles.fonts}>
          <FontChip
            testID="brandkit-font-none"
            label={t("Şablonun", "Template")}
            selected={kit.font === null}
            onPress={() => edit({ font: null })}
          />
          {BRAND_FONTS.map((font) => (
            <FontChip
              key={font.id}
              testID={"brandkit-font-" + font.id}
              label={t(font.tr, font.en)}
              selected={kit.font === font.id}
              onPress={() => edit({ font: font.id })}
            />
          ))}
        </View>
      </Section>

      {!!error && (
        <Text accessibilityLiveRegion="polite" style={[s.footnote, { color: Theme.danger }]}>
          {error}
        </Text>
      )}
      <Button
        primary
        testID="brandkit-save"
        label={saved ? t("Kaydedildi", "Saved") : t("Kaydet", "Save")}
        busy={busy}
        disabled={busy}
        onPress={() => void save()}
      />
    </Screen>
  );
}

function FontChip({
  testID,
  label,
  selected,
  onPress,
}: {
  testID: string;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={() => {
        tap("select");
        onPress();
      }}
      style={[s.chip, selected && s.chipSelected]}
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

const styles = StyleSheet.create({
  logoRow: { flexDirection: "row", alignItems: "center", gap: Space.l },
  logoBox: {
    width: 96,
    height: 96,
    borderRadius: 16,
    backgroundColor: Theme.surface,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  logoImage: { width: "100%", height: "100%" },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: Space.m },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: Theme.line,
    alignItems: "center",
    justifyContent: "center",
  },
  swatchNone: { backgroundColor: Theme.bg },
  swatchOn: { borderColor: Theme.text, borderWidth: 3 },
  fonts: { flexDirection: "row", flexWrap: "wrap", gap: Space.s },
});
