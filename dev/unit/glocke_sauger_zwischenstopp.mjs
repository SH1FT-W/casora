// Glocke (1.0.7): Saugroboter fahren mitten in der Reinigung zur Station (Mopp waschen, absaugen,
// laden). Bisher war jedes Andocken nach „cleaning“ ein „hat fertig gereinigt“. Jetzt (vacuumRuns
// in casora-core.js, für alle Hersteller, live wie aus dem Logbuch):
//   1. Zwischenstopp laut Integration (Status washing_the_mop, Fortschritt < 100 %) → laufende
//      Zeile „Pause · wäscht Mopp“, kein „fertig“.
//   2. Eindeutiges Ende (Fortschritt 100 % aus dieser Reinigung, Reinigungsende nach dem Beginn,
//      Status completed) → sofort fertig.
//   3. Sonst fertig erst nach 10 Min. Ruhe an der Station; Wiederanfahren davor = dieselbe
//      Reinigung. Meldezeit ist das Andocken.
// Ablauf aus einem echten Fall: 0 cleaning, +10 returning, +11 docked, +14 cleaning,
// +17 returning, +18 docked (danach Moppwäsche, Fortschritt 28 %).
//   node dev/unit/glocke_sauger_zwischenstopp.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
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
const VAC = 'vacuum.robo_s8';
const STATUS = 'sensor.robo_s8_status';
const PCT = 'sensor.robo_s8_reinigungsfortschritt';
// Anderer Präfix, nur über das Gerät zuzuordnen.
const END = 'sensor.hwr_saugroboter_letztes_reinigungsende';

// Ablauf, der `ago` Minuten nach dem letzten Andocken betrachtet wird. Zeiten in ms seit Epoche.
function run(ago) {
  const now = Date.now();
  const dock2 = now - ago * MIN;
  const t0 = dock2 - 18 * MIN;
  const at = (m) => t0 + m * MIN;
  return { t0, dock1: at(11), dock2, at };
}
const ev = (id, state, ms) => ({ entity_id: id, state, when: ms / 1000 });
const iso = (ms) => new Date(ms).toISOString();
function timeline(r) {
  return [ev(VAC, 'docked', r.t0 - 120 * MIN), ev(VAC, 'cleaning', r.at(0)), ev(VAC, 'returning', r.at(10)),
    ev(VAC, 'docked', r.at(11)), ev(VAC, 'cleaning', r.at(14)), ev(VAC, 'returning', r.at(17)), ev(VAC, 'docked', r.dock2)];
}
function load(r, sensors = {}) {
  const states = { [VAC]: { entity_id: VAC, state: 'docked', last_changed: iso(r.dock2), attributes: { friendly_name: 'Robo' } } };
  const entities = { [VAC]: { entity_id: VAC, device_id: 'dev1' } };
  for (const [id, [state, changed, attrs]] of Object.entries(sensors)) {
    states[id] = { entity_id: id, state, last_changed: iso(changed), attributes: attrs || {} };
    entities[id] = { entity_id: id, device_id: 'dev1' };
  }
  hass = { states, callWS, entities, devices: {}, areas: {} };
  delete window._casoraNotify;
  new Function(mod)();
  return window._casoraNotify;
}
const clear = () => { for (const k of Object.keys(store)) delete store[k]; };
const done = (rows) => rows.filter((x) => x.label === 'Robo hat fertig gereinigt');
const pause = (rows) => rows.filter((x) => x.id === 'casora:vacuum:' + VAC);
let fails = 0;
const check = (name, fn) => Promise.resolve().then(fn).then(() => console.log('ok   ' + name),
  (e) => { fails++; console.log('FAIL ' + name + '\n     ' + e.message.split('\n')[0]); });

await check('Ohne Sensoren: 2 Min. nach dem Andocken noch kein „fertig“', async () => {
  clear();
  const r = run(2);
  logbook = timeline(r);
  const rows = await load(r).refresh();
  assert.equal(done(rows).length, 0, JSON.stringify(rows.map((x) => x.label)));
  assert.equal(pause(rows).length, 0, 'ohne Hinweis keine Pause-Zeile');
});

await check('Ohne Sensoren: nach 10 Min. Ruhe genau EIN „fertig“, zur Andockzeit', async () => {
  clear();
  const r = run(11);
  // Alte falsche Meldungen aus der Zeit vor 1.0.7 im Merker: fallen weg.
  store.casora_notify_done_v1 = JSON.stringify([
    { id: VAC + '@' + r.dock1, when: r.dock1, label: 'Robo hat fertig gereinigt', entity: VAC, done: true },
  ]);
  logbook = timeline(r);
  const rows = await load(r).refresh();
  const d = done(rows);
  assert.equal(d.length, 1, JSON.stringify(rows.map((x) => x.label + '@' + x.when)));
  assert.equal(d[0].when, r.dock2, 'Meldezeit = letztes Andocken');
  assert.ok(!JSON.parse(store.casora_notify_done_v1).some((m) => m.when === r.dock1), 'Zwischenstopp nicht gemerkt');
});

await check('Status washing_the_mop + Fortschritt 28 %: „Pause · wäscht Mopp“, kein „fertig“', async () => {
  clear();
  for (const ago of [1, 25]) {
    const r = run(ago);
    logbook = timeline(r);
    const rows = await load(r, {
      [STATUS]: ['washing_the_mop', r.dock2 + 10000],
      [PCT]: ['28', r.at(16), { unit_of_measurement: '%' }],
      [END]: [iso(r.t0 - 24 * 60 * MIN), r.t0 - 24 * 60 * MIN, { device_class: 'timestamp' }],
    }).refresh();
    assert.equal(done(rows).length, 0, ago + ' Min.: ' + JSON.stringify(rows.map((x) => x.label)));
    const p = pause(rows);
    assert.equal(p.length, 1, ago + ' Min.: Pause-Zeile');
    assert.equal(p[0].label, 'Robo reinigt');
    assert.equal(p[0].sub, 'Pause · wäscht Mopp');
    assert.equal(p[0].when, r.t0, 'Beginn der Reinigung');
  }
});

await check('Nach gemerkter Moppwäsche länger als 10 Min. weiter: weiterhin dieselbe Reinigung', async () => {
  clear();
  const r = run(45);
  logbook = timeline(r);
  await load(r, { [STATUS]: ['washing_the_mop', r.dock2], [PCT]: ['28', r.at(16)] }).refresh();
  // 20 Min. nach dem Andocken fährt er wieder los, 5 Min. später endgültig angedockt, Status jetzt
  // ohne Hinweis, Fortschritt nicht mehr frisch: 11 Min. Ruhe.
  const back = r.dock2 + 20 * MIN;
  const fin = Date.now() - 11 * MIN;
  logbook = timeline(r).concat([ev(VAC, 'cleaning', back), ev(VAC, 'returning', fin - MIN), ev(VAC, 'docked', fin)]);
  const n = load({ ...r, dock2: fin }, { [STATUS]: ['charging', fin] });
  const rows = await n.refresh();
  const d = done(rows);
  assert.equal(d.length, 1, JSON.stringify(rows.map((x) => x.label + '@' + x.when)));
  assert.equal(d[0].when, fin);
});

await check('Fortschritt springt auf 100 %: sofort fertig', async () => {
  clear();
  const r = run(1);
  logbook = timeline(r);
  const rows = await load(r, { [STATUS]: ['washing_the_mop', r.dock2], [PCT]: ['100', r.dock2 - 5000] }).refresh();
  assert.equal(done(rows).length, 1, JSON.stringify(rows.map((x) => x.label)));
  assert.equal(pause(rows).length, 0);
});

await check('Fortschritt 100 % von gestern zählt nicht', async () => {
  clear();
  const r = run(1);
  logbook = timeline(r);
  const rows = await load(r, { [PCT]: ['100', r.t0 - 20 * 60 * MIN] }).refresh();
  assert.equal(done(rows).length, 0, JSON.stringify(rows.map((x) => x.label)));
});

await check('Reinigungsende-Sensor (über das Gerät gefunden) springt: sofort fertig', async () => {
  clear();
  const r = run(1);
  logbook = timeline(r);
  const rows = await load(r, {
    [STATUS]: ['washing_the_mop', r.dock2], [PCT]: ['28', r.at(16)],
    [END]: [iso(r.dock2), r.dock2, { device_class: 'timestamp' }],
  }).refresh();
  assert.equal(done(rows).length, 1, JSON.stringify(rows.map((x) => x.label)));
  assert.equal(done(rows)[0].when, r.dock2);
});

await check('Status „completed“: sofort fertig', async () => {
  clear();
  const r = run(1);
  logbook = timeline(r);
  const rows = await load(r, { [STATUS]: ['Completed', r.dock2] }).refresh();
  assert.equal(done(rows).length, 1);
});

await check('Andere Zwischenstopps: absaugen, trocknen, laden (nur unter 100 %)', async () => {
  for (const [status, pct, want] of [['emptying_the_bin', null, 'saugt ab'], ['Drying', null, 'trocknet'],
    ['charging', '40', 'lädt'], ['returning_to_wash', null, 'wäscht Mopp']]) {
    clear();
    const r = run(1);
    logbook = timeline(r);
    const s = { [STATUS]: [status, r.dock2] };
    if (pct) s[PCT] = [pct, r.at(16)];
    const rows = await load(r, s).refresh();
    assert.equal(pause(rows)[0] && pause(rows)[0].sub, 'Pause · ' + want, status);
  }
  // charging mit 0 % (zurückgesetzt, z. B. nach einem Neustart): kein Zwischenstopp.
  clear();
  const r0 = run(11);
  logbook = timeline(r0);
  const rows0 = await load(r0, { [STATUS]: ['charging', r0.dock2], [PCT]: ['0', r0.dock2] }).refresh();
  assert.equal(pause(rows0).length, 0, '0 % ist kein halber Lauf');
  assert.equal(done(rows0).length, 1);
  // charging ohne frischen Fortschritt: kein Zwischenstopp, normale Ruhezeit.
  clear();
  const r = run(11);
  logbook = timeline(r);
  const rows = await load(r, { [STATUS]: ['charging', r.dock2] }).refresh();
  assert.equal(pause(rows).length, 0);
  assert.equal(done(rows).length, 1);
});

await check('Vacuum-Attribut status (ohne eigenen Sensor) zählt auch', async () => {
  clear();
  const r = run(1);
  logbook = timeline(r);
  const n = load(r);
  hass.states[VAC].attributes.status = 'Washing mop';
  const rows = await n.refresh();
  assert.equal(pause(rows)[0] && pause(rows)[0].sub, 'Pause · wäscht Mopp');
});

if (fails) { console.log(fails + ' Fehler'); process.exit(1); }
console.log('glocke_sauger_zwischenstopp: ok');
