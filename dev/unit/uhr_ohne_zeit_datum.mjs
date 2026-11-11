// #172: Home Assistant no longer adds the Time & Date integration; without sensor.time the top bar clock stayed
// empty, with no hint. On "Automatic" the device's time stands in now (in HA's time zone when the profile says
// "server"); a time sensor chosen in the Studio that is gone still shows nothing.   node dev/unit/uhr_ohne_zeit_datum.mjs
// @deckt: dashboards/casora/button_card_templates.json#casora_time, custom_components/casora/scripts/casora-core.js#casoraClockText,casoraClockHtml
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (f) => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const core = read('custom_components/casora/scripts/casora-core.js');
const a = core.indexOf('    window.casoraClockText = function');
const b = core.indexOf('    if (!customElements.get(\'casora-clock\'))', a);
assert.ok(a > 0 && b > a, 'clock helpers in casora-core.js');
const window = {};
const document = { querySelector: () => ({ hass: { locale: { time_zone: 'server' }, config: { time_zone: 'Asia/Tokyo' } } }) };
new Function('window', 'document', core.slice(a, b))(window, document);

const at = new Date(Date.UTC(2026, 10, 11, 13, 5));   // 13:05 UTC = 22:05 in Tokyo
const server = { locale: { time_zone: 'server' }, config: { time_zone: 'Asia/Tokyo' } };
assert.equal(window.casoraClockText(server, false, at), '22:05', 'profile "server": Home Assistant\'s zone');
assert.equal(window.casoraClockText(server, true, at), '10:05 PM', '12-hour clock');
const local = { locale: { time_zone: 'local' }, config: { time_zone: 'Asia/Tokyo' } };
const dev = new Date(at); const hh = String(dev.getHours()).padStart(2, '0');
assert.equal(window.casoraClockText(local, false, at), hh + ':05', 'profile "local": the device\'s zone');
assert.equal(window.casoraClockText(null, false, new Date(2026, 0, 1, 7, 3)), '07:03', 'two-digit hours like sensor.time');
assert.match(window.casoraClockHtml(false, 'Uhr'), /^<casora-clock data-h12="" data-suffix="Uhr">\d\d:\d\d<\/casora-clock>$/);

// The tile.
const tpl = JSON.parse(read('dashboards/casora/button_card_templates.json')).casora_time;
const js = (s) => s.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
const name = (states, variables) => new Function('window', 'states', 'hass', 'variables', js(tpl.name))(window, states, {}, variables);
assert.match(name({}, { time_entity: 'sensor.time', use_12h: false }), /^<casora-clock /, 'no sensor.time: the device clock');
assert.match(name({}, { use_12h: false }), /^<casora-clock /, 'no entry at all: the same');
assert.equal(name({}, { time_entity: 'sensor.gone_clock' }), '', 'a chosen sensor that is gone: empty as before');
assert.equal(name({ 'sensor.time': { state: '08:13' } }, { time_entity: 'sensor.time', use_12h: false }), '08:13', 'with the sensor: unchanged');
console.log('uhr_ohne_zeit_datum: ok');
