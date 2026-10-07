// Prepara Fabric Loader para la versión de Minecraft indicada.
const fs = require('fs');
const path = require('path');

const META = 'https://meta.fabricmc.net/v2/versions/loader';

async function ensureFabric(gameDir, mc, wantedLoader) {
  const versions = path.join(gameDir, 'versions');
  try {
    let loader = wantedLoader;
    if (!loader) {
      const r = await fetch(`${META}/${mc}`, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const list = await r.json();
      const pick = list.find((x) => x.loader && x.loader.stable) || list[0];
      if (!pick) throw new Error(`Fabric no soporta ${mc}`);
      loader = pick.loader.version;
    }
    const id = `fabric-loader-${loader}-${mc}`;
    const jsonFile = path.join(versions, id, `${id}.json`);
    if (!fs.existsSync(jsonFile)) {
      const r = await fetch(`${META}/${mc}/${loader}/profile/json`, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = await r.json();
      fs.mkdirSync(path.dirname(jsonFile), { recursive: true });
      fs.writeFileSync(jsonFile, JSON.stringify(json, null, 2));
    }
    return id;
  } catch (e) {
    // Sin internet: usar el Fabric que ya esté instalado
    const found = fs.existsSync(versions)
      ? fs.readdirSync(versions).filter((n) => n.startsWith('fabric-loader-') && n.endsWith(`-${mc}`)).sort().pop()
      : null;
    if (found) return found;
    throw new Error(`No se pudo preparar Fabric: ${e.message}`);
  }
}

module.exports = { ensureFabric };
