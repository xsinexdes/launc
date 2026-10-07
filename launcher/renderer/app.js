const $ = (s) => document.querySelector(s);
const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;
const S = { type: 'offline', busy: false, ms: null, serverIp: '', config: null, configured: true, worlds: [], sys: null, set: null };

// ---------- Estrellas (ligeras: 30 fps y en pausa mientras juegas) ----------
let calm = false;
let wakeStars = () => {};
(function stars() {
  const c = $('#stars'), ctx = c.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  c.width = 1000 * dpr; c.height = 600 * dpr; ctx.scale(dpr, dpr);
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const list = Array.from({ length: 110 }, () => ({
    x: Math.random() * 1000, y: Math.random() * 600, r: Math.random() * 1.3 + .25,
    v: Math.random() * .12 + .02, t: Math.random() * 6.28, s: Math.random() * 1.5 + .4
  }));
  let last = 0, running = false;
  function draw(dt) {
    ctx.clearRect(0, 0, 1000, 600);
    for (const s of list) {
      if (!still) { s.x -= s.v * dt; s.t += .02 * s.s * dt; if (s.x < -2) s.x = 1002; }
      const a = .35 + .55 * (0.5 + 0.5 * Math.sin(s.t));
      ctx.fillStyle = s.r > 1.1 ? `rgba(255,214,225,${a})` : `rgba(214,200,255,${a})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.2832); ctx.fill();
    }
  }
  function frame(now) {
    if (still || calm || document.hidden) { running = false; return; }
    requestAnimationFrame(frame);
    if (now - last < 33) return;
    draw(Math.min(80, now - last) / 16.7); last = now;
  }
  wakeStars = () => { if (!running && !still && !calm && !document.hidden) { running = true; last = performance.now(); requestAnimationFrame(frame); } };
  draw(0); wakeStars();
  document.addEventListener('visibilitychange', wakeStars);
})();

// ---------- Parallax suave con el mouse ----------
document.addEventListener('mousemove', (e) => {
  document.documentElement.style.setProperty('--mx', ((e.clientX / 1000) - .5).toFixed(3));
  document.documentElement.style.setProperty('--my', ((e.clientY / 600) - .5).toFixed(3));
});
if (matchMedia('(prefers-reduced-motion: reduce)').matches) { try { $('#sky').pauseAnimations(); $('#sky').style.display = 'none'; } catch { /* sin SMIL */ } }

// ---------- Estado del botón Jugar ----------
function validName() { return NAME_RE.test($('#user').value.trim()); }
function canPlay() { return S.type === 'offline' ? validName() : !!S.ms; }

function refreshPlay() {
  const btn = $('#play');
  btn.disabled = S.busy || !canPlay();
  document.querySelectorAll('.chip').forEach((c) => { c.disabled = S.busy || !canPlay(); });
}

function renderChips() {
  const box = $('#chips');
  box.replaceChildren();
  const add = (label, mode, world) => {
    const b = document.createElement('button');
    b.className = 'chip' + (world ? ' world' : '');
    b.textContent = label;
    b.addEventListener('click', () => startGame(mode, world));
    box.append(b);
  };
  add('Menú', 'menu');
  for (const w of S.worlds) add(w, 'world', w);
  if (S.set && S.set.testServer) add('Servidor de pruebas', 'test');
  $('#alt-title').textContent = 'Probar sin servidor';
  refreshPlay();
}

function applyServerState() {
  $('#copy-ip').hidden = !S.configured;
  if (!S.configured) {
    $('#dot').className = 'dot';
    $('#online').textContent = 'Servidor sin configurar';
  }
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
  const quiet = stage === 'playing';
  if (quiet !== calm) { calm = quiet; document.body.classList.toggle('calm', quiet); wakeStars(); }
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
async function startGame(mode, world) {
  if (S.busy || !canPlay()) return;
  setStatus('');
  setBusy(true);
  const r = await window.api.play({ accountType: S.type, username: $('#user').value.trim(), mode, world });
  if (!r.ok) { setBusy(false); setStatus(r.error, true); }
}
$('#play').addEventListener('click', () => startGame('server'));

// ---------- Servidor y novedades ----------
async function refreshServer() {
  if (!S.configured) return applyServerState();
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
function renderPerf() {
  const sys = S.sys, set = S.set;
  const maxRam = Math.max(2, Math.min(16, sys.ramGb - 1));
  $('#ram').max = String(maxRam);
  $('#sys').textContent = `Tu PC: ${sys.ramGb} GB de RAM y ${sys.cores} ${sys.cores === 1 ? 'núcleo' : 'núcleos'}.`;
  $('#ram-auto').checked = set.ramAuto;
  $('#ram').disabled = set.ramAuto;
  const v = set.ramAuto ? sys.recommendedRam : Math.min(set.ramGb, maxRam);
  $('#ram').value = String(v);
  $('#ram-out').textContent = `${v} GB`;
  const box = $('#profiles');
  box.replaceChildren();
  const opts = [['auto', 'Auto'], ...Object.entries(sys.profiles).map(([k, p]) => [k, p.label])];
  for (const [key, label] of opts) {
    const b = document.createElement('button');
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(set.profile === key));
    b.textContent = label;
    b.addEventListener('click', () => { set.profile = key; window.api.saveSettings({ profile: key }); renderPerf(); });
    box.append(b);
  }
  $('#profile-info').textContent = set.profile === 'auto'
    ? `Automático: para tu PC se usa el perfil ${sys.profiles[sys.autoProfile].label}.`
    : sys.profiles[set.profile].info;
}
$('#ram').addEventListener('input', (e) => { $('#ram-out').textContent = `${e.target.value} GB`; });
$('#ram').addEventListener('change', (e) => { S.set.ramGb = Number(e.target.value); window.api.saveSettings({ ramGb: S.set.ramGb }); });
const IP_RE = /^[A-Za-z0-9.\-]+(:\d{1,5})?$/;
$('#test-ip').addEventListener('change', async (e) => {
  const v = e.target.value.trim();
  const valid = v === '' || IP_RE.test(v);
  $('#test-hint').classList.toggle('bad', !valid);
  $('#test-hint').textContent = valid ? 'Sale en Multijugador y como botón.' : 'Escribe una IP o dominio, por ejemplo 127.0.0.1:25565.';
  if (!valid) return;
  S.set.testServer = v;
  await window.api.saveSettings({ testServer: v });
  renderChips();
});
$('#ram-auto').addEventListener('change', (e) => { S.set.ramAuto = e.target.checked; window.api.saveSettings({ ramAuto: e.target.checked }); renderPerf(); });
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
  const { config, settings, system } = await window.api.init();
  S.config = config; S.sys = system; S.set = settings;
  S.ms = settings.msName || null;
  S.serverIp = config.serverIp;
  S.configured = config.serverConfigured;
  document.title = config.name;
  $('#name').textContent = config.name;
  $('#tagline').textContent = config.tagline;
  $('#copy-ip').textContent = config.serverIp;
  $('#user').value = settings.username || '';
  renderPerf();
  $('#test-ip').value = settings.testServer || '';
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
  renderChips();
  applyServerState();
  if (!S.configured) setStatus('Sin servidor: Jugar abre el menú de Minecraft.');
  refreshServer();
  setInterval(refreshServer, 60000);

  const info = await window.api.info();
  renderNews(info.news);
  if (info.serverIp) { S.serverIp = info.serverIp; $('#copy-ip').textContent = info.serverIp; }
  S.configured = info.serverConfigured;
  S.worlds = info.worlds || [];
  renderChips();
  applyServerState();
  if (S.configured && $('#status').classList.contains('note')) setStatus('');
  if (S.configured) refreshServer();
  if (!info.ok) setStatus('No se pudo contactar con el servidor de archivos. Al jugar se usará lo ya instalado.');
})();
