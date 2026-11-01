// #95: a VOC index sensor (0–500, no unit, no device_class, only state_class measurement; e.g. Amazon's air
// quality monitor via alexa_devices, Sensirion SGP40/41) was missing from the Studio's VOC picker ("Kein Treffer"):
// _entityList only took a sensor without device_class by its unit. Sensors without class and unit now count by their
// id/name (VOC, CO2, PM, CO) when the state is numeric. The badge and the climate popup read such a VOC sensor as an
// index (≤100 normal, ≤150 slightly raised, ≤250 raised, above bad) without "ppb". Invented entities.
//   node dev/unit/voc_index.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const noop = () => {};
const st = (state, attrs) => ({ state: String(state), attributes: attrs });
const states = {
  'sensor.testraum_monitor_voc_index': st(14.0, { state_class: 'measurement', friendly_name: 'Testraum Monitor VOC-Index' }),
  'sensor.testraum_luft_tvoc': st(120, { state_class: 'measurement', friendly_name: 'Testraum Luft' }),
  'sensor.testraum_voc_ppb': st(80, { device_class: 'volatile_organic_compounds_parts', unit_of_measurement: 'ppb', friendly_name: 'Testraum VOC' }),
  'sensor.testraum_monitor_co2': st(612, { state_class: 'measurement', friendly_name: 'Testraum Monitor CO2' }),
  'sensor.testraum_monitor_pm2_5': st(3, { state_class: 'measurement', friendly_name: 'Testraum Monitor PM2.5' }),
  'sensor.testraum_monitor_pm10': st(5, { state_class: 'measurement', friendly_name: 'Testraum Monitor PM10' }),
  'sensor.testraum_monitor_kohlenmonoxid': st(1, { state_class: 'measurement', friendly_name: 'Testraum Monitor Kohlenmonoxid' }),
  // Must stay out: a text state, a humidity sensor whose Dutch name contains "voc", a sensor with a foreign unit.
  'sensor.testraum_voc_status': st('good', { friendly_name: 'Testraum VOC Status' }),
  'sensor.testraum_vochtigheid': st(50, { state_class: 'measurement', friendly_name: 'Testraum Vochtigheid' }),
  'sensor.testraum_voc_temperatur': st(21, { unit_of_measurement: '°C', friendly_name: 'Testraum VOC Temperatur' }),
  'sensor.testraum_cobalt': st(3, { state_class: 'measurement', friendly_name: 'Testraum Cobalt' }),
};

// ── Studio picker (casora-panel.js _entityList) ──
{
  let Panel = null;
  const stub = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : stub()), apply: () => stub(), construct: () => stub() });
  globalThis.window = globalThis;
  globalThis.location = { pathname: '/' };
  globalThis.matchMedia = (q) => ({ matches: /reduced-motion/.test(q), addEventListener: noop });
  globalThis.setTimeout = () => 0;
  globalThis.requestAnimationFrame = () => 0;
  globalThis.fetch = () => Promise.reject(new Error('offline'));
  globalThis.HTMLElement = class {};
  globalThis.innerWidth = 1400;
  globalThis.innerHeight = 900;
  globalThis.customElements = { get: () => Panel, define: (n, c) => { Panel = c; }, whenDefined: () => new Promise(noop) };
  const fix = (s) => s.replace(/import\.meta\.url/g, '"http://x/casora-panel.js?v=0"');
  const info = console.info;
  console.info = noop;
  const doc = globalThis.document;
  globalThis.document = stub();
  new Function(fix(read('custom_components/casora/panel/casora-panel-types.js')))();
  new Function(fix(read('custom_components/casora/panel/casora-panel.js')))();
  console.info = info;
  globalThis.document = doc;
  assert.ok(Panel, 'panel class');
  const P = Panel.prototype;
  const climate = window.__casoraPanelInternals.SECTIONS.find((s) => s.bid === 'climate');
  const field = (key) => climate.fields.find((f) => f.key === key);
  const p = Object.create(P);
  p._hass = { states, entities: {}, devices: {}, areas: {} };
  const list = (key) => P._entityList.call(p, field(key).domains, field(key).classes, field(key).accept);

  assert.deepEqual(list('aqi_entity_voc'), ['sensor.testraum_luft_tvoc', 'sensor.testraum_monitor_voc_index', 'sensor.testraum_voc_ppb'],
    'VOC picker: the index without unit/class, a TVOC by its id, the ppb sensor; no text, humidity or °C sensor');
  assert.deepEqual(list('aqi_entity_co2'), ['sensor.testraum_monitor_co2'], 'CO2 picker: by name without unit/class');
  assert.deepEqual(list('aqi_entity_pm25'), ['sensor.testraum_monitor_pm2_5'], 'PM2.5 picker');
  assert.deepEqual(list('aqi_entity_pm10'), ['sensor.testraum_monitor_pm10'], 'PM10 picker: not PM2.5');
  assert.deepEqual(list('aqi_entity_co'), ['sensor.testraum_monitor_kohlenmonoxid'], 'CO picker: not CO2, not "cobalt"');
  assert.ok(list('quality_sensor').includes('sensor.testraum_monitor_voc_index'), 'air quality field takes the VOC index too');
  assert.ok(!list('aqi_entity_temp').includes('sensor.testraum_monitor_voc_index'), 'temperature field unchanged');
}

// ── Badge word (casora_badge_air_quality name) ──
const T = JSON.parse(read('dashboards/casora/button_card_templates.json'));
const badgeName = T.casora_badge_air_quality.name.replace(/^\s*\[\[\[|\]\]\]\s*$/g, '');
const badgeWord = (sensors) => new Function('entity', 'states', 'hass', 'variables', 'window', badgeName)(
  { state: 'good', attributes: {} }, states, { formatEntityState: (e) => e.state }, { sensors }, {}).match(/badge-sub">([^<]*)</)[1];
assert.equal(badgeWord(['sensor.testraum_monitor_voc_index']), 'Ausgezeichnet', 'VOC index 14 is normal, not "Sehr schlecht"');
states['sensor.testraum_monitor_voc_index'].state = '200';
assert.equal(badgeWord(['sensor.testraum_monitor_voc_index']), 'Schlecht', 'VOC index 200: raised');
states['sensor.testraum_monitor_voc_index'].state = '320';
assert.equal(badgeWord(['sensor.testraum_monitor_voc_index']), 'Sehr schlecht', 'VOC index 320: high');
assert.equal(badgeWord(['sensor.testraum_voc_ppb']), 'Ausgezeichnet', 'ppb sensor keeps its ppb limits');
states['sensor.testraum_monitor_voc_index'].state = '14';

// ── Climate popup (casora_climate_popup): the air quality stage with the VOC index deciding ──
{
  const body = T.casora_climate_popup.tap_action.casora_popup.content.replace(/^\s*\[\[\[|\]\]\]\s*$/g, '');
  const seen = [];
  const UI = { soft: () => true, v3: () => true, esc: String,
    stage: (t, o) => { seen.push([t, o]); return '<stage ' + t + '>'; }, line: (m, r) => m + (r.length ? ' · ' + r.join(' · ') : ''),
    hero: () => '<hero>', group: (rows, l) => l + ':' + rows.map((r) => r.entity).join(','), label: (t) => '<l>' + t, legend: () => '', more: () => '', note: () => '' };
  const win = { _casoraUI: UI, casoraLocale: () => 'de-DE', _casoraHH: { layout: (o) => o } };
  { const b = read('custom_components/casora/scripts/local/01-basis.js');
    const a = b.indexOf('window.casoraComfortLevel = function'), e = b.indexOf('window.casoraComfortColor = function');
    const w = b.indexOf('window.casoraComfortWord = function'), we = b.indexOf('\n};', w) + 3;
    new Function('window', b.slice(a, e) + b.slice(w, we))(win); }
  const all = { ...states, 'sensor.qa_aq': st('good', {}) };
  const vars = { entity_quality: 'sensor.qa_aq', sensors: ['sensor.testraum_monitor_voc_index'], room_name: 'Testraum' };
  const run = () => { seen.length = 0;
    new Function('entity', 'states', 'hass', 'variables', 'window', body)({ entity_id: 'sensor.qa_aq', ...all['sensor.qa_aq'] }, all, { language: 'de' }, vars, win);
    return seen[seen.length - 1][1]; };
  let s = run();
  assert.equal(s.text, 'Ausgezeichnet', 'popup: VOC index 14 is excellent');
  assert.equal(s.value, '14');
  assert.ok(!/ppb|index/i.test(s.unit || ''), 'popup: no "ppb"/"index" unit on an index, got ' + JSON.stringify(s.unit));
  all['sensor.testraum_monitor_voc_index'] = st(320, states['sensor.testraum_monitor_voc_index'].attributes);
  s = run();
  assert.equal(s.text, 'Sehr schlecht', 'popup: VOC index 320 is high');
}

console.log('voc_index: ok');
