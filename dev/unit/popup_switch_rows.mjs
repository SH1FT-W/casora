// Issue #105: rows of an on/off entity in a popup show a switch (UI.row.toggle / UI.row.entity in casora-core.js),
// not the word „An“/„Aus“. Without HA:
//  1. the shared row builders: switch markup, service, unavailable greys the switch out and switches nothing
//  2. the fridge popup's „Modi“ (the reported case) are switch rows
//  3. no popup module builds a switching row with the value „An“/„Aus“ any more (read-only rows are listed)
// Devices and names invented.   node dev/unit/popup_switch_rows.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const ROOT = new URL('../../custom_components/casora/scripts/', import.meta.url);
const core = fs.readFileSync(new URL('casora-core.js', ROOT), 'utf8');
const local = (f) => fs.readFileSync(new URL('local/' + f, ROOT), 'utf8');

// ── 1. Shared builders, cut out of casora-core.js ───────────────────────────
const a = core.indexOf('  function switchHtml(on, disabled) {');
const b = core.indexOf('  // Sub pages of a module (rule 7)');
assert.ok(a > 0 && b > a, 'switchHtml and row in casora-core.js');
const { switchHtml, row } = new Function(core.slice(a, b) + '\nreturn { switchHtml: switchHtml, row: row };')();
assert.ok(/class="hui-sw" role="switch" aria-checked="true"/.test(switchHtml(true)), 'the switch is marked for the tap handler');
assert.ok(row.entity, 'UI.row.entity exists');

let r = row.entity({ entity_id: 'switch.qa_superfrost', state: 'off' }, { icon: 'mdi:snowflake', label: 'SuperFrost' });
assert.ok(/role="switch" aria-checked="false"/.test(r.endHtml), 'off: switch off');
assert.equal(r.value, undefined, 'no word on the right');
assert.deepEqual(r.svc, { domain: 'homeassistant', service: 'turn_on', target: { entity_id: 'switch.qa_superfrost' } });
assert.equal(r.active, false);
r = row.entity({ entity_id: 'input_boolean.qa_gaeste', state: 'on' }, { label: 'Gäste' });
assert.ok(/aria-checked="true"/.test(r.endHtml) && r.active && r.svc.service === 'turn_off', 'on: switch on, tap turns off');
r = row.entity({ entity_id: 'switch.qa_weg', state: 'unavailable' }, { label: 'Weg' });
assert.ok(/aria-disabled="true"/.test(r.endHtml), 'unavailable: greyed out');
assert.equal(r.svc, undefined, 'unavailable: switches nothing');
assert.equal(r.sub, 'Nicht verfügbar');
assert.equal(row.entity(null, {}), null);
r = row.toggle({ label: 'Pumpe', on: false, offTone: 'bad', svc: { domain: 'switch', service: 'turn_on', target: { entity_id: 'switch.qa_pumpe' } }, confirm: 'Einschalten' });
assert.equal(r.iconTone, 'bad', 'offTone while off');
assert.equal(r.confirm, 'Einschalten', 'a confirmation stays');

// The tap handler flips the switch at once (pending) and swaps the next service.
assert.ok(/var flipSwitch = function \(rowEl, spec\)/.test(core), 'flipSwitch in casora-core.js');
assert.ok(/flipSwitch\(t, spec\)/.test(core) && /flipSwitch\(t\.parentNode, cs\)/.test(core), 'row tap and confirm both flip');

// ── 2. The fridge's modes ─────────────────────────────────────────────────
globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
new Function(local('00-finder.js'))();
new Function(local('30-fridge.js'))();
const K = window._casoraFridge;
const states = {}, entities = {}, devices = { f: { id: 'f', name: 'Truhe' } };
const add = (id, state, key, attrs = {}) => {
  entities[id] = { entity_id: id, platform: 'liebherr', device_id: 'f', translation_key: key };
  states[id] = { entity_id: id, state, attributes: attrs };
};
add('sensor.truhe', '-18', null, { device_class: 'temperature', unit_of_measurement: '°C' });
add('number.truhe_sollwert', '-18', 'setpoint_temperature', { min: -26, max: -16, step: 1 });
add('switch.truhe_superfrost', 'off', 'super_frost');
add('switch.truhe_nachtmodus', 'on', 'night_mode');
const hass = { states, entities, devices, areas: {} };
let groups = [];
window._casoraUI = { row, group: (rows, l) => { groups.push([l, rows]); return '<g>'; } };
const C = K.find(hass, 'sensor.truhe', {});
K.sec('modes', C, states, hass);
const modes = groups.find((g) => g[0] === 'Modi');
assert.ok(modes, 'Modi');
assert.deepEqual(modes[1].map((m) => [m.label, /aria-checked="(\w+)"/.exec(m.endHtml || '')?.[1], m.value, m.svc && m.svc.service]),
  [['SuperFrost', 'false', undefined, 'turn_on'], ['Nachtmodus', 'true', undefined, 'turn_off']], 'modes are switch rows');

// ── 3. No switching row with the word „An“/„Aus“ ──────────────────────────
// A row object literal (one `{ … }` on a few lines) with `? 'An' : 'Aus'` as value or action and a svc/page.
const READONLY = {
  // The car's light: a reading of the car, nothing to switch.
  '03-popups.js': 1,
  // „Zeitplan ›“ opens the week (a navigating row, the switch is on its page).
  '31-velair.js': 1,
};
const files = fs.readdirSync(new URL('local/', ROOT)).filter((f) => f.endsWith('.js'));
const found = {};
for (const f of files.concat(['../casora-core.js'])) {
  const s = f.startsWith('..') ? core : local(f);
  const n = (s.match(/(?:value|action):\s*[^,\n]*\?\s*'An'\s*:\s*'Aus'/g) || []).length;
  if (n) found[f] = n;
}
assert.deepEqual(found, READONLY, 'rows of on/off entities use UI.row.toggle (switch), not „An“/„Aus“ text');
console.log('popup_switch_rows: ok');
