// #179: weekday and date in small type under the top bar clock (Studio › Time › Show date, off by default).
// Both clock paths (sensor.time and the device clock without it), the room passing the switch on, the Studio field
// and its preview.   node dev/unit/uhr_mit_datum.mjs
// @deckt: dashboards/casora/button_card_templates.json#casora_time,casora_room, custom_components/casora/scripts/casora-core.js#casoraClockDate,casoraClockLines,casoraClockHtml, custom_components/casora/panel/casora-panel.js#show_date
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (f) => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const core = read('custom_components/casora/scripts/casora-core.js');
const a = core.indexOf('    window.casoraClockText = function');
const b = core.indexOf('    if (!customElements.get(\'casora-clock\'))', a);
assert.ok(a > 0 && b > a, 'clock helpers in casora-core.js');
const window = { casoraLocale: () => 'de-DE' };
const hassRoot = { locale: { time_zone: 'server' }, config: { time_zone: 'Europe/Berlin' } };
new Function('window', 'document', core.slice(a, b))(window, { querySelector: () => ({ hass: hassRoot }) });

// Thursday 12.11.2026, 22:54 in Berlin.
const at = new Date(Date.UTC(2026, 10, 12, 21, 54));
assert.equal(window.casoraClockDate(hassRoot, at), 'Donnerstag, 12. November', 'German weekday and date');
// HA's zone: 23:30 UTC is already Friday in Tokyo.
assert.equal(window.casoraClockDate({ locale: { time_zone: 'server' }, config: { time_zone: 'Asia/Tokyo' } }, new Date(Date.UTC(2026, 10, 12, 23, 30))),
  'Freitag, 13. November', 'profile "server": the date in Home Assistant\'s zone');
window.casoraLocale = () => 'en-US';
assert.equal(window.casoraClockDate(hassRoot, at), 'Thursday, November 12', 'the dashboard\'s language');
window.casoraLocale = () => 'de-DE';

const two = window.casoraClockLines('22:54', 'Donnerstag, 12. November');
assert.match(two, /<span>22:54<\/span><span style="[^"]*font-size:0\.6em[^"]*text-transform:none[^"]*">Donnerstag, 12\. November<\/span>/,
  'time, then the date small and not in capitals');

// Device clock (no sensor.time): with the switch the element carries the date and renders both lines.
assert.match(window.casoraClockHtml(false, ''), /^<casora-clock data-h12="" data-suffix="">\d\d:\d\d<\/casora-clock>$/, 'off: as before');
const on = window.casoraClockHtml(false, '', true);
assert.match(on, /^<casora-clock data-h12="" data-suffix="" data-date="1"><span class="casora-clock-date"/, 'on: marked, two lines');
assert.match(core, /if \(this\.dataset\.date === '1'\)[\s\S]{0,300}casoraClockLines/, 'the ticking element keeps the date line');

// The tile.
const T = JSON.parse(read('dashboards/casora/button_card_templates.json'));
const js = (s) => s.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
const name = (states, variables) => new Function('window', 'states', 'hass', 'variables', js(T.casora_time.name))(window, states, hassRoot, variables);
const sensor = { 'sensor.time': { state: '22:54' } };
assert.equal(name(sensor, { time_entity: 'sensor.time', use_12h: false }), '22:54', 'switch off: only the time');
assert.equal(name(sensor, { time_entity: 'sensor.time', use_12h: false, show_date: false }), '22:54', 'switch off explicitly: only the time');
const withDate = name(sensor, { time_entity: 'sensor.time', use_12h: false, show_date: true });
assert.match(withDate, /^<span class="casora-clock-date"[^>]*><span>22:54<\/span><span [^>]*>\S+, \d+\. \S+<\/span><\/span>$/, 'switch on: the date under the time');
assert.match(name({}, { use_12h: false, show_date: true }), /data-date="1"/, 'without sensor.time: the device clock with the date');
assert.equal(T.casora_time.variables.show_date, false, 'off by default');
assert.equal(T.casora_room.custom_fields.time.card.variables.show_date, '[[[ return variables.show_date === true ]]]', 'the room passes the switch on');

// Studio: the switch under „Show clock“, off by default, and the preview.
const panel = read('custom_components/casora/panel/casora-panel.js');
assert.match(panel, /key: "show_time"[\s\S]{0,400}\{ key: "show_date", label: "Show date", type: "bool", boolDefault: false, always: true,/, 'Studio switch after „Show clock“');
assert.match(panel, /if \(V\.show_date === true\) \{[\s\S]{0,200}mini-date/, 'Studio preview shows the date');
for (const l of ['de', 'es', 'fr', 'it', 'nb', 'nl', 'pl', 'pt']) {
  const P = JSON.parse(read(`custom_components/casora/translations/panel/${l}.json`));
  assert.ok((P.exact || P)['Show date'], l + ': Show date');
}
console.log('uhr_mit_datum: ok');
