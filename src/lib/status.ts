import type { AlertEvent, AlertParam, DeviceStatus, MetricKey, Reading, Thresholds } from "./types";
import { formatNumber } from "./format";

export interface MetricInfo {
  key: MetricKey;
  label: string;
  unit: string;
  decimals: number;
  description: string;
}

export const METRICS: MetricInfo[] = [
  { key: "ph", label: "pH", unit: "", decimals: 2, description: "Acidez o alcalinidad del agua" },
  {
    key: "turbidity",
    label: "Turbidez",
    unit: "%",
    decimals: 1,
    description: "Índice relativo al agua de referencia (no NTU)",
  },
  { key: "tds", label: "Sólidos disueltos", unit: "ppm", decimals: 0, description: "TDS estimado por conductividad" },
];

export const metricInfo = (key: MetricKey) => METRICS.find((m) => m.key === key)!;

export function formatMetric(key: MetricKey, value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return formatNumber(value, metricInfo(key).decimals);
}

export type MetricState = "ok" | "attention" | "fault" | "nodata";

export function metricState(key: MetricKey, r: Reading | null, t: Thresholds): MetricState {
  if (!r) return "nodata";
  const c = r[key];
  if (!c || c.status !== "ok" || c.value === null) return "fault";
  const v = c.value;
  if (key === "ph") return v < t.ph_min || v > t.ph_max ? "attention" : "ok";
  if (key === "tds") return v > t.tds_max ? "attention" : "ok";
  return v > t.turbidity_max ? "attention" : "ok";
}

export function rangeText(key: MetricKey, t: Thresholds) {
  if (key === "ph") return `${formatNumber(t.ph_min, 1)} – ${formatNumber(t.ph_max, 1)}`;
  if (key === "tds") return `hasta ${formatNumber(t.tds_max, 0)} ppm`;
  return `hasta ${formatNumber(t.turbidity_max, 0)} %`;
}

export function band(key: MetricKey, t: Thresholds): { min?: number; max?: number } {
  if (key === "ph") return { min: t.ph_min, max: t.ph_max };
  if (key === "tds") return { max: t.tds_max };
  return { max: t.turbidity_max };
}

export function calibrationText(key: MetricKey, cal: string | undefined) {
  if (!cal) return "Sin información de calibración";
  if (key === "ph") {
    if (cal === "2 puntos") return "Calibrado con dos soluciones de referencia";
    if (cal === "1 punto") return "Calibración aproximada de un punto";
    return "Sin calibrar: valores de fábrica";
  }
  if (key === "turbidity") return cal === "agua_ref" ? "Referencia: agua limpia" : "Sin referencia de agua limpia";
  return cal === "calibrado" ? "Calibrado con solución de referencia" : "Fórmula del fabricante (±10 %)";
}

export function staleAfterMs(status: DeviceStatus | null) {
  const interval = status?.interval_s ?? 10;
  return Math.max(90_000, interval * 3 * 1000);
}

export function lastContact(status: DeviceStatus | null, latest: Reading | null) {
  return Math.max(status?.last_seen ?? 0, latest?.ts ?? 0);
}

export function isOnline(status: DeviceStatus | null, latest: Reading | null, now: number) {
  const last = lastContact(status, latest);
  return last > 0 && now - last < staleAfterMs(status);
}

export type OverallState = "ok" | "attention" | "fault" | "offline" | "waiting";

export function overallState(r: Reading | null, s: DeviceStatus | null, t: Thresholds, now: number): OverallState {
  if (!r && !s) return "waiting";
  if (!isOnline(s, r, now)) return "offline";
  const states = METRICS.map((m) => metricState(m.key, r, t));
  if (states.includes("fault")) return "fault";
  if (states.includes("attention")) return "attention";
  return "ok";
}

export const OVERALL_COPY: Record<OverallState, { title: string; detail: string }> = {
  ok: {
    title: "Lecturas dentro de los intervalos configurados",
    detail: "No se detectan cambios que requieran atención.",
  },
  attention: {
    title: "Hay lecturas fuera del intervalo configurado",
    detail: "Revisa el detalle de cada indicador. Si el cambio persiste, inspecciona el tinaco o la instalación.",
  },
  fault: {
    title: "Un sensor no está entregando lecturas válidas",
    detail: "Revisa la conexión del sensor indicado. Sus valores no se usan para evaluar el agua.",
  },
  offline: {
    title: "El dispositivo no se ha comunicado recientemente",
    detail: "Los valores mostrados corresponden a la última lectura recibida.",
  },
  waiting: {
    title: "Esperando la primera lectura",
    detail: "Cuando el dispositivo envíe datos aparecerán aquí.",
  },
};

export const ALERT_PARAM_LABEL: Record<AlertParam, string> = {
  ph: "pH",
  tds: "Sólidos disueltos",
  turbidity: "Turbidez",
  sensor_ph: "Sensor de pH",
  sensor_tds: "Sensor de TDS",
  sensor_turbidity: "Sensor de turbidez",
};

/** Alertas que siguen activas: el último evento de cada parámetro es de inicio. */
export function activeAlerts(events: AlertEvent[]): AlertEvent[] {
  const seen = new Set<string>();
  const active: AlertEvent[] = [];
  for (const e of [...events].sort((a, b) => b.ts - a.ts)) {
    if (seen.has(e.param)) continue;
    seen.add(e.param);
    if (e.active) active.push(e);
  }
  return active;
}
