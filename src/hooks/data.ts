import { useEffect, useMemo, useState } from "react";

import { useApp } from "../lib/app-context";
import type { Unsubscribe } from "../lib/source";
import { type AlertEvent, DEFAULT_CONFIG, type DeviceConfig, type DeviceStatus, type Maintenance, type Reading } from "../lib/types";

/** `undefined` mientras carga; después, el valor (que puede ser null si no hay datos). */
function useSubscription<T>(subscribe: (cb: (v: T) => void) => Unsubscribe, deps: unknown[]): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined);
  useEffect(() => {
    setValue(undefined);
    return subscribe(setValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}

export function useLatest() {
  const { source } = useApp();
  return useSubscription<Reading | null>((cb) => source.subscribeLatest(cb), [source]);
}

export function useStatus() {
  const { source } = useApp();
  return useSubscription<DeviceStatus | null>((cb) => source.subscribeStatus(cb), [source]);
}

export function useConfig(): DeviceConfig {
  const { source } = useApp();
  const c = useSubscription<DeviceConfig | null>((cb) => source.subscribeConfig(cb), [source]);
  return {
    interval_s: c?.interval_s ?? DEFAULT_CONFIG.interval_s,
    thresholds: { ...DEFAULT_CONFIG.thresholds, ...(c?.thresholds ?? {}) },
  };
}

export function useHistory(windowMs: number) {
  const { source } = useApp();
  // El inicio de la ventana se fija al suscribirse y se renueva al cambiar de rango; la gráfica recorta el resto.
  const since = useMemo(() => source.now() - windowMs, [source, windowMs]);
  return useSubscription<Reading[]>((cb) => source.subscribeHistory(since, cb), [source, since]);
}

export function useAlerts(limit = 100) {
  const { source } = useApp();
  return useSubscription<AlertEvent[]>((cb) => source.subscribeAlerts(limit, cb), [source, limit]);
}

export function useMaintenance() {
  const { source } = useApp();
  return useSubscription<Maintenance | null>((cb) => source.subscribeMaintenance(cb), [source]);
}

export function useSourceError() {
  const { source } = useApp();
  return useSubscription<string | null>((cb) => source.subscribeError(cb), [source]) ?? null;
}

/** Hora del servidor, refrescada cada `everyMs` para textos como "hace 12 s". */
export function useNow(everyMs = 1000) {
  const { source } = useApp();
  const [now, setNow] = useState(() => source.now());
  useEffect(() => {
    const id = setInterval(() => setNow(source.now()), everyMs);
    return () => clearInterval(id);
  }, [source, everyMs]);
  return now;
}
