/**
 * Account screen (docs/giris/ux.md sections 2-5, decisions of plan.md section
 * 2). One route, four states: signed out (sign in / create account), "check
 * your email" after a password reset, signed in (sign out, delete account in
 * two steps) and a blank moment while the session is restored. Nothing else in
 * the app waits for it; with FEATURES.accounts off the route redirects at once.
 *
 * The logic lives in src/auth/account-form.ts (pure, tested); this file draws.
 *
 * Layout: its own ScrollView, so the headline can sit in the content and wrap
 * (Type.display + displayMetrics). RN 0.88 Fabric's
 * automaticallyAdjustKeyboardInsets (RCTScrollViewComponentView.mm) adds a
 * bottom inset as tall as the part of the keyboard that covers the scroll view
 * and scrolls the focused field into view, so everything can be reached;
 * `useKeepVisible` additionally scrolls the submit button above the keyboard.
 * No InputAccessoryView anywhere: e-mail and password use ordinary keyboards
 * with a Return-key chain (Fabric attaches one accessory to one input only).
 */
import { useContext, useEffect, useReducer, useRef, useState } from "react";
import type { ComponentRef, ReactNode, Ref, RefObject } from "react";
import {
  AppState,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type TextInputProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { FEATURES } from "../src/config";
import { PRIVACY_URL } from "../src/pairing";
import { TERMS_URL } from "../src/pro";
import {
  Button,
  Face,
  Icon,
  Language,
  MaxScale,
  Press,
  Radius,
  Space,
  Theme,
  Type,
  displayMetrics,
  goBack,
  openPage,
  s,
  tap,
  useAnnounce,
  useBottomInset,
  useUpper,
  type IconName,
} from "../src/ui";
import { useAuth } from "../src/auth/context";
import {
  getAppleButton,
  getAppleButtonProps,
  isAppleAvailable,
  signInWithAppleNative,
} from "../src/auth/apple-native";
import type { AuthNotice } from "../src/auth/context";
import {
  DELETE_CLOSED,
  canConfirmDelete,
  canResend,
  codeOf,
  deleteReducer,
  errorText,
  focusFor,
  focusForCode,
  formReducer,
  initialForm,
  keepScroll,
  planReset,
  planSubmit,
  remainingSeconds,
  singleFlight,
  submitEnabled,
} from "../src/auth/account-form";
import type { Mode } from "../src/auth/account-form";
import {
  COPY,
  LEGAL_COPY,
  deleteErrorFor,
  errorFor,
  noticeText,
  resetSentText,
  secondsText,
} from "../src/auth/copy";

type Flash = "signedOut" | "deleted";
type ScrollRef = ComponentRef<typeof ScrollView>;
type InputRef = ComponentRef<typeof TextInput>;
type ViewRef = ComponentRef<typeof View>;
/** Standard iOS navigation bar below the status bar. */
const HEADER_HEIGHT = 44;

export default function Account() {
  // Accounts are not part of this build: nothing here is usable.
  if (!FEATURES.accounts) return <Redirect href="/" />;
  return <AccountScreen />;
}

function AccountScreen() {
  const auth = useAuth();
  const router = useRouter();
  const { lang } = useContext(Language);
  const params = useLocalSearchParams<{ from?: string | string[] }>();
  const from = Array.isArray(params.from) ? params.from[0] : params.from;
  const bottom = useBottomInset();
  const scroll = useRef<ScrollRef>(null);
  // The native header covers the top of the scroll view; keep fields below it.
  const keep = useKeepVisible(scroll, useSafeAreaInsets().top + HEADER_HEIGHT);

  // A notice (expired session, unfinished deletion) is taken over once and
  // shown on the signed-out form; the context forgets it.
  const [notice, setNotice] = useState<AuthNotice | null>(null);
  const incoming = auth.notice;
  const clearNotice = auth.clearNotice;
  useEffect(() => {
    if (!incoming) return;
    setNotice(incoming);
    clearNotice();
  }, [incoming]);
  const status = auth.session.status;
  useEffect(() => {
    if (status === "signedIn") setNotice(null);
  }, [status]);

  // "Çıkış yaptın." / "Hesabın silindi." for a few seconds on the signed-out form.
  const [flash, setFlash] = useState<Flash | null>(null);
  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), 6000);
    return () => clearTimeout(id);
  }, [flash]);

  return (
    <ScrollView
      ref={scroll}
      testID="account-screen"
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      automaticallyAdjustKeyboardInsets
      scrollEventThrottle={16}
      onScroll={keep.onScroll}
      style={styles.scroll}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: bottom + Space.xxl },
      ]}
    >
      {auth.session.status === "signedIn" ? (
        <SignedIn
          email={auth.session.email}
          provider={auth.session.provider}
          scroll={scroll}
          keep={keep}
          onSignedOut={() => setFlash("signedOut")}
          onDeleted={() => setFlash("deleted")}
        />
      ) : auth.session.status === "signedOut" ? (
        <SignedOut
          fromWelcome={from === "welcome"}
          notice={notice}
          flash={flash}
          keep={keep}
          onSkip={() => {
            void auth.dismissWelcome();
            goBack(router);
          }}
        />
      ) : (
        <Headline text={COPY.title[lang]} />
      )}
    </ScrollView>
  );
}

// ---- signed out ---------------------------------------------------------------

function SignedOut({
  fromWelcome,
  notice,
  flash,
  keep,
  onSkip,
}: {
  fromWelcome: boolean;
  notice: AuthNotice | null;
  flash: Flash | null;
  keep: Keep;
  onSkip: () => void;
}) {
  const auth = useAuth();
  const { lang } = useContext(Language);
  const { fontScale } = useWindowDimensions();
  const [form, dispatch] = useReducer(formReducer, fromWelcome, (w) =>
    initialForm({ fromWelcome: w }),
  );
  // The latest state, readable from handlers before React has re-rendered.
  const formRef = useRef(form);
  formRef.current = form;
  const [flight] = useState(() => singleFlight());
  const emailRef = useRef<InputRef>(null);
  const passwordRef = useRef<InputRef>(null);
  const pendingFocus = useRef<"email" | "password" | null>(null);
  const consentRow = useRef<ViewRef>(null);
  const [consentHint, setConsentHint] = useState(false);
  const now = useNow(form.waitUntil, form.reset?.resendAt ?? 0);

  // Sign in with Apple: the button only appears where the device can show the sheet.
  const [appleReady, setAppleReady] = useState(false);
  const [appleBusy, setAppleBusy] = useState(false);
  const [appleError, setAppleError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void isAppleAvailable().then((ok) => {
      if (live) setAppleReady(ok);
    });
    return () => {
      live = false;
    };
  }, []);

  // The password is state of this screen only and goes with it; while the app
  // is in the background it is not shown in clear text (app-switcher snapshot).
  useHideOnBackground(() => dispatch({ t: "hide" }));
  useEffect(() => {
    setConsentHint(false);
  }, [form.consent, form.mode]);

  // Focus moves to the field that carries an error once the form is editable again.
  useEffect(() => {
    const field = pendingFocus.current;
    if (!field || form.busy) return;
    pendingFocus.current = null;
    (field === "email" ? emailRef : passwordRef).current?.focus();
  }, [form.busy, form.errors]);

  const emailError = errorText(form.errors.email, lang);
  const passwordError = errorText(form.errors.password, lang);
  const formError = errorText(form.errors.form, lang);
  const resetError = errorText(form.reset?.error ?? null, lang);
  const noticeLine = notice ? noticeText(notice, lang) : null;
  const flashLine = flash
    ? flash === "deleted"
      ? COPY.deletedToast[lang]
      : COPY.signedOutToast[lang]
    : null;
  useAnnounce(
    (consentHint ? LEGAL_COPY.consent[lang] : null) ??
      emailError ??
      passwordError ??
      formError ??
      resetError ??
      (form.reset ? resetSentText(form.reset.email, lang) : null) ??
      flashLine ??
      noticeLine,
  );
  // An error line pushes the button down: keep it above the keyboard.
  useEffect(() => {
    keep.nudge();
  }, [emailError, passwordError, formError]);

  function submit() {
    const plan = planSubmit(formRef.current, Date.now());
    if (!plan.send) {
      if (plan.reason === "invalid") {
        pendingFocus.current = focusFor(plan.errors);
        dispatch({ t: "invalid", errors: plan.errors });
      } else if (plan.reason === "consent") {
        // Return on the password field with the box unticked: show and say what is missing.
        setConsentHint(true);
        keep.reveal(consentRow);
      }
      return;
    }
    dispatch({ t: "start" });
    void flight.run(async () => {
      const password = formRef.current.password;
      try {
        if (plan.kind === "signUp") await auth.signUp(plan.email, password);
        else await auth.signIn(plan.email, password);
        dispatch({ t: "ok" });
      } catch (e) {
        const code = codeOf(e);
        pendingFocus.current = focusForCode(code);
        dispatch({ t: "fail", code, now: Date.now() });
      }
    });
  }

  function signInApple() {
    void flight.run(async () => {
      setAppleBusy(true);
      setAppleError(null);
      try {
        const credential = await signInWithAppleNative();
        if (credential) await auth.signInApple(credential);
      } catch (e) {
        setAppleError(errorFor(codeOf(e), lang).text);
      } finally {
        setAppleBusy(false);
      }
    });
  }

  function forgot() {
    const plan = planReset(formRef.current, Date.now());
    if (!plan.send) {
      if (plan.reason === "invalid") {
        pendingFocus.current = "email";
        dispatch({ t: "invalid", errors: plan.errors });
      }
      return;
    }
    dispatch({ t: "start" });
    void flight.run(async () => {
      try {
        await auth.resetPassword(plan.email, lang);
        dispatch({ t: "resetSent", email: plan.email, now: Date.now() });
      } catch (e) {
        dispatch({ t: "fail", code: codeOf(e), now: Date.now() });
      }
    });
  }

  function resend() {
    const current = formRef.current;
    if (!current.reset || !canResend(current, Date.now())) return;
    const email = current.reset.email;
    dispatch({ t: "resendStart" });
    void flight.run(async () => {
      try {
        await auth.resetPassword(email, lang);
        dispatch({ t: "resendDone", now: Date.now() });
      } catch (e) {
        dispatch({ t: "resendFail", code: codeOf(e), now: Date.now() });
      }
    });
  }

  // ---- B. "check your email"
  if (form.reset) {
    const wait = remainingSeconds(form.reset.resendAt, now);
    return (
      <>
        <Headline text={COPY.resetTitle[lang]} />
        <Text testID="account-reset-sent" style={Type.body}>
          {resetSentText(form.reset.email, lang)}
        </Text>
        {resetError && <FieldError testID="account-error" text={resetError} />}
        <Button
          primary
          testID="account-reset-back"
          label={COPY.resetBack[lang]}
          onPress={() => dispatch({ t: "resetBack" })}
        />
        <Button
          plain
          testID="account-reset-resend"
          label={
            wait > 0
              ? secondsText(COPY.resetResendWait, wait, lang)
              : COPY.resetResend[lang]
          }
          accessibilityLabel={
            wait > 0
              ? secondsText(COPY.resetResendWaitSpoken, wait, lang)
              : COPY.resetResend[lang]
          }
          disabled={!canResend(form, now)}
          busy={form.reset.busy}
          onPress={resend}
        />
      </>
    );
  }

  // ---- A. signed out
  const AppleButton = getAppleButton();
  const appleProps = getAppleButtonProps();
  const signUp = form.mode === "signUp";
  const modes: { value: Mode; label: string; testID: string }[] = [
    {
      value: "signIn",
      label: COPY.modeSignIn[lang],
      testID: "account-mode-signin",
    },
    {
      value: "signUp",
      label: COPY.modeSignUp[lang],
      testID: "account-mode-signup",
    },
  ];
  return (
    <>
      <Headline text={COPY.title[lang]} />
      {flashLine && (
        <StatusLine
          testID="account-status"
          icon="checkmark.circle"
          text={flashLine}
        />
      )}
      {noticeLine && (
        <StatusLine
          testID="account-notice"
          icon="info.circle"
          text={noticeLine}
        />
      )}
      {appleReady && AppleButton && appleProps && (
        <>
          <View
            testID="account-apple-signin"
            style={[styles.apple, appleBusy && styles.appleBusy]}
            pointerEvents={appleBusy ? "none" : "auto"}
            accessibilityState={{ busy: appleBusy }}
          >
            <AppleButton
              buttonType={appleProps.buttonType}
              buttonStyle={appleProps.buttonStyle}
              cornerRadius={Radius.m}
              style={styles.appleButton}
              onPress={signInApple}
            />
          </View>
          {appleError && (
            <FieldError testID="account-apple-error" text={appleError} />
          )}
          <View style={styles.orRow} accessibilityElementsHidden>
            <View style={styles.orLine} />
            <Text testID="account-apple-or" style={styles.orText}>
              {COPY.or[lang]}
            </Text>
            <View style={styles.orLine} />
          </View>
        </>
      )}
      <ModeSwitch
        mode={form.mode}
        options={modes}
        disabled={form.busy}
        stacked={fontScale >= 1.5}
        onChange={(mode) => dispatch({ t: "mode", mode })}
      />
      <View style={styles.fields}>
        <View style={styles.block}>
          <AccountField
            testID="account-email"
            label={COPY.emailLabel[lang]}
            inputRef={emailRef}
            value={form.email}
            onChangeText={(value) =>
              dispatch({ t: "edit", field: "email", value })
            }
            onBlur={() => dispatch({ t: "blurEmail" })}
            onFocus={keep.nudge}
            editable={!form.busy}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            textContentType="username"
            autoComplete="username"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
          {emailError && (
            <FieldError
              testID="account-email-error"
              text={emailError}
              action={
                form.errors.email === "emailInUse"
                  ? {
                      label: COPY.modeSignIn[lang],
                      testID: "account-error-signin",
                      onPress: () => dispatch({ t: "mode", mode: "signIn" }),
                    }
                  : undefined
              }
            />
          )}
        </View>
        <View style={styles.block}>
          {/* Remounted on a mode change so iOS offers the right autofill (saved vs strong password). */}
          <AccountField
            key={form.mode}
            testID="account-password"
            label={COPY.passwordLabel[lang]}
            inputRef={passwordRef}
            value={form.password}
            onChangeText={(value) =>
              dispatch({ t: "edit", field: "password", value })
            }
            onFocus={keep.nudge}
            editable={!form.busy}
            secureTextEntry={!form.reveal}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            textContentType={signUp ? "newPassword" : "password"}
            autoComplete={signUp ? "new-password" : "current-password"}
            passwordRules={signUp ? "minlength: 8; maxlength: 128;" : undefined}
            returnKeyType="go"
            enablesReturnKeyAutomatically
            submitBehavior="blurAndSubmit"
            onSubmitEditing={submit}
            trailing={
              <RevealToggle
                testID="account-password-toggle"
                revealed={form.reveal}
                disabled={form.busy}
                onPress={() => dispatch({ t: "reveal" })}
              />
            }
          />
          {passwordError ? (
            <FieldError testID="account-password-error" text={passwordError} />
          ) : signUp ? (
            <Text style={styles.small}>{COPY.passwordHint[lang]}</Text>
          ) : null}
        </View>
        {!signUp && (
          <Button
            plain
            testID="account-forgot"
            label={COPY.forgot[lang]}
            disabled={form.busy}
            onPress={forgot}
          />
        )}
        {signUp && (
          <View ref={consentRow} collapsable={false} style={styles.block}>
            <Text style={styles.legal}>{LEGAL_COPY.notice[lang]}</Text>
            <ConsentRow
              testID="account-consent"
              text={LEGAL_COPY.consent[lang]}
              attention={consentHint}
              checked={form.consent}
              disabled={form.busy}
              onToggle={() => dispatch({ t: "consent", on: !form.consent })}
            />
          </View>
        )}
      </View>
      <View ref={keep.target} collapsable={false}>
        <Button
          primary
          testID="account-submit"
          label={signUp ? COPY.modeSignUp[lang] : COPY.modeSignIn[lang]}
          accessibilityLabel={
            form.busy
              ? signUp
                ? COPY.busySignUp[lang]
                : COPY.busySignIn[lang]
              : undefined
          }
          busy={form.busy}
          disabled={!submitEnabled(form, now)}
          onPress={submit}
        />
      </View>
      {formError && <FieldError testID="account-error" text={formError} />}
      <Text style={styles.small}>{COPY.value[lang]}</Text>
      <View style={styles.block}>
        <Text style={styles.small}>{COPY.termsLead[lang]}</Text>
        <View style={styles.links}>
          <Button
            plain
            testID="account-terms"
            label={COPY.termsLink[lang]}
            onPress={() => openPage(TERMS_URL)}
          />
          <Button
            plain
            testID="account-privacy"
            label={COPY.privacyLink[lang]}
            onPress={() => openPage(PRIVACY_URL)}
          />
        </View>
      </View>
      {fromWelcome && (
        <Button
          plain
          testID="account-later"
          label={COPY.skip[lang]}
          onPress={onSkip}
        />
      )}
    </>
  );
}

// ---- signed in ----------------------------------------------------------------

function SignedIn({
  email,
  provider,
  scroll,
  keep,
  onSignedOut,
  onDeleted,
}: {
  email: string;
  provider: "apple" | "password";
  scroll: RefObject<ScrollRef | null>;
  keep: Keep;
  onSignedOut: () => void;
  onDeleted: () => void;
}) {
  const auth = useAuth();
  const { lang } = useContext(Language);
  const upper = useUpper();
  const [del, dispatch] = useReducer(deleteReducer, DELETE_CLOSED);
  const delRef = useRef(del);
  delRef.current = del;
  const [flight] = useState(() => singleFlight());
  const passwordRef = useRef<InputRef>(null);

  // The password is state of this screen only and goes with it; while the app
  // is in the background it is not shown in clear text (app-switcher snapshot).
  useHideOnBackground(() => dispatch({ t: "hide" }));

  // Each step of the deletion scrolls into view; the password step takes the focus.
  useEffect(() => {
    if (del.step === "closed") return;
    const id = setTimeout(() => {
      scroll.current?.scrollToEnd({ animated: true });
      if (del.step === "password") passwordRef.current?.focus();
    }, 80);
    return () => clearTimeout(id);
  }, [del.step]);

  const apple = provider === "apple";
  const deleteError = del.error
    ? deleteErrorFor(del.error, lang, provider).text
    : null;
  useAnnounce(
    del.step === "confirm" ? COPY.deleteSheetTitle[lang] : deleteError,
  );

  function signOut() {
    void flight.run(async () => {
      try {
        await auth.signOut();
      } catch {
        // local only; nothing to tell the user
      }
      onSignedOut();
    });
  }

  function confirmDelete() {
    if (apple) {
      if (delRef.current.step !== "confirm" || delRef.current.busy) return;
      dispatch({ t: "startApple" });
    } else {
      if (!canConfirmDelete(delRef.current)) return;
      dispatch({ t: "start" });
    }
    void flight.run(async () => {
      try {
        await auth.deleteAccount(apple ? undefined : delRef.current.password);
        onDeleted();
        dispatch({ t: "done" });
      } catch (e) {
        dispatch({ t: "fail", code: codeOf(e) });
      }
    });
  }

  return (
    <>
      <Headline text={COPY.title[lang]} />
      <View style={styles.block}>
        <Text
          accessibilityElementsHidden
          importantForAccessibility="no"
          style={s.caps}
        >
          {upper(COPY.emailLabel[lang])}
        </Text>
        <Text
          testID="account-signed-email"
          selectable
          accessibilityLabel={`${COPY.emailLabel[lang]}: ${email}`}
          style={Type.body}
        >
          {email || COPY.appleEmailHidden[lang]}
        </Text>
        <Text
          testID={apple ? "account-provider-apple" : "account-provider-password"}
          style={styles.small}
        >
          {apple ? COPY.providerApple[lang] : COPY.providerPassword[lang]}
        </Text>
      </View>
      <Text style={styles.small}>{COPY.value[lang]}</Text>
      <Button
        testID="account-signout"
        label={COPY.signOut[lang]}
        disabled={del.busy}
        onPress={signOut}
      />
      <View style={styles.dangerZone}>
        {del.step === "closed" && (
          <Button
            plain
            danger
            testID="account-delete"
            label={COPY.deleteButton[lang]}
            onPress={() => dispatch({ t: "open" })}
          />
        )}
        {del.step === "confirm" && (
          <View style={styles.panel}>
            <Text accessibilityRole="header" style={Type.title}>
              {COPY.deleteSheetTitle[lang]}
            </Text>
            <Text style={Type.body}>{COPY.deleteSheetBody[lang]}</Text>
            {apple && <Text style={Type.body}>{COPY.deleteAppleBody[lang]}</Text>}
            {apple && deleteError && (
              <FieldError testID="account-delete-error" text={deleteError} />
            )}
            <Button
              danger
              testID="account-delete-continue"
              label={apple ? COPY.deleteConfirm[lang] : COPY.deleteContinue[lang]}
              accessibilityLabel={
                apple && del.busy ? COPY.busyDelete[lang] : undefined
              }
              busy={apple && del.busy}
              disabled={del.busy}
              onPress={apple ? confirmDelete : () => dispatch({ t: "next" })}
            />
            <Button
              plain
              testID="account-delete-cancel"
              label={COPY.deleteCancel[lang]}
              disabled={del.busy}
              onPress={() => dispatch({ t: "cancel" })}
            />
          </View>
        )}
        {del.step === "password" && (
          <View style={styles.panel}>
            <Text accessibilityRole="header" style={Type.title}>
              {COPY.deletePasswordPrompt[lang]}
            </Text>
            <AccountField
              testID="account-delete-password"
              label={COPY.passwordLabel[lang]}
              inputRef={passwordRef}
              value={del.password}
              onChangeText={(value) => dispatch({ t: "edit", value })}
              onFocus={keep.nudge}
              editable={!del.busy}
              secureTextEntry={!del.reveal}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              textContentType="password"
              autoComplete="current-password"
              returnKeyType="go"
              enablesReturnKeyAutomatically
              submitBehavior="blurAndSubmit"
              onSubmitEditing={confirmDelete}
              trailing={
                <RevealToggle
                  testID="account-delete-toggle"
                  revealed={del.reveal}
                  disabled={del.busy}
                  onPress={() => dispatch({ t: "reveal" })}
                />
              }
            />
            {deleteError && (
              <FieldError testID="account-delete-error" text={deleteError} />
            )}
            <View ref={keep.target} collapsable={false}>
              <Button
                danger
                testID="account-delete-confirm"
                label={COPY.deleteConfirm[lang]}
                accessibilityLabel={
                  del.busy ? COPY.busyDelete[lang] : undefined
                }
                busy={del.busy}
                disabled={!canConfirmDelete(del)}
                onPress={confirmDelete}
              />
            </View>
            <Button
              plain
              testID="account-delete-cancel"
              label={COPY.deleteCancel[lang]}
              disabled={del.busy}
              onPress={() => dispatch({ t: "cancel" })}
            />
          </View>
        )}
      </View>
    </>
  );
}

// ---- pieces -------------------------------------------------------------------

function Headline({ text }: { text: string }) {
  const upper = useUpper();
  return (
    <Text
      accessibilityRole="header"
      maxFontSizeMultiplier={MaxScale.largeTitle}
      style={styles.headline}
    >
      {upper(text)}
    </Text>
  );
}

/** Inline problem: icon + ink text (never colour alone), read out by VoiceOver. */
function FieldError({
  text,
  testID,
  action,
}: {
  text: string;
  testID: string;
  action?: { label: string; testID: string; onPress: () => void };
}) {
  return (
    <View style={styles.line}>
      <Icon name="exclamationmark.circle" size={15} color={Theme.danger} />
      <View style={styles.lineBody}>
        <Text
          testID={testID}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={styles.lineText}
        >
          {text}
        </Text>
        {action && (
          <Button
            plain
            testID={action.testID}
            label={action.label}
            onPress={action.onPress}
          />
        )}
      </View>
    </View>
  );
}

function StatusLine({
  text,
  testID,
  icon,
}: {
  text: string;
  testID: string;
  icon: IconName;
}) {
  return (
    <View style={styles.line}>
      <Icon name={icon} size={15} color={Theme.text} />
      <View style={styles.lineBody}>
        <Text
          testID={testID}
          accessibilityLiveRegion="polite"
          style={styles.lineText}
        >
          {text}
        </Text>
      </View>
    </View>
  );
}

/**
 * A text field in the look of the kit's Field (underlined, accent fill while
 * focused), with what Field cannot do: a ref for the Return-key chain and a
 * control inside the field's row (show / hide password).
 */
function AccountField({
  label,
  inputRef,
  trailing,
  onFocus,
  onBlur,
  ...rest
}: Omit<TextInputProps, "style"> & {
  label: string;
  inputRef?: Ref<InputRef>;
  trailing?: ReactNode;
}) {
  const upper = useUpper();
  const [focused, setFocused] = useState(false);
  return (
    <View style={[s.fieldWrap, focused && s.fieldFocused]}>
      <Text
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={[s.caps, focused && { color: Theme.onAccent }]}
      >
        {upper(label)}
      </Text>
      <View style={styles.inputRow}>
        <TextInput
          ref={inputRef}
          accessibilityLabel={label}
          placeholderTextColor={focused ? Theme.text : Theme.muted}
          selectionColor={Theme.text}
          {...rest}
          style={[s.input, styles.inputFlex]}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
        />
        {trailing}
      </View>
    </View>
  );
}

function RevealToggle({
  revealed,
  onPress,
  testID,
  disabled,
}: {
  revealed: boolean;
  onPress: () => void;
  testID: string;
  disabled: boolean;
}) {
  const { lang } = useContext(Language);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={
        revealed ? COPY.hideSpoken[lang] : COPY.showSpoken[lang]
      }
      accessibilityState={{ checked: revealed, disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.reveal, pressed && Press.text]}
    >
      <Text maxFontSizeMultiplier={MaxScale.chrome} style={styles.revealText}>
        {revealed ? COPY.hide[lang] : COPY.show[lang]}
      </Text>
    </Pressable>
  );
}

/** Two options, 44 pt each, stacked from Dynamic Type 1.5x; the chosen one is outlined and bold. */
function ModeSwitch({
  mode,
  options,
  disabled,
  stacked,
  onChange,
}: {
  mode: Mode;
  options: { value: Mode; label: string; testID: string }[];
  disabled: boolean;
  stacked: boolean;
  onChange: (mode: Mode) => void;
}) {
  return (
    <View style={[styles.track, stacked && styles.trackStacked]}>
      {options.map((option) => {
        const selected = option.value === mode;
        return (
          <Pressable
            key={option.value}
            testID={option.testID}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => {
              if (selected) return;
              tap("select");
              onChange(option.value);
            }}
            style={[
              styles.segment,
              !stacked && styles.segmentRow,
              selected && styles.segmentOn,
            ]}
          >
            <Text
              maxFontSizeMultiplier={MaxScale.chrome}
              style={[styles.segmentText, selected && styles.segmentTextOn]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ConsentRow({
  text,
  checked,
  attention,
  disabled,
  onToggle,
  testID,
}: {
  text: string;
  checked: boolean;
  attention: boolean;
  disabled: boolean;
  onToggle: () => void;
  testID: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityLabel={text}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => {
        tap("select");
        onToggle();
      }}
      style={({ pressed }) => [styles.consent, pressed && Press.text]}
    >
      <View
        style={[
          styles.box,
          checked && styles.boxOn,
          attention && !checked && styles.boxAttention,
        ]}
      >
        {checked && (
          <Icon name="checkmark" size={14} color={Theme.accent} weight="bold" />
        )}
      </View>
      <Text style={styles.consentText}>{text}</Text>
    </Pressable>
  );
}

// ---- hooks --------------------------------------------------------------------

type Keep = ReturnType<typeof useKeepVisible>;

/**
 * Keeps one view (the submit button) above the keyboard. The native keyboard
 * handling only guarantees the focused field; this scrolls a little further
 * when the button is still covered, but never so far that the focused field
 * leaves the screen (keepScroll). Only ever scrolls down, never past the
 * content (scrollTo clamps), and does nothing without a keyboard.
 * `topEdge` is the window y below which content is visible (under the header).
 */
function useKeepVisible(scroll: RefObject<ScrollRef | null>, topEdge: number) {
  const target = useRef<ViewRef>(null);
  const offset = useRef(0);
  const keyboardTop = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const edge = useRef(topEdge);
  edge.current = topEdge;
  const work = useRef(() => {});
  work.current = () => {
    const top = keyboardTop.current;
    const view = target.current;
    const list = scroll.current;
    if (top === null || !view || !list) return;
    view.measureInWindow((_x, y, _w, h) => {
      if (!h) return;
      const over = y + h + Space.l - top;
      if (over <= 1) return;
      const scrollBy = (delta: number) => {
        if (delta > 1)
          list.scrollTo({ y: offset.current + delta, animated: true });
      };
      const input = TextInput.State.currentlyFocusedInput();
      if (!input) return scrollBy(over);
      input.measureInWindow((_ix, inputTop) =>
        scrollBy(keepScroll(over, inputTop, edge.current, Space.m)),
      );
    });
  };
  const later = (ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => work.current(), ms);
  };
  useEffect(() => {
    const shown = Keyboard.addListener("keyboardDidShow", (e) => {
      keyboardTop.current = e.endCoordinates.screenY;
      later(60);
    });
    const moved = Keyboard.addListener("keyboardDidChangeFrame", (e) => {
      if (keyboardTop.current !== null)
        keyboardTop.current = e.endCoordinates.screenY;
    });
    const hidden = Keyboard.addListener("keyboardDidHide", () => {
      keyboardTop.current = null;
    });
    return () => {
      shown.remove();
      moved.remove();
      hidden.remove();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  return {
    target,
    onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      offset.current = e.nativeEvent.contentOffset.y;
    },
    /** Call after a layout change or a focus change while the keyboard is up. */
    nudge: () => later(120),
    /** Scrolls a view fully into the visible area once the keyboard has gone. */
    reveal: (view: RefObject<ViewRef | null>) => {
      setTimeout(() => {
        const node = view.current;
        const list = scroll.current;
        if (!node || !list) return;
        list.measureInWindow((_lx, ly, _lw, lh) => {
          node.measureInWindow((_x, y, _w, h) => {
            const upper = Math.max(ly, edge.current) + Space.m;
            const lower = ly + lh - Space.m;
            const delta =
              y < upper ? y - upper : y + h > lower ? y + h - lower : 0;
            if (Math.abs(delta) > 1)
              list.scrollTo({ y: offset.current + delta, animated: true });
          });
        });
      }, 350);
    },
  };
}

/** Runs `hide` whenever the app leaves the foreground (inactive or background). */
function useHideOnBackground(hide: () => void) {
  const latest = useRef(hide);
  latest.current = hide;
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") latest.current();
    });
    return () => sub.remove();
  }, []);
}

/** Wall clock that ticks once a second while any of the given instants is still ahead. */
function useNow(...untils: number[]): number {
  const [now, setNow] = useState(() => Date.now());
  const active = untils.some((until) => until > now);
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

// ---- styles (tokens only; no raw colours) ----------------------------------------

const label13 = {
  fontFamily: Face.medium,
  fontSize: 13,
  lineHeight: 18,
  fontWeight: "500" as const,
};

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: Theme.bg },
  content: {
    paddingHorizontal: Space.gutter,
    paddingTop: Space.s,
    gap: Space.l,
  },
  headline: { ...Type.display, ...displayMetrics(34, MaxScale.largeTitle) },
  fields: { gap: Space.l },
  block: { gap: Space.xs },
  links: { flexDirection: "row", flexWrap: "wrap", columnGap: Space.xl },
  small: { ...label13, color: Theme.muted },
  legal: {
    fontFamily: Face.medium,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
    color: Theme.muted,
  },
  line: { flexDirection: "row", gap: Space.s, alignItems: "flex-start" },
  lineBody: { flex: 1, gap: Space.xs },
  lineText: { ...label13, color: Theme.text },
  inputRow: { flexDirection: "row", alignItems: "center" },
  inputFlex: { flex: 1 },
  reveal: {
    minHeight: 44,
    minWidth: 44,
    paddingLeft: Space.s,
    justifyContent: "center",
    alignItems: "flex-end",
  },
  revealText: {
    fontFamily: Face.bold,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
    color: Theme.text,
    textDecorationLine: "underline",
  },
  track: {
    padding: 2,
    gap: 2,
    flexDirection: "row",
    borderRadius: Radius.m,
    backgroundColor: Theme.raised,
  },
  trackStacked: { flexDirection: "column" },
  apple: { minHeight: 48 },
  appleBusy: { opacity: 0.5 },
  appleButton: { width: "100%", height: 48 },
  orRow: { flexDirection: "row", alignItems: "center", gap: Space.m },
  orLine: { flex: 1, height: 1, backgroundColor: Theme.raised },
  orText: { ...label13, color: Theme.muted },
  segment: {
    minHeight: 44,
    paddingHorizontal: Space.m,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.m - 2,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  segmentRow: { flex: 1 },
  segmentOn: { backgroundColor: Theme.bg, borderColor: Theme.text },
  segmentText: {
    fontFamily: Face.bold,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
    color: Theme.muted,
    textAlign: "center",
  },
  segmentTextOn: {
    fontFamily: Face.extra,
    fontWeight: "800",
    color: Theme.text,
  },
  consent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.m,
    minHeight: 48,
  },
  box: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: Theme.text,
    alignItems: "center",
    justifyContent: "center",
  },
  boxOn: { backgroundColor: Theme.text },
  boxAttention: { borderColor: Theme.danger, borderWidth: 3 },
  consentText: {
    ...label13,
    flex: 1,
    color: Theme.text,
    fontSize: 14,
    lineHeight: 19,
  },
  dangerZone: { marginTop: Space.xl },
  panel: {
    gap: Space.m,
    paddingTop: Space.l,
    borderTopWidth: 1,
    borderTopColor: Theme.line,
  },
});
