/* ================================================================
   CROAK – app.js (simulación de la app)
   ================================================================
   Todo sale de un solo estado: lecturas simuladas en vivo, los rangos
   de Configuración y las preferencias. Inicio, Análisis, Bitácora y
   Configuración se dibujan a partir de él, así que siempre cuentan la
   misma historia.

   Los "escenarios" son líneas de tiempo comprimidas (una tarde entera
   en unos segundos) que mueven las lecturas del dispositivo activo.
   Cada cambio de estado queda en la bitácora.

   Lo que elige la persona (nombre, dispositivos, rangos, ajustes,
   bitácora y mantenimiento) se guarda en este navegador con localStorage.
*/

/* ---------------------------------------------------------------
   DATOS BASE
--------------------------------------------------------------- */
const STORAGE_KEY = 'croak-demo-v1';
const TICK_MS = 2000;
const HISTORY_POINTS = 31; // ~60 s de lecturas en vivo
const LOG_LIMIT = 50;
const EVENT_COOLDOWN_MS = 8000; // evita llenar la bitácora si un valor ronda el límite
const DAY = 864e5;

const METRICS = {
  ph:   { name: 'pH',       unit: '',    decimals: 1, domain: [4, 10],  jitter: 0.08 },
  turb: { name: 'turbidez', unit: 'NTU', decimals: 1, domain: [0, 20],  jitter: 0.15 },
  tds:  { name: 'TDS',      unit: 'ppm', decimals: 0, domain: [0, 600], jitter: 3 },
};
const METRIC_KEYS = ['ph', 'turb', 'tds'];
const STATUS_COLORS = { ok: '#4caf7d', warn: '#e8a838', bad: '#e05252', off: '#9ba89a' };

const DEFAULT_THRESHOLDS = { phMin: 6.5, phMax: 8.5, turbMax: 5, tdsMax: 300 };
const DEFAULT_PREFS = { alerts: true, dailySummary: false, autoClose: true, systemNotifications: false };
const DEFAULT_DEVICES = [{ id: 'CRK-A3F9B2', name: 'Casa' }];
const NORMAL_BASE = { ph: 7.1, turb: 2.8, tds: 180 };

// Escenarios de la demo. Se aplican al dispositivo que estás viendo.
// keys: valores objetivo en el segundo t (se interpolan); offline: [desde, hasta] sin conexión.
const SCENARIOS = {
  lluvia: {
    icon: '🌧️', name: 'Llueve y sube la turbidez',
    desc: 'Entra agua con sedimento: la turbidez sube, se mantiene un rato y después se recupera.',
    tip: 'Abre Análisis → En vivo para ver subir la curva de turbidez.',
    keys: [
      { t: 0,  ph: 7.1, turb: 2.8, tds: 180 },
      { t: 14, ph: 6.9, turb: 8.6, tds: 196 },
      { t: 28, ph: 6.9, turb: 9.2, tds: 200 },
      { t: 46, ph: 7.1, turb: 3.0, tds: 184 },
    ],
  },
  filtro: {
    icon: '🧂', name: 'El filtro se satura',
    desc: 'Los sólidos disueltos (TDS) suben poco a poco. Se resuelve marcando el filtro como cambiado en Mantenimiento.',
    tip: 'Cuando el TDS pase de su rango, ve a Configuración → Mantenimiento y marca "Cambiar el filtro".',
    keys: [
      { t: 0,  ph: 7.1, turb: 2.8, tds: 180 },
      { t: 40, ph: 7.2, turb: 3.0, tds: 385 },
    ],
  },
  cisterna: {
    icon: '🚨', name: 'Contaminación en la cisterna',
    desc: 'pH, turbidez y TDS salen de rango en segundos. Si el cierre automático está activo, la válvula se cierra.',
    tip: 'Abre las recomendaciones y la bitácora: todo queda registrado con hora.',
    keys: [
      { t: 0,  ph: 7.1, turb: 2.8,  tds: 180 },
      { t: 12, ph: 5.8, turb: 14.5, tds: 420 },
    ],
  },
  desconexion: {
    icon: '📡', name: 'El sensor pierde conexión',
    desc: 'Croak deja de recibir lecturas, te avisa y se reconecta solo.',
    tip: 'La app no inventa datos: muestra la última lectura y cuánto tiempo hace.',
    keys: [{ t: 0, ...NORMAL_BASE }, { t: 24, ...NORMAL_BASE }],
    offline: [4, 18],
  },
};

const MAINTENANCE = [
  { id: 'phCal', icon: '🧪', title: 'Calibrar el sensor de pH', every: 30,
    why: 'El electrodo de pH pierde precisión con el tiempo.', done: 'Calibraste el sensor de pH' },
  { id: 'turbClean', icon: '🧽', title: 'Limpiar el sensor de turbidez', every: 14,
    why: 'El sedimento sobre el sensor altera la lectura.', done: 'Limpiaste el sensor de turbidez' },
  { id: 'filter', icon: '🔧', title: 'Cambiar el filtro', every: null,
    why: 'Se recomienda cuando el TDS sube de forma sostenida.', done: 'Cambiaste el filtro' },
];

const LEVEL_UI = {
  safe:    { emoji: '💧', label: 'Lecturas normales' },
  warn:    { emoji: '⚠️', label: 'Revisa tu agua' },
  danger:  { emoji: '🚨', label: 'Fuera de rango' },
  offline: { emoji: '📡', label: 'Sin conexión' },
};
const BADGE_TEXT = { ok: 'Normal', warn: 'Alerta', bad: 'Crítico', off: 'Sin datos' };
const STATUS_TEXT = { ok: 'Normal', warn: 'Fuera de rango', bad: 'Muy fuera de rango' };
const ALERT_KINDS = ['warn', 'bad', 'offline'];

/* ---------------------------------------------------------------
   ESTADO
--------------------------------------------------------------- */
function loadSaved() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; }
}

function atTime(daysAgo, hours, minutes) {
  const d = new Date(Date.now() - daysAgo * DAY);
  d.setHours(hours, minutes, 0, 0);
  return d.getTime();
}

// Historia de ejemplo para que la bitácora no arranque vacía.
function seedLog(deviceName) {
  const now = Date.now();
  return [
    { ts: atTime(1, 19, 10), kind: 'ok',   icon: '✅', text: 'La turbidez volvió a su rango: 4.1 NTU' },
    { ts: atTime(1, 18, 40), kind: 'warn', icon: '⚠️', text: 'Turbidez fuera de rango: 5.6 NTU' },
    { ts: now - 15 * DAY,    kind: 'info', icon: '🧽', text: 'Limpiaste el sensor de turbidez' },
    { ts: now - 23 * DAY,    kind: 'info', icon: '🧪', text: 'Calibraste el sensor de pH' },
  ].map((e, i) => ({ ...e, id: 'seed-' + i, device: deviceName }));
}

function newMaintenance(seeded) {
  const now = Date.now();
  return seeded
    ? { phCal: now - 23 * DAY, turbClean: now - 15 * DAY, filter: now - 60 * DAY }
    : { phCal: now, turbClean: now, filter: now };
}

function freshState(saved = {}) {
  const devices = Array.isArray(saved.devices) && saved.devices.length
    ? saved.devices
    : DEFAULT_DEVICES.map(d => ({ ...d }));
  return {
    name: saved.name || '',
    entered: !!saved.entered,
    devices,
    activeDeviceId: devices.some(d => d.id === saved.activeDeviceId) ? saved.activeDeviceId : devices[0].id,
    thresholds: { ...DEFAULT_THRESHOLDS, ...saved.thresholds },
    prefs: { ...DEFAULT_PREFS, ...saved.prefs },
    log: Array.isArray(saved.log) ? saved.log : seedLog(devices[0].name),
    lastSeenLog: saved.lastSeenLog || Date.now(),
    maintenance: saved.maintenance || { [devices[0].id]: newMaintenance(true) },
    presenterHidden: !!saved.presenterHidden,
    // Solo en memoria:
    scenario: null,
    readings: {},
    history: {},
    online: {},
    lastReadingAt: {},
    prevStatuses: {},
    lastEventAt: {},
    valveOpen: true,
    valveClosedByAuto: false,
    lastLevel: 'safe',
    alertDismissedKey: null,
    filter: 'vivo',
  };
}

let state = freshState(loadSaved());

function save() {
  const { name, entered, devices, activeDeviceId, thresholds, prefs, log, lastSeenLog, maintenance, presenterHidden } = state;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(
      { name, entered, devices, activeDeviceId, thresholds, prefs, log, lastSeenLog, maintenance, presenterHidden }));
  } catch { /* modo privado o almacenamiento bloqueado: la demo sigue funcionando sin guardar */ }
}

/* ---------------------------------------------------------------
   UTILIDADES
--------------------------------------------------------------- */
const $ = id => document.getElementById(id);
const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;
const fmt = (key, v) => v.toFixed(METRICS[key].decimals);
const fmtUnit = (key, v) => fmt(key, v) + (METRICS[key].unit ? ' ' + METRICS[key].unit : '');
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const capitalize = s => (s.startsWith('pH') ? s : s.charAt(0).toUpperCase() + s.slice(1));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function joinNames(keys) {
  const names = keys.map(k => METRICS[k].name);
  if (names.length <= 1) return names.join('');
  return names.slice(0, -1).join(', ') + ' y ' + names[names.length - 1];
}

function activeDevice() {
  return state.devices.find(d => d.id === state.activeDeviceId) || state.devices[0];
}

const isOnline = id => state.online[id] !== false;

function clock(ts) {
  const d = new Date(ts);
  return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
}

function relativeTime(ts) {
  const diff = Date.now() - ts;
  if (diff < 60e3) return 'hace unos segundos';
  if (diff < 3600e3) return 'hace ' + plural(Math.floor(diff / 60e3), 'min', 'min');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (ts >= today.getTime()) return 'hoy ' + clock(ts);
  if (ts >= today.getTime() - DAY) return 'ayer ' + clock(ts);
  return 'hace ' + plural(Math.round(diff / DAY), 'día', 'días');
}

/* ---------------------------------------------------------------
   ESCENARIOS Y LECTURAS SIMULADAS
--------------------------------------------------------------- */
const scenarioDuration = id => SCENARIOS[id].keys[SCENARIOS[id].keys.length - 1].t;
const scenarioElapsed = sc => (Date.now() - sc.startedAt) / 1000;

function targetFor(deviceId) {
  const sc = state.scenario && state.scenario.deviceId === deviceId ? state.scenario : null;
  if (!sc) return { values: NORMAL_BASE, online: true };
  const def = SCENARIOS[sc.id];
  const t = scenarioElapsed(sc);
  const keys = def.keys;
  let values = keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t >= a.t && t < b.t) {
      const k = (t - a.t) / (b.t - a.t);
      values = {};
      for (const m of METRIC_KEYS) values[m] = a[m] + (b[m] - a[m]) * k;
      break;
    }
  }
  const online = !(def.offline && t >= def.offline[0] && t < def.offline[1]);
  return { values, online };
}

function jittered(base) {
  const r = {};
  for (const k of METRIC_KEYS) {
    const m = METRICS[k];
    r[k] = round(base[k] + (Math.random() - 0.5) * 2 * m.jitter, m.decimals);
  }
  return r;
}

function ensureHistory(deviceId) {
  if (state.history[deviceId]) return;
  state.history[deviceId] = Array.from({ length: HISTORY_POINTS - 1 }, () => jittered(NORMAL_BASE));
}

function refreshReadings() {
  const now = Date.now();
  for (const dev of state.devices) {
    ensureHistory(dev.id);
    const { values, online } = targetFor(dev.id);
    const wasOnline = isOnline(dev.id);
    state.online[dev.id] = online;
    if (online || !state.readings[dev.id]) {
      const r = jittered(values);
      state.readings[dev.id] = r;
      state.lastReadingAt[dev.id] = now;
      const h = state.history[dev.id];
      h.push(r);
      if (h.length > HISTORY_POINTS) h.shift();
    }
    if (wasOnline && !online) logEvent('offline', '📡', `${dev.name} perdió la conexión`, dev);
    if (!wasOnline && online) logEvent('ok', '📶', `${dev.name} se reconectó`, dev);
  }
}

function metricStatus(key, v) {
  const t = state.thresholds;
  if (key === 'ph') {
    const off = v < t.phMin ? t.phMin - v : v > t.phMax ? v - t.phMax : 0;
    return off === 0 ? 'ok' : off <= 0.5 ? 'warn' : 'bad';
  }
  const max = key === 'turb' ? t.turbMax : t.tdsMax;
  const factor = key === 'turb' ? 2 : 1.5;
  return v <= max ? 'ok' : v <= max * factor ? 'warn' : 'bad';
}

function evaluate(r) {
  const statuses = {};
  for (const k of METRIC_KEYS) statuses[k] = metricStatus(k, r[k]);
  const out = METRIC_KEYS.filter(k => statuses[k] !== 'ok');
  const level = out.length === 0 ? 'safe'
    : out.some(k => statuses[k] === 'bad') || out.length >= 2 ? 'danger'
    : 'warn';
  return { statuses, out, level };
}

// Registra en la bitácora los cambios de estado de cada métrica del dispositivo.
function detectStatusEvents(deviceId, silent = false) {
  if (!isOnline(deviceId)) return;
  const r = state.readings[deviceId];
  const ev = evaluate(r);
  const prev = state.prevStatuses[deviceId];
  if (!prev || silent) { state.prevStatuses[deviceId] = ev.statuses; return; }
  const next = { ...ev.statuses };
  const dev = state.devices.find(d => d.id === deviceId);
  for (const k of METRIC_KEYS) {
    const a = prev[k], b = ev.statuses[k];
    if (a === b) continue;
    const cooldownKey = deviceId + ':' + k;
    // Si el valor ronda el límite, el cambio se pospone (no se pierde): se vuelve a evaluar en la siguiente lectura.
    if (Date.now() - (state.lastEventAt[cooldownKey] || 0) < EVENT_COOLDOWN_MS) { next[k] = a; continue; }
    state.lastEventAt[cooldownKey] = Date.now();
    const name = capitalize(METRICS[k].name);
    const value = fmtUnit(k, r[k]);
    if (b === 'ok') logEvent('ok', '✅', `${name} volvió a su rango: ${value}`, dev);
    else if (b === 'bad') logEvent('bad', '🚨', `${name} muy fuera de rango: ${value}`, dev);
    else if (a === 'ok') logEvent('warn', '⚠️', `${name} fuera de rango: ${value}`, dev);
    // De "muy fuera" a "fuera" es una mejora parcial: no se registra para no llenar la bitácora.
  }
  state.prevStatuses[deviceId] = next;
}

/* ---------------------------------------------------------------
   BITÁCORA
--------------------------------------------------------------- */
function logEvent(kind, icon, text, dev = activeDevice()) {
  state.log.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: Date.now(), kind, icon, text, device: dev.name });
  if (state.log.length > LOG_LIMIT) state.log.length = LOG_LIMIT;
  save();
  renderActivity();
  if (currentScreen === 'log') renderLog();
  if (ALERT_KINDS.includes(kind) && state.prefs.alerts) notifySystem(text, dev.name, kind);
}

const unreadCount = () =>
  state.log.filter(e => e.ts > state.lastSeenLog && ALERT_KINDS.includes(e.kind)).length;

function eventItemHtml(e) {
  return `
    <li class="log-item ${e.kind}">
      <span class="log-icon" aria-hidden="true">${e.icon}</span>
      <div class="log-info">
        <div class="log-text">${escapeHtml(e.text)}</div>
        <div class="log-meta">${escapeHtml(e.device)} · ${relativeTime(e.ts)}</div>
      </div>
    </li>`;
}

function renderActivity() {
  const list = $('activity-list');
  if (!list) return;
  list.innerHTML = state.log.slice(0, 3).map(eventItemHtml).join('')
    || '<li class="log-empty">Todavía no hay actividad</li>';
}

function renderLog() {
  state.lastSeenLog = Date.now();
  save();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const groups = [
    { label: 'Hoy', from: today.getTime() },
    { label: 'Ayer', from: today.getTime() - DAY },
    { label: 'Antes', from: -Infinity },
  ];
  let html = '';
  let upper = Infinity;
  for (const g of groups) {
    const items = state.log.filter(e => e.ts >= g.from && e.ts < upper);
    upper = g.from;
    if (!items.length) continue;
    html += `<div class="log-group-title">${g.label}</div><ul class="log-list">${items.map(eventItemHtml).join('')}</ul>`;
  }
  $('log-content').innerHTML = html || '<p class="log-empty">Todavía no hay actividad</p>';
  updateNotifDot();
}

function updateNotifDot() {
  const n = unreadCount();
  $('notif-dot').classList.toggle('hidden', n === 0 || !state.prefs.alerts);
  $('notif-btn').setAttribute('aria-label', n ? `Bitácora: ${plural(n, 'alerta nueva', 'alertas nuevas')}` : 'Bitácora');
}

/* ---------------------------------------------------------------
   RECOMENDACIONES
--------------------------------------------------------------- */
function getRecommendations(r) {
  const t = state.thresholds;
  const recs = [];
  if (r.ph < t.phMin || r.ph > t.phMax) {
    recs.push(
      { icon: '🪣', text: 'Revisa la limpieza del tinaco o la cisterna' },
      { icon: '🔬', text: 'Considera un filtro de carbón activado' },
      { icon: '🚫', text: 'Evita beberla hasta revisarla' },
    );
  }
  if (r.turb > t.turbMax) {
    recs.push(
      { icon: '💧', text: 'Hay sedimentos o partículas: revisa el estado del tinaco o la cisterna' },
      { icon: '🚫', text: 'Evita beberla hasta revisarla' },
    );
  }
  if (r.tds > t.tdsMax) {
    recs.push(
      { icon: '🔧', text: 'Revisa tu filtración: si usas ósmosis inversa, puede ser momento de cambiar el filtro' },
      { icon: '🌿', text: 'Mientras tanto, úsala para limpieza o riego, no para beber' },
    );
  }
  const seen = new Set();
  return recs.filter(r => (seen.has(r.text) ? false : seen.add(r.text)));
}

/* ---------------------------------------------------------------
   NAVEGACIÓN
--------------------------------------------------------------- */
let currentScreen = 'splash';

function renderScreen(id) {
  if (id === 'home') renderHome();
  if (id === 'dashboard') renderDashboard();
  if (id === 'settings') renderSettings();
  if (id === 'add-device') renderAddDeviceList();
  if (id === 'log') renderLog();
  if (id === 'welcome') $('welcome-name').value = state.name;
}

function goTo(id) {
  const cur = $(currentScreen);
  const next = $(id);
  if (!next || id === currentScreen) return;
  cur.classList.add('slide-back');
  cur.classList.remove('active');
  setTimeout(() => cur.classList.remove('slide-back'), 400);
  next.style.transform = '';
  next.classList.add('active');
  currentScreen = id;
  renderScreen(id);
}

function navTo(id) {
  const cur = $(currentScreen);
  const next = $(id);
  if (!next || id === currentScreen) return;
  cur.classList.remove('active');
  next.classList.add('active');
  currentScreen = id;
  renderScreen(id);
}

/* ---------------------------------------------------------------
   BIENVENIDA (reemplaza el login de la simulación)
--------------------------------------------------------------- */
function enterDemo() {
  state.name = $('welcome-name').value.trim().slice(0, 24);
  state.entered = true;
  save();
  goTo('home');
}

function exitDemo() {
  state.entered = false;
  save();
  goTo('welcome');
}

function resetDemo() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* sin almacenamiento */ }
  const presenterHidden = state.presenterHidden; // el panel es de quien presenta: se queda como estaba
  state = freshState({ presenterHidden });
  save();
  refreshReadings();
  detectStatusEvents(state.activeDeviceId, true);
  goTo('welcome');
  renderPresenter();
  showToast('🔄 Demo reiniciada');
}

/* ---------------------------------------------------------------
   RELOJ (barra de estado del marco de teléfono)
--------------------------------------------------------------- */
function updateTime() {
  document.querySelectorAll('.status-time').forEach(el => (el.textContent = clock(Date.now())));
}

/* ---------------------------------------------------------------
   INICIO
--------------------------------------------------------------- */
function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

function renderHome() {
  renderDeviceChips();
  renderHomeDeviceList();
  renderStatus();
  renderScenarioBanner();
  renderActivity();
  renderMaintenanceReminder();
}

// Parte "en vivo" de Inicio: se actualiza con cada lectura sin reconstruir botones.
// Devuelve true si en esta actualización la válvula se cerró sola.
function renderStatus() {
  let autoClosed = false;
  const id = state.activeDeviceId;
  const r = state.readings[id];
  const online = isOnline(id);
  const ev = evaluate(r);
  const level = online ? ev.level : 'offline';
  const ui = LEVEL_UI[level];

  $('greeting-time').textContent = state.name ? greeting() + ',' : greeting();
  $('greeting-name').textContent = (state.name || 'Bienvenido') + ' 👋';

  $('status-ring').className = 'status-ring-outer ' + level;
  $('status-emoji').textContent = ui.emoji;
  const lbl = $('status-label');
  lbl.textContent = ui.label;
  lbl.className = 'status-label ' + level;
  const msg = $('status-msg');
  msg.textContent = !online
    ? 'Última lectura ' + relativeTime(state.lastReadingAt[id])
    : ev.level === 'safe' ? 'Todo dentro de tus rangos'
    : capitalize(joinNames(ev.out)) + ' fuera de rango';
  msg.className = 'status-message ' + level;

  for (const k of METRIC_KEYS) {
    $(k + '-val').textContent = fmt(k, r[k]);
    const st = online ? ev.statuses[k] : 'off';
    const badge = $(k + '-badge');
    badge.className = 'metric-badge ' + st;
    badge.textContent = BADGE_TEXT[st];
  }
  document.querySelector('.metrics-grid').classList.toggle('stale', !online);

  // Válvula (función en desarrollo): en la demo se cierra sola si así está configurada.
  if (online && ev.level !== state.lastLevel) {
    if (ev.level === 'danger' && state.prefs.autoClose && state.valveOpen) {
      state.valveOpen = false;
      state.valveClosedByAuto = true;
      autoClosed = true;
      logEvent('info', '🔒', 'Válvula cerrada automáticamente (simulación)');
    } else if (ev.level === 'safe' && state.valveClosedByAuto) {
      state.valveOpen = true;
      state.valveClosedByAuto = false;
      logEvent('info', '🚿', 'Válvula abierta de nuevo (simulación)');
    }
    state.lastLevel = ev.level;
  }
  updateValveUI();
  renderAlertCard(r, online ? ev : { level: 'safe', out: [] });
  updateNotifDot();
  renderMaintenanceReminder();

  document.querySelectorAll('.hd-reading[data-device]').forEach(el => {
    const dr = state.readings[el.dataset.device];
    if (dr) el.textContent = `pH ${fmt('ph', dr.ph)} · ${fmt('tds', dr.tds)} ppm`;
  });
  document.querySelectorAll('.hd-badge[data-device]').forEach(el => {
    const on = isOnline(el.dataset.device);
    el.className = 'hd-badge ' + (on ? 'online' : 'offline');
    el.textContent = on ? 'En línea' : 'Sin conexión';
  });
  return autoClosed;
}

const VALVE_AUTO_TOAST = '🔒 Válvula cerrada automáticamente (simulación)';

/* ---------------------------------------------------------------
   TARJETA DE ALERTA
--------------------------------------------------------------- */
let renderedAlertKey = null;

function renderAlertCard(r, ev) {
  const card = $('alert-card');
  const key = ev.level + ':' + ev.out.join(',');
  if (ev.level === 'safe' || !state.prefs.alerts || state.alertDismissedKey === key) {
    card.classList.add('hidden');
    renderedAlertKey = null;
    if (ev.level === 'safe') state.alertDismissedKey = null;
    return;
  }
  if (renderedAlertKey === key) return; // ya está dibujada; evita repetir la animación en cada lectura
  renderedAlertKey = key;

  const isWarn = ev.level === 'warn';
  const recsHtml = getRecommendations(r).slice(0, 2).map(rec =>
    `<div class="rec-item"><span class="rec-icon">${rec.icon}</span><span>${rec.text}</span></div>`
  ).join('');

  card.className = 'alert-card ' + (isWarn ? 'warn' : 'danger');
  card.innerHTML = `
    <div class="alert-card-header">
      <div class="alert-card-title-row">
        <span class="alert-card-emoji">${isWarn ? '⚠️' : '🚨'}</span>
        <div>
          <div class="alert-card-title">${isWarn ? 'Revisa tu agua' : 'Varios valores fuera de rango'}</div>
          <div class="alert-card-sub">${capitalize(joinNames(ev.out))} fuera de tu rango configurado</div>
        </div>
      </div>
      <button class="alert-card-close" onclick="dismissAlertCard()" aria-label="Ocultar alerta">✕</button>
    </div>
    <div class="alert-card-recs">${recsHtml}</div>
    <button class="alert-card-btn" onclick="openRecommendationsModal()">Ver recomendaciones →</button>
  `;
  card.classList.remove('hidden');
}

function dismissAlertCard() {
  const ev = evaluate(state.readings[state.activeDeviceId]);
  state.alertDismissedKey = ev.level + ':' + ev.out.join(',');
  const card = $('alert-card');
  card.style.opacity = '0';
  card.style.transform = 'translateY(-8px)';
  setTimeout(() => {
    card.classList.add('hidden');
    card.style.opacity = '';
    card.style.transform = '';
    renderedAlertKey = null;
  }, 300);
}

/* ---------------------------------------------------------------
   MODAL DE RECOMENDACIONES
--------------------------------------------------------------- */
function openRecommendationsModal() {
  const r = state.readings[state.activeDeviceId];
  const ev = evaluate(r);
  if (ev.level === 'safe') return;
  const isWarn = ev.level === 'warn';

  $('rec-modal-badge').textContent = isWarn ? '⚠️ Un valor fuera de rango' : '🚨 Varios valores fuera de rango';
  $('rec-modal-badge').className = 'rec-modal-badge ' + ev.level;
  $('rec-modal-title').textContent = isWarn ? 'Qué hacer ahora' : 'Acción recomendada';
  $('rec-modal-subtitle').textContent = isWarn
    ? 'Una lectura salió de su rango. Estas son algunas acciones sugeridas.'
    : 'Varias lecturas están fuera de rango. Evita beberla hasta revisarla.';
  $('rec-modal-body').innerHTML = getRecommendations(r).map(rec =>
    `<div class="modal-rec-item"><div class="modal-rec-icon">${rec.icon}</div><span>${rec.text}</span></div>`
  ).join('');
  $('rec-modal').classList.add('show');
}

function closeRecommendationsModal() {
  $('rec-modal').classList.remove('show');
}

/* ---------------------------------------------------------------
   VÁLVULA (función en desarrollo, solo simulada)
--------------------------------------------------------------- */
function toggleValve() {
  state.valveOpen = !state.valveOpen;
  state.valveClosedByAuto = false;
  updateValveUI();
  logEvent('info', state.valveOpen ? '🚿' : '🔒', state.valveOpen ? 'Abriste la válvula (simulación)' : 'Cerraste la válvula (simulación)');
  showToast(state.valveOpen ? '🚿 Válvula abierta (simulación)' : '🔒 Válvula cerrada (simulación)');
}

function updateValveUI() {
  const open = state.valveOpen;
  $('valve-icon').className = 'valve-icon ' + (open ? 'open' : 'closed');
  $('valve-icon').textContent = open ? '🚿' : '🔒';
  $('valve-desc').textContent = open ? 'El agua circula normalmente' : 'Paso del agua bloqueado';
  $('valve-status').className = 'valve-status ' + (open ? 'open' : 'closed');
  $('valve-status').textContent = open ? 'Abierta' : 'Cerrada';
  $('valve-btn').className = 'valve-btn ' + (open ? '' : 'closed');
  $('valve-btn').textContent = open ? '🔒 Cerrar válvula' : '🚿 Abrir válvula';
}

/* ---------------------------------------------------------------
   ESCENARIOS: selector y aviso en Inicio
--------------------------------------------------------------- */
function openScenarioPicker() {
  const running = state.scenario && !state.scenario.done ? state.scenario.id : null;
  const options = [
    { id: null, icon: '💧', name: 'Día normal', desc: 'Lecturas estables dentro de rango.', seconds: null },
    ...Object.entries(SCENARIOS).map(([id, s]) => ({ id, icon: s.icon, name: s.name, desc: s.desc, seconds: scenarioDuration(id) })),
  ];
  $('scenario-list').innerHTML = options.map(o => `
    <button type="button" class="scenario-option${o.id === running || (!o.id && !state.scenario) ? ' current' : ''}"
      onclick="${o.id ? `startScenario('${o.id}')` : 'stopScenario(true)'}">
      <span class="scenario-option-icon" aria-hidden="true">${o.icon}</span>
      <span class="scenario-option-info">
        <span class="scenario-option-name">${o.name}</span>
        <span class="scenario-option-desc">${o.desc}</span>
      </span>
      <span class="scenario-option-time">${o.seconds ? o.seconds + ' s' : ''}</span>
    </button>`).join('');
  $('scenario-modal').classList.add('show');
}

function closeScenarioPicker() {
  $('scenario-modal').classList.remove('show');
}

// Desde el panel de presentación no se cambia de pantalla: quien presenta puede estar mostrando Análisis.
function startScenario(id, fromPresenter = false) {
  closeScenarioPicker();
  state.scenario = { id, startedAt: Date.now(), deviceId: state.activeDeviceId, done: false };
  state.lastEventAt = {}; // el cambio lo pediste tú: que se registre de inmediato
  logEvent('info', '▶️', 'Empezó el escenario de demo: ' + SCENARIOS[id].name);
  showToast(SCENARIOS[id].icon + ' ' + SCENARIOS[id].name);
  if (!fromPresenter && currentScreen !== 'home') navTo('home');
  tick();
}

function stopScenario(fromPicker = false) {
  if (fromPicker) closeScenarioPicker();
  if (!state.scenario) return;
  state.scenario = null;
  state.lastEventAt = {};
  tick();
  showToast('💧 De vuelta a un día normal');
}

function renderScenarioBanner() {
  const banner = $('scenario-banner');
  const sc = state.scenario;
  if (!sc) { banner.classList.add('hidden'); return; }
  const def = SCENARIOS[sc.id];
  const total = scenarioDuration(sc.id);
  const elapsed = Math.min(scenarioElapsed(sc), total);
  const mmss = s => Math.floor(s / 60) + ':' + Math.floor(s % 60).toString().padStart(2, '0');
  banner.classList.remove('hidden');
  $('scenario-banner-name').textContent = def.icon + ' ' + def.name;
  $('scenario-banner-time').textContent = sc.done ? 'Terminó' : mmss(elapsed) + ' / ' + mmss(total);
  $('scenario-banner-bar').style.width = (elapsed / total) * 100 + '%';
  $('scenario-banner-btn').textContent = sc.done ? 'Volver a normal' : 'Detener';
}

/* ---------------------------------------------------------------
   MANTENIMIENTO
--------------------------------------------------------------- */
function maintenanceFor(deviceId) {
  if (!state.maintenance[deviceId]) state.maintenance[deviceId] = newMaintenance(false);
  return state.maintenance[deviceId];
}

function taskStatus(task, deviceId) {
  if (!task.every) {
    const r = state.readings[deviceId];
    return r && isOnline(deviceId) && r.tds > state.thresholds.tdsMax
      ? { due: true, cls: 'due', text: 'Recomendado: el TDS está alto' }
      : { due: false, cls: 'ok', text: 'Según el TDS · sin pendientes' };
  }
  const days = Math.floor((Date.now() - maintenanceFor(deviceId)[task.id]) / DAY);
  const left = task.every - days;
  if (left > 3) return { due: false, cls: 'ok', text: `Cada ${task.every} días · faltan ${left}` };
  if (left > 0) return { due: false, cls: 'soon', text: 'Faltan ' + plural(left, 'día', 'días') };
  if (left === 0) return { due: true, cls: 'due', text: 'Toca hoy' };
  return { due: true, cls: 'due', text: 'Atrasado ' + plural(-left, 'día', 'días') };
}

function renderMaintenance() {
  const id = state.activeDeviceId;
  $('maintenance-list').innerHTML = MAINTENANCE.map(task => {
    const st = taskStatus(task, id);
    return `
      <div class="setting-row maint-row">
        <div class="setting-icon maint-icon ${st.cls}" aria-hidden="true">${task.icon}</div>
        <div class="setting-info">
          <h4>${task.title}</h4>
          <p class="maint-status ${st.cls}">${st.text}</p>
          <p>${task.why}</p>
        </div>
        <button type="button" class="maint-done" onclick="markTaskDone('${task.id}')">Hecho</button>
      </div>`;
  }).join('');
}

function renderMaintenanceReminder() {
  const due = MAINTENANCE.filter(t => taskStatus(t, state.activeDeviceId).due);
  const el = $('maint-reminder');
  if (!due.length) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  $('maint-reminder-text').textContent = due[0].title + (due.length > 1 ? ` y ${plural(due.length - 1, 'tarea más', 'tareas más')}` : '');
}

function openMaintenance() {
  navTo('settings');
  // Solo se desplaza la lista de Configuración: scrollIntoView movería también el marco del teléfono.
  const area = document.querySelector('#settings .scroll-area');
  const top = $('maintenance-section').getBoundingClientRect().top - area.getBoundingClientRect().top;
  area.scrollTop += top - 8;
}

function markTaskDone(taskId) {
  const task = MAINTENANCE.find(t => t.id === taskId);
  maintenanceFor(state.activeDeviceId)[taskId] = Date.now();
  logEvent('info', task.icon, task.done);
  showToast('✅ ' + task.done);
  // En el escenario del filtro, cambiarlo regresa el TDS a la normalidad.
  if (taskId === 'filter' && state.scenario && state.scenario.id === 'filtro') {
    state.scenario = null;
    tick();
  }
  save();
  renderMaintenance();
  renderMaintenanceReminder();
}

/* ---------------------------------------------------------------
   DISPOSITIVOS
--------------------------------------------------------------- */
const deviceIcon = dev => (dev.id === DEFAULT_DEVICES[0].id ? '🏠' : '📡');

function renderDeviceChips() {
  const c = $('device-chips-container');
  c.innerHTML = '';
  state.devices.forEach(dev => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip' + (dev.id === state.activeDeviceId ? ' active' : '');
    chip.setAttribute('aria-pressed', String(dev.id === state.activeDeviceId));
    chip.textContent = deviceIcon(dev) + ' ' + dev.name;
    chip.onclick = () => selectDevice(dev.id);
    c.appendChild(chip);
  });
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'chip add-chip';
  add.textContent = '+ Agregar';
  add.onclick = openAddDeviceModal;
  c.appendChild(add);
}

function selectDevice(id) {
  if (id === state.activeDeviceId) return;
  state.activeDeviceId = id;
  state.scenario = null;
  state.alertDismissedKey = null;
  save();
  refreshReadings();
  detectStatusEvents(id, true);
  renderHome();
  showToast('📡 Viendo: ' + activeDevice().name);
}

function renderHomeDeviceList() {
  const c = $('home-device-list');
  c.innerHTML = '';
  state.devices.forEach(dev => {
    const r = state.readings[dev.id];
    const on = isOnline(dev.id);
    const id = escapeHtml(dev.id);
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'home-device-item';
    item.innerHTML = `
      <div class="hd-icon">${deviceIcon(dev)}</div>
      <div class="hd-info"><div class="hd-name">${escapeHtml(dev.name)}</div><div class="hd-id">${id}</div></div>
      <div class="hd-status">
        <span class="hd-badge ${on ? 'online' : 'offline'}" data-device="${id}">${on ? 'En línea' : 'Sin conexión'}</span>
        <span class="hd-reading" data-device="${id}">pH ${fmt('ph', r.ph)} · ${fmt('tds', r.tds)} ppm</span>
      </div>`;
    item.onclick = () => selectDevice(dev.id);
    c.appendChild(item);
  });
}

function renderAddDeviceList() {
  const c = $('add-device-list');
  c.innerHTML = '';
  state.devices.forEach(dev => {
    const on = isOnline(dev.id);
    const item = document.createElement('div');
    item.className = 'device-list-item';
    item.innerHTML = `
      <div class="d-icon">${deviceIcon(dev)}</div>
      <div class="d-info"><div class="d-name">${escapeHtml(dev.name)}</div><div class="d-id">${escapeHtml(dev.id)} · ${on ? 'En línea' : 'Sin conexión'}</div></div>
      <div class="d-dot" style="background:${on ? 'var(--safe)' : 'var(--text3)'}"></div>`;
    c.appendChild(item);
  });
}

function addDevice(rawId, rawName) {
  const id = rawId.trim().toUpperCase();
  const name = rawName.trim().slice(0, 24);
  if (!id || !name) { showToast('⚠️ Ingresa el nombre y el ID'); return false; }
  if (state.devices.some(d => d.id === id)) { showToast('❌ Ese ID ya está registrado'); return false; }
  const dev = { id, name };
  state.devices.push(dev);
  maintenanceFor(id);
  refreshReadings();
  detectStatusEvents(id, true);
  logEvent('info', '📡', `Agregaste el dispositivo ${name}`, dev);
  showToast('✅ Dispositivo "' + name + '" agregado');
  return true;
}

function openAddDeviceModal() {
  $('add-device-modal').classList.add('show');
  $('modal-device-name').value = '';
  $('modal-device-id').value = '';
}

function closeAddDeviceModal() {
  $('add-device-modal').classList.remove('show');
}

function confirmAddDevice() {
  if (!addDevice($('modal-device-id').value, $('modal-device-name').value)) return;
  closeAddDeviceModal();
  renderHome();
}

function addDeviceFromScreen() {
  if (!addDevice($('device-code-input').value, $('device-name-input').value)) return;
  $('device-code-input').value = '';
  $('device-name-input').value = '';
  renderAddDeviceList();
}

/* ---------------------------------------------------------------
   ANÁLISIS
--------------------------------------------------------------- */
const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const FILTERS = {
  vivo: {
    label: 'Últimos 60 segundos',
    labels: () => ['−60 s', '−45 s', '−30 s', '−15 s', 'Ahora'],
  },
  hoy: {
    label: 'Últimas 12 horas', points: 13, ramp: 3,
    labels: () => [12, 9, 6, 3].map(h => clock(Date.now() - h * 3600e3).slice(0, 3) + '00').concat('Ahora'),
  },
  semana: {
    label: 'Últimos 7 días', points: 7, ramp: 1,
    labels: () => [6, 5, 4, 3, 2, 1].map(n => DAY_NAMES[new Date(Date.now() - n * DAY).getDay()]).concat('Hoy'),
  },
  mes: {
    label: 'Últimos 30 días', points: 30, ramp: 1,
    labels: () => ['Hace 4 sem', '3 sem', '2 sem', '1 sem', 'Hoy'],
  },
};

function seededRandom(seedText) {
  let s = 0;
  for (const ch of seedText) s = (s * 31 + ch.charCodeAt(0)) % 2147483647;
  s = s || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// "En vivo" usa las lecturas reales de esta sesión. Los demás periodos son un historial
// de ejemplo: valores normales que terminan en la lectura actual.
function seriesFor(key, filterId) {
  const id = state.activeDeviceId;
  if (filterId === 'vivo') return state.history[id].map(r => r[key]);
  const f = FILTERS[filterId];
  const m = METRICS[key];
  const rnd = seededRandom(key + filterId + id);
  const current = state.readings[id][key];
  const pts = [];
  for (let i = 0; i < f.points - 1; i++) pts.push(NORMAL_BASE[key] + (rnd() - 0.5) * 4 * m.jitter);
  const start = Math.max(0, f.points - 1 - f.ramp);
  for (let i = start; i < f.points - 1; i++) {
    const k = (i - start + 1) / (f.ramp + 1);
    pts[i] += (current - pts[i]) * k;
  }
  pts.push(current);
  return pts;
}

function chartY(key, v) {
  const [lo, hi] = METRICS[key].domain;
  const c = Math.max(lo, Math.min(hi, v));
  return 70 - ((c - lo) / (hi - lo)) * 60;
}

function safeBand(key) {
  const t = state.thresholds;
  if (key === 'ph') return [t.phMin, t.phMax];
  return [METRICS[key].domain[0], key === 'turb' ? t.turbMax : t.tdsMax];
}

function renderChart(key, series, status) {
  const w = 310;
  const pts = series.map((v, i) => [round(i * w / (series.length - 1), 1), round(chartY(key, v), 1)]);
  const d = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0] + ' ' + p[1]).join(' ');
  const last = pts[pts.length - 1];
  const color = STATUS_COLORS[status];

  $(key + '-path').setAttribute('d', d);
  $(key + '-path').setAttribute('stroke', color);
  $(key + '-area').setAttribute('d', d + ' L' + last[0] + ' 70 L0 70 Z');
  document.querySelectorAll('#' + key + '-grad stop').forEach(s => s.setAttribute('stop-color', color));

  const [lo, hi] = safeBand(key);
  const yTop = chartY(key, hi);
  $(key + '-band').setAttribute('y', yTop);
  $(key + '-band').setAttribute('height', Math.max(0, chartY(key, lo) - yTop));

  const dots = $(key + '-dots');
  dots.innerHTML = '';
  const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  c.setAttribute('cx', last[0]);
  c.setAttribute('cy', last[1]);
  c.setAttribute('r', '4');
  c.setAttribute('fill', color);
  c.setAttribute('stroke', '#fff');
  c.setAttribute('stroke-width', '2');
  dots.appendChild(c);
}

function renderDashboard() {
  const dev = activeDevice();
  const f = FILTERS[state.filter];
  const r = state.readings[dev.id];
  const online = isOnline(dev.id);
  const ev = evaluate(r);
  $('dash-subtitle').textContent = `${f.label} · ${dev.name}${online ? '' : ' · sin conexión'}`;

  const labels = f.labels().map(l => `<span>${l}</span>`).join('');
  document.querySelectorAll('.chart-xlabels').forEach(el => (el.innerHTML = labels));

  for (const k of METRIC_KEYS) {
    const series = seriesFor(k, state.filter);
    const avg = series.reduce((a, b) => a + b, 0) / series.length;
    $('avg-' + k).textContent = fmt(k, avg);

    $('dash-' + k).textContent = fmtUnit(k, r[k]);
    // En vivo compara contra hace ~10 s; los demás periodos, contra el punto anterior.
    const prev = series[Math.max(0, series.length - (state.filter === 'vivo' ? 6 : 2))];
    const diff = r[k] - prev;
    const arrow = Math.abs(diff) < METRICS[k].jitter * 2 ? '→' : diff > 0 ? '↑' : '↓';
    const status = online ? ev.statuses[k] : 'off';
    const st = $('dash-' + k + '-status');
    st.textContent = online ? arrow + ' ' + STATUS_TEXT[status] : 'Sin conexión';
    st.className = 'chart-status ' + status;
    renderChart(k, series, status);
  }
}

function setFilter(el, filterId) {
  state.filter = filterId;
  document.querySelectorAll('.f-tab').forEach(t => {
    const on = t === el;
    t.classList.toggle('active', on);
    t.setAttribute('aria-pressed', String(on));
  });
  renderDashboard();
}

/* ---------------------------------------------------------------
   CONFIGURACIÓN
--------------------------------------------------------------- */
const RANGE_FORMAT = {
  phMin: v => v.toFixed(1),
  phMax: v => v.toFixed(1),
  turbMax: v => v.toFixed(1) + ' NTU',
  tdsMax: v => v.toFixed(0) + ' ppm',
};

function renderSettings() {
  const dev = activeDevice();
  $('settings-device-name').textContent = 'CROAK – ' + dev.name;
  $('settings-device-id').textContent = 'ID: ' + dev.id;
  renderLastReading();
  renderMaintenance();

  document.querySelectorAll('[data-pref]').forEach(btn => {
    const on = !!state.prefs[btn.dataset.pref];
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-checked', String(on));
  });

  for (const key of Object.keys(RANGE_FORMAT)) {
    $('range-' + key).value = state.thresholds[key];
    $('range-' + key + '-val').textContent = RANGE_FORMAT[key](state.thresholds[key]);
  }
  renderNotificationRow();
  renderInstallHints();
}

function renderLastReading() {
  const id = state.activeDeviceId;
  const on = isOnline(id);
  const seconds = Math.max(1, Math.round((Date.now() - state.lastReadingAt[id]) / 1000));
  $('settings-last-reading').textContent = on
    ? `Conectado por WiFi · última lectura hace ${seconds} s`
    : `Sin conexión · última lectura hace ${seconds} s`;
  const badge = $('settings-online-badge');
  badge.textContent = on ? 'En línea' : 'Sin conexión';
  badge.classList.toggle('offline', !on);
}

function togglePref(btn) {
  const key = btn.dataset.pref;
  state.prefs[key] = !state.prefs[key];
  if (key === 'alerts') state.alertDismissedKey = null;
  save();
  renderSettings();
  renderStatus();
}

function setThreshold(key, value) {
  let v = parseFloat(value);
  const t = state.thresholds;
  // El pH mínimo nunca puede quedar arriba del máximo (y viceversa).
  if (key === 'phMin') v = Math.min(v, t.phMax - 0.1);
  if (key === 'phMax') v = Math.max(v, t.phMin + 0.1);
  t[key] = round(v, 1);
  $('range-' + key).value = t[key];
  $('range-' + key + '-val').textContent = RANGE_FORMAT[key](t[key]);
  save();
  // Mover un rango no es un cambio en el agua: se actualiza el estado sin registrarlo en la bitácora.
  detectStatusEvents(state.activeDeviceId, true);
  if (renderStatus()) showToast(VALVE_AUTO_TOAST);
  renderMaintenance();
}

function resetThresholds() {
  state.thresholds = { ...DEFAULT_THRESHOLDS };
  save();
  detectStatusEvents(state.activeDeviceId, true);
  renderSettings();
  renderStatus();
  showToast('↩️ Rangos restablecidos');
}

/* ---------------------------------------------------------------
   AVISOS (toast)
--------------------------------------------------------------- */
let toastTimer = null;
function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
}

/* ---------------------------------------------------------------
   CICLO DE LECTURAS EN VIVO
--------------------------------------------------------------- */
function tick() {
  refreshReadings();
  detectStatusEvents(state.activeDeviceId);
  const sc = state.scenario;
  if (sc && !sc.done && scenarioElapsed(sc) >= scenarioDuration(sc.id)) sc.done = true;
  if (renderStatus()) showToast(VALVE_AUTO_TOAST);
  renderScenarioBanner();
  if (currentScreen === 'dashboard') renderDashboard();
  if (currentScreen === 'settings') { renderLastReading(); renderMaintenance(); }
  renderPresenter();
}

/* ---------------------------------------------------------------
   INSTALAR COMO APP (PWA)
--------------------------------------------------------------- */
let deferredInstall = null;
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault(); // mostramos nuestro propio botón "Instalar"
  deferredInstall = event;
  renderInstallHints();
});

window.addEventListener('appinstalled', () => {
  deferredInstall = null;
  renderInstallHints();
  showToast('📲 Croak quedó instalada');
});

function renderInstallHints() {
  let text = null;
  if (!isStandalone()) {
    if (deferredInstall) text = 'Instálala como app: se abre a pantalla completa y funciona sin internet.';
    else if (isIOS()) text = 'En iPhone: toca Compartir y luego "Agregar a pantalla de inicio".';
    else if (window.matchMedia('(pointer: coarse)').matches) text = 'Desde el menú del navegador elige "Instalar app" o "Agregar a pantalla de inicio".';
  }
  document.querySelectorAll('[data-install]').forEach(el => {
    el.classList.toggle('hidden', !text);
    if (!text) return;
    el.querySelector('.install-text').textContent = text;
    el.querySelector('.install-btn').classList.toggle('hidden', !deferredInstall);
  });
}

async function installApp() {
  if (!deferredInstall) return;
  deferredInstall.prompt();
  await deferredInstall.userChoice;
  deferredInstall = null;
  renderInstallHints();
}

/* ---------------------------------------------------------------
   NOTIFICACIONES DEL SISTEMA
   En Android y escritorio funcionan desde el navegador; en iPhone solo
   con la app instalada (iOS 16.4 o posterior).
--------------------------------------------------------------- */
const notificationsSupported = () =>
  'Notification' in window && 'serviceWorker' in navigator && window.isSecureContext;

async function notifySystem(text, deviceName, kind, force = false) {
  if (!force && !state.prefs.systemNotifications) return;
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  const title = 'Croak · ' + deviceName;
  const options = {
    body: text,
    icon: 'icons/icon-192.png',
    badge: 'icons/badge-72.png',
    tag: 'croak-' + kind,
    renotify: true,
    vibrate: [120, 60, 120],
  };
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) await reg.showNotification(title, options);
    else new Notification(title, options);
  } catch { /* el navegador no permitió mostrarla */ }
}

async function enableNotifications() {
  if (!notificationsSupported()) {
    showToast(isIOS() && !isStandalone() ? '📲 En iPhone, primero instala la app' : '🔕 Este navegador no permite notificaciones');
    return;
  }
  const result = await Notification.requestPermission();
  state.prefs.systemNotifications = result === 'granted';
  save();
  renderSettings();
  if (result === 'granted') testNotification();
  else showToast('🔕 Las notificaciones quedaron bloqueadas en este navegador');
}

function testNotification() {
  if (!notificationsSupported()) {
    showToast(isIOS() && !isStandalone() ? '📲 En iPhone, primero instala la app' : '🔕 Este navegador no permite notificaciones');
    return;
  }
  if (Notification.permission === 'denied') { showToast('🔕 Las notificaciones están bloqueadas en este navegador'); return; }
  if (Notification.permission !== 'granted') { enableNotifications(); return; }
  if (!state.prefs.systemNotifications) {
    state.prefs.systemNotifications = true;
    save();
    renderSettings();
  }
  notifySystem('Turbidez fuera de rango: 6.2 NTU (ejemplo)', activeDevice().name, 'prueba', true);
  showToast('🔔 Notificación de prueba enviada');
}

function renderNotificationRow() {
  const text = $('system-notif-text');
  const btn = $('system-notif-btn');
  const toggle = $('system-notif-toggle');
  btn.classList.add('hidden');
  toggle.classList.add('hidden');
  if (!notificationsSupported()) {
    text.textContent = isIOS() && !isStandalone()
      ? 'En iPhone: instala la app (Compartir → Agregar a inicio) para activarlas'
      : 'Este navegador no permite notificaciones';
  } else if (Notification.permission === 'denied') {
    text.textContent = 'Bloqueadas: actívalas en los ajustes del navegador';
  } else if (Notification.permission === 'default') {
    text.textContent = 'Avisos del sistema aunque la app esté en segundo plano';
    btn.classList.remove('hidden');
  } else {
    text.textContent = state.prefs.systemNotifications
      ? 'Activadas: te avisamos cuando algo salga de rango'
      : 'Pausadas en esta demo';
    toggle.classList.remove('hidden');
  }
}

/* ---------------------------------------------------------------
   MODO PRESENTACIÓN (pantallas anchas)
--------------------------------------------------------------- */
const wideScreen = window.matchMedia('(min-width: 1100px)');
const presenterVisible = () => !state.presenterHidden && wideScreen.matches;
let presenterNowHtml = '';

function setPresenterHidden(hidden) {
  state.presenterHidden = hidden;
  save();
  renderPresenter();
}

function buildPresenterScenarios() {
  const options = [
    { id: null, icon: '💧', name: 'Día normal' },
    ...Object.entries(SCENARIOS).map(([id, s]) => ({ id, icon: s.icon, name: s.name })),
  ];
  $('presenter-scenarios').innerHTML = options.map((o, i) => `
    <button type="button" class="presenter-scenario" data-scenario="${o.id || ''}"
      onclick="${o.id ? `startScenario('${o.id}', true)` : 'stopScenario()'}">
      <kbd>${i}</kbd><span class="ps-icon" aria-hidden="true">${o.icon}</span><span class="ps-name">${o.name}</span>
      <span class="presenter-progress"><span></span></span>
    </button>`).join('');
}

function presenterNarrative() {
  const id = state.activeDeviceId;
  const dev = escapeHtml(activeDevice().name);
  const r = state.readings[id];
  const ev = evaluate(r);
  let what;
  if (!isOnline(id)) {
    what = `Croak dejó de recibir lecturas de <strong>${dev}</strong>. La app lo marca en gris, no inventa datos y lo registra en la bitácora. Cuando vuelve la conexión, se reconecta sola.`;
  } else if (ev.level === 'safe') {
    what = `Todas las lecturas de <strong>${dev}</strong> están dentro de los rangos configurados. Croak muestra el estado y guarda el historial.`;
  } else {
    const rec = getRecommendations(r)[0];
    what = `<strong>${capitalize(joinNames(ev.out))}</strong> fuera de rango. Croak lo marca en Inicio, lo registra en la bitácora${state.prefs.systemNotifications ? ', manda una notificación' : ''} y sugiere qué hacer${rec ? `: “${rec.text.charAt(0).toLowerCase() + rec.text.slice(1)}”` : ''}.`;
    if (!state.valveOpen && state.valveClosedByAuto) {
      what += ' Como el cierre automático está activo, la válvula se cerró (función en desarrollo).';
    }
  }
  const sc = state.scenario ? SCENARIOS[state.scenario.id] : null;
  const tip = sc ? sc.tip : 'Elige un escenario para mostrar cómo reacciona la app.';
  const last = state.log[0];
  return `<p>${what}</p><p class="presenter-tip">💡 ${tip}</p>`
    + (last ? `<p class="presenter-last">Último evento: ${escapeHtml(last.text)} · ${relativeTime(last.ts)}</p>` : '');
}

function renderPresenter() {
  $('presenter').classList.toggle('presenter-hidden', state.presenterHidden);
  $('presenter-show-btn').classList.toggle('visible', state.presenterHidden);
  if (!presenterVisible()) return;

  const sc = state.scenario;
  document.querySelectorAll('.presenter-scenario').forEach(btn => {
    const id = btn.dataset.scenario || null;
    const running = id ? !!sc && sc.id === id : !sc;
    btn.classList.toggle('active', running);
    btn.setAttribute('aria-pressed', String(running));
    const bar = btn.querySelector('.presenter-progress span');
    bar.style.width = id && running ? Math.min(scenarioElapsed(sc) / scenarioDuration(id), 1) * 100 + '%' : '0';
  });

  const now = presenterNarrative();
  if (now !== presenterNowHtml) {
    presenterNowHtml = now;
    $('presenter-now').innerHTML = now;
  }
  $('presenter-url').textContent = location.href.split('#')[0];
}

// Atajos: 0 = día normal, 1–4 = escenarios.
document.addEventListener('keydown', event => {
  if (!presenterVisible() || event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.target.closest('input, textarea, select')) return;
  const ids = Object.keys(SCENARIOS);
  const n = Number(event.key);
  if (event.key === '0') stopScenario();
  else if (n >= 1 && n <= ids.length) startScenario(ids[n - 1], true);
});

wideScreen.addEventListener('change', renderPresenter);

/* ---------------------------------------------------------------
   SERVICE WORKER (instalación y uso sin internet)
--------------------------------------------------------------- */
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* la demo funciona igual sin él */ });
  });
  // Al tocar una notificación, el service worker pide abrir la bitácora.
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data && event.data.type === 'open-log' && state.entered) navTo('log');
  });
}

/* ---------------------------------------------------------------
   INICIO DE LA APP
--------------------------------------------------------------- */
refreshReadings();
detectStatusEvents(state.activeDeviceId, true);
renderHome();
buildPresenterScenarios();
renderPresenter();
renderInstallHints();
updateTime();
setInterval(updateTime, 10000);
setInterval(tick, TICK_MS);
setInterval(() => { if (currentScreen === 'settings') renderLastReading(); }, 1000);
setTimeout(() => {
  // Una notificación abierta con la app cerrada llega como ./#bitacora
  const openLog = location.hash === '#bitacora';
  if (openLog) history.replaceState(null, '', location.pathname + location.search);
  goTo(!state.entered ? 'welcome' : openLog ? 'log' : 'home');
}, 1200);
