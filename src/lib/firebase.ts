import { type FirebaseApp, initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInAnonymously } from "firebase/auth";
import {
  type Database,
  getDatabase,
  limitToLast,
  onValue,
  orderByChild,
  query,
  ref,
  set,
  startAt,
} from "firebase/database";

import type { DataSource, Unsubscribe } from "./source";
import type { AlertEvent, DeviceConfig, DeviceStatus, Reading } from "./types";

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
let authReady: Promise<void> | null = null;

function init() {
  if (!firebaseConfigured) throw new Error("Firebase no está configurado");
  if (!app) {
    app = initializeApp(config);
    db = getDatabase(app);
    const auth = getAuth(app);
    // Las reglas piden sesión para leer: la app entra como usuario anónimo.
    authReady = new Promise((resolve, reject) => {
      const stop = onAuthStateChanged(auth, (user) => {
        if (user) {
          stop();
          resolve();
        }
      });
      signInAnonymously(auth).catch((e) => {
        stop();
        reject(e);
      });
    });
  }
  return { db: db!, authReady: authReady! };
}

function describeError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? "";
  if (code.includes("PERMISSION_DENIED") || code.includes("permission-denied")) {
    return "Sin permiso para leer los datos del dispositivo. Revisa las reglas de la base de datos.";
  }
  if (code.includes("admin-restricted-operation") || code.includes("operation-not-allowed")) {
    return "El acceso anónimo no está activado en Firebase Authentication.";
  }
  return "No se pudo conectar con el servidor de datos.";
}

export function createFirebaseSource(deviceId: string): DataSource {
  const { db, authReady } = init();
  const base = `devices/${deviceId}`;
  let offset = 0;
  let errorListener: ((m: string | null) => void) | null = null;
  const reportError = (e: unknown) => errorListener?.(describeError(e));
  const cleanups: Unsubscribe[] = [];

  cleanups.push(onValue(ref(db, ".info/serverTimeOffset"), (s) => (offset = Number(s.val()) || 0)));

  // Espera la sesión anónima antes de escuchar una ruta protegida.
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
