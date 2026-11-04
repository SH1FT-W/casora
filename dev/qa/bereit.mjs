// Waits until the test HA is really ready (instead of a fixed pause after manifest.json):
//   1. login + WebSocket auth_ok,
//   2. get_config reports state RUNNING (start finished),
//   3. then quiet: a few seconds without "build" events (integration loaded, service registered,
//      entity registry, new entity, dashboard saved) - Casora still sets up helpers after the start and
//      refreshes dashboard templates,
//   4. Casora's WebSocket command casora/settings/get answers (missing: Casora is not set up in this
//      state - no error),
//   5. only with --recorder <s>: the test house's demo history is written and the recorder keeps up with new
//      states again (see below).
//
//   node dev/qa/bereit.mjs [--max 60] [--quiet 4] [--recorder 300]
// Exit 0 = ready, 1 = not ready in time, 3 = cannot check (no access).
import { login } from './token.mjs';

const BASE = process.env.CASORA_URL || 'http://localhost:8124';
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? Number(process.argv[i + 1]) : d; };
const MAX = arg('max', 60) * 1000;
const QUIET = arg('quiet', 4) * 1000;
const RECORDER = arg('recorder', 0) * 1000;
const MIN_AFTER_RUNNING = 1500;
const t0 = Date.now();
const secs = () => ((Date.now() - t0) / 1000).toFixed(1);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Events that show HA/Casora is still building something.
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
      closed: false,
      cmd(msg) {
        if (api.closed) return Promise.reject(new Error('WebSocket geschlossen'));
        const i = ++id; return new Promise((res, rej) => { wait.set(i, { res, rej }); sock.send(JSON.stringify({ ...msg, id: i })); });
      },
      onEvent(fn) { listeners.push(fn); },
      close() { try { sock.close(); } catch (e) { /* closed */ } },
    };
    sock.onerror = () => reject(new Error('WebSocket-Fehler'));
    // A socket closed while HA starts (restart, overload) must not leave a command hanging: Node would
    // end with "unsettled top-level await" and the HA counted as not ready. Reject them; the loop reconnects.
    sock.onclose = () => {
      api.closed = true;
      for (const w of wait.values()) w.rej(new Error('WebSocket geschlossen'));
      wait.clear();
      reject(new Error('WebSocket geschlossen'));
    };
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
let last = Date.now(), builds = 0;
// (Re)connect and subscribe; after a lost socket the quiet time starts again.
async function open() {
  c = null;
  while (!c) {
    try { c = await connect(); } catch (e) {
      if (Date.now() - t0 > MAX) { console.log('bereit: WebSocket nicht erreichbar: ' + e.message); process.exit(1); }
      await sleep(500);
    }
  }
  last = Date.now();
  c.onEvent((ev) => {
    if (BUILD.has(ev.event_type) || (ev.event_type === 'state_changed' && ev.data && !ev.data.old_state)) { last = Date.now(); builds++; }
  });
  try { await c.cmd({ type: 'subscribe_events' }); } catch (e) { /* without admin: only RUNNING + command */ }
}
await open();

let runningAt = 0;
for (;;) {
  if (Date.now() - t0 > MAX) {
    console.log(`bereit: nach ${secs()} s nicht bereit (${runningAt ? 'läuft, aber noch nicht ruhig' : 'Start nicht abgeschlossen'})`);
    c.close(); process.exit(1);
  }
  if (c.closed) { runningAt = 0; await open(); }
  if (!runningAt) {
    const cfg = await c.cmd({ type: 'get_config' }).catch(() => ({}));
    if (cfg.state === 'RUNNING') { runningAt = Date.now(); last = Math.max(last, runningAt); }
  } else if (Date.now() - runningAt >= MIN_AFTER_RUNNING && Date.now() - last >= QUIET) break;
  await sleep(300);
}

let casora = '';
while (!casora) {
  if (c.closed) await open();
  try { await c.cmd({ type: 'casora/settings/get' }); casora = 'ok'; } catch (e) {
    if (e.code === 'unknown_command') casora = 'nicht eingerichtet';
    else if (Date.now() - t0 > MAX) casora = 'Fehler ' + e.message;
    else await sleep(500);
  }
}
// 5a. With --recorder: the test house (dev/casora_mock) has written its demo history and statistics. They go in
// through the recorder after its statistics catch-up; a probe state alone can come back quickly in the gap
// before them (r320 found "Keine Daten" right after "ready"). Without the test house: skipped.
let mockHistory = '';
const RECORDER_T0 = Date.now();
if (RECORDER > 0) {
  while (!mockHistory) {
    if (c.closed) await open();
    try {
      const r = await c.cmd({ type: 'casora_mock/history' });
      if (r && r.state !== 'pending') mockHistory = `Testhaus-Verlauf ${r.state} nach ${((Date.now() - RECORDER_T0) / 1000).toFixed(0)} s`;
    } catch (e) {
      if (e.code === 'unknown_command') mockHistory = '-';
    }
    if (!mockHistory && Date.now() - RECORDER_T0 > RECORDER) mockHistory = 'WARNUNG Testhaus-Verlauf noch nicht geschrieben';
    if (!mockHistory) await sleep(1000);
  }
}
c.close();

// 5b. The recorder keeps up again (--recorder, the throwaway HAs of gate and probe). Started from a saved state
// (~/casora-haus/zustaende, days old), the recorder first compiles the 5-minute statistics it missed (keep_days of
// periods for ~2 300 test entities), then the test house adds its demo history and statistics (dev/casora_mock
// backfill_history, also through the recorder). Until both are done no new state reaches the history: 2-4 minutes
// after "ready", longer under load. A test that read a fresh history in that window found none (r303
// "Zustandswechsel kommt live an": "Änderungen 0", HA's history of the new sensor empty). So probe states go in
// until one comes back from the history within FAST (the recorder commits every few seconds); one that took longer
// only shows the queue it waited behind, the next one may wait behind the test house's import. The probe entity is
// removed again. Not caught up in time: a warning only, the HA is usable otherwise.
const FAST = 10000;
let rec = '';
if (RECORDER > 0) {
  const H = { Authorization: 'Bearer ' + tok.access_token, 'Content-Type': 'application/json' };
  const id = 'sensor.casora_qa_recorder_ready';
  const since = new Date(Date.now() - 600000).toISOString();
  const recorded = async (state) => {
    const res = await fetch(BASE + '/api/history/period/' + since + '?filter_entity_id=' + id + '&minimal_response&no_attributes',
      { headers: H }).catch(() => null);
    if (res && res.status === 404) return null;
    const rows = res && res.ok ? await res.json().catch(() => []) : [];
    return (rows[0] || []).some((x) => x.state === state);
  };
  try {
    let n = 0;
    while (!rec) {
      const state = String(++n), p0 = Date.now();
      await fetch(BASE + '/api/states/' + id, { method: 'POST', headers: H, body: JSON.stringify({ state }) });
      for (;;) {
        const got = await recorded(state);
        if (got === null) { rec = 'kein Verlauf'; break; }
        if (got && Date.now() - p0 <= FAST) { rec = `hält mit nach ${((Date.now() - RECORDER_T0) / 1000).toFixed(0)} s (${n} Probe${n > 1 ? 'n' : ''})`; break; }
        if (got) break;
        if (Date.now() - RECORDER_T0 > RECORDER) { rec = `WARNUNG holt nach ${RECORDER / 1000} s noch auf – Verlaufs-Tests können rot werden`; break; }
        await sleep(1000);
      }
    }
  } finally {
    await fetch(BASE + '/api/states/' + id, { method: 'DELETE', headers: H }).catch(() => {});
  }
}
console.log(`bereit nach ${secs()} s (läuft, ${builds} Aufbau-Ereignisse, ${QUIET / 1000} s ruhig; Casora: ${casora}`
  + (rec ? `; Recorder: ${rec}` : '') + (mockHistory && mockHistory !== '-' ? `; ${mockHistory}` : '') + ')');
process.exit(casora.startsWith('Fehler') ? 1 : 0);
