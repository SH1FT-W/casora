// Issue #77: dishwasher with Home Connect from HA core and German entity names (sensor.<device>_betriebszustand,
// select.<device>_aktives_programm, switch.<device>_hygiene, number.<device>_start_in_relativ …).
// Before: only program, door, progress, finish time and stop were read for HA core; start time, Hygiene+,
// Intensivzone, the other options, power, remote start and the refill events were missing (the German name
// fallback is Home Connect Local's: „Start in“, „Halbe Ladung“). HA core has no start button either.
// Checks: fields by translation_key (and by the German names without one), how the card starts (action
// home_connect.start_selected_program with the delay, else the active_program select), the clock time → seconds
// calculation (step, min/max, tomorrow), refill events, the compact program choice and the start part; one electricity
// price for all dashboards (no tile price any more).
//   node dev/unit/dishwasher_home_connect_77.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/02-devices.js', import.meta.url), 'utf8');
const finder = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/00-finder.js', import.meta.url), 'utf8');
globalThis.window = globalThis;
globalThis.document = { querySelector: () => null, addEventListener() {}, head: { appendChild() {} }, createElement: () => ({ style: {} }) };
globalThis.addEventListener = () => {};
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null, define() {} };
const block = (start, from = src) => {
  const a = from.indexOf(start);
  const b = from.indexOf('\n})();', a);
  assert.ok(a > 0 && b > a, 'block found: ' + start);
  new Function(from.slice(a, b + 6))();
};
block('(function () {\n  if (window.casoraLaundryFind) return;', finder);
block('(function () {\n  if (window._casoraLaundry) return;');
block('(function () {\n  if (window._casoraDish || !window._casoraLaundry) return;');
const D = globalThis._casoraDish;

// The reporter's entities (HA core, German), plus the neighbours HA core creates for a dishwasher.
const P = 'dishcare_dishwasher_program_';
const E = [
  ['sensor.testgeschirr_betriebszustand', 'operation_state', 'ready', {}],
  ['select.testgeschirr_ausgewahltes_programm', 'selected_program', P + 'eco_50',
    { options: [P + 'eco_50', P + 'auto_2', P + 'intensiv_70', P + 'kurz_60', P + 'quick_45', P + 'glas_40', P + 'night_wash'] }],
  ['select.testgeschirr_aktives_programm', 'active_program', 'unknown',
    { options: [P + 'eco_50', P + 'auto_2', P + 'intensiv_70', P + 'kurz_60', P + 'quick_45', P + 'glas_40', P + 'night_wash'] }],
  ['sensor.testgeschirr_tur', 'door', 'closed', { device_class: 'enum' }],
  ['sensor.testgeschirr_programm_endzeit', 'program_finish_time', 'unknown', { device_class: 'timestamp' }],
  ['button.testgeschirr_programm_stoppen', 'stop_program', 'unknown', {}],
  ['switch.testgeschirr_hygiene', 'hygiene_plus', 'on', {}],
  ['switch.testgeschirr_intensivzone', 'intensiv_zone', 'off', {}],
  ['switch.testgeschirr_halbe_beladung', 'half_load', 'off', {}],
  ['switch.testgeschirr_vario_speed', 'vario_speed_plus', 'off', {}],
  ['switch.testgeschirr_einschalter', 'power', 'on', {}],
  ['binary_sensor.testgeschirr_fernstart', 'remote_start', 'on', {}],
  ['number.testgeschirr_start_in_relativ', 'start_in_relative', '0', { min: 0, max: 86340, step: 60, unit_of_measurement: 's' }],
  ['sensor.testgeschirr_salz_fast_leer', 'salt_nearly_empty', 'off', { device_class: 'enum' }],
  ['sensor.testgeschirr_klarspuler_fast_leer', 'rinse_aid_nearly_empty', 'present', { device_class: 'enum' }],
  ['sensor.testgeschirr_erinnerung_zur_maschinenpflege', 'machine_care_reminder', 'off', { device_class: 'enum' }],
];
const house = (withKeys) => {
  const reg = {}, states = {};
  E.forEach(([id, key, state, attrs]) => {
    reg[id] = { entity_id: id, device_id: 'dw77', platform: 'home_connect', translation_key: withKeys ? key : null };
    states[id] = { entity_id: id, state, attributes: attrs };
  });
  return { reg, states };
};
const ST = 'sensor.testgeschirr_betriebszustand';

// ── 1) Fields by translation_key ──
let { reg, states } = house(true);
const svc = { home_connect: { start_selected_program: {}, set_program_and_options: {} } };
let c = D.resolve({ entity_id: ST }, {}, states, { entities: reg, states, services: svc });
assert.equal(c.source, 'home_connect', 'source by platform');
assert.equal(c.sel, 'select.testgeschirr_ausgewahltes_programm');
assert.equal(c.program, 'select.testgeschirr_aktives_programm');
assert.equal(c.door, 'sensor.testgeschirr_tur');
assert.equal(c.startIn, 'number.testgeschirr_start_in_relativ', 'start time number found');
assert.equal(c.power_sw, 'switch.testgeschirr_einschalter');
assert.equal(c.remoteStart, 'binary_sensor.testgeschirr_fernstart');
assert.deepEqual(c.opts.map((o) => [o[0], o[1]]), [
  ['switch.testgeschirr_halbe_beladung', 'Halbe Ladung'],
  ['switch.testgeschirr_vario_speed', 'Schneller fertig'],
  ['switch.testgeschirr_hygiene', 'Hygiene+'],
  ['switch.testgeschirr_intensivzone', 'Intensivzone'],
], 'options the device has, Hygiene+ and Intensivzone among them');
assert.equal(c.device, 'dw77');
assert.equal(c.hcStart, true);
assert.ok(D.watch(c).includes('number.testgeschirr_start_in_relativ') && D.watch(c).includes('switch.testgeschirr_hygiene'), 'watched');
console.log('ok fields by key');

// ── 2) Older install without translation_key: German HA core names ──
({ reg, states } = house(false));
const c2 = D.resolve({ entity_id: ST }, {}, states, { entities: reg, states });
assert.equal(c2.startIn, 'number.testgeschirr_start_in_relativ', 'name: Start in relativ');
assert.ok(c2.opts.some((o) => o[0] === 'switch.testgeschirr_hygiene'), 'name: Hygiene +');
assert.ok(c2.opts.some((o) => o[0] === 'switch.testgeschirr_intensivzone'), 'name: Intensivzone');
assert.equal(c2.remoteStart, 'binary_sensor.testgeschirr_fernstart', 'name: Fernstart');
console.log('ok fields by German name');

// ── 3) How it starts ──
({ reg, states } = house(true));
assert.deepEqual(D.startSvc(c, states, 0), { domain: 'home_connect', service: 'start_selected_program', data: { device_id: 'dw77' }, dish: ST },
  'HA core: the action');
assert.equal(D.startSvc(c, states, 9000).data.b_s_h_common_option_start_in_relative, 9000, 'delay goes along');
const noSvc = Object.assign({}, c, { hcStart: false });
assert.deepEqual(D.startSvc(noSvc, states, 0), { domain: 'select', service: 'select_option', data: { option: P + 'eco_50' },
  target: { entity_id: 'select.testgeschirr_aktives_programm' }, dish: ST }, 'older HA: the active_program select');
const btn = Object.assign({}, c, { start: 'button.x_start' });
assert.equal(D.startSvc(btn, Object.assign({ 'button.x_start': { state: 'unknown' } }, states), 0).domain, 'button', 'start button first');
console.log('ok start');

// ── 4) Clock time → seconds ──
const info = D.numInfo(states, c.startIn);
assert.deepEqual([info.unit, info.min, info.max, info.step, info.secs], [1, 0, 86340, 60, 0]);
const at = (h, m, d = 0) => new Date(2026, 9, 26 + d, h, m, 0, 0).getTime();
let r = D.delayFor('22:30', at(20, 0), info);
assert.equal(r.secs, 9000, '20:00 → 22:30 = 9000 s');
assert.equal(r.value, 9000);
assert.equal(r.at, at(22, 30));
assert.equal(r.clamp, null);
r = D.delayFor('06:15', at(22, 0), info);
assert.equal(r.secs, 8 * 3600 + 15 * 60, 'earlier than now → tomorrow');
assert.equal(r.at, at(6, 15, 1));
r = D.delayFor('22:30', at(20, 0, 0) + 40 * 1000, info);
assert.equal(r.secs % 60, 0, 'step 60 s');
assert.equal(r.secs, 8940, 'rounded to the step');
r = D.delayFor('19:59', at(20, 0), info);
assert.deepEqual([r.secs, r.clamp], [86340, null], 'a minute ago = tomorrow, 23:59 h = max');
r = D.delayFor('19:59', at(20, 0), Object.assign({}, info, { max: 82800 }));
assert.equal(r.clamp, 'max', 'beyond max (23 h)');
assert.equal(r.secs, 82800);
assert.equal(r.at, at(19, 0, 1), 'starts at the latest possible time');
r = D.delayFor('20:00', at(20, 0), info);
assert.equal(r.at > at(20, 0), true, 'now is tomorrow');
assert.equal(D.delayFor('25:00', at(20, 0), info), null, 'invalid time');
assert.equal(D.delayFor('', at(20, 0), info), null, 'empty');
r = D.delayFor('23:00', at(20, 0), { unit: 60, min: 0, max: 1440, step: 1 });
assert.equal(r.value, 180, 'minutes number: 180 min');
assert.equal(r.secs, 10800);
r = D.delayFor('23:00', at(20, 0), { unit: 1, min: 0, max: 86400, step: 3600 });
assert.equal(r.secs, 10800, 'hour steps');
r = D.delayFor('20:10', at(20, 0), { unit: 1, min: 1800, max: 86400, step: 60 });
assert.equal(r.clamp, 'min', 'earlier than the minimum delay');
assert.equal(r.secs, 1800);
console.log('ok clock time → seconds');

// ── 5) Refills and reminders from the event sensors ──
assert.equal(D.fill(states, c.salt, c.saltLow, c.saltLack), 'ok', 'salt: no event → ok, not „full“');
assert.equal(D.fill(states, c.rinse, c.rinseLow, c.rinseLack), 'nearly_empty', 'rinse aid nearly empty');
assert.deepEqual(D.todo(c, states), [['Klarspüler nachfüllen', 'warn']]);
states['sensor.testgeschirr_erinnerung_zur_maschinenpflege'].state = 'present';
assert.ok(D.todo(c, states).some((t) => t[0] === 'Maschinenpflege fällig'), 'machine care due');
assert.equal(D.fill({}, null, null, null), null, 'nothing known');
console.log('ok refills');

// ── 6) Program choice, start part, device row ──
const seen = [];
globalThis._casoraUI = {
  esc: (t) => String(t), segments: (items) => { seen.push(['seg', items.map((i) => i.label)]); return '[seg]'; },
  group: (rows, label) => { seen.push([label, rows]); return (label ? '<h>' + label + '</h>' : '') + rows.map((x) => '<div class="hui-row"><div class="hui-sub">' + (x.sub || '') + '</div>' + (x.value || '') + '</div>').join(''); },
};
globalThis._casoraSelRows = (h) => h;
({ reg, states } = house(true));
const pick = D.progPick(c, states);
assert.match(pick, /data-casora-more-tg=""/, 'program choice opens like „Mehr“');
assert.match(pick, /class="hui-more dw-pick"/, 'closed at first');
const head = seen.find((x) => x[0] === 'Programm');
assert.equal(head[1].length, 1, 'one row for the chosen program');
assert.equal(head[1][0].label, 'Eco 50°');
assert.equal(seen.find((x) => x[0] === null)[1].length, 7, 'the list holds every program');
seen.length = 0;
const part = D.startPart(c, states);
const startRow = seen.find((x) => x[0] === 'Start');
assert.ok(startRow, 'start row with its heading „Start“ (level with „Programm“)');
assert.equal(startRow[1][0].label, 'Jetzt starten');
assert.equal(startRow[1][0].svc.service, 'start_selected_program');
assert.deepEqual(seen.find((x) => x[0] === 'seg')[1], ['Sofort', '1 Std.', '2 Std.', '3 Std.', '4 Std.', '6 Std.'], 'quick choices within max');
assert.match(part, /<input type="time"/, 'clock time input');
assert.ok(part.indexOf('Start') < part.indexOf('type="time"'), 'start row first');
// Delay set on the number: start row and note say when.
states['number.testgeschirr_start_in_relativ'].state = '7200';
seen.length = 0;
D.startPart(c, states);
const sr = seen.find((x) => x[0] === 'Start')[1][0];
assert.equal(sr.label, 'Zeitversetzt starten');
assert.equal(sr.svc.data.b_s_h_common_option_start_in_relative, 7200);
assert.match(seen.find((x) => x[0] === null && x[1][0].label === 'Uhrzeit')[1][0].sub, /^Startet (morgen )?um .+ Uhr$/);
// Remote start off on the appliance: no start.
states['binary_sensor.testgeschirr_fernstart'].state = 'off';
seen.length = 0;
D.startPart(c, states);
assert.equal(seen.find((x) => x[0] === 'Start')[1][0].svc, null, 'remote start off → no service');
assert.equal(seen.find((x) => x[0] === 'Start')[1][0].sub, 'Fernstart am Gerät nicht erlaubt');
console.log('ok program choice + start');

// ── 7) One electricity price for all dashboards (issue #77 follow-up) ──
// window.casoraPriceKwh ignores a tile's old price_kwh; the Studio has no price field per tile any more.
const pf = finder.indexOf('window.casoraPriceKwh = function');
new Function(finder.slice(pf, finder.indexOf('\n};', pf) + 3))();
globalThis.CASORA_PRICE_KWH = 0.30;
assert.equal(globalThis.casoraPriceKwh('0.36'), 0.30, 'a tile price no longer wins over the settings');
assert.equal(globalThis.casoraPriceKwh(), 0.30);
delete globalThis.CASORA_PRICE_KWH;
assert.equal(globalThis.casoraPriceKwh(0.36), null, 'without a central price: no costs, not the tile value');
['../../custom_components/casora/panel/casora-panel-types.js', '../../custom_components/casora/panel/casora-panel.js'].forEach((f) => {
  assert.doesNotMatch(fs.readFileSync(new URL(f, import.meta.url), 'utf8'), /key: "price_kwh"/, 'no Studio price field: ' + f);
});
assert.doesNotMatch(src, /casoraPriceKwh\(V+\.price_kwh\)/, 'device popups do not pass the card price');
console.log('ok one price');
