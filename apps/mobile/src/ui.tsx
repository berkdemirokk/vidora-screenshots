import React, {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Image,
  InputAccessoryView,
  Keyboard,
  Linking,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type AccessibilityActionEvent,
  type AccessibilityActionInfo,
  type ColorValue,
  type GestureResponderEvent,
  type ImageSourcePropType,
  type PressableProps,
  type SectionListProps,
  type TextInputProps,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useNavigation, useRouter } from "expo-router";
import { showActionSheet } from "./action-sheet";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import * as Haptics from "expo-haptics";
import type { Lang, LangChoice } from "./i18n/lang";
import { LANG_LOCALE } from "./i18n/lang";
import { translate } from "./i18n";
import { createOpenGuard } from "./editor-session";
import { Face } from "./fonts";
import { QA_DIAG } from "./config";
import { diag } from "./diag";

export { Face };

/**
 * One guard for opening the editing desk: a double tap opens one desk, never
 * two stacked. Keys: "desk:<clipId>", "desk:project:<id>", "desk:new".
 */
export const deskOpenGuard = createOpenGuard();

/**
 * Design tokens; see DESIGN.md. Every text/background pair used in the app
 * meets WCAG AA (4.5:1) — the ratios are listed in DESIGN.md.
 */
export const Theme = {
  /** Paper. */
  bg: "#FFFFFF",
  /** Secondary surface. */
  surface: "#F4F3F1",
  /** Tonal fill (inert buttons, progress track); never identifies a control alone. */
  raised: "#ECEAE6",
  /** Hairline. */
  line: "#E3E0DB",
  /** Ink: text, primary button fill, selection. */
  text: "#141210",
  muted: "#625E58",
  /** The one accent (Vitrin orange). Text on it is `onAccent` (ink). */
  accent: "#FF7A00",
  onAccent: "#141210",
  danger: "#C62B1E",
  /** Scrim and text for labels drawn on top of photos and video. */
  scrim: "rgba(20,18,16,0.66)",
  scrimSoft: "rgba(20,18,16,0.18)",
  onMedia: "#FFFFFF",
  /** Shadow colour and a soft contact shadow under a cut-out product. */
  shadow: "#000000",
  shadowSoft: "rgba(0,0,0,0.28)",
  /** Background of a row on `bg` while pressed (inset rows use `line`). */
  pressed: "#F0EEEA",
};
/**
 * 4-point spacing. Use the roles: `section` (32) between sections, `group`
 * (12) inside a group, `row` (8) between rows of a group.
 */
export const Space = {
  xs: 4,
  s: 8,
  m: 12,
  l: 16,
  xl: 24,
  xxl: 32,
  gutter: 20,
  section: 32,
  group: 12,
  row: 8,
};
/** Corner radius scale. Every view of a video uses `xl` (24). */
export const Radius = { s: 8, m: 12, l: 16, xl: 24, button: 16 };

/**
 * One press language. Rows on `bg` highlight with `Theme.pressed`, rows in
 * an inset group with `Theme.line`; everything else dims by kind.
 */
export const Press = {
  text: { opacity: 0.5 },
  filled: { opacity: 0.6 },
  media: { opacity: 0.8 },
  button: { opacity: 0.85, transform: [{ scale: 0.98 }] },
} as const;

/** Dynamic Type caps (maxFontSizeMultiplier) by role. */
export const MaxScale = {
  // Anton display titles: 34 pt grows to 44 pt at most. displayMetrics derives
  // its top padding at this cap, so the marks of İ Ğ Ü Ö stay inside the 8 pt
  // that tab-root titles have above them (1.75 needed 12 pt).
  largeTitle: 1.3,
  title: 2.5,
  paywallTitle: 2.0,
  chrome: 1.3,
};

/**
 * Native iOS large titles on the tab roots. Simulator QA run 12 (iOS 26,
 * per-tab stacks under the JS tab bar) showed an empty header band; with
 * NativeTabs this is tried again. Set to false to go back to the titles that
 * `Screen` draws itself.
 */
export const NATIVE_TAB_TITLES = false;

/** Height of the floating tab bar; content must scroll clear of it. */
const TAB_BAR_HEIGHT = 49;
/** Bottom padding for a tab root's scroll content: bar + safe area + air. */
export function useTabBarInset(): number {
  return useSafeAreaInsets().bottom + TAB_BAR_HEIGHT + Space.l;
}

export const Language = createContext<{
  /** The language in use (a "system" choice is already resolved). */
  lang: Lang;
  /** Picks a language explicitly and remembers it. */
  setLang: (v: Lang) => void;
  /** What the user chose: a language or "system" (follow the device). */
  choice: LangChoice;
  setChoice: (v: LangChoice) => void;
}>({ lang: "tr", setLang: () => {}, choice: "system", setChoice: () => {} });
/**
 * The translator. Stable while the language stays the same: callbacks and
 * effects that depend on `t` must not re-run after every render (the Library
 * focus effect did, which reset select mode at once and reloaded the list in
 * a loop; QA run 27). Guard test: src/library-select.test.mjs.
 */
export function useT() {
  const { lang } = useContext(Language);
  return useCallback((a: string, b: string) => translate(lang, a, b), [lang]);
}

/**
 * Uppercases with the right dotted/dotless I rules for the app language
 * ("etiket" becomes "ETİKET"), for display and label text.
 */
export function useUpper() {
  const { lang } = useContext(Language);
  return (text: string) => {
    try {
      return text.toLocaleUpperCase(LANG_LOCALE[lang]);
    } catch {
      return text.toUpperCase();
    }
  };
}

/** English singular/plural; Turkish nouns do not change after a number. */
export function enPlural(n: number, one: string, other: string): string {
  return n === 1 ? one : other;
}

/** A clip length as a clock: "0:09", "1:05" (whole seconds, rounded). */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0));
  return Math.floor(total / 60) + ":" + String(total % 60).padStart(2, "0");
}

/** A clip length for VoiceOver: "9 saniye", "1 dakika 5 saniye". */
export function spokenDuration(
  t: (tr: string, en: string) => string,
  seconds: number,
): string {
  const total = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0));
  const m = Math.floor(total / 60),
    sec = total % 60;
  const parts: string[] = [];
  if (m > 0)
    parts.push(t(`${m} dakika`, `${m} ${enPlural(m, "minute", "minutes")}`));
  if (sec > 0 || m === 0)
    parts.push(
      t(`${sec} saniye`, `${sec} ${enPlural(sec, "second", "seconds")}`),
    );
  return parts.join(" ");
}

/** A frame shape in words, for VoiceOver. */
export function ratioWords(
  t: (tr: string, en: string) => string,
  ratio: string | null | undefined,
): string {
  return ratio === "1:1"
    ? t("Kare", "Square")
    : ratio === "4:5"
      ? t("Akış 4:5", "Feed 4:5")
      : ratio === "2:3"
        ? t("Dikey 2:3", "Portrait 2:3")
        : t("Dikey", "Vertical");
}

export type IconName = SymbolViewProps["name"];
/** SF Symbol sized to text; invisible to VoiceOver (the label carries meaning). */
export function Icon({
  name,
  size = 18,
  color = Theme.text,
  weight = "medium",
}: {
  name: IconName;
  size?: number;
  color?: ColorValue;
  /** Medium everywhere; tab bar icons use regular. */
  weight?: SymbolViewProps["weight"];
}) {
  return (
    <SymbolView
      name={name}
      size={size}
      tintColor={color}
      weight={weight}
      resizeMode="scaleAspectFit"
      style={{ width: size, height: size }}
      accessible={false}
    />
  );
}

export function tap(kind: "action" | "select") {
  // Haptics are a nicety; failures (e.g. simulator) are ignored.
  void (
    kind === "action"
      ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      : Haptics.selectionAsync()
  ).catch(() => {});
}

/** Reads `text` to VoiceOver whenever it changes (live regions are Android-only). */
export function useAnnounce(text: string | null | undefined) {
  useEffect(() => {
    if (text) AccessibilityInfo.announceForAccessibility(text);
  }, [text]);
}

/** Opens a web page in the browser; `onFail` runs when it cannot be opened. */
export function openPage(url: string, onFail?: () => void) {
  Linking.openURL(url).catch(() => onFail?.());
}

/** A native action sheet with a cancel button; `destructive` is an index. */
export function chooseAction(
  title: string,
  options: string[],
  cancel: string,
  destructive: number | undefined,
  onPick: (index: number) => void,
) {
  showActionSheet(
    {
      title,
      options: [...options, cancel],
      cancelButtonIndex: options.length,
      destructiveButtonIndex: destructive,
    },
    (index) => {
      if (index < options.length) onPick(index);
    },
  );
}

/** The consequence line of every "delete video" confirmation. */
export function deleteClipMessage(
  t: (tr: string, en: string) => string,
  projectCount = 0,
): string {
  const base = t(
    "Fotoğraflar'a kaydettiklerin kalır. Bu işlem geri alınamaz.",
    "Copies you saved to Photos stay. This can't be undone.",
  );
  if (projectCount <= 0) return base;
  return (
    t(
      `${projectCount} Kurgu masası projesinden de çıkar. `,
      `It is also removed from ${projectCount} editing desk ${enPlural(projectCount, "project", "projects")}. `,
    ) + base
  );
}

/** Hides the tab bar (Library's select mode shows its toolbar instead). */
let tabBarHidden = false;
const tabBarListeners = new Set<() => void>();
export function setTabBarHidden(hidden: boolean) {
  if (hidden === tabBarHidden) return;
  tabBarHidden = hidden;
  tabBarListeners.forEach((listener) => listener());
}
export function useTabBarHidden(): boolean {
  return useSyncExternalStore(
    (listener) => {
      tabBarListeners.add(listener);
      return () => tabBarListeners.delete(listener);
    },
    () => tabBarHidden,
    () => tabBarHidden,
  );
}

export function Button({
  label,
  onPress,
  primary = false,
  plain = false,
  danger = false,
  disabled = false,
  selected = false,
  busy = false,
  done = false,
  large = false,
  onInk = false,
  accessibilityLabel,
  badge,
  icon,
  testID,
  maxFontSizeMultiplier,
}: {
  label: string;
  onPress: () => void;
  /** Id for UI tests (Maestro). */
  testID?: string;
  /** The one main action on a screen. */
  primary?: boolean;
  /** Text-only button for minor actions (flush with the gutter). */
  plain?: boolean;
  danger?: boolean;
  disabled?: boolean;
  selected?: boolean;
  /** Working: a spinner in the icon slot, full opacity, not tappable. */
  busy?: boolean;
  /** Finished: raised fill, inert, full opacity (e.g. "Kaydedildi"). */
  done?: boolean;
  /** 52 pt and stretched, for a tonal button next to a primary. */
  large?: boolean;
  /**
   * For use on an ink bar: primary = accent fill with ink label, secondary =
   * paper fill with ink label, plain = accent text.
   */
  onInk?: boolean;
  accessibilityLabel?: string;
  /** Small tag after the label, e.g. "PRO". */
  badge?: string;
  icon?: IconName;
  maxFontSizeMultiplier?: number;
}) {
  const filledPrimary = primary && !done;
  // Primary: ink fill, accent label (on an ink bar: accent fill, ink label).
  // Secondary: outlined ink on paper. Plain: underlined ink.
  const color = filledPrimary
    ? onInk
      ? Theme.onAccent
      : Theme.accent
    : selected
      ? Theme.accent
      : danger
        ? Theme.danger
        : onInk && plain
          ? Theme.accent
          : Theme.text;
  const inert = disabled || busy || done;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={
        (accessibilityLabel ?? label) + (badge ? ", " + badge : "")
      }
      accessibilityState={{ disabled: disabled || done, selected, busy }}
      disabled={inert}
      hitSlop={plain ? { left: 8, right: 8 } : undefined}
      onPress={() => {
        if (primary) tap("action");
        onPress();
      }}
      style={({ pressed }) => [
        s.button,
        done && s.done,
        filledPrimary && (onInk ? s.primaryOnInk : s.primary),
        onInk && !filledPrimary && !plain && !done && s.secondaryOnInk,
        danger && !plain && !filledPrimary && { borderColor: Theme.danger },
        large && s.large,
        plain && s.plain,
        selected && s.selected,
        disabled && !busy && !done && { opacity: 0.4 },
        // Buttons dim and settle slightly; rows highlight instead.
        pressed && (plain ? Press.text : Press.button),
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        icon && <Icon name={icon} size={17} color={color} />
      )}
      <Text
        maxFontSizeMultiplier={maxFontSizeMultiplier}
        style={[s.buttonText, plain && s.plainText, { color }]}
      >
        {label}
        {!!badge && <Text style={s.badge}>{"  " + badge}</Text>}
      </Text>
    </Pressable>
  );
}

/**
 * Save to Photos plus Share, the result's action pair. Once saved the save
 * button settles to "Kaydedildi" and Share becomes the primary.
 */
export function SaveShareRow({
  busy = false,
  saved = false,
  onSave,
  onShare,
  saveTestID,
  shareTestID,
}: {
  busy?: boolean;
  saved?: boolean;
  onSave: () => void;
  onShare: () => void;
  saveTestID?: string;
  shareTestID?: string;
}) {
  const t = useT();
  return (
    <View style={s.saveShare}>
      <View style={{ flex: 1 }}>
        {saved ? (
          <Button
            done
            large
            icon="checkmark"
            label={t("Kaydedildi", "Saved")}
            accessibilityLabel={t(
              "Fotoğraflar'a kaydedildi",
              "Saved to Photos",
            )}
            testID={saveTestID}
            onPress={() => {}}
          />
        ) : (
          <Button
            primary
            large
            busy={busy}
            icon="square.and.arrow.down"
            label={t("Fotoğraflar'a kaydet", "Save to Photos")}
            testID={saveTestID}
            maxFontSizeMultiplier={MaxScale.chrome}
            onPress={onSave}
          />
        )}
      </View>
      <View>
        <Button
          large
          primary={saved}
          disabled={busy}
          icon="square.and.arrow.up"
          label={t("Paylaş", "Share")}
          testID={shareTestID}
          maxFontSizeMultiplier={MaxScale.chrome}
          onPress={onShare}
        />
      </View>
    </View>
  );
}

/** Text action for bars and section headers: 17/400 ink (600 when strong). */
export function HeaderText({
  label,
  onPress,
  strong = false,
  testID,
  accessibilityLabel,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  strong?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={10}
      onPress={onPress}
      style={({ pressed }) => [
        s.headerText,
        (pressed || disabled) && Press.text,
      ]}
    >
      <Text
        maxFontSizeMultiplier={MaxScale.chrome}
        style={[s.headerTextLabel, strong && { fontWeight: "800" }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Inline problem or note: icon, ink footnote, optional action. */
export function Notice({
  text,
  action,
  icon = "exclamationmark.circle",
}: {
  text: string;
  action?: { label: string; onPress: () => void; disabled?: boolean };
  icon?: IconName;
}) {
  return (
    <View style={s.notice}>
      <Icon name={icon} size={15} color={Theme.text} />
      <View style={{ flex: 1, gap: Space.xs }}>
        <Text style={s.noticeText}>{text}</Text>
        {action && (
          <Button
            plain
            label={action.label}
            disabled={action.disabled}
            onPress={action.onPress}
          />
        )}
      </View>
    </View>
  );
}

export function Txt({
  children,
  big = false,
  title = false,
  muted = false,
  small = false,
}: {
  children: React.ReactNode;
  /** Large title (one per screen): Anton, uppercase. */
  big?: boolean;
  /** Section title. */
  title?: boolean;
  muted?: boolean;
  /** Footnote size (13). */
  small?: boolean;
}) {
  const upper = useUpper();
  return (
    <Text
      accessibilityRole={big || title ? "header" : undefined}
      maxFontSizeMultiplier={
        big ? MaxScale.largeTitle : title ? MaxScale.title : undefined
      }
      style={[
        s.text,
        big && s.heading,
        title && s.title,
        muted && s.muted,
        small && s.footnote,
      ]}
    >
      {big && typeof children === "string" ? upper(children) : children}
    </Text>
  );
}

/** Two-line caption under a tile (template, intent, backdrop). */
export function TileCaption({
  children,
  selected = false,
}: {
  children: React.ReactNode;
  selected?: boolean;
}) {
  const { fontScale } = useWindowDimensions();
  return (
    <Text
      numberOfLines={2}
      maxFontSizeMultiplier={MaxScale.chrome}
      style={[
        s.tileCaption,
        { minHeight: 32 * Math.min(fontScale, MaxScale.chrome) },
        selected && { color: Theme.text, fontWeight: "800" },
      ]}
    >
      {children}
    </Text>
  );
}

/**
 * Native ids for InputAccessoryView, one per input. React Native (iOS,
 * RCTInputAccessoryComponentView.didMoveToWindow) attaches an accessory to
 * the FIRST text input in the window whose inputAccessoryViewID equals its
 * nativeID, once. A shared id therefore serves only one input. The id is
 * unique per mounted component (React useId) plus a key for the input:
 * `const doneId = useInputAccessoryIds(); doneId("price")`. Use the same
 * call for the input and its accessory, and mount them together. A guard
 * test (input-accessory.test.mjs) enforces this.
 */
export function useInputAccessoryIds(): (key: string) => string {
  const base = React.useId().replace(/[^A-Za-z0-9]/g, "");
  return (key) => `vidora-done-${base}-${key}`;
}

/**
 * Style for EVERY InputAccessoryView (guard: input-accessory.test.mjs). The
 * host view of an accessory is invisible by design (RCTInputAccessoryComponent
 * View.updateProps sets hidden), but a RECYCLED host (the Fabric pool hands
 * back one from an earlier unmounted panel) gets hidden reset to NO by
 * updateLayoutMetrics and then sits, 440x52, in front of the first row of its
 * parent, taking that row's taps. hitTest skips a view with pointerEvents
 * "none" (RCTViewComponentView.hitTest) or alpha < 0.01 (betterHitTest). The
 * bar itself lives in a separate native content view in the keyboard window,
 * so none of this touches it. Not display:none (its children would not be
 * laid out) and not a smaller size (it sizes the bar).
 */
export const INERT_ACCESSORY_HOST = {
  opacity: 0,
  pointerEvents: "none",
} as const;

export function Field({ label, ...p }: TextInputProps & { label: string }) {
  const t = useT();
  const upper = useUpper();
  const doneId = useInputAccessoryIds();
  // Focus fill: the focused field takes the accent, ink text on it.
  const [focused, setFocused] = useState(false);
  const pad =
    p.keyboardType === "decimal-pad" || p.keyboardType === "number-pad";
  return (
    <View style={[s.fieldWrap, focused && s.fieldFocused]}>
      <Text style={[s.caps, focused && { color: Theme.onAccent }]}>
        {upper(label)}
      </Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={focused ? Theme.text : Theme.muted}
        inputAccessoryViewID={pad ? doneId("field") : undefined}
        selectionColor={Theme.text}
        {...p}
        style={[s.input, p.style]}
        onFocus={(e) => {
          setFocused(true);
          p.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          p.onBlur?.(e);
        }}
      />
      {pad && (
        // Number pads have no return key: this field's own bar with "Bitti"
        // (a sibling of its input, mounted and unmounted with it).
        <InputAccessoryView
          nativeID={doneId("field")}
          style={INERT_ACCESSORY_HOST}
        >
          <View style={s.doneBar}>
            <HeaderText
              strong
              label={t("Bitti", "Done")}
              onPress={() => Keyboard.dismiss()}
            />
          </View>
        </InputAccessoryView>
      )}
    </View>
  );
}

/** Chip look shared by Choice and the editor's ChipRow. */
export const chipStyle = {
  get chip() {
    return s.chip;
  },
  get chipSelected() {
    return s.chipSelected;
  },
  get chipText() {
    return s.chipText;
  },
};

/** A labelled single-choice row of chips that scrolls sideways. */
export function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  options: readonly { value: T; label: string; badge?: string }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const upper = useUpper();
  return (
    <View style={{ gap: Space.s }}>
      <Text style={s.caps}>{upper(label)}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        contentContainerStyle={{ gap: Space.s, paddingRight: Space.gutter }}
        style={{ marginRight: -Space.gutter }}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityLabel={
                label +
                ": " +
                option.label +
                (option.badge ? ", " + option.badge : "")
              }
              accessibilityState={{ selected, disabled }}
              disabled={disabled}
              onPress={() => {
                if (!selected) tap("select");
                onChange(option.value);
              }}
              style={({ pressed }) => [
                s.chip,
                selected && s.chipSelected,
                pressed && !selected && Press.filled,
                disabled && { opacity: 0.4 },
              ]}
            >
              <Text
                maxFontSizeMultiplier={MaxScale.chrome}
                style={[s.chipText, selected && { color: Theme.accent }]}
              >
                {option.label}
                {!!option.badge && (
                  <Text style={s.badge}>{"  " + option.badge}</Text>
                )}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** Small overlay label on media, e.g. a duration or "4:5 · 0:09". */
export function Pill({ label, icon }: { label: string; icon?: IconName }) {
  return (
    <View style={s.pill}>
      {icon && <Icon name={icon} size={11} color={Theme.onMedia} />}
      <Text maxFontSizeMultiplier={MaxScale.chrome} style={s.pillText}>
        {label}
      </Text>
    </View>
  );
}

/** Video title without the extension and the export preset suffix. */
export function displayName(name: string): string {
  return name.replace(/(-trendyol|-reels|-cut)?\.[a-z0-9]{2,4}$/i, "");
}

/**
 * Poster frame for a clip; an empty tile when there is none. `ratio` is
 * width / height (default 16:9, or 9:16 with `vertical`); `fit: "contain"`
 * shows the whole frame on a surface tile with a 4 pt inset.
 */
export function Thumb({
  uri,
  size = 64,
  vertical = false,
  ratio,
  fit = "cover",
}: {
  uri: string | null;
  /** The shorter side (or the width when `ratio` is given). */
  size?: number;
  vertical?: boolean;
  ratio?: number;
  fit?: "cover" | "contain";
}) {
  const aspect = ratio ?? (vertical ? 9 / 16 : 16 / 9);
  const box =
    ratio !== undefined
      ? { width: size, height: Math.round(size / aspect) }
      : {
          width: vertical ? size : Math.round((size * 16) / 9),
          height: vertical ? Math.round((size * 16) / 9) : size,
        };
  const tile = {
    ...box,
    borderRadius: Radius.s,
    backgroundColor: Theme.surface,
  };
  if (!uri) return <View accessible={false} style={tile} />;
  if (fit === "contain")
    return (
      <View accessible={false} style={[tile, { padding: Space.xs }]}>
        <Image
          accessible={false}
          accessibilityIgnoresInvertColors
          source={{ uri }}
          resizeMode="contain"
          style={{ flex: 1 }}
        />
      </View>
    );
  return (
    <Image
      accessible={false}
      accessibilityIgnoresInvertColors
      source={{ uri }}
      resizeMode="cover"
      style={tile}
    />
  );
}

export function ProgressBar({
  progress,
  label,
}: {
  progress: number;
  label: string;
}) {
  const percent = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: percent }}
      style={{ gap: Space.s }}
    >
      <View style={s.row}>
        <Text style={s.label}>{label}</Text>
        <Text style={[s.label, { fontVariant: ["tabular-nums"] }]}>
          %{percent}
        </Text>
      </View>
      <View style={s.progressTrack}>
        <View style={[s.progressFill, { width: `${percent}%` }]} />
      </View>
    </View>
  );
}

/** Set by an inset `Section`: rows then draw icon tiles inside a rounded group. */
const InsetGroup = createContext(false);

type RowProps = Omit<PressableProps, "children" | "style" | "onPress"> & {
  label: string;
  /** Second line under the label. */
  detail?: string;
  /** Trailing value, e.g. the current language. */
  value?: string;
  icon?: IconName;
  /** A custom leading node (e.g. a Thumb) instead of `icon`. */
  leading?: React.ReactNode;
  danger?: boolean;
  /** First row of a group: no hairline above it. */
  first?: boolean;
  /** Defaults to true for rows that navigate (have onPress, not danger). */
  chevron?: boolean;
  /** Opens a web page: an arrow instead of the chevron, link role. */
  external?: boolean;
  /** Shown but not tappable: muted label and icon. */
  disabled?: boolean;
  /** Working: a spinner instead of the trailing value and chevron. */
  busy?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: "button" | "link";
  accessibilityActions?: readonly AccessibilityActionInfo[];
  onAccessibilityAction?: (event: AccessibilityActionEvent) => void;
  onPress?: () => void;
  /** Custom trailing control instead of value and chevron. */
  trailing?: React.ReactNode;
};

/**
 * A plain list row: 56 pt tall, highlights while pressed, hairline above
 * every row but the first of its group, inset to the text. Not tappable when
 * there is no onPress.
 */
export const Row = forwardRef<React.ComponentRef<typeof Pressable>, RowProps>(
  function Row(
    {
      label,
      detail,
      value,
      icon,
      leading,
      danger = false,
      first = false,
      chevron,
      external = false,
      disabled = false,
      busy = false,
      accessibilityLabel,
      accessibilityRole,
      onPress,
      trailing,
      ...rest
    },
    ref,
  ) {
    const inactive = !onPress || disabled || busy;
    const showChevron =
      !external && (chevron ?? (!!onPress && !danger && !trailing));
    const inset = useContext(InsetGroup);
    const role = onPress
      ? (accessibilityRole ?? (external ? "link" : "button"))
      : undefined;
    const dim = disabled ? { opacity: 0.4 } : null;
    return (
      <Pressable
        ref={ref}
        {...rest}
        accessibilityRole={role}
        accessibilityLabel={
          accessibilityLabel ??
          [label, value, detail].filter(Boolean).join(", ")
        }
        accessibilityState={onPress ? { disabled, busy } : undefined}
        disabled={inactive}
        onPress={onPress}
        style={({ pressed }) => [
          s.listRow,
          inset && s.insetRow,
          pressed && { backgroundColor: inset ? Theme.line : Theme.pressed },
        ]}
      >
        {leading ? (
          <View style={s.rowLeading}>{leading}</View>
        ) : (
          icon &&
          (inset ? (
            // Monochrome tile (danger red for destructive rows), no tints.
            <View
              style={[
                s.iconTile,
                danger && { backgroundColor: Theme.danger },
                dim,
              ]}
            >
              <Icon name={icon} size={16} color={Theme.bg} />
            </View>
          ) : (
            <View style={[s.rowIcon, dim]}>
              <Icon
                name={icon}
                size={20}
                color={danger ? Theme.danger : Theme.text}
              />
            </View>
          ))
        )}
        <View
          style={[
            s.listRowBody,
            inset && s.insetRowBody,
            !first && s.listRowLine,
          ]}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Text
              style={[
                s.text,
                danger && { color: Theme.danger },
                disabled && { color: Theme.muted },
              ]}
            >
              {label}
            </Text>
            {!!detail && <Text style={s.footnote}>{detail}</Text>}
          </View>
          {busy ? (
            <ActivityIndicator size="small" color={Theme.muted} />
          ) : (
            <>
              {trailing}
              {!!value && <Text style={s.rowValue}>{value}</Text>}
              {external && (
                <Icon name="arrow.up.right" size={13} color={Theme.muted} />
              )}
              {showChevron && (
                <Icon name="chevron.right" size={13} color={Theme.muted} />
              )}
            </>
          )}
        </View>
      </Pressable>
    );
  },
);

/** The visible "…" button at the end of a row; VoiceOver uses row actions. */
export function RowMenuButton({
  icon = "ellipsis",
  onPress,
  disabled = false,
  label,
}: {
  icon?: IconName;
  onPress: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <Pressable
      accessible={false}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [s.rowMenu, (pressed || disabled) && Press.text]}
    >
      <Icon name={icon} size={17} color={Theme.muted} />
    </Pressable>
  );
}

/**
 * A group of rows with an optional heading above and small print below.
 * No box: the group is separated by space, rows by hairlines.
 */
export function Section({
  title,
  footer,
  inset = false,
  children,
}: {
  title?: string;
  footer?: React.ReactNode;
  /**
   * iOS inset grouped look: rows sit in a rounded `surface` group with icon
   * tiles and hairlines inset from the label. Used by Settings.
   */
  inset?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: Space.s }}>
      {!!title && (
        <Text
          accessibilityRole="header"
          style={[s.sectionTitle, inset && { paddingHorizontal: Space.l }]}
        >
          {title}
        </Text>
      )}
      <InsetGroup.Provider value={inset}>
        <View style={inset ? s.insetGroup : s.group}>{children}</View>
      </InsetGroup.Provider>
      {!!footer &&
        (typeof footer === "string" ? (
          <Text style={[s.footnote, inset && { paddingHorizontal: Space.l }]}>
            {footer}
          </Text>
        ) : (
          <View style={inset ? { paddingHorizontal: Space.l } : undefined}>
            {footer}
          </View>
        ))}
    </View>
  );
}

/**
 * iOS segmented control: a raised track, a white thumb that slides to the
 * chosen segment, 32 pt tall, full width. One choice out of two to four.
 */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  testID,
}: {
  label: string;
  /** Per-option `testID` is for UI tests (Maestro). */
  options: readonly { value: T; label: string; testID?: string }[];
  value: T;
  onChange: (value: T) => void;
  testID?: string;
}) {
  const [width, setWidth] = useState(0);
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const segment = width > 0 ? (width - 4) / options.length : 0;
  const position = useRef(new Animated.Value(index)).current;
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (reduceMotion) position.setValue(index);
    else
      Animated.spring(position, {
        toValue: index,
        useNativeDriver: true,
        speed: 24,
        bounciness: 0,
      }).start();
  }, [index, position, reduceMotion]);
  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      accessibilityLabel={label}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={s.segmented}
    >
      {segment > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            s.segmentThumb,
            {
              width: segment,
              transform: [
                {
                  translateX: Animated.multiply(position, segment),
                },
              ],
            },
          ]}
        />
      )}
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            testID={
              option.testID ??
              (testID ? `${testID}-${option.value}` : undefined)
            }
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected }}
            onPress={() => {
              if (selected) return;
              tap("select");
              onChange(option.value);
            }}
            style={s.segment}
          >
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={MaxScale.chrome}
              style={[s.segmentText, selected && { fontWeight: "800" }]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * A designed empty state: an optional picture, one title, one line and one
 * action. Screens show it only once loading has finished. Passing `image`
 * (even null while it loads) reserves the picture's frame.
 */
export function EmptyState({
  image,
  icon,
  title,
  line,
  action,
}: {
  /** A real picture (e.g. a rendered template poster). */
  image?: ImageSourcePropType | string | null;
  /** Used when there is no picture. */
  icon?: IconName;
  title: string;
  line?: string;
  action?: {
    label: string;
    onPress: () => void;
    primary?: boolean;
    disabled?: boolean;
    testID?: string;
  };
}) {
  const source = typeof image === "string" ? { uri: image } : image;
  return (
    <View style={s.empty}>
      {image !== undefined ? (
        <View style={s.emptyImage}>
          {source && (
            <Image
              accessible={false}
              accessibilityIgnoresInvertColors
              source={source}
              resizeMode="cover"
              style={StyleSheet.absoluteFill}
            />
          )}
        </View>
      ) : icon ? (
        <Icon name={icon} size={34} color={Theme.muted} />
      ) : null}
      <View style={{ gap: Space.xs, alignItems: "center" }}>
        <Text
          accessibilityRole="header"
          maxFontSizeMultiplier={MaxScale.title}
          style={s.emptyTitle}
        >
          {title}
        </Text>
        {!!line && <Text style={s.emptyLine}>{line}</Text>}
      </View>
      {action && (
        <Button
          primary={action.primary ?? true}
          label={action.label}
          disabled={action.disabled}
          testID={action.testID}
          onPress={action.onPress}
        />
      )}
    </View>
  );
}

/**
 * Three short facts that set Vidora apart from generative tools, on Home's
 * empty state only (the paywall states them in one line under the plans).
 * Each must stay literally true: the renderer adjusts colour and light but
 * never redraws the product, videos are made on the phone (captions may use
 * Apple's server, buying uses the App Store), and nothing is charged per
 * video. Leave it out where the optional cloud scene is advertised.
 */
export function EdgeFacts() {
  const t = useT();
  const facts = [
    t("Ürünün yeniden çizilmez", "Your product is never redrawn"),
    t("Telefonunda hazırlanır", "Made on your phone"),
    t("Video başına ödeme yok", "No per-video charges"),
  ];
  return (
    <View style={s.facts}>
      {facts.map((fact) => (
        <View key={fact} accessible style={s.fact}>
          <Icon name="checkmark" size={13} color={Theme.text} />
          <Text style={s.factText}>{fact}</Text>
        </View>
      ))}
    </View>
  );
}

/** Back that never dies: a cold deep link has no history, so go home. */
export function goBack(router: {
  canGoBack(): boolean;
  back(): void;
  replace(href: "/"): void;
}) {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}

/** Native navigation bar look shared by every stack (white, large title). */
export const HeaderOptions = {
  headerTintColor: Theme.text,
  headerStyle: { backgroundColor: Theme.bg },
  headerLargeStyle: { backgroundColor: Theme.bg },
  headerTitleStyle: { color: Theme.text, fontFamily: Face.extra },
  headerLargeTitleStyle: { color: Theme.text, fontFamily: Face.display },
  headerShadowVisible: true,
  headerLargeTitleShadowVisible: false,
  headerBackButtonDisplayMode: "minimal" as const,
  contentStyle: { backgroundColor: Theme.bg },
};

type Slot = {
  get: () => React.ReactNode;
  set: (node: React.ReactNode) => void;
  subscribe: (listener: () => void) => () => void;
};
function createSlot(): Slot {
  let node: React.ReactNode = null;
  const listeners = new Set<() => void>();
  return {
    get: () => node,
    set: (next) => {
      node = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
/** Renders the screen's `action` inside the native header without loops. */
function SlotView({ slot }: { slot: Slot }) {
  const node = useSyncExternalStore(slot.subscribe, slot.get, slot.get);
  return <>{node}</>;
}

/**
 * Shared header logic of Screen and ScreenList: in a native stack the title
 * (and `action`) go to the native bar; with NATIVE_TAB_TITLES off, tab roots
 * draw their own title instead.
 */
function useScreenHeader(title: string, action: React.ReactNode) {
  const navigation = useNavigation(),
    slot = useRef<Slot>(null);
  if (!slot.current) slot.current = createSlot();
  const tabRoot = navigation.getParent()?.getState()?.type === "tab";
  const native =
    navigation.getState()?.type === "stack" && (NATIVE_TAB_TITLES || !tabRoot);
  const hasAction = action !== undefined && action !== null;
  const upper = useUpper();
  const shown = upper(title);
  useLayoutEffect(() => {
    if (!native) return;
    const current = slot.current!;
    navigation.setOptions({
      title: shown,
      headerLargeTitleEnabled: true,
      headerRight: hasAction ? () => <SlotView slot={current} /> : undefined,
    });
  }, [native, navigation, shown, hasAction]);
  useEffect(() => {
    slot.current!.set(action ?? null);
  });
  return native;
}

/** Drawn header for the fallback: title with the action on the same line. */
function DrawnHeader({
  title,
  back,
  action,
}: {
  title: string;
  back: boolean;
  action: React.ReactNode;
}) {
  const router = useRouter(),
    t = useT();
  return (
    <>
      {back && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("Geri", "Back")}
          hitSlop={12}
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/")
          }
          style={({ pressed }) => [s.backButton, pressed && Press.filled]}
        >
          <Icon name="chevron.left" size={20} />
        </Pressable>
      )}
      <View style={s.drawnTitle}>
        <View style={{ flex: 1 }}>
          <Txt big>{title}</Txt>
        </View>
        {action ? <View style={{ paddingBottom: 4 }}>{action}</View> : null}
      </View>
    </>
  );
}

/** QA_DIAG only: where a touch lands on a screen root. */
function diagTouch(title: string, e: GestureResponderEvent) {
  diag(
    "screen:touch " +
      title +
      " " +
      Math.round(e.nativeEvent.pageX) +
      "," +
      Math.round(e.nativeEvent.pageY),
  );
}

/** QA_DIAG only: scroll responder/momentum events of a screen's list. */
function listDiag(title: string) {
  return {
    onMomentumScrollBegin: () => diag("list:momentum begin " + title),
    onMomentumScrollEnd: () => diag("list:momentum end " + title),
    onResponderGrant: () => diag("list:responder grant " + title),
  };
}

/**
 * A scrolling screen. Inside a native stack the title goes to the native
 * navigation bar (large title that collapses on scroll, system back button
 * and edge swipe); `back` is then not needed and `action` becomes the
 * header's right item. The ScrollView stays the first native child so the
 * large title can collapse. `footer` is pinned under the scroll view.
 */
export function Screen({
  title,
  children,
  back = false,
  action,
  footer,
}: {
  title: string;
  children: React.ReactNode;
  back?: boolean;
  /** Optional control on the right of the top bar. */
  action?: React.ReactNode;
  /** Pinned under the scroll view (e.g. a selection toolbar). */
  footer?: React.ReactNode;
}) {
  const native = useScreenHeader(title, action);
  const tabInset = useTabBarInset();

  if (native)
    return (
      <>
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
          style={{ flex: 1, backgroundColor: Theme.bg }}
          contentContainerStyle={s.screenContent}
        >
          {children}
        </ScrollView>
        {footer}
      </>
    );

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{ flex: 1, backgroundColor: Theme.bg }}
      onTouchStart={QA_DIAG ? (e) => diagTouch(title, e) : undefined}
    >
      <ScrollView
        {...(QA_DIAG ? listDiag(title) : null)}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={[
          s.screenContent,
          { paddingTop: Space.s, paddingBottom: tabInset },
        ]}
      >
        <DrawnHeader title={title} back={back} action={action} />
        {children}
      </ScrollView>
      {footer}
    </SafeAreaView>
  );
}

/**
 * A screen whose root is a SectionList (long grids and lists), with the same
 * header behaviour as `Screen`.
 */
export function ScreenList<ItemT, SectionT>({
  title,
  action,
  footer,
  ...list
}: Omit<SectionListProps<ItemT, SectionT>, "contentInsetAdjustmentBehavior"> & {
  title: string;
  action?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const native = useScreenHeader(title, action);
  const tabInset = useTabBarInset();
  const header = list.ListHeaderComponent;
  const body = (
    <SectionList<ItemT, SectionT>
      contentInsetAdjustmentBehavior={native ? "automatic" : undefined}
      keyboardShouldPersistTaps="handled"
      stickySectionHeadersEnabled={false}
      style={{ flex: 1, backgroundColor: Theme.bg }}
      contentContainerStyle={{ paddingBottom: tabInset }}
      {...(QA_DIAG && !native ? listDiag(title) : null)}
      {...list}
      ListHeaderComponent={
        native ? (
          header
        ) : (
          <>
            {/* Same 8 pt above the title as Screen has: the marks of İ Ğ
                reach up into it (the list clips at its own top edge). */}
            <View
              style={{ paddingHorizontal: Space.gutter, paddingTop: Space.s }}
            >
              <DrawnHeader title={title} back={false} action={action} />
            </View>
            {React.isValidElement(header)
              ? header
              : header
                ? React.createElement(header as React.ComponentType)
                : null}
          </>
        )
      }
    />
  );
  if (native)
    return (
      <>
        {body}
        {footer}
      </>
    );
  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{ flex: 1, backgroundColor: Theme.bg }}
      onTouchStart={QA_DIAG ? (e) => diagTouch(title, e) : undefined}
    >
      {body}
      {footer}
    </SafeAreaView>
  );
}

/** Bottom inset helper for pinned footers and floating banners. */
export function useBottomInset(): number {
  return useSafeAreaInsets().bottom;
}

/**
 * Text style tokens (Vitrin). Each names its face together with a matching
 * fontWeight, so a missing font falls back to the system font in the same
 * weight (see fonts.ts).
 * display: Anton, uppercase poster headline. title: Manrope 800. body:
 * Manrope 500. label: small tracked caps. numeric: tabular figures.
 */
/*
 * Anton display lines. The marks of İ Ğ Ü Ö (and Â) rise above the cap height
 * to 1.050-1.077 em (1.101 em for Â) over the baseline. The line box is only
 * 1.12 em, much less than the font's own line (1.507 em), so React Native
 * adds no baseline offset (RCTApplyBaselineOffsetForRange returns early when
 * maximumLineHeight < font.lineHeight) and TextKit puts the baseline
 * (lineHeight - ANTON_DESCENT em) below the top of the line. The text view
 * draws only inside its own bounds (RCTParagraphComponentView.drawRect), so
 * everything above paddingTop is cut. displayMetrics therefore returns a
 * paddingTop large enough for the marks, and an equal negative marginTop so
 * the layout stays exactly where the approved picture has it (the view just
 * reaches up into the empty room above it). fontSize and lineHeight scale
 * with Dynamic Type up to maxFontSizeMultiplier but paddingTop does not, so
 * the padding is derived at the cap: pass the cap the Text really uses
 * (maxScale) and set the same cap as maxFontSizeMultiplier on that Text.
 * Never write a lineHeight or paddingTop by hand on an Anton text.
 * Guarded by src/display-metrics.test.mjs, which reads this block.
 */
/* display-metrics:begin */
/** Anton_400Regular.ttf, in em: hhea descent and the top of the tallest mark (Ğ). */
export const ANTON_DESCENT = 0.33;
export const ANTON_MARK_TOP = 1.077;
/** Clearance above the marks (also covers Â at 1.101 em). */
export const DISPLAY_SAFE = 0.03;
/** Approved layout: line box and the layout padding above line 1 (em). */
export const DISPLAY_LEAD = 1.12;
export const DISPLAY_PAD = 0.14;
/**
 * Box of an Anton text. `lineHeight` and `slotPad` are the approved layout
 * (the room the text takes in its parent); the returned paddingTop is
 * whatever the marks need at maxScale, and marginTop gives the difference back.
 */
export function displayBox(
  size: number,
  lineHeight: number,
  slotPad: number,
  maxScale = 1,
) {
  const need = Math.ceil(
    maxScale *
      ((ANTON_MARK_TOP + DISPLAY_SAFE + ANTON_DESCENT) * size - lineHeight),
  );
  const paddingTop = Math.max(slotPad, need);
  return {
    fontSize: size,
    lineHeight,
    paddingTop,
    marginTop: slotPad - paddingTop,
  };
}
export function displayMetrics(size: number, maxScale = 1) {
  return displayBox(
    size,
    Math.round(size * DISPLAY_LEAD),
    Math.round(size * DISPLAY_PAD),
    maxScale,
  );
}
/* display-metrics:end */

export const Type = StyleSheet.create({
  /** Padding is derived at MaxScale.largeTitle: give the Text that cap. */
  display: {
    fontFamily: Face.display,
    ...displayMetrics(34, MaxScale.largeTitle),
    fontWeight: "800",
    letterSpacing: -0.3,
    textTransform: "uppercase",
    color: Theme.text,
  },
  title: {
    fontFamily: Face.extra,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "800",
    letterSpacing: -0.3,
    color: Theme.text,
  },
  body: {
    fontFamily: Face.medium,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "500",
    color: Theme.text,
  },
  label: {
    fontFamily: Face.extra,
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: "800",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: Theme.muted,
  },
  numeric: {
    fontFamily: Face.bold,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
});

const caption = {
  fontFamily: Face.bold,
  fontSize: 11,
  lineHeight: 13,
  fontWeight: "700" as const,
  letterSpacing: 0.4,
};

export const s = StyleSheet.create({
  text: {
    fontFamily: Face.medium,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "500",
    color: Theme.text,
  },
  heading: {
    fontFamily: Face.display,
    ...displayMetrics(34, MaxScale.largeTitle),
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  title: {
    fontFamily: Face.extra,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  headline: {
    fontFamily: Face.bold,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "700",
    color: Theme.text,
  },
  muted: {
    fontFamily: Face.medium,
    color: Theme.muted,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "500",
  },
  subheadStrong: {
    fontFamily: Face.bold,
    color: Theme.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
  },
  footnote: {
    fontFamily: Face.medium,
    color: Theme.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
  },
  footnoteStrong: {
    fontFamily: Face.bold,
    color: Theme.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  label: {
    fontFamily: Face.medium,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
    color: Theme.muted,
  },
  /** Small tracked caps (Type.label) for field and group labels. */
  caps: {
    fontFamily: Face.extra,
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: "800",
    letterSpacing: 1.1,
    color: Theme.muted,
  },
  caption: { ...caption, color: Theme.muted },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s,
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  /** @deprecated Grouped box for older screens; use Section + Row. */
  panel: {
    padding: Space.l,
    borderRadius: Radius.l,
    backgroundColor: Theme.surface,
    gap: Space.m,
  },
  ring: { borderWidth: 2, borderColor: Theme.text },
  screenContent: {
    paddingHorizontal: Space.gutter,
    paddingTop: Space.s,
    paddingBottom: Space.xxl * 3,
    gap: Space.l,
  },
  drawnTitle: {
    flexDirection: "row",
    alignItems: "flex-end",
    minHeight: 41,
    gap: Space.m,
  },
  // Secondary: outlined ink 1.5 pt on paper.
  button: {
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: Space.l,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Space.s,
    borderRadius: Radius.button,
    borderWidth: 1.5,
    borderColor: Theme.text,
    backgroundColor: "transparent",
  },
  // Primary: ink fill, accent label, 52 pt.
  primary: {
    minHeight: 52,
    backgroundColor: Theme.text,
    borderColor: Theme.text,
  },
  // On an ink bar: accent fill, ink label; secondary is paper.
  primaryOnInk: {
    minHeight: 52,
    backgroundColor: Theme.accent,
    borderColor: Theme.accent,
  },
  secondaryOnInk: { backgroundColor: Theme.bg, borderColor: Theme.bg },
  // Finished and inert (e.g. "Kaydedildi").
  done: { backgroundColor: Theme.raised, borderColor: Theme.raised },
  large: { minHeight: 52, alignSelf: "stretch", flexGrow: 1 },
  // Text link: underlined, no frame.
  plain: {
    backgroundColor: "transparent",
    borderWidth: 0,
    paddingHorizontal: 0,
    alignSelf: "flex-start",
  },
  plainText: {
    fontFamily: Face.bold,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
  selected: { backgroundColor: Theme.text, borderColor: Theme.text },
  buttonText: {
    fontFamily: Face.extra,
    fontSize: 17,
    lineHeight: 22,
    color: Theme.text,
    fontWeight: "800",
    textAlign: "center",
  },
  badge: { ...caption },
  saveShare: { flexDirection: "row", gap: Space.s, alignItems: "stretch" },
  headerText: { minHeight: 44, justifyContent: "center" },
  headerTextLabel: {
    fontFamily: Face.bold,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "700",
    color: Theme.text,
  },
  notice: { flexDirection: "row", gap: Space.s, alignItems: "flex-start" },
  noticeText: {
    fontFamily: Face.medium,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
    color: Theme.text,
  },
  tileCaption: {
    fontFamily: Face.bold,
    fontWeight: "700",
    fontSize: 13,
    lineHeight: 16,
    color: Theme.muted,
    textAlign: "center",
  },
  doneBar: {
    minHeight: 44,
    alignItems: "flex-end",
    justifyContent: "center",
    paddingHorizontal: Space.gutter,
    backgroundColor: Theme.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.line,
  },
  chip: {
    minHeight: 44,
    paddingHorizontal: Space.l,
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: Theme.line,
    backgroundColor: Theme.bg,
  },
  chipSelected: { backgroundColor: Theme.text, borderColor: Theme.text },
  chipText: {
    fontFamily: Face.bold,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
    color: Theme.text,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: Theme.scrim,
  },
  pillText: {
    ...caption,
    color: Theme.onMedia,
    fontVariant: ["tabular-nums"],
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    backgroundColor: Theme.raised,
  },
  progressFill: { height: "100%", backgroundColor: Theme.text },
  // Underlined field; the focused one fills with the accent (fieldFocused).
  fieldWrap: {
    gap: 2,
    paddingHorizontal: Space.s,
    paddingTop: Space.s,
    borderBottomWidth: 1.5,
    borderBottomColor: Theme.text,
  },
  fieldFocused: { backgroundColor: Theme.accent },
  input: {
    fontFamily: Face.bold,
    fontSize: 17,
    fontWeight: "700",
    minHeight: 44,
    color: Theme.text,
    paddingHorizontal: 0,
    paddingVertical: 8,
  },
  group: { marginHorizontal: -Space.gutter },
  segmented: {
    flexDirection: "row",
    padding: 2,
    minHeight: 32,
    borderRadius: 9,
    backgroundColor: Theme.raised,
  },
  segmentThumb: {
    position: "absolute",
    top: 2,
    bottom: 2,
    left: 2,
    borderRadius: 7,
    backgroundColor: Theme.bg,
    shadowColor: Theme.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  segment: {
    flex: 1,
    minHeight: 28,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Space.s,
  },
  segmentText: {
    fontFamily: Face.bold,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    color: Theme.text,
  },
  insetGroup: {
    borderRadius: Radius.m,
    overflow: "hidden",
    backgroundColor: Theme.surface,
  },
  insetRow: { paddingLeft: Space.l },
  insetRowBody: { paddingRight: Space.l },
  iconTile: {
    width: 29,
    height: 29,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.text,
  },
  rowIcon: { justifyContent: "center" },
  rowLeading: { justifyContent: "center", paddingVertical: Space.s },
  rowMenu: {
    width: 44,
    height: 44,
    marginRight: -12,
    alignItems: "center",
    justifyContent: "center",
  },
  listRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: Space.m,
    paddingLeft: Space.gutter,
  },
  listRowBody: {
    flex: 1,
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s,
    paddingVertical: Space.s,
    paddingRight: Space.gutter,
  },
  listRowLine: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.line,
  },
  rowValue: {
    fontFamily: Face.bold,
    fontWeight: "700",
    fontSize: 17,
    lineHeight: 22,
    color: Theme.muted,
    fontVariant: ["tabular-nums"],
  },
  sectionTitle: {
    fontFamily: Face.extra,
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: "800",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: Theme.muted,
  },
  facts: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    columnGap: Space.l,
    rowGap: Space.xs,
  },
  fact: { flexDirection: "row", alignItems: "center", gap: 6 },
  factText: {
    fontFamily: Face.bold,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    color: Theme.text,
  },
  empty: {
    alignItems: "center",
    gap: Space.l,
    paddingVertical: Space.xxl,
    paddingHorizontal: Space.l,
  },
  emptyImage: {
    width: 132,
    aspectRatio: 9 / 16,
    borderRadius: Radius.m,
    overflow: "hidden",
    backgroundColor: Theme.surface,
  },
  emptyTitle: {
    fontFamily: Face.extra,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "800",
    letterSpacing: -0.3,
    color: Theme.text,
    textAlign: "center",
  },
  emptyLine: {
    fontFamily: Face.medium,
    fontWeight: "500",
    fontSize: 15,
    lineHeight: 20,
    color: Theme.muted,
    textAlign: "center",
  },
});
