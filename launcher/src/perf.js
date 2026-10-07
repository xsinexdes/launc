// Rendimiento: detecta el PC, elige perfil y memoria, y prepara los parámetros de Java y los ajustes del juego.
const os = require('os');
const fs = require('fs');
const path = require('path');
const { readJson } = require('./sync');

function detect() {
  return { ramGb: Math.max(1, Math.round(os.totalmem() / 1073741824)), cores: os.cpus().length };
}

// Memoria recomendada para Minecraft con mods y shaders según la RAM total del PC.
function recommendedRam(ramGb) {
  if (ramGb <= 4) return 2;
  if (ramGb <= 6) return 3;
  if (ramGb <= 8) return 4;
  if (ramGb <= 12) return 5;
  if (ramGb <= 16) return 6;
  return 8;
}

function autoProfile({ ramGb, cores }) {
  if (ramGb <= 6 || cores <= 4) return 'modesto';
  if (ramGb >= 16 && cores >= 8) return 'alto';
  return 'equilibrado';
}

const PROFILES = {
  modesto: {
    label: 'Modesto',
    info: 'Para PCs con poca RAM o pocos núcleos: menos distancia de render y partículas.',
    options: { renderDistance: 6, simulationDistance: 5, maxFps: 120, graphicsMode: 0, particles: 2, biomeBlendRadius: 1, mipmapLevels: 2, entityDistanceScaling: 0.6, entityShadows: false, renderClouds: '"false"', enableVsync: false }
  },
  equilibrado: {
    label: 'Equilibrado',
    info: 'Fluido en casi cualquier PC actual. Buena distancia sin sacrificar FPS.',
    options: { renderDistance: 10, simulationDistance: 8, maxFps: 200, graphicsMode: 1, particles: 1, biomeBlendRadius: 3, mipmapLevels: 3, entityDistanceScaling: 0.8, entityShadows: true, renderClouds: '"fast"', enableVsync: false }
  },
  alto: {
    label: 'Alto',
    info: 'Para PCs potentes (16 GB y 8+ núcleos): más distancia y un recolector de basura sin tirones.',
    options: { renderDistance: 16, simulationDistance: 12, maxFps: 260, graphicsMode: 1, particles: 0, biomeBlendRadius: 5, mipmapLevels: 4, entityDistanceScaling: 1.0, entityShadows: true, renderClouds: '"true"', enableVsync: false }
  }
};

// Parámetros de Java por perfil (Java 21).
function jvmArgs(profile, cdsFile) {
  const common = [
    '-XX:+UnlockExperimentalVMOptions', '-XX:+DisableExplicitGC', '-XX:+PerfDisableSharedMem',
    '-Dfile.encoding=UTF-8', '-Dsun.stdout.encoding=UTF-8',
    // Guarda las clases ya cargadas para que el siguiente inicio de Minecraft sea más rápido
    '-XX:+AutoCreateSharedArchive', `-XX:SharedArchiveFile=${cdsFile}`
  ];
  if (profile === 'alto') {
    return [...common, '-XX:+UseZGC', '-XX:+ZGenerational'];
  }
  if (profile === 'modesto') {
    return [...common, '-XX:+UseG1GC', '-XX:MaxGCPauseMillis=80', '-XX:+ParallelRefProcEnabled', '-XX:G1NewSizePercent=25', '-XX:G1MaxNewSizePercent=45', '-XX:+UseStringDeduplication'];
  }
  return [
    ...common, '-XX:+UseG1GC', '-XX:+ParallelRefProcEnabled', '-XX:MaxGCPauseMillis=50',
    '-XX:G1NewSizePercent=30', '-XX:G1MaxNewSizePercent=40', '-XX:G1HeapRegionSize=16M', '-XX:G1ReservePercent=20',
    '-XX:G1HeapWastePercent=5', '-XX:G1MixedGCCountTarget=4', '-XX:InitiatingHeapOccupancyPercent=15',
    '-XX:G1MixedGCLiveThresholdPercent=90', '-XX:G1RSetUpdatingPauseTimePercent=5', '-XX:SurvivorRatio=32', '-XX:MaxTenuringThreshold=1'
  ];
}

// Cambia o añade claves en options.txt sin tocar el resto.
function setOptions(file, values) {
  const lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l !== '') : [];
  for (const [k, v] of Object.entries(values)) {
    const i = lines.findIndex((l) => l.startsWith(k + ':'));
    if (i >= 0) lines[i] = `${k}:${v}`; else lines.push(`${k}:${v}`);
  }
  fs.writeFileSync(file, lines.join('\n') + '\n');
}

// Los ajustes del perfil se aplican solo cuando el perfil cambia (así el jugador puede retocarlos después).
function applyPerfOptions(gameDir, profile) {
  const statePath = path.join(gameDir, 'launcher-state.json');
  const state = readJson(statePath, {});
  if (state.appliedPerf === profile) return false;
  fs.mkdirSync(gameDir, { recursive: true });
  setOptions(path.join(gameDir, 'options.txt'), PROFILES[profile].options);
  state.appliedPerf = profile;
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  return true;
}

module.exports = { detect, recommendedRam, autoProfile, PROFILES, jvmArgs, setOptions, applyPerfOptions };
