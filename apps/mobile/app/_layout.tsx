import { Stack, SplashScreen } from "expo-router";
import { View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useState, useEffect } from "react";
import { getLocales } from "expo-localization";
import * as SecureStore from "expo-secure-store";
import { HeaderOptions, Language, Theme } from "../src/ui";
import { ProProvider } from "../src/pro-context";
import { AuthProvider } from "../src/auth/context";
import { loadFonts } from "../src/fonts";
import {
  isLangChoice,
  resolveLang,
  type Lang,
  type LangChoice,
} from "../src/i18n/lang";
// Keep the native splash up until the fonts settle (or the timeout below), so
// the first visible frame already uses Anton/Manrope. Fail safe: errors are
// swallowed and the timeout always releases the app.
try {
  void SplashScreen.preventAutoHideAsync().catch(() => {});
} catch {}
const FONT_WAIT_MS = 1500;
/** Device locale tags, best first (expo-localization; Intl is the fallback). */
function deviceTags(): string[] {
  try {
    return getLocales().map((l) => l.languageTag || l.languageCode || "");
  } catch {
    return [];
  }
}
export default function Layout() {
  // The saved choice wins; "system" (the default) follows the device.
  const [choice, C] = useState<LangChoice>("system");
  const [device, D] = useState<Lang>(() => resolveLang("system", deviceTags()));
  const lang: Lang = choice === "system" ? device : choice;
  // The navigator mounts exactly once: when the fonts settle or after
  // FONT_WAIT_MS, whichever comes first. Fonts arriving later are not applied
  // by remounting (that would drop navigation state); that session keeps the
  // system face until the next launch.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      setReady(true);
    };
    const timer = setTimeout(go, FONT_WAIT_MS);
    loadFonts().then(go, go);
    return () => {
      done = true;
      clearTimeout(timer);
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      void SplashScreen.hideAsync().catch(() => {});
    } catch {}
  }, [ready]);
  useEffect(() => {
    SecureStore.getItemAsync("language")
      .then((l) => {
        if (isLangChoice(l)) C(l);
      })
      .catch(() => {});
  }, []);
  if (!ready) {
    return <View style={{ flex: 1, backgroundColor: Theme.bg }} />;
  }
  return (
    <Language.Provider
      value={{
        lang,
        choice,
        setLang: (l) => {
          C(l);
          void SecureStore.setItemAsync("language", l).catch(() => {});
        },
        setChoice: (c) => {
          C(c);
          if (c === "system") D(resolveLang("system", deviceTags()));
          void SecureStore.setItemAsync("language", c).catch(() => {});
        },
      }}
    >
      <AuthProvider>
        <ProProvider>
          <StatusBar style="dark" />
          {/* Native navigation bars everywhere: large titles, system back
              button and edge swipe. Screens set their title through Screen. */}
          <Stack
            screenOptions={{ ...HeaderOptions, headerShown: true, title: "" }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="create"
              options={{ headerShadowVisible: false }}
            />
            <Stack.Screen
              name="paywall"
              options={{ presentation: "modal", headerShown: false }}
            />
            <Stack.Screen
              name="account"
              options={{ headerShadowVisible: false }}
            />
          </Stack>
        </ProProvider>
      </AuthProvider>
    </Language.Provider>
  );
}
