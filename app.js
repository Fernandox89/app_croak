/* ================================================================
   CROAK – app.js
   ================================================================ */

/* ---------------------------------------------------------------
   DEVICE STORE
--------------------------------------------------------------- */
const defaultDevices = [
  { id: 'CRK-A3F9B2', name: 'Casa', online: true, ph: 7.1, turb: 2.8, tds: 180 }
];
let devices        = [...defaultDevices];
let activeDeviceId = devices[0].id;

/* ---------------------------------------------------------------
   NAVIGATION
--------------------------------------------------------------- */
let currentScreen = 'splash';

function goTo(id) {
  const cur  = document.getElementById(currentScreen);
  const next = document.getElementById(id);
  if (!next || id === currentScreen) return;
  cur.classList.add('slide-back');
  cur.classList.remove('active');
  setTimeout(() => cur.classList.remove('slide-back'), 400);
  next.style.transform = '';
  next.classList.add('active');
  currentScreen = id;
  if (id === 'dashboard')  renderCharts();
  if (id === 'home')       { renderDeviceChips(); renderHomeDeviceList(); }
  if (id === 'add-device') renderAddDeviceList();
}

function navTo(id) {
  const cur  = document.getElementById(currentScreen);
  const next = document.getElementById(id);
  if (!next || id === currentScreen) return;
  cur.classList.remove('active');
  next.classList.add('active');
  currentScreen = id;
  if (id === 'dashboard') renderCharts();
  if (id === 'home')      { renderDeviceChips(); renderHomeDeviceList(); }
}

/* ---------------------------------------------------------------
   CLOCK
--------------------------------------------------------------- */
function updateTime() {
  const now = new Date();
  const h   = now.getHours().toString().padStart(2, '0');
  const m   = now.getMinutes().toString().padStart(2, '0');
  document.querySelectorAll('.status-time').forEach(el => el.textContent = h + ':' + m);
}
updateTime();
setInterval(updateTime, 10000);

/* ---------------------------------------------------------------
   RECOMMENDATIONS ENGINE
--------------------------------------------------------------- */
function getRecommendations(ph, turb, tds) {
  const recs = [];
  const phLow    = ph   < 6.5;
  const phHigh   = ph   > 8.5;
  const turbHigh = turb > 5;
  const tdsHigh  = tds  > 300;

  if (phLow || phHigh) {
    recs.push(
      { icon: '🪣', text: 'Revisar la limpieza del tinaco o cisterna' },
      { icon: '🔬', text: 'Considerar un filtro de carbón activado' },
      { icon: '🚫', text: 'Evitar el consumo directo del agua' }
    );
  }
  if (tdsHigh) {
    recs.push(
      { icon: '⚠️', text: 'Posible presencia de contaminantes disueltos' },
      { icon: '🔧', text: 'Revisar el sistema de filtración' },
      { icon: '🌿', text: 'Usar el agua solo para limpieza o riego, no consumo' }
    );
  }
  if (turbHigh) {
    recs.push(
      { icon: '💧', text: 'Agua con sedimentos o suciedad visible' },
      { icon: '🚫', text: 'Evitar usar esta agua para consumo' },
      { icon: '🏠', text: 'Revisar el estado del almacenamiento' }
    );
  }

  // dedup
  const seen = new Set();
  return recs.filter(r => { if (seen.has(r.text)) return false; seen.add(r.text); return true; });
}

/* ---------------------------------------------------------------
   ALERT CARD (inline)
--------------------------------------------------------------- */
let alertCardDismissed = false;

function renderAlertCard(s) {
  const card = document.getElementById('alert-card');
  if (!card) return;

  if (s.cls === 'safe') {
    card.classList.add('hidden');
    alertCardDismissed = false;
    return;
  }
  if (alertCardDismissed) return;

  const recs   = getRecommendations(s.ph, s.turb, s.tds);
  const isWarn = s.cls === 'warn';

  const recsHtml = recs.slice(0, 2).map(r =>
    `<div class="rec-item"><span class="rec-icon">${r.icon}</span><span>${r.text}</span></div>`
  ).join('');

  card.className = 'alert-card ' + (isWarn ? 'warn' : 'danger');
  card.innerHTML = `
    <div class="alert-card-header">
      <div class="alert-card-title-row">
        <span class="alert-card-emoji">${isWarn ? '⚠️' : '🚨'}</span>
        <div>
          <div class="alert-card-title">${isWarn ? 'Calidad irregular' : 'Agua no apta'}</div>
          <div class="alert-card-sub">${isWarn ? 'Se detectaron valores fuera de lo normal' : 'Múltiples parámetros en niveles críticos'}</div>
        </div>
      </div>
      <button class="alert-card-close" onclick="dismissAlertCard()">✕</button>
    </div>
    <div class="alert-card-recs">${recsHtml}</div>
    <button class="alert-card-btn" onclick="openRecommendationsModal()">Ver recomendaciones →</button>
  `;
  card.classList.remove('hidden');
}

function dismissAlertCard() {
  alertCardDismissed = true;
  const card = document.getElementById('alert-card');
  if (!card) return;
  card.style.opacity   = '0';
  card.style.transform = 'translateY(-8px)';
  setTimeout(() => {
    card.classList.add('hidden');
    card.style.opacity   = '';
    card.style.transform = '';
  }, 300);
}

/* ---------------------------------------------------------------
   RECOMMENDATIONS MODAL
--------------------------------------------------------------- */
function openRecommendationsModal() {
  const s      = states[stateIdx];
  const recs   = getRecommendations(s.ph, s.turb, s.tds);
  const isWarn = s.cls === 'warn';

  document.getElementById('rec-modal-badge').textContent = isWarn ? '⚠️ Calidad media' : '🚨 Calidad mala';
  document.getElementById('rec-modal-badge').className   = 'rec-modal-badge ' + s.cls;
  document.getElementById('rec-modal-title').textContent    = isWarn ? 'Qué hacer ahora' : 'Acción requerida';
  document.getElementById('rec-modal-subtitle').textContent = isWarn
    ? 'Tu agua presenta anomalías. Sigue estas recomendaciones.'
    : 'Tu agua no es segura en este momento. Actúa pronto.';
  document.getElementById('rec-modal-body').innerHTML = recs.map(r =>
    `<div class="modal-rec-item"><div class="modal-rec-icon">${r.icon}</div><span>${r.text}</span></div>`
  ).join('');

  document.getElementById('rec-modal').classList.add('show');
}

function closeRecommendationsModal() {
  document.getElementById('rec-modal').classList.remove('show');
}

/* ---------------------------------------------------------------
   VALVE CONTROL (single)
--------------------------------------------------------------- */
let valveOpen = true;

function toggleValve() {
  valveOpen = !valveOpen;
  updateValveUI();
  showToast(valveOpen ? '🚿 Válvula abierta' : '🔒 Válvula cerrada');
}

function updateValveUI() {
  const vi = document.getElementById('valve-icon');
  const vt = document.getElementById('valve-title');
  const vd = document.getElementById('valve-desc');
  const vs = document.getElementById('valve-status');
  const vb = document.getElementById('valve-btn');
  if (!vi) return;
  vi.className   = 'valve-icon ' + (valveOpen ? 'open' : 'closed');
  vi.textContent = valveOpen ? '🚿' : '🔒';
  if (vt) vt.textContent = valveOpen ? 'Flujo activo'              : 'Flujo detenido';
  if (vd) vd.textContent = valveOpen ? 'El agua circula normalmente' : 'Paso del agua bloqueado';
  if (vs) { vs.className = 'valve-status ' + (valveOpen ? 'open' : 'closed'); vs.textContent = valveOpen ? 'Abierta' : 'Cerrada'; }
  if (vb) { vb.className = 'valve-btn ' + (valveOpen ? '' : 'closed'); vb.textContent = valveOpen ? '🔒 Cerrar válvula' : '🚿 Abrir válvula'; }
}

/* ---------------------------------------------------------------
   WATER STATES
--------------------------------------------------------------- */
const states = [
  { cls:'safe',   emoji:'💧', label:'Agua segura',     msg:'Todo en condiciones normales',
    ph:7.1,  turb:2.8,  tds:180, phBadge:'ok',  turbBadge:'ok',   tdsBadge:'ok',  alert:false },
  { cls:'warn',   emoji:'⚠️', label:'Calidad irregular', msg:'Se detectó una anomalía',
    ph:7.4,  turb:6.2,  tds:240, phBadge:'ok',  turbBadge:'warn', tdsBadge:'ok',  alert:true  },
  { cls:'danger', emoji:'🚨', label:'Agua contaminada', msg:'Revisa tus recomendaciones',
    ph:5.8,  turb:14.5, tds:420, phBadge:'bad', turbBadge:'bad',  tdsBadge:'bad', alert:true  }
];
let stateIdx = 0;

function applyState(s) {
  document.getElementById('status-ring').className = 'status-ring-outer ' + s.cls;
  document.getElementById('status-emoji').textContent = s.emoji;
  const lbl = document.getElementById('status-label');
  lbl.textContent = s.label; lbl.className = 'status-label ' + s.cls;
  const msg = document.getElementById('status-msg');
  msg.textContent = s.msg;  msg.className  = 'status-message ' + s.cls;

  document.getElementById('ph-val').textContent   = s.ph;
  document.getElementById('turb-val').textContent = s.turb;
  document.getElementById('tds-val').textContent  = s.tds;
  const bCls  = { ok:'metric-badge ok', warn:'metric-badge warn', bad:'metric-badge bad' };
  const bText = { ok:'Normal', warn:'Alerta', bad:'Crítico' };
  ['ph','turb','tds'].forEach(k => {
    const el = document.getElementById(k + '-badge');
    el.className = bCls[s[k+'Badge']]; el.textContent = bText[s[k+'Badge']];
  });

  if (s.cls === 'danger') valveOpen = false;
  if (s.cls === 'safe')   valveOpen = true;
  updateValveUI();

  alertCardDismissed = false;
  renderAlertCard(s);

  ['dash-ph','dash-turb','dash-tds'].forEach((id, i) => {
    const el = document.getElementById(id);
    if (el) el.textContent = [s.ph, s.turb+' NTU', s.tds+' ppm'][i];
  });
}

function cycleStatus() {
  stateIdx = (stateIdx + 1) % states.length;
  applyState(states[stateIdx]);
  showToast(['✅ Estado: Seguro','⚠️ Estado: Irregular','🚨 Estado: Contaminado'][stateIdx]);
}

function liveUpdate() {
  if (stateIdx !== 0) return;
  const s = states[0];
  const j = (v, d) => Math.round((v + (Math.random()-0.5)*d)*10)/10;
  document.getElementById('ph-val').textContent   = j(s.ph, 0.2);
  document.getElementById('turb-val').textContent = j(s.turb, 0.3);
  document.getElementById('tds-val').textContent  = Math.round(j(s.tds, 5));
}
setInterval(liveUpdate, 3000);

/* ---------------------------------------------------------------
   DEVICE CHIPS
--------------------------------------------------------------- */
function renderDeviceChips() {
  const c = document.getElementById('device-chips-container');
  if (!c) return;
  c.innerHTML = '';
  devices.forEach(dev => {
    const chip = document.createElement('div');
    chip.className   = 'chip' + (dev.id === activeDeviceId ? ' active' : '');
    chip.textContent = (dev.id === 'CRK-A3F9B2' ? '🏠 ' : '📡 ') + dev.name;
    chip.onclick = () => selectDevice(dev.id);
    c.appendChild(chip);
  });
  const add = document.createElement('div');
  add.className = 'chip add-chip'; add.textContent = '+ Agregar';
  add.onclick = () => openAddDeviceModal();
  c.appendChild(add);
}

function selectDevice(id) {
  activeDeviceId = id;
  renderDeviceChips();
  renderHomeDeviceList();
  showToast('📡 Dispositivo seleccionado');
}

/* ---------------------------------------------------------------
   HOME DEVICE LIST
--------------------------------------------------------------- */
function renderHomeDeviceList() {
  const c = document.getElementById('home-device-list');
  if (!c) return;
  c.innerHTML = '';
  if (!devices.length) {
    c.innerHTML = '<div style="text-align:center;color:var(--text3);font-size:13px;padding:16px 0;">Sin dispositivos agregados</div>';
    return;
  }
  devices.forEach(dev => {
    const item = document.createElement('div');
    item.className = 'home-device-item';
    item.innerHTML = `
      <div class="hd-icon">${dev.id==='CRK-A3F9B2'?'🏠':'📡'}</div>
      <div class="hd-info"><div class="hd-name">${dev.name}</div><div class="hd-id">${dev.id}</div></div>
      <div class="hd-status">
        <span class="hd-badge ${dev.online?'online':'offline'}">${dev.online?'En línea':'Sin conexión'}</span>
        <span class="hd-reading">pH ${dev.ph} · ${dev.tds} ppm</span>
      </div>`;
    item.onclick = () => { selectDevice(dev.id); showToast('📡 Viendo: '+dev.name); };
    c.appendChild(item);
  });
}

/* ---------------------------------------------------------------
   ADD DEVICE LIST
--------------------------------------------------------------- */
function renderAddDeviceList() {
  const c = document.getElementById('add-device-list');
  if (!c) return;
  c.innerHTML = '';
  if (!devices.length) { c.innerHTML = '<div class="device-list-empty">Aún no has agregado dispositivos</div>'; return; }
  devices.forEach(dev => {
    const item = document.createElement('div');
    item.className = 'device-list-item';
    item.innerHTML = `
      <div class="d-icon">${dev.id==='CRK-A3F9B2'?'🏠':'📡'}</div>
      <div class="d-info"><div class="d-name">${dev.name}</div><div class="d-id">${dev.id} · ${dev.online?'En línea':'Sin conexión'}</div></div>
      <div class="d-dot" style="background:${dev.online?'var(--safe)':'var(--text3)'}"></div>`;
    c.appendChild(item);
  });
}

/* ---------------------------------------------------------------
   ADD DEVICE MODAL
--------------------------------------------------------------- */
function openAddDeviceModal() {
  document.getElementById('add-device-modal').classList.add('show');
  ['modal-device-name','modal-device-id'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
}
function closeAddDeviceModal() {
  document.getElementById('add-device-modal').classList.remove('show');
}
function confirmAddDevice() {
  const name = document.getElementById('modal-device-name').value.trim();
  const id   = document.getElementById('modal-device-id').value.trim();
  if (!name||!id) { showToast('⚠️ Ingresa el nombre y el ID'); return; }
  if (devices.find(d=>d.id===id)) { showToast('❌ ID ya registrado'); return; }
  devices.push({ id, name, online:true, ph:7.0, turb:2.5, tds:190 });
  closeAddDeviceModal();
  renderDeviceChips(); renderHomeDeviceList();
  showToast('✅ Dispositivo "'+name+'" agregado');
}

/* ---------------------------------------------------------------
   ADD DEVICE (screen)
--------------------------------------------------------------- */
function addDeviceFromScreen() {
  const id   = document.getElementById('device-code-input').value.trim();
  const name = document.getElementById('device-name-input').value.trim();
  if (!id||!name) { showToast('⚠️ Ingresa el ID y el nombre'); return; }
  if (devices.find(d=>d.id===id)) { showToast('❌ ID ya registrado'); return; }
  devices.push({ id, name, online:true, ph:7.0, turb:2.5, tds:190 });
  renderAddDeviceList();
  document.getElementById('device-code-input').value = '';
  document.getElementById('device-name-input').value = '';
  showToast('✅ Dispositivo "'+name+'" agregado');
}

/* ---------------------------------------------------------------
   CHARTS
--------------------------------------------------------------- */
function makePolyline(data, minV, maxV, w=310, h=80) {
  return data.map((v,i) => {
    const x = i*w/(data.length-1);
    const y = h-10-((v-minV)/(maxV-minV))*(h-20);
    return [x, Math.max(10,Math.min(h-10,y))];
  });
}
function renderChart(pts, pathId, areaId, dotsId, color) {
  const d = pts.map((p,i)=>(i===0?'M':'L')+p[0]+' '+p[1]).join(' ');
  const l = pts[pts.length-1];
  document.getElementById(pathId).setAttribute('d', d);
  document.getElementById(areaId).setAttribute('d', d+' L'+l[0]+' 70 L0 70 Z');
  const g = document.getElementById(dotsId); g.innerHTML='';
  const c = document.createElementNS('http://www.w3.org/2000/svg','circle');
  c.setAttribute('cx',l[0]); c.setAttribute('cy',l[1]); c.setAttribute('r','4');
  c.setAttribute('fill',color); c.setAttribute('stroke','#fff'); c.setAttribute('stroke-width','2');
  g.appendChild(c);
}
function renderCharts() {
  renderChart(makePolyline([7.0,7.2,7.1,6.9,7.3,7.4,7.1,7.2,7.0,7.1,7.3,7.1],5,10),   'ph-path',   'ph-area',   'ph-dots',   '#4caf7d');
  renderChart(makePolyline([2.5,3.1,2.8,2.6,3.4,2.9,2.7,3.0,2.8,2.5,2.9,2.8],0,8),     'turb-path', 'turb-area', 'turb-dots', '#4caf7d');
  renderChart(makePolyline([175,182,178,185,190,183,177,181,179,176,183,180],100,300),   'tds-path',  'tds-area',  'tds-dots',  '#4caf7d');
}

/* ---------------------------------------------------------------
   FILTER TABS
--------------------------------------------------------------- */
function setFilter(el, label) {
  document.querySelectorAll('.f-tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  showToast('📅 Filtro: '+label);
}

/* ---------------------------------------------------------------
   TOAST
--------------------------------------------------------------- */
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2500);
}

/* ---------------------------------------------------------------
   TOGGLE (settings)
--------------------------------------------------------------- */
function toggleSwitch(el) { el.classList.toggle('on'); }

/* ---------------------------------------------------------------
   INIT
--------------------------------------------------------------- */
setTimeout(()=>goTo('login'), 1800);
applyState(states[0]);
renderDeviceChips();
renderHomeDeviceList();
