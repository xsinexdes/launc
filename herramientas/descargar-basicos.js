#!/usr/bin/env node
// Descarga desde Modrinth los mods base para Minecraft 1.21.1 con Fabric y los deja en servidor-archivos/mods.
//   node herramientas/descargar-basicos.js                 -> Fabric API + Sodium + Iris (shaders)
//   node herramientas/descargar-basicos.js lithium modmenu -> esos mods (y sus dependencias obligatorias)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MC = '1.21.1';
const API = 'https://api.modrinth.com/v2';
const UA = { 'User-Agent': 'launcher-servidor/1.0 (launcher de Minecraft para servidor propio)' };
const dest = path.join(__dirname, '..', 'servidor-archivos', 'mods');
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : ['fabric-api', 'sodium', 'iris'];
const done = new Set();

async function getJson(url) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  return r.json();
}

async function install(slugOrId) {
  if (done.has(slugOrId)) return;
  done.add(slugOrId);
  const q = `loaders=${encodeURIComponent('["fabric"]')}&game_versions=${encodeURIComponent(`["${MC}"]`)}`;
  const versions = await getJson(`${API}/project/${slugOrId}/version?${q}`);
  if (!versions.length) { console.warn(`  ! "${slugOrId}" no tiene versión para ${MC} con Fabric`); return; }
  const v = versions.find((x) => x.version_type === 'release') || versions[0];
  const f = v.files.find((x) => x.primary) || v.files[0];

  fs.mkdirSync(dest, { recursive: true });
  const out = path.join(dest, f.filename);
  if (fs.existsSync(out)) console.log(`  = ${f.filename} (ya estaba)`);
  else {
    const r = await fetch(f.url, { headers: UA });
    if (!r.ok) throw new Error(`${f.url} -> HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (f.hashes && f.hashes.sha1 && crypto.createHash('sha1').update(buf).digest('hex') !== f.hashes.sha1) throw new Error(`${f.filename}: descarga dañada`);
    fs.writeFileSync(out, buf);
    console.log(`  + ${f.filename}`);
  }
  for (const d of v.dependencies || []) {
    if (d.dependency_type === 'required' && d.project_id) await install(d.project_id);
  }
}

(async () => {
  console.log(`Descargando para Minecraft ${MC} (Fabric)...`);
  for (const s of wanted) {
    try { await install(s); } catch (e) { console.error(`  x ${s}: ${e.message}`); process.exitCode = 1; }
  }
  console.log('\nListo. Ahora ejecuta generar-manifest (o sube los cambios a GitHub).');
})();
