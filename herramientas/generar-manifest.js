#!/usr/bin/env node
// Lee la carpeta "servidor-archivos" y crea "manifest.json": la lista que el launcher usa
// para saber qué instalar, actualizar o borrar en el PC de cada jugador.
//
//   node herramientas/generar-manifest.js
//   node herramientas/generar-manifest.js --base https://mi-hosting.com/archivos/   (si alojas los archivos fuera de GitHub)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..', 'servidor-archivos');
const FOLDERS = ['mods', 'resourcepacks', 'shaderpacks', 'config'];
const SKIP = /^(leeme\.txt|readme\.(txt|md)|\.gitkeep|\.ds_store|thumbs\.db)$|\.part$/i;

const baseArg = process.argv.indexOf('--base');
const baseUrl = baseArg > -1 ? process.argv[baseArg + 1] : '';

function walk(dir, rel = '') {
  let out = [];
  for (const e of fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : []) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out = out.concat(walk(path.join(dir, e.name), r));
    else if (!SKIP.test(e.name)) out.push(r);
  }
  return out;
}

function sha1(file) {
  return crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');
}

const files = [];
for (const folder of FOLDERS) {
  for (const rel of walk(path.join(root, folder)).sort()) {
    const p = `${folder}/${rel}`;
    const full = path.join(root, ...p.split('/'));
    files.push({ path: p, sha1: sha1(full), size: fs.statSync(full).size });
  }
}

let ajustes = {};
const ajustesFile = path.join(root, 'ajustes.json');
if (fs.existsSync(ajustesFile)) {
  try { ajustes = JSON.parse(fs.readFileSync(ajustesFile, 'utf8')); }
  catch (e) { console.error(`\nERROR: ajustes.json no es un JSON válido (${e.message}).\n`); process.exit(1); }
}

const apply = ajustes.apply || {};
for (const [kind, folder] of [['resourcePack', 'resourcepacks'], ['shaderPack', 'shaderpacks']]) {
  if (apply[kind] && !files.some((f) => f.path === `${folder}/${apply[kind]}`)) {
    console.warn(`AVISO: ajustes.json pide activar "${apply[kind]}" pero no está en ${folder}/`);
  }
}

const manifest = {
  version: Date.now(),
  ...(baseUrl ? { baseUrl } : {}),
  ...(ajustes.serverIp ? { serverIp: ajustes.serverIp } : {}),
  ...(ajustes.fabricLoader ? { fabricLoader: ajustes.fabricLoader } : {}),
  ...(ajustes.tagline ? { tagline: ajustes.tagline } : {}),
  strict: ajustes.strict || ['mods'],
  apply,
  news: ajustes.news || [],
  files
};

fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2));
const mb = (files.reduce((s, f) => s + f.size, 0) / 1048576).toFixed(1);
console.log(`manifest.json listo: ${files.length} archivos (${mb} MB)`);
for (const f of FOLDERS) console.log(`  ${f}: ${files.filter((x) => x.path.startsWith(f + '/')).length}`);
