// Issue #146: "Add event" in the calendar popup. Only calendars that can create events are offered, and the form becomes
// the service data of calendar.create_event (all-day end exclusive, as HA expects).
//   node dev/unit/calendar_add_event.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/06-kalender.js', import.meta.url), 'utf8');
const a = src.indexOf('  K.writable = function'), b = src.indexOf('  /* A small form over', a);
assert.ok(a > 0 && b > a, 'found');
const addD = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const parseYmd = (s) => { const p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
const K = { cals: () => [{ entity: 'calendar.family' }, { entity: 'calendar.school' }, { entity: 'calendar.gone' }, { entity: 'calendar.todo' }] };
new Function('K', 'addD', 'ymd', 'parseYmd', src.slice(a, b))(K, addD, ymd, parseYmd);

const st = { 'calendar.family': { attributes: { supported_features: 7 } }, 'calendar.school': { attributes: {} }, 'calendar.todo': { attributes: { supported_features: 1 } } };
assert.deepEqual(K.writable({}, st).map((c) => c.entity), ['calendar.family', 'calendar.todo'], 'read-only and missing calendars are not offered');

const f = { title: ' Dentist ', startDate: '2026-11-16', startTime: '14:00', endDate: '2026-11-16', endTime: '15:00' };
assert.deepEqual(K.eventData(f).data, { summary: 'Dentist', start_date_time: '2026-11-16 14:00:00', end_date_time: '2026-11-16 15:00:00' }, 'timed, empty optionals left out');
assert.deepEqual(K.eventData({ ...f, location: ' Town ', description: ' Bring card ' }).data,
  { summary: 'Dentist', location: 'Town', description: 'Bring card', start_date_time: '2026-11-16 14:00:00', end_date_time: '2026-11-16 15:00:00' }, 'location and description');
assert.deepEqual(K.eventData({ ...f, allDay: true, endDate: '2026-11-17' }).data, { summary: 'Dentist', start_date: '2026-11-16', end_date: '2026-11-18' }, 'all-day: last day shown, HA end exclusive');
assert.deepEqual(K.eventData({ ...f, allDay: true, endDate: '2026-12-31' , startDate: '2026-12-31' }).data.end_date, '2027-01-01', 'over the year end');
assert.equal(K.eventData({ ...f, title: '  ' }).error, 'Bitte gib einen Titel ein.');
assert.equal(K.eventData({ ...f, endTime: '14:00' }).error, 'Das Ende muss nach dem Beginn liegen.', 'no empty event');
assert.equal(K.eventData({ ...f, endDate: '2026-11-15' }).error, 'Das Ende muss nach dem Beginn liegen.');
assert.equal(K.eventData({ ...f, allDay: true, endDate: '2026-11-15' }).error, 'Das Ende muss nach dem Beginn liegen.');
assert.equal(K.eventData({ ...f, startTime: '' }).error, 'Bitte gib Beginn und Ende an.');
assert.ok(K.eventData({ ...f, allDay: true, startTime: '' }).data, 'all-day needs no time');
console.log('ok calendar_add_event');
