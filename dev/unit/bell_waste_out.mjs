// @deckt: custom_components/casora/scripts/local/01-basis.js#standing custom_components/casora/scripts/local/50-waste-out.js
// Issue #211 (maintainer): once a pickup is confirmed as put out, the bell's „Abfall heute/morgen“ row for that pickup
// goes too; undone, it is back. Other pickups keep their row, and the bell redraws when the confirmation changes.
//   node dev/unit/bell_waste_out.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const basis = read('custom_components/casora/scripts/local/01-basis.js');
const bs = basis.indexOf('(function () {\n  if (window._casoraNotifyLocal) return;');
assert.ok(bs > 0, 'notify extension (01-basis) found');
const mod = basis.slice(bs, basis.indexOf('\n})();', bs) + 6);

const store = {};
globalThis.window = globalThis;
globalThis.document = { addEventListener: () => {}, querySelector: () => null, createElement: () => ({ style: {}, setAttribute() {} }), body: { appendChild() {} } };
globalThis.addEventListener = () => {};
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } };
globalThis.setInterval = () => 0;
window.CASORA_NOTIFY_EXTENSIONS = [];
window.CASORA_NOTIFY_LOCAL = { waste_from_hour: 0, waste_until_hour: 24 };
let refreshed = 0;
window._casoraNotify = { refresh: () => { refreshed++; } };
let W = null;
window.casoraDevice = { waste: () => W };
new Function(mod)();
new Function(read('custom_components/casora/scripts/local/50-waste-out.js'))();
const O = window._casoraWasteOut;
const ext = window.CASORA_NOTIFY_EXTENSIONS[0];
const hass = { states: {}, entities: {}, devices: {}, areas: {} };
const wasteRows = () => ext.standing(hass, [], { nameOf: () => '' }).filter((r) => String(r.id).indexOf('casora:waste:') === 0)
  .map((r) => r.label + ' · ' + r.sub);

// Residual waste today, organic tomorrow: confirming today's pickup removes only its row.
W = { bins: [{ label: 'Restmüll', days: 0 }, { label: 'Bio', days: 1 }], days: 0, duty: null, next: { label: 'Restmüll' } };
assert.deepEqual(wasteRows(), ['Abfall heute · Restmüll', 'Abfall morgen · Bio']);
await O.set(hass, O.key(W), true);
assert.ok(refreshed > 0, 'the bell collects again after a change');
assert.deepEqual(wasteRows(), ['Abfall morgen · Bio'], 'confirmed: today’s row gone, tomorrow’s stays');
const before = refreshed;
await O.set(hass, O.key(W), false);
assert.ok(refreshed > before, 'undo collects again');
assert.deepEqual(wasteRows(), ['Abfall heute · Restmüll', 'Abfall morgen · Bio'], 'undone: row back');

// The evening before: the next pickup is tomorrow (two bins on one day), confirming removes the tomorrow row.
W = { bins: [{ label: 'Bio', days: 1 }, { label: 'Papier', days: 1 }, { label: 'Gelb', days: 6 }], days: 1, duty: null, next: { label: 'Bio + Papier' } };
assert.deepEqual(wasteRows(), ['Abfall morgen · Bio, Papier']);
await O.set(hass, O.key(W), true);
assert.deepEqual(wasteRows(), [], 'confirmed the evening before: tomorrow row gone');
// A later pickup has another key: its row is back by itself.
W = { bins: [{ label: 'Gelb', days: 0 }], days: 0, duty: null, next: { label: 'Gelb' } };
assert.deepEqual(wasteRows(), ['Abfall heute · Gelb'], 'next pickup: row shows again');
console.log('bell_waste_out: ok');
