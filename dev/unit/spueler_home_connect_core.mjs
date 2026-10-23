// #48: dishwasher with Home Connect from HA core. The finish time is a timestamp sensor (program_finish_time),
// the program a select (active_program / selected_program, ids with underscores), the door an enum sensor
// (open/closed/locked). Before: "33:46 h left" (parseFloat of the year), no program, no door.
// All entities invented.   node dev/unit/spueler_home_connect_core.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/02-devices.js', import.meta.url), 'utf8');
globalThis.window = globalThis;
globalThis.document = { querySelector: () => null, addEventListener() {}, head: { appendChild() {} }, createElement: () => ({ style: {} }) };
globalThis.addEventListener = () => {};
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null, define() {} };
const block = (start) => {
  const a = src.indexOf(start);
  const b = src.indexOf('\n})();', a);
  assert.ok(a > 0 && b > a, 'block found: ' + start);
  new Function(src.slice(a, b + 6))();
};
block('(function () {\n  if (window._casoraLaundry) return;');
block('(function () {\n  if (window._casoraDish || !window._casoraLaundry) return;');
const D = globalThis._casoraDish;

let hero = null, rows = null;
globalThis._casoraUI = { hero: (h) => { hero = h; return 'x'; }, group: (r) => { rows = r; return 'x'; } };

const P = 'dishcare_dishwasher_program_';
const ids = {
  st: ['sensor.spueler_test_status', 'sensor', 'operation_state'],
  fin: ['sensor.spueler_test_ende', 'sensor', 'program_finish_time'],
  prog: ['select.spueler_test_aktiv', 'select', 'active_program'],
  sel: ['select.spueler_test_wahl', 'select', 'selected_program'],
  door: ['sensor.spueler_test_tuer', 'sensor', 'door'],
  pct: ['sensor.spueler_test_fortschritt', 'sensor', 'program_progress'],
  stop: ['button.spueler_test_stopp', 'button', 'stop_program'],
};
const reg = {};
Object.values(ids).forEach(([id, , key]) => { reg[id] = { entity_id: id, device_id: 'dev1', platform: 'home_connect', translation_key: key }; });
const end = new Date(Date.now() + (9 * 60 + 46) * 60000).toISOString();
const opts = [P + 'eco_50', P + 'auto_2', P + 'night_wash'];
const states = (run, door) => ({
  [ids.st[0]]: { state: run ? 'run' : 'ready', attributes: {} },
  [ids.fin[0]]: { state: run ? end : 'unknown', attributes: { device_class: 'timestamp' } },
  [ids.prog[0]]: { state: run ? P + 'eco_50' : 'unknown', attributes: { options: opts } },
  [ids.sel[0]]: { state: P + 'night_wash', attributes: { options: opts } },
  [ids.door[0]]: { state: door, attributes: { device_class: 'enum' } },
  [ids.pct[0]]: { state: '5', attributes: { unit_of_measurement: '%' } },
  [ids.stop[0]]: { state: 'unknown', attributes: {} },
});

const s0 = states(true, 'closed');
const c = D.resolve({ entity_id: ids.st[0] }, {}, s0, { entities: reg, states: s0 });
assert.equal(c.remaining, ids.fin[0], 'finish time found');
assert.equal(c.program, ids.prog[0], 'active program found');
assert.equal(c.sel, ids.sel[0], 'selected program found');
assert.equal(c.door, ids.door[0], 'door found');
assert.equal(c.progress, ids.pct[0], 'progress found');
assert.equal(c.stop, ids.stop[0], 'stop button found');

D.inner('d_hero', c, s0);
assert.equal(hero.value, '9:46', 'remaining from the timestamp, not the year');
assert.equal(hero.unit, 'Std. übrig');
assert.match(hero.sub, /Eco 50°/, 'program name from the underscore id');
console.log('ok running');

D.inner('d_hero', c, states(false, 'open'));
assert.match(hero.sub, /Night wash/, 'unknown program: readable id');
assert.match(hero.sub, /Tür offen/, 'enum door open');
assert.doesNotMatch(hero.sub, /ca\./, 'no duration without a finish time');
D.inner('d_hero', c, states(false, 'locked'));
assert.doesNotMatch(hero.sub, /Tür offen/, 'locked is closed');
console.log('ok idle + door');
