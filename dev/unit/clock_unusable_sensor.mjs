// Automatic time source with a sensor.time that has no usable value (unavailable, unknown, empty): the clock
// counts it as missing and shows the device clock, never the state text. A usable sensor.time and a sensor
// chosen in the Studio keep their behaviour.   node dev/unit/clock_unusable_sensor.mjs
// @deckt: dashboards/casora/button_card_templates.json#casora_time custom_components/casora/scripts/casora-core.js#casoraClockText,casoraClockHtml
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (f) => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const core = read('custom_components/casora/scripts/casora-core.js');
const a = core.indexOf('    window.casoraClockText = function');
const b = core.indexOf('    if (!customElements.get(\'casora-clock\'))', a);
assert.ok(a > 0 && b > a, 'clock helpers in casora-core.js');
const window = {};
const document = { querySelector: () => ({ hass: null }) };
new Function('window', 'document', core.slice(a, b))(window, document);

// The tile: the name template is the clock, as the Dashboard renders it.
const tpl = JSON.parse(read('dashboards/casora/button_card_templates.json')).casora_time;
const js = (s) => s.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
const clock = (states, variables) => new Function('window', 'states', 'hass', 'variables', js(tpl.name))(window, states, {}, variables);
const DEVICE = /^<casora-clock data-h12="" data-suffix="">\d\d:\d\d<\/casora-clock>$/;

// Red before the fix: Automatic with an unusable sensor.time printed the state.
for (const state of ['unavailable', 'unknown', '']) {
  const out = clock({ 'sensor.time': { state } }, { time_entity: 'sensor.time', use_12h: false });
  assert.match(out, DEVICE, 'sensor.time state "' + state + '": the device clock');
  assert.notEqual(out, state.toUpperCase(), 'sensor.time state "' + state + '": never the state text');
}
// The same with a suffix and 12-hour form: the device clock keeps both.
assert.match(clock({ 'sensor.time': { state: 'unavailable' } }, { time_entity: 'sensor.time', use_12h: true, time_suffix: 'Uhr' }),
  /^<casora-clock data-h12="1" data-suffix="Uhr">\d{1,2}:\d\d [AP]M<\/casora-clock>$/, 'unusable sensor.time with suffix and 12-hour form');

// Keep: a usable sensor.time shows its own text.
assert.equal(clock({ 'sensor.time': { state: '08:13' } }, { time_entity: 'sensor.time', use_12h: false }), '08:13', 'usable sensor.time: its text');
assert.equal(clock({ 'sensor.time': { state: 'Mon, 08:13' } }, { time_entity: 'sensor.time', use_12h: false }), '08:13', 'usable sensor.time with a date: the time part');

// Keep: no sensor.time at all shows the device clock.
assert.match(clock({}, { time_entity: 'sensor.time', use_12h: false }), DEVICE, 'missing sensor.time: the device clock');
assert.match(clock({}, { use_12h: false }), DEVICE, 'no entry at all: the same');

// The date line (show_date) on the device clock: the same markup as the device-clock path builds.
{
  const out = clock({ 'sensor.time': { state: 'unavailable' } }, { time_entity: 'sensor.time', use_12h: false, show_date: true });
  assert.match(out, /^<casora-clock data-h12="" data-suffix="" data-date="1"><span class="casora-clock-date"/, 'unusable sensor.time with show_date: date lines');
  const hhmm = (x) => x.replace(/\d\d:\d\d/, 'HH:MM');
  assert.equal(hhmm(out), hhmm(window.casoraClockHtml(false, '', true)), 'unusable sensor.time with show_date: same as the device-clock path');
}

// Without casoraClockHtml (core script not loaded yet): an unusable sensor.time shows nothing, like a missing one.
{
  const html = window.casoraClockHtml;
  delete window.casoraClockHtml;
  try {
    for (const state of ['unavailable', 'unknown', '']) {
      assert.equal(clock({ 'sensor.time': { state } }, { time_entity: 'sensor.time', use_12h: false }), '', 'no casoraClockHtml, sensor.time state "' + state + '": empty');
    }
  } finally {
    window.casoraClockHtml = html;
  }
}

// Keep: a sensor chosen in the Studio is not changed by the fix.
assert.equal(clock({ 'sensor.kitchen_clock': { state: 'unavailable' } }, { time_entity: 'sensor.kitchen_clock', use_12h: false }),
  'UNAVAILABLE', 'chosen sensor with state unavailable: unchanged (state text)');
assert.equal(clock({}, { time_entity: 'sensor.kitchen_clock', use_12h: false }), '', 'chosen sensor that is gone: empty as before');

console.log('clock_unusable_sensor: ok');
