const LOCALE = "es-MX";

const timeFmt = new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit" });
const timeSecFmt = new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const dateTimeFmt = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const dayFmt = new Intl.DateTimeFormat(LOCALE, { weekday: "long", day: "numeric", month: "long" });

export const formatTime = (ts: number) => timeFmt.format(ts);
export const formatTimeSec = (ts: number) => timeSecFmt.format(ts);
export const formatDateTime = (ts: number) => dateTimeFmt.format(ts);

export function formatDay(ts: number, now: number) {
  const d = new Date(ts).toDateString();
  if (d === new Date(now).toDateString()) return "Hoy";
  if (d === new Date(now - 86_400_000).toDateString()) return "Ayer";
  const s = dayFmt.format(ts);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatRelative(ts: number, now: number) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 5) return "hace un momento";
  if (s < 60) return `hace ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  return formatDateTime(ts);
}

export function formatDuration(totalSeconds: number) {
  const d = Math.floor(totalSeconds / 86_400);
  const h = Math.floor((totalSeconds % 86_400) / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (d) return `${d} d ${h} h`;
  if (h) return `${h} h ${m} min`;
  return `${m} min`;
}

export function formatNumber(v: number, decimals: number) {
  return v.toLocaleString(LOCALE, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function rssiQuality(rssi: number): string {
  if (rssi >= -60) return "Excelente";
  if (rssi >= -70) return "Buena";
  if (rssi >= -80) return "Débil";
  return "Muy débil";
}

export function formatInterval(s: number) {
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  return `${Math.round(s / 3600)} h`;
}
