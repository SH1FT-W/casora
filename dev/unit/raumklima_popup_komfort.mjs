// @deckt: custom_components/casora/scripts/local/05-standard-medien.js#_casoraVent,V.comfort,V.read,V.sensorsOf,V.sec,V.outSeries,V.chartCfg,custom_components/casora/scripts/local/01-basis.js#casoraComfortLevel,casoraComfortWord,casoraComfortBands
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
const rowsOf2 = (states, C) => V.sec('rooms', states, C, hass).rows;
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
  'Schlafzimmer': ['Warm', 'warn'], 'Wohnzimmer': ['Optimal', null] });
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

// ── Verlauf: the room's sensors with its type's comfort range, 24 h from the history, 7/30 days from the statistics ──
window._hpPlantCfg = {};
window._hpPlantMeta = {};
window._casoraUI.segments = (items) => ({ segs: items });
st = house(five, 70);
const bad = V.read(st).rooms.find((x) => x.k === 'bad_eg');
const ser = V.series(bad, hass);
eq('series: temperature orange, humidity blue, the bathroom range', ser.map((x) => [x.entity, x.name, x.guides]),
  [['sensor.bad_eg_temperatur', 'Temperatur', [21, 24]], ['sensor.bad_eg_feuchte_70', 'Luftfeuchtigkeit', [40, 65]]]);
eq('series: theme colours', ser.map((x) => /--casora-color-(orange|blue)/.exec(x.color)[1]), ['orange', 'blue']);
eq('series: a room with a humidity sensor only: one line', V.series(V.read(st).rooms.find((x) => x.k === 'bad_og'), hass).map((x) => x.name), ['Luftfeuchtigkeit']);
eq('series: a room without sensors in its area: none', V.series(V.read(st).rooms.find((x) => x.k === 'wohnzimmer'), hass), []);
eq('chart config per range', ['24h', '7d', '30d'].map((sp) => { const c = V.chartCfg(ser, sp); return [c.kind, c.source, c.bucket, c.readout, c.series[1].guides]; }),
  [['line', 'history', '15min', 'own', [40, 65]], ['line', 'stats', '6h', 'own', [40, 65]], ['line', 'stats', '1d', 'own', [40, 65]]]);
const C = { hide: [], scope: null, chart: true };
eq('rows: rooms with sensors pick the chart, the first one lit', rowsOf2(st, C).map((r) => [r.label, r.entity || null, r.selected]),
  [['Küche', null, false], ['Bad EG', 'bad_eg', true], ['Bad OG', 'bad_og', false], ['Schlafzimmer', null, false], ['Wohnzimmer', null, false]]);
V.SEL.room = 'nichts'; V.SEL.span = '7d';
eq('unknown pick: the first room with sensors', V.sec('chart', st, C, hass).includes('Verlauf · Bad EG'), true);
eq('the chart is registered for the room and range', window._hpPlantCfg[V.chartKey('bad_eg', '7d')].source, 'stats');

// ── #235: an outdoor room (the garden's page) showed the stage only – no Verlauf, no lowest/highest. Now the house's
//    outdoor sensors and every temperature sensor of the room's own HA area are charted. ──
const outHouse = (aussen, extra) => {
  const ids = { 'sensor.wetter_aussen_temperatur': ['temperature', 1.9], 'sensor.wetter_aussen_feuchte': ['humidity', 94], ...(extra || {}) };
  const states = { 'sensor.casora_lueften': { entity_id: 'sensor.casora_lueften', state: 'ok', attributes: { rooms: [], aussen } } };
  const entities = {};
  for (const [id, [dc, v, area]] of Object.entries(ids)) { states[id] = sensor(id, dc, v); entities[id] = area ? { area_id: area } : {}; }
  hass = { states, config: { unit_system: { temperature: '°C' } }, entities, devices: {},
    areas: { garten: { area_id: 'garten', name: 'Garten' }, hof: { area_id: 'hof', name: 'Hof' } } };
  return states;
};
const AUS = { t: 1.9, rh: 94, ah: 5.2, pm25: null, t_id: 'sensor.wetter_aussen_temperatur', rh_id: 'sensor.wetter_aussen_feuchte' };
const hof = { key: 'hof', name: 'Hof', outdoor: true }, garten = { key: 'garten', name: 'Garten', outdoor: true };
// No sensor of its own: the house's outdoor sensors, temperature and humidity like a room.
st = outHouse(AUS);
V.SEL.span = '24h';
eq('outdoor: the house sensors behind the stage', V.outSeries(hof, AUS, hass).map((x) => [x.entity, x.name]),
  [['sensor.wetter_aussen_temperatur', 'Temperatur'], ['sensor.wetter_aussen_feuchte', 'Luftfeuchtigkeit']]);
eq('outdoor: temperature and humidity keep the switch', V.chartCfg(V.outSeries(hof, AUS, hass), '24h').switch, undefined);
let oc = V.sec('chart', st, { hide: [], scope: hof, chart: true }, hass);
eq('outdoor: a Verlauf with the range switch', [typeof oc === 'string' && oc.includes('Verlauf'), oc.includes('hp-chart-slot')], [true, true]);
eq('outdoor: the chart is registered', window._hpPlantCfg[V.chartKey('out:hof', '24h')].series.map((x) => x.entity),
  ['sensor.wetter_aussen_temperatur', 'sensor.wetter_aussen_feuchte']);
// A garden with sensors of its own (outdoor-named ones too): every temperature in one chart with a legend.
st = outHouse(AUS, { 'sensor.garten_temperatur': ['temperature', 2.4, 'garten'], 'sensor.beet_temperatur': ['temperature', 3.1, 'garten'],
  'sensor.garten_feuchte': ['humidity', 90, 'garten'] });
let os = V.outSeries(garten, AUS, hass);
eq('garden: the house sensor and both of its own', os.map((x) => [x.entity, x.name]), [['sensor.wetter_aussen_temperatur', 'sensor.wetter_aussen_temperatur'],
  ['sensor.beet_temperatur', 'sensor.beet_temperatur'], ['sensor.garten_temperatur', 'sensor.garten_temperatur']]);
eq('garden: one chart with a legend', V.chartCfg(os, '7d').switch, false);
eq('garden: four distinct colours at most', new Set(os.map((x) => x.color)).size, 3);
// Sensors picked by hand on the tile (Studio „More outdoor sensors“): before the area's, each once, four at most.
st = outHouse(AUS, { 'sensor.garten_temperatur': ['temperature', 2.4, 'garten'], 'sensor.teich_temperatur': ['temperature', 4, null],
  'sensor.teich_feuchte': ['humidity', 80, null] });
eq('by hand: house, picked, area', V.outSeries(garten, AUS, hass, ['sensor.teich_temperatur', 'sensor.garten_temperatur', 'sensor.fehlt', 7]).map((x) => x.entity),
  ['sensor.wetter_aussen_temperatur', 'sensor.teich_temperatur', 'sensor.garten_temperatur']);
eq('by hand, a room without an area of its own', V.outSeries(hof, AUS, hass, ['sensor.teich_temperatur']).map((x) => x.entity),
  ['sensor.wetter_aussen_temperatur', 'sensor.teich_temperatur']);
eq('by hand: a humidity sensor stands in when the house has none', V.outSeries(hof, { t: 1.9, t_id: 'sensor.wetter_aussen_temperatur' }, hass, ['sensor.teich_feuchte']).map((x) => [x.entity, x.name]),
  [['sensor.wetter_aussen_temperatur', 'Temperatur'], ['sensor.teich_feuchte', 'Luftfeuchtigkeit']]);
window._hpPlantCfg = {};
V.sec('chart', st, { hide: [], scope: hof, chart: true, extra: ['sensor.teich_temperatur'] }, hass);
eq('by hand: the popup\'s chart takes them', window._hpPlantCfg[V.chartKey('out:hof', '24h')].series.map((x) => x.entity), ['sensor.wetter_aussen_temperatur', 'sensor.teich_temperatur']);
// The tile hands its list to the popup's sections; the Studio offers the field on the room climate tile.
const src05 = read('custom_components/casora/scripts/local/05-standard-medien.js');
eq('popup: variables.outdoor_sensors travel as C.extra', /variables\.outdoor_sensors[\s\S]{0,160}C\.extra = xs/.test(src05), true);
eq('Studio: the field on the room climate tile', /id: "casora_vent"[\s\S]{0,300}key: "outdoor_sensors", type: "list"[\s\S]{0,120}classes: \["temperature"\]/.test(read('custom_components/casora/panel/casora-panel-types.js')), true);
// A backend that names no sensors (before the restart) and a garden with its own sensor: that one.
st = outHouse({ t: 1.9, rh: 94 }, { 'sensor.garten_temperatur': ['temperature', 2.4, 'garten'] });
eq('older backend: the garden\'s own sensor', V.outSeries(garten, { t: 1.9, rh: 94 }, hass).map((x) => x.entity), ['sensor.garten_temperatur']);
eq('older backend, no own sensor: no chart', V.sec('chart', st, { hide: [], scope: hof, chart: true }, hass), '');
// Lowest and highest of the range, per temperature sensor.
st = outHouse(AUS, { 'sensor.garten_temperatur': ['temperature', 2.4, 'garten'] });
const asked = [];
window._casoraChartCard = { stats: (h, id, span) => { asked.push(id + '|' + span); return id.includes('garten') ? null : { min: { v: -1.2, t: 1 }, max: { v: 8.4, t: 2 } }; },
  fmt: (h, id, v) => v + ' °C', at: () => 'wann' };
let mm = V.sec('minmax', st, { hide: [], scope: garten, chart: true }, hass);
eq('min/max: highest and lowest with sensor and time', mm.rows.map((r) => [r.label, r.value, r.sub]),
  [['Höchster Wert', '8.4 °C', ['sensor.wetter_aussen_temperatur', 'wann']], ['Tiefster Wert', '-1.2 °C', ['sensor.wetter_aussen_temperatur', 'wann']]]);
eq('min/max: titled by the range, asked per temperature sensor', [mm.group, asked], ['Letzte 24 Std.', ['sensor.wetter_aussen_temperatur|24h', 'sensor.garten_temperatur|24h']]);
window._casoraChartCard.stats = () => null;
eq('min/max: loading', V.sec('minmax', st, { hide: [], scope: garten }, hass).rows[0].label, 'Wird geladen …');
eq('min/max: only outdoors', V.sec('minmax', house(five, 70), { hide: [], scope: null }, hass), '');

console.log(`raumklima_popup_komfort: ${n} checks ok`);
