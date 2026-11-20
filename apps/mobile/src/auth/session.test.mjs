// Run with: node --test apps/mobile/src/auth/*.test.mjs  (offline: everything is injected)
import assert from "node:assert/strict";
import test from "node:test";
import { SANDBOX_KEYS, SECURE_KEYS } from "./config.ts";
import { AuthError } from "./firebase-rest.ts";
import { INITIAL_SESSION, createAuth, reduce } from "./session.ts";

const SESSION_KEY = SECURE_KEYS.session;
const PENDING_KEY = SECURE_KEYS.pendingDelete;
const MARKER_KEY = SANDBOX_KEYS.launched;

function memoryKV(initial = {}) {
  const data = new Map(Object.entries(initial));
  const log = [];
  return {
    data,
    log,
    failRead: false,
    failWrite: false,
    async get(k) {
      log.push(["get", k]);
      if (this.failRead) throw new Error("unreadable");
      return data.has(k) ? data.get(k) : null;
    },
    async set(k, v) {
      log.push(["set", k]);
      if (this.failWrite) throw new Error("write failed");
      data.set(k, v);
    },
    async del(k) {
      log.push(["del", k]);
      data.delete(k);
    },
  };
}

const record = (extra = {}) =>
  JSON.stringify({ refreshToken: "rt-0", uid: "u1", email: "a@b.co", ...extra });

function tokens(n = 1, expiresInSec = 3600) {
  return { idToken: `id-${n}`, refreshToken: `rt-${n}`, expiresInSec, uid: "u1" };
}

function setup({ secure = {}, sandbox = { [MARKER_KEY]: "1" }, api = {}, time = 1_000_000, appleRevoke = null } = {}) {
  const store = memoryKV(secure);
  const sbx = memoryKV(sandbox);
  const calls = { signIn: [], signUp: [], refresh: [], deleteAccount: [], apple: [] };
  const clock = { t: time };
  const real = {
    signIn: async (e) => (calls.signIn.push([e]), tokens(2)),
    signUp: async (e) => (calls.signUp.push([e]), tokens(3)),
    refresh: async (rt) => (calls.refresh.push(rt), tokens(1)),
    signInWithApple: async (id, nonce) => (calls.apple.push([id, nonce]), { ...tokens(4), email: "apple@b.co" }),
    deleteAccount: async (id) => void calls.deleteAccount.push(id),
    ...api,
  };
  // Count network calls through every api function.
  const wrapped = {};
  let network = 0;
  for (const k of Object.keys(real))
    wrapped[k] = (...a) => {
      network++;
      return real[k](...a);
    };
  const states = [];
  const notices = [];
  const auth = createAuth({
    store,
    sandbox: sbx,
    api: wrapped,
    appleRevoke,
    now: () => clock.t,
    onChange: (s) => states.push(s),
    onNotice: (n) => notices.push(n),
  });
  return { auth, store, sbx, calls, clock, states, notices, network: () => network };
}

// ---- reducer ----------------------------------------------------------------

test("reducer: loading resolves to signedIn or signedOut", () => {
  assert.deepEqual(reduce(INITIAL_SESSION, { t: "restored", uid: "u", email: "e" }), {
    status: "signedIn", uid: "u", email: "e", provider: "password", offline: false,
  });
  assert.deepEqual(reduce(INITIAL_SESSION, { t: "none" }), { status: "signedOut" });
});

test("reducer: signedIn and signedOut transition both ways, offline only when signed in", () => {
  const out = { status: "signedOut" };
  const inn = reduce(out, { t: "signedIn", uid: "u", email: "e" });
  assert.equal(inn.status, "signedIn");
  assert.deepEqual(reduce(inn, { t: "signedOut" }), out);
  const off = reduce(inn, { t: "offline", on: true });
  assert.equal(off.offline, true);
  assert.equal(reduce(off, { t: "offline", on: true }), off, "no change keeps identity");
  assert.equal(reduce(off, { t: "offline", on: false }).offline, false);
  assert.equal(reduce(out, { t: "offline", on: true }), out);
  assert.equal(reduce(INITIAL_SESSION, { t: "offline", on: true }), INITIAL_SESSION);
  assert.equal(reduce(out, { t: "signedOut" }), out);
  // restored/none only apply while loading
  assert.equal(reduce(inn, { t: "none" }), inn);
  assert.equal(reduce(out, { t: "restored", uid: "u", email: "e" }), out);
  // signing in again resets offline
  assert.equal(reduce(off, { t: "signedIn", uid: "u", email: "e" }).offline, false);
});

// ---- launch -----------------------------------------------------------------

test("launch with a stored session: signedIn at once, zero network calls", async () => {
  const t = setup({ secure: { [SESSION_KEY]: record() } });
  await t.auth.start();
  assert.equal(t.network(), 0);
  assert.deepEqual(t.auth.getSession(), { status: "signedIn", uid: "u1", email: "a@b.co", provider: "password", offline: false });
  assert.equal(t.states.length, 1);
});

test("launch without a record, with a corrupt record, with unreadable storage: signedOut, no network", async () => {
  for (const secure of [{}, { [SESSION_KEY]: "{not json" }, { [SESSION_KEY]: JSON.stringify({ uid: "x" }) }]) {
    const t = setup({ secure });
    await t.auth.start();
    assert.deepEqual(t.auth.getSession(), { status: "signedOut" });
    assert.equal(t.network(), 0);
  }
  const t = setup({ secure: { [SESSION_KEY]: record() } });
  t.store.failRead = true;
  await t.auth.start();
  assert.deepEqual(t.auth.getSession(), { status: "signedOut" });
  assert.equal(t.network(), 0);
});

test("start is idempotent", async () => {
  const t = setup({ secure: { [SESSION_KEY]: record() } });
  await Promise.all([t.auth.start(), t.auth.start()]);
  await t.auth.start();
  assert.equal(t.states.length, 1);
});

// ---- stale Keychain ---------------------------------------------------------

test("sandbox marker missing and readable: stale Keychain is wiped, marker written", async () => {
  const t = setup({
    secure: { [SESSION_KEY]: record(), [PENDING_KEY]: "1" },
    sandbox: {},
  });
  await t.auth.start();
  assert.deepEqual(t.auth.getSession(), { status: "signedOut" });
  assert.equal(t.store.data.has(SESSION_KEY), false);
  assert.equal(t.store.data.has(PENDING_KEY), false);
  assert.equal(t.sbx.data.get(MARKER_KEY), "1");
  assert.deepEqual(t.notices, [], "a reinstall is not a half-finished deletion");
  assert.equal(t.network(), 0);
});

test("sandbox marker present: Keychain session is kept", async () => {
  const t = setup({ secure: { [SESSION_KEY]: record() }, sandbox: { [MARKER_KEY]: "1" } });
  await t.auth.start();
  assert.equal(t.auth.getSession().status, "signedIn");
  assert.equal(t.store.data.has(SESSION_KEY), true);
});

test("sandbox unreadable: nothing is wiped, no marker written, session restored", async () => {
  const t = setup({ secure: { [SESSION_KEY]: record() }, sandbox: {} });
  t.sbx.failRead = true;
  await t.auth.start();
  assert.equal(t.auth.getSession().status, "signedIn");
  assert.equal(t.store.data.has(SESSION_KEY), true);
  assert.equal(t.store.log.some(([op]) => op === "del"), false);
  assert.equal(t.sbx.log.some(([op]) => op === "set"), false);
});

test("wipe that fails does not restore the stale session", async () => {
  const t = setup({ secure: { [SESSION_KEY]: record() }, sandbox: {} });
  t.store.del = async () => { throw new Error("keychain busy"); };
  await t.auth.start();
  assert.deepEqual(t.auth.getSession(), { status: "signedOut" });
});

test("marker write failure does not break launch", async () => {
  const t = setup({ secure: {}, sandbox: {} });
  t.sbx.failWrite = true;
  await t.auth.start();
  assert.equal(t.auth.getSession().status, "signedOut");
});

// ---- id token ---------------------------------------------------------------

test("getIdToken: signedOut and loading give null without network", async () => {
  const t = setup();
  assert.equal(await t.auth.getIdToken(), null);
  await t.auth.start();
  assert.equal(await t.auth.getIdToken(), null);
  assert.equal(t.network(), 0);
});

test("first getIdToken refreshes, fresh token is reused, 2 minute margin refreshes again", async () => {
  const t = setup({ secure: { [SESSION_KEY]: record() } });
  await t.auth.start();
  assert.equal(await t.auth.getIdToken(), "id-1");
  assert.equal(t.calls.refresh.length, 1);
  assert.equal(t.calls.refresh[0], "rt-0");
  t.clock.t += 3600_000 - 120_001; // 1 ms outside the margin
  assert.equal(await t.auth.getIdToken(), "id-1");
  assert.equal(t.calls.refresh.length, 1);
  t.clock.t += 2; // inside the margin
  await t.auth.getIdToken();
  assert.equal(t.calls.refresh.length, 2);
  assert.equal(t.calls.refresh[1], "rt-1", "uses the rotated refresh token");
});

test("a new refresh token is written to secure storage before the id token is returned", async () => {
  const t = setup({ secure: { [SESSION_KEY]: record() } });
  await t.auth.start();
  await t.auth.getIdToken();
  assert.equal(JSON.parse(t.store.data.get(SESSION_KEY)).refreshToken, "rt-1");
  // only the refresh token is secret and persisted: no id token anywhere
  assert.ok(![...t.store.data.values(), ...t.sbx.data.values()].some((v) => v.includes("id-1")));
});

test("ten concurrent getIdToken calls trigger exactly one refresh", async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const t = setup({
    secure: { [SESSION_KEY]: record() },
    api: { refresh: async () => (await gate, tokens(1)) },
  });
  await t.auth.start();
  const all = Promise.all(Array.from({ length: 10 }, () => t.auth.getIdToken()));
  release();
  const out = await all;
  assert.deepEqual(new Set(out), new Set(["id-1"]));
  assert.equal(t.network(), 1);
  // inflight is released: the next stale call may refresh again
  t.clock.t += 4000_000;
  await t.auth.getIdToken();
  assert.equal(t.network(), 2);
});

test("refresh failure offline, timeout or unknown keeps the session and returns null", async () => {
  for (const code of ["offline", "timeout", "unknown"]) {
    const t = setup({
      secure: { [SESSION_KEY]: record() },
      api: { refresh: async () => { throw new AuthError(code); } },
    });
    await t.auth.start();
    assert.equal(await t.auth.getIdToken(), null);
    assert.deepEqual(t.auth.getSession(), { status: "signedIn", uid: "u1", email: "a@b.co", provider: "password", offline: true });
    assert.equal(t.store.data.has(SESSION_KEY), true, code);
    assert.deepEqual(t.notices, []);
  }
  // a thrown non-AuthError also keeps the session
  const t = setup({ secure: { [SESSION_KEY]: record() }, api: { refresh: async () => { throw new Error("boom"); } } });
  await t.auth.start();
  assert.equal(await t.auth.getIdToken(), null);
  assert.equal(t.auth.getSession().status, "signedIn");
});

test("offline clears again after a successful refresh", async () => {
  let fail = true;
  const t = setup({
    secure: { [SESSION_KEY]: record() },
    api: { refresh: async () => { if (fail) throw new AuthError("offline"); return tokens(1); } },
  });
  await t.auth.start();
  await t.auth.getIdToken();
  assert.equal(t.auth.getSession().offline, true);
  fail = false;
  t.clock.t += 10_000; // refresh cooldown
  assert.equal(await t.auth.getIdToken(), "id-1");
  assert.equal(t.auth.getSession().offline, false);
});

test("an invalid refresh token (or a disabled user) signs out and clears the Keychain, with a notice", async () => {
  for (const code of ["sessionExpired", "disabled"]) {
    const t = setup({
      secure: { [SESSION_KEY]: record() },
      api: { refresh: async () => { throw new AuthError(code); } },
    });
    await t.auth.start();
    assert.equal(await t.auth.getIdToken(), null);
    assert.deepEqual(t.auth.getSession(), { status: "signedOut" });
    assert.equal(t.store.data.has(SESSION_KEY), false);
    assert.deepEqual(t.notices, ["sessionExpired"]);
    assert.equal(await t.auth.getIdToken(), null);
  }
});

test("signing out while a refresh is in flight does not resurrect the session", async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const t = setup({
    secure: { [SESSION_KEY]: record() },
    api: { refresh: async () => (await gate, tokens(1)) },
  });
  await t.auth.start();
  const pending = t.auth.getIdToken();
  await t.auth.signOut();
  release();
  assert.equal(await pending, null);
  assert.deepEqual(t.auth.getSession(), { status: "signedOut" });
  assert.equal(t.store.data.has(SESSION_KEY), false);
});

// ---- sign in, sign up, sign out ----------------------------------------------

test("signIn and signUp store the record, clear the pending flag, give a token without refresh", async () => {
  for (const method of ["signIn", "signUp"]) {
    const t = setup({ secure: { [PENDING_KEY]: "1" } });
    await t.auth.start();
    await t.auth[method](" A@B.co ", "pw-never-stored");
    assert.deepEqual(t.auth.getSession(), { status: "signedIn", uid: "u1", email: "a@b.co", provider: "password", offline: false });
    const stored = JSON.parse(t.store.data.get(SESSION_KEY));
    assert.deepEqual(Object.keys(stored).sort(), ["email", "provider", "refreshToken", "uid"]);
    assert.equal(t.store.data.has(PENDING_KEY), false);
    assert.equal(t.calls.refresh.length, 0);
    assert.ok(["id-2", "id-3"].includes(await t.auth.getIdToken()));
    assert.equal(t.calls.refresh.length, 0);
    for (const v of [...t.store.data.values(), ...t.sbx.data.values()])
      assert.ok(!v.includes("pw-never-stored"));
  }
});

test("signIn failure throws the AuthError and changes nothing", async () => {
  const t = setup({ api: { signIn: async () => { throw new AuthError("badCredentials"); } } });
  await t.auth.start();
  await assert.rejects(t.auth.signIn("a@b.co", "x"), (e) => e.code === "badCredentials");
  assert.deepEqual(t.auth.getSession(), { status: "signedOut" });
  assert.equal(t.store.data.has(SESSION_KEY), false);
});

test("a failed Keychain write keeps the session in memory", async () => {
  const t = setup();
  await t.auth.start();
  t.store.failWrite = true;
  await t.auth.signIn("a@b.co", "x");
  assert.equal(t.auth.getSession().status, "signedIn");
  assert.equal(await t.auth.getIdToken(), "id-2");
});

test("signOut clears secure storage and memory, makes no server call", async () => {
  const t = setup({ secure: { [SESSION_KEY]: record(), [PENDING_KEY]: "1" } });
  await t.auth.start();
  await t.auth.getIdToken();
  const before = t.network();
  await t.auth.signOut();
  assert.deepEqual(t.auth.getSession(), { status: "signedOut" });
  assert.equal(t.store.data.has(SESSION_KEY), false);
  assert.equal(t.network(), before);
  assert.equal(await t.auth.getIdToken(), null);
});

// ---- deletion ---------------------------------------------------------------

test("deleteAccount: re-authenticates first, flags, deletes, clears (in that order)", async () => {
  const order = [];
  const t = setup({
    secure: { [SESSION_KEY]: record() },
    api: {
      signIn: async () => (order.push("signIn"), tokens(5)),
      deleteAccount: async (id) => (order.push(`delete:${id}`), undefined),
    },
  });
  const origSet = t.store.set.bind(t.store);
  t.store.set = async (k, v) => { if (k === PENDING_KEY) order.push("pending"); return origSet(k, v); };
  await t.auth.start();
  await t.auth.deleteAccount("pw");
  assert.deepEqual(order, ["signIn", "pending", "delete:id-5"]);
  assert.deepEqual(t.auth.getSession(), { status: "signedOut" });
  assert.equal(t.store.data.has(SESSION_KEY), false);
  assert.equal(t.store.data.has(PENDING_KEY), false);
  assert.equal(await t.auth.getIdToken(), null);
});

test("deleteAccount with a wrong password stops before anything is flagged or deleted", async () => {
  const t = setup({
    secure: { [SESSION_KEY]: record() },
    api: { signIn: async () => { throw new AuthError("badCredentials"); } },
  });
  await t.auth.start();
  await assert.rejects(t.auth.deleteAccount("nope"), (e) => e.code === "badCredentials");
  assert.equal(t.calls.deleteAccount.length, 0);
  assert.equal(t.store.data.has(PENDING_KEY), false);
  assert.equal(t.auth.getSession().status, "signedIn");
  assert.equal(t.store.data.has(SESSION_KEY), true);
});

test("deleteAccount offline: session stays, flag dropped; timeout keeps the flag", async () => {
  for (const [code, flagKept] of [["offline", false], ["tooManyAttempts", false], ["timeout", true], ["unknown", true]]) {
    const t = setup({
      secure: { [SESSION_KEY]: record() },
      api: { deleteAccount: async () => { throw new AuthError(code); } },
    });
    await t.auth.start();
    await assert.rejects(t.auth.deleteAccount("pw"), (e) => e.code === code);
    assert.equal(t.auth.getSession().status, "signedIn", code);
    assert.equal(t.store.data.has(SESSION_KEY), true, code);
    assert.equal(t.store.data.has(PENDING_KEY), flagKept, code);
  }
});

test("deleteAccount: USER_NOT_FOUND from the server means the account is already gone", async () => {
  const t = setup({
    secure: { [SESSION_KEY]: record() },
    api: { deleteAccount: async () => { throw new AuthError("sessionExpired", "USER_NOT_FOUND"); } },
  });
  await t.auth.start();
  await t.auth.deleteAccount("pw");
  assert.deepEqual(t.auth.getSession(), { status: "signedOut" });
  assert.equal(t.store.data.has(SESSION_KEY), false);
});

test("deleteAccount: needsRecentLogin re-signs in and retries once", async () => {
  let n = 0;
  const t = setup({
    secure: { [SESSION_KEY]: record() },
    api: {
      deleteAccount: async () => { if (n++ === 0) throw new AuthError("needsRecentLogin"); },
    },
  });
  await t.auth.start();
  await t.auth.deleteAccount("pw");
  assert.equal(t.calls.signIn.length, 2);
  assert.equal(n, 2);
  assert.equal(t.auth.getSession().status, "signedOut");

  const again = setup({
    secure: { [SESSION_KEY]: record() },
    api: { deleteAccount: async () => { throw new AuthError("needsRecentLogin"); } },
  });
  await again.auth.start();
  await assert.rejects(again.auth.deleteAccount("pw"), (e) => e.code === "needsRecentLogin");
  assert.equal(again.calls.signIn.length, 2, "only one retry");
  assert.equal(again.auth.getSession().status, "signedIn");
});

test("deleteAccount while signed out is refused without network", async () => {
  const t = setup();
  await t.auth.start();
  await assert.rejects(t.auth.deleteAccount("pw"), (e) => e instanceof AuthError);
  assert.equal(t.network(), 0);
});

test("killed mid-delete: the pending flag signs out at launch and tells the user once", async () => {
  // First process: flag written, then the app dies before accounts:delete answers.
  const first = setup({
    secure: { [SESSION_KEY]: record() },
    api: { deleteAccount: () => new Promise(() => {}) }, // never answers
  });
  await first.auth.start();
  void first.auth.deleteAccount("pw");
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(first.store.data.get(PENDING_KEY), "1");
  // Second launch on the same Keychain.
  const second = setup({ secure: Object.fromEntries(first.store.data), sandbox: { [MARKER_KEY]: "1" } });
  await second.auth.start();
  assert.deepEqual(second.auth.getSession(), { status: "signedOut" });
  assert.deepEqual(second.notices, ["deleteIncomplete"]);
  assert.equal(second.store.data.has(SESSION_KEY), false);
  assert.equal(second.network(), 0);
  // Signing in with the same account works and the notice does not come back.
  await second.auth.signIn("a@b.co", "pw");
  assert.equal(second.auth.getSession().status, "signedIn");
  const third = setup({ secure: Object.fromEntries(second.store.data) });
  await third.auth.start();
  assert.deepEqual(third.notices, []);
  assert.equal(third.auth.getSession().status, "signedIn");
});

// ---- welcome flag -----------------------------------------------------------

test("welcome flag lives in the sandbox; unreadable gives null", async () => {
  const t = setup();
  assert.equal(await t.auth.getWelcomeDismissed(), false);
  await t.auth.dismissWelcome();
  assert.equal(await t.auth.getWelcomeDismissed(), true);
  assert.equal(t.sbx.data.get(SANDBOX_KEYS.welcomed), "1");
  assert.equal(t.store.data.size, 0, "never in the Keychain");
  t.sbx.failRead = true;
  assert.equal(await t.auth.getWelcomeDismissed(), null);
  t.sbx.failWrite = true;
  await t.auth.dismissWelcome(); // best effort, no throw
});

// ---- review fixes -------------------------------------------------------------

test("deleteAccount: a rejected or expired id token is not a deletion; one re-auth retry, then the session stays", async () => {
  for (const raw of ["INVALID_ID_TOKEN", "TOKEN_EXPIRED"]) {
    const t = setup({
      secure: { [SESSION_KEY]: record() },
      api: { deleteAccount: async () => { throw new AuthError("sessionExpired", raw); } },
    });
    await t.auth.start();
    await assert.rejects(t.auth.deleteAccount("pw"), (e) => e.code === "sessionExpired");
    assert.equal(t.auth.getSession().status, "signedIn", raw);
    assert.equal(t.store.data.has(SESSION_KEY), true, raw);
    assert.equal(t.store.data.has(PENDING_KEY), false, raw);
    assert.equal(t.calls.signIn.length, 2, "one retry");
  }
  let n = 0;
  const ok = setup({
    secure: { [SESSION_KEY]: record() },
    api: { deleteAccount: async () => { if (n++ === 0) throw new AuthError("sessionExpired", "TOKEN_EXPIRED"); } },
  });
  await ok.auth.start();
  await ok.auth.deleteAccount("pw");
  assert.equal(n, 2);
  assert.equal(ok.auth.getSession().status, "signedOut");
});

test("failed wipe is retried on the next launch (marker only after a completed wipe)", async () => {
  const secure = { [SESSION_KEY]: record() };
  const first = setup({ secure, sandbox: {} });
  const realDel = first.store.del.bind(first.store);
  first.store.del = async () => { throw new Error("keychain busy"); };
  await first.auth.start();
  assert.deepEqual(first.auth.getSession(), { status: "signedOut" });
  assert.equal(first.sbx.data.has(MARKER_KEY), false);
  first.store.del = realDel;
  const second = setup({ secure: Object.fromEntries(first.store.data), sandbox: Object.fromEntries(first.sbx.data) });
  await second.auth.start();
  assert.deepEqual(second.auth.getSession(), { status: "signedOut" });
  assert.equal(second.store.data.has(SESSION_KEY), false);
  assert.equal(second.sbx.data.get(MARKER_KEY), "1");
});

test("a marker write that failed is retried by the next sign-in", async () => {
  const t = setup({ sandbox: {} });
  t.sbx.failWrite = true;
  await t.auth.start();
  assert.equal(t.sbx.data.has(MARKER_KEY), false);
  t.sbx.failWrite = false;
  await t.auth.signIn("a@b.co", "pw");
  assert.equal(t.sbx.data.get(MARKER_KEY), "1");
  const next = setup({ secure: Object.fromEntries(t.store.data), sandbox: Object.fromEntries(t.sbx.data) });
  await next.auth.start();
  assert.equal(next.auth.getSession().status, "signedIn");
});

test("signIn while start() is still reading: the new session wins, nothing stale is restored", async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const t = setup({ secure: { [SESSION_KEY]: record({ refreshToken: "rt-old", uid: "old", email: "old@b.co" }) } });
  const realGet = t.store.get.bind(t.store);
  t.store.get = async (k) => (await gate, realGet(k));
  const starting = t.auth.start();
  await t.auth.signIn("a@b.co", "pw");
  release();
  await starting;
  assert.deepEqual(t.auth.getSession(), { status: "signedIn", uid: "u1", email: "a@b.co", provider: "password", offline: false });
  assert.equal(await t.auth.getIdToken(), "id-2");
  assert.equal(t.calls.refresh.length, 0);
  assert.equal(JSON.parse(t.store.data.get(SESSION_KEY)).refreshToken, "rt-2");
});

test("signOut while start() is still reading: stays signed out", async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const t = setup({ secure: { [SESSION_KEY]: record() } });
  const realGet = t.store.get.bind(t.store);
  t.store.get = async (k) => (await gate, realGet(k));
  const starting = t.auth.start();
  await t.auth.signOut();
  release();
  await starting;
  assert.equal(await t.auth.getIdToken(), null);
  assert.equal(t.store.data.has(SESSION_KEY), false);
});

test("a late Keychain write of account A never lands after signOut and signIn as B", async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const t = setup({ secure: { [SESSION_KEY]: record() } });
  await t.auth.start();
  const realSet = t.store.set.bind(t.store);
  let first = true;
  t.store.set = async (k, v) => {
    if (first) { first = false; await gate; }
    return realSet(k, v);
  };
  const pending = t.auth.getIdToken(); // refresh for A, its Keychain write hangs
  await new Promise((r) => setTimeout(r, 5));
  const signingOut = t.auth.signOut(); // queued behind A's write
  const signingIn = t.auth.signIn("b@b.co", "pw");
  await new Promise((r) => setTimeout(r, 5));
  release();
  await signingOut;
  await signingIn;
  await pending;
  const stored = JSON.parse(t.store.data.get(SESSION_KEY));
  assert.equal(stored.email, "b@b.co");
  assert.equal(stored.refreshToken, "rt-2");
});

test("getIdToken({force}) drops the cached token and refreshes once", async () => {
  const t = setup({ secure: { [SESSION_KEY]: record() } });
  await t.auth.start();
  assert.equal(await t.auth.getIdToken(), "id-1");
  assert.equal(await t.auth.getIdToken(), "id-1");
  assert.equal(t.network(), 1);
  await t.auth.getIdToken({ force: true });
  assert.equal(t.network(), 2);
  assert.equal(t.calls.refresh[1], "rt-1", "rotated token used");
});

test("failed refresh: sequential calls inside the cooldown make one request, then it grows and recovers", async () => {
  let fail = true;
  const t = setup({
    secure: { [SESSION_KEY]: record() },
    api: { refresh: async () => { if (fail) throw new AuthError("unknown"); return tokens(1); } },
  });
  await t.auth.start();
  for (let i = 0; i < 20; i++) assert.equal(await t.auth.getIdToken(), null);
  assert.equal(t.network(), 1);
  assert.equal(t.auth.getSession().offline, true);
  t.clock.t += 10_000;
  await t.auth.getIdToken();
  assert.equal(t.network(), 2);
  t.clock.t += 10_000;
  assert.equal(await t.auth.getIdToken(), null);
  assert.equal(t.network(), 2, "second failure waits 20 s");
  t.clock.t += 10_000;
  fail = false;
  assert.equal(await t.auth.getIdToken(), "id-1");
  assert.equal(t.network(), 3);
  // force skips the cooldown
  fail = true;
  t.clock.t += 4000_000;
  assert.equal(await t.auth.getIdToken(), null);
  fail = false;
  assert.equal(await t.auth.getIdToken({ force: true }), "id-1");
});

// ---- Sign in with Apple ---------------------------------------------------------

const CRED = { identityToken: "apple-id", rawNonce: "raw-nonce", authorizationCode: "auth-code" };

test("signInApple: raw nonce goes to the API, provider apple is persisted and restored", async () => {
  const t = setup();
  await t.auth.start();
  await t.auth.signInApple(CRED);
  assert.deepEqual(t.calls.apple, [["apple-id", "raw-nonce"]]);
  assert.deepEqual(t.auth.getSession(), {
    status: "signedIn", uid: "u1", email: "apple@b.co", provider: "apple", offline: false,
  });
  assert.equal(JSON.parse(t.store.data.get(SESSION_KEY)).provider, "apple");
  // A later launch restores the provider; a record without one is a password account.
  const again = setup({ secure: { [SESSION_KEY]: t.store.data.get(SESSION_KEY) } });
  await again.auth.start();
  assert.equal(again.auth.getSession().provider, "apple");
  const old = setup({ secure: { [SESSION_KEY]: record() } });
  await old.auth.start();
  assert.equal(old.auth.getSession().provider, "password");
  await t.auth.signIn("a@b.co", "pw");
  assert.equal(JSON.parse(t.store.data.get(SESSION_KEY)).provider, "password");
});

test("signInApple: no worker configured means no exchange and nothing extra stored", async () => {
  const t = setup();
  await t.auth.start();
  await t.auth.signInApple(CRED);
  assert.equal(t.store.data.has(SECURE_KEYS.appleRevoke), false);
});

test("signInApple: with a worker the Apple token is stored; an exchange failure never blocks sign-in", async () => {
  const seen = [];
  const ok = setup({ appleRevoke: { exchange: async (c) => (seen.push(c), "apple-rt"), revoke: async () => true } });
  await ok.auth.start();
  await ok.auth.signInApple(CRED);
  assert.deepEqual(seen, ["auth-code"]);
  assert.equal(ok.store.data.get(SECURE_KEYS.appleRevoke), "apple-rt");
  const bad = setup({ appleRevoke: { exchange: async () => null, revoke: async () => true } });
  await bad.auth.start();
  await bad.auth.signInApple(CRED);
  assert.equal(bad.auth.getSession().status, "signedIn");
  assert.equal(bad.store.data.has(SECURE_KEYS.appleRevoke), false);
});

test("signInApple: API failure keeps the session as it was", async () => {
  const t = setup({ api: { signInWithApple: async () => { throw new AuthError("appleRejected"); } } });
  await t.auth.start();
  await assert.rejects(t.auth.signInApple(CRED), (e) => e.code === "appleRejected");
  assert.equal(t.auth.getSession().status, "signedOut");
});

test("deleteAccount (Apple): no password, fresh id token from the refresh token, revokes, clears", async () => {
  const revoked = [];
  const t = setup({
    secure: { [SESSION_KEY]: record({ provider: "apple" }), [SECURE_KEYS.appleRevoke]: "apple-rt" },
    appleRevoke: { exchange: async () => null, revoke: async (rt) => (revoked.push(rt), true) },
  });
  await t.auth.start();
  await t.auth.deleteAccount();
  assert.deepEqual(t.calls.signIn, [], "never asks for a password");
  assert.deepEqual(t.calls.refresh, ["rt-0"]);
  assert.deepEqual(t.calls.deleteAccount, ["id-1"]);
  assert.deepEqual(revoked, ["apple-rt"]);
  assert.equal(t.auth.getSession().status, "signedOut");
  assert.equal(t.store.data.has(SESSION_KEY), false);
  assert.equal(t.store.data.has(SECURE_KEYS.appleRevoke), false);
});

test("deleteAccount (Apple): without a worker it still deletes the account and local data", async () => {
  const t = setup({ secure: { [SESSION_KEY]: record({ provider: "apple" }) } });
  await t.auth.start();
  await t.auth.deleteAccount();
  assert.deepEqual(t.calls.deleteAccount, ["id-1"]);
  assert.equal(t.auth.getSession().status, "signedOut");
});

test("signOut clears the stored Apple token", async () => {
  const t = setup({
    secure: { [SESSION_KEY]: record({ provider: "apple" }), [SECURE_KEYS.appleRevoke]: "apple-rt" },
  });
  await t.auth.start();
  await t.auth.signOut();
  assert.equal(t.store.data.has(SECURE_KEYS.appleRevoke), false);
});
