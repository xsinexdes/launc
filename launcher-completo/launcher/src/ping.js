// Consulta cuántos jugadores hay conectados (protocolo "Server List Ping").
const net = require('net');
const dns = require('dns').promises;

const vi = (n) => { const o = []; do { let b = n & 127; n >>>= 7; if (n) b |= 128; o.push(b); } while (n); return Buffer.from(o); };
const str = (s) => { const b = Buffer.from(s, 'utf8'); return Buffer.concat([vi(b.length), b]); };
const pkt = (id, data) => { const body = Buffer.concat([vi(id), data]); return Buffer.concat([vi(body.length), body]); };
function readVi(buf, off) {
  let n = 0, s = 0, i = off;
  for (;;) {
    if (i >= buf.length) return null;
    const b = buf[i++];
    n |= (b & 127) << s;
    if (!(b & 128)) break;
    s += 7;
    if (s > 35) return null;
  }
  return [n, i];
}

async function resolveTarget(ip) {
  const [host, port] = ip.split(':');
  if (port) return { host, port: Number(port), name: host };
  try {
    const r = await dns.resolveSrv(`_minecraft._tcp.${host}`);
    if (r.length) return { host: r[0].name, port: r[0].port, name: host };
  } catch { /* sin registro SRV */ }
  return { host, port: 25565, name: host };
}

async function pingServer(ip, timeout = 4000) {
  if (!ip) return { online: false };
  const t = await resolveTarget(ip).catch(() => null);
  if (!t) return { online: false };
  return new Promise((resolve) => {
    let done = false;
    let buf = Buffer.alloc(0);
    const sock = net.connect({ host: t.host, port: t.port });
    const finish = (r) => { if (done) return; done = true; sock.destroy(); resolve(r); };
    sock.setTimeout(timeout, () => finish({ online: false }));
    sock.on('error', () => finish({ online: false }));
    sock.on('connect', () => {
      const port = Buffer.alloc(2);
      port.writeUInt16BE(t.port);
      sock.write(pkt(0, Buffer.concat([vi(767), str(t.name), port, vi(1)])));
      sock.write(pkt(0, Buffer.alloc(0)));
    });
    sock.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      const len = readVi(buf, 0);
      if (!len || buf.length < len[1] + len[0]) return;
      const id = readVi(buf, len[1]);
      const sl = id && readVi(buf, id[1]);
      try {
        const json = JSON.parse(buf.slice(sl[1], sl[1] + sl[0]).toString('utf8'));
        finish({ online: true, players: json.players || { online: 0, max: 0 }, version: json.version && json.version.name });
      } catch { finish({ online: false }); }
    });
  });
}

module.exports = { pingServer };
