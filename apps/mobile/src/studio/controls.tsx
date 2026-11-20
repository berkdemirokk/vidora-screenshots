import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
} from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Icon,
  MaxScale,
  Press,
  Space,
  Theme,
  Face,
  chipStyle,
  tap,
  type IconName,
} from "../ui";

/** The shared bar text button (kept here for older imports). */
export { HeaderText } from "../ui";

/** Text in editor chrome grows with Dynamic Type only this far. */
export const CHROME_SCALE = MaxScale.chrome;

/** Follows the system Reduce Motion setting. */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (live) setReduce(value);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduce,
    );
    return () => {
      live = false;
      subscription.remove();
    };
  }, []);
  return reduce;
}

/** Compact filled button for the navigation bar (the screen's main action). */
export function HeaderAction({
  label,
  onPress,
  disabled = false,
  testID,
  badge,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
  /** e.g. "PRO" when the action needs Vidora Pro. */
  badge?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={badge ? label + ", " + badge : label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={() => {
        tap("action");
        onPress();
      }}
      style={({ pressed }) => [
        styles.headerAction,
        disabled && { opacity: 0.4 },
        pressed && Press.button,
      ]}
    >
      <Text
        style={styles.headerActionText}
        maxFontSizeMultiplier={CHROME_SCALE}
        numberOfLines={1}
      >
        {label}
        {badge ? (
          <Text style={styles.headerBadge}>
            {"  "}
            {badge}
          </Text>
        ) : null}
      </Text>
    </Pressable>
  );
}

/**
 * The navigation bar's back button with a stable testID. Going back still
 * runs the screen's leave rules (usePreventRemove), like the swipe does.
 */
export function HeaderBack({
  label,
  onPress,
  testID,
}: {
  label: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={10}
      onPress={onPress}
      style={({ pressed }) => [styles.headerBack, pressed && Press.text]}
    >
      <Icon name="chevron.left" size={20} color={Theme.text} />
    </Pressable>
  );
}

/**
 * Height a panel's scrolling content may take inside SwipePanel (its cap
 * minus the handle strip). The panels' ScrollViews use it as maxHeight, so
 * their content ends above the tool bar instead of running under it (QA run
 * 13: a field under the tool bar took the tap meant for it).
 */
const PanelSpace = createContext<number | undefined>(undefined);
/** False for a list that is mounted but hidden: it draws no posters. */
export const ListActive = createContext(true);
export const useListActive = () => useContext(ListActive);
export const usePanelSpace = () => useContext(PanelSpace);

/**
 * The editor's bottom panel. A grab handle on top: drag it down (or tap it)
 * to close the panel. Only the handle strip takes the drag, so the sideways
 * rows and text fields inside keep their own gestures.
 */
export function SwipePanel({
  onDismiss,
  closeLabel,
  hint,
  maxHeight,
  children,
}: {
  onDismiss: () => void;
  closeLabel: string;
  /** One line of guidance next to the handle. */
  hint?: string;
  /** Keeps the preview large; scrolling panels shrink to fit. */
  maxHeight?: number;
  children: ReactNode;
}) {
  const drag = useRef(new Animated.Value(0)).current,
    height = useRef(0),
    dismiss = useRef(onDismiss);
  const [strip, setStrip] = useState(0);
  const space =
    maxHeight !== undefined
      ? Math.max(80, maxHeight - strip - Space.m)
      : undefined;
  dismiss.current = onDismiss;
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => drag.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) => {
        if (g.dy > 64 || g.vy > 0.6) {
          Animated.timing(drag, {
            toValue: height.current || 320,
            duration: 180,
            easing: Easing.bezier(0.23, 1, 0.32, 1),
            useNativeDriver: true,
          }).start(() => {
            dismiss.current();
            drag.setValue(0);
          });
        } else {
          Animated.spring(drag, {
            toValue: 0,
            useNativeDriver: true,
            speed: 24,
            bounciness: 0,
          }).start();
        }
      },
      onPanResponderTerminate: () =>
        Animated.spring(drag, {
          toValue: 0,
          useNativeDriver: true,
          speed: 24,
          bounciness: 0,
        }).start(),
    }),
  ).current;
  return (
    <Animated.View
      onLayout={(event) => {
        height.current = event.nativeEvent.layout.height;
      }}
      style={[styles.sheet, { maxHeight, transform: [{ translateY: drag }] }]}
    >
      <View
        {...responder.panHandlers}
        onLayout={(event) => setStrip(event.nativeEvent.layout.height)}
        style={styles.handleStrip}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          hitSlop={{ top: 12, bottom: 12, left: 40, right: 40 }}
          onPress={onDismiss}
          style={styles.handleHit}
        >
          <View style={styles.handle} />
        </Pressable>
        {!!hint && (
          <Text numberOfLines={1} style={styles.hint}>
            {hint}
          </Text>
        )}
      </View>
      <PanelSpace.Provider value={space}>{children}</PanelSpace.Provider>
    </Animated.View>
  );
}

/** Round icon button for bars and overlays. */
export function IconButton({
  icon,
  label,
  onPress,
  disabled = false,
  testID,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        pressed && { backgroundColor: Theme.pressed },
        disabled && { opacity: 0.4 },
      ]}
    >
      <Icon name={icon} size={17} />
    </Pressable>
  );
}

export type ToolId = "template" | "color" | "text" | "music" | "format";

/**
 * The editor's bottom bar. The selected tool is ink with a bar under its
 * label (not colour alone, audit F47). Re-tapping it does nothing; the panel
 * closes with its handle.
 */
export function ToolBar<T extends string = ToolId>({
  tools,
  active,
  onChange,
  disabled,
}: {
  tools: { id: T; icon: IconName; label: string; testID?: string }[];
  active: T | null;
  onChange: (id: T) => void;
  disabled: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityRole="tablist"
      style={[styles.toolBar, { paddingBottom: Math.max(insets.bottom, 8) }]}
    >
      {tools.map((tool) => {
        const selected = tool.id === active,
          color = selected ? Theme.text : Theme.muted;
        return (
          <Pressable
            key={tool.id}
            testID={tool.testID}
            accessibilityRole="tab"
            accessibilityLabel={tool.label}
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => {
              if (selected) return;
              tap("select");
              onChange(tool.id);
            }}
            style={({ pressed }) => [
              styles.tool,
              disabled && { opacity: 0.4 },
              pressed && !selected && Press.filled,
            ]}
          >
            <Icon
              name={tool.icon}
              size={20}
              color={color}
              weight={selected ? "semibold" : "regular"}
            />
            <Text
              maxFontSizeMultiplier={CHROME_SCALE}
              style={[
                styles.toolLabel,
                { color, fontWeight: selected ? "800" : "700" },
              ]}
            >
              {tool.label}
            </Text>
            <View
              style={[
                styles.toolMark,
                selected && { backgroundColor: Theme.text },
              ]}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Text tabs with an underline. Taps work while the keyboard is up, a filled
 * tab shows a small dot (`marked`), and the selected tab scrolls into view.
 */
export function SegmentRow<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
  testIDFor,
  marked,
}: {
  label: string;
  options: readonly { value: T; label: string; style?: object }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  testIDFor?: (value: T) => string;
  /** Tabs whose field is filled. */
  marked?: (value: T) => boolean;
}) {
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null),
    positions = useRef(new Map<string, number>());
  useEffect(() => {
    const x = positions.current.get(value);
    if (x !== undefined)
      scroller.current?.scrollTo({
        x: Math.max(0, x - Space.gutter),
        animated: true,
      });
  }, [value]);
  return (
    <ScrollView
      ref={scroller}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      accessibilityRole="tablist"
      accessibilityLabel={label}
      contentContainerStyle={styles.segmentRow}
    >
      {options.map((option) => {
        const selected = option.value === value,
          dot = marked?.(option.value) ?? false;
        return (
          <Pressable
            key={option.value}
            testID={testIDFor?.(option.value) || undefined}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onLayout={(event) =>
              positions.current.set(option.value, event.nativeEvent.layout.x)
            }
            onPress={() => {
              if (!selected) tap("select");
              onChange(option.value);
            }}
            style={({ pressed }) => [
              styles.segment,
              option.style,
              disabled && { opacity: 0.4 },
              pressed && Press.text,
            ]}
          >
            <View style={styles.segmentLabel}>
              <Text
                maxFontSizeMultiplier={CHROME_SCALE}
                style={[styles.segmentText, selected && { color: Theme.text }]}
              >
                {option.label}
              </Text>
              {dot && <View style={styles.segmentDot} />}
            </View>
            <View
              style={[
                styles.segmentLine,
                selected && { backgroundColor: Theme.text },
              ]}
            />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Small chips in one sideways row; selection inverts to light-on-dark. */
export function ChipRow<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
  testIDFor,
  labelStyleFor,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
  disabled?: boolean;
  /** Stable id for each chip, for UI tests. */
  testIDFor?: (value: T) => string;
  /** Extra label style per chip (e.g. each type family in its own face). */
  labelStyleFor?: (value: T) => object | undefined;
}) {
  // The selected chip scrolls into view (also when it changes elsewhere).
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null),
    positions = useRef(new Map<string, number>());
  useEffect(() => {
    if (value === null) return;
    const x = positions.current.get(value);
    if (x !== undefined)
      scroller.current?.scrollTo({
        x: Math.max(0, x - Space.gutter),
        animated: true,
      });
  }, [value]);
  return (
    <ScrollView
      ref={scroller}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      accessibilityRole={value === null ? undefined : "radiogroup"}
      accessibilityLabel={label}
      contentContainerStyle={styles.chipRow}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            testID={testIDFor?.(option.value) || undefined}
            onLayout={(event) => {
              positions.current.set(option.value, event.nativeEvent.layout.x);
              // First layout: show the selected chip without animation.
              if (option.value === value && event.nativeEvent.layout.x > 200)
                scroller.current?.scrollTo({
                  x: event.nativeEvent.layout.x - Space.gutter,
                  animated: false,
                });
            }}
            accessibilityRole={value === null ? "button" : "radio"}
            accessibilityLabel={label + ": " + option.label}
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => {
              if (!selected) tap("select");
              onChange(option.value);
            }}
            style={({ pressed }) => [
              chipStyle.chip,
              selected && chipStyle.chipSelected,
              pressed && !selected && Press.filled,
              disabled && { opacity: 0.4 },
            ]}
          >
            <Text
              maxFontSizeMultiplier={CHROME_SCALE}
              style={[
                chipStyle.chipText,
                labelStyleFor?.(option.value),
                selected && { color: Theme.accent },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/**
 * A notice in normal flow (between the stage and the panel): it never covers
 * the frame. Optional icon and a muted detail line; a 44 pt close.
 */
export function Banner({
  text,
  closeLabel,
  onClose,
  action,
  icon,
  detail,
}: {
  text: string;
  closeLabel: string;
  onClose: () => void;
  action?: ReactNode;
  icon?: IconName;
  detail?: string;
}) {
  return (
    <View accessibilityLiveRegion="polite" style={styles.banner}>
      {icon && (
        <View style={styles.bannerIcon}>
          <Icon name={icon} size={17} color={Theme.text} />
        </View>
      )}
      <View style={{ flex: 1, gap: Space.xs }}>
        <Text style={styles.bannerText}>{text}</Text>
        {!!detail && <Text style={styles.bannerDetail}>{detail}</Text>}
        {action}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={closeLabel}
        onPress={onClose}
        style={styles.bannerClose}
      >
        <Icon name="xmark" size={13} color={Theme.muted} />
      </Pressable>
    </View>
  );
}

/**
 * Width of a poster card in a panel of height `space`: the looks and the
 * templates share it (9:16, 56 to 72 pt).
 */
export function posterWidth(space: number | undefined): number {
  if (space === undefined) return 72;
  return Math.max(56, Math.min(72, Math.floor(((space - 88) * 9) / 16)));
}

/** Group label inside a panel. */
export function PanelLabel({ children }: { children: ReactNode }) {
  return <Text style={styles.panelLabel}>{children}</Text>;
}

/**
 * Vitrin editor: pill tabs ("Arka plan" / "Metin"). Active = ink fill with an
 * accent label; inactive = hairline outline. 44 pt targets.
 */
export function EditorTabs<T extends string>({
  tabs,
  active,
  onChange,
  disabled = false,
}: {
  tabs: { id: T; label: string; testID?: string }[];
  active: T | null;
  onChange: (id: T) => void;
  disabled?: boolean;
}) {
  return (
    <View accessibilityRole="tablist" style={styles.pillRow}>
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <Pressable
            key={tab.id}
            testID={tab.testID}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            hitSlop={{ top: 2, bottom: 2 }}
            onPress={() => {
              if (selected) return;
              tap("select");
              onChange(tab.id);
            }}
            style={({ pressed }) => [
              styles.pill,
              selected && styles.pillOn,
              disabled && { opacity: 0.4 },
              pressed && !selected && Press.filled,
            ]}
          >
            <Text
              maxFontSizeMultiplier={CHROME_SCALE}
              style={[styles.pillText, selected && { color: Theme.accent }]}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Vitrin editor bottom sheet: paper, rounded top, one soft shadow. Holds the
 * pill tabs, the active panel and the footer (the render button). `space` is
 * the height the panel may use; panels read it through usePanelSpace.
 */
export function EditorSheet({
  head,
  footer,
  space,
  flex = false,
  keyboard = false,
  children,
}: {
  head?: ReactNode;
  footer?: ReactNode;
  space?: number;
  /** Fill the remaining height (keyboard open). */
  flex?: boolean;
  keyboard?: boolean;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.editorSheet,
        flex && { flex: 1 },
        { paddingBottom: keyboard ? 0 : Math.max(insets.bottom, Space.l) },
      ]}
    >
      {head}
      <PanelSpace.Provider value={space}>{children}</PanelSpace.Provider>
      {footer}
    </View>
  );
}

const styles = StyleSheet.create({
  pillRow: { flexDirection: "row", gap: Space.s, alignItems: "center" },
  pill: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: Theme.line,
  },
  pillOn: { backgroundColor: Theme.text, borderColor: Theme.text },
  pillText: {
    fontFamily: Face.extra,
    fontSize: 13,
    fontWeight: "800",
    color: Theme.text,
  },
  editorSheet: {
    backgroundColor: Theme.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: Space.m,
    paddingHorizontal: Space.gutter,
    gap: Space.s,
    shadowColor: Theme.shadow,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
  },
  headerAction: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    justifyContent: "center",
    // Vitrin: ink capsule, accent label (the primary on a light bar).
    backgroundColor: Theme.text,
  },
  headerActionText: {
    fontFamily: Face.extra,
    fontSize: 15,
    fontWeight: "800",
    color: Theme.accent,
  },
  headerBadge: {
    fontFamily: Face.extra,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  headerBack: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  sheet: {
    overflow: "hidden",
    paddingBottom: Space.m,
    backgroundColor: Theme.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  handleStrip: { alignItems: "center", paddingTop: Space.s, gap: Space.xs },
  handleHit: { paddingVertical: 10, paddingHorizontal: Space.l },
  handle: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: Theme.scrimSoft,
  },
  hint: {
    fontFamily: Face.medium,
    fontSize: 13,
    color: Theme.muted,
    paddingHorizontal: Space.gutter,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Theme.raised,
  },
  toolBar: {
    flexDirection: "row",
    paddingTop: Space.s,
    paddingHorizontal: Space.s,
    backgroundColor: Theme.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.line,
  },
  tool: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  toolLabel: { fontFamily: Face.bold, fontSize: 11, lineHeight: 13 },
  toolMark: {
    width: 16,
    height: 2,
    borderRadius: 1,
    backgroundColor: "transparent",
  },
  segmentRow: { gap: Space.l, paddingHorizontal: Space.gutter },
  segment: { minHeight: 44, justifyContent: "flex-end", gap: 6 },
  segmentLabel: { flexDirection: "row", alignItems: "center", gap: 5 },
  segmentDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Theme.text,
  },
  segmentText: {
    fontFamily: Face.bold,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
    color: Theme.muted,
  },
  segmentLine: {
    height: 2,
    borderRadius: 1,
    backgroundColor: "transparent",
  },
  chipRow: { gap: Space.s, paddingHorizontal: Space.gutter },
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Space.m,
    padding: Space.m,
    borderRadius: 12,
    backgroundColor: Theme.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Theme.line,
    shadowColor: Theme.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
  },
  bannerIcon: { paddingTop: 1 },
  bannerText: {
    fontFamily: Face.bold,
    fontSize: 15,
    lineHeight: 20,
    color: Theme.text,
  },
  bannerDetail: {
    fontFamily: Face.medium,
    fontSize: 13,
    lineHeight: 18,
    color: Theme.muted,
  },
  bannerClose: {
    width: 44,
    height: 44,
    margin: -Space.m,
    alignItems: "center",
    justifyContent: "center",
  },
  panelLabel: {
    fontFamily: Face.extra,
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: "800",
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: Theme.muted,
    paddingHorizontal: Space.gutter,
  },
});

/**
 * Fills the parent box. Use it for bundled images (`require`d assets):
 * React Native gives those the asset's own width and height by default,
 * and explicit sizes win over top/left/right/bottom, so `absoluteFill`
 * alone left a 3:4 backdrop thumbnail covering only the top of the 9:16
 * preview (QA run 13).
 */
export const FILL = {
  position: "absolute",
  top: 0,
  left: 0,
  width: "100%",
  height: "100%",
} as const;
