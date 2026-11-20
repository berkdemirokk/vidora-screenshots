/**
 * State machine and validation glue of app/account.tsx. Pure: no React, no
 * expo, no clock (callers pass `now`), so node --test runs it offline. The
 * password lives in this state only for as long as the screen needs it and is
 * dropped on a successful submit, on a mode change and on any reset.
 *
 * Error placement follows copy.ts (ERROR_FIELD): the state keeps the error
 * CASE per place (email, password, form), never a Firebase code and never a
 * text; the screen looks the text up in the current language when it draws.
 */
import { LIMITS } from "./config.ts";
import { ERROR_FIELD, ERROR_TEXT, CASE_OF_CODE } from "./copy.ts";
import type { ErrorCase, ErrorField, Lang } from "./copy.ts";
import {
  AuthError,
  validateEmail,
  validatePassword,
  normalizeEmail,
} from "./firebase-rest.ts";
import type { AuthErrorCode } from "./firebase-rest.ts";

export type Mode = "signIn" | "signUp";

export type Errors = Record<ErrorField, ErrorCase | null>;
export const NO_ERRORS: Errors = { email: null, password: null, form: null };

/** The "check your email" state (plan.md section 2, item 8). */
export type ResetState = {
  /** The normalized address the link was sent to. */
  email: string;
  /** Epoch ms from which "Tekrar gönder" is enabled again. */
  resendAt: number;
  busy: boolean;
  error: ErrorCase | null;
};

export type FormState = {
  mode: Mode;
  email: string;
  password: string;
  /** Sign-up only: the unticked, mandatory consent box. */
  consent: boolean;
  /** Password shown in clear text. */
  reveal: boolean;
  /** A request (sign in, sign up or reset mail) is running. */
  busy: boolean;
  errors: Errors;
  /** Submit stays off until this epoch ms after "too many attempts" (0 = none). */
  waitUntil: number;
  reset: ResetState | null;
};

export function initialForm(opts: { fromWelcome?: boolean } = {}): FormState {
  return {
    mode: opts.fromWelcome ? "signUp" : "signIn",
    email: "",
    password: "",
    consent: false,
    reveal: false,
    busy: false,
    errors: NO_ERRORS,
    waitUntil: 0,
    reset: null,
  };
}

// ---- helpers ----------------------------------------------------------------

/** The error code of anything a call threw; unexpected values are "unknown". */
export function codeOf(e: unknown): AuthErrorCode {
  return e instanceof AuthError ? e.code : "unknown";
}

/** Whole seconds left until `until` (0 when due). Rounds up so 0.2 s reads as 1. */
export function remainingSeconds(until: number, now: number): number {
  return until > now ? Math.ceil((until - now) / 1000) : 0;
}

export function errorText(c: ErrorCase | null, lang: Lang): string | null {
  return c ? ERROR_TEXT[c][lang] : null;
}

/** Puts one error where copy.ts says it belongs and nowhere else. */
export function placeError(c: ErrorCase): Errors {
  return { ...NO_ERRORS, [ERROR_FIELD[c]]: c };
}

/** Which field the screen focuses for an error (none for form-level ones). */
export function focusFor(errors: Errors): "email" | "password" | null {
  if (errors.email) return "email";
  if (errors.password) return "password";
  return null;
}

/** The field to focus after a failed request with this code. */
export function focusForCode(code: AuthErrorCode): "email" | "password" | null {
  return focusFor(placeError(CASE_OF_CODE[code] ?? "generic"));
}

/** The submit button is usable: nothing running, no wait, and the rule of the mode met. */
export function submitEnabled(s: FormState, now: number): boolean {
  if (s.busy) return false;
  if (remainingSeconds(s.waitUntil, now) > 0) return false;
  // Sign-up stays tappable without the consent box (KVKK, plan.md item 11):
  // submit() then shows the consent hint instead of doing nothing.
  if (s.mode === "signUp") return true;
  // Sign-in: an empty password is not sent (an older password may be short, so no length rule).
  return s.password.length > 0;
}

export function canResend(s: FormState, now: number): boolean {
  const r = s.reset;
  return !!r && !r.busy && remainingSeconds(r.resendAt, now) === 0;
}

// ---- submit planning --------------------------------------------------------

export type SubmitPlan =
  | {
      send: false;
      reason: "busy" | "wait" | "consent" | "invalid";
      errors: Errors;
    }
  | { send: true; kind: Mode; email: string };

/**
 * Decides what a press of the submit button (or the password Return key)
 * does. Order: a running request, the wait after too many attempts, the
 * consent box (sign-up), then field validation (email first). The password
 * length rule (8..128) applies to sign-up only.
 */
export function planSubmit(s: FormState, now: number): SubmitPlan {
  if (s.busy) return { send: false, reason: "busy", errors: s.errors };
  if (remainingSeconds(s.waitUntil, now) > 0)
    return { send: false, reason: "wait", errors: s.errors };
  if (s.mode === "signUp" && !s.consent)
    return { send: false, reason: "consent", errors: s.errors };
  const email = validateEmail(s.email);
  const pw =
    s.mode === "signUp" ? validatePassword(s.password, "signUp") : null;
  if (email || pw) {
    return {
      send: false,
      reason: "invalid",
      errors: {
        email: email ? CASE_OF_CODE[email] : null,
        password: pw ? CASE_OF_CODE[pw] : null,
        form: null,
      },
    };
  }
  if (s.mode === "signIn" && s.password.length === 0)
    return { send: false, reason: "invalid", errors: s.errors };
  return { send: true, kind: s.mode, email: normalizeEmail(s.email) };
}

/** "Şifremi unuttum": only a well-formed address is sent a reset mail. */
export type ResetPlan =
  | { send: false; reason: "busy" | "wait" | "invalid"; errors: Errors }
  | { send: true; email: string };

export function planReset(s: FormState, now: number): ResetPlan {
  if (s.busy) return { send: false, reason: "busy", errors: s.errors };
  if (remainingSeconds(s.waitUntil, now) > 0)
    return { send: false, reason: "wait", errors: s.errors };
  const email = validateEmail(s.email);
  if (email)
    return {
      send: false,
      reason: "invalid",
      errors: placeError(CASE_OF_CODE[email]),
    };
  return { send: true, email: normalizeEmail(s.email) };
}

// ---- reducer ----------------------------------------------------------------

export type FormAction =
  | { t: "mode"; mode: Mode }
  | { t: "edit"; field: "email" | "password"; value: string }
  | { t: "blurEmail" }
  | { t: "consent"; on: boolean }
  | { t: "reveal" }
  /** The planned request starts (clears errors, locks the form). */
  | { t: "start" }
  /** A plan was refused because of validation: show its errors. */
  | { t: "invalid"; errors: Errors }
  | { t: "fail"; code: AuthErrorCode; now: number }
  | { t: "ok" }
  | { t: "resetSent"; email: string; now: number }
  | { t: "resendStart" }
  | { t: "resendDone"; now: number }
  | { t: "resendFail"; code: AuthErrorCode; now: number }
  | { t: "resetBack" }
  /** The app left the foreground: the password must not sit in clear text in the app-switcher snapshot. */
  | { t: "hide" };

const waitFrom = (now: number) =>
  now + LIMITS.tooManyAttemptsCooldownSec * 1000;

export function formReducer(s: FormState, a: FormAction): FormState {
  switch (a.t) {
    case "mode": {
      if (a.mode === s.mode || s.busy) return s;
      // The e-mail stays (an "already registered" error offers exactly this
      // switch); everything else starts fresh: the password field is remounted
      // by the screen for the right autofill type, the box is unticked again.
      return {
        ...initialForm(),
        mode: a.mode,
        email: s.email,
        waitUntil: s.waitUntil,
      };
    }
    case "edit": {
      const errors: Errors = { ...s.errors };
      errors[a.field] = null;
      // "Email or password is wrong" belongs to both fields.
      if (a.field === "email" && errors.password === "badCredentials")
        errors.password = null;
      if (errors.form !== "tooManyAttempts") errors.form = null;
      return a.field === "email"
        ? { ...s, email: a.value, errors }
        : { ...s, password: a.value, errors };
    }
    case "blurEmail": {
      if (s.email.trim() === "") {
        return s.errors.email === "invalidEmail"
          ? { ...s, errors: { ...s.errors, email: null } }
          : s;
      }
      const bad = validateEmail(s.email);
      if (bad)
        return { ...s, errors: { ...s.errors, email: CASE_OF_CODE[bad] } };
      return s.errors.email === "invalidEmail"
        ? { ...s, errors: { ...s.errors, email: null } }
        : s;
    }
    case "consent":
      return s.mode === "signUp" ? { ...s, consent: a.on } : s;
    case "reveal":
      return { ...s, reveal: !s.reveal };
    case "start":
      return s.busy ? s : { ...s, busy: true, errors: NO_ERRORS };
    case "invalid":
      return { ...s, errors: a.errors };
    case "fail": {
      const c = CASE_OF_CODE[a.code] ?? "generic";
      return {
        ...s,
        busy: false,
        errors: placeError(c),
        waitUntil: c === "tooManyAttempts" ? waitFrom(a.now) : s.waitUntil,
      };
    }
    case "ok":
      // Success: the secret goes first, and the rest of the form is reset.
      return { ...initialForm(), mode: s.mode, email: s.email, reset: null };
    case "resetSent":
      return {
        ...s,
        busy: false,
        password: "",
        reveal: false,
        errors: NO_ERRORS,
        reset: {
          email: a.email,
          resendAt: a.now + LIMITS.resetResendCooldownSec * 1000,
          busy: false,
          error: null,
        },
      };
    case "resendStart":
      return s.reset && !s.reset.busy
        ? { ...s, reset: { ...s.reset, busy: true, error: null } }
        : s;
    case "resendDone":
      return s.reset
        ? {
            ...s,
            reset: {
              ...s.reset,
              busy: false,
              error: null,
              resendAt: a.now + LIMITS.resetResendCooldownSec * 1000,
            },
          }
        : s;
    case "resendFail": {
      if (!s.reset) return s;
      const c = CASE_OF_CODE[a.code] ?? "generic";
      return {
        ...s,
        reset: {
          ...s.reset,
          busy: false,
          error: c,
          // Rate limited: wait; a lost connection may retry at once.
          resendAt:
            c === "tooManyAttempts" ? waitFrom(a.now) : s.reset.resendAt,
        },
      };
    }
    case "resetBack":
      return {
        ...initialForm(),
        mode: "signIn",
        email: s.email,
        waitUntil: s.waitUntil,
      };
    case "hide":
      return s.reveal ? { ...s, reveal: false } : s;
  }
}

// ---- deleting the account (ux.md section 2 D, plan.md item 9) ---------------

/**
 * account-delete, then the sheet (account-delete-continue), then the password
 * (account-delete-password, account-delete-confirm).
 */
export type DeleteStep = "closed" | "confirm" | "password";

export type DeleteState = {
  step: DeleteStep;
  password: string;
  reveal: boolean;
  busy: boolean;
  /** The code of the last failure; the screen turns it into text (deleteErrorFor). */
  error: AuthErrorCode | null;
};

export const DELETE_CLOSED: DeleteState = {
  step: "closed",
  password: "",
  reveal: false,
  busy: false,
  error: null,
};

export type DeleteAction =
  | { t: "open" }
  | { t: "next" }
  | { t: "cancel" }
  | { t: "edit"; value: string }
  | { t: "reveal" }
  | { t: "hide" }
  | { t: "start" }
  /** Apple users have no password: the deletion starts from the confirm step. */
  | { t: "startApple" }
  | { t: "fail"; code: AuthErrorCode }
  | { t: "done" };

export function canConfirmDelete(d: DeleteState): boolean {
  return d.step === "password" && !d.busy && d.password.length > 0;
}

export function deleteReducer(d: DeleteState, a: DeleteAction): DeleteState {
  switch (a.t) {
    case "open":
      return d.step === "closed" ? { ...DELETE_CLOSED, step: "confirm" } : d;
    case "next":
      return d.step === "confirm" ? { ...d, step: "password", error: null } : d;
    case "cancel":
      // A running deletion cannot be cancelled from the screen.
      return d.busy ? d : DELETE_CLOSED;
    case "edit":
      return d.step === "password" && !d.busy
        ? { ...d, password: a.value, error: null }
        : d;
    case "reveal":
      return d.step === "password" ? { ...d, reveal: !d.reveal } : d;
    case "hide":
      return d.reveal ? { ...d, reveal: false } : d;
    case "start":
      return canConfirmDelete(d) ? { ...d, busy: true, error: null } : d;
    case "startApple":
      return d.step === "confirm" && !d.busy
        ? { ...d, busy: true, error: null }
        : d;
    case "fail":
      return d.busy ? { ...d, busy: false, error: a.code } : d;
    case "done":
      return DELETE_CLOSED;
  }
}

// ---- keyboard assist ----------------------------------------------------------

/**
 * How far to scroll (pt, downwards) to lift the submit button above the
 * keyboard without pushing the focused field out of sight. `over` is how far
 * the button is covered; the focused field may move up only as far as
 * `viewportTop + margin`. The field always wins; the button stays reachable by
 * scrolling.
 */
export function keepScroll(
  over: number,
  inputTop: number,
  viewportTop: number,
  margin: number,
): number {
  return Math.max(0, Math.min(over, inputTop - viewportTop - margin));
}

// ---- double-submit guard ----------------------------------------------------

/**
 * Runs one job at a time. A second call while one is running does nothing
 * (resolves to undefined) and never starts the job: state updates arrive a
 * frame late, a ref-like guard does not.
 */
export function singleFlight() {
  let running = false;
  return {
    get running() {
      return running;
    },
    async run<T>(job: () => Promise<T>): Promise<T | undefined> {
      if (running) return undefined;
      running = true;
      try {
        return await job();
      } finally {
        running = false;
      }
    },
  };
}
