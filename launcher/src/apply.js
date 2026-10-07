// Activa el resource pack y el shader del servidor la primera vez que cambian
// (después el jugador puede cambiarlos a su gusto).
const fs = require('fs');
const path = require('path');
const { readJson } = require('./sync');

function setProp(text, key, value) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  const i = lines.findIndex((l) => l.startsWith(key + '='));
  if (i >= 0) lines[i] = `${key}=${value}`; else lines.push(`${key}=${value}`);
  return lines.join('\n') + '\n';
}

function applyDefaults(gameDir, manifest) {
  const statePath = path.join(gameDir, 'launcher-state.json');
  const state = readJson(statePath, {});
  const apply = (manifest && manifest.apply) || {};

  const rp = apply.resourcePack;
  if (rp && state.appliedResourcePack !== rp && fs.existsSync(path.join(gameDir, 'resourcepacks', rp))) {
    const file = path.join(gameDir, 'options.txt');
    const entry = `file/${rp}`;
    let lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l !== '') : [];
    const i = lines.findIndex((l) => l.startsWith('resourcePacks:'));
    let list = ['vanilla'];
    if (i >= 0) { try { list = JSON.parse(lines[i].slice('resourcePacks:'.length)); } catch { /* usa vanilla */ } }
    if (state.appliedResourcePack) list = list.filter((p) => p !== `file/${state.appliedResourcePack}`);
    if (!list.includes(entry)) list.push(entry);
    const line = `resourcePacks:${JSON.stringify(list)}`;
    if (i >= 0) lines[i] = line; else lines.push(line);
    fs.writeFileSync(file, lines.join('\n') + '\n');
    state.appliedResourcePack = rp;
  }

  const sp = apply.shaderPack;
  if (sp && state.appliedShaderPack !== sp && fs.existsSync(path.join(gameDir, 'shaderpacks', sp))) {
    const file = path.join(gameDir, 'config', 'iris.properties');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    let text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    text = setProp(text, 'shaderPack', sp);
    text = setProp(text, 'enableShaders', 'true');
    fs.writeFileSync(file, text);
    state.appliedShaderPack = sp;
  }

  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

module.exports = { applyDefaults };
