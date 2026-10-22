// Studio phone preview, start page: single people badges (issue #41).
//   node dev/unit/phone_preview_people.mjs
// Reported: with "Separate people badges" or only one person, the People badge was missing from the
// phone preview. _miniModel gives single people the ids people:0 …, and the phone row only let
// PHONE_FILTERS ids through. Now they pass like on the real phone (casora_mobile_filter_badges, #40)
// and open the person popup there instead of filtering. Climate stays one filter badge on the phone.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');

const start = src.indexOf('\n  _miniModel(room, opts) {');
assert.ok(start > 0, '_miniModel not found');
const end = src.indexOf('\n  }\n', start);
const body = src.slice(start, end + 4).replace('_miniModel(room, opts) {', 'function _miniModel(room, opts) {');
const stubs = 'const numText = (n, d) => Number(n).toFixed(d); const trLabel = (s) => s; '
  + 'const wattText = (w) => w + " W"; const studioIcon = (s) => s;';
globalThis.window = globalThis;
const miniModel = new Function(stubs + body + '\nreturn _miniModel;')();

// The phone start row's filter, as casora-panel.js has it.
const PHONE_FILTERS = new Function(/^const PHONE_FILTERS = [^;]*;/m.exec(src)[0] + '\nreturn PHONE_FILTERS;')();
const rowAt = src.indexOf('const bcard = cardOf("casora_mobile_filter_badges");');
const row = src.slice(rowAt, src.indexOf('model.forEach', rowAt));
const bidLine = /const bidOf = [^;]*;/.exec(row);
assert.ok(bidLine, 'phone start row: bidOf');
const bidOf = new Function(bidLine[0] + '\nreturn bidOf;')();
assert.ok(row.includes('.filter((b) => PHONE_FILTERS.indexOf(bidOf(b.id)) !== -1)'), 'phone start row filters by the badge kind');

const states = {
  'person.example_a': { state: 'not_home', attributes: { friendly_name: 'Person A' } },
  'person.example_b': { state: 'home', attributes: { friendly_name: 'Person B' } },
  'sensor.example_temp': { state: '21', attributes: { friendly_name: 'Temp', unit_of_measurement: '°C', device_class: 'temperature' } },
  'sensor.example_humidity': { state: '45', attributes: { friendly_name: 'Humidity', unit_of_measurement: '%', device_class: 'humidity' } },
};
const ctx = { _hass: { states, config: { unit_system: { temperature: '°C' } } }, _sceneCatalog: () => [] };
const phone = (V) => miniModel.call(ctx, { variables: V }, { phone: true, place: 'home' })
  .filter((b) => PHONE_FILTERS.indexOf(bidOf(b.id)) !== -1).map((b) => b.id);
const people = (ids) => ids.filter((id) => bidOf(id) === 'people');

const one = { presence_entity_1: 'person.example_a' };
const two = { ...one, presence_entity_2: 'person.example_b' };
assert.deepEqual(people(phone(one)), ['people:0'], 'one person: own badge, not dropped');
assert.deepEqual(people(phone({ ...two, show_people_inline: true })), ['people:0', 'people:1'], 'separate people badges');
assert.deepEqual(people(phone(two)), ['people'], 'two people: one filter badge');
assert.deepEqual(people(phone({ ...one, show_people: false })), [], 'hidden');

// Climate: the real phone row has no single climate badges, so the preview keeps the filter badge.
const clim = { temp_sensor_1: 'sensor.example_temp', humidity_sensor: 'sensor.example_humidity', show_climate_inline: true };
assert.deepEqual(phone(clim).filter((id) => bidOf(id) === 'climate'), ['climate'], 'phone: climate stays one badge');
assert.ok(miniModel.call(ctx, { variables: clim }, { place: 'room' }).some((b) => /^climate:/.test(b.id)),
  'desktop and phone room page: climate inline as before');

// Soft look: the picture fills the same circle as a glyph's ring (casora_badge_base img_cell).
// Reported after 26.10.51: the person badge in the phone preview was smaller than its neighbours.
const sizeOf = (sel) => {
  const m = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\{[^}]*?width:([^;]+);').exec(src);
  assert.ok(m, sel + ' not found');
  return m[1].trim();
};
assert.equal(sizeOf('.card.map.soft .ppic'), sizeOf('.card.map.soft .pring'), 'soft look: picture as large as the ring');

// Soft look on the phone: the theme's mobile badge sizes (theme_weich.yaml), not the dark look's.
// Reported after 26.10.51: phone preview pills 52 px high with a 42 px circle instead of 40 and 28.
const weich = fs.readFileSync(new URL('../../custom_components/casora/theme_weich.yaml', import.meta.url), 'utf8');
const tok = (name) => parseFloat(new RegExp('^\\s*' + name + ':\\s*([\\d.]+)px', 'm').exec(weich)[1]);
const phoneSoft = /\.card\.map\.soft \.miniphone \.mp-badges \.pbadge \{([^}]*)\}/.exec(src);
assert.ok(phoneSoft, 'soft phone badge sizes');
const px = (v) => parseFloat(new RegExp('--' + v + ':([\\d.]+)px').exec(phoneSoft[1])[1]);
assert.ok(sizeOf('.card.map.soft .pring').includes('var(--bgl) * 1.75'), 'ring is --bgl × 1.75');
assert.equal(px('bgl') * 1.75, tok('badge-icon-size-mobile'), 'phone: circle as the theme');
assert.equal(px('bmh'), tok('badge-min-height-mobile'), 'phone: pill height as the theme');
assert.equal(px('bl'), tok('badge-font-size-mobile'), 'phone: title size as the theme');

console.log('ok phone_preview_people');
