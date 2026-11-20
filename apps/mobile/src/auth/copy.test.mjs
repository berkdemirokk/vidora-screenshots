// Run with: node --test apps/mobile/src/auth/*.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import {
  CASE_OF_CODE,
  COPY,
  ERROR_FIELD,
  ERROR_TEXT,
  deleteErrorFor,
  errorFor,
  genericError,
  noticeText,
  resetSentText,
} from "./copy.ts";
import { AUTH_ERROR_CODES } from "./firebase-rest.ts";

test("every auth code has a case, a field and TR + EN text", () => {
  for (const code of AUTH_ERROR_CODES)
    for (const lang of ["tr", "en"]) {
      const v = errorFor(code, lang);
      assert.ok(v.text.length > 10, `${code} ${lang}`);
      assert.ok(["email", "password", "form"].includes(v.field));
    }
  assert.deepEqual(Object.keys(CASE_OF_CODE).sort(), [...AUTH_ERROR_CODES].sort());
});

test("code to case mapping follows plan.md", () => {
  assert.deepEqual(CASE_OF_CODE, {
    appleFailed: "appleFailed",
    appleRejected: "appleFailed",
    badCredentials: "badCredentials",
    invalidEmail: "invalidEmail",
    emailInUse: "emailInUse",
    weakPassword: "weakPassword",
    tooManyAttempts: "tooManyAttempts",
    offline: "network",
    timeout: "network",
    disabled: "generic",
    unknown: "generic",
    sessionExpired: "generic",
    needsRecentLogin: "generic",
  });
  assert.equal(ERROR_FIELD.badCredentials, "password");
  assert.equal(ERROR_FIELD.invalidEmail, "email");
  assert.equal(ERROR_FIELD.emailInUse, "email");
  assert.equal(ERROR_FIELD.weakPassword, "password");
  for (const c of ["tooManyAttempts", "network", "generic"]) assert.equal(ERROR_FIELD[c], "form");
});

test("UX error table is verbatim (password length is 8 per plan.md)", () => {
  // The two source languages are verbatim; the others are checked in src/i18n.test.mjs.
  const trEn = Object.fromEntries(
    Object.entries(ERROR_TEXT).map(([k, p]) => [k, { tr: p.tr, en: p.en }]),
  );
  assert.deepEqual(trEn, {
    invalidEmail: {
      tr: "Geçerli bir e-posta yaz, örnek: ad@site.com.",
      en: "Enter a valid email, like name@site.com.",
    },
    badCredentials: {
      tr: "E-posta ya da şifre yanlış. Tekrar dene ya da şifreni sıfırla.",
      en: "Email or password is wrong. Try again or reset your password.",
    },
    emailInUse: {
      tr: "Bu e-postayla zaten bir hesap var. Giriş yapmayı dene.",
      en: "An account with this email already exists. Try signing in.",
    },
    weakPassword: {
      tr: "Şifre en az 8 karakter olmalı.",
      en: "Password must be at least 8 characters.",
    },
    tooManyAttempts: {
      tr: "Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar dene ya da şifreni sıfırla.",
      en: "Too many attempts. Try again in a few minutes or reset your password.",
    },
    network: {
      tr: "İnternete bağlanılamadı. Bağlantını kontrol edip tekrar dene.",
      en: "Couldn't connect. Check your internet and try again.",
    },
    appleFailed: {
      tr: "Apple ile giriş yapılamadı. Tekrar dene ya da e-postayla devam et.",
      en: "Couldn't sign in with Apple. Try again or continue with email.",
    },
    generic: {
      tr: "Bir şey ters gitti. Tekrar dene; sürerse Destek'e yaz.",
      en: "Something went wrong. Try again; if it continues, contact Support.",
    },
  });
});

test("Maestro matcher text is present for bad credentials", () => {
  assert.match(errorFor("badCredentials", "tr").text, /E-posta ya da şifre yanlış|Email or password is wrong/);
  assert.match(errorFor("badCredentials", "en").text, /E-posta ya da şifre yanlış|Email or password is wrong/);
});

test("no screen text exposes a Firebase code, number sign or token words", () => {
  const all = [
    ...Object.values(ERROR_TEXT).flatMap((p) => [p.tr, p.en]),
    ...Object.values(COPY).flatMap((p) => [p.tr, p.en]),
  ];
  for (const text of all) {
    assert.doesNotMatch(text, /[A-Z]{3,}_[A-Z_]{3,}/, text);
    assert.doesNotMatch(text, /firebase/i, text);
  }
});

test("copy is complete in both languages and never promises sync or the future", () => {
  for (const [k, p] of Object.entries(COPY)) {
    assert.ok(p.tr.trim() && p.en.trim(), k);
  }
  const joined = Object.values(COPY).map((p) => `${p.tr} ${p.en}`).join(" ").toLowerCase();
  for (const banned of ["yakında", "coming soon", "yeni özellikler", "senkron", "sync", "bulut", "cloud", "ücretsiz plan"])
    assert.ok(!joined.includes(banned), banned);
  assert.match(COPY.value.tr, /yalnızca destekte seni tanımamıza yarar/);
  assert.match(COPY.value.tr, /yalnızca bu telefonda kalır/);
});

test("reset text hedges and carries the email; delete copy says subscription stays", () => {
  assert.match(resetSentText("a@b.co", "tr"), /^Bu adres kayıtlıysa a@b\.co adresine/);
  assert.match(resetSentText("a@b.co", "en"), /^If this address is registered, we sent .* a@b\.co/);
  assert.doesNotMatch(resetSentText("a@b.co", "tr"), /\{email\}/);
  assert.match(COPY.deleteSheetBody.tr, /iptal edilmez/);
  assert.match(COPY.deleteSheetBody.en, /not cancelled/);
  assert.equal(COPY.deleteButton.tr, "Hesabı sil");
  assert.equal(COPY.deleteButton.en, "Delete account");
});

test("delete errors and notices", () => {
  assert.equal(deleteErrorFor("offline", "tr").text, "İnternete bağlanamadık. Hesabın silinmedi.");
  assert.equal(deleteErrorFor("badCredentials", "en").text, ERROR_TEXT.badCredentials.en);
  assert.equal(deleteErrorFor("timeout", "tr").case, "network");
  assert.equal(genericError("en").case, "generic");
  assert.ok(noticeText("sessionExpired", "tr").length > 5);
  assert.ok(noticeText("deleteIncomplete", "en").length > 5);
});
