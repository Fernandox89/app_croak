import { type FirebaseApp, initializeApp } from "firebase/app";
import {
  type Auth,
  type User,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
} from "firebase/auth";
import {
  type Database,
  getDatabase,
  limitToLast,
  onValue,
  orderByChild,
  query,
  ref,
  serverTimestamp,
  set,
  startAt,
  update,
} from "firebase/database";

import type { DataSource, Unsubscribe } from "./source";
import type { AlertEvent, DeviceConfig, DeviceStatus, Maintenance, Reading } from "./types";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
};

export const firebaseConfigured = Boolean(config.apiKey && config.databaseURL && config.projectId);

let app: FirebaseApp | null = null;
let db: Database | null = null;
let auth: Auth | null = null;

function init() {
  if (!firebaseConfigured) throw new Error("Firebase no está configurado");
  if (!app) {
    app = initializeApp(config);
    db = getDatabase(app);
    auth = getAuth(app);
    auth.languageCode = "es";
  }
  return { db: db!, auth: auth! };
}

// Sesión de la cuenta del equipo. La app solo crea fuentes de datos con una sesión abierta.
export function watchUser(cb: (u: User | null) => void) {
  return onAuthStateChanged(init().auth, cb);
}

export async function signIn(email: string, password: string) {
  await signInWithEmailAndPassword(init().auth, email.trim(), password);
}

export async function signOut() {
  await fbSignOut(init().auth);
}

export async function resetPassword(email: string) {
  await sendPasswordResetEmail(init().auth, email.trim());
}

export function authErrorMessage(e: unknown): string {
  const code = (e as { code?: string })?.code ?? "";
  if (["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found", "auth/invalid-login-credentials"].includes(code)) {
    return "Correo o contraseña incorrectos.";
  }
  if (code === "auth/invalid-email") return "El correo no tiene un formato válido.";
  if (code === "auth/user-disabled") return "Esta cuenta está desactivada.";
  if (code === "auth/too-many-requests") return "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.";
  if (code === "auth/network-request-failed") return "Sin conexión. Revisa tu red e inténtalo de nuevo.";
  return "No se pudo iniciar sesión. Inténtalo de nuevo.";
}

/** Dispositivos a los que tiene acceso la cuenta (users/{uid}/devices). */
export function subscribeMyDevices(uid: string, cb: (ids: string[]) => void, onError: (e: unknown) => void) {
  const { db } = init();
  return onValue(
    ref(db, `users/${uid}/devices`),
    (snap) => cb(Object.keys((snap.val() as Record<string, unknown> | null) ?? {}).sort()),
    onError,
  );
}

function describeError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? "";
  if (code.includes("PERMISSION_DENIED") || code.includes("permission-denied")) {
    return "Tu cuenta no tiene acceso a este dispositivo.";
  }
  return "No se pudo conectar con el servidor de datos.";
}

export function createFirebaseSource(deviceId: string): DataSource {
  const { db, auth } = init();
  // La fuente se crea con la sesión abierta; esto solo espera a que el SDK la tenga lista.
  const authReady = auth.authStateReady();
  const base = `devices/${deviceId}`;
  let offset = 0;
  let errorListener: ((m: string | null) => void) | null = null;
  const reportError = (e: unknown) => errorListener?.(describeError(e));
  const cleanups: Unsubscribe[] = [];

  cleanups.push(onValue(ref(db, ".info/serverTimeOffset"), (s) => (offset = Number(s.val()) || 0)));

  // Espera la sesión antes de escuchar una ruta protegida.
  function listen<T>(build: () => Parameters<typeof onValue>[0], map: (v: unknown) => T, cb: (v: T) => void) {
    let stop: Unsubscribe | null = null;
    let cancelled = false;
    authReady
      .then(() => {
        if (cancelled) return;
        stop = onValue(
          build(),
          (snap) => {
            errorListener?.(null);
            cb(map(snap.val()));
          },
          reportError,
        );
      })
      .catch(reportError);
    return () => {
      cancelled = true;
      stop?.();
    };
  }

  function listOf<T>(v: unknown): (T & { id: string })[] {
    if (!v || typeof v !== "object") return [];
    return Object.entries(v as Record<string, T>).map(([id, item]) => ({ ...item, id }));
  }

  return {
    kind: "firebase",
    deviceId,
    subscribeLatest: (cb) => listen(() => ref(db, `${base}/latest`), (v) => (v as Reading) ?? null, cb),
    subscribeStatus: (cb) => listen(() => ref(db, `${base}/status`), (v) => (v as DeviceStatus) ?? null, cb),
    subscribeConfig: (cb) => listen(() => ref(db, `${base}/config`), (v) => (v as DeviceConfig) ?? null, cb),
    subscribeHistory: (sinceMs, cb) =>
      listen(
        () => query(ref(db, `${base}/readings`), orderByChild("ts"), startAt(sinceMs), limitToLast(3000)),
        (v) => listOf<Reading>(v).sort((a, b) => a.ts - b.ts),
        cb,
      ),
    subscribeAlerts: (limit, cb) =>
      listen(
        () => query(ref(db, `${base}/alerts`), orderByChild("ts"), limitToLast(limit)),
        (v) => listOf<Omit<AlertEvent, "id">>(v).sort((a, b) => b.ts - a.ts) as AlertEvent[],
        cb,
      ),
    subscribeMaintenance: (cb) =>
      listen(() => ref(db, `${base}/maintenance`), (v) => (v as Maintenance) ?? null, cb),
    markMaintenance: async (key) => {
      await authReady;
      await update(ref(db, `${base}/maintenance`), { [key]: serverTimestamp() });
    },
    saveConfig: async (c) => {
      await authReady;
      await set(ref(db, `${base}/config`), c);
    },
    now: () => Date.now() + offset,
    subscribeError: (cb) => {
      errorListener = cb;
      return () => (errorListener = null);
    },
    dispose: () => cleanups.forEach((c) => c()),
  };
}
