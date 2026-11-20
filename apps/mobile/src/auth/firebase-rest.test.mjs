// Run with: node --test apps/mobile/src/auth/*.test.mjs  (offline: fetch is injected)
import assert from "node:assert/strict";
import test from "node:test";
import { FIREBASE } from "./config.ts";
import {
  AUTH_ERROR_CODES,
  AuthError,
  deleteAccount,
  isValidEmail,
  mapFirebaseError,
  refresh,
  sendPasswordReset,
  signIn,
  signInWithApple,
  signUp,
  validateEmail,
  validatePassword,
} from "./firebase-rest.ts";

const res = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
});
const errRes = (message, status = 400) => res(status, { error: { code: status, message } });

function recorder(response) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return typeof response === "function" ? response(url, init) : response;
  };
  return { fetch, calls };
}

const GOOD = {
  idToken: "id-1",
  refreshToken: "rt-1",
  expiresIn: "3600",
  localId: "uid-1",
};

test("config: bundle id and a project key", () => {
  assert.equal(FIREBASE.bundleId, "com.berkdemirok.vidora");
  assert.equal(FIREBASE.projectId, "vidora-b9035");
  assert.match(FIREBASE.apiKey, /^AIza[\w-]{35}$/);
});

test("mapFirebaseError: every known code", () => {
  const table = {
    EMAIL_EXISTS: "emailInUse",
    INVALID_LOGIN_CREDENTIALS: "badCredentials",
    EMAIL_NOT_FOUND: "badCredentials",
    INVALID_PASSWORD: "badCredentials",
    WEAK_PASSWORD: "weakPassword",
    PASSWORD_DOES_NOT_MEET_REQUIREMENTS: "weakPassword",
    INVALID_EMAIL: "invalidEmail",
    MISSING_EMAIL: "invalidEmail",
    TOO_MANY_ATTEMPTS_TRY_LATER: "tooManyAttempts",
    USER_DISABLED: "disabled",
    CREDENTIAL_TOO_OLD_LOGIN_AGAIN: "needsRecentLogin",
    TOKEN_EXPIRED: "sessionExpired",
    INVALID_REFRESH_TOKEN: "sessionExpired",
    INVALID_ID_TOKEN: "sessionExpired",
    USER_NOT_FOUND: "sessionExpired",
  };
  for (const [firebase, code] of Object.entries(table))
    assert.equal(mapFirebaseError(firebase), code, firebase);
  // offline and timeout come from the transport, never from a message.
  const reachable = new Set(Object.values(table));
  assert.deepEqual(
    AUTH_ERROR_CODES.filter((c) => !reachable.has(c)).sort(),
    ["appleFailed", "appleRejected", "offline", "timeout", "unknown"],
  );
  assert.equal(AUTH_ERROR_CODES.length, 13);
});

test("mapFirebaseError: suffixed messages and the three identity codes", () => {
  assert.equal(
    mapFirebaseError("WEAK_PASSWORD : Password should be at least 6 characters"),
    "weakPassword",
  );
  assert.equal(
    mapFirebaseError("TOO_MANY_ATTEMPTS_TRY_LATER : Access to this account has been temporarily disabled"),
    "tooManyAttempts",
  );
  assert.equal(mapFirebaseError(" invalid_login_credentials "), "badCredentials");
  const same = ["INVALID_LOGIN_CREDENTIALS", "EMAIL_NOT_FOUND", "INVALID_PASSWORD"].map(
    mapFirebaseError,
  );
  assert.equal(new Set(same).size, 1);
});

test("mapFirebaseError: unknown and garbled input", () => {
  for (const m of [undefined, "", "   ", "SOMETHING_NEW", "weak password", " : ", "<html>502</html>", null, 5])
    assert.equal(mapFirebaseError(m), "unknown", String(m));
});

test("transport: error responses map, raw holds only the bare code", async () => {
  const cases = [
    [errRes("EMAIL_EXISTS"), "emailInUse", "EMAIL_EXISTS"],
    [errRes("WEAK_PASSWORD : Password should be at least 6 characters"), "weakPassword", "WEAK_PASSWORD"],
    [errRes("INVALID_LOGIN_CREDENTIALS"), "badCredentials", "INVALID_LOGIN_CREDENTIALS"],
    [errRes("TOO_MANY_ATTEMPTS_TRY_LATER : Try later", 429), "tooManyAttempts", "TOO_MANY_ATTEMPTS_TRY_LATER"],
  ];
  for (const [r, code, raw] of cases) {
    const { fetch } = recorder(r);
    await assert.rejects(signIn("a@b.co", "hunter2hunter2", { fetch }), (e) => {
      assert.ok(e instanceof AuthError);
      assert.equal(e.code, code);
      assert.equal(e.raw, raw);
      assert.ok(!JSON.stringify(e).includes("hunter2"));
      return true;
    });
  }
});

test("transport: garbled and unexpected responses are unknown", async () => {
  const bad = [
    res(500, "<html>Bad gateway</html>"),
    res(503, ""),
    res(400, { error: "nope" }),
    res(400, { error: { message: 42 } }),
    res(400, "null"),
    res(400, "[1,2]"),
    res(200, "not json at all"),
    res(200, {}),
    res(200, { ...GOOD, idToken: "" }),
    res(200, { ...GOOD, expiresIn: "soon" }),
    res(200, { ...GOOD, expiresIn: "0" }),
    res(200, { ...GOOD, localId: undefined }),
  ];
  for (const r of bad) {
    const { fetch } = recorder(r);
    await assert.rejects(signIn("a@b.co", "x", { fetch }), (e) => e instanceof AuthError && e.code === "unknown");
  }
  const { fetch } = recorder(res(200, { id_token: "a" }));
  await assert.rejects(refresh("rt", { fetch }), (e) => e.code === "unknown");
});

test("transport: a body that cannot be read counts as offline", async () => {
  const fetch = async () => ({ ok: true, status: 200, text: async () => { throw new TypeError("net"); } });
  await assert.rejects(signIn("a@b.co", "x", { fetch }), (e) => e.code === "offline");
});

test("transport: network failure is offline for every call", async () => {
  const fetch = async () => { throw new TypeError("Network request failed"); };
  const calls = [
    () => signUp("a@b.co", "x", { fetch }),
    () => signIn("a@b.co", "x", { fetch }),
    () => refresh("rt", { fetch }),
    () => deleteAccount("id", { fetch }),
    () => sendPasswordReset("a@b.co", "tr", { fetch }),
  ];
  for (const c of calls) await assert.rejects(c(), (e) => e instanceof AuthError && e.code === "offline");
});

test("transport: a hanging fetch times out and is aborted", async () => {
  let aborted = false;
  const fetch = (url, init) =>
    new Promise((_, reject) => {
      init.signal.addEventListener("abort", () => {
        aborted = true;
        const e = new Error("aborted");
        e.name = "AbortError";
        reject(e);
      });
    });
  const started = Date.now();
  await assert.rejects(signIn("a@b.co", "x", { fetch, timeoutMs: 20 }), (e) => e.code === "timeout");
  assert.ok(aborted);
  assert.ok(Date.now() - started < 2000);
  // A fetch that ignores the signal still ends via an AbortError-less reject path.
  const stubborn = (url, init) =>
    new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new Error("x"))));
  await assert.rejects(refresh("rt", { fetch: stubborn, timeoutMs: 20 }), (e) => e.code === "timeout");
});

test("signIn: url, method, headers, body, email normalized", async () => {
  const { fetch, calls } = recorder(res(200, GOOD));
  const t = await signIn("  Ada@Example.COM ", " pw ", { fetch });
  assert.deepEqual(t, { idToken: "id-1", refreshToken: "rt-1", expiresInSec: 3600, uid: "uid-1" });
  const { url, init } = calls[0];
  assert.equal(
    url,
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE.apiKey}`,
  );
  assert.equal(init.method, "POST");
  assert.equal(init.headers["Content-Type"], "application/json");
  assert.equal(init.headers["X-Ios-Bundle-Identifier"], "com.berkdemirok.vidora");
  assert.deepEqual(JSON.parse(init.body), {
    email: "ada@example.com",
    password: " pw ", // the password is never trimmed
    returnSecureToken: true,
  });
  assert.ok(!url.includes("ada") && !url.includes("pw"), "nothing private in the URL");
});

test("signUp: endpoint and body", async () => {
  const { fetch, calls } = recorder(res(200, GOOD));
  await signUp("A@B.co", "longenough", { fetch });
  assert.match(calls[0].url, /accounts:signUp\?key=/);
  assert.equal(JSON.parse(calls[0].init.body).email, "a@b.co");
});

test("refresh: form encoding and field translation", async () => {
  const { fetch, calls } = recorder(
    res(200, { id_token: "id-2", refresh_token: "rt-2", expires_in: "3599", user_id: "uid-9" }),
  );
  const t = await refresh("rt&=weird", { fetch });
  assert.deepEqual(t, { idToken: "id-2", refreshToken: "rt-2", expiresInSec: 3599, uid: "uid-9" });
  const { url, init } = calls[0];
  assert.equal(url, `https://securetoken.googleapis.com/v1/token?key=${FIREBASE.apiKey}`);
  assert.equal(init.headers["Content-Type"], "application/x-www-form-urlencoded");
  assert.equal(init.headers["X-Ios-Bundle-Identifier"], "com.berkdemirok.vidora");
  const form = new URLSearchParams(init.body);
  assert.equal(form.get("grant_type"), "refresh_token");
  assert.equal(form.get("refresh_token"), "rt&=weird");
  assert.ok(!url.includes("rt"));
});

test("deleteAccount and sendPasswordReset", async () => {
  const del = recorder(res(200, { kind: "identitytoolkit#DeleteAccountResponse" }));
  assert.equal(await deleteAccount("id-77", { fetch: del.fetch }), undefined);
  assert.match(del.calls[0].url, /accounts:delete\?key=/);
  assert.deepEqual(JSON.parse(del.calls[0].init.body), { idToken: "id-77" });

  const reset = recorder(res(200, { email: "a@b.co" }));
  await sendPasswordReset(" A@B.co ", "tr", { fetch: reset.fetch });
  assert.match(reset.calls[0].url, /accounts:sendOobCode\?key=/);
  assert.deepEqual(JSON.parse(reset.calls[0].init.body), { requestType: "PASSWORD_RESET", email: "a@b.co" });
  assert.equal(reset.calls[0].init.headers["X-Firebase-Locale"], "tr");
  assert.equal(reset.calls[0].init.headers["X-Ios-Bundle-Identifier"], "com.berkdemirok.vidora");
  await sendPasswordReset("a@b.co", "en", { fetch: reset.fetch });
  assert.equal(reset.calls[1].init.headers["X-Firebase-Locale"], "en");
});

test("validation: email shape", () => {
  for (const ok of ["a@b.co", " Ada@Example.com ", "qa+123@vidora-test.invalid"])
    assert.equal(isValidEmail(ok), true, ok);
  for (const bad of ["", "a", "a@b", "@b.co", "a@@b.co", "a b@c.co", "a@b .co", `${"x".repeat(250)}@b.co`])
    assert.equal(validateEmail(bad), "invalidEmail", bad);
  assert.equal(validateEmail("a@b.co"), null);
});

test("validation: password minimum 8 on sign-up only", () => {
  assert.equal(validatePassword("1234567", "signUp"), "weakPassword");
  assert.equal(validatePassword("12345678", "signUp"), null);
  assert.equal(validatePassword("x".repeat(128), "signUp"), null);
  assert.equal(validatePassword("x".repeat(129), "signUp"), "weakPassword");
  assert.equal(validatePassword("", "signIn"), null);
  assert.equal(validatePassword("abc", "signIn"), null);
});

test("sendPasswordReset: EMAIL_NOT_FOUND resolves like a known address, other errors still throw", async () => {
  const unknown = recorder(res(400, { error: { message: "EMAIL_NOT_FOUND" } }));
  assert.equal(await sendPasswordReset("nobody@b.co", "tr", { fetch: unknown.fetch }), undefined);
  const bad = recorder(res(400, { error: { message: "INVALID_EMAIL" } }));
  await assert.rejects(sendPasswordReset("x", "tr", { fetch: bad.fetch }), (e) => e.code === "invalidEmail");
  const off = async () => { throw new TypeError("net"); };
  await assert.rejects(sendPasswordReset("a@b.co", "tr", { fetch: off }), (e) => e.code === "offline");
});

test("signInWithApple: idp body, RAW nonce (not a hash), tokens and email mapped", async () => {
  const { fetch, calls } = recorder(res(200, { ...GOOD, email: "Me@Privaterelay.AppleID.com", isNewUser: true }));
  const t = await signInWithApple("hdr.pay.sig", "a1b2c3raw", { fetch });
  assert.deepEqual(t, { idToken: "id-1", refreshToken: "rt-1", expiresInSec: 3600, uid: "uid-1", email: "me@privaterelay.appleid.com" });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /accounts:signInWithIdp\?key=/);
  assert.equal(calls[0].init.headers["X-Ios-Bundle-Identifier"], FIREBASE.bundleId);
  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(body, {
    postBody: "id_token=hdr.pay.sig&providerId=apple.com&nonce=a1b2c3raw",
    requestUri: "http://localhost",
    returnSecureToken: true,
    returnIdpCredential: true,
  });
});

test("signInWithApple: without an email in the answer the token result has none", async () => {
  const { fetch } = recorder(res(200, GOOD));
  assert.equal("email" in (await signInWithApple("t", "n", { fetch })), false);
});

test("signInWithApple: errors map; needConfirmation is emailInUse; empty inputs never hit the network", async () => {
  const cases = [
    [errRes("INVALID_IDP_RESPONSE : Invalid token"), "appleRejected"],
    [errRes("OPERATION_NOT_ALLOWED"), "appleRejected"],
    [errRes("USER_DISABLED"), "disabled"],
    [res(200, { needConfirmation: true, email: "a@b.co" }), "emailInUse"],
    [res(200, { kind: "x" }), "unknown"],
  ];
  for (const [r, code] of cases) {
    const { fetch } = recorder(r);
    await assert.rejects(signInWithApple("tok-secret", "nonce-secret", { fetch }), (e) => {
      assert.equal(e.code, code);
      assert.ok(!JSON.stringify(e).includes("secret"));
      return true;
    });
  }
  const { fetch, calls } = recorder(res(200, GOOD));
  await assert.rejects(signInWithApple("", "n", { fetch }), (e) => e.code === "appleFailed");
  await assert.rejects(signInWithApple("t", "", { fetch }), (e) => e.code === "appleFailed");
  assert.equal(calls.length, 0);
});
