import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";

import { DemoSource } from "./demo";
import { createFirebaseSource, firebaseConfigured } from "./firebase";
import type { DataSource } from "./source";

export type SourceMode = "device" | "demo";

export interface Preferences {
  mode: SourceMode;
  deviceId: string;
  notifications: boolean;
}

const STORAGE_KEY = "croak-app-preferences";
const DEFAULT_DEVICE_ID = (import.meta.env.VITE_DEFAULT_DEVICE_ID as string | undefined) || "croak-01";

function loadPreferences(): Preferences {
  const fallback: Preferences = {
    mode: firebaseConfigured ? "device" : "demo",
    deviceId: DEFAULT_DEVICE_ID,
    notifications: false,
  };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<Preferences> | null;
    const merged = { ...fallback, ...saved };
    if (!firebaseConfigured) merged.mode = "demo";
    return merged;
  } catch {
    return fallback;
  }
}

interface AppContextValue {
  prefs: Preferences;
  setPrefs: (p: Partial<Preferences>) => void;
  source: DataSource;
  firebaseConfigured: boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefsState] = useState(loadPreferences);

  const source = useMemo<DataSource>(
    () => (prefs.mode === "device" && firebaseConfigured ? createFirebaseSource(prefs.deviceId) : new DemoSource(prefs.deviceId)),
    [prefs.mode, prefs.deviceId],
  );
  useEffect(() => () => source.dispose(), [source]);

  const value = useMemo<AppContextValue>(
    () => ({
      prefs,
      source,
      firebaseConfigured,
      setPrefs: (p) =>
        setPrefsState((prev) => {
          const next = { ...prev, ...p };
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          } catch {
            // Sin almacenamiento (modo privado): las preferencias duran la sesión.
          }
          return next;
        }),
    }),
    [prefs, source],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp fuera de AppProvider");
  return ctx;
}
