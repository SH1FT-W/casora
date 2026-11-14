// @deckt: custom_components/casora/scripts/local/13-schloss.js#L.when
// Lock history (13-schloss.js, L.when): „gestern“ is the calendar day before today. The day after a clock change
// yesterday was 23 or 25 hours long: on 30.03. 23:30 of the 28th said „gestern“, on 26.10. 0:30 of the 25th a date.
//   node dev/unit/schloss_gestern_umstellung.mjs
process.env.TZ = 'Europe/Berlin';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/13-schloss.js', import.meta.url), 'utf8');
let NOW = 0;
class FakeDate extends Date { constructor(...a) { if (a.length) super(...a); else super(NOW); } static now() { return NOW; } }
const win = { casoraLocale: () => 'de-DE', addEventListener() {} };
let ha = null;
new Function('window', 'document', 'Date', src)(win, { addEventListener() {}, querySelector: () => ha }, FakeDate);
const L = win._casoraLockView;

NOW = new Date(2026, 2, 30, 9, 0).getTime();   // the day after the clocks went forward
assert.match(L.when(new Date(2026, 2, 29, 0, 30).getTime()), /^gestern /, '29.03. 0:30 is yesterday');
assert.doesNotMatch(L.when(new Date(2026, 2, 28, 23, 30).getTime()), /gestern/, '28.03. 23:30 is the day before yesterday');

NOW = new Date(2026, 9, 26, 9, 0).getTime();   // the day after the clocks went back
assert.match(L.when(new Date(2026, 9, 25, 0, 30).getTime()), /^gestern /, '25.10. 0:30 is yesterday');
assert.doesNotMatch(L.when(new Date(2026, 9, 24, 23, 30).getTime()), /gestern/);
assert.match(L.when(new Date(2026, 9, 26, 8, 0).getTime()), /^\d/, 'today: the time only');

// The logbook is asked from yesterday's midnight, so everything „gestern“ can say is in it.
const asked = [];
ha = { hass: { callWS: (m) => { asked.push(m); return new Promise(() => {}); } } };
L.fetch('lock.door');
assert.equal(new Date(asked[0].start_time).getTime(), new Date(2026, 9, 25).getTime(), 'from 25.10. 0:00');
console.log('ok schloss_gestern_umstellung');
