// Wartet, bis das Docker-Test-HA wirklich bereit ist (statt fester Pause nach manifest.json):
//   1. Anmeldung + WebSocket auth_ok,
//   2. get_config meldet state RUNNING (Start abgeschlossen),
//   3. danach Ruhe: einige Sekunden keine „Aufbau“-Ereignisse mehr (Integration geladen,
//      Dienst angemeldet, Entitäts-Registry, neue Entität, Dashboard gespeichert) – Casora
//      richtet nach dem Start noch Helfer ein und frischt Dashboard-Vorlagen auf,
//   4. Casoras WebSocket-Befehl casora/settings/get antwortet (fehlt er, ist Casora in diesem
//      Zustand nicht eingerichtet – das ist kein Fehler).
//
//   node dev/qa/bereit.mjs [--max 60] [--quiet 4]
// Rückgabe 0 = bereit, 1 = nicht bereit in der Zeit, 3 = kann nicht prüfen (kein Zugang).
import { login } from './token.mjs';

const BASE = process.env.CASORA_URL || 'http://localhost:8124';
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? Number(process.argv[i + 1]) : d; };
const MAX = arg('max', 60) * 1000;
const QUIET = arg('quiet', 4) * 1000;
const MIN_AFTER_RUNNING = 1500;
const t0 = Date.now();
const secs = () => ((Date.now() - t0) / 1000).toFixed(1);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Ereignisse, die zeigen, dass HA/Casora noch etwas aufbaut.
const BUILD = new Set(['component_loaded', 'service_registered', 'entity_registry_updated', 'device_registry_updated',
  'lovelace_updated', 'lovelace_dashboards_updated', 'panels_updated', 'core_config_updated']);

let tok = null;
while (!tok) {
  try { tok = await login(); } catch (e) {
    if (/kein Zugang/.test(String(e.message))) { console.log('bereit: ' + e.message); process.exit(3); }
    if (Date.now() - t0 > MAX) { console.log('bereit: Anmeldung klappt nicht: ' + e.message); process.exit(1); }
    await sleep(500);
  }
}

function connect() {
  return new Promise((resolve, reject) => {
    const sock = new WebSocket(BASE.replace(/^http/, 'ws') + '/api/websocket');
    let id = 0; const wait = new Map(); const listeners = [];
    const api = {
      cmd(msg) { const i = ++id; return new Promise((res, rej) => { wait.set(i, { res, rej }); sock.send(JSON.stringify({ ...msg, id: i })); }); },
      onEvent(fn) { listeners.push(fn); },
      close() { try { sock.close(); } catch (e) { /* zu */ } },
    };
    sock.onerror = () => reject(new Error('WebSocket-Fehler'));
    sock.onclose = () => reject(new Error('WebSocket geschlossen'));
    sock.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.type === 'auth_required') sock.send(JSON.stringify({ type: 'auth', access_token: tok.access_token }));
      else if (m.type === 'auth_ok') resolve(api);
      else if (m.type === 'auth_invalid') reject(new Error('auth_invalid'));
      else if (m.type === 'result' && wait.has(m.id)) {
        const w = wait.get(m.id); wait.delete(m.id);
        m.success ? w.res(m.result) : w.rej(Object.assign(new Error(JSON.stringify(m.error)), { code: m.error && m.error.code }));
      } else if (m.type === 'event') listeners.forEach((f) => f(m.event));
    };
  });
}

let c = null;
while (!c) {
  try { c = await connect(); } catch (e) {
    if (Date.now() - t0 > MAX) { console.log('bereit: WebSocket nicht erreichbar: ' + e.message); process.exit(1); }
    await sleep(500);
  }
}

let last = Date.now(), builds = 0;
c.onEvent((ev) => {
  if (BUILD.has(ev.event_type) || (ev.event_type === 'state_changed' && ev.data && !ev.data.old_state)) { last = Date.now(); builds++; }
});
try { await c.cmd({ type: 'subscribe_events' }); } catch (e) { /* ohne Admin: nur RUNNING + Befehl */ }

let runningAt = 0;
for (;;) {
  if (Date.now() - t0 > MAX) {
    console.log(`bereit: nach ${secs()} s nicht bereit (${runningAt ? 'läuft, aber noch nicht ruhig' : 'Start nicht abgeschlossen'})`);
    c.close(); process.exit(1);
  }
  if (!runningAt) {
    const cfg = await c.cmd({ type: 'get_config' }).catch(() => ({}));
    if (cfg.state === 'RUNNING') { runningAt = Date.now(); last = Math.max(last, runningAt); }
  } else if (Date.now() - runningAt >= MIN_AFTER_RUNNING && Date.now() - last >= QUIET) break;
  await sleep(300);
}

let casora = '';
while (!casora) {
  try { await c.cmd({ type: 'casora/settings/get' }); casora = 'ok'; } catch (e) {
    if (e.code === 'unknown_command') casora = 'nicht eingerichtet';
    else if (Date.now() - t0 > MAX) casora = 'Fehler ' + e.message;
    else await sleep(500);
  }
}
c.close();
console.log(`bereit nach ${secs()} s (läuft, ${builds} Aufbau-Ereignisse, ${QUIET / 1000} s ruhig; Casora: ${casora})`);
process.exit(casora.startsWith('Fehler') ? 1 : 0);
