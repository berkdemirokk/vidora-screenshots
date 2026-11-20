// Run with: node --test apps/mobile/src/auth/*.test.mjs  (in-memory file system)
import assert from "node:assert/strict";
import test from "node:test";
import { SANDBOX_KEYS, SECURE_KEYS } from "./config.ts";
import { SANDBOX_FILE, TMP, createSandboxKV } from "./sandbox-file.ts";
import { createAuth } from "./session.ts";

function memoryFs(initial = {}) {
  const files = new Map(Object.entries(initial));
  return {
    files,
    failRead: false,
    failWrite: false,
    exists(name) {
      return files.has(name);
    },
    read(name) {
      if (this.failRead) throw new Error("I/O error");
      return files.get(name);
    },
    write(name, text) {
      if (this.failWrite) throw new Error("disk full");
      files.set(name, text);
    },
  };
}

test("no file: get is null, nothing is created by reading", async () => {
  const fs = memoryFs();
  const kv = createSandboxKV(fs);
  assert.equal(await kv.get("launched.v1"), null);
  assert.equal(fs.files.size, 0);
});

test("set then get, several keys survive each other, del removes one", async () => {
  const fs = memoryFs();
  const kv = createSandboxKV(fs);
  await kv.set("a", "1");
  await kv.set("b", "2");
  assert.equal(await kv.get("a"), "1");
  assert.equal(await kv.get("b"), "2");
  assert.deepEqual(JSON.parse(fs.files.get(SANDBOX_FILE)), { a: "1", b: "2" });
  await kv.del("a");
  assert.equal(await kv.get("a"), null);
  assert.equal(await kv.get("b"), "2");
  await kv.del("missing"); // no error, no write needed
});

test("get THROWS on an I/O error (never reads as missing)", async () => {
  const fs = memoryFs({ [SANDBOX_FILE]: '{"launched.v1":"1"}' });
  const kv = createSandboxKV(fs);
  fs.failRead = true;
  await assert.rejects(kv.get("launched.v1"));
});

test("get THROWS on a corrupt file; a file that is not an object is corrupt too", async () => {
  for (const text of ["{nope", "", "[1,2]", "null", '"x"']) {
    const kv = createSandboxKV(memoryFs({ [SANDBOX_FILE]: text }));
    await assert.rejects(kv.get("launched.v1"), text);
  }
});

test("non-string values are ignored, prototype names are not keys", async () => {
  const kv = createSandboxKV(memoryFs({ [SANDBOX_FILE]: '{"a":1,"b":"x"}' }));
  assert.equal(await kv.get("a"), null);
  assert.equal(await kv.get("b"), "x");
  assert.equal(await kv.get("constructor"), null);
  assert.equal(await kv.get("__proto__"), null);
});

test("a failed write rejects and leaves the file as it was; a failed read on set does not overwrite", async () => {
  const fs = memoryFs({ [SANDBOX_FILE]: '{"launched.v1":"1"}' });
  const kv = createSandboxKV(fs);
  fs.failWrite = true;
  await assert.rejects(kv.set("welcomed.v1", "1"));
  fs.failWrite = false;
  assert.equal(fs.files.get(SANDBOX_FILE), '{"launched.v1":"1"}');
  fs.failRead = true;
  await assert.rejects(kv.set("welcomed.v1", "1"));
  fs.failRead = false;
  assert.equal(
    fs.files.get(SANDBOX_FILE),
    '{"launched.v1":"1"}',
    "an unreadable file is never replaced",
  );
  // The queue is not poisoned by a failure.
  await kv.set("welcomed.v1", "1");
  assert.equal(await kv.get("welcomed.v1"), "1");
});

test("a corrupt file is healed by the next set, and keeps the launch marker true", async () => {
  const fs = memoryFs({ [SANDBOX_FILE]: "{broken" });
  const kv = createSandboxKV(fs);
  await kv.set(SANDBOX_KEYS.welcomed, "1");
  assert.equal(await kv.get(SANDBOX_KEYS.welcomed), "1");
  assert.equal(
    await kv.get(SANDBOX_KEYS.launched),
    "1",
    "else the next launch would wipe the Keychain",
  );
});

test("a complete .tmp next to a missing file is read; a half-written .tmp alone is no file", async () => {
  const done = createSandboxKV(
    memoryFs({ [SANDBOX_FILE + TMP]: '{"launched.v1":"1"}' }),
  );
  assert.equal(await done.get("launched.v1"), "1");
  const half = createSandboxKV(
    memoryFs({ [SANDBOX_FILE + TMP]: '{"launched' }),
  );
  assert.equal(await half.get("launched.v1"), null);
  // Main unreadable but the .tmp complete: the tmp wins.
  const both = createSandboxKV(
    memoryFs({ [SANDBOX_FILE]: "{x", [SANDBOX_FILE + TMP]: '{"a":"1"}' }),
  );
  assert.equal(await both.get("a"), "1");
});

test("concurrent sets do not lose each other's keys", async () => {
  const fs = memoryFs();
  const kv = createSandboxKV(fs);
  await Promise.all(
    ["a", "b", "c", "d", "e"].map((k) => kv.set(k, k.toUpperCase())),
  );
  for (const k of ["a", "b", "c", "d", "e"])
    assert.equal(await kv.get(k), k.toUpperCase());
});

// ---- together with createAuth: an unreadable file never signs anyone out ----------

function keychain(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    async get(k) {
      return data.has(k) ? data.get(k) : null;
    },
    async set(k, v) {
      data.set(k, v);
    },
    async del(k) {
      data.delete(k);
    },
  };
}
const record = JSON.stringify({
  refreshToken: "rt",
  uid: "u1",
  email: "a@b.co",
});
const noApi = new Proxy(
  {},
  { get: () => () => assert.fail("no network at launch") },
);

test("start() with a readable launch marker restores the session", async () => {
  const store = keychain({ [SECURE_KEYS.session]: record });
  const sandbox = createSandboxKV(
    memoryFs({ [SANDBOX_FILE]: `{"${SANDBOX_KEYS.launched}":"1"}` }),
  );
  const seen = [];
  const auth = createAuth({
    store,
    sandbox,
    api: noApi,
    onChange: (s) => seen.push(s.status),
  });
  await auth.start();
  assert.equal(auth.getSession().status, "signedIn");
  assert.ok(store.data.has(SECURE_KEYS.session));
});

test("start() after a reinstall (no file) wipes the Keychain record and records the marker", async () => {
  const store = keychain({ [SECURE_KEYS.session]: record });
  const fs = memoryFs();
  const auth = createAuth({
    store,
    sandbox: createSandboxKV(fs),
    api: noApi,
    onChange: () => {},
  });
  await auth.start();
  assert.equal(auth.getSession().status, "signedOut");
  assert.equal(store.data.has(SECURE_KEYS.session), false);
  assert.equal(
    JSON.parse(fs.files.get(SANDBOX_FILE))[SANDBOX_KEYS.launched],
    "1",
  );
});

test("start() with an unreadable or corrupt file keeps the Keychain record and the session", async () => {
  for (const mode of ["io", "corrupt"]) {
    const store = keychain({ [SECURE_KEYS.session]: record });
    const fs = memoryFs({
      [SANDBOX_FILE]:
        mode === "corrupt" ? "{broken" : `{"${SANDBOX_KEYS.launched}":"1"}`,
    });
    fs.failRead = mode === "io";
    const auth = createAuth({
      store,
      sandbox: createSandboxKV(fs),
      api: noApi,
      onChange: () => {},
    });
    await auth.start();
    assert.equal(auth.getSession().status, "signedIn", mode);
    assert.ok(store.data.has(SECURE_KEYS.session), mode);
    assert.equal(
      await auth.getWelcomeDismissed(),
      null,
      `${mode}: unreadable flag reads as null`,
    );
  }
});

test("welcome flag: unset is false, dismissWelcome persists it", async () => {
  const fs = memoryFs({ [SANDBOX_FILE]: `{"${SANDBOX_KEYS.launched}":"1"}` });
  const auth = createAuth({
    store: keychain(),
    sandbox: createSandboxKV(fs),
    api: noApi,
    onChange: () => {},
  });
  assert.equal(await auth.getWelcomeDismissed(), false);
  await auth.dismissWelcome();
  assert.equal(await auth.getWelcomeDismissed(), true);
  assert.equal(
    JSON.parse(fs.files.get(SANDBOX_FILE))[SANDBOX_KEYS.launched],
    "1",
    "other keys kept",
  );
});
