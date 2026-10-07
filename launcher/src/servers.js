// Deja el servidor ya añadido en la lista "Multijugador" de Minecraft (servers.dat).
const fs = require('fs');
const path = require('path');
const nbt = require('prismarine-nbt');

async function ensureServerEntry(gameDir, name, ip) {
  const file = path.join(gameDir, 'servers.dat');
  let servers = [];
  if (fs.existsSync(file)) {
    try {
      const { parsed } = await nbt.parse(fs.readFileSync(file));
      servers = (nbt.simplify(parsed).servers || []).map((s) => ({ ...s }));
    } catch { servers = []; }
  }
  if (servers.some((s) => String(s.ip).toLowerCase() === ip.toLowerCase())) return false;
  servers.unshift({ name, ip });
  const root = nbt.comp({
    servers: nbt.list(nbt.comp(servers.map((s) => {
      const c = { name: nbt.string(String(s.name ?? '')), ip: nbt.string(String(s.ip ?? '')) };
      if (s.hidden !== undefined) c.hidden = nbt.byte(s.hidden ? 1 : 0);
      if (s.icon) c.icon = nbt.string(String(s.icon));
      return c;
    })))
  }, '');
  fs.mkdirSync(gameDir, { recursive: true });
  fs.writeFileSync(file, nbt.writeUncompressed(root, 'big'));
  return true;
}

module.exports = { ensureServerEntry };
