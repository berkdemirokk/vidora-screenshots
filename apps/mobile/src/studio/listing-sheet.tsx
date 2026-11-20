import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Button,
  Face,
  Icon,
  MaxScale,
  Press,
  Radius,
  Space,
  Theme,
  chipStyle,
  s as ui,
  tap,
  useT,
  useUpper,
} from "../ui";
import {
  listingLanguages,
  translateListing,
  writeListing,
  type ListingAvailability,
  type ListingText,
  type TranslateLang,
  type WriteLang,
} from "../listing";
import { copyText } from "../product";
import { LocalizedError } from "../media";
import type { CategoryId } from "../product-catalog";

/** Each language in its own name, so a seller finds it in any app language. */
const LANG_LABEL: Readonly<Record<string, string>> = {
  tr: "Türkçe",
  en: "English",
  de: "Deutsch",
  fr: "Français",
  es: "Español",
  ar: "العربية",
  ru: "Русский",
};

export type ListingInput = {
  name: string;
  category: CategoryId;
  price: string;
};

type FieldId = "title" | "description" | "bullets" | "keywords";

/**
 * "İlan metni": a marketplace listing (title, description, bullets,
 * keywords) written on the phone by Apple Intelligence, with chips for the
 * languages it can write in and the ones it can translate into, and a
 * "Kopyala" button per field. The caller shows it only when `availability`
 * has languages (src/listing.ts › hasListing).
 */
export function ListingSheet({
  visible,
  input,
  availability,
  preferred,
  onClose,
}: {
  visible: boolean;
  input: ListingInput;
  availability: ListingAvailability;
  /** The app language when the model writes in it; otherwise the first offered. */
  preferred: string;
  onClose: () => void;
}) {
  const t = useT(),
    upper = useUpper(),
    insets = useSafeAreaInsets();
  const chips = listingLanguages(availability);
  // Listings by language for the current product; the written one is the
  // source of every translation.
  const [texts, setTexts] = useState<Record<string, ListingText>>({});
  const [source, setSource] = useState<WriteLang | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<FieldId | null>(null);
  // Only the newest request may change the sheet (a slow, older answer is dropped).
  const request = useRef(0);
  const inputKey = `${input.name}|${input.category}|${input.price}`;
  const loadedKey = useRef<string | null>(null);
  const textsRef = useRef(texts);
  textsRef.current = texts;
  const sourceRef = useRef(source);
  sourceRef.current = source;

  function message(e: unknown): string {
    return e instanceof LocalizedError
      ? t(e.tr, e.en)
      : t(
          "İlan metni yazılamadı. Tekrar dene.",
          "Couldn't write the listing text. Try again.",
        );
  }

  async function write(lang: WriteLang) {
    const id = ++request.current;
    setShown(lang);
    setError(null);
    setBusy(t("İlan metni yazılıyor…", "Writing the listing…"));
    try {
      const result = await writeListing({ ...input, lang });
      if (id !== request.current) return;
      if (!result) {
        setError(
          t(
            "Bu dilde ilan metni şu an yazılamıyor.",
            "Listing text can't be written in this language right now.",
          ),
        );
        return;
      }
      setTexts((all) => ({ ...all, [lang]: result }));
      if (!sourceRef.current) setSource(lang);
    } catch (e) {
      if (id === request.current) setError(message(e));
    } finally {
      if (id === request.current) setBusy(null);
    }
  }

  async function translate(to: TranslateLang) {
    const from = sourceRef.current;
    const base = from ? textsRef.current[from] : undefined;
    if (!from || !base) {
      setShown(to);
      setError(
        t(
          "Önce bir dilde ilan metni yazılmalı.",
          "Write the listing in one language first.",
        ),
      );
      return;
    }
    const id = ++request.current;
    setShown(to);
    setError(null);
    setBusy(t("Çevriliyor…", "Translating…"));
    try {
      const result = await translateListing(base, to, from);
      if (id !== request.current) return;
      if (!result) {
        setError(
          t(
            "Çeviri bu cihazda şu an kullanılamıyor.",
            "Translation isn't available on this device right now.",
          ),
        );
        return;
      }
      setTexts((all) => ({ ...all, [to]: result }));
    } catch (e) {
      if (id === request.current) setError(message(e));
    } finally {
      if (id === request.current) setBusy(null);
    }
  }

  function choose(lang: string, kind: "write" | "translate") {
    if (busy) return;
    tap("select");
    if (textsRef.current[lang]) {
      setShown(lang);
      setError(null);
      return;
    }
    if (kind === "write") void write(lang as WriteLang);
    else void translate(lang as TranslateLang);
  }

  // Opening the sheet for a new product starts over and writes in the
  // preferred language; reopening for the same product keeps what was written.
  const startRef = useRef(write);
  startRef.current = write;
  useEffect(() => {
    if (!visible || loadedKey.current === inputKey) return;
    loadedKey.current = inputKey;
    request.current++;
    setTexts({});
    setSource(null);
    setError(null);
    setBusy(null);
    const first =
      availability.write.find((l) => l === preferred) ?? availability.write[0];
    if (first) void startRef.current(first);
  }, [visible, inputKey, availability, preferred]);

  // "Kopyalandı" shows for a moment on the field that was copied.
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(null), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy(field: FieldId, value: string) {
    if (!value) return;
    tap("action");
    if (await copyText(value)) {
      setCopied(field);
      return;
    }
    // Builds without the pasteboard function: the share sheet has "Copy".
    try {
      await Share.share({ message: value });
    } catch {
      // Closing the share sheet is not an error.
    }
  }

  const listing = shown ? texts[shown] : undefined;
  const rtl = shown === "ar";
  const fields: { id: FieldId; label: string; value: string }[] = listing
    ? [
        { id: "title", label: t("Başlık", "Title"), value: listing.title },
        {
          id: "description",
          label: t("Açıklama", "Description"),
          value: listing.description,
        },
        {
          id: "bullets",
          label: t("Öne çıkanlar", "Highlights"),
          value: listing.bullets.map((b) => "• " + b).join("\n"),
        },
        {
          id: "keywords",
          label: t("Anahtar kelimeler", "Keywords"),
          value: listing.keywords.join(", "),
        },
      ]
    : [];
  const copyLabel = t("Kopyala", "Copy"),
    copiedLabel = t("Kopyalandı", "Copied");

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.root,
          { paddingBottom: Math.max(insets.bottom, Space.l) },
        ]}
      >
        <View style={styles.head}>
          <Text
            accessibilityRole="header"
            style={styles.title}
            maxFontSizeMultiplier={MaxScale.chrome}
          >
            {t("İlan metni", "Listing text")}
          </Text>
          <Pressable
            testID="listing-close"
            accessibilityRole="button"
            accessibilityLabel={t("Kapat", "Close")}
            onPress={onClose}
            style={styles.close}
          >
            <Icon name="xmark" size={15} color={Theme.muted} />
          </Pressable>
        </View>
        <Text style={styles.note}>
          {t(
            "Telefonunda Apple Intelligence ile yazılır, hiçbir yere gönderilmez. Yayınlamadan önce kontrol et.",
            "Written on your phone with Apple Intelligence and never sent anywhere. Check it before you post.",
          )}
        </Text>
        <View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            accessibilityRole="radiogroup"
            accessibilityLabel={t("Dil", "Language")}
            contentContainerStyle={styles.chips}
          >
            {chips.map((chip) => {
              const selected = chip.lang === shown;
              return (
                <Pressable
                  key={chip.lang}
                  testID={"listing-lang-" + chip.lang}
                  accessibilityRole="radio"
                  accessibilityLabel={
                    (LANG_LABEL[chip.lang] ?? chip.lang) +
                    (chip.kind === "translate"
                      ? ", " + t("çeviri", "translation")
                      : "")
                  }
                  accessibilityState={{ selected, disabled: !!busy }}
                  disabled={!!busy}
                  onPress={() => choose(chip.lang, chip.kind)}
                  style={({ pressed }) => [
                    chipStyle.chip,
                    selected && chipStyle.chipSelected,
                    pressed && !selected && Press.filled,
                    !!busy && !selected && { opacity: 0.4 },
                  ]}
                >
                  <Text
                    maxFontSizeMultiplier={MaxScale.chrome}
                    style={[
                      chipStyle.chipText,
                      selected && { color: Theme.accent },
                    ]}
                  >
                    {LANG_LABEL[chip.lang] ?? chip.lang}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
        <ScrollView contentContainerStyle={styles.fields}>
          {busy ? (
            <View style={styles.busy} accessibilityLiveRegion="polite">
              <ActivityIndicator size="small" color={Theme.muted} />
              <Text style={styles.status}>{busy}</Text>
            </View>
          ) : error ? (
            <View style={styles.busy}>
              <Icon
                name="exclamationmark.circle"
                size={15}
                color={Theme.text}
              />
              <Text style={styles.status} accessibilityLiveRegion="polite">
                {error}
              </Text>
            </View>
          ) : null}
          {!busy &&
            fields.map((field) =>
              field.value ? (
                <View key={field.id} style={styles.field}>
                  <View style={styles.fieldHead}>
                    <Text style={ui.caps}>{upper(field.label)}</Text>
                    <Button
                      plain
                      testID={"listing-copy-" + field.id}
                      label={copied === field.id ? copiedLabel : copyLabel}
                      accessibilityLabel={copyLabel + ", " + field.label}
                      onPress={() => void copy(field.id, field.value)}
                    />
                  </View>
                  <Text
                    selectable
                    testID={"listing-" + field.id}
                    style={[
                      field.id === "title" ? styles.valueTitle : styles.value,
                      rtl && styles.rtl,
                    ]}
                  >
                    {field.value}
                  </Text>
                </View>
              ) : null,
            )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Theme.bg,
    paddingTop: Space.l,
    gap: Space.m,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Space.gutter,
  },
  title: {
    flexShrink: 1,
    fontFamily: Face.extra,
    fontSize: 20,
    fontWeight: "800",
    color: Theme.text,
  },
  close: {
    width: 44,
    height: 44,
    margin: -Space.s,
    alignItems: "center",
    justifyContent: "center",
  },
  note: {
    fontSize: 13,
    lineHeight: 18,
    color: Theme.muted,
    paddingHorizontal: Space.gutter,
  },
  chips: { gap: Space.s, paddingHorizontal: Space.gutter },
  fields: {
    gap: Space.group,
    paddingHorizontal: Space.gutter,
    paddingBottom: Space.l,
  },
  busy: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s,
    paddingVertical: Space.l,
  },
  status: {
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 19,
    color: Theme.muted,
  },
  field: {
    gap: Space.xs,
    padding: Space.m,
    borderRadius: Radius.m,
    backgroundColor: Theme.surface,
  },
  fieldHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
  },
  valueTitle: {
    fontFamily: Face.extra,
    fontSize: 17,
    lineHeight: 23,
    fontWeight: "800",
    color: Theme.text,
  },
  value: {
    fontFamily: Face.bold,
    fontSize: 15,
    lineHeight: 21,
    color: Theme.text,
  },
  rtl: { writingDirection: "rtl", textAlign: "right" },
});
