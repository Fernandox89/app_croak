import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";

import { useAuth } from "./auth";
import { DemoSource } from "./demo";
import { IS_DEMO } from "./edition";
import { createFirebaseSource, firebaseConfigured, subscribeMyDevices } from "./firebase";
import type { DataSource } from "./source";

export type SourceMode = "device" | "demo";

export interface Preferences {
  mode: SourceMode;
  deviceId: string;
  notifications: boolean;
}

const STORAGE_KEY = "croak-app-preferences";
const DEFAULT_DEVICE_ID = (import.meta.env.VITE_DEFAULT_DEVICE_ID as string | undefined) || "croak-01";
// En la edición demo no hay servidor: siempre se simula.
const CAN_USE_DEVICE = !IS_DEMO && firebaseConfigured;

function loadPreferences(): Preferences {
  const fallback: Preferences = {
    mode: CAN_USE_DEVICE ? "device" : "demo",
    deviceId: DEFAULT_DEVICE_ID,
    notifications: false,
  };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<Preferences> | null;
    const merged = { ...fallback, ...saved };
    if (!CAN_USE_DEVICE) merged.mode = "demo";
    return merged;
  } catch {
    return fallback;
  }
}

interface AppContextValue {
  prefs: Preferences;
  setPrefs: (p: Partial<Preferences>) => void;
  source: DataSource;
  /** Si esta compilación puede leer un dispositivo real. */
  canUseDevice: boolean;
  /** Dispositivos de la cuenta. undefined mientras carga; siempre [] en la edición demo. */
  devices: string[] | undefined;
}

const AppContext = createContext<AppContextValue | null>(null);

function savePreferences(p: Preferences) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // Sin almacenamiento (modo privado): las preferencias duran la sesión.
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefsState] = useState(loadPreferences);
  const auth = useAuth();
  const uid = auth?.user.uid;
  const [devices, setDevices] = useState<string[] | undefined>(CAN_USE_DEVICE ? undefined : []);

  const setPrefs = (p: Partial<Preferences>) =>
    setPrefsState((prev) => {
      const next = { ...prev, ...p };
      savePreferences(next);
      return next;
    });

  useEffect(() => {
    if (!CAN_USE_DEVICE || !uid) return;
    return subscribeMyDevices(uid, setDevices, () => setDevices([]));
  }, [uid]);

  // Si el dispositivo guardado no es de esta cuenta, se elige el primero que sí lo sea.
  useEffect(() => {
    if (devices?.length && !devices.includes(prefs.deviceId)) setPrefs({ deviceId: devices[0] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devices, prefs.deviceId]);

  const source = useMemo<DataSource>(
    () =>
      prefs.mode === "device" && CAN_USE_DEVICE ? createFirebaseSource(prefs.deviceId) : new DemoSource(prefs.deviceId),
    [prefs.mode, prefs.deviceId],
  );
  useEffect(() => () => source.dispose(), [source]);

  const value = useMemo<AppContextValue>(
    () => ({ prefs, source, canUseDevice: CAN_USE_DEVICE, devices, setPrefs }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prefs, source, devices],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp fuera de AppProvider");
  return ctx;
}
