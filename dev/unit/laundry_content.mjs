// @deckt: custom_components/casora/scripts/local/00-finder.js#casoraLaundryFind, custom_components/casora/scripts/local/02-devices.js#_casoraLaundry
// Washer/dryer popup content (owner 04.11.2026: „Die Popups sind langweilig, da fehlt Inhalt! Wann Wartung etc.“).
// Roles by translation_key, never by names:
//   WashData   maintenance_due (binary, due_tasks), profile_cycle_count (per programme: count, Ø length, Ø kWh),
//              suggestions (has_actionable_suggestions), program_select, mark_unloaded, cycle_progress (projection)
//   Home Connect poor_i_dos_1/2_fill_level (event: present = nearly empty)
//   Miele      twin_dos_1/2_level (percent)
// and what the popup builds from them: care rows (due first, „Erledigt“ for WashData tasks, the rest behind one
// summary row with a sub page), programmes from the profile sensors, statistics, the detection rows (next programme,
// teach programmes, recommended settings) and the running cycle's power and projected energy.
//   node dev/unit/laundry_content.mjs
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
const LF = window.casoraLaundryFind;
const L = window._casoraLaundry;

// UI stub: groups as JSON, so the rows can be read back.
const groups = (html) => [...String(html).replace(/<span class="hw-done"[^>]*>Erledigt<\/span>/g, 'ERLEDIGT')
  .matchAll(/<G>(.*?)<\/G>/g)].map((m) => JSON.parse(m[1]));
window._casoraUI = {
  group: (rows, title) => '<G>' + JSON.stringify({ title: title || null, rows }) + '</G>',
  row: { toggle: (o) => o },
  esc: (t) => String(t),
};

const hass = { entities: {}, devices: {}, states: {}, areas: {} };
const dev = (id) => { hass.devices[id] = { id, name: 'x', area_id: null, config_entries: ['entry_' + id] }; };
const ent = (eid, device_id, platform, key, state, attributes = {}, category = null) => {
  hass.entities[eid] = { entity_id: eid, device_id, platform, translation_key: key, entity_category: category };
  hass.states[eid] = { entity_id: eid, state, attributes, last_changed: new Date(Date.now() - 3 * 86400e3).toISOString() };
};

// WashData washer (names misleading on purpose: only the keys count).
dev('wd');
ent('sensor.w1', 'wd', 'ha_washdata', 'washer_state', 'off', { icon: 'mdi:washing-machine', current_program_guess: 'off' });
ent('sensor.w2', 'wd', 'ha_washdata', 'cycle_progress', '0', { unit_of_measurement: '%' });
ent('sensor.w3', 'wd', 'ha_washdata', 'washer_program', 'off', { options: ['Kurz', 'Baumwolle 40', 'Baumwolle 40 Plus', 'none', 'unknown'] });
ent('select.w4', 'wd', 'ha_washdata', 'program_select', 'auto_detect', { options: ['auto_detect', 'Kurz', 'Baumwolle 40', 'Baumwolle 40 Plus'] });
ent('button.w5', 'wd', 'ha_washdata', 'mark_unloaded', 'unavailable');
ent('sensor.w6', 'wd', 'ha_washdata', 'cycle_count', '63', { unit_of_measurement: 'cycles', stored_cycles: 50 });
ent('sensor.w7', 'wd', 'ha_washdata', 'energy_total', '41.5', { unit_of_measurement: 'kWh', device_class: 'energy' });
ent('sensor.w8', 'wd', 'ha_washdata', 'suggestions', '2', { has_actionable_suggestions: true, suggestions_count: 2 }, 'diagnostic');
ent('binary_sensor.w9', 'wd', 'ha_washdata', 'maintenance_due', 'on', { due_task_ids: ['filter_clean', 'custom_ab12'], due_tasks: [
  { id: 'filter_clean', name: 'Clean filter', cycles_since: 23, cycles_interval: 20, days_since: 61, days_interval: 0 },
  { id: 'custom_ab12', name: 'Türdichtung abwischen', cycles_since: 9, cycles_interval: 0, days_since: 41, days_interval: 30 }] });
ent('sensor.wp1', 'wd', 'ha_washdata', 'profile_cycle_count', '3', { friendly_name: 'Wasch Profil Baumwolle 40 Anzahl', average_length_min: 118, average_consumption_kwh: 0.91 }, 'diagnostic');
ent('sensor.wp2', 'wd', 'ha_washdata', 'profile_cycle_count', '12', { friendly_name: 'Wasch Profil Baumwolle 40 Plus Anzahl', average_length_min: 131, average_consumption_kwh: 1.1 }, 'diagnostic');
ent('sensor.wp3', 'wd', 'ha_washdata', 'profile_cycle_count', '0', { friendly_name: 'Wasch Profil Kurz Anzahl', average_length_min: 0, average_consumption_kwh: null }, 'diagnostic');
ent('sensor.w10', 'wd', 'ha_washdata', 'current_power', '0.0', { unit_of_measurement: 'W', device_class: 'power' });
// Home Connect washer with i-Dos.
dev('hc');
ent('sensor.h1', 'hc', 'home_connect', 'operation_state', 'ready');
ent('select.h2', 'hc', 'home_connect', 'active_program', 'laundry_care_washer_program_cotton', { options: ['laundry_care_washer_program_cotton'] });
ent('sensor.h3', 'hc', 'home_connect', 'poor_i_dos_1_fill_level', 'present', { device_class: 'enum', options: ['confirmed', 'off', 'present'] });
ent('sensor.h4', 'hc', 'home_connect', 'poor_i_dos_2_fill_level', 'off', { device_class: 'enum', options: ['confirmed', 'off', 'present'] });
// Miele washer with TwinDos.
dev('mw');
ent('sensor.m1', 'mw', 'miele', 'status', 'off');
ent('sensor.m2', 'mw', 'miele', 'spin_speed', '1400', {}, 'diagnostic');
ent('sensor.m3', 'mw', 'miele', 'twin_dos_1_level', '8', { unit_of_measurement: '%' }, 'diagnostic');
ent('sensor.m4', 'mw', 'miele', 'twin_dos_2_level', '60', { unit_of_measurement: '%' }, 'diagnostic');

// 1. Roles from the keys.
const wd = LF.classify(hass, 'wd');
assert.equal(wd.source, 'washdata');
assert.equal(wd.f.maintdue, 'binary_sensor.w9', 'WashData maintenance_due → maintdue');
assert.deepEqual(wd.f.profiles.slice().sort(), ['sensor.wp1', 'sensor.wp2', 'sensor.wp3'], 'profile_cycle_count → profiles');
const hc = LF.classify(hass, 'hc');
assert.equal(hc.f.idos1, 'sensor.h3', 'Home Connect poor_i_dos_1_fill_level → idos1');
assert.equal(hc.f.idos2, 'sensor.h4', 'Home Connect poor_i_dos_2_fill_level → idos2');
const mw = LF.classify(hass, 'mw');
assert.equal(mw.f.twin1, 'sensor.m3', 'Miele twin_dos_1_level → twin1');
assert.equal(mw.f.twin2, 'sensor.m4', 'Miele twin_dos_2_level → twin2');

// 2. The popup's config carries them (and watches them).
const S = hass.states;
const c = L.resolve(S['sensor.w1'], {}, S, hass);
assert.equal(c.maintdue, 'binary_sensor.w9');
assert.equal(c.profiles.length, 3);
for (const e of ['binary_sensor.w9', 'sensor.wp1', 'sensor.wp2']) assert.ok(L.watch(c).includes(e), 'watch ' + e);
const ch = L.resolve(S['sensor.h1'], {}, S, hass);
const cm = L.resolve(S['sensor.m1'], {}, S, hass);
// The tile and popup share these state words, without changing program behavior.
for (const [raw, word] of [['off', 'Aus'], ['inactive', 'Inaktiv'], ['idle', 'Inaktiv'], ['ready', 'Bereit'], ['finished', 'Fertig']]) {
  const states = { ...S, 'sensor.w1': { ...S['sensor.w1'], state: raw } };
  assert.equal(L.state(states, 'sensor.w1')[0], word, `popup: ${raw}`);
}
assert.equal(ch.idos1, 'sensor.h3');
assert.equal(cm.twin2, 'sensor.m4');

// 3. Care rows. Without the maintenance log (WS not loaded or refused): the due tasks of the binary sensor.
let rows = L.careRows(c, S, {});
assert.deepEqual(rows.map((r) => [r.id, r.label, r.due]), [['filter_clean', 'Filter reinigen', true], ['custom_ab12', 'Türdichtung abwischen', true]]);
assert.equal(rows[0].sub, 'Fällig · 23 Durchgänge seit dem letzten Mal');
assert.equal(rows[1].sub, 'Fällig · 41 Tage seit dem letzten Mal');
assert.ok(rows.every((r) => r.wd), 'WashData tasks can be marked done');
// With the log (0.5.8+ status): every task, due ones first.
const ml = { due: ['filter_clean'], status: [
  { id: 'drum_clean', custom: false, cycles_interval: 30, days_interval: 0, cycles_since: 12, days_since: 30 },
  { id: 'filter_clean', custom: false, cycles_interval: 20, days_interval: 0, cycles_since: 23, days_since: 61 },
  { id: 'descale', custom: false, cycles_interval: 60, days_interval: 0, cycles_since: 41, days_since: 95 }] };
rows = L.careRows(c, S, { maint: ml });
assert.deepEqual(rows.map((r) => r.id), ['filter_clean', 'descale', 'drum_clean'], 'due first, then the nearest');
// Home Connect: i-Dos 1 nearly empty is due, i-Dos 2 not; nothing to mark done (the machine confirms it).
rows = L.careRows(ch, S, {});
assert.deepEqual(rows.map((r) => [r.label, r.due, r.value]), [['i-Dos 1', true, 'Fast leer'], ['i-Dos 2', false, 'Ausreichend']]);
assert.ok(!rows.some((r) => r.wd));
// Miele: TwinDos 8 % due, 60 % with its bar.
rows = L.careRows(cm, S, {});
assert.deepEqual(rows.map((r) => [r.label, r.due, r.value]), [['TwinDos 1', true, '8 %'], ['TwinDos 2', false, '60 %']]);
assert.equal(rows[1].bar, 0.6);

// 4. The care section: due rows with „Erledigt“ (WashData), the rest behind one row with a sub page.
let g = groups(L.inner('care', c, S));
assert.equal(g.length, 1);
assert.equal(g[0].title, 'Pflege');
assert.deepEqual(g[0].rows.map((r) => r.label), ['Filter reinigen', 'Türdichtung abwischen']);
let html = L.inner('care', c, S);
assert.ok(/data-hw-maint="entry_wd\|filter_clean\|sensor\.w1"[^>]*>Erledigt</.test(html), '„Erledigt“ on the due WashData task');
L.data[c.st] = { maint: ml, ready: true };
g = groups(L.inner('care', c, S));
assert.deepEqual(g[0].rows.map((r) => r.label), ['Filter reinigen', 'Weitere Pflege']);
assert.equal(g[0].rows[1].page, 'laundry-care|sensor.w1');
assert.equal(g[0].rows[1].sub, 'Entkalken · In 19 Durchgängen fällig', 'summary names the next care');
// Nothing due: one calm row.
L.data[c.st] = { maint: { due: [], status: ml.status.map((r) => ({ ...r, cycles_since: 1 })) }, ready: true };
g = groups(L.inner('care', c, { ...S, 'binary_sensor.w9': { state: 'off', attributes: { due_tasks: [] } } }));
assert.deepEqual(g[0].rows.map((r) => [r.label, r.page]), [['Alles erledigt', 'laundry-care|sensor.w1']]);
// The sub page lists every task with its bar.
g = groups(L.inner('care_all', c, S));
assert.equal(g[0].rows.length, 3);
assert.ok(g[0].rows.every((r) => typeof r.bar === 'number'));

// 5. Programmes from the profile sensors (lifetime counts), names from the programme options (longest match).
const pl = L.profileList(c, S);
assert.deepEqual(pl.map((p) => [p.name, p.n]), [['Baumwolle 40 Plus', 12], ['Baumwolle 40', 3]], 'longest name wins, empty profiles stay out');
L.data[c.st] = { cycles: [], ready: true };
g = groups(L.inner('progs', c, S));
assert.equal(g[0].title, 'Programme');
assert.deepEqual(g[0].rows.map((r) => [r.label, r.value]), [['Baumwolle 40 Plus', '12×'], ['Baumwolle 40', '3×']]);
assert.equal(g[0].rows[0].sub, 'Ø 2 Std. 11 Min. · 1,10 kWh');

// 6. Last cycles: an unmatched cycle says so instead of „Unbekanntes Programm“.
const day = 86400e3, now = Date.now();
const cyc = [0, 1, 2].map((i) => ({ start_time: new Date(now - (i + 1) * 2 * day).toISOString(), end_time: new Date(now - (i + 1) * 2 * day + 7200e3).toISOString(),
  duration: 7000, status: 'completed', profile_name: null, energy_wh: 900 }));
L.data[c.st] = { cycles: cyc, ready: true };
g = groups(L.inner('cycles', c, S));
assert.ok(g[0].rows.every((r) => r.label === 'Programm nicht erkannt'), g[0].rows.map((r) => r.label).join());

// 7. Detection rows: next programme (sub page), teach programmes (WashData panel of this device), recommendations.
g = groups(L.inner('det', c, S));
assert.equal(g[0].title, 'Erkennung');
const byL = Object.fromEntries(g[0].rows.map((r) => [r.label, r]));
assert.equal(byL['Nächstes Programm'].value, 'Automatisch');
assert.equal(byL['Nächstes Programm'].page, 'laundry-prog|sensor.w1');
assert.equal(byL['Programme beibringen'].url, '/ha-washdata?device=entry_wd');
assert.equal(byL['Erkennung verbessern'].sub, '2 Einstellungen empfohlen');
assert.equal(byL['Erkennung verbessern'].url, '/ha-washdata?device=entry_wd');
// Recommendations only while WashData says they can be applied.
g = groups(L.inner('det', c, { ...S, 'sensor.w8': { state: '2', attributes: { has_actionable_suggestions: false } } }));
assert.ok(!g[0].rows.some((r) => r.label === 'Erkennung verbessern'));
// Labelled cycles: no teach row.
L.data[c.st] = { cycles: cyc.map((x) => ({ ...x, profile_name: 'Kurz' })), ready: true };
g = groups(L.inner('det', c, S));
assert.ok(!g[0].rows.some((r) => r.label === 'Programme beibringen'));

// 8. Statistics: lifetime cycles, this month, Ø per cycle, energy in total.
L.data[c.st] = { cycles: cyc, ready: true, month: 2.7 };
g = groups(L.inner('stats3', { ...c, price: null }, S));
assert.equal(g[0].title, 'Statistik');
const st = Object.fromEntries(g[0].rows.map((r) => [r.label, r]));
assert.equal(st['Durchgänge insgesamt'].value, '63');
assert.equal(st['Ø pro Durchgang'].value, '0,90 kWh');
assert.equal(st['Verbrauch insgesamt'].value, '41,5 kWh');
assert.ok(st['Dieser Monat'], 'this month');

// 9. Running (Soft/v3): the cycle's power now and its projected energy (WashData progress attributes).
window._casoraHH = { on: () => true };
const RS = { ...S, 'sensor.w1': { state: 'running', attributes: { current_program_guess: 'detecting...' }, last_changed: new Date().toISOString() },
  'sensor.w2': { state: '58', attributes: { unit_of_measurement: '%', projected_energy_kwh: 0.88, projected_cost: 0.31 } },
  'sensor.w10': { state: '160', attributes: { unit_of_measurement: 'W', device_class: 'power' } } };
g = groups(L.inner('run', { ...c, power: 'sensor.w10' }, RS));
const run = Object.fromEntries(g[0].rows.map((r) => [r.label, r]));
assert.equal(run['Leistung'].value, '160 W');
assert.equal(run['Verbrauch'].value, '0,88 kWh');
assert.ok(/^Voraussichtlich · 0,31/.test(run['Verbrauch'].sub), run['Verbrauch'].sub);
// Unknown programme while running: the detection rows offer to set it.
g = groups(L.inner('det', c, RS));
const fix = g[0].rows.find((r) => r.label === 'Programm festlegen');
assert.ok(fix && fix.sub === 'Programm nicht erkannt' && fix.page === 'laundry-prog|sensor.w1', JSON.stringify(g[0].rows));
delete window._casoraHH;

console.log('ok laundry_content');
