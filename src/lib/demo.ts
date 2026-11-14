// Simulador para el modo demostración. Imita al firmware: misma forma de datos, mismas reglas de alerta
// (con lecturas consecutivas) y mismo comportamiento de calibración. Nada de esto viene de un sensor real,
// y la interfaz lo indica en todo momento.

import type { DataSource, Unsubscribe } from "./source";
import {
  type AlertEvent,
  type AlertParam,
  type ChannelReading,
  DEFAULT_CONFIG,
  type DeviceConfig,
  type DeviceStatus,
  type Maintenance,
  type MaintenanceKey,
  type Reading,
} from "./types";

export type DemoScenario = "normal" | "turbidity" | "tds" | "acid" | "sensor";

export const DEMO_SCENARIOS: { id: DemoScenario; label: string; description: string }[] = [
  { id: "normal", label: "Condición estable", description: "Valores dentro de los intervalos configurados." },
  { id: "turbidity", label: "Aumento de turbidez", description: "Sedimento en suspensión, por ejemplo tras lavar el tinaco." },
  { id: "tds", label: "Aumento de sólidos disueltos", description: "Cambio en la fuente de suministro." },
  { id: "acid", label: "Descenso de pH", description: "Agua más ácida de lo habitual." },
  { id: "sensor", label: "Falla del sensor de pH", description: "El electrodo deja de entregar señal." },
];

const TARGETS: Record<DemoScenario, { ph: number; turbidity: number; tds: number }> = {
  normal: { ph: 7.25, turbidity: 3, tds: 240 },
  turbidity: { ph: 7.1, turbidity: 46, tds: 310 },
  tds: { ph: 7.6, turbidity: 6, tds: 1240 },
  acid: { ph: 5.7, turbidity: 4, tds: 280 },
  sensor: { ph: 7.25, turbidity: 3, tds: 240 },
};

const LIVE_INTERVAL_MS = 3000;
const HISTORY_STEP_MS = 60 * 1000;
const HISTORY_SPAN_MS = 24 * 60 * 60 * 1000;
const FW = "0.1.0";

function noise(scale: number) {
  return (Math.random() - 0.5) * 2 * scale;
}

// Voltaje aproximado que daría cada sensor, para que los datos crudos también sean coherentes.
function channel(kind: "ph" | "turbidity" | "tds", value: number | null, fault = false): ChannelReading {
  if (fault || value === null) {
    return { value: null, unit: unitOf(kind), sensor_v: 0, adc_mv: 0, status: "no_signal", calibration: calOf(kind) };
  }
  const v = kind === "ph" ? 2.5 - (value - 7) * 0.18 : kind === "turbidity" ? 4.2 * (1 - value / 100) : tdsToVolts(value);
  const divider = kind === "ph" ? 22 / 37 : kind === "turbidity" ? 39 / 61 : 1;
  return {
    value: Math.round(value * 100) / 100,
    unit: unitOf(kind),
    sensor_v: Math.round(v * 1000) / 1000,
    adc_mv: Math.round(v * divider * 1000),
    status: "ok",
    calibration: calOf(kind),
  };
}

function unitOf(kind: string) {
  return kind === "ph" ? "pH" : kind === "turbidity" ? "rel_pct" : "ppm";
}

function calOf(kind: string) {
  return kind === "ph" ? "2 puntos" : kind === "turbidity" ? "agua_ref" : "fabrica";
}

function tdsToVolts(ppm: number) {
  // Inversa aproximada de la curva del SEN0244 en su zona lineal.
  return ppm / (857.39 * 0.5);
}

interface RuleState {
  out: number;
  inside: number;
  active: boolean;
}

export class DemoSource implements DataSource {
  readonly kind = "demo" as const;
  readonly deviceId: string;

  private scenario: DemoScenario = "normal";
  private current = { ...TARGETS.normal };
  private history: Reading[] = [];
  private alerts: AlertEvent[] = [];
  private config: DeviceConfig = structuredClone(DEFAULT_CONFIG);
  // Fechas de ejemplo: la limpieza del tinaco aparece vencida para mostrar el recordatorio.
  private maintenance: Maintenance = {
    calibrated_at: Date.now() - 41 * 86_400_000,
    tank_cleaned_at: Date.now() - 197 * 86_400_000,
    probes_cleaned_at: Date.now() - 12 * 86_400_000,
  };
  private seq = 0;
  private startedAt = Date.now();
  private rules = new Map<AlertParam, RuleState>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners = {
    latest: new Set<(r: Reading | null) => void>(),
    status: new Set<(s: DeviceStatus | null) => void>(),
    config: new Set<(c: DeviceConfig | null) => void>(),
    history: new Set<{ since: number; cb: (rs: Reading[]) => void }>(),
    alerts: new Set<{ limit: number; cb: (a: AlertEvent[]) => void }>(),
    scenario: new Set<(s: DemoScenario) => void>(),
    maintenance: new Set<(m: Maintenance | null) => void>(),
  };

  constructor(deviceId: string) {
    this.deviceId = deviceId;
    this.seedHistory();
  }

  // Un día de historial con un ciclo suave, para que las tendencias no aparezcan vacías.
  private seedHistory() {
    const now = Date.now();
    for (let t = now - HISTORY_SPAN_MS; t < now; t += HISTORY_STEP_MS) {
      const phase = ((t % 86_400_000) / 86_400_000) * Math.PI * 2;
      this.history.push(
        this.makeReading(t, {
          ph: 7.25 + Math.sin(phase) * 0.12 + noise(0.03),
          turbidity: Math.max(0, 3 + Math.sin(phase * 2) * 1.5 + noise(0.6)),
          tds: 240 + Math.sin(phase + 1) * 18 + noise(4),
        }),
      );
    }
  }

  private makeReading(ts: number, v: { ph: number; turbidity: number; tds: number }, phFault = false): Reading {
    return {
      ts,
      seq: ++this.seq,
      uptime_s: Math.round((ts - this.startedAt) / 1000),
      fw: FW,
      ph: channel("ph", v.ph, phFault),
      turbidity: channel("turbidity", Math.min(100, Math.max(0, v.turbidity))),
      tds: channel("tds", Math.max(0, v.tds)),
      temp_c: null,
      temp_source: "assumed_25c",
    };
  }

  private tick() {
    const target = TARGETS[this.scenario];
    const k = 0.18;
    this.current.ph += (target.ph - this.current.ph) * k + noise(0.02);
    this.current.turbidity += (target.turbidity - this.current.turbidity) * k + noise(0.4);
    this.current.tds += (target.tds - this.current.tds) * k + noise(3);

    const r = this.makeReading(Date.now(), this.current, this.scenario === "sensor");
    this.history.push(r);
    const cutoff = Date.now() - HISTORY_SPAN_MS;
    while (this.history.length && this.history[0].ts < cutoff) this.history.shift();
    this.evaluate(r);
    this.emit();
  }

  private step(param: AlertParam, outOfRange: boolean): boolean {
    const persist = Math.max(1, this.config.thresholds.persist);
    const s = this.rules.get(param) ?? { out: 0, inside: 0, active: false };
    this.rules.set(param, s);
    if (outOfRange) {
      s.inside = 0;
      if (!s.active && ++s.out >= persist) return (s.active = true);
    } else {
      s.out = 0;
      if (s.active && ++s.inside >= persist) {
        s.active = false;
        return true;
      }
    }
    return false;
  }

  private evaluate(r: Reading) {
    const t = this.config.thresholds;
    const push = (param: AlertParam, value: number | null, message: string) =>
      this.alerts.unshift({
        id: `demo-${r.seq}-${param}`,
        ts: r.ts,
        param,
        active: this.rules.get(param)!.active,
        value,
        message,
      });

    const phValid = r.ph.value !== null;
    if (this.step("sensor_ph", !phValid)) {
      push(
        "sensor_ph",
        null,
        this.rules.get("sensor_ph")!.active
          ? "El sensor de pH no está entregando una lectura válida (no_signal). Requiere revisión."
          : "El sensor de pH volvió a entregar lecturas válidas.",
      );
    }
    if (phValid && this.step("ph", r.ph.value! < t.ph_min || r.ph.value! > t.ph_max)) {
      const on = this.rules.get("ph")!.active;
      push(
        "ph",
        r.ph.value,
        on
          ? `pH ${r.ph.value!.toFixed(2)} fuera del intervalo configurado (${t.ph_min.toFixed(1)}–${t.ph_max.toFixed(1)}). Se recomienda revisar.`
          : `pH de vuelta en el intervalo configurado (${r.ph.value!.toFixed(2)}).`,
      );
    }
    if (r.tds.value !== null && this.step("tds", r.tds.value > t.tds_max)) {
      const on = this.rules.get("tds")!.active;
      push(
        "tds",
        r.tds.value,
        on
          ? `TDS estimado de ${Math.round(r.tds.value)} ppm, arriba del máximo configurado (${t.tds_max} ppm). Se recomienda revisar.`
          : `TDS de vuelta bajo el máximo configurado (${Math.round(r.tds.value)} ppm).`,
      );
    }
    if (r.turbidity.value !== null && this.step("turbidity", r.turbidity.value > t.turbidity_max)) {
      const on = this.rules.get("turbidity")!.active;
      push(
        "turbidity",
        r.turbidity.value,
        on
          ? `Turbidez relativa de ${r.turbidity.value.toFixed(1)} %, arriba del máximo configurado (${t.turbidity_max} %). Se recomienda revisar.`
          : `Turbidez de vuelta bajo el máximo configurado (${r.turbidity.value.toFixed(1)} %).`,
      );
    }
    this.alerts = this.alerts.slice(0, 200);
  }

  private status(): DeviceStatus {
    return {
      online: true,
      last_seen: Date.now(),
      rssi: Math.round(-57 + noise(3)),
      ip: "192.168.1.84",
      fw: FW,
      uptime_s: Math.round((Date.now() - this.startedAt) / 1000) + 86_400,
      interval_s: LIVE_INTERVAL_MS / 1000,
      pending_readings: 0,
      alerts_active: [...this.rules.values()].some((s) => s.active),
    };
  }

  private emit() {
    const latest = this.history[this.history.length - 1] ?? null;
    this.listeners.latest.forEach((cb) => cb(latest));
    const status = this.status();
    this.listeners.status.forEach((cb) => cb(status));
    this.listeners.history.forEach(({ since, cb }) => cb(this.history.filter((r) => r.ts >= since)));
    this.listeners.alerts.forEach(({ limit, cb }) => cb(this.alerts.slice(0, limit)));
  }

  // El reloj de la simulación corre solo mientras alguien escucha. Así sobrevive al doble montaje de React
  // en desarrollo y no queda un intervalo huérfano al cambiar de fuente de datos.
  private add<T>(set: Set<T>, item: T, initial: () => void): Unsubscribe {
    set.add(item);
    this.timer ??= setInterval(() => this.tick(), LIVE_INTERVAL_MS);
    queueMicrotask(initial);
    return () => {
      set.delete(item);
      const listening =
        this.listeners.latest.size + this.listeners.status.size + this.listeners.history.size + this.listeners.alerts.size;
      if (!listening) this.stopTimer();
    };
  }

  private stopTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  subscribeLatest(cb: (r: Reading | null) => void) {
    return this.add(this.listeners.latest, cb, () => cb(this.history[this.history.length - 1] ?? null));
  }
  subscribeStatus(cb: (s: DeviceStatus | null) => void) {
    return this.add(this.listeners.status, cb, () => cb(this.status()));
  }
  subscribeConfig(cb: (c: DeviceConfig | null) => void) {
    return this.add(this.listeners.config, cb, () => cb(this.config));
  }
  subscribeHistory(since: number, cb: (rs: Reading[]) => void) {
    const entry = { since, cb };
    return this.add(this.listeners.history, entry, () => cb(this.history.filter((r) => r.ts >= since)));
  }
  subscribeAlerts(limit: number, cb: (a: AlertEvent[]) => void) {
    const entry = { limit, cb };
    return this.add(this.listeners.alerts, entry, () => cb(this.alerts.slice(0, limit)));
  }
  async saveConfig(c: DeviceConfig) {
    this.config = structuredClone(c);
    this.listeners.config.forEach((cb) => cb(this.config));
  }
  subscribeMaintenance(cb: (m: Maintenance | null) => void) {
    this.listeners.maintenance.add(cb);
    queueMicrotask(() => cb(this.maintenance));
    return () => {
      this.listeners.maintenance.delete(cb);
    };
  }
  async markMaintenance(key: MaintenanceKey) {
    this.maintenance = { ...this.maintenance, [key]: Date.now() };
    this.listeners.maintenance.forEach((cb) => cb(this.maintenance));
  }
  async clearHistory() {
    this.history = [];
    this.alerts = [];
    this.rules.clear();
    this.listeners.latest.forEach((cb) => cb(null));
    this.listeners.history.forEach(({ cb }) => cb([]));
    this.listeners.alerts.forEach(({ cb }) => cb([]));
  }
  subscribeError(cb: (m: string | null) => void) {
    queueMicrotask(() => cb(null));
    return () => {};
  }
  now() {
    return Date.now();
  }
  dispose() {
    this.stopTimer();
  }

  getScenario() {
    return this.scenario;
  }
  setScenario(s: DemoScenario) {
    this.scenario = s;
    this.listeners.scenario.forEach((cb) => cb(s));
  }
  subscribeScenario(cb: (s: DemoScenario) => void): Unsubscribe {
    this.listeners.scenario.add(cb);
    return () => this.listeners.scenario.delete(cb);
  }
}
