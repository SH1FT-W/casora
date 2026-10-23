// Issue #27: waste calendar only (no bin sensors). Bins come from the calendar events,
// the tile shows the next pickup and the popup lists them.  node dev/unit/abfall_nur_kalender.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
globalThis.addEventListener = () => {};
globalThis.setTimeout = () => 0;
const load = (p) => new Function(fs.readFileSync(new URL('../../custom_components/casora/scripts/local/' + p, import.meta.url), 'utf8'))();
load('00-finder.js');
load('06-kalender.js');
window._casoraUI = {
  tokens: { ink: '#fff', ink2: '#ccc', ink3: '#999', fill: '#333', accent: '#0a84ff', green: '#30d158', font: 'system-ui' },
  esc: (t) => String(t), hero: () => '<hero>', group: (rows, t) => '<group ' + t + '>' + JSON.stringify(rows), soft: () => false,
};
window.casoraStateFit = (t) => t;

const T = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const body = (s) => s.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
const tile = new Function('states', 'entity', 'user', 'hass', 'variables', 'html', body(T.casora_trash.state_display));
const popup = new Function('states', 'entity', 'user', 'hass', 'variables', 'html', body(T.casora_trash.tap_action.casora_popup.content));

const day = (n) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n); return d; };
const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const CAL = 'calendar.abfall';
const states = { [CAL]: { entity_id: CAL, state: 'off', attributes: { friendly_name: 'Entsorger', message: 'Grüne Tonne', start_time: ymd(day(2)) + ' 00:00:00' } } };
const hass = { states, entities: {}, devices: {} };
window.CASORA_SETTINGS = { waste: { calendar: CAL } };

// Not loaded yet: tile waits instead of "no bins found".
assert.equal(tile(states, null, {}, hass, {}, null), '…');

const ev = (n, s) => ({ summary: s, start: { date: ymd(day(n)) }, end: { date: ymd(day(n + 1)) } });
window._casoraTrashCal = { id: CAL, ts: Date.now(), ev: [ev(-3, 'Blaue Tonne'), ev(2, 'Grüne Tonne'), ev(9, 'Schwarze Tonne'), ev(10, 'Grünschnitt'), ev(16, 'Grüne Tonne'), ev(17, 'Blaue Tonne')] };

const W = window.casoraDevice.waste(hass, {});
assert.deepEqual(W.bins.map((b) => b.label).sort(), ['Blaue Tonne', 'Grüne Tonne', 'Grünschnitt', 'Schwarze Tonne']);
assert.equal(W.days, 2);
assert.equal(W.next.label, 'Grüne Tonne');
assert.equal(W.bins.find((b) => b.label === 'Blaue Tonne').days, 17, 'past events ignored');
assert.equal(W.bins.find((b) => b.label === 'Grüne Tonne').color, '#30D158', 'colour word');
assert.equal(W.bins.find((b) => b.label === 'Schwarze Tonne').color, '#8E8E93');
assert.equal(window.casoraDevice.wasteDown(hass, W), null);
assert.equal(tile(states, null, {}, hass, {}, null), '2 Tage · Grüne Tonne');

// Dates per bin: "Grüne Tonne" must not pick up "Grünschnitt".
const g = window.casoraDevice.wasteDates(hass, W).find((x) => x.bin.label === 'Grüne Tonne');
assert.deepEqual(g.dates.map(ymd), [ymd(day(2)), ymd(day(16))]);

// Popup lists the bins instead of "no dates".
const out = JSON.stringify(popup(states, null, {}, hass, {}, null));
assert.match(out, /Grüne Tonne/);
assert.match(out, /Schwarze Tonne/);

// Sensors present: calendar does not add bins.
states['sensor.bio'] = { entity_id: 'sensor.bio', state: '4', attributes: { friendly_name: 'Bio', daysTo: 4 } };
assert.deepEqual(window.casoraDevice.waste(hass, {}).bins.map((b) => b.label), ['Bio']);
console.log('abfall_nur_kalender: ok');
