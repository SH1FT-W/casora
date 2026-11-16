// @deckt: custom_components/casora/scripts/local/05-standard-medien.js#_casoraVent,V.comfort,V.read,V.sensorsOf,V.sec,custom_components/casora/scripts/local/01-basis.js#casoraComfortLevel,casoraComfortWord,casoraComfortBands
// #202 („Popup angleichen“): the room climate popup rated every room without an airing need „Gut“ – a bathroom at
// 33 % and a bedroom at 22 °C too – and „Zu feucht“ from 65 % in every room alike. Now a room row without an airing
// need says the word of its climate badges (room type, Studio values, the bathroom's hour above 70 %), „Zu feucht“
// follows the type, airing hints keep priority, an outdoor type has no word, and the house no longer claims
// „Raumluft gut“ while a room is off. Invented names and entities only.
//   node dev/unit/raumklima_popup_komfort.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const ROOT = new URL('../../', import.meta.url).pathname;
const read = (p) => fs.readFileSync(ROOT + p, 'utf8');
const noop = () => {};
let hass = null;
globalThis.window = globalThis;
globalThis.location = { pathname: '/casora/home' };
globalThis.document = { querySelector: (s) => (s === 'home-assistant' ? { hass } : null), addEventListener: noop,
  createElement: () => ({ style: {} }), querySelectorAll: () => [] };
globalThis.customElements = { whenDefined: () => new Promise(noop), get: () => null, define: noop };
globalThis.addEventListener = noop;
globalThis.setInterval = () => 0;
window._casoraLovelaceCfg = () => null;
window.casoraSvc = (n) => ({ domain: 'casora', service: n });
window._casoraUI = {
  group: (rows, title) => ({ group: title, rows }),
  hero: (o) => ({ hero: o }),
  stage: (kind, o) => ({ stage: kind, ...o }),
  v3: () => true,
  tokens: { ink: '#fff', ink2: '#eee', ink3: '#ddd', font: 'x' },
  _casoraLabelInside: true,
};
// The comfort functions of 01-basis.js (as comfort_room_types.mjs).
const basis = read('custom_components/casora/scripts/local/01-basis.js');
const a = basis.indexOf('window.casoraComfortLevel = function'), b = basis.indexOf('window.casoraComfortColor = function');
const c = basis.indexOf('window.casoraComfortWord = function'), e = basis.indexOf('\n};', c) + 3;
const avg = basis.slice(basis.indexOf('window.casoraAvgState = function'), a);
new Function(avg + basis.slice(a, b) + basis.slice(c, e))();
new Function(read('custom_components/casora/scripts/local/00-finder.js'))();
new Function(read('custom_components/casora/scripts/local/05-standard-medien.js'))();
const V = window._casoraVent;

const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
const room = (k, n, status, extra) => ({ k, n, status, grund: '', rh: 50, t: 21.5, co2: null, voc: null, ah: 9.5,
  fenster: null, offen_min: null, ziel_min: 20, heizt: false, co2_krit: false, ...(extra || {}) });
const sensor = (id, dc, v, changed) => ({ entity_id: id, state: String(v), last_changed: changed || ago(1),
  attributes: { device_class: dc, unit_of_measurement: dc === 'humidity' ? '%' : '°C', friendly_name: id } });
// casoraComfortHighSince keeps the start of a run per sensor while it stays above: one sensor per duration here.
const house = (rooms, bathMin) => {
  const hid = 'sensor.bad_eg_feuchte_' + bathMin;
  const states = {
    'sensor.casora_lueften': { entity_id: 'sensor.casora_lueften', state: 'ok', attributes: { rooms, aussen: { t: 8, rh: 85, ah: 7.1, pm25: 5 } } },
    [hid]: sensor(hid, 'humidity', 72, ago(bathMin)),
    'sensor.bad_eg_temperatur': sensor('sensor.bad_eg_temperatur', 'temperature', 23),
    'sensor.bad_og_feuchte': sensor('sensor.bad_og_feuchte', 'humidity', 33),
  };
  hass = { states, config: { unit_system: { temperature: '°C' } },
    entities: { [hid]: { area_id: 'bad_eg' }, 'sensor.bad_eg_temperatur': { device_id: 'd1' },
      'sensor.bad_og_feuchte': { area_id: 'bad_og' } },
    devices: { d1: { area_id: 'bad_eg' } }, areas: {} };
  return states;
};
const rowsOf = (states, here) => V.sec('rooms', states, { hide: [], scope: here === undefined ? null : here }).rows;
const byName = (rows) => Object.fromEntries(rows.map((r) => [r.label, [r.value, r.valueTone]]));
let n = 0;
const eq = (label, got, want) => { n++; assert.deepEqual(got, want, label); };

// ── The owner's picture: bathroom 33 % / 24 °C, bedroom 22 °C, bathroom 72 % for over an hour, living room fine,
//    kitchen with an airing hint ──
const five = [room('bad_og', 'Bad OG', 'ok', { rh: 33, t: 24 }), room('schlafzimmer', 'Schlafzimmer', 'ok', { rh: 50, t: 22 }),
  room('bad_eg', 'Bad EG', 'feucht', { rh: 72, t: 23, grund: 'Feuchte 72 % · draußen feuchter' }),
  room('wohnzimmer', 'Wohnzimmer', 'ok', { rh: 48, t: 21.5 }), room('kueche', 'Küche', 'jetzt', { co2: 1450, grund: 'CO₂ 1450 ppm' })];
let st = house(five, 70);
let rows = rowsOf(st);
eq('rows: words by room type, airing hint first', byName(rows), {
  'Küche': ['Jetzt lüften', 'warn'], 'Bad EG': ['Zu feucht', 'bad'], 'Bad OG': ['Etwas trocken', 'warn'],
  'Schlafzimmer': ['Warm', 'warn'], 'Wohnzimmer': ['Gut', null] });
eq('order: airing hint, too humid, off by comfort, fine last', rows.map((r) => r.label), ['Küche', 'Bad EG', 'Bad OG', 'Schlafzimmer', 'Wohnzimmer']);
eq('too humid keeps the backend reason', rows.find((r) => r.label === 'Bad EG').sub[0], 'Feuchte 72 % · draußen feuchter');
eq('airing hint: the house says to air', V.sec('stage', st, { hide: [] }).text, 'Lüften empfohlen');

// Bathroom at 72 % only for 5 minutes (a shower): orange „Etwas feucht“, no „Zu feucht“, no backend reason.
st = house(five, 5);
rows = rowsOf(st);
eq('fresh shower: „Etwas feucht“ in orange', byName(rows)['Bad EG'], ['Etwas feucht', 'warn']);
eq('fresh shower: status back to ok', V.read(st).rooms.find((x) => x.k === 'bad_eg').status, 'ok');
eq('fresh shower: the values instead of the reason', rows.find((r) => r.label === 'Bad EG').sub, ['72 % · 23,0 °C']);

// Without the airing hint: no blanket „Raumluft gut“ while rooms are off.
const quiet = five.filter((x) => x.k !== 'kueche');
st = house(quiet, 70);
let s7 = V.sec('stage', st, { hide: [] });
eq('no airing need, rooms off: „Lüften nicht nötig“', [s7.text, s7.tone], ['Lüften nicht nötig', 'warn']);
eq('dial: off rooms not ok, in their tone', s7.segs.map((x) => [x.label, x.ok, x.tone]),
  [['Bad EG', false, 'bad'], ['Bad OG', false, 'warn'], ['Schlafzimmer', false, 'warn'], ['Wohnzimmer', true, 'good']]);
eq('tile: nothing to air', V.tile(st, {}, null), 'Luft gut');
eq('level: no alert from comfort', V.level(st, {}, null), 0);
st = house([room('wohnzimmer', 'Wohnzimmer', 'ok', { rh: 48, t: 21.5 }), room('arbeitszimmer', 'Arbeitszimmer', 'ok', { rh: 45, t: 21 })], 70);
s7 = V.sec('stage', st, { hide: [] });
eq('all fine: „Raumluft gut“ as before', [s7.text, s7.tone], ['Raumluft gut', 'good']);

// Humidity by type: living room at 66 % (backend „feucht“ from 65 %) is only „Etwas feucht“, at 72 % „Zu feucht“.
st = house([room('wohnzimmer', 'Wohnzimmer', 'feucht', { rh: 66, grund: 'Feuchte 66 % · draußen feuchter' })], 70);
eq('living room 66 %: „Etwas feucht“', byName(rowsOf(st))['Wohnzimmer'], ['Etwas feucht', 'warn']);
st = house([room('wohnzimmer', 'Wohnzimmer', 'feucht', { rh: 72, grund: 'Feuchte 72 % · draußen feuchter' })], 70);
eq('living room 72 %: „Zu feucht“', byName(rowsOf(st))['Wohnzimmer'], ['Zu feucht', 'bad']);
// The Studio's values count: Wohnen humid only above 62 % → 64 % with backend „ok“ is „Zu feucht“.
window.CASORA_SETTINGS = { climate: { types: { wohnen: { hum_ideal_max: 55, hum_high: 62 } } } };
st = house([room('wohnzimmer', 'Wohnzimmer', 'ok', { rh: 64 })], 70);
eq('Studio values: 64 % above 62 → „Zu feucht“', byName(rowsOf(st))['Wohnzimmer'], ['Zu feucht', 'bad']);
eq('Studio values: a reason of its own', V.read(st).rooms[0].grund, 'Feuchte 64 %');
// A room set to Außen/unbeheizt: no rating, no word.
window.CASORA_SETTINGS = { climate: { rooms: { Wintergarten: 'aussen' } } };
st = house([room('wintergarten', 'Wintergarten', 'ok', { rh: 30, t: 12 })], 70);
eq('outdoor type: no word', byName(rowsOf(st))['Wintergarten'], [null, null]);
window.CASORA_SETTINGS = {};

// One room (room page): its own word on the stage and in the hero.
st = house(quiet, 70);
const sz = { key: 'schlafzimmer', name: 'Schlafzimmer' };
s7 = V.sec('stage', st, { hide: [], scope: sz });
eq('room page: the bedroom says „Warm“', [s7.text, s7.tone], ['Warm', 'warn']);
eq('room page hero: „Warm“', V.sec('hero', st, { hide: [], scope: sz }).hero.value, 'Warm');

// Without the comfort functions (older 01-basis): the backend's words as before.
const keep = window.casoraComfortLevel;
delete window.casoraComfortLevel;
st = house(five, 70);
eq('fallback: backend words', byName(rowsOf(st)), { 'Küche': ['Jetzt lüften', 'warn'], 'Bad EG': ['Zu feucht', 'bad'], 'Bad OG': ['Gut', null],
  'Schlafzimmer': ['Gut', null], 'Wohnzimmer': ['Gut', null] });
window.casoraComfortLevel = keep;

console.log(`raumklima_popup_komfort: ${n} checks ok`);
