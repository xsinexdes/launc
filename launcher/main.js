const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const cfg = require('./launcher.config.json');
const { syncFiles, fetchManifest, readJson } = require('./src/sync');
const { installModrinth } = require('./src/modrinth');
const { applyDefaults } = require('./src/apply');
const { ensureJava } = require('./src/java');
const { ensureFabric } = require('./src/fabric');
const { pingServer } = require('./src/ping');
const perf = require('./src/perf');

// MCLC se carga solo cuando hace falta (así el launcher abre más rápido).
let mclc = null;
function getMclc() {
  if (mclc) return mclc;
  mclc = require('minecraft-launcher-core');
  // MCLC comprueba Java leyendo la salida de "java -version", pero javaw.exe (la versión sin ventana
  // de consola) no imprime nada y MCLC fallaría. Aquí solo comprobamos que el archivo exista.
  require('minecraft-launcher-core/components/handler').prototype.checkJava = function (java) {
    const ok = java === 'java' || fs.existsSync(java);
    return Promise.resolve(ok ? { run: true } : { run: false, message: `No se encontró Java en ${java}` });
  };
  return mclc;
}

// El launcher es una ventana sencilla: limitamos la memoria de su motor web.
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=160');

app.setPath('userData', path.join(app.getPath('appData'), cfg.dataFolder || 'MinecraftLauncher'));
const dataDir = app.getPath('userData');
const gameDir = path.join(dataDir, 'minecraft');
const settingsFile = path.join(dataDir, 'settings.json');
const logFile = path.join(dataDir, 'launcher.log');

const defaults = { username: '', accountType: 'offline', ramGb: cfg.defaultRamGb || 4, ramAuto: true, profile: 'auto', closeOnPlay: false, testServer: '', msSaved: null, msName: null };
let settings = { ...defaults, ...readJson(settingsFile, {}) };
let manifestInfo = {};
let win = null;
let playing = false;

fs.mkdirSync(dataDir, { recursive: true });
try { if (fs.statSync(logFile).size > 1024 * 1024) fs.rmSync(logFile); } catch { /* sin log aún */ }

const log = (m) => { try { fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${String(m).trimEnd()}\n`); } catch { /* ignorar */ } };
const saveSettings = () => fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
const send = (stage, text = '', percent = 0) => { if (win && !win.isDestroyed()) win.webContents.send('status', { stage, text, percent }); };
const serverIp = () => manifestInfo.serverIp || cfg.serverIp;
// El servidor "no está configurado" si la IP está vacía o sigue siendo la de ejemplo.
const serverConfigured = () => { const ip = (serverIp() || '').trim(); return ip !== '' && !/tuservidor|example\.com/i.test(ip); };

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

function createWindow() {
  win = new BrowserWindow({
    width: 1000, height: 600, frame: false, resizable: false, maximizable: false,
    backgroundColor: '#07050f', show: false, title: cfg.name,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => { Menu.setApplicationMenu(null); createWindow(); });
app.on('window-all-closed', () => app.quit());

// ---------- Microsoft (premium) ----------
async function microsoftLogin() {
  const { Auth } = require('msmc');
  const xbox = await new Auth('select_account').launch('electron', { width: 520, height: 700 });
  const mc = await xbox.getMinecraft();
  if (!mc.profile || mc.isDemo()) throw new Error('Esta cuenta de Microsoft no tiene Minecraft Java Edition.');
  settings.msSaved = xbox.save();
  settings.msName = mc.profile.name;
  saveSettings();
  return settings.msName;
}

async function microsoftAuth() {
  const { Auth } = require('msmc');
  const xbox = await new Auth('select_account').refresh(settings.msSaved);
  const mc = await xbox.getMinecraft();
  settings.msSaved = xbox.save();
  saveSettings();
  return mc.mclc();
}

// ---------- IPC ----------
ipcMain.handle('init', () => ({
  config: { name: cfg.name, tagline: cfg.tagline, links: cfg.links || {}, serverIp: cfg.serverIp, serverConfigured: serverConfigured(), minecraftVersion: cfg.minecraftVersion },
  settings: { username: settings.username, accountType: settings.accountType, ramGb: settings.ramGb, ramAuto: settings.ramAuto, profile: settings.profile, closeOnPlay: settings.closeOnPlay, testServer: settings.testServer, msName: settings.msName },
  system: (() => { const d = perf.detect(); return { ...d, recommendedRam: perf.recommendedRam(d.ramGb), autoProfile: perf.autoProfile(d), profiles: Object.fromEntries(Object.entries(perf.PROFILES).map(([k, v]) => [k, { label: v.label, info: v.info }])) }; })()
}));

ipcMain.handle('info', async () => {
  try {
    const m = await fetchManifest(cfg.manifestUrl);
    manifestInfo = { serverIp: m.serverIp, news: m.news || [], tagline: m.tagline, worlds: m.worlds || [] };
    return { ok: true, ...manifestInfo, serverIp: serverIp(), serverConfigured: serverConfigured() };
  } catch (e) { log(`info: ${e.message}`); }
  return { ok: false, serverIp: serverIp(), serverConfigured: serverConfigured() };
});

ipcMain.handle('server-status', async () => (serverConfigured() ? pingServer(serverIp()) : { online: false, unconfigured: true }));

ipcMain.handle('login-ms', async () => {
  try { return { ok: true, name: await microsoftLogin() }; }
  catch (e) { log(e.stack || e); return { ok: false, error: /closed|cancel/i.test(String(e.message || e)) ? 'Cerraste la ventana de inicio de sesión.' : (e.message || String(e)) }; }
});

ipcMain.handle('logout', () => { settings.msSaved = null; settings.msName = null; saveSettings(); return true; });

ipcMain.handle('save-settings', (_e, s) => {
  if (s.ramGb) settings.ramGb = Math.max(2, Math.min(32, Number(s.ramGb) || 4));
  if (typeof s.closeOnPlay === 'boolean') settings.closeOnPlay = s.closeOnPlay;
  if (typeof s.ramAuto === 'boolean') settings.ramAuto = s.ramAuto;
  if (typeof s.testServer === 'string') settings.testServer = /^[A-Za-z0-9.\-]+(:\d{1,5})?$/.test(s.testServer.trim()) ? s.testServer.trim() : '';
  if (['auto', 'modesto', 'equilibrado', 'alto'].includes(s.profile)) settings.profile = s.profile;
  if (typeof s.username === 'string') settings.username = s.username;
  if (s.accountType) settings.accountType = s.accountType;
  saveSettings();
  return true;
});

ipcMain.handle('open-folder', () => { fs.mkdirSync(gameDir, { recursive: true }); return shell.openPath(gameDir); });

ipcMain.handle('repair', () => {
  for (const d of ['libraries', 'versions', 'launcher-state.json']) fs.rmSync(path.join(gameDir, d), { recursive: true, force: true });
  return true;
});

ipcMain.on('open-link', (_e, url) => { if (/^https:\/\//.test(url)) shell.openExternal(url); });
ipcMain.on('win', (_e, action) => { if (!win) return; if (action === 'min') win.minimize(); if (action === 'close') win.close(); });

ipcMain.handle('play', async (_e, { accountType, username, mode = 'server', world = '' }) => {
  if (playing) return { ok: false, error: 'El juego ya se está iniciando.' };
  playing = true;
  try {
    if (accountType === 'offline') {
      if (!/^[A-Za-z0-9_]{3,16}$/.test(username || '')) throw new Error('El nombre debe tener de 3 a 16 caracteres: letras, números o guion bajo.');
      settings.username = username;
    } else if (!settings.msSaved) {
      throw new Error('Inicia sesión con Microsoft para jugar con tu cuenta premium.');
    }
    settings.accountType = accountType;
    saveSettings();
    await runGame(accountType, username, mode, world);
    return { ok: true };
  } catch (e) {
    playing = false;
    log(e.stack || e);
    send('error', e.message, 0);
    return { ok: false, error: e.message };
  }
});

// ---------- Flujo de "Jugar" ----------
async function runGame(type, username, mode, world) {
  send('sync', 'Buscando actualizaciones…', 1);
  let manifest = null;
  try {
    manifest = await fetchManifest(cfg.manifestUrl);
    let extraKeep = [];
    if ((manifest.modrinth || []).length) {
      send('sync', 'Buscando Fabric API y mods base…', 2);
      try {
        const r = await installModrinth({
          slugs: manifest.modrinth, mc: cfg.minecraftVersion, gameDir,
          onProgress: (p) => send('sync', `Instalando ${p.file} (${p.done}/${p.total})`, 2 + (p.done / Math.max(1, p.total)) * 18)
        });
        extraKeep = r.keep;
        r.warnings.forEach((w) => log(`modrinth: ${w}`));
      } catch (e) {
        log(`modrinth: ${e.stack || e}`);
        throw Object.assign(e, { fatalMods: true });
      }
    }
    const res = await syncFiles({
      manifest, manifestUrl: cfg.manifestUrl, gameDir, extraKeep,
      onProgress: (p) => {
        if (p.phase === 'check') return send('sync', 'Comprobando archivos…', 20);
        const frac = p.totalBytes ? p.bytes / p.totalBytes : 1;
        send('sync', `Descargando ${path.basename(p.file)} (${Math.min(p.filesDone + 1, p.filesTotal)}/${p.filesTotal})`, 20 + frac * 15);
      }
    });
    manifest = res.manifest;
    manifestInfo = { serverIp: manifest.serverIp, news: manifest.news || [], tagline: manifest.tagline, worlds: manifest.worlds || [] };
  } catch (e) {
    log(`sync: ${e.stack || e}`);
    if (e.fatalMods || !fs.existsSync(path.join(gameDir, 'launcher-state.json'))) {
      throw new Error(e.fatalMods ? e.message : `No se pudieron descargar los archivos del servidor. Revisa tu conexión a internet. (${e.message})`);
    }
    send('sync', 'Sin conexión: usando los archivos ya instalados', 35);
  }

  const javaPath = await ensureJava(path.join(dataDir, 'runtime'), (p) => send('java', 'Instalando Java 21 (solo la primera vez)…', 35 + p * 10));
  send('fabric', 'Preparando Fabric…', 46);
  const fabricId = await ensureFabric(gameDir, cfg.minecraftVersion, manifest && manifest.fabricLoader);
  if (manifest) applyDefaults(gameDir, manifest);
  if (serverConfigured()) { try { await require('./src/servers').ensureServerEntry(gameDir, cfg.name, serverIp()); } catch (e) { log(`servers.dat: ${e.message}`); } }
  if (settings.testServer) { try { await require('./src/servers').ensureServerEntry(gameDir, 'Servidor de pruebas', settings.testServer); } catch (e) { log(`servers.dat (pruebas): ${e.message}`); } }
  // Sin servidor configurado, "Jugar" abre el menú de Minecraft en vez de intentar conectar a la nada.
  if (mode === 'server' && !serverConfigured()) mode = 'menu';

  send('auth', 'Iniciando sesión…', 48);
  const { Client, Authenticator } = getMclc();
  const authorization = type === 'offline' ? await Authenticator.getAuth(username) : await microsoftAuth();

  const mc = new Client();
  const tail = [];
  let started = false;
  let lastSend = 0;
  const labels = { assets: 'recursos', classes: 'librerías', 'classes-custom': 'librerías de Fabric', 'classes-maven-custom': 'librerías de Fabric', natives: 'nativos', 'version-jar': 'Minecraft' };

  mc.on('progress', (e) => {
    const now = Date.now();
    if (now - lastSend < 120 && e.task !== e.total) return;
    lastSend = now;
    send('launch', `Descargando ${labels[e.type] || 'archivos'}… ${e.task}/${e.total}`, 50 + (e.task / Math.max(1, e.total)) * 45);
  });
  mc.on('debug', (m) => log(m));
  mc.on('data', (d) => {
    log(d);
    tail.push(...String(d).split('\n').filter(Boolean));
    if (tail.length > 40) tail.splice(0, tail.length - 40);
    if (!started && /Setting user:|Backend library|Sound engine started/.test(d)) {
      started = true;
      send('playing', '¡Buen viaje! Minecraft está abierto.', 100);
      if (settings.closeOnPlay) setTimeout(() => app.quit(), 3000);
      else if (win) win.minimize();
    }
  });
  mc.on('close', (code) => {
    playing = false;
    if (win && !win.isDestroyed()) { if (win.isMinimized()) win.restore(); win.show(); }
    if (code === 0) return send('idle', '', 0);
    send('error', started ? `Minecraft se cerró con un error (código ${code}). Abre la carpeta del juego y revisa logs/latest.log.` : `No se pudo iniciar Minecraft (código ${code}). Revisa launcher.log.`, 0);
  });

  // Rendimiento: perfil (automático según el PC) + memoria + parámetros de Java + ajustes del juego la primera vez
  const sys = perf.detect();
  const profile = settings.profile === 'auto' ? perf.autoProfile(sys) : settings.profile;
  const ram = settings.ramAuto ? perf.recommendedRam(sys.ramGb) : settings.ramGb;
  try { perf.applyPerfOptions(gameDir, profile); } catch (e) { log(`perf: ${e.message}`); }
  log(`Rendimiento: perfil ${profile}, ${ram} GB (PC: ${sys.ramGb} GB, ${sys.cores} núcleos)`);

  const opts = {
    authorization, root: gameDir, javaPath,
    version: { number: cfg.minecraftVersion, type: 'release', custom: fabricId },
    memory: { max: `${ram}G`, min: `${Math.max(1, Math.floor(ram / 2))}G` },
    customArgs: perf.jvmArgs(profile, path.join(dataDir, 'runtime', 'mc-cds.jsa')),
    overrides: { maxSockets: 16 },
    window: { width: 1280, height: 720 }
  };
  if (mode === 'server') opts.quickPlay = { type: 'multiplayer', identifier: serverIp() };
  if (mode === 'test' && settings.testServer) opts.quickPlay = { type: 'multiplayer', identifier: settings.testServer };
  if (mode === 'world' && /^[\w .-]+$/.test(world) && fs.existsSync(path.join(gameDir, 'saves', world))) opts.quickPlay = { type: 'singleplayer', identifier: world };

  send('launch', 'Preparando Minecraft…', 50);
  const proc = await mc.launch(opts);
  if (!proc) throw new Error('No se pudo iniciar Minecraft. Revisa launcher.log en la carpeta del launcher.');
  send('launch', 'Abriendo Minecraft…', 97);
}
