#!/usr/bin/env node
// Descarga desde Modrinth los mods de rendimiento para Minecraft 1.21.1 (Fabric) y los deja en servidor-archivos/mods.
//
//   node herramientas/descargar-basicos.js                      -> paquete "rendimiento" (recomendado)
//   node herramientas/descargar-basicos.js --preset optifine    -> rendimiento + funciones de OptiFine (zoom, texturas conectadas...)
//   node herramientas/descargar-basicos.js --preset minimo      -> solo Fabric API + Sodium + Iris
//   node herramientas/descargar-basicos.js lithium modmenu      -> mods sueltos (y sus dependencias obligatorias)
//
// Si ejecutas de nuevo, las versiones viejas de cada mod se reemplazan por la más nueva.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MC = '1.21.1';
const API = 'https://api.modrinth.com/v2';
const UA = { 'User-Agent': 'launcher-servidor/1.0 (launcher de Minecraft para servidor propio)' };
const dest = path.join(__dirname, '..', 'servidor-archivos', 'mods');
const track = path.join(dest, '.descargas.json');

const BASE = ['fabric-api', 'sodium', 'iris'];
const RENDIMIENTO = [...BASE, 'lithium', 'ferrite-core', 'immediatelyfast', 'modernfix', 'entityculling', 'moreculling', 'dynamic-fps', 'sodium-extra', 'reeses-sodium-options'];
const PRESETS = {
  minimo: BASE,
  rendimiento: RENDIMIENTO,
  // Lo que hacía OptiFine, ahora con mods de Fabric: zoom, texturas conectadas, modelos y texturas de entidades, luz dinámica, CIT y GUI personalizadas.
  optifine: [...RENDIMIENTO, 'zoomify', 'continuity', 'entitytexturefeatures', 'entity-model-features', 'lambdynamiclights', 'citresewn', 'optigui']
};

const args = process.argv.slice(2);
const pi = args.indexOf('--preset');
let preset = 'rendimiento';
if (pi > -1) { preset = args[pi + 1]; args.splice(pi, 2); }
if (!PRESETS[preset]) { console.error(`Paquete desconocido "${preset}". Usa: ${Object.keys(PRESETS).join(', ')}`); process.exit(1); }
const wanted = args.length ? args : PRESETS[preset];

const done = new Set();
let tracked = {};
try { tracked = JSON.parse(fs.readFileSync(track, 'utf8')); } catch { /* primera vez */ }

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
  if (!versions.length) { console.warn(`  ! "${slugOrId}" no tiene versión para ${MC} con Fabric (se omite)`); return; }
  const v = versions.find((x) => x.version_type === 'release') || versions[0];
  const f = v.files.find((x) => x.primary) || v.files[0];
  done.add(v.project_id);

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
  // Si antes bajamos otra versión del mismo mod, se borra para no dejar duplicados
  const old = tracked[v.project_id];
  if (old && old !== f.filename && fs.existsSync(path.join(dest, old))) {
    fs.rmSync(path.join(dest, old));
    console.log(`  - ${old} (versión vieja)`);
  }
  tracked[v.project_id] = f.filename;

  for (const d of v.dependencies || []) {
    if (d.dependency_type === 'required' && d.project_id) await install(d.project_id);
  }
}

(async () => {
  console.log(`Descargando para Minecraft ${MC} (Fabric): ${args.length ? 'mods elegidos' : `paquete "${preset}"`}...`);
  for (const s of wanted) {
    try { await install(s); } catch (e) { console.error(`  x ${s}: ${e.message}`); process.exitCode = 1; }
  }
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(track, JSON.stringify(tracked, null, 2));
  console.log('\nListo. Ahora sube la carpeta servidor-archivos (o ejecuta 2-ACTUALIZAR-LISTA-DE-ARCHIVOS.bat).');
})();
