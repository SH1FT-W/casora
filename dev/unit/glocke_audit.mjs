// Glocke (1.0.5): Einträge verschwanden, sprangen oder standen doppelt.
//   • „Saugroboter hat fertig gereinigt“ war beim erneuten Öffnen weg (Vorzustand fehlte am
//     Fensteranfang, Logbuch-Meldung ohne Zustand, kurzer Ausfall vor dem Andocken).
//   • Ein fertiger Vorgang bleibt stehen, bis das Zeitfenster abläuft.
//   • „Terrassentür ist offen“ stand zweimal da (Vorlage ohne Bereich + Kontakt mit Bereich).
//   • Laufende Geräte sprangen nach dem Lesen wieder unter „Neu“ (when = jetzt).
// Ohne Browser: das Mitteilungs-Modul aus casora-core.js und die Saugroboter-Erweiterung aus
// scripts/local/02-geraete.js laden.
//   node dev/unit/glocke_audit.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../../custom_components/casora/scripts/', import.meta.url);
const core = fs.readFileSync(new URL('casora-core.js', root), 'utf8');
const start = core.indexOf('(function () {\n  if (window._casoraNotify) return;');
assert.ok(start > 0, 'Mitteilungs-Modul gefunden');
const mod = core.slice(start, core.indexOf('\n})();', start) + 6);

const geraete = fs.readFileSync(new URL('local/02-geraete.js', root), 'utf8');
const vs = geraete.indexOf('(function () {\n  if (window._casoraNotifyVac) return;');
assert.ok(vs > 0, 'Saugroboter-Erweiterung gefunden');
const vacMod = geraete.slice(vs, geraete.indexOf('\n})();', vs) + 6);

const MIN = 60000;
const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();
const sec = (msAgo) => (Date.now() - msAgo) / 1000;

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

// Logbuch wie HA: nur Einträge ab start_time.
const callWS = (msg) => {
  if (msg.type !== 'logbook/get_events') return Promise.resolve(null);
  const t = Date.parse(msg.start_time) / 1000;
  return Promise.resolve(logbook.filter((e) => e.when >= t));
};

function fresh(states, extra = {}) {
  hass = { states, callWS, entities: {}, devices: {}, areas: {}, ...extra };
  delete window._casoraNotify;
  new Function(mod)();
  return window._casoraNotify;
}
const st = (id, state, attrs = {}, msAgo = 60 * MIN) => ({ entity_id: id, state, last_changed: iso(msAgo), attributes: attrs });
const ev = (id, state, msAgo) => ({ entity_id: id, state, when: sec(msAgo) });
const labels = (rows) => rows.map((r) => r.label);
let fails = 0;
const check = (name, fn) => fn().then(() => console.log('ok   ' + name), (e) => { fails++; console.log('FAIL ' + name + '\n     ' + e.message.split('\n')[0]); });

const VAC = 'vacuum.robot';
const vacStates = () => ({ [VAC]: st(VAC, 'docked', { friendly_name: 'Robot' }) });

await check('Logbuch-Meldung ohne Zustand bricht „fertig“ nicht ab', async () => {
  logbook = [ev(VAC, 'cleaning', 90 * MIN), ev(VAC, 'returning', 30 * MIN),
    { entity_id: VAC, when: sec(25 * MIN), message: 'triggered by automation' }, ev(VAC, 'docked', 20 * MIN)];
  const rows = await fresh(vacStates()).refresh();
  assert.ok(labels(rows).includes('Robot hat fertig gereinigt'), JSON.stringify(labels(rows)));
});

await check('Kurzer Ausfall vor dem Andocken: trotzdem „fertig“', async () => {
  logbook = [ev(VAC, 'cleaning', 90 * MIN), ev(VAC, 'returning', 30 * MIN), ev(VAC, 'unavailable', 25 * MIN), ev(VAC, 'docked', 20 * MIN)];
  const rows = await fresh(vacStates()).refresh();
  assert.ok(labels(rows).includes('Robot hat fertig gereinigt'), JSON.stringify(labels(rows)));
});

await check('Neustart (gleicher Zustand nach unavailable) bleibt still', async () => {
  const L = 'lock.front';
  logbook = [ev(L, 'locked', 120 * MIN), ev(L, 'unavailable', 30 * MIN), ev(L, 'locked', 29 * MIN)];
  const rows = await fresh({ [L]: st(L, 'locked', { friendly_name: 'Front' }) }).refresh();
  assert.deepEqual(labels(rows), ['Front verriegelt'], 'nur der echte Wechsel vor 2 Std.');
});

await check('Vorzustand vor dem Fenster zählt, Einträge vor dem Fenster nicht', async () => {
  logbook = [ev(VAC, 'cleaning', 25 * 60 * MIN), ev(VAC, 'docked', 23 * 60 * MIN)];
  const n = fresh(vacStates());
  const rows = await n.refresh();
  assert.ok(labels(rows).includes('Robot hat fertig gereinigt'), JSON.stringify(labels(rows)));
  const L = 'lock.front';
  logbook = [ev(L, 'unlocked', 30 * 60 * MIN), ev(L, 'locked', 26 * 60 * MIN)];
  const rows2 = await fresh({ [L]: st(L, 'locked', { friendly_name: 'Front' }) }).refresh();
  assert.deepEqual(labels(rows2), [], 'nichts älter als 24 Std.');
});

await check('„fertig“ bleibt stehen, wenn der Neuaufbau ihn nicht mehr herleitet', async () => {
  for (const k of Object.keys(store)) delete store[k];
  logbook = [ev(VAC, 'cleaning', 90 * MIN), ev(VAC, 'returning', 30 * MIN), ev(VAC, 'docked', 20 * MIN)];
  const n = fresh(vacStates());
  assert.ok(labels(await n.refresh()).includes('Robot hat fertig gereinigt'));
  // Danach fehlt der Vorzustand (z. B. Fenster weitergerückt, Erweiterung anders geladen):
  logbook = [ev(VAC, 'docked', 20 * MIN), ev(VAC, 'idle', 5 * MIN)];
  const again = await n.refresh();
  assert.ok(labels(again).includes('Robot hat fertig gereinigt'), JSON.stringify(labels(again)));
  // Neu laden: der Merker überlebt.
  const reload = await fresh(vacStates()).refresh();
  assert.ok(labels(reload).includes('Robot hat fertig gereinigt'), 'nach Neuladen: ' + JSON.stringify(labels(reload)));
});

await check('Saugroboter-Ende-Sensor: erster Wechsel im Fenster zählt', async () => {
  for (const k of Object.keys(store)) delete store[k];
  const END = 'sensor.robot_letztes_reinigungsende';
  const states = { ...vacStates(), [END]: st(END, iso(20 * MIN), { device_class: 'timestamp', friendly_name: 'Robot Letztes Reinigungsende' }) };
  delete window._casoraNotifyVac;
  window.CASORA_NOTIFY_EXTENSIONS = [];
  hass = { states };
  new Function(vacMod)();
  logbook = [ev(VAC, 'cleaning', 90 * MIN), ev(VAC, 'returning', 25 * MIN), ev(VAC, 'docked', 20 * MIN), ev(END, iso(20 * MIN), 20 * MIN)];
  const rows = await fresh(states).refresh();
  assert.deepEqual(labels(rows), ['Saugroboter hat fertig gereinigt'], JSON.stringify(labels(rows)));
  // Alter Wert nach Neustart (Ende liegt Stunden vor dem Eintrag): nichts.
  logbook = [ev(END, iso(10 * 60 * MIN), 30 * MIN)];
  for (const k of Object.keys(store)) delete store[k];
  const rows2 = await fresh(states).refresh();
  assert.deepEqual(labels(rows2), [], JSON.stringify(labels(rows2)));
  window.CASORA_NOTIFY_EXTENSIONS = [];
});

await check('Laufendes Gerät springt nach dem Lesen nicht wieder unter „Neu“', async () => {
  const W = 'sensor.washer', R = 'sensor.washer_remaining';
  window.CASORA_NOTIFY_APPLIANCES = [{ entity: W, remaining: R, name: 'Washer' }];
  logbook = [];
  const n = fresh({ [W]: st(W, 'running', {}, 40 * MIN), [R]: st(R, '30', { unit_of_measurement: 'min' }) });
  const rows = await n.refresh();
  const row = rows.find((r) => r.entity === W);
  assert.ok(row, 'Zeile da');
  assert.ok(row.when <= Date.now() - 39 * MIN, 'when = Start des Laufs, nicht jetzt');
  delete window.CASORA_NOTIFY_APPLIANCES;
});

await check('Gleiche Zeit: feste Reihenfolge', async () => {
  const A = 'lock.a', B = 'lock.b';
  logbook = [ev(B, 'unlocked', 10 * MIN), ev(A, 'unlocked', 10 * MIN)];
  const rows = await fresh({ [A]: st(A, 'unlocked', { friendly_name: 'A' }), [B]: st(B, 'unlocked', { friendly_name: 'B' }) }).refresh();
  logbook = [ev(A, 'unlocked', 10 * MIN), ev(B, 'unlocked', 10 * MIN)];
  const rows2 = await fresh(hass.states).refresh();
  assert.deepEqual(labels(rows), labels(rows2));
});

// ── Türen/Fenster ────────────────────────────────────────────────────────────
const door = (id, name, msAgo, attrs = {}) => st(id, 'on', { friendly_name: name, device_class: 'door', ...attrs }, msAgo);
const opens = (rows) => rows.filter((r) => /ist (offen|gekippt)$/.test(r.label)).map((r) => r.label).sort();

await check('Vorlage ohne Bereich + Kontakt mit Bereich: eine Meldung', async () => {
  logbook = [];
  const states = { 'binary_sensor.patio_combo': door('binary_sensor.patio_combo', 'Terrassentür', 31 * MIN, { tilt: false }),
    'binary_sensor.patio_contact': door('binary_sensor.patio_contact', 'Terrassentür', 31 * MIN) };
  window._casoraRoomOf = (id) => (id === 'binary_sensor.patio_combo' ? 'Terrasse' : null);
  const rows = await fresh(states, { entities: { 'binary_sensor.patio_contact': { device_id: 'dv' } },
    devices: { dv: { area_id: 'terrasse', name: 'Kontakt Terrasse' } }, areas: { terrasse: { name: 'Terrasse' } } }).refresh();
  assert.deepEqual(opens(rows), ['Terrassentür ist offen']);
  delete window._casoraRoomOf;
});

await check('Bereichs-ID gegen Dashboard-Raum: keine Doppelten', async () => {
  const states = { 'binary_sensor.patio_combo': door('binary_sensor.patio_combo', 'Terrassentür', 31 * MIN),
    'binary_sensor.patio_contact': door('binary_sensor.patio_contact', 'Terrassentür', 31 * MIN) };
  window._casoraRoomOf = () => 'Wohnzimmer';
  const rows = await fresh(states, { entities: { 'binary_sensor.patio_contact': { device_id: 'dv' } },
    devices: { dv: { area_id: 'living' } }, areas: { living: { name: 'Wohnzimmer' } } }).refresh();
  assert.equal(opens(rows).length, 1, JSON.stringify(opens(rows)));
  delete window._casoraRoomOf;
});

await check('Kontakt + Kippsensor + Kombi (casoraOpenings): nur der Hauptsensor', async () => {
  const states = { 'binary_sensor.patio_combo': door('binary_sensor.patio_combo', 'Terrassentür', 31 * MIN, { tilt: false }),
    'binary_sensor.patio_tilt': st('binary_sensor.patio_tilt', 'on', { friendly_name: 'Terrassentür Kippsensor', device_class: 'window' }, 35 * MIN) };
  window.casoraOpenings = (h, ids) => [{ main: 'binary_sensor.patio_combo', ids: ['binary_sensor.patio_combo', 'binary_sensor.patio_tilt'] }];
  const rows = await fresh(states).refresh();
  assert.deepEqual(opens(rows), ['Terrassentür ist offen']);
  delete window.casoraOpenings;
});

await check('Gleicher Name, gleicher Raum, verschiedene Öffnungen: unterscheidbar', async () => {
  const states = { 'binary_sensor.w1': st('binary_sensor.w1', 'on', { friendly_name: 'Fenster', device_class: 'window' }, 40 * MIN),
    'binary_sensor.w2': st('binary_sensor.w2', 'on', { friendly_name: 'Fenster', device_class: 'window' }, 90 * MIN),
    'binary_sensor.w3': st('binary_sensor.w3', 'on', { friendly_name: 'Fenster', device_class: 'window' }, 200 * MIN) };
  const rows = await fresh(states, { entities: { 'binary_sensor.w1': { device_id: 'a' }, 'binary_sensor.w2': { device_id: 'b' }, 'binary_sensor.w3': { area_id: 'k' } },
    devices: { a: { area_id: 'k', name: 'Fenster links' }, b: { area_id: 'k', name: 'Fenster rechts' } }, areas: { k: { name: 'Küche' } } }).refresh();
  const o = opens(rows);
  assert.equal(o.length, 3, JSON.stringify(o));
  assert.equal(new Set(o).size, 3, 'keine gleichen Zeilen: ' + JSON.stringify(o));
  assert.ok(o.every((l) => l.startsWith('Küche Fenster')), JSON.stringify(o));
});

await check('Verschiedene Räume: Raum davor (wie bisher)', async () => {
  const states = { 'binary_sensor.d1': door('binary_sensor.d1', 'Tür', 40 * MIN), 'binary_sensor.d2': door('binary_sensor.d2', 'Tür', 40 * MIN) };
  const rows = await fresh(states, { entities: { 'binary_sensor.d1': { area_id: 'x' }, 'binary_sensor.d2': { area_id: 'y' } },
    areas: { x: { name: 'Bad' }, y: { name: 'Flur' } } }).refresh();
  assert.deepEqual(opens(rows), ['Bad Tür ist offen', 'Flur Tür ist offen']);
});

if (fails) { console.log(fails + ' Fehler'); process.exit(1); }
console.log('glocke_audit: ok');
