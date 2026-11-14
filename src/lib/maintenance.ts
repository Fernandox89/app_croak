import type { Maintenance, MaintenanceKey } from "./types";

export interface MaintenanceTask {
  key: MaintenanceKey;
  label: string;
  everyDays: number;
  hint: string;
}

// Frecuencias de referencia. La calibración trimestral es la del plan de servicio; la limpieza del tinaco cada
// seis meses es la recomendación habitual de los organismos operadores.
export const MAINTENANCE_TASKS: MaintenanceTask[] = [
  { key: "probes_cleaned_at", label: "Limpieza de sondas", everyDays: 30, hint: "Retira sarro y sedimento de las sondas de TDS y turbidez." },
  { key: "calibrated_at", label: "Calibración de pH", everyDays: 90, hint: "Con soluciones patrón de pH 4 y 7." },
  { key: "tank_cleaned_at", label: "Limpieza del tinaco", everyDays: 180, hint: "Vaciar, tallar y desinfectar el tinaco o la cisterna." },
];

export type DueState = "ok" | "soon" | "overdue" | "never";

const DAY = 86_400_000;

export function dueInfo(task: MaintenanceTask, m: Maintenance | null | undefined, now: number) {
  const last = m?.[task.key];
  if (!last) return { state: "never" as DueState, last: undefined, dueAt: undefined, days: undefined };
  const dueAt = last + task.everyDays * DAY;
  const days = Math.ceil((dueAt - now) / DAY);
  const state: DueState = days < 0 ? "overdue" : days <= Math.max(3, task.everyDays * 0.1) ? "soon" : "ok";
  return { state, last, dueAt, days };
}

/** Tareas vencidas o sin registro, para avisar en el panel. */
export function pendingTasks(m: Maintenance | null | undefined, now: number) {
  return MAINTENANCE_TASKS.filter((t) => {
    const s = dueInfo(t, m, now).state;
    return s === "overdue";
  });
}
