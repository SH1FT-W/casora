// Kleiner WebSocket-Helfer fürs Test-HA (ohne Browser): Tokens holen, Befehle schicken.
//   import { ws } from './ws.mjs'; const c = await ws(); await c.cmd({ type: 'lovelace/dashboards/list' }); c.close();
//   node dev/qa/ws.mjs '{"type":"lovelace/dashboards/list"}'
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { login } from './token.mjs';

const BASE = process.env.CASORA_URL || 'http://localhost:8124';

export async function tokens() {
  if (process.env.CASORA_TOKENS) {
    const t = JSON.parse(process.env.CASORA_TOKENS);
    const r = await fetch(BASE + '/auth/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: BASE + '/' }),
    });
    if (r.ok) return { ...(await r.json()), refresh_token: t.refresh_token };
  }
  const t = await login();
  process.env.CASORA_TOKENS = JSON.stringify(t);
  return t;
}

export async function ws() {
  const { access_token } = await tokens();
  const sock = new WebSocket(BASE.replace(/^http/, 'ws') + '/api/websocket');
  let id = 0;
  const wait = new Map();
  await new Promise((res, rej) => {
    sock.onerror = rej;
    sock.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.type === 'auth_required') sock.send(JSON.stringify({ type: 'auth', access_token }));
      else if (m.type === 'auth_ok') res();
      else if (m.type === 'auth_invalid') rej(new Error('auth_invalid'));
      else if (m.type === 'result' && wait.has(m.id)) {
        const w = wait.get(m.id); wait.delete(m.id);
        m.success ? w.res(m.result) : w.rej(new Error(JSON.stringify(m.error)));
      }
    };
  });
  return {
    cmd(msg) {
      const i = ++id;
      return new Promise((res, rej) => { wait.set(i, { res, rej }); sock.send(JSON.stringify({ ...msg, id: i })); });
    },
    close() { sock.close(); },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const c = await ws();
  console.log(JSON.stringify(await c.cmd(JSON.parse(process.argv[2])), null, 1));
  c.close();
}
