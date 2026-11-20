// Countdown sensors with a sentinel (#218): template sensors report 99 (or 999, -1) for "no pickup known". The
// waste finder read it as days, so the popup listed the bin "in 99 Tagen" with a date 99 days away.
//   LC_ALL=en_US.UTF-8 TZ=UTC node dev/unit/waste_countdown_sentinel.mjs
// @deckt: 00-finder.js#waste
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
globalThis.addEventListener = () => {};
new Function(fs.readFileSync(new URL('../../custom_components/casora/scripts/local/00-finder.js', import.meta.url), 'utf8'))();

const num = (name, v, attrs) => ({ state: String(v), attributes: Object.assign({ friendly_name: name }, attrs) });
const run = (states, labels) => {
  const hass = { states, entities: {}, devices: {} };
  const W = window.casoraDevice.waste(hass, { trash_sensors: labels });
  return { W, dates: window.casoraDevice.wasteDates(hass, W) };
};

// The reporter's three sensors, no calendar loaded: only PMD has a pickup.
window._casoraTrashCal = null;
let r = run({ 'sensor.pmd_days': num('PMD days', 1), 'sensor.papier_days': num('Papier days', 99), 'sensor.gft_days': num('GFT days', 99) },
  { 'sensor.pmd_days': 'PMD', 'sensor.papier_days': 'Papier', 'sensor.gft_days': 'GFT' });
const days = (x, label) => x.W.bins.find((b) => b.label === label).days;
assert.equal(days(r, 'PMD'), 1);
assert.equal(days(r, 'Papier'), null, '99 is no countdown');
assert.equal(days(r, 'GFT'), null, '99 is no countdown');
assert.equal(r.W.days, 1);
assert.equal(r.W.next.label, 'PMD');
assert.deepEqual(r.dates.map((x) => x.dates.length), [1, 0, 0], 'no date made up from the sentinel');

// Other sentinels and impossible values, as state or as daysTo; real countdowns stay.
for (const v of [999, 9999, -1, 1000]) {
  r = run({ 'sensor.a': num('A', v), 'sensor.b': num('B', 'unknown', { daysTo: v }) }, { 'sensor.a': 'A', 'sensor.b': 'B' });
  assert.equal(days(r, 'A'), null, 'state ' + v);
  assert.equal(days(r, 'B'), null, 'daysTo ' + v);
  assert.equal(r.W.next, null);
}
for (const v of [0, 1, 9, 28, 98, 100, 364]) {
  r = run({ 'sensor.a': num('A', v), 'sensor.b': num('B', 'unknown', { daysTo: v }) }, { 'sensor.a': 'A', 'sensor.b': 'B' });
  assert.equal(days(r, 'A'), v, 'state ' + v);
  assert.equal(days(r, 'B'), v, 'daysTo ' + v);
}
// A calendar-only bin 99 days away is a real date (counted from the event, not a sensor's sentinel).
const CAL = 'calendar.afvalkalender', d99 = new Date(); d99.setHours(0, 0, 0, 0); d99.setDate(d99.getDate() + 99);
const iso99 = d99.getFullYear() + '-' + String(d99.getMonth() + 1).padStart(2, '0') + '-' + String(d99.getDate()).padStart(2, '0');
window._casoraTrashCal = { id: CAL, ts: Date.now(), ev: [{ summary: 'Kerstbomen', start: { date: iso99 } }] };
const C = window.casoraDevice.waste({ states: { [CAL]: { state: 'off', attributes: {} } }, entities: {}, devices: {} }, { trash_calendar: CAL });
assert.equal(C.bins[0].days, 99);
console.log('waste_countdown_sentinel: ok');
