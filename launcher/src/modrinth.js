// Instala desde Modrinth (en el PC de cada jugador) los mods base que tú listes en ajustes.json -> "modrinth":
// Fabric API, Sodium, etc. Siempre baja la versión más nueva para 1.21.1 con Fabric y sus dependencias obligatorias.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');
const { readJson } = require('./sync');

const API = 'https://api.modrinth.com/v2';
const UA = { 'User-Agent': 'launcher-servidor/1.0 (launcher de Minecraft para servidor propio)' };
const TTL = 6 * 3600 * 1000; // no vuelve a preguntar a Modrinth antes de 6 horas

async function getJson(url) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function downloadTo(url, dest, sha1) {
  const tmp = dest + '.part';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(10 * 60 * 1000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const hash = crypto.createHash('sha1');
      const body = Readable.fromWeb(r.body);
      body.on('data', (c) => hash.update(c));
      await pipeline(body, fs.createWriteStream(tmp));
      if (sha1 && hash.digest('hex') !== sha1) throw new Error('el archivo llegó dañado');
      await fsp.rename(tmp, dest);
      return;
    } catch (e) {
      await fsp.rm(tmp, { force: true });
      if (attempt === 3) throw new Error(`${path.basename(dest)}: ${e.message}`);
    }
  }
}

async function resolveAll(slugs, mc) {
  const q = `loaders=${encodeURIComponent('["fabric"]')}&game_versions=${encodeURIComponent(`["${mc}"]`)}`;
  const seen = new Set();
  const found = {};
  const warnings = [];
  async function one(idOrSlug) {
    if (seen.has(idOrSlug)) return;
    seen.add(idOrSlug);
    const versions = await getJson(`${API}/project/${encodeURIComponent(idOrSlug)}/version?${q}`);
    if (!versions.length) { warnings.push(`"${idOrSlug}" no tiene versión para ${mc} con Fabric; se omite`); return; }
    const v = versions.find((x) => x.version_type === 'release') || versions[0];
    const f = v.files.find((x) => x.primary) || v.files[0];
    seen.add(v.project_id);
    found[v.project_id] = { filename: f.filename, url: f.url, sha1: f.hashes && f.hashes.sha1, size: f.size };
    await Promise.all((v.dependencies || []).filter((d) => d.dependency_type === 'required' && d.project_id).map((d) => one(d.project_id)));
  }
  await Promise.all(slugs.map(one));
  return { found, warnings };
}

async function installModrinth({ slugs, mc, gameDir, onProgress = () => {} }) {
  const statePath = path.join(gameDir, 'launcher-state.json');
  const state = readJson(statePath, {});
  const rec = state.modrinth || {};
  const old = rec.files || {};
  const modsDir = path.join(gameDir, 'mods');
  const keepOf = (files) => Object.values(files).map((f) => `mods/${f}`);
  const sameList = JSON.stringify(rec.slugs || []) === JSON.stringify(slugs);
  const allThere = Object.values(old).every((f) => fs.existsSync(path.join(modsDir, f)));

  if (sameList && allThere && Object.keys(old).length && Date.now() - (rec.checkedAt || 0) < TTL) {
    return { keep: keepOf(old), warnings: [], downloaded: 0 };
  }

  let found, warnings;
  try {
    ({ found, warnings } = await resolveAll(slugs, mc));
  } catch (e) {
    if (Object.keys(old).length && allThere) return { keep: keepOf(old), warnings: [`Modrinth no respondió (${e.message}); se usan los mods ya instalados`], downloaded: 0 };
    throw new Error(`No se pudieron descargar los mods base (Fabric API, Sodium...) desde Modrinth. Revisa tu conexión. (${e.message})`);
  }

  await fsp.mkdir(modsDir, { recursive: true });
  const entries = Object.entries(found);
  let done = 0;
  let downloaded = 0;
  for (const [, f] of entries) {
    const dest = path.join(modsDir, f.filename);
    let ok = false;
    try { ok = (await fsp.stat(dest)).size === f.size; } catch { /* no existe */ }
    if (!ok) { await downloadTo(f.url, dest, f.sha1); downloaded++; }
    onProgress({ done: ++done, total: entries.length, file: f.filename });
  }

  // Quitar versiones viejas o mods que ya no están en la lista
  const newFiles = Object.fromEntries(entries.map(([pid, f]) => [pid, f.filename]));
  for (const [pid, name] of Object.entries(old)) {
    if (newFiles[pid] !== name) await fsp.rm(path.join(modsDir, name), { force: true });
  }

  const fresh = readJson(statePath, {});
  fs.writeFileSync(statePath, JSON.stringify({ ...fresh, modrinth: { slugs, checkedAt: Date.now(), files: newFiles } }));
  return { keep: keepOf(newFiles), warnings, downloaded };
}

module.exports = { installModrinth };
