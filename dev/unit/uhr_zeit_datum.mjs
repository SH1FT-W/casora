// Clock hint (#30): the dashboard clock reads sensor.time (core "Time & Date" integration, option "Time") when no
// time sensor is chosen. casoraClockNeedsTimeDate decides, in one place, whether it reads a missing sensor.time;
// the Studio warning under "Time sensor" and the admin hint in the clock tile both use it.
//   node dev/unit/uhr_zeit_datum.mjs
// @deckt: custom_components/casora/scripts/casora-core.js#casoraClockNeedsTimeDate
import fs from 'node:fs';
import assert from 'node:assert/strict';
const src = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const core = src('custom_components/casora/scripts/casora-core.js');
const m = core.match(/  window\.casoraClockNeedsTimeDate = function [\s\S]*?\n  \};\n/);
assert.ok(m, 'casoraClockNeedsTimeDate fehlt');
const window = {};
new Function('window', m[0])(window);
const needs = window.casoraClockNeedsTimeDate;
const none = {};
const withTime = { 'sensor.time': { state: '21:07' } };
// warn: clock on (explicit or default), Automatic or sensor.time by hand, sensor.time missing
assert.equal(needs(true, '', none), true, 'on + Automatic + missing');
assert.equal(needs(undefined, undefined, none), true, 'default is on');
assert.equal(needs(true, 'sensor.time', none), true, 'sensor.time by hand + missing');
assert.equal(needs('', null, undefined), true, 'no states at all: missing');
// no warn
assert.equal(needs(true, '', withTime), false, 'sensor.time exists');
assert.equal(needs(true, '', { 'sensor.time': { state: 'unavailable' } }), false, 'unavailable counts as existing');
assert.equal(needs(true, 'sensor.uhr_wohnzimmer', none), false, 'another sensor chosen (its own check applies)');
assert.equal(needs(true, 'sensor.uhr_wohnzimmer', withTime), false);
assert.equal(needs(false, '', none), false, 'clock off');
assert.equal(needs(false, 'sensor.time', none), false);
// The clock tile and the Studio use this one function, not a copy.
const tpl = JSON.parse(src('dashboards/casora/button_card_templates.json')).casora_time.name;
assert.ok(tpl.includes('window.casoraClockNeedsTimeDate('), 'tile uses the shared rule');
assert.ok(src('custom_components/casora/panel/casora-panel.js').includes('window.casoraClockNeedsTimeDate('), 'Studio uses the shared rule');
// Tile: admin gets the hint, non-admin an empty text, rule false: the time as before.
const run = (admin, states, vars) => {
  const win = { casoraEsc: (t) => String(t), casoraIsAdmin: () => admin };
  new Function('window', m[0])(win);
  return new Function('window', 'states', 'variables', 'return (function(){' + tpl.replace(/^\[\[\[|\]\]\]\s*$/g, '') + '})()')(win, states, vars);
};
assert.match(run(true, none, { time_entity: 'sensor.time' }), /Zeit & Datum/, 'admin sees the hint');
assert.equal(run(false, none, { time_entity: 'sensor.time' }), '', 'non-admin sees no text');
assert.equal(run(true, withTime, { time_entity: 'sensor.time' }), '21:07', 'rule false: time as before');
assert.equal(run(true, none, { time_entity: 'sensor.uhr_wohnzimmer' }), '', 'other missing sensor: empty as before');
assert.equal(run(true, none, { time_entity: 'sensor.time', show_time: false }), '', 'clock off: no hint');
// Texts exist in every dashboard language.
// de is the key itself.
for (const l of ['en', 'es', 'fr', 'it', 'nl', 'pl', 'pt']) {
  const ph = JSON.parse(src(`custom_components/casora/translations/dashboard/phrases/${l}.json`)).exact;
  const key = (tpl.match(/'(Uhr: [^']+)'/) || [])[1];
  assert.ok(key, 'hint text in tile');
  assert.ok(ph[key], l + ': ' + key);
}
console.log('ok uhr_zeit_datum');
