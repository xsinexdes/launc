// Descarga Java 21 (Temurin) una sola vez para que el jugador no tenga que instalar nada.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');
const extract = require('extract-zip');

const URL_JRE = 'https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jre/hotspot/normal/eclipse';

function findJavaw(dir) {
  const direct = path.join(dir, 'bin', 'javaw.exe');
  if (fs.existsSync(direct)) return direct;
  for (const e of fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : []) {
    if (e.isDirectory()) {
      const p = path.join(dir, e.name, 'bin', 'javaw.exe');
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

async function ensureJava(runtimeDir, onProgress = () => {}) {
  if (process.platform !== 'win32') return 'java'; // en Linux/Mac usa el Java del sistema (necesita Java 21)
  const jreDir = path.join(runtimeDir, 'java21');
  const have = findJavaw(jreDir);
  if (have) return have;

  await fsp.mkdir(runtimeDir, { recursive: true });
  const zip = path.join(runtimeDir, 'java21.zip');
  const r = await fetch(URL_JRE, { signal: AbortSignal.timeout(15 * 60 * 1000) });
  if (!r.ok) throw new Error(`No se pudo descargar Java (HTTP ${r.status})`);
  const total = Number(r.headers.get('content-length')) || 0;
  let got = 0;
  const body = Readable.fromWeb(r.body);
  body.on('data', (c) => { got += c.length; if (total) onProgress(Math.min(0.9, (got / total) * 0.9)); });
  await pipeline(body, fs.createWriteStream(zip));

  await fsp.rm(jreDir, { recursive: true, force: true });
  await extract(zip, { dir: jreDir });
  await fsp.rm(zip, { force: true });
  onProgress(1);
  const javaw = findJavaw(jreDir);
  if (!javaw) throw new Error('Java se descargó pero no se encontró javaw.exe');
  return javaw;
}

module.exports = { ensureJava };
