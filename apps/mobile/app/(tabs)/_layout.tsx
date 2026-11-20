import { useEffect } from "react";
import { useSegments } from "expo-router";
import { NativeTabs } from "expo-router/native-tabs";
import { QA_DIAG } from "../../src/config";
import { diag } from "../../src/diag";
import { Theme, useT, useTabBarHidden } from "../../src/ui";

/**
 * QA run 26 showed the Library tab's content taking no touches (the native
 * tab bar and the other tabs worked). The router sets `pointerEvents` on each
 * tab screen from its own deferred selected tab; forcing "box-none" on every
 * tab is safe because UIKit only keeps the selected tab's view in the window.
 * This is a defensive measure, the cause is not proven. Guard test:
 * src/tabs-touchable.test.mjs. (The library's type has no pointerEvents key,
 * although the router itself passes that prop, hence the cast.)
 */
const TOUCHABLE = { pointerEvents: "box-none" } as unknown as NonNullable<
  React.ComponentProps<typeof NativeTabs.Trigger>["unstable_nativeProps"]
>;

/**
 * The system tab bar (UITabBar; Liquid Glass on iOS 26). Each tab runs its
 * own native stack ("(studio)", "(library)", "(settings)") that draws the
 * iOS large title. Icons are outline by default and filled when selected;
 * colours, blur and minimise behaviour are left to the system. Library's
 * select mode hides the bar (useTabBarHidden) and shows its toolbar.
 */
export default function TabsLayout() {
  const t = useT();
  const hidden = useTabBarHidden();
  const content = { backgroundColor: Theme.bg };
  return (
    <>
      {QA_DIAG ? <SegmentsLog /> : null}
      <NativeTabs tintColor={Theme.text} hidden={hidden}>
        <NativeTabs.Trigger
          name="(studio)"
          testID="tab-studio"
          contentStyle={content}
          unstable_nativeProps={TOUCHABLE}
        >
          <NativeTabs.Trigger.Icon
            sf={{ default: "video", selected: "video.fill" }}
          />
          <NativeTabs.Trigger.Label>
            {t("Stüdyo", "Studio")}
          </NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger
          name="(library)"
          testID="tab-library"
          contentStyle={content}
          unstable_nativeProps={TOUCHABLE}
        >
          <NativeTabs.Trigger.Icon
            sf={{
              default: "square.grid.2x2",
              selected: "square.grid.2x2.fill",
            }}
          />
          <NativeTabs.Trigger.Label>
            {t("Kitaplık", "Library")}
          </NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger
          name="(settings)"
          testID="tab-settings"
          contentStyle={content}
          unstable_nativeProps={TOUCHABLE}
        >
          <NativeTabs.Trigger.Icon
            sf={{ default: "gearshape", selected: "gearshape.fill" }}
          />
          <NativeTabs.Trigger.Label>
            {t("Ayarlar", "Settings")}
          </NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    </>
  );
}

/**
 * QA builds only: the router's JS-side location on every change. Its own
 * component, so the tabs layout itself never re-renders on navigation.
 */
function SegmentsLog() {
  const where = useSegments().join("/");
  useEffect(() => {
    diag("tabs:segments " + where);
  }, [where]);
  return null;
}
