// Glocke „Nicht melden“ (1.1.2): Ausnahmeliste notify.exclude in den Casora-Einstellungen.
// Prüft: (1) die Auswahl (casoraNotifySources, 00-finden.js) enthält nur meldefähige Entitäten –
// jede echte Glocken-Zeile stammt aus ihr, eine Lampe nicht; „meldet gerade“ stimmt;
// (2) eine Ausnahme nimmt den Eintrag aus der Glocke (auch Akku über 01-basis und eine Öffnung mit
// Kombi-Sensor als Ganzes), der Zähler sinkt; (3) entfernt, kommt er wieder.
//   node dev/unit/glocke_ausnahmen.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../../custom_components/casora/scripts/', import.meta.url);
const core = fs.readFileSync(new URL('casora-core.js', root), 'utf8');
const s = core.indexOf('(function () {\n  if (window._casoraNotify) return;');
assert.ok(s > 0, 'Mitteilungs-Modul gefunden');
const mod = core.slice(s, core.indexOf('\n})();', s) + 6);
const basis = fs.readFileSync(new URL('local/01-basis.js', root), 'utf8');
const bs = basis.indexOf('(function () {\n  if (window._casoraNotifyLocal) return;');
assert.ok(bs > 0, 'Mitteilungs-Erweiterung (01-basis) gefunden');
const basisMod = basis.slice(bs, basis.indexOf('\n})();', bs) + 6);
const finden = fs.readFileSync(new URL('local/00-finden.js', root), 'utf8');

// Erfundenes Haus.
const MIN = 60000;
const iso = (ms) => new Date(Date.now() - ms).toISOString();
const st = (id, state, a, ago = 40 * MIN) => ({ entity_id: id, state, last_changed: iso(ago), last_updated: iso(ago), attributes: a });
const LAMP = 'light.stehlampe';
const WIN = 'binary_sensor.fenster_bad';
const BAT = 'sensor.thermometer_akku';
const UPD = 'update.beispiel';
const CO2 = 'sensor.buero_co2';
const LOCK = 'lock.haustuer';
const C = 'binary_sensor.terrasse_kontakt';
const K = 'binary_sensor.terrasse_kombi';
const hass = {
  states: {
    [LAMP]: st(LAMP, 'on', { friendly_name: 'Stehlampe' }),
    [WIN]: st(WIN, 'on', { friendly_name: 'Fenster Bad', device_class: 'window' }),
    [BAT]: st(BAT, '8', { friendly_name: 'Thermometer Akku', device_class: 'battery', unit_of_measurement: '%' }),
    [UPD]: st(UPD, 'on', { friendly_name: 'Beispiel Update', installed_version: '1', latest_version: '2' }),
    [CO2]: st(CO2, '2100', { friendly_name: 'Büro CO2', device_class: 'carbon_dioxide' }),
    [LOCK]: st(LOCK, 'locked', { friendly_name: 'Haustür' }),
    [C]: st(C, 'on', { friendly_name: 'Terrasse', device_class: 'door' }),
    [K]: st(K, 'on', { friendly_name: 'Terrasse', device_class: 'door', tilt: false }),
  },
  entities: { [WIN]: { area_id: 'bad' }, [C]: { device_id: 'dev_t' }, [K]: {} },
  devices: { dev_t: { name: 'Terrasse' } },
  areas: { bad: { name: 'Bad' } },
  callWS: () => Promise.resolve([]),
};

const store = {};
globalThis.window = globalThis;
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
globalThis.document = {
  readyState: 'complete', hidden: false,
  querySelector: (q) => (q === 'home-assistant' ? { hass } : null),
  querySelectorAll: () => [], addEventListener: () => {}, getElementById: () => null,
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} },
};
globalThis.addEventListener = () => {};
globalThis.dispatchEvent = () => true;
globalThis.setInterval = () => 0;
globalThis.clearInterval = () => {};
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
globalThis.CustomEvent = class { constructor(n, o) { this.type = n; this.detail = o && o.detail; } };
window.casoraSecurityIcon = () => 'door-open';
window.CASORA_SETTINGS = { notify: {} };

new Function(mod)();
new Function(finden)();
new Function(basisMod)();
window._casoraLocalLoaded = ['00-finden.js', '01-basis.js'];

const N = window._casoraNotify;
const rows = async () => (await N.refresh(), N.rows);
const ents = (list) => list.map((r) => r.entity).filter(Boolean).sort();

// (1) Auswahl
const src = window.casoraNotifySources(hass, {});
const byId = Object.fromEntries(src.map((x) => [x.entity, x]));
assert.ok(!byId[LAMP], 'Lampe kann nicht melden, steht nicht in der Auswahl');
for (const id of [WIN, BAT, UPD, CO2, LOCK, C, K]) assert.ok(byId[id], 'meldefähig: ' + id);
assert.deepEqual(byId[WIN].kinds, ['window'], 'Fenster: Art „Fenster offen“');
assert.deepEqual(byId[BAT].kinds, ['battery'], 'Akku: Art „Akku“');
assert.ok(byId[WIN].active && byId[BAT].active && byId[CO2].active && byId[UPD].active, 'meldet gerade: Fenster, Akku, CO₂, Update');
assert.ok(!byId[LOCK].active, 'verriegeltes Schloss meldet gerade nichts');

const before = await rows();
// Jede Glocken-Zeile mit Entität (und jeder Akku im Sammeleintrag) stammt aus der Auswahl.
const fromRows = new Set(ents(before));
before.forEach((r) => (r.seen || []).forEach((x) => { if (x && typeof x === 'object' && hass.states[x.k]) fromRows.add(x.k); }));
for (const id of fromRows) assert.ok(byId[id], 'Glocken-Zeile aus der Auswahl: ' + id);
assert.ok(fromRows.has(WIN) && fromRows.has(BAT) && fromRows.has(CO2) && fromRows.has(UPD), 'Ausgangslage: ' + [...fromRows]);
assert.equal(before.filter((r) => /^casora:open:/.test(r.id)).length, 2, 'Fenster + Terrasse offen');
const count0 = N.count;

// (2) Ausnahmen
window.CASORA_SETTINGS = { notify: { exclude: [WIN, BAT, K] } };
const after = await rows();
const left = ents(after);
assert.ok(!left.includes(WIN), 'Fenster nicht mehr in der Glocke');
assert.ok(!after.some((r) => r.id === 'casora:battery'), 'Akku-Eintrag weg (auch über 01-basis)');
assert.ok(!after.some((r) => /^casora:open:/.test(r.id)), 'Terrasse weg: Kombi ausgenommen nimmt die ganze Öffnung (Kontakt meldet nicht stattdessen)');
assert.ok(left.includes(CO2) && after.some((r) => r.id === 'casora:updates'), 'übrige Einträge bleiben');
assert.ok(N.count < count0 || count0 === 0, 'Zähler sinkt mit');
// Auswahl ohne Ausnahmen: die Studio-Liste filtert selbst, die Quelle bleibt vollständig.
assert.ok(window.casoraNotifySources(hass, {}).some((x) => x.entity === WIN), 'Quelle unabhängig von Ausnahmen');

// (3) Wieder entfernt
window.CASORA_SETTINGS = { notify: { exclude: [] } };
const again = await rows();
assert.deepEqual(ents(again), ents(before), 'nach dem Entfernen wie vorher');

console.log('ok – Glocke: Auswahl nur meldefähig, Ausnahmen wirken (Akku, Öffnung, Zähler), entfernt wieder da');
