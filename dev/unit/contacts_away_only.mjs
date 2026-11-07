// Issue #141: an alarm panel leaves bedroom windows out while someone is home (open for air) and watches them all
// when everyone is away. Casora's security badge called such a window "not secure" all evening.
// Settings › Doors and windows › "Counts only when nobody is home" (contacts.away_only). Expected: while the house is
// not away (securityAway) the window drops out of every group like a hidden one; with everyone gone or the alarm armed
// away it counts again; without any person or alarm panel nobody can tell, so it counts. Names made up.
//   node dev/unit/contacts_away_only.mjs
// @deckt: custom_components/casora/scripts/local/00-finder.js#contacts,casoraContacts,casoraHouseContacts
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
new Function(fs.readFileSync(new URL('../../custom_components/casora/scripts/local/00-finder.js', import.meta.url), 'utf8'))();

const st = (state, attrs) => ({ state, attributes: attrs || {} });
const WIN = 'binary_sensor.bedroom_window', DOOR = 'binary_sensor.front_door';
const base = () => ({ [WIN]: st('on', { device_class: 'window' }), [DOOR]: st('off', { device_class: 'door' }) });
const counted = (states) => window.casoraHouseContacts({ states, entities: {}, devices: {}, areas: {} }).sort();

window.CASORA_SETTINGS = { contacts: { away_only: [WIN] } };
const home = { ...base(), 'person.alex': st('home'), 'person.sam': st('not_home') };
assert.deepEqual(counted(home), [DOOR], 'someone home: the airing window does not count');
assert.deepEqual(counted({ ...base(), 'person.alex': st('not_home'), 'person.sam': st('work') }), [DOOR, WIN].sort(), 'all away: it counts');
assert.deepEqual(counted({ ...home, 'alarm_control_panel.house': st('armed_away') }), [DOOR, WIN].sort(), 'alarm armed away: it counts');
assert.deepEqual(counted({ ...home, 'alarm_control_panel.house': st('armed_home') }), [DOOR], 'alarm armed home: still left out');
assert.deepEqual(counted(base()), [DOOR, WIN].sort(), 'no person, no alarm: nobody can tell, it counts');

window.CASORA_SETTINGS = {};
assert.deepEqual(counted(home), [DOOR, WIN].sort(), 'without the setting: as before');
window.CASORA_SETTINGS = { contacts: { away_only: [WIN], hidden: [DOOR] } };
assert.deepEqual(counted(home), [], 'hidden and away-only together');
window.CASORA_SETTINGS = { contacts: { away_only: 'nonsense' } };
assert.deepEqual(counted(home), [DOOR, WIN].sort(), 'an odd value changes nothing');

// The card asks through its own states: it must read the persons, or it would not redraw when someone leaves.
window.CASORA_SETTINGS = { contacts: { away_only: [WIN] } };
const read = new Set();
const raw = { ...home };
const proxy = new Proxy(raw, { get: (t, k) => { read.add(k); return t[k]; } });
window.casoraContacts({ states: proxy, entities: {}, devices: {}, areas: {} });
assert.ok(read.has('person.alex') && read.has('person.sam'), 'persons read through the card');
console.log('ok contacts_away_only');
