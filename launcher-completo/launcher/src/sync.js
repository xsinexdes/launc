// Sincroniza mods / resourcepacks / shaderpacks / config con el manifest del servidor.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');

const ALLOWED = ['mods', 'resourcepacks', 'shaderpacks', 'config'];

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function sha1File(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha1');
    const s = fs.createReadStream(file);
    s.on('error', reject);
    s.on('data', (d) => h.update(d));
    s.on('end', () => resolve(h.digest('hex')));
  });
}

// Solo se aceptan rutas dentro de las carpetas permitidas (evita "../").
function safeRel(p) {
  const n = path.posix.normalize(String(p).replace(/\\/g, '/'));
  if (n.startsWith('/') || n.startsWith('..') || n.includes('/../')) return null;
  return ALLOWED.includes(n.split('/')[0]) ? n : null;
}

async function fetchManifest(url) {
  const sep = url.includes('?') ? '&' : '?';
  const r = await fetch(`${url}${sep}t=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`No se pudo leer la lista de archivos del servidor (HTTP ${r.status})`);
  return r.json();
}

async function download(url, dest, expectedSha1, onBytes) {
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  const tmp = dest + '.part';
  for (let attempt = 1; attempt <= 3; attempt++) {
    let got = 0;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(15 * 60 * 1000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const hash = crypto.createHash('sha1');
      const body = Readable.fromWeb(r.body);
      body.on('data', (c) => { hash.update(c); got += c.length; onBytes(c.length); });
      await pipeline(body, fs.createWriteStream(tmp));
      if (expectedSha1 && hash.digest('hex') !== expectedSha1) throw new Error('el archivo llegó dañado');
      await fsp.rename(tmp, dest);
      return;
    } catch (e) {
      onBytes(-got);
      await fsp.rm(tmp, { force: true });
      if (attempt === 3) throw new Error(`${path.basename(dest)}: ${e.message}`);
    }
  }
}

async function syncFiles({ manifestUrl, gameDir, onProgress = () => {}, manifest: preloaded }) {
  const manifest = preloaded || (await fetchManifest(manifestUrl));
  const base = manifest.baseUrl ? manifest.baseUrl.replace(/\/?$/, '/') : new URL('.', manifestUrl).href;
  const statePath = path.join(gameDir, 'launcher-state.json');
  const state = readJson(statePath, {});
  await fsp.mkdir(gameDir, { recursive: true });

  const files = (manifest.files || [])
    .map((f) => ({ ...f, rel: safeRel(f.path) }))
    .filter((f) => f.rel && f.sha1);

  // 1) Qué falta o cambió
  const todo = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    onProgress({ phase: 'check', done: i, total: files.length, file: f.rel });
    const dest = path.join(gameDir, ...f.rel.split('/'));
    let ok = false;
    try {
      const st = await fsp.stat(dest);
      if (st.size === f.size) ok = (await sha1File(dest)) === f.sha1;
    } catch { /* no existe */ }
    if (!ok) todo.push({ ...f, dest });
  }

  // 2) Borrar lo que el servidor ya no quiere
  const keep = new Set(files.map((f) => f.rel));
  const removed = [];
  for (const rel of state.managed || []) {
    if (!keep.has(rel) && safeRel(rel)) {
      await fsp.rm(path.join(gameDir, ...rel.split('/')), { force: true });
      removed.push(rel);
    }
  }
  for (const dirName of (manifest.strict || []).filter((d) => ALLOWED.includes(d))) {
    const entries = await fsp.readdir(path.join(gameDir, dirName), { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      const rel = `${dirName}/${e.name}`;
      if (e.isFile() && !keep.has(rel) && !e.name.endsWith('.part')) {
        await fsp.rm(path.join(gameDir, dirName, e.name), { force: true });
        removed.push(rel);
      }
    }
  }

  // 3) Descargar (4 a la vez)
  const totalBytes = todo.reduce((s, f) => s + (f.size || 0), 0);
  let bytes = 0;
  let filesDone = 0;
  let idx = 0;
  const worker = async () => {
    while (idx < todo.length) {
      const f = todo[idx++];
      const url = base + f.rel.split('/').map(encodeURIComponent).join('/');
      await download(url, f.dest, f.sha1, (n) => {
        bytes += n;
        onProgress({ phase: 'download', bytes, totalBytes, file: f.rel, filesDone, filesTotal: todo.length });
      });
      filesDone++;
      onProgress({ phase: 'download', bytes, totalBytes, file: f.rel, filesDone, filesTotal: todo.length });
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, todo.length) }, worker));

  fs.writeFileSync(statePath, JSON.stringify({ ...state, managed: [...keep] }, null, 2));
  return { manifest, downloaded: todo.length, removed: removed.length };
}

module.exports = { syncFiles, fetchManifest, sha1File, readJson, ALLOWED };
