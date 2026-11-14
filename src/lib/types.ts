// Estructuras que escribe el firmware en Firebase Realtime Database (devices/<id>/...).
// Ver croak_firmware/README.md: cualquier cambio aquí debe reflejarse allá.

export type ChannelStatus = "ok" | "saturated" | "no_signal";

export interface ChannelReading {
  value: number | null;
  unit: string;
  sensor_v: number;
  adc_mv: number;
  status: ChannelStatus;
  calibration: string;
}

export interface Reading {
  ts: number;
  seq: number;
  uptime_s: number;
  fw: string;
  ph: ChannelReading;
  turbidity: ChannelReading;
  tds: ChannelReading;
  temp_c: number | null;
  temp_source: "ds18b20" | "assumed_25c";
}

export interface DeviceStatus {
  online: boolean;
  last_seen: number;
  rssi: number;
  ip: string;
  fw: string;
  uptime_s: number;
  interval_s: number;
  pending_readings: number;
  alerts_active: boolean;
}

export interface Thresholds {
  ph_min: number;
  ph_max: number;
  tds_max: number;
  turbidity_max: number;
  persist: number;
}

export interface DeviceConfig {
  interval_s: number;
  thresholds: Thresholds;
}

export type AlertParam = "ph" | "tds" | "turbidity" | "sensor_ph" | "sensor_tds" | "sensor_turbidity";

export interface AlertEvent {
  id: string;
  ts: number;
  param: AlertParam;
  active: boolean;
  value: number | null;
  message: string;
}

export type MetricKey = "ph" | "turbidity" | "tds";

// Mismos valores de fábrica que el firmware (include/config.h).
export const DEFAULT_CONFIG: DeviceConfig = {
  interval_s: 10,
  thresholds: { ph_min: 6.5, ph_max: 8.5, tds_max: 1000, turbidity_max: 20, persist: 3 },
};
