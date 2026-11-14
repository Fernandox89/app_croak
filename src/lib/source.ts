import type { AlertEvent, DeviceConfig, DeviceStatus, Maintenance, MaintenanceKey, Reading } from "./types";

export type Unsubscribe = () => void;

// Interfaz común para los datos de un dispositivo. La implementa Firebase (datos reales) y el simulador de
// demostración, así que las pantallas no saben de dónde vienen los datos.
export interface DataSource {
  readonly kind: "firebase" | "demo";
  readonly deviceId: string;
  subscribeLatest(cb: (r: Reading | null) => void): Unsubscribe;
  subscribeStatus(cb: (s: DeviceStatus | null) => void): Unsubscribe;
  subscribeConfig(cb: (c: DeviceConfig | null) => void): Unsubscribe;
  subscribeHistory(sinceMs: number, cb: (rs: Reading[]) => void): Unsubscribe;
  subscribeAlerts(limit: number, cb: (a: AlertEvent[]) => void): Unsubscribe;
  saveConfig(c: DeviceConfig): Promise<void>;
  subscribeMaintenance(cb: (m: Maintenance | null) => void): Unsubscribe;
  /** Registra que la tarea se hizo ahora (hora del servidor). */
  markMaintenance(key: MaintenanceKey): Promise<void>;
  /** Borra lecturas, alertas y la última lectura. No toca la configuración ni el mantenimiento. */
  clearHistory(): Promise<void>;
  /** Hora del servidor en ms (corrige el reloj del celular). */
  now(): number;
  /** Errores de conexión o permisos, para mostrarlos en vez de una pantalla vacía. */
  subscribeError(cb: (message: string | null) => void): Unsubscribe;
  dispose(): void;
}
