// @deckt: custom_components/casora/scripts/local/00-finder.js#casoraLaundryFind, custom_components/casora/scripts/local/02-devices.js#_casoraLaundry, custom_components/casora/scripts/local/05-standard-medien.js#_casoraSolar
// Tumble (platform tumble: washer/dryer through a smart plug) as a laundry source next to WashData.
// Role from Tumble's own appliance type (device model "washer"/"dryer", else its care keys), never from names:
// the integration is called "tumble", and a Tumble washer must not become a dryer (regression test below).
// Then the tile/popup: finished and anti_crease = laundry still inside („Ausgeräumt“ presses Tumble's unload
// button), care rows from the maint_<task> sensors with „Erledigt“ pressing maint_<task>_done, the tile's due care
// from the maintenance_due binary sensor, statistics from its counters, the last cycle from its sensors.
//   node dev/unit/tumble_laundry.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/02-devices.js', import.meta.url), 'utf8');
const finder = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/00-finder.js', import.meta.url), 'utf8');
const media = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/05-standard-medien.js', import.meta.url), 'utf8');
const hass = { entities: {}, devices: {}, states: {}, areas: {} };
globalThis.window = globalThis;
globalThis.document = { querySelector: (s) => (s === 'home-assistant' ? { hass } : null), addEventListener() {},
  head: { appendChild() {} }, createElement: () => ({ style: {} }) };
globalThis.addEventListener = () => {};
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null, define() {} };
const block = (start, from) => {
  const a = from.indexOf(start);
  const b = from.indexOf('\n})();', a);
  assert.ok(a > 0 && b > a, 'block found: ' + start);
  new Function(from.slice(a, b + 6))();
};
block('(function () {\n  if (window.casoraLaundryFind) return;', finder);
block('(function () {\n  if (window._casoraLaundry) return;', src);
block('(function () {\n  if (window._casoraSolar) return;', media);
const LF = window.casoraLaundryFind;
const L = window._casoraLaundry;
const groups = (html) => [...String(html).replace(/<span class="hw-done"[^>]*>Erledigt<\/span>/g, 'ERLEDIGT')
  .matchAll(/<G>(.*?)<\/G>/g)].map((m) => JSON.parse(m[1]));
window._casoraUI = {
  group: (rows, title) => '<G>' + JSON.stringify({ title: title || null, rows }) + '</G>',
  hero: (o) => '<H>' + JSON.stringify(o) + '</H>',
  row: { toggle: (o) => o },
  esc: (t) => String(t),
};

const dev = (id, model, extra = {}) => { hass.devices[id] = { id, name: 'Tumble Trockner', model, area_id: null, config_entries: ['entry_' + id], ...extra }; };
const ent = (eid, device_id, platform, key, state, attributes = {}, category = null) => {
  hass.entities[eid] = { entity_id: eid, device_id, platform, translation_key: key, entity_category: category };
  hass.states[eid] = { entity_id: eid, state, attributes, last_changed: new Date(Date.now() - 25 * 60e3).toISOString() };
};
const tumble = (id, model, kind, status, platform = 'tumble') => {
  // Ids and names say "tumble" and "trockner" on purpose: only the model and the keys may decide.
  dev(id, model);
  const p = 'tumble_trockner_' + id;
  ent('sensor.' + p + '_status', id, platform, 'status', status, { device_class: 'enum', options: ['off', 'running', 'finished', 'anti_crease'] });
  ent('sensor.' + p + '_start', id, platform, 'cycle_start', status === 'running' ? new Date(Date.now() - 48 * 60e3).toISOString() : 'unknown', { device_class: 'timestamp' });
  ent('sensor.' + p + '_end', id, platform, 'last_end', new Date(Date.now() - 26 * 3600e3).toISOString(), { device_class: 'timestamp' });
  ent('sensor.' + p + '_dur', id, platform, 'last_duration', '118', { device_class: 'duration', unit_of_measurement: 'min' });
  ent('sensor.' + p + '_kwh', id, platform, 'last_energy', '0.84', { device_class: 'energy', unit_of_measurement: 'kWh' });
  ent('sensor.' + p + '_count', id, platform, 'cycle_count', '200', { state_class: 'total_increasing' }, 'diagnostic');
  ent('sensor.' + p + '_total', id, platform, 'total_energy', '150', { device_class: 'energy', unit_of_measurement: 'kWh', state_class: 'total_increasing' }, 'diagnostic');
  ent('binary_sensor.' + p + '_run', id, platform, 'running', status === 'running' ? 'on' : 'off', { device_class: 'running' });
  ent('button.' + p + '_unload', id, platform, 'unload', 'unknown');
  const tasks = kind === 'dryer' ? [['lint_filter', 11, 10], ['condenser_clean', 9, 30]] : [['descale', 31, 30], ['filter_clean', 12, 50], ['drum_clean', 64, 100]];
  const due = tasks.filter((t) => t[1] >= t[2]).map((t) => t[0]);
  ent('binary_sensor.' + p + '_due', id, platform, 'maintenance_due', due.length ? 'on' : 'off', { device_class: 'problem', tasks: due });
  tasks.forEach(([t, n, every]) => {
    ent('sensor.' + p + '_m_' + t, id, platform, 'maint_' + t, String(n), { every_cycles: every, every_days: 0, last_done: null, due: due.includes(t) });
    ent('button.' + p + '_m_' + t + '_done', id, platform, 'maint_' + t + '_done', 'unknown');
  });
  return 'sensor.' + p + '_status';
};

// 1. Roles: the model decides; a washer stays a washer although its name and ids say "tumble" and "trockner".
const W = tumble('w', 'washer', 'washer', 'running');
const T = tumble('t', 'dryer', 'dryer', 'finished');
const K = tumble('k', null, 'dryer', 'off');                     // no model: the care keys tell
const M = tumble('m', 'washer', 'washer', 'off', 'casora_mock'); // test house: the key combination
let c = LF.classify(hass, 'w');
assert.equal(c.source, 'tumble');
assert.equal(c.role, 'washer', 'a Tumble washer is no dryer because of the word "tumble"');
assert.equal(c.rank, 1, 'Tumble ranks like WashData, behind the maker integrations');
assert.equal(c.state, W);
assert.equal(c.f.unload, 'button.tumble_trockner_w_unload');
assert.equal(c.f.maintdue, 'binary_sensor.tumble_trockner_w_due');
assert.equal(c.f.elapsed, 'sensor.tumble_trockner_w_start');
assert.deepEqual(c.f.tcare.map((x) => x[0]), ['descale', 'filter_clean', 'drum_clean']);
assert.equal(c.f.tcare[0][2], 'button.tumble_trockner_w_m_descale_done');
assert.equal(c.f.remaining, undefined, 'no remaining time from Tumble');
assert.equal(LF.classify(hass, 't').role, 'dryer');
assert.equal(LF.classify(hass, 'k').role, 'dryer', 'without a model: lint filter/condenser keys');
assert.equal(LF.classify(hass, 'm').source, 'tumble', 'keys only (test house platform)');
assert.equal(LF.classify(hass, 'm').how, 'keys');
assert.equal(LF.classify(hass, 'm').role, 'washer');
// A model with another word around "washer" still counts only as a whole word.
hass.devices.k.model = 'tumble-dryerish';
assert.equal(LF.classify(hass, 'k').role, 'dryer', 'no whole word: the keys decide');
hass.devices.k.model = null;

// 2. States: Tumble's finished / anti_crease = laundry still inside; WashData's "finished" stays plain done.
assert.deepEqual(L.state(hass.states, T), ['Fertig', 'good', false, 'clean']);
hass.states[T].state = 'anti_crease';
assert.deepEqual(L.state(hass.states, T), ['Knitterschutz', 'good', false, 'clean']);
hass.states[T].state = 'finished';
assert.equal(L.state(hass.states, W)[3], 'run');
assert.equal(L.state(hass.states, K)[0], 'Aus');
dev('wd', null);
ent('sensor.wd_state', 'wd', 'ha_washdata', 'washer_state', 'finished', { icon: 'mdi:washing-machine' });
ent('sensor.wd_pct', 'wd', 'ha_washdata', 'cycle_progress', '100');
assert.equal(LF.classify(hass, 'wd').source, 'washdata', 'WashData unchanged');
assert.equal(L.state(hass.states, 'sensor.wd_state')[3], 'done', 'WashData finished is no "laundry inside"');
assert.equal(L.tile(hass.states[T], {}, hass.states), 'Fertig · Wäsche drin');
assert.equal(L.tileActive(hass.states[T], {}, hass.states), true);

// 3. Popup: unload row with Tumble's button, care rows, due care on the tile.
const S = hass.states;
const ct = L.resolve(S[T], {}, S, hass);
assert.equal(ct.dryer, true);
assert.equal(ct.source, 'tumble');
let g = groups(L.inner('unload', ct, S));
assert.equal(g[0].rows[0].label, 'Wäsche ist noch im Trockner');
assert.equal(g[0].rows[0].action, 'Ausgeräumt');
assert.deepEqual(g[0].rows[0].svc, { domain: 'button', service: 'press', target: { entity_id: 'button.tumble_trockner_t_unload' } });
const cw = L.resolve(S[W], {}, S, hass);
for (const e of ['sensor.tumble_trockner_w_m_descale', 'sensor.tumble_trockner_w_dur']) assert.ok(L.watch(cw).includes(e), 'watch ' + e);
let rows = L.careRows(cw, S, {});
assert.deepEqual(rows.map((r) => [r.id, r.label, r.due]), [['descale', 'Entkalken', true], ['drum_clean', 'Trommelreinigung', false], ['filter_clean', 'Filter reinigen', false]]);
assert.equal(rows[0].sub, 'Fällig · 31 Durchgänge seit dem letzten Mal');
assert.equal(rows[0].tb, 'button.tumble_trockner_w_m_descale_done');
const html = L.inner('care', cw, S);
assert.ok(/data-hw-press="button\.tumble_trockner_w_m_descale_done\|sensor\.tumble_trockner_w_status"[^>]*>Erledigt</.test(html), '„Erledigt“ presses Tumble\'s button');
g = groups(html);
assert.deepEqual(g[0].rows.map((r) => r.label), ['Entkalken', 'Weitere Pflege']);
assert.equal(g[0].rows[1].sub, 'Trommelreinigung · In 36 Durchgängen fällig');
rows = L.careRows(ct, S, {});
assert.deepEqual(rows.map((r) => [r.label, r.due]), [['Flusensieb reinigen', true], ['Kondensator reinigen', false]]);
assert.deepEqual(L.due(S[W], {}, S), ['Entkalken'], 'tile: due care from the maintenance_due sensor');
assert.equal(L.tile(S[K], {}, S), 'Aus · Flusensieb reinigen fällig', 'dryer at rest: its due care');
// Tapping „Erledigt“ twice presses the button.
const pressed = [];
hass.callService = (d, s, data) => { pressed.push([d, s, data.entity_id]); return Promise.resolve(); };
const span = { dataset: { hwPress: 'button.tumble_trockner_w_m_descale_done|' + W }, classList: { _a: false, contains() { return this._a; }, add() { this._a = true; }, remove() { this._a = false; } } };
const ev = { composedPath: () => [span], stopPropagation() {}, preventDefault() {}, cancelable: true };
L.tap(ev, 'c'); L.tap(ev, 'c');
assert.deepEqual(pressed, [['button', 'press', 'button.tumble_trockner_w_m_descale_done']]);

// 4. Statistics and the last cycle from Tumble's sensors (no average duration, nothing invented).
L.data[ct.st] = { ready: true, tCycles: 4, tKwh: 6 };
g = groups(L.inner('stats3', ct, S));
assert.deepEqual(g[0].rows.map((r) => [r.label, r.value]), [['Durchgänge insgesamt', '200'], ['Dieser Monat', '4 Durchgänge'],
  ['Ø pro Durchgang', '0,75 kWh'], ['Verbrauch insgesamt', '150,0 kWh']]);
g = groups(L.inner('last', ct, S));
assert.equal(g[0].title, 'Letzter Durchgang');
assert.deepEqual(g[0].rows.map((r) => [r.label, r.value]), [['Fertig', '1 Std. 58 Min.'], ['Verbrauch', '0,84 kWh']]);
assert.equal(L.inner('last', cw, S), '', 'while running no last cycle');
g = groups(L.inner('run', cw, S));
assert.ok(g[0].rows.some((r) => r.label === 'Läuft seit' && r.value === '48 Min.'), 'running since from cycle_start');
assert.ok(!g[0].rows.some((r) => r.label === 'Restzeit' || r.label === 'Fortschritt'), 'no remaining time or progress');

// 5. Solar tip: a Tumble washer whose ids say "tumble" and "trockner" counts as a washer, not as a dryer.
for (const id of ['t', 'k', 'm', 'wd']) delete hass.devices[id];
const solar = window._casoraSolar.tip({ state: 'on', attributes: { frei_w: 2500 } }, S);
assert.ok(/waschen/.test(solar) === false, 'washer runs: no „waschen“ tip: ' + solar);
assert.ok(/trocknen/.test(solar), 'dryer is free: „trocknen“ tip: ' + solar);

console.log('tumble_laundry: ok');
