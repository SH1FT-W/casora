// V6 (optimisation round 14.11.2026, owner's go): the energy popup's quick choice (Haus · Solar · Netz · Akku) showed
// tall tiles with only a symbol and a word. Expected: each tile carries its value as the sub line („620 W“, „1,8 kW“,
// the grid feeding in „↑ 520 W“, the battery „78 %“), the same numbers as the flow; and a quick choice of two tiles
// fills the row (half each) instead of two thirds with a hole (UI.quick --n).
//   node dev/unit/energy_quick_values.mjs
// @deckt: custom_components/casora/scripts/local/05-weich-mehr.js#_casoraSoftEnergy, custom_components/casora/scripts/casora-core.js#quick
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
globalThis.window = globalThis;
new Function(read('custom_components/casora/scripts/local/05-weich-mehr.js'))();
const E = window._casoraSoftEnergy;
assert.equal(typeof E.quick3, 'function');

const st = (v, u) => ({ state: String(v), attributes: { unit_of_measurement: u || 'W' } });
const states = { 'sensor.solar': st(1.8, 'kW'), 'sensor.grid': st(-520), 'sensor.bat': st(700), 'sensor.soc': st(78, '%'), 'sensor.home': st(620) };
const F = { solar: ['sensor.solar'], grid: 'sensor.grid', batTile: 'sensor.bat', soc: 'sensor.soc', home: 'sensor.home',
  has: { solar: true, battery: true, grid: true, co2: false } };
let got = null;
window._casoraUI = { quick: (items) => { got = items; return 'Q'; } };
const hass = { locale: { language: 'de' }, language: 'de' };
assert.equal(E.quick3({ fs: F }, states, hass), 'Q');
const sub = Object.fromEntries(got.map((x) => [x.text, x.sub]));
assert.equal(sub.Haus, '620 W', 'house: its power');
assert.equal(sub.Solar.replace('.', ','), '1,8 kW', 'solar: kW from 1000 W');
assert.equal(sub.Netz, '↑ 520 W', 'grid feeding in: arrow up');
assert.equal(sub.Akku, '78 %', 'battery: its level');

// Drawing from the grid: no arrow; no battery level: the battery's power.
states['sensor.grid'] = st(310);
delete states['sensor.soc'];
E.quick3({ fs: Object.assign({}, F, { soc: null }) }, states, hass);
const sub2 = Object.fromEntries(got.map((x) => [x.text, x.sub]));
assert.equal(sub2.Netz, '310 W');
assert.equal(sub2.Akku, '700 W');

// In the popup the tiles follow the sensors (a card with the flow's sensors), not a string built once.
const mehr = read('custom_components/casora/scripts/local/05-weich-mehr.js');
assert.ok(/f3\.quick = \{ card: secCard\(w3, 'return window\._casoraSoftEnergy \? window\._casoraSoftEnergy\.quick3\(/.test(mehr), 'quick is a live card');

// Two tiles fill the row: --n is at least 2, not 3.
const core = read('custom_components/casora/scripts/casora-core.js');
assert.ok(/style="--n:' \+ Math\.max\(2, list\.length\) \+ '"/.test(core), 'UI.quick: two tiles take half each');
assert.ok(!/style="--n:' \+ Math\.max\(3, list\.length\)/.test(core), 'no two-thirds row any more');
console.log('energy_quick_values: ok');
