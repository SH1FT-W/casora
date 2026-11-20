// Dutch waste names (#218): the PMD pickup "Plastic, metaal en drankenkartons" in the waste calendar was taken
// for paper ("karton" in "drankenkartons"), so the Papier row got PMD's date and the tile said
// "Morgen · PMD + Papier"; "Groente-, fruit- en tuinafval" matched no row, so GFT never got its date.
//   LC_ALL=en_US.UTF-8 TZ=UTC node dev/unit/waste_nl_names.mjs
// @deckt: 00-finder.js#waste
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
globalThis.addEventListener = () => {};
new Function(fs.readFileSync(new URL('../../custom_components/casora/scripts/local/00-finder.js', import.meta.url), 'utf8'))();

const iso = (n) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const num = (name, v) => ({ state: String(v), attributes: { friendly_name: name } });
const CAL = 'calendar.afvalkalender';
const ev = (n, summary) => ({ summary, start: { date: iso(n) }, end: { date: iso(n + 1) } });

// The reporter's setup: three countdown sensors (far away here, so only the calendar decides) and the calendar.
const states = {
  'sensor.pmd_days': num('PMD days', 40), 'sensor.papier_days': num('Papier days', 40), 'sensor.gft_days': num('GFT days', 40),
  [CAL]: { state: 'off', attributes: { friendly_name: 'Afvalkalender' } },
};
const hass = { states, entities: {}, devices: {} };
const vars = { trash_sensors: { 'sensor.pmd_days': 'PMD', 'sensor.papier_days': 'Papier', 'sensor.gft_days': 'GFT' }, trash_calendar: CAL };
window._casoraTrashCal = { id: CAL, ts: Date.now(), ev: [ev(1, 'Plastic, metaal en drankenkartons'), ev(5, 'Groente-, fruit- en tuinafval')] };

const W = window.casoraDevice.waste(hass, vars);
const bin = (label) => W.bins.find((b) => b.label === label);
assert.equal(bin('PMD').days, 1, 'PMD: its own calendar event tomorrow');
assert.equal(bin('Papier').days, 40, 'Papier: the PMD event (drankenkartons) is not paper');
assert.equal(bin('GFT').days, 5, 'GFT: "Groente-, fruit- en tuinafval" is its event');
assert.equal(W.next.label, 'PMD', 'tile: only PMD tomorrow');
const dates = window.casoraDevice.wasteDates(hass, W);
const first = (label) => { const d = dates.find((x) => x.bin.label === label).dates[0]; return Math.round((d - new Date(iso(0) + 'T00:00:00')) / 86400000); };
assert.equal(first('Papier'), 40, 'popup: the Papier row does not show PMD\'s date');
assert.equal(first('GFT'), 5);

// Colours: PMD with the packaging bin, GFT with organic waste, Papier with paper – not the orange of an unknown bin.
assert.equal(bin('PMD').color, '#FFCC00');
assert.equal(bin('GFT').color, '#30D158');
assert.equal(bin('Papier').color, '#0A84FF');

// Calendar only (the long names as event titles) and other common Dutch names.
window._casoraTrashCal = { id: CAL, ts: Date.now(), ev: [ev(1, 'Plastic, metaal en drankenkartons'), ev(5, 'Groente-, fruit- en tuinafval'),
  ev(6, 'Restafval'), ev(7, 'Oud papier en karton'), ev(8, 'Grofvuil')] };
const C = window.casoraDevice.waste({ states: { [CAL]: states[CAL] }, entities: {}, devices: {} }, { trash_calendar: CAL });
const col = (label) => C.bins.find((b) => b.label === label).color;
assert.equal(col('Plastic, metaal en drankenkartons'), '#FFCC00');
assert.equal(col('Groente-, fruit- en tuinafval'), '#30D158');
assert.equal(col('Restafval'), '#8E8E93');
assert.equal(col('Oud papier en karton'), '#0A84FF');

// German names keep their kind: cardboard on its own is still paper.
window._casoraTrashCal = { id: CAL, ts: Date.now(), ev: [ev(2, 'Papier/Karton'), ev(3, 'Kartonagen'), ev(4, 'Altkarton')] };
const G = window.casoraDevice.waste({ states: { 'sensor.p': num('Papier', 40), [CAL]: states[CAL] }, entities: {}, devices: {} },
  { trash_sensors: { 'sensor.p': 'Karton' }, trash_calendar: CAL });
assert.equal(G.bins[0].color, '#0A84FF');
assert.equal(G.bins[0].days, 2);
assert.equal(window.casoraDevice.wasteDates({ states: { 'sensor.p': num('Papier', 40) } }, G)[0].dates.length, 3, 'Karton, Kartonagen, Altkarton');
console.log('waste_nl_names: ok');
