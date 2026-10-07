// Glocke (P2-01, schon in 1.0.11): eine Tür mit Kontakt + Kippsensor + Kombi-Vorlage stand manchmal
// doppelt da („Gartentür ist offen“ und „Gartentür Kippsensor ist offen“ statt einmal „Gartentür ist
// gekippt“). Ursache: Die Glocke sammelte, bevor die lokalen Module (00-finden: casoraOpenings,
// 01-basis: „gekippt“) geladen waren – HA lädt casora-local.js ohne feste Reihenfolge, sein Merker
// fehlte noch, und neu gesammelt wurde erst nach 60 s.
// Prüft: (1) mit Modulen genau ein Eintrag „gekippt“, (2) ohne Lader wartet die Glocke,
// (3) kommt „casora-local-loaded“, wird sofort neu gesammelt.
//   node dev/unit/glocke_kipp_doppelt.mjs
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

// Erfundenes Haus wie im Fehlerbild: Kontakt und Kippsensor sind zwei Geräte ohne Bereich,
// die Kombi-Vorlage hat kein Gerät und heißt wie der Kontakt. Tür ist gekippt.
const MIN = 60000;
const iso = (ms) => new Date(Date.now() - ms).toISOString();
const st = (id, state, a) => ({ entity_id: id, state, last_changed: iso(40 * MIN), attributes: a });
const C = 'binary_sensor.sensor_gartentuer_contact';
const T = 'binary_sensor.sensor_gartentuer_kippsensor_contact';
const K = 'binary_sensor.gartentuer_kombi';
const hass = {
  states: {
    [C]: st(C, 'off', { friendly_name: 'Gartentür', device_class: 'door' }),
    [T]: st(T, 'on', { friendly_name: 'Gartentür Kippsensor', device_class: 'door' }),
    [K]: st(K, 'on', { friendly_name: 'Gartentür', device_class: 'door', tilt: true }),
  },
  entities: { [C]: { device_id: 'dev_a' }, [T]: { device_id: 'dev_b' }, [K]: {} },
  devices: { dev_a: { name: 'Sensor Gartentür' }, dev_b: { name: 'Sensor Gartentür Kippsensor' } },
  areas: {},
  callWS: () => Promise.resolve([]),
};

const store = {};
const listeners = {};
const intervals = [];
globalThis.window = globalThis;
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
globalThis.document = {
  readyState: 'complete', hidden: false,
  querySelector: (q) => (q === 'home-assistant' ? { hass } : null),
  querySelectorAll: () => [], addEventListener: () => {}, getElementById: () => null,
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} },
};
globalThis.addEventListener = (n, fn) => { (listeners[n] = listeners[n] || []).push(fn); };
globalThis.dispatchEvent = () => true;
globalThis.setInterval = (fn) => { intervals.push(fn); return intervals.length; };
globalThis.clearInterval = () => {};
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
window.casoraSecurityIcon = () => 'door-open';
delete window._casoraBootErrorGuard;
delete window._casoraLocalLoaded;

new Function(mod)();
const opens = () => window._casoraNotify.rows.filter((r) => /^casora:open:/.test(r.id)).map((r) => r.label);
const settle = () => new Promise((r) => setTimeout(r, 20));

// (2) Lader noch nicht gestartet (kein Merker): erster Takt sammelt nicht.
assert.ok(intervals.length >= 1, 'Start-Takt angelegt');
intervals[0]();
await settle();
assert.equal(window._casoraNotify.rows.length, 0, 'Glocke wartet auf die lokalen Module, auch ohne Merker des Laders');

// Ohne Module wäre die Tür doppelt da (Grundregel allein) – so sah der Fehler aus.
const naked = await window._casoraNotify.refresh();
assert.deepEqual(naked.filter((r) => /^casora:open:/.test(r.id)).map((r) => r.label).sort(),
  ['Gartentür Kippsensor ist offen', 'Gartentür ist offen'], 'Ausgangslage ohne Module (Fehlerbild)');

// (3) Module kommen: Ereignis löst sofort neues Sammeln aus.
new Function(finden)();
new Function(basisMod)();
window._casoraLocalLoaded = ['00-finden.js', '01-basis.js'];
assert.ok((listeners['casora-local-loaded'] || []).length >= 1, 'Glocke hört auf „casora-local-loaded“');
listeners['casora-local-loaded'].forEach((fn) => fn());
await settle();
// (1) Ein Eintrag je Tür, Zustand zusammengefasst – ohne weiteres refresh(), nur durch das Ereignis.
assert.deepEqual(opens(), ['Gartentür ist gekippt'], 'nach dem Laden neu gesammelt, eine Zeile „gekippt“: ' + JSON.stringify(opens()));

// Ganz offen (Kontakt an, Kombi ohne tilt): eine Zeile „offen“.
hass.states[C] = st(C, 'on', { friendly_name: 'Gartentür', device_class: 'door' });
hass.states[K] = st(K, 'on', { friendly_name: 'Gartentür', device_class: 'door', tilt: false });
await window._casoraNotify.refresh();
assert.deepEqual(opens(), ['Gartentür ist offen'], 'eine Zeile „offen“: ' + JSON.stringify(opens()));

console.log('ok – Tür mit Kontakt + Kippsensor einmal in der Glocke, Neusammeln nach dem Laden der Module');
