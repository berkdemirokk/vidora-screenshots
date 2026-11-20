/**
 * Auth for the screens: `AuthProvider` + `useAuth()`. The session logic is
 * src/auth/session.ts (pure); this file only wires it to the real Keychain,
 * the app sandbox file and React.
 *
 * Off switch: when FEATURES.accounts is false the provider is inert. It never
 * touches SecureStore or the file system and never uses the network;
 * `useAuth()` is a signed-out, ready state whose actions reject (or do
 * nothing), so a build without accounts behaves like one that never had them.
 *
 * Nothing waits for start(): the provider renders its children at once and
 * the session restores in the background (no network at launch either).
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as SecureStore from "expo-secure-store";
import { File, Paths } from "expo-file-system";
import { FEATURES } from "../config";
import { Language } from "../ui";
import type { Lang } from "./copy";
import { createAppleRevoke } from "./apple-revoke";
import { APPLE_REVOKE_URL } from "./config";
import type { AppleCredential } from "./apple";
import { AuthError } from "./firebase-rest";
import * as rest from "./firebase-rest";
import { TMP, createSandboxKV } from "./sandbox-file";
import type { Fs } from "./sandbox-file";
import { INITIAL_SESSION, createAuth } from "./session";
import type { KV, Notice as AuthNotice, Session } from "./session";

export type { AuthNotice, Session };

/** Karşılama (welcome) row state: `ready` once the flag has been read. */
export type Welcome = { ready: boolean; dismissed: boolean };

export type AuthContextValue = {
  session: Session;
  /** "sessionExpired" / "deleteIncomplete": show once on the account screen, then clearNotice(). */
  notice: AuthNotice | null;
  clearNotice: () => void;
  welcome: Welcome;
  dismissWelcome: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  /** Credential from apple-native.ts signInWithAppleNative(). */
  signInApple: (credential: AppleCredential) => Promise<void>;
  signOut: () => Promise<void>;
  /** Re-authenticates with the password (Apple users: no password); throws AuthError (the session stays on failure). */
  deleteAccount: (password?: string) => Promise<void>;
  /** Same outcome for known and unknown addresses. `locale` defaults to the app language. */
  resetPassword: (email: string, locale?: Lang) => Promise<void>;
  getIdToken: (opts?: { force?: boolean }) => Promise<string | null>;
};

// ---- real storage -------------------------------------------------------------

const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/**
 * Keychain. Only `get` turns a failure into "missing" (session.ts treats a
 * missing or unreadable record as signed out, and a failed read never deletes
 * anything). `set` and `del` must REJECT on failure: every call site in
 * session.ts wraps them and relies on the result (a wipe that did not happen
 * must not be recorded as done). Deleting a missing key is not an error.
 */
export const secureKV: KV = {
  async get(key) {
    try {
      return await SecureStore.getItemAsync(key, SECURE_OPTIONS);
    } catch {
      return null;
    }
  },
  set: (key, value) => SecureStore.setItemAsync(key, value, SECURE_OPTIONS),
  del: (key) => SecureStore.deleteItemAsync(key, SECURE_OPTIONS),
};

/**
 * The sandbox file (sandbox-file.ts explains why it exists and what its KV
 * guarantees). Written like draft-store.ts: a `.tmp` copy first, then moved
 * over the real name. `get` throws on read errors, so an unreadable file never
 * signs anybody out.
 */
const documentFs: Fs = {
  exists: (name) => new File(Paths.document, name).exists,
  read: (name) => new File(Paths.document, name).textSync(),
  write(name, text) {
    const dest = new File(Paths.document, name);
    const temp = new File(dest.uri + TMP);
    if (temp.exists) temp.delete();
    temp.create();
    temp.writeSync(text);
    temp.moveSync(dest, { overwrite: true });
  },
};

export const sandboxKV: KV = createSandboxKV(documentFs);

// ---- the context -------------------------------------------------------------

const unavailable = () => Promise.reject(new AuthError("unknown"));

/** Accounts off: signed out, ready, welcome already "dismissed" so nothing shows. */
const INERT: AuthContextValue = {
  session: { status: "signedOut" },
  notice: null,
  clearNotice: () => {},
  welcome: { ready: true, dismissed: true },
  dismissWelcome: () => Promise.resolve(),
  signIn: unavailable,
  signUp: unavailable,
  signInApple: unavailable,
  signOut: () => Promise.resolve(),
  deleteAccount: unavailable,
  resetPassword: unavailable,
  getIdToken: () => Promise.resolve(null),
};

const AuthContext = createContext<AuthContextValue>(INERT);

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  if (!FEATURES.accounts)
    return (
      <AuthContext.Provider value={INERT}>{children}</AuthContext.Provider>
    );
  return <ActiveProvider>{children}</ActiveProvider>;
}

function ActiveProvider({ children }: { children: ReactNode }) {
  const { lang } = useContext(Language);
  const langRef = useRef<Lang>(lang);
  useEffect(() => {
    langRef.current = lang;
  }, [lang]);

  const [session, setSession] = useState<Session>(INITIAL_SESSION);
  const [notice, setNotice] = useState<AuthNotice | null>(null);
  const [welcome, setWelcome] = useState<Welcome>({
    ready: false,
    dismissed: false,
  });
  // Created once. The notice callback is handed over here, before start().
  const [auth] = useState(() =>
    createAuth({
      store: secureKV,
      sandbox: sandboxKV,
      api: rest,
      appleRevoke: createAppleRevoke(APPLE_REVOKE_URL),
      onChange: setSession,
      onNotice: setNotice,
    }),
  );

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        await auth.start();
        // null: the file could not be read; the welcome row then stays hidden.
        const dismissed = await auth.getWelcomeDismissed();
        if (live && dismissed !== null) setWelcome({ ready: true, dismissed });
      } catch {
        // start() does not throw by design; if it ever does, signed out is the safe state.
        if (live)
          setSession((s) =>
            s.status === "loading" ? { status: "signedOut" } : s,
          );
      }
    })();
    return () => {
      live = false;
    };
  }, [auth]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      notice,
      clearNotice: () => setNotice(null),
      welcome,
      dismissWelcome: async () => {
        setWelcome((w) => ({ ...w, dismissed: true }));
        await auth.dismissWelcome();
      },
      // Whoever has signed in or created an account is never invited again
      // by the Library's welcome line (also after signing out later).
      signIn: async (email, password) => {
        await auth.signIn(email, password);
        setWelcome((w) => (w.dismissed ? w : { ...w, dismissed: true }));
        void auth.dismissWelcome().catch(() => undefined);
      },
      signUp: async (email, password) => {
        await auth.signUp(email, password);
        setWelcome((w) => (w.dismissed ? w : { ...w, dismissed: true }));
        void auth.dismissWelcome().catch(() => undefined);
      },
      signInApple: async (credential) => {
        await auth.signInApple(credential);
        setWelcome((w) => (w.dismissed ? w : { ...w, dismissed: true }));
        void auth.dismissWelcome().catch(() => undefined);
      },
      signOut: () => auth.signOut(),
      deleteAccount: (password) => auth.deleteAccount(password),
      resetPassword: (email, locale) =>
        rest.sendPasswordReset(email, locale ?? langRef.current),
      getIdToken: (opts) => auth.getIdToken(opts),
    }),
    [session, notice, welcome, auth],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
