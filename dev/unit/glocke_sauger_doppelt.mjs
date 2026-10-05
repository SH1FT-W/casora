// Glocke (1.0.8): Saugroboter-„fertig“ stand zweimal in der Glocke (05.10.2026, Roborock Qrevo).
// Echter Ablauf: eine Reinigung 10:02–11:33 mit sieben kurzen Stopps (Mopp waschen, je ~3 Min.).
// Die Integration setzt „Letztes Reinigungsende“ nach jedem Abschnitt neu – eine Abfrage während
// eines Stopps hielt ihn für fertig und merkte sich das (casora_notify_done_v1). Am Ende muss
// genau EIN „hat fertig gereinigt“ übrig bleiben, zur letzten Andockzeit.
//   node dev/unit/glocke_sauger_doppelt.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const core = fs.readFileSync(process.env.CASORA_CORE || new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const start = core.indexOf('(function () {\n  if (window._casoraNotify) return;');
assert.ok(start > 0, 'Mitteilungs-Modul gefunden');
const mod = core.slice(start, core.indexOf('\n})();', start) + 6);

const MIN = 60000;
let hass;
let logbook = [];
const store = {};
globalThis.window = globalThis;
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
globalThis.document = {
  readyState: 'complete', hidden: false,
  querySelector: (q) => (q === 'home-assistant' ? { hass } : null),
  querySelectorAll: () => [], addEventListener: () => {}, getElementById: () => null,
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  head: { appendChild() {} },
};
globalThis.addEventListener = () => {};
globalThis.dispatchEvent = () => true;
globalThis.setInterval = () => 0;
window.casoraSecurityIcon = () => 'door-open';
window.CASORA_NOTIFY_EXTENSIONS = [];

const callWS = (msg) => {
  if (msg.type !== 'logbook/get_events') return Promise.resolve(null);
  const t = Date.parse(msg.start_time) / 1000;
  return Promise.resolve(logbook.filter((e) => e.when >= t));
};
const realNow = Date.now.bind(Date);
let fakeNow = realNow();
Date.now = () => fakeNow;

const VAC = 'vacuum.robo_qrevo';
const END = 'sensor.robo_qrevo_letztes_reinigungsende';
const ev = (id, state, ms) => ({ entity_id: id, state, when: ms / 1000 });
const iso = (ms) => new Date(ms).toISOString();
// Minuten ab Beginn (10:02) aus dem echten Verlauf: [Zustand, Minute]
const STEPS = [['cleaning', 0], ['returning', 9.5], ['docked', 11.2], ['cleaning', 14.2], ['returning', 17], ['docked', 17.5],
  ['cleaning', 20.5], ['returning', 27.6], ['docked', 28.8], ['cleaning', 32.2], ['returning', 38.8], ['docked', 39.8],
  ['cleaning', 43.3], ['returning', 50.4], ['docked', 51.2], ['cleaning', 54.2], ['returning', 58.6], ['docked', 59.4],
  ['cleaning', 62.4], ['returning', 78.3], ['docked', 79.2], ['cleaning', 83.1], ['returning', 90], ['docked', 91.1]];
const NOW = realNow();
const T0 = NOW - 184 * MIN;          // Beginn; letztes Andocken ~93 Min. vor „jetzt“
const at = (m) => T0 + m * MIN;
const LAST = at(91.1);

function stateAt(t) {
  const evs = [ev(VAC, 'docked', T0 - 15 * 3600 * 1000)].concat(STEPS.map(([s, m]) => ev(VAC, s, at(m))))
    .filter((e) => e.when * 1000 <= t);
  const last = evs[evs.length - 1];
  // Reinigungsende: nach jedem Andocken neu gesetzt (Roborock)
  const docks = STEPS.filter(([s, m]) => s === 'docked' && at(m) <= t).map(([, m]) => at(m));
  const end = docks.length ? docks[docks.length - 1] : T0 - 20 * 3600 * 1000;
  return { evs, last, end };
}
function load(t) {
  fakeNow = t;
  const { evs, last, end } = stateAt(t);
  logbook = evs;
  hass = {
    states: {
      [VAC]: { entity_id: VAC, state: last.state, last_changed: iso(last.when * 1000), attributes: { friendly_name: 'Robo' } },
      [END]: { entity_id: END, state: iso(end), last_changed: iso(end), attributes: { device_class: 'timestamp' } },
    },
    callWS, entities: { [VAC]: { entity_id: VAC, device_id: 'd1' }, [END]: { entity_id: END, device_id: 'd1' } }, devices: {}, areas: {},
  };
  delete window._casoraNotify;
  new Function(mod)();
  return window._casoraNotify;
}
const done = (rows) => rows.filter((x) => x.label === 'Robo hat fertig gereinigt');
let fails = 0;
const check = (name, fn) => Promise.resolve().then(fn).then(() => console.log('ok   ' + name),
  (e) => { fails++; console.log('FAIL ' + name + '\n     ' + e.message.split('\n')[0]); });

await check('Glocke fragt die ganze Reinigung über ab: am Ende genau EIN „fertig“', async () => {
  for (let t = T0; t <= NOW; t += MIN) await load(t).refresh();
  const rows = await load(NOW).refresh();
  const d = done(rows);
  assert.equal(d.length, 1, JSON.stringify(d.map((x) => new Date(x.when).toISOString())));
  assert.equal(d[0].when, LAST, 'Meldezeit = letztes Andocken');
});

await check('Logbuch mit Lücke (Neustart mitten im Lauf) + gemerkter Zwischenstopp: trotzdem EIN „fertig“', async () => {
  for (const k of Object.keys(store)) delete store[k];
  // Eine frühere Abfrage hielt den Stopp um 11:01 für fertig und merkte ihn sich.
  const mid = at(59.4);
  store.casora_notify_done_v1 = JSON.stringify([{ id: VAC + '@' + mid, when: mid, label: 'Robo hat fertig gereinigt', entity: VAC, done: true }]);
  const n = load(NOW);
  // Logbuch erst ab dem Ende dieses Stopps (Lücke davor): kein „cleaning“ vor dem gemerkten Eintrag.
  logbook = logbook.filter((e) => e.when * 1000 > mid);
  const d = done(await n.refresh());
  assert.equal(d.length, 1, JSON.stringify(d.map((x) => new Date(x.when).toISOString())));
  assert.equal(d[0].when, LAST, 'Meldezeit = letztes Andocken');
});

Date.now = realNow;
if (fails) { console.log(fails + ' Fehler'); process.exit(1); }
console.log('glocke_sauger_doppelt: ok');
