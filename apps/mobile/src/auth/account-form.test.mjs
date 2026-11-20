// Run with: node --test apps/mobile/src/auth/*.test.mjs  (pure: no clock, no network)
import assert from "node:assert/strict";
import test from "node:test";
import {
  DELETE_CLOSED,
  NO_ERRORS,
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
  placeError,
  planReset,
  planSubmit,
  remainingSeconds,
  singleFlight,
  submitEnabled,
} from "./account-form.ts";
import { LIMITS } from "./config.ts";
import {
  COPY,
  ERROR_TEXT,
  LEGAL_COPY,
  deleteErrorFor,
  secondsText,
} from "./copy.ts";
import { AUTH_ERROR_CODES, AuthError } from "./firebase-rest.ts";

const NOW = 1_000_000;
const run = (s, ...actions) => actions.reduce(formReducer, s);
const typed = (s, email, password) =>
  run(
    s,
    { t: "edit", field: "email", value: email },
    { t: "edit", field: "password", value: password },
  );
const GOOD_PW = "correct horse";

// ---- mode switch -------------------------------------------------------------

test("default mode: sign-in from Settings, sign-up from the welcome row", () => {
  assert.equal(initialForm().mode, "signIn");
  assert.equal(initialForm({ fromWelcome: true }).mode, "signUp");
  assert.equal(initialForm().consent, false, "never pre-ticked");
});

test("mode switch keeps the email, drops the password, errors, reveal and consent", () => {
  let s = initialForm({ fromWelcome: true });
  s = run(
    s,
    { t: "edit", field: "email", value: "A@B.co" },
    { t: "edit", field: "password", value: GOOD_PW },
  );
  s = run(s, { t: "consent", on: true }, { t: "reveal" });
  s = { ...s, errors: placeError("emailInUse") };
  const next = run(s, { t: "mode", mode: "signIn" });
  assert.equal(next.mode, "signIn");
  assert.equal(next.email, "A@B.co");
  assert.equal(next.password, "");
  assert.equal(next.reveal, false);
  assert.equal(next.consent, false);
  assert.deepEqual(next.errors, NO_ERRORS);
  // Back to sign-up: the box is unticked again.
  assert.equal(run(next, { t: "mode", mode: "signUp" }).consent, false);
});

test("a mode switch to the same mode, or while a request runs, changes nothing", () => {
  const s = typed(initialForm(), "a@b.co", "x");
  assert.equal(formReducer(s, { t: "mode", mode: "signIn" }), s);
  const busy = { ...s, busy: true };
  assert.equal(formReducer(busy, { t: "mode", mode: "signUp" }), busy);
});

test("the wait after too many attempts survives a mode switch", () => {
  let s = run(
    typed(initialForm(), "a@b.co", "x"),
    { t: "start" },
    { t: "fail", code: "tooManyAttempts", now: NOW },
  );
  s = run(s, { t: "mode", mode: "signUp" });
  assert.ok(s.waitUntil > NOW);
});

// ---- consent only for sign-up ------------------------------------------------

test("consent is required for sign-up and never for sign-in", () => {
  let up = typed(initialForm({ fromWelcome: true }), "a@b.co", GOOD_PW);
  assert.equal(submitEnabled(up, NOW), true);
  assert.deepEqual(planSubmit(up, NOW), {
    send: false,
    reason: "consent",
    errors: NO_ERRORS,
  });
  up = run(up, { t: "consent", on: true });
  assert.equal(submitEnabled(up, NOW), true);
  assert.deepEqual(planSubmit(up, NOW), {
    send: true,
    kind: "signUp",
    email: "a@b.co",
  });

  const inn = typed(initialForm(), "a@b.co", "x");
  assert.equal(inn.consent, false);
  assert.equal(submitEnabled(inn, NOW), true);
  assert.deepEqual(planSubmit(inn, NOW), {
    send: true,
    kind: "signIn",
    email: "a@b.co",
  });
  // The box cannot be ticked in sign-in mode.
  assert.equal(run(inn, { t: "consent", on: true }).consent, false);
});

test("password length 8..128 is checked on sign-up only", () => {
  const base = run(initialForm({ fromWelcome: true }), {
    t: "consent",
    on: true,
  });
  const plan = (pw) => planSubmit(typed(base, "a@b.co", pw), NOW);
  assert.equal(plan("1234567").send, false);
  assert.equal(plan("1234567").errors.password, "weakPassword");
  assert.equal(plan("12345678").send, true);
  assert.equal(plan("x".repeat(LIMITS.passwordMax)).send, true);
  assert.equal(
    plan("x".repeat(LIMITS.passwordMax + 1)).errors.password,
    "weakPassword",
  );
  // Sign-in: an old, short password must still go through.
  assert.equal(
    planSubmit(typed(initialForm(), "a@b.co", "abc"), NOW).send,
    true,
  );
  // Passwords are never trimmed.
  assert.equal(plan("      x").send, false); // 7 characters, spaces count
  assert.equal(plan("        ").send, true);
});

test("e-mail is validated on submit (and on blur) and sent normalized", () => {
  const s = typed(initialForm(), "  Name@Site.COM ", "pw");
  assert.deepEqual(planSubmit(s, NOW), {
    send: true,
    kind: "signIn",
    email: "name@site.com",
  });
  const bad = planSubmit(typed(initialForm(), "nope", "pw"), NOW);
  assert.equal(bad.send, false);
  assert.equal(bad.reason, "invalid");
  assert.equal(bad.errors.email, "invalidEmail");
  assert.equal(focusFor(bad.errors), "email");
  // Blur: shape error shown, nagging on an empty field is not.
  assert.equal(
    run(
      initialForm(),
      { t: "edit", field: "email", value: "nope" },
      { t: "blurEmail" },
    ).errors.email,
    "invalidEmail",
  );
  assert.equal(run(initialForm(), { t: "blurEmail" }).errors.email, null);
  const fixed = run(
    initialForm(),
    { t: "edit", field: "email", value: "nope" },
    { t: "blurEmail" },
    { t: "edit", field: "email", value: "a@b.co" },
  );
  assert.equal(fixed.errors.email, null);
});

// ---- error placement ---------------------------------------------------------

test("every server code lands under the field the plan assigns", () => {
  const where = {
    badCredentials: "password",
    invalidEmail: "email",
    emailInUse: "email",
    weakPassword: "password",
    tooManyAttempts: "form",
    offline: "form",
    appleFailed: "form",
    appleRejected: "form",
    timeout: "form",
    disabled: "form",
    unknown: "form",
    sessionExpired: "form",
    needsRecentLogin: "form",
  };
  assert.deepEqual(Object.keys(where).sort(), [...AUTH_ERROR_CODES].sort());
  for (const code of AUTH_ERROR_CODES) {
    const s = run(
      typed(initialForm(), "a@b.co", "x"),
      { t: "start" },
      { t: "fail", code, now: NOW },
    );
    const placed = Object.entries(s.errors).filter(([, v]) => v !== null);
    assert.equal(placed.length, 1, code);
    assert.equal(placed[0][0], where[code], code);
    assert.equal(s.busy, false);
    // Text exists in both languages and carries no Firebase code.
    for (const lang of ["tr", "en"]) {
      const text = errorText(placed[0][1], lang);
      assert.ok(text && text.length > 10);
      assert.doesNotMatch(text, /[A-Z]{3,}_[A-Z_]{3,}/);
    }
  }
});

test("focus after a failed request goes to the field that carries the error", () => {
  assert.equal(focusForCode("badCredentials"), "password");
  assert.equal(focusForCode("weakPassword"), "password");
  assert.equal(focusForCode("emailInUse"), "email");
  assert.equal(focusForCode("invalidEmail"), "email");
  for (const code of [
    "offline",
    "timeout",
    "tooManyAttempts",
    "unknown",
    "disabled",
  ])
    assert.equal(focusForCode(code), null, code);
});

test("a failed request keeps the typed e-mail and password, and focus follows the field", () => {
  const s = run(
    typed(initialForm(), "a@b.co", "secret"),
    { t: "start" },
    { t: "fail", code: "badCredentials", now: NOW },
  );
  assert.equal(s.email, "a@b.co");
  assert.equal(s.password, "secret");
  assert.equal(focusFor(s.errors), "password");
  assert.equal(
    errorText(s.errors.password, "tr"),
    ERROR_TEXT.badCredentials.tr,
  );
  assert.equal(
    focusFor(run(s, { t: "fail", code: "offline", now: NOW }).errors),
    null,
  );
});

test("typing clears the error of that field; a sign-in error clears from either field", () => {
  const failed = run(
    typed(initialForm(), "a@b.co", "pw"),
    { t: "start" },
    { t: "fail", code: "badCredentials", now: NOW },
  );
  assert.equal(
    run(failed, { t: "edit", field: "password", value: "pw2" }).errors.password,
    null,
  );
  assert.equal(
    run(failed, { t: "edit", field: "email", value: "c@d.co" }).errors.password,
    null,
  );
  const inUse = run(
    typed(initialForm({ fromWelcome: true }), "a@b.co", GOOD_PW),
    { t: "consent", on: true },
    { t: "start" },
    { t: "fail", code: "emailInUse", now: NOW },
  );
  assert.equal(inUse.errors.email, "emailInUse");
  assert.equal(
    run(inUse, { t: "edit", field: "password", value: "other-one" }).errors
      .email,
    "emailInUse",
  );
  assert.equal(
    run(inUse, { t: "edit", field: "email", value: "z@d.co" }).errors.email,
    null,
  );
});

test("too many attempts: submit is off for 60 s, then on again; the form error stays meanwhile", () => {
  let s = run(
    typed(initialForm(), "a@b.co", "pw"),
    { t: "start" },
    { t: "fail", code: "tooManyAttempts", now: NOW },
  );
  assert.equal(s.errors.form, "tooManyAttempts");
  assert.equal(s.waitUntil, NOW + 60_000);
  assert.equal(submitEnabled(s, NOW + 1), false);
  assert.equal(planSubmit(s, NOW + 59_999).send, false);
  assert.equal(planSubmit(s, NOW + 59_999).reason, "wait");
  assert.equal(planReset(s, NOW + 1).send, false);
  s = run(s, { t: "edit", field: "password", value: "pw2" });
  assert.equal(s.errors.form, "tooManyAttempts");
  assert.equal(submitEnabled(s, NOW + 60_000), true);
  assert.equal(planSubmit(s, NOW + 60_000).send, true);
});

// ---- the password never lingers ----------------------------------------------

test("password is cleared after success and after a reset mail", () => {
  const s = run(typed(initialForm(), "a@b.co", "secret"), { t: "reveal" });
  const ok = run(s, { t: "start" }, { t: "ok" });
  assert.equal(ok.password, "");
  assert.equal(ok.reveal, false);
  assert.equal(ok.busy, false);
  assert.equal(ok.email, "a@b.co");
  assert.equal(
    run(s, { t: "resetSent", email: "a@b.co", now: NOW }).password,
    "",
  );
});

test("hide (app left the foreground) turns the clear-text view off and keeps what was typed", () => {
  const s = run(typed(initialForm(), "a@b.co", "secret"), { t: "reveal" });
  assert.equal(s.reveal, true);
  const hidden = run(s, { t: "hide" });
  assert.equal(hidden.reveal, false);
  assert.equal(hidden.password, "secret");
  assert.equal(hidden.email, "a@b.co");
  assert.equal(
    run(hidden, { t: "hide" }),
    hidden,
    "nothing to hide: same state",
  );

  let d = deleteReducer(
    deleteReducer(deleteReducer(DELETE_CLOSED, { t: "open" }), { t: "next" }),
    { t: "edit", value: "pw" },
  );
  d = deleteReducer(d, { t: "reveal" });
  assert.equal(d.reveal, true);
  const dh = deleteReducer(d, { t: "hide" });
  assert.equal(dh.reveal, false);
  assert.equal(dh.password, "pw");
  assert.equal(deleteReducer(dh, { t: "hide" }), dh);
});

// ---- keyboard assist -------------------------------------------------------------

test("keepScroll lifts the button but never pushes the focused field out of sight", () => {
  // Plenty of room above the field: the whole distance.
  assert.equal(keepScroll(87, 300, 103, 12), 87);
  // Sign-up on 375x667: button covered by 240, the e-mail field only has 80 to give.
  assert.equal(keepScroll(240, 195, 103, 12), 80);
  // Field already at the top edge or above it: no scroll at all.
  assert.equal(keepScroll(240, 110, 103, 12), 0);
  assert.equal(keepScroll(240, 50, 103, 12), 0);
  // Button already visible: nothing to do.
  assert.equal(keepScroll(0, 300, 103, 12), 0);
  assert.equal(keepScroll(-30, 300, 103, 12), 0);
});

// ---- double submit -------------------------------------------------------------

test("a second press while a request runs is refused (state and single flight)", async () => {
  let s = typed(initialForm(), "a@b.co", "pw");
  assert.equal(planSubmit(s, NOW).send, true);
  s = run(s, { t: "start" });
  assert.equal(s.busy, true);
  assert.deepEqual(planSubmit(s, NOW), {
    send: false,
    reason: "busy",
    errors: NO_ERRORS,
  });
  assert.equal(submitEnabled(s, NOW), false);
  assert.equal(formReducer(s, { t: "start" }), s);

  // Two presses in the same tick: the state has not caught up yet, the flight has.
  const flight = singleFlight();
  let calls = 0;
  let release;
  const gate = new Promise((r) => (release = r));
  const first = flight.run(async () => {
    calls++;
    await gate;
    return "done";
  });
  const second = flight.run(async () => {
    calls++;
    return "second";
  });
  assert.equal(flight.running, true);
  assert.equal(await second, undefined);
  release();
  assert.equal(await first, "done");
  assert.equal(calls, 1);
  assert.equal(flight.running, false);
  // After it finishes (even by throwing) the next one runs.
  await assert.rejects(
    flight.run(async () => {
      throw new Error("x");
    }),
  );
  assert.equal(flight.running, false);
  assert.equal(await flight.run(async () => "again"), "again");
});

// ---- password reset ----------------------------------------------------------

test("reset needs a well-formed address; the resend waits 60 s and then opens", () => {
  const bad = planReset(typed(initialForm(), "nope", ""), NOW);
  assert.equal(bad.send, false);
  assert.equal(bad.errors.email, "invalidEmail");
  const good = planReset(typed(initialForm(), " A@B.co ", ""), NOW);
  assert.deepEqual(good, { send: true, email: "a@b.co" });

  let s = run(
    typed(initialForm(), "A@B.co", ""),
    { t: "start" },
    { t: "resetSent", email: "a@b.co", now: NOW },
  );
  assert.equal(s.busy, false);
  assert.equal(s.reset.email, "a@b.co");
  assert.equal(s.reset.resendAt, NOW + LIMITS.resetResendCooldownSec * 1000);
  assert.equal(LIMITS.resetResendCooldownSec, 60);
  assert.equal(canResend(s, NOW), false);
  assert.equal(remainingSeconds(s.reset.resendAt, NOW), 60);
  assert.equal(
    remainingSeconds(s.reset.resendAt, NOW + 59_001),
    1,
    "rounds up, never shows 0 early",
  );
  assert.equal(canResend(s, NOW + 59_999), false);
  assert.equal(canResend(s, NOW + 60_000), true);
  assert.equal(remainingSeconds(s.reset.resendAt, NOW + 60_000), 0);

  // Resend: busy blocks a second one; success restarts the 60 s.
  const t1 = NOW + 61_000;
  s = run(s, { t: "resendStart" });
  assert.equal(s.reset.busy, true);
  assert.equal(canResend(s, t1), false);
  assert.equal(formReducer(s, { t: "resendStart" }), s);
  s = run(s, { t: "resendDone", now: t1 });
  assert.equal(s.reset.busy, false);
  assert.equal(s.reset.resendAt, t1 + 60_000);
  assert.equal(canResend(s, t1 + 1), false);
});

test("a failed resend: network allows an immediate retry, rate limit waits 60 s", () => {
  const base = run(typed(initialForm(), "a@b.co", ""), {
    t: "resetSent",
    email: "a@b.co",
    now: NOW,
  });
  const due = NOW + 60_000;
  const net = run(
    base,
    { t: "resendStart" },
    { t: "resendFail", code: "offline", now: due },
  );
  assert.equal(net.reset.error, "network");
  assert.equal(canResend(net, due), true);
  const rate = run(
    base,
    { t: "resendStart" },
    { t: "resendFail", code: "tooManyAttempts", now: due },
  );
  assert.equal(rate.reset.error, "tooManyAttempts");
  assert.equal(canResend(rate, due), false);
  assert.equal(canResend(rate, due + 60_000), true);
});

test("back from the reset screen returns to sign-in with the address kept", () => {
  const s = run(typed(initialForm({ fromWelcome: true }), "a@b.co", ""), {
    t: "resetSent",
    email: "a@b.co",
    now: NOW,
  });
  const back = run(s, { t: "resetBack" });
  assert.equal(back.reset, null);
  assert.equal(back.mode, "signIn");
  assert.equal(back.email, "a@b.co");
  assert.equal(back.password, "");
});

// ---- deleting the account ----------------------------------------------------

test("delete flow: open > continue > password > confirm, in that order only", () => {
  let d = DELETE_CLOSED;
  assert.equal(deleteReducer(d, { t: "next" }), d, "cannot skip the sheet");
  assert.equal(deleteReducer(d, { t: "edit", value: "x" }), d);
  d = deleteReducer(d, { t: "open" });
  assert.equal(d.step, "confirm");
  assert.equal(canConfirmDelete(d), false);
  assert.equal(
    deleteReducer(d, { t: "start" }),
    d,
    "no deletion from the sheet step",
  );
  d = deleteReducer(d, { t: "next" });
  assert.equal(d.step, "password");
  assert.equal(canConfirmDelete(d), false, "empty password: confirm stays off");
  assert.equal(deleteReducer(d, { t: "start" }), d);
  d = deleteReducer(d, { t: "edit", value: "pw" });
  assert.equal(canConfirmDelete(d), true);
  const running = deleteReducer(d, { t: "start" });
  assert.equal(running.busy, true);
  assert.equal(
    canConfirmDelete(running),
    false,
    "double confirm is impossible",
  );
  assert.equal(deleteReducer(running, { t: "start" }), running);
  assert.equal(
    deleteReducer(running, { t: "cancel" }),
    running,
    "cannot cancel a running deletion",
  );
  assert.equal(
    deleteReducer(running, { t: "edit", value: "changed" }),
    running,
  );
  assert.deepEqual(deleteReducer(running, { t: "done" }), DELETE_CLOSED);
});

test("delete: cancel wipes the password at every step; failures keep the session flow open", () => {
  let d = deleteReducer(
    deleteReducer(deleteReducer(DELETE_CLOSED, { t: "open" }), { t: "next" }),
    { t: "edit", value: "pw" },
  );
  d = deleteReducer(d, { t: "reveal" });
  assert.equal(d.reveal, true);
  assert.deepEqual(deleteReducer(d, { t: "cancel" }), DELETE_CLOSED);
  assert.deepEqual(
    deleteReducer(deleteReducer(DELETE_CLOSED, { t: "open" }), { t: "cancel" }),
    DELETE_CLOSED,
  );

  const failed = deleteReducer(deleteReducer(d, { t: "start" }), {
    t: "fail",
    code: "offline",
  });
  assert.equal(failed.busy, false);
  assert.equal(failed.step, "password");
  assert.equal(failed.error, "offline");
  assert.equal(
    failed.password,
    "pw",
    "typed password kept so the user can retry",
  );
  assert.equal(
    canConfirmDelete(failed),
    true,
    "the button stays usable after a network error",
  );
  assert.equal(deleteErrorFor(failed.error, "tr").text, COPY.deleteOffline.tr);
  assert.equal(deleteReducer(failed, { t: "edit", value: "pw2" }).error, null);
  const wrong = deleteReducer(deleteReducer(d, { t: "start" }), {
    t: "fail",
    code: "badCredentials",
  });
  assert.equal(
    deleteErrorFor(wrong.error, "en").text,
    ERROR_TEXT.badCredentials.en,
  );
  // A late failure of nothing running is ignored.
  assert.equal(deleteReducer(d, { t: "fail", code: "unknown" }), d);
});

// ---- helpers and copy ----------------------------------------------------------

test("codeOf maps only AuthError codes, everything else is unknown", () => {
  assert.equal(codeOf(new AuthError("emailInUse")), "emailInUse");
  assert.equal(codeOf(new Error("EMAIL_EXISTS")), "unknown");
  assert.equal(codeOf(undefined), "unknown");
});

test("added copy is complete in both languages and hides nothing it should not say", () => {
  for (const key of [
    "modeLabel",
    "emailLabel",
    "passwordLabel",
    "show",
    "hide",
    "showSpoken",
    "hideSpoken",
    "forgot",
    "skip",
    "signOut",
    "termsLead",
    "termsLink",
    "privacyLink",
    "busySignIn",
    "busySignUp",
    "busySend",
    "busyDelete",
    "resetResendWait",
    "resetResendWaitSpoken",
  ]) {
    assert.ok(COPY[key].tr.trim() && COPY[key].en.trim(), key);
  }
  assert.equal(
    secondsText(COPY.resetResendWait, 45, "tr"),
    "Tekrar gönder (45 sn)",
  );
  assert.equal(
    secondsText(COPY.resetResendWaitSpoken, 45, "en"),
    "Send again, available in 45 seconds",
  );
  assert.doesNotMatch(secondsText(COPY.resetResendWait, 45, "en"), /\{n\}/);
  // The legal block: notice and consent are separate texts, with the contact and no marketing consent.
  for (const lang of ["tr", "en"]) {
    assert.match(LEGAL_COPY.notice[lang], /support@example.com/);
    assert.match(LEGAL_COPY.notice[lang], /Firebase/);
    assert.match(LEGAL_COPY.consent[lang], /Firebase/);
    assert.doesNotMatch(
      LEGAL_COPY.consent[lang] + LEGAL_COPY.notice[lang],
      /pazarlama.*(onay|rıza)|marketing.*consent/i,
    );
  }
  assert.notEqual(LEGAL_COPY.notice.tr, LEGAL_COPY.consent.tr);
  // The honest line promises nothing (plan.md item 7).
  assert.doesNotMatch(
    COPY.value.tr + COPY.value.en,
    /senkron|sync|yakında|soon/i,
  );
});

test("deleteReducer: Apple users delete from the confirm step without a password", () => {
  const confirm = deleteReducer(DELETE_CLOSED, { t: "open" });
  const busy = deleteReducer(confirm, { t: "startApple" });
  assert.equal(busy.busy, true);
  assert.equal(busy.step, "confirm");
  assert.equal(
    deleteReducer(busy, { t: "cancel" }),
    busy,
    "cannot cancel a running deletion",
  );
  assert.equal(deleteReducer(busy, { t: "startApple" }), busy);
  assert.equal(
    deleteReducer(DELETE_CLOSED, { t: "startApple" }),
    DELETE_CLOSED,
  );
  const failed = deleteReducer(busy, { t: "fail", code: "needsRecentLogin" });
  assert.deepEqual(
    [failed.busy, failed.error, failed.step],
    [false, "needsRecentLogin", "confirm"],
  );
  assert.equal(deleteReducer(busy, { t: "done" }), DELETE_CLOSED);
});
