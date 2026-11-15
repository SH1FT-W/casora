// @deckt: custom_components/casora/scripts/local/01-basis.js#casoraComfortLevel,casoraComfortWord,casoraComfortBands,casoraComfortType,casoraComfortAutoType,casoraComfortOf,casoraComfortHighSince,custom_components/casora/panel/casora-panel-personal.js,custom_components/casora/settings.py
// #202: comfort rating by room type (01-basis.js): the defaults table, level and word per type on both sides of
// every limit, the room name matcher (German and English, umlauts), outdoor without a rating, the bathroom's
// duration rule, the Studio's values over the defaults, Home rating each room by its own type, and the settings
// section storing only what changed. The standard scale stays as it was (comfort_level.mjs unchanged).
// Invented names and entities only.
//   node dev/unit/comfort_room_types.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const ROOT = new URL('../../', import.meta.url).pathname;
const src = fs.readFileSync(ROOT + 'custom_components/casora/scripts/local/01-basis.js', 'utf8');
const a = src.indexOf('window.casoraComfortLevel = function'), b = src.indexOf('window.casoraComfortColor = function');
const c = src.indexOf('window.casoraComfortWord = function'), e = src.indexOf('\n};', c) + 3;
const avg = src.slice(src.indexOf('window.casoraAvgState = function'), a);
const w = {};
new Function('window', avg + src.slice(a, b) + src.slice(c, e))(w);
const L = w.casoraComfortLevel, W = w.casoraComfortWord, T = w.casoraComfortTable;

// The table: every type of the Studio, outdoor without bands, standard = the scale before #202.
assert.deepEqual(w.casoraComfortTypes, ['wohnen', 'schlafen', 'bad', 'kueche', 'nebenraum', 'keller', 'aussen', 'standard']);
assert.equal(T.aussen, null, 'outdoor: no bands');
assert.deepEqual(T.standard, { temp_ideal_min: 19, temp_ideal_max: 24, temp_low: 17, temp_high: 26, hum_ideal_min: 40, hum_ideal_max: 60, hum_low: 30, hum_high: 70 });
const pick = (t, ...k) => k.map((f) => T[t][f]);
assert.deepEqual(pick('wohnen', 'temp_ideal_min', 'temp_ideal_max', 'temp_low', 'temp_high'), [20, 23, 17, 26]);
assert.deepEqual(pick('schlafen', 'temp_ideal_min', 'temp_ideal_max', 'temp_low', 'temp_high'), [17, 20, 16, 26]);
assert.deepEqual(pick('bad', 'temp_ideal_min', 'temp_ideal_max', 'temp_low', 'hum_ideal_max', 'hum_high', 'hum_soft_high', 'hum_sustain'), [21, 24, 18, 65, 70, 75, 60]);
assert.deepEqual(pick('kueche', 'temp_ideal_min', 'temp_ideal_max', 'hum_ideal_max', 'hum_sustain'), [19, 22, 60, 60]);
assert.deepEqual(pick('nebenraum', 'temp_ideal_min', 'temp_ideal_max', 'temp_low'), [16, 21, 15]);
assert.deepEqual(pick('keller', 'temp_ideal_min', 'temp_ideal_max', 'temp_low', 'temp_soft_low', 'hum_ideal_min', 'hum_ideal_max', 'hum_high'), [10, 18, 3, 8, 45, 60, 70]);
for (const t of w.casoraComfortTypes.filter((x) => T[x])) for (const f of w.casoraComfortFields) assert.ok(Number.isFinite(T[t][f]), t + ' ' + f);

// Level and word per type at its limits, both sides (°C, % rH). [value, level, word].
const temp = (type, rows) => rows.forEach(([v, lv, word]) => {
  assert.equal(L('temp', v, '°C', { type }), lv, `${type} ${v} °C level`);
  assert.equal(W('temp', v, '°C', { type }), word, `${type} ${v} °C word`);
});
const hum = (type, rows, ctx) => rows.forEach(([v, lv, word]) => {
  assert.equal(L('humidity', v, '', { type, ...ctx }), lv, `${type} ${v} % level`);
  assert.equal(W('humidity', v, '', { type, ...ctx }), word, `${type} ${v} % word`);
});
temp('standard', [[16.9, 2, 'Kalt'], [17, 1, 'Kühl'], [18.9, 1, 'Kühl'], [19, 0, 'Angenehm'], [24, 0, 'Angenehm'], [24.1, 1, 'Warm'], [26, 1, 'Warm'], [26.1, 2, 'Heiß']]);
temp('wohnen', [[16.9, 2, 'Kalt'], [17, 1, 'Kühl'], [19.9, 1, 'Kühl'], [20, 0, 'Angenehm'], [21, 0, 'Angenehm'], [23, 0, 'Angenehm'], [23.1, 1, 'Warm'], [26, 1, 'Warm'], [26.1, 2, 'Heiß']]);
temp('schlafen', [[15.9, 2, 'Kalt'], [16, 1, 'Kühl'], [16.9, 1, 'Kühl'], [17, 0, 'Angenehm'], [20, 0, 'Angenehm'], [20.1, 1, 'Warm'], [21, 1, 'Warm'], [26, 1, 'Warm'], [26.1, 2, 'Heiß']]);
temp('bad', [[17.9, 2, 'Kalt'], [18, 1, 'Kühl'], [20.9, 1, 'Kühl'], [21, 0, 'Angenehm'], [24, 0, 'Angenehm'], [24.1, 1, 'Warm'], [26.1, 2, 'Heiß']]);
temp('kueche', [[16.9, 2, 'Kalt'], [18.9, 1, 'Kühl'], [19, 0, 'Angenehm'], [22, 0, 'Angenehm'], [22.1, 1, 'Warm'], [26.1, 2, 'Heiß']]);
temp('nebenraum', [[14.9, 2, 'Kalt'], [15, 1, 'Kühl'], [16, 0, 'Angenehm'], [21, 0, 'Angenehm'], [21.1, 1, 'Warm'], [26.1, 2, 'Heiß']]);
// Cellar: orange „Kalt“ below 8, red only below 3 (frost); warm above 18 orange.
temp('keller', [[2.9, 2, 'Kalt'], [3, 1, 'Kalt'], [7.9, 1, 'Kalt'], [8, 1, 'Kühl'], [10, 0, 'Angenehm'], [18, 0, 'Angenehm'], [18.1, 1, 'Warm'], [22.5, 1, 'Warm'], [26.1, 2, 'Heiß']]);
hum('standard', [[29.9, 2, 'Sehr trocken'], [30, 1, 'Etwas trocken'], [40, 0, 'Gut'], [60, 0, 'Gut'], [60.1, 1, 'Etwas feucht'], [70, 1, 'Etwas feucht'], [70.1, 2, 'Sehr feucht']]);
hum('wohnen', [[29.9, 2, 'Sehr trocken'], [39.9, 1, 'Etwas trocken'], [40, 0, 'Gut'], [60, 0, 'Gut'], [65, 1, 'Etwas feucht'], [70.1, 2, 'Sehr feucht']]);
hum('schlafen', [[29.9, 2, 'Sehr trocken'], [60.1, 1, 'Etwas feucht'], [70.1, 2, 'Sehr feucht']]);
hum('nebenraum', [[29.9, 2, 'Sehr trocken'], [45, 0, 'Gut'], [70.1, 2, 'Sehr feucht']]);
// Cellar: dry is orange only, above 60 orange, above 70 red (mould).
hum('keller', [[10, 1, 'Etwas trocken'], [44.9, 1, 'Etwas trocken'], [45, 0, 'Gut'], [60, 0, 'Gut'], [60.1, 1, 'Etwas feucht'], [68, 1, 'Etwas feucht'], [70, 1, 'Etwas feucht'], [70.1, 2, 'Sehr feucht']]);
// Bathroom: up to 65 good; above that orange, above 75 „Feucht“; above 70 red only after an hour.
const now = Date.now(), fresh = { since: now - 5 * 60000 }, long = { since: now - 61 * 60000 };
hum('bad', [[29.9, 2, 'Sehr trocken'], [40, 0, 'Gut'], [65, 0, 'Gut'], [65.1, 1, 'Etwas feucht'], [70, 1, 'Etwas feucht'], [72, 1, 'Etwas feucht'], [75.1, 1, 'Feucht'], [95, 1, 'Feucht']], fresh);
hum('bad', [[70, 1, 'Etwas feucht'], [70.1, 2, 'Sehr feucht'], [95, 2, 'Sehr feucht']], long);
assert.equal(L('humidity', 80, '', { type: 'bad', since: now - 59 * 60000 }), 1, 'bathroom: 59 minutes above is still orange');
assert.equal(L('humidity', 80, '', { type: 'bad' }), 1, 'bathroom: unknown duration stays orange');
hum('kueche', [[60, 0, 'Gut'], [60.1, 1, 'Etwas feucht'], [76, 1, 'Feucht']], fresh);
hum('kueche', [[76, 2, 'Sehr feucht']], long);
// Fahrenheit: converted before the type's limits (21 °C = 69.8 °F).
assert.equal(W('temp', 69.8, '°F', { type: 'schlafen' }), 'Warm', '°F bedroom');
assert.equal(W('temp', 69.8, '°F', { type: 'wohnen' }), 'Angenehm', '°F living');

// Outdoor: no level, no word (the value stands plain), for temperature and humidity.
for (const v of [-10, 0, 21, 40]) assert.equal(L('temp', v, '°C', { type: 'aussen' }), null, 'outdoor ' + v);
assert.equal(W('humidity', 95, '', 'Garten'), null, 'outdoor by name, no word');
// No room at all: the standard scale, as before.
assert.equal(W('temp', 21, '°C'), 'Angenehm');
assert.equal(W('temp', 18, '°C', null), 'Kühl');

// The room name matcher: German and English, any case, umlauts and ß, first rule wins.
const M = w.casoraComfortAutoType;
const expect = {
  schlafen: ['Schlafzimmer', 'SCHLAFZIMMER', 'Elternschlafzimmer', 'Kinderschlafzimmer', 'Bedroom', 'Master Bedroom', 'guest bedroom'],
  bad: ['Bad', 'Badezimmer', 'Gästebad', 'Bad OG', 'Bathroom', 'Guest bathroom', 'Dusche', 'Duschbad', 'Shower room'],
  nebenraum: ['WC', 'Gäste-WC', 'Gäste WC', 'Toilette', 'Toilet', 'Flur', 'Flur OG', 'Diele', 'Treppenhaus', 'Abstellraum', 'Abstellkammer',
    'Hauswirtschaftsraum', 'HWR', 'Waschküche', 'Hallway', 'Hall', 'Storage room', 'Vorratskammer', 'Eingang', 'Ankleide', 'Laundry'],
  kueche: ['Küche', 'KÜCHE', 'Kueche', 'Wohnküche', 'Kitchen'],
  keller: ['Keller', 'Kellerraum', 'Lager', 'Lagerraum', 'Basement', 'Cellar'],
  aussen: ['Garten', 'Balkon', 'Terrasse', 'Dachterrasse', 'Garage', 'Carport', 'Außen', 'Außenbereich', 'aussen', 'Draußen', 'Outdoor',
    'Garden', 'Patio', 'Balcony', 'Terrace', 'Gartenhaus'],
  wohnen: ['Wohnzimmer', 'Wohnen', 'Esszimmer', 'Essbereich', 'Wohn-/Essbereich', 'Arbeitszimmer', 'Büro', 'BÜRO', 'Buero', 'Office',
    'Kinderzimmer', 'Living room', 'Dining room', 'Kids room', 'Study', 'Gästezimmer', 'Guest room', 'Spielzimmer'],
  standard: ['', 'Zuhause', 'Home', 'Studio', 'Erdgeschoss', 'Raum 1', 'Kesselraum', null, undefined],
};
for (const [type, names] of Object.entries(expect)) for (const n of names) assert.equal(M(n), type, `„${n}“ → ${type}`);
// The HA area's icon when the name says nothing.
assert.equal(M('Raum 1', 'mdi:bed-king'), 'schlafen');
assert.equal(M('Raum 2', 'mdi:shower'), 'bad');
assert.equal(M('Raum 3', 'mdi:sofa'), 'wohnen');
assert.equal(M('Raum 4', 'mdi:flower'), 'aussen');
assert.equal(M('Raum 5', 'mdi:toilet'), 'nebenraum');
assert.equal(M('Schlafzimmer', 'mdi:sofa'), 'schlafen', 'the name wins over the icon');

// The room's type: the Studio's choice (any case), else the name, else the sensor's HA area (its own or its device's).
const hass = {
  states: {
    'sensor.qa_t_a': { entity_id: 'sensor.qa_t_a', state: '21', attributes: { unit_of_measurement: '°C' } },
    'sensor.qa_t_b': { entity_id: 'sensor.qa_t_b', state: '21', attributes: { unit_of_measurement: '°C' } },
    'sensor.qa_t_c': { entity_id: 'sensor.qa_t_c', state: '5', attributes: { unit_of_measurement: '°C' } },
    'sensor.qa_h_k': { entity_id: 'sensor.qa_h_k', state: '68', attributes: { unit_of_measurement: '%' } },
  },
  entities: { 'sensor.qa_t_a': { area_id: 'wz' }, 'sensor.qa_t_b': { device_id: 'dev_b' }, 'sensor.qa_t_c': { area_id: 'gt' }, 'sensor.qa_h_k': { area_id: 'kl' } },
  devices: { dev_b: { area_id: 'sz' } },
  areas: { wz: { name: 'Wohnzimmer' }, sz: { name: 'Schlafzimmer' }, gt: { name: 'Garten' }, kl: { name: 'Raum K', icon: 'mdi:wine' } },
};
const Ty = w.casoraComfortType;
assert.equal(Ty('Schlafzimmer'), 'schlafen');
assert.equal(Ty({ room: 'Studio', entity: 'sensor.qa_t_b', hass }), 'schlafen', 'room without a type → device area');
assert.equal(Ty({ room: 'Studio', entity: 'sensor.qa_t_a', hass }), 'wohnen', 'room without a type → own area');
assert.equal(Ty({ room: 'Küche', entity: 'sensor.qa_t_b', hass }), 'kueche', 'the room name wins over the area');
w.CASORA_SETTINGS = { climate: { rooms: { 'studio': 'keller', 'Wohnzimmer': 'schlafen', 'Kaputt': 'quatsch' } } };
assert.equal(Ty('Studio'), 'keller', 'Studio choice, case-insensitive');
assert.equal(Ty({ room: 'Raum X', entity: 'sensor.qa_t_a', hass }), 'schlafen', 'Studio choice for the HA area');
assert.equal(Ty('Kaputt'), 'standard', 'unknown stored type is ignored');
// The Studio's values over the defaults (only these fields, numbers only); the rest stays the default.
w.CASORA_SETTINGS = { climate: { types: { schlafen: { temp_ideal_max: 21.5, temp_low: 'x', hum_high: '' } } } };
const B = w.casoraComfortBands({ type: 'schlafen' });
assert.equal(B.temp_ideal_max, 21.5); assert.equal(B.temp_low, 16); assert.equal(B.hum_high, 70);
assert.equal(W('temp', 21, '°C', 'Schlafzimmer'), 'Angenehm', 'own ideal up to 21.5');
assert.equal(W('temp', 21, '°C', 'Wohnzimmer'), 'Angenehm');
w.CASORA_SETTINGS = {};
assert.equal(W('temp', 21, '°C', 'Schlafzimmer'), 'Warm', 'bedroom at 21 °C is warm');

// A badge's rating (casoraComfortOf): the room's type rates the room's (averaged) reading …
const Of = w.casoraComfortOf;
const ent = (id) => hass.states[id];
assert.deepEqual(Of('temp', hass, ent('sensor.qa_t_a'), { room_name: 'Schlafzimmer' }), { level: 1, word: 'Warm', type: 'schlafen', none: false });
assert.deepEqual(Of('temp', hass, ent('sensor.qa_t_a'), { room_name: 'Wohnzimmer' }), { level: 0, word: 'Angenehm', type: 'wohnen', none: false });
assert.deepEqual(Of('humidity', hass, ent('sensor.qa_h_k'), { room_name: 'Keller' }), { level: 1, word: 'Etwas feucht', type: 'keller', none: false });
assert.deepEqual(Of('humidity', hass, ent('sensor.qa_h_k'), { room_name: 'Raum K' }), { level: 1, word: 'Etwas feucht', type: 'keller', none: false }, 'cellar by the area icon');
assert.deepEqual(Of('temp', hass, ent('sensor.qa_t_c'), { room_name: 'Terrasse' }), { level: null, word: null, type: 'aussen', none: true });
// … Home (several sensors in different areas) rates each by its own area's type and shows the worst, outdoor left out.
assert.deepEqual(Of('temp', hass, ent('sensor.qa_t_a'), { room_name: 'Zuhause', avg_sensors: ['sensor.qa_t_a', 'sensor.qa_t_b', 'sensor.qa_t_c'] }),
  { level: 1, word: 'Warm', type: 'schlafen', none: false }, 'Home: the bedroom at 21 °C decides, the garden is left out');
assert.deepEqual(Of('temp', hass, ent('sensor.qa_t_c'), { room_name: 'Zuhause', avg_sensors: ['sensor.qa_t_c', 'sensor.qa_t_c'] }),
  { level: null, word: null, type: 'aussen', none: true }, 'one sensor twice is one reading');
// Sensors without any type: the average on the standard scale, exactly as before.
const plain = { states: { 'sensor.qa_1': { entity_id: 'sensor.qa_1', state: '16', attributes: {} }, 'sensor.qa_2': { entity_id: 'sensor.qa_2', state: '22', attributes: {} } } };
assert.deepEqual(Of('temp', plain, plain.states['sensor.qa_1'], { room_name: 'Zuhause', avg_sensors: ['sensor.qa_1', 'sensor.qa_2'] }),
  { level: 0, word: 'Angenehm', type: 'standard', none: false }, 'average 19 °C, standard');

// The bathroom's start of „above the limit“: last_changed at the latest, then the history moves it back.
{
  const calls = [];
  let reply;
  const h2 = { states: {}, callApi: (m, p) => { calls.push(p); return new Promise((r) => { reply = r; }); } };
  const st = { entity_id: 'sensor.qa_bad_h', state: '80', last_changed: new Date(now - 2 * 60000).toISOString() };
  const ctx = { type: 'bad', entity: 'sensor.qa_bad_h', hass: h2, state: st };
  assert.equal(L('humidity', 80, '', ctx), 1, 'fresh: orange');
  assert.equal(calls.length, 1, 'one history look back');
  assert.match(calls[0], /^history\/period\/.+filter_entity_id=sensor\.qa_bad_h.+minimal_response/);
  reply([[{ state: '60', last_changed: new Date(now - 85 * 60000).toISOString() }, { state: '78', last_changed: new Date(now - 70 * 60000).toISOString() },
    { state: '80', last_changed: st.last_changed }]]);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(L('humidity', 80, '', ctx), 2, 'above 70 for 70 minutes: red');
  assert.equal(calls.length, 1, 'no second query');
  assert.equal(L('humidity', 50, '', { ...ctx, state: { ...st, state: '50' } }), 0, 'back below');
  assert.equal(L('humidity', 80, '', ctx), 1, 'above again: a new run, orange');
}

// Settings: the section is known to the integration; the Studio keeps only what differs.
const py = fs.readFileSync(ROOT + 'custom_components/casora/settings.py', 'utf8');
assert.match(py, /SECTIONS = \([^)]*"climate"/, 'settings.py stores the climate section');
const personal = fs.readFileSync(ROOT + 'custom_components/casora/panel/casora-panel-personal.js', 'utf8');
const pw = {};
new Function('window', 'customElements', personal)(pw, { whenDefined: () => ({ then() {} }), get: () => null });
const { normalize, prune } = pw.casoraPersonal;
const S = normalize({});
assert.deepEqual(S.climate, { rooms: {}, types: {} }, 'normalized shape');
assert.equal(prune(S).climate, undefined, 'nothing set: nothing stored');
S.climate.rooms.Schlafzimmer = 'schlafen';
S.climate.types.keller = { temp_high: 24 };
S.climate.types.bad = {};
assert.deepEqual(prune(S).climate, { rooms: { Schlafzimmer: 'schlafen' }, types: { keller: { temp_high: 24 } } }, 'only the changes');
// The Studio group: a draft (no save call), a select per room, numbers that drop a value equal to the default.
assert.ok(/if \(want\("climate"\)\)/.test(personal), 'climate group');
assert.ok(/if \(!isFinite\(n\) \|\| n === D\[f\]\) delete own\(\)\[f\]; else own\(\)\[f\] = n;/.test(personal), 'default values are not stored');
const block = personal.slice(personal.indexOf('if (want("climate"))'), personal.indexOf('if (want("battery"))'));
assert.ok(!/callWS|settings\/set|_csSave/.test(block), 'no direct save: a draft until „Einstellungen speichern“');
console.log('comfort_room_types: ok');
