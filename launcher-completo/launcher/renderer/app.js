const $ = (s) => document.querySelector(s);
const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;
const S = { type: 'offline', busy: false, ms: null, serverIp: '', config: null };

// ---------- Estrellas ----------
(function stars() {
  const c = $('#stars'), ctx = c.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  c.width = 1000 * dpr; c.height = 600 * dpr; ctx.scale(dpr, dpr);
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const list = Array.from({ length: 170 }, () => ({
    x: Math.random() * 1000, y: Math.random() * 600, r: Math.random() * 1.3 + .25,
    v: Math.random() * .12 + .02, t: Math.random() * 6.28, s: Math.random() * 1.5 + .4
  }));
  let last = 0;
  function frame(now) {
    const dt = Math.min(50, now - last) / 16.7; last = now;
    ctx.clearRect(0, 0, 1000, 600);
    for (const s of list) {
      if (!still) { s.x -= s.v * dt; s.t += .02 * s.s * dt; if (s.x < -2) s.x = 1002; }
      const a = .35 + .55 * (0.5 + 0.5 * Math.sin(s.t));
      ctx.fillStyle = s.r > 1.1 ? `rgba(255,214,225,${a})` : `rgba(214,200,255,${a})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.2832); ctx.fill();
    }
    if (!still && !document.hidden) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !still) requestAnimationFrame(frame); });
})();

// ---------- Estado del botón Jugar ----------
function validName() { return NAME_RE.test($('#user').value.trim()); }
function canPlay() { return S.type === 'offline' ? validName() : !!S.ms; }

function refreshPlay() {
  const btn = $('#play');
  btn.disabled = S.busy || !canPlay();
}

function setBusy(busy, label) {
  S.busy = busy;
  const btn = $('#play');
  btn.classList.toggle('busy', busy);
  if (!busy) { btn.classList.remove('live'); $('.fill').style.width = '0'; }
  $('.label').textContent = label || (busy ? '0%' : 'Jugar');
  refreshPlay();
}

function setStatus(text, bad) {
  const el = $('#status');
  el.textContent = text || '\u00a0';
  el.classList.toggle('bad', !!bad);
}

window.api.onStatus(({ stage, text, percent }) => {
  if (stage === 'idle') { setBusy(false); return setStatus(''); }
  if (stage === 'error') { setBusy(false); return setStatus(text, true); }
  if (stage === 'playing') {
    setBusy(true, 'Jugando');
    $('#play').classList.add('live');
    return setStatus(text);
  }
  if (!S.busy) setBusy(true);
  $('.fill').style.width = `${Math.max(0, Math.min(100, percent))}%`;
  $('.label').textContent = `${Math.round(percent)}%`;
  setStatus(text);
});

// ---------- Cuenta ----------
function setType(t) {
  S.type = t;
  $('#seg').dataset.active = t;
  document.querySelectorAll('.seg button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.type === t)));
  $('#pane-offline').hidden = t !== 'offline';
  $('#pane-ms').hidden = t !== 'microsoft';
  refreshMs();
  refreshPlay();
}

function refreshMs() {
  $('#ms-login').hidden = !!S.ms;
  $('#ms-hint').hidden = !!S.ms;
  $('#ms-account').hidden = !S.ms;
  $('#ms-name').textContent = S.ms || '';
}

document.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => {
  if (S.busy) return;
  setType(b.dataset.type);
  window.api.saveSettings({ accountType: b.dataset.type });
}));

$('#user').addEventListener('input', (e) => {
  e.target.value = e.target.value.replace(/[^A-Za-z0-9_]/g, '');
  const v = e.target.value.trim();
  $('#hint').classList.toggle('bad', v.length > 0 && !validName());
  refreshPlay();
});

$('#ms-login').addEventListener('click', async () => {
  const b = $('#ms-login');
  b.disabled = true; b.textContent = 'Esperando a Microsoft…';
  setStatus('');
  const r = await window.api.loginMicrosoft();
  b.disabled = false; b.textContent = 'Iniciar sesión con Microsoft';
  if (r.ok) { S.ms = r.name; refreshMs(); refreshPlay(); }
  else setStatus(r.error, true);
});

$('#ms-logout').addEventListener('click', async () => {
  await window.api.logout();
  S.ms = null; refreshMs(); refreshPlay(); setStatus('');
});

// ---------- Jugar ----------
$('#play').addEventListener('click', async () => {
  if (S.busy || !canPlay()) return;
  setStatus('');
  setBusy(true);
  const r = await window.api.play({ accountType: S.type, username: $('#user').value.trim() });
  if (!r.ok) { setBusy(false); setStatus(r.error, true); }
});

// ---------- Servidor y novedades ----------
async function refreshServer() {
  const r = await window.api.serverStatus();
  $('#dot').className = 'dot ' + (r.online ? 'on' : 'off');
  $('#online').textContent = r.online ? `${r.players.online} de ${r.players.max} en línea` : 'Servidor sin conexión';
}

function renderNews(list) {
  const box = $('#news-list');
  box.replaceChildren();
  if (!list || !list.length) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'Sin novedades por ahora. Cuando haya cambios en el servidor, aparecerán aquí.';
    return box.append(p);
  }
  for (const n of list.slice(0, 3)) {
    const d = document.createElement('div'); d.className = 'item';
    const date = document.createElement('div'); date.className = 'date'; date.textContent = n.date || '';
    const t = document.createElement('div'); t.className = 'title'; t.textContent = n.title || '';
    const p = document.createElement('p'); p.textContent = n.text || '';
    d.append(date, t, p); box.append(d);
  }
}

// ---------- Ajustes ----------
function drawer(open) {
  $('#drawer').classList.toggle('on', open);
  $('#scrim').classList.toggle('on', open);
  $('#drawer').setAttribute('aria-hidden', String(!open));
  if (open) $('#ram').focus();
}
$('#btn-settings').addEventListener('click', () => drawer(true));
$('#drawer-close').addEventListener('click', () => drawer(false));
$('#scrim').addEventListener('click', () => drawer(false));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') drawer(false); });
$('#btn-min').addEventListener('click', () => window.api.win('min'));
$('#btn-close').addEventListener('click', () => window.api.win('close'));
$('#ram').addEventListener('input', (e) => { $('#ram-out').textContent = `${e.target.value} GB`; });
$('#ram').addEventListener('change', (e) => window.api.saveSettings({ ramGb: Number(e.target.value) }));
$('#close-on-play').addEventListener('change', (e) => window.api.saveSettings({ closeOnPlay: e.target.checked }));
$('#open-folder').addEventListener('click', () => window.api.openFolder());
$('#repair').addEventListener('click', async () => {
  await window.api.repair();
  $('#repair-msg').textContent = 'Listo. En el próximo inicio se vuelve a verificar todo.';
});
$('#copy-ip').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(S.serverIp); $('#copy-ip').textContent = 'Copiada'; }
  catch { return; }
  setTimeout(() => { $('#copy-ip').textContent = S.serverIp; }, 1400);
});

// ---------- Inicio ----------
(async function boot() {
  const { config, settings } = await window.api.init();
  S.config = config;
  S.ms = settings.msName || null;
  S.serverIp = config.serverIp;
  document.title = config.name;
  $('#name').textContent = config.name;
  $('#tagline').textContent = config.tagline;
  $('#copy-ip').textContent = config.serverIp;
  $('#user').value = settings.username || '';
  $('#ram').value = settings.ramGb;
  $('#ram-out').textContent = `${settings.ramGb} GB`;
  $('#close-on-play').checked = settings.closeOnPlay;
  $('#ver').textContent = `Minecraft ${config.minecraftVersion} con Fabric`;

  const links = $('#links');
  for (const [key, label] of [['discord', 'Discord'], ['web', 'Sitio web']]) {
    if (config.links && config.links[key]) {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', () => window.api.openLink(config.links[key]));
      links.append(b);
    }
  }

  setType(settings.accountType === 'microsoft' ? 'microsoft' : 'offline');
  $('#user').dispatchEvent(new Event('input'));
  $('#hint').classList.remove('bad');
  refreshServer();
  setInterval(refreshServer, 60000);

  const info = await window.api.info();
  renderNews(info.news);
  if (info.serverIp) { S.serverIp = info.serverIp; $('#copy-ip').textContent = info.serverIp; }
  if (!info.ok) setStatus('No se pudo contactar con el servidor de archivos. Al jugar se usará lo ya instalado.');
})();
