const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { Client, Authenticator } = require('minecraft-launcher-core');
const cfg = require('./launcher.config.json');
const { syncFiles, fetchManifest, readJson } = require('./src/sync');
const { applyDefaults } = require('./src/apply');
const { ensureJava } = require('./src/java');
const { ensureFabric } = require('./src/fabric');
const { pingServer } = require('./src/ping');

// MCLC comprueba Java leyendo la salida de "java -version", pero javaw.exe (la versión sin ventana
// de consola) no imprime nada y MCLC fallaría. Aquí solo comprobamos que el archivo exista.
require('minecraft-launcher-core/components/handler').prototype.checkJava = function (java) {
  const ok = java === 'java' || fs.existsSync(java);
  return Promise.resolve(ok ? { run: true } : { run: false, message: `No se encontró Java en ${java}` });
};

app.setPath('userData', path.join(app.getPath('appData'), cfg.dataFolder || 'MinecraftLauncher'));
const dataDir = app.getPath('userData');
const gameDir = path.join(dataDir, 'minecraft');
const settingsFile = path.join(dataDir, 'settings.json');
const logFile = path.join(dataDir, 'launcher.log');

const defaults = { username: '', accountType: 'offline', ramGb: cfg.defaultRamGb || 4, closeOnPlay: false, msSaved: null, msName: null };
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

app.whenReady().then(createWindow);
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
  config: { name: cfg.name, tagline: cfg.tagline, links: cfg.links || {}, serverIp: cfg.serverIp, minecraftVersion: cfg.minecraftVersion },
  settings: { username: settings.username, accountType: settings.accountType, ramGb: settings.ramGb, closeOnPlay: settings.closeOnPlay, msName: settings.msName }
}));

ipcMain.handle('info', async () => {
  try {
    const m = await fetchManifest(cfg.manifestUrl);
    manifestInfo = { serverIp: m.serverIp, news: m.news || [], tagline: m.tagline };
    return { ok: true, ...manifestInfo, serverIp: serverIp() };
  } catch (e) { log(`info: ${e.message}`); }
  return { ok: false, serverIp: serverIp() };
});

ipcMain.handle('server-status', () => pingServer(serverIp()));

ipcMain.handle('login-ms', async () => {
  try { return { ok: true, name: await microsoftLogin() }; }
  catch (e) { log(e.stack || e); return { ok: false, error: /closed|cancel/i.test(String(e.message || e)) ? 'Cerraste la ventana de inicio de sesión.' : (e.message || String(e)) }; }
});

ipcMain.handle('logout', () => { settings.msSaved = null; settings.msName = null; saveSettings(); return true; });

ipcMain.handle('save-settings', (_e, s) => {
  if (s.ramGb) settings.ramGb = Math.max(2, Math.min(32, Number(s.ramGb) || 4));
  if (typeof s.closeOnPlay === 'boolean') settings.closeOnPlay = s.closeOnPlay;
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

ipcMain.handle('play', async (_e, { accountType, username }) => {
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
    await runGame(accountType, username);
    return { ok: true };
  } catch (e) {
    playing = false;
    log(e.stack || e);
    send('error', e.message, 0);
    return { ok: false, error: e.message };
  }
});

// ---------- Flujo de "Jugar" ----------
async function runGame(type, username) {
  send('sync', 'Buscando actualizaciones…', 1);
  let manifest = null;
  try {
    const res = await syncFiles({
      manifestUrl: cfg.manifestUrl, gameDir,
      onProgress: (p) => {
        if (p.phase === 'check') return send('sync', 'Comprobando archivos…', 1 + (p.done / Math.max(1, p.total)) * 4);
        const frac = p.totalBytes ? p.bytes / p.totalBytes : 1;
        send('sync', `Descargando ${path.basename(p.file)} (${Math.min(p.filesDone + 1, p.filesTotal)}/${p.filesTotal})`, 5 + frac * 30);
      }
    });
    manifest = res.manifest;
    manifestInfo = { serverIp: manifest.serverIp, news: manifest.news || [], tagline: manifest.tagline };
  } catch (e) {
    log(`sync: ${e.stack || e}`);
    if (!fs.existsSync(path.join(gameDir, 'launcher-state.json'))) {
      throw new Error(`No se pudieron descargar los archivos del servidor. Revisa tu conexión a internet. (${e.message})`);
    }
    send('sync', 'Sin conexión: usando los archivos ya instalados', 35);
  }

  const javaPath = await ensureJava(path.join(dataDir, 'runtime'), (p) => send('java', 'Instalando Java 21 (solo la primera vez)…', 35 + p * 10));
  send('fabric', 'Preparando Fabric…', 46);
  const fabricId = await ensureFabric(gameDir, cfg.minecraftVersion, manifest && manifest.fabricLoader);
  if (manifest) applyDefaults(gameDir, manifest);

  send('auth', 'Iniciando sesión…', 48);
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

  const opts = {
    authorization, root: gameDir, javaPath,
    version: { number: cfg.minecraftVersion, type: 'release', custom: fabricId },
    memory: { max: `${settings.ramGb}G`, min: `${Math.min(2, settings.ramGb)}G` },
    customArgs: ['-XX:+UseG1GC', '-XX:+ParallelRefProcEnabled', '-XX:MaxGCPauseMillis=200'],
    window: { width: 1280, height: 720 }
  };
  if (serverIp()) opts.quickPlay = { type: 'multiplayer', identifier: serverIp() };

  send('launch', 'Preparando Minecraft…', 50);
  const proc = await mc.launch(opts);
  if (!proc) throw new Error('No se pudo iniciar Minecraft. Revisa launcher.log en la carpeta del launcher.');
  send('launch', 'Abriendo Minecraft…', 97);
}
