// Pflanzenmonitor Plus: a plant is a status sensor (platform pflanzenmonitor_plus, translation_key status) instead of
// Plant Monitor's plant.*, with the same state (ok/problem) and attributes. Everywhere Casora knows a plant it has to
// know both alike: the shared helper (casora-core.js casoraIsPlant, Studio isPlantEntity), the bell (plant problems,
// CO2 of a plant's own sensor left out), the finder (bell sources, outdoor sensor not on a plant), the plant doctor
// in the popup (plant over the reading's device), the plant popup template (readings and limits of a Plus plant) and
// the Studio (plant tile picker, plant sensors, tile name, import suggestion). Plant Monitor stays as it was.
//   node dev/unit/plant_plus.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const noop = () => {};
const slice = (src, start, end) => {
  const a = src.indexOf(start);
  assert.ok(a >= 0, 'found: ' + start.slice(0, 50));
  const b = src.indexOf(end, a);
  assert.ok(b > a, 'end found after: ' + start.slice(0, 50));
  return src.slice(a, b + end.length);
};

// ── A made-up home ─────────────────────────────────────────────────────────────
const MIN = 60000;
const iso = (ms) => new Date(Date.now() - ms).toISOString();
const st = (id, state, a = {}) => ({ entity_id: id, state: String(state), last_changed: iso(40 * MIN), last_updated: iso(40 * MIN),
  attributes: { friendly_name: id.split('.')[1], ...a } });
const PLUS = 'pflanzenmonitor_plus';
const ent = (device_id, platform, translation_key, extra = {}) => ({ device_id, platform, translation_key, ...extra });
const LOW_WATER = [{ sensor_type: 'moisture', status: 'Low', current: '12', min: 20, max: 60 }];
const LOW_FOOD = [{ sensor_type: 'conductivity', status: 'Low', current: '80', min: 350, max: 2000 }];

const hass = {
  states: {
    // Plant Monitor
    'plant.farn': st('plant.farn', 'problem', { friendly_name: 'Farn', problems: LOW_WATER, moisture_status: 'Low' }),
    'sensor.farn_moisture': st('sensor.farn_moisture', 12, { device_class: 'moisture', unit_of_measurement: '%' }),
    'sensor.farn_temperature': st('sensor.farn_temperature', 21, { device_class: 'temperature' }),
    'sensor.farn_co2': st('sensor.farn_co2', 2100, { device_class: 'carbon_dioxide' }),
    'number.farn_max_soil_moisture': st('number.farn_max_soil_moisture', 60),
    'number.farn_min_soil_moisture': st('number.farn_min_soil_moisture', 20),
    // Pflanzenmonitor Plus (German entity names, as a new Plus plant gets them)
    'sensor.palme': st('sensor.palme', 'problem', { friendly_name: 'Palme', device_class: 'enum', problems: LOW_FOOD,
      conductivity_status: 'Low', moisture_status: 'ok', species: 'Palme' }),
    'sensor.palme_bodenfeuchtigkeit': st('sensor.palme_bodenfeuchtigkeit', 40, { device_class: 'moisture', unit_of_measurement: '%' }),
    'sensor.palme_temperatur': st('sensor.palme_temperatur', 22, { device_class: 'temperature' }),
    'sensor.palme_co2': st('sensor.palme_co2', 2100, { device_class: 'carbon_dioxide' }),
    'sensor.palme_giessen_in': st('sensor.palme_giessen_in', 3, { device_class: 'duration' }),
    'number.palme_max_bodenfeuchtigkeit': st('number.palme_max_bodenfeuchtigkeit', 70),
    'number.palme_min_bodenfeuchtigkeit': st('number.palme_min_bodenfeuchtigkeit', 25),
    'sensor.kaktus': st('sensor.kaktus', 'ok', { friendly_name: 'Kaktus', device_class: 'enum', problems: [] }),
    // A Plus plant called "Luxus": its soil moisture must not read as light.
    'sensor.luxus': st('sensor.luxus', 'ok', { device_class: 'enum', problems: [] }),
    'sensor.luxus_bodenfeuchtigkeit': st('sensor.luxus_bodenfeuchtigkeit', 33, { device_class: 'moisture' }),
    // Not plants
    'sensor.router_status': st('sensor.router_status', 'problem', { problems: LOW_WATER }),
    'sensor.buero_co2': st('sensor.buero_co2', 2100, { device_class: 'carbon_dioxide' }),
  },
  entities: {
    'plant.farn': ent('dev_farn', 'plant'),
    'sensor.farn_moisture': ent('dev_farn', 'plant'),
    'sensor.farn_temperature': ent('dev_farn', 'plant'),
    'sensor.farn_co2': ent('dev_farn', 'plant'),
    'number.farn_max_soil_moisture': ent('dev_farn', 'plant'),
    'number.farn_min_soil_moisture': ent('dev_farn', 'plant'),
    'sensor.palme': ent('dev_palme', PLUS, 'status'),
    'sensor.palme_bodenfeuchtigkeit': ent('dev_palme', PLUS, 'moisture'),
    'sensor.palme_temperatur': ent('dev_palme', PLUS, 'temperature'),
    'sensor.palme_co2': ent('dev_palme', PLUS, 'co2'),
    'sensor.palme_giessen_in': ent('dev_palme', PLUS, 'next_watering'),
    'number.palme_max_bodenfeuchtigkeit': ent('dev_palme', PLUS, 'max_moisture'),
    'number.palme_min_bodenfeuchtigkeit': ent('dev_palme', PLUS, 'min_moisture'),
    'sensor.kaktus': ent('dev_kaktus', PLUS, 'status'),
    'sensor.luxus': ent('dev_luxus', PLUS, 'status'),
    'sensor.luxus_bodenfeuchtigkeit': ent('dev_luxus', PLUS, 'moisture'),
    'sensor.router_status': ent('dev_router', 'router_x', 'status'),
    'sensor.buero_co2': ent('dev_buero', 'zigbee'),
  },
  devices: { dev_farn: { name: 'Farn' }, dev_palme: { name: 'Palme' }, dev_kaktus: { name: 'Kaktus' },
    dev_luxus: { name: 'Luxus' }, dev_router: { name: 'Router' }, dev_buero: { name: 'Büro' } },
  areas: {},
  callWS: () => Promise.resolve([]),
};

// ── Browser stand-ins ──────────────────────────────────────────────────────────
const store = {};
globalThis.window = globalThis;
Object.defineProperty(globalThis, 'localStorage', { configurable: true,
  value: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } } });
globalThis.document = {
  readyState: 'complete', hidden: false,
  querySelector: (q) => (q === 'home-assistant' ? { hass } : null),
  querySelectorAll: () => [], addEventListener: noop, removeEventListener: noop, getElementById: () => null,
  createElement: () => ({ style: {}, setAttribute: noop, appendChild: noop }), head: { appendChild: noop },
};
globalThis.addEventListener = noop;
globalThis.removeEventListener = noop;
globalThis.dispatchEvent = () => true;
globalThis.setInterval = () => 0;
globalThis.clearInterval = noop;
globalThis.customElements = { whenDefined: () => new Promise(noop), get: () => null };
globalThis.CustomEvent = class { constructor(n, o) { this.type = n; this.detail = o && o.detail; } };
window.casoraSecurityIcon = () => 'door-open';
window.CASORA_SETTINGS = { notify: {} };

const core = read('custom_components/casora/scripts/casora-core.js');
new Function(slice(core, '// Is this entity a plant?', '\n};\n'))();

// ── The helper ─────────────────────────────────────────────────────────────────
{
  const P = window.casoraIsPlant;
  assert.equal(typeof P, 'function', 'casoraIsPlant defined');
  assert.ok(P(hass, 'plant.farn'), 'plant.* is a plant');
  assert.ok(P(hass, 'sensor.palme'), 'Plus status sensor is a plant');
  assert.ok(P(null, 'sensor.palme'), 'without hass: the one on <home-assistant>');
  assert.ok(!P(hass, 'sensor.palme_bodenfeuchtigkeit'), 'Plus reading is no plant');
  assert.ok(!P(hass, 'number.palme_max_bodenfeuchtigkeit'), 'Plus limit is no plant');
  assert.ok(!P(hass, 'sensor.router_status'), 'translation_key status of another integration is no plant');
  assert.ok(!P({ states: hass.states }, 'sensor.palme'), 'no registry: a sensor is no plant');
  assert.ok(!P(hass, ''), 'empty id');
  console.log('ok plant_plus: helper');
}

// ── Bell (casora-core.js notify module) ────────────────────────────────────────
new Function(slice(core, '(function () {\n  if (window._casoraNotify) return;', '\n})();'))();
const finden = read('custom_components/casora/scripts/local/00-finder.js');
new Function(finden)();
window._casoraLocalLoaded = ['00-finder.js'];
{
  const N = window._casoraNotify;
  await N.refresh();
  const rows = N.rows;
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  const farn = byId['casora:plant:plant.farn'], palme = byId['casora:plant:sensor.palme'];
  assert.ok(farn, 'Plant Monitor plant with a problem: a row');
  assert.equal(farn.label, 'Farn braucht Wasser');
  assert.equal(farn.sub, 'Boden bei 12%');
  assert.ok(palme, 'Plus plant with a problem: a row');
  assert.equal(palme.label, 'Palme braucht Dünger');
  assert.equal(palme.entity, 'sensor.palme');
  assert.deepEqual(palme.opens, farn.opens, 'opens the same plant tile/popup');
  assert.ok(!byId['casora:plant:sensor.kaktus'], 'Plus plant that is ok: no row');
  assert.ok(!byId['casora:plant:sensor.router_status'], 'not a plant: no plant row');
  const co2 = rows.filter((r) => /^casora:co2:/.test(r.id)).map((r) => r.entity);
  assert.deepEqual(co2, ['sensor.buero_co2'], 'CO2: the room sensor, not the plants\' own (Plant Monitor and Plus)');
  console.log('ok plant_plus: bell');
}

// ── Finder (00-finder.js) ──────────────────────────────────────────────────────
{
  const src = window.casoraNotifySources(hass, {});
  const byId = Object.fromEntries(src.map((x) => [x.entity, x]));
  assert.deepEqual(byId['plant.farn'].kinds, ['plant'], 'Plant Monitor plant can report');
  assert.ok(byId['plant.farn'].active, 'Plant Monitor plant reports now');
  assert.deepEqual(byId['sensor.palme'].kinds, ['plant'], 'Plus plant can report, as a plant');
  assert.ok(byId['sensor.palme'].active, 'Plus plant reports now');
  assert.ok(byId['sensor.kaktus'] && !byId['sensor.kaktus'].active, 'Plus plant that is ok: listed, quiet');
  assert.ok(!byId['sensor.router_status'], 'not a plant: not listed');
  assert.ok(!byId['sensor.palme_co2'] && !byId['sensor.farn_co2'], 'a plant\'s own CO2 sensor is no source');
  assert.ok(byId['sensor.buero_co2'], 'room CO2 is a source');

  // Outdoor sensor: never one on a plant (an outdoor plant in the garden is no weather station).
  const garden = { garten: { name: 'Garten' } };
  const out = {
    states: {
      'plant.farn': hass.states['plant.farn'], 'sensor.olive': st('sensor.olive', 'ok', { device_class: 'enum' }),
      'sensor.farn_temperature': st('sensor.farn_temperature', 9, { device_class: 'temperature' }),
      'sensor.olive_temperatur': st('sensor.olive_temperatur', 8, { device_class: 'temperature' }),
      'sensor.station_temperatur': st('sensor.station_temperatur', 7, { device_class: 'temperature' }),
    },
    entities: {
      'plant.farn': ent('dev_farn', 'plant'), 'sensor.farn_temperature': ent('dev_farn', 'plant'),
      'sensor.olive': ent('dev_olive', PLUS, 'status'), 'sensor.olive_temperatur': ent('dev_olive', PLUS, 'temperature'),
      'sensor.station_temperatur': ent('dev_station', 'weather_x'),
    },
    devices: { dev_farn: { area_id: 'garten' }, dev_olive: { area_id: 'garten' }, dev_station: { area_id: 'garten' } },
    areas: garden,
  };
  assert.equal(window.casoraDevice.outdoor(out, 'temperature'), 'sensor.station_temperatur',
    'outdoor temperature: the station, not a plant\'s (Plant Monitor or Plus)');
  console.log('ok plant_plus: finder');
}

// ── Plant doctor in the popup (03-popups.js) ───────────────────────────────────
{
  const popups = read('custom_components/casora/scripts/local/03-popups.js');
  new Function(slice(popups, '(function () {\n  if (window._casoraPlantAi) return;', '\n})();'))();
  const PA = window._casoraPlantAi;
  assert.equal(typeof PA.plantOf, 'function', 'plantOf exposed');
  assert.equal(PA.plantOf(hass, 'sensor.farn_moisture'), 'plant.farn', 'Plant Monitor reading → plant.*');
  assert.equal(PA.plantOf(hass, 'sensor.palme_bodenfeuchtigkeit'), 'sensor.palme', 'Plus reading → Plus status sensor');
  assert.equal(PA.plantOf(hass, 'sensor.buero_co2'), null, 'reading without a plant');
  console.log('ok plant_plus: plant doctor');
}

// ── Plant popup template (readings and limits) ─────────────────────────────────
{
  const tpl = JSON.parse(read('dashboards/casora/button_card_templates.json'));
  const src = tpl.casora_popup_plant.tap_action.casora_popup.content;
  const parts = [
    slice(src, '  const _PLANT_DC = ', ';\n'),
    slice(src, '  const safeNum = (id) => {', '\n  };\n'),
    slice(src, '  const getSensorType = (eid) => {', '\n  };\n'),
    slice(src, '  const getThreshold = (type, dir) => {', '\n  };\n'),
  ].join('\n');
  const popup = (plant) => new Function('states', 'hass', 'plant', 'window',
    "const _plantName = plant ? plant.replace(/^[^.]+\\./, '') : '';\n" + parts + '\nreturn { getSensorType, getThreshold };')(
    hass.states, hass, plant, window);
  const pm = popup('plant.farn');
  assert.equal(pm.getSensorType('sensor.farn_moisture'), 'moisture');
  assert.equal(pm.getThreshold('moisture', 'max'), 60, 'Plant Monitor limit by name');
  assert.equal(pm.getThreshold('moisture', 'min'), 20);
  const plus = popup('sensor.palme');
  assert.equal(plus.getSensorType('sensor.palme_bodenfeuchtigkeit'), 'moisture');
  assert.equal(plus.getThreshold('moisture', 'max'), 70, 'Plus limit by translation_key (German name)');
  assert.equal(plus.getThreshold('moisture', 'min'), 25);
  assert.equal(plus.getThreshold('temperature', 'max'), null, 'no such limit');
  assert.equal(popup('sensor.luxus').getSensorType('sensor.luxus_bodenfeuchtigkeit'), 'moisture',
    'Plus plant "Luxus": soil moisture is not light');
  // A plant.* never reads a Plus limit of the same name stem.
  assert.equal(popup('plant.palme').getThreshold('moisture', 'max'), null, 'plant.* without its own limit: none');
  console.log('ok plant_plus: plant popup');
}

// ── Studio (casora-panel.js, casora-panel-import.js) ───────────────────────────
{
  let Panel = null;
  const stub = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : stub()), apply: () => stub(), construct: () => stub() });
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
  new Function(fix(read('custom_components/casora/panel/casora-panel-import.js')))();
  console.info = info;
  globalThis.document = doc;
  assert.ok(Panel, 'panel class');
  const P = Panel.prototype;
  const I = window.__casoraPanelInternals;
  assert.equal(typeof I.isPlantEntity, 'function', 'isPlantEntity exported');
  ['plant.farn', 'sensor.palme', 'sensor.kaktus'].forEach((id) => assert.ok(I.isPlantEntity(hass, id), 'plant: ' + id));
  ['sensor.palme_bodenfeuchtigkeit', 'sensor.router_status', 'number.palme_max_bodenfeuchtigkeit']
    .forEach((id) => assert.ok(!I.isPlantEntity(hass, id), 'no plant: ' + id));

  const p = Object.create(P);
  p._hass = hass;
  const plantType = I.TILE_TYPES.find((t) => t.id === 'plant');
  assert.deepEqual(plantType.domains, ['plant'], 'plant tile still asks for plants');
  const room = { path: 'living', name: 'Living', tiles: [], variables: {} };
  const choices = P._rankedEntityList.call(p, plantType.domains, plantType.classes, room, '');
  assert.deepEqual([...choices].sort(), ['plant.farn', 'sensor.kaktus', 'sensor.luxus', 'sensor.palme'],
    'plant tile picker: Plant Monitor and Plus plants, no readings');
  const sensors = P._entityList.call(p, ['sensor']);
  assert.equal(sensors.filter((e) => e === 'sensor.palme').length, 1, 'a sensor field lists the Plus plant once');

  assert.deepEqual(P._plantSensorsFor.call(p, 'plant.farn'), ['sensor.farn_moisture', 'sensor.farn_temperature'],
    'Plant Monitor: readings by entity id');
  assert.deepEqual(P._plantSensorsFor.call(p, 'sensor.palme'), ['sensor.palme_bodenfeuchtigkeit', 'sensor.palme_temperatur'],
    'Plus: readings by translation_key, not the plant itself or its learning sensors');
  assert.deepEqual(P._plantSensorsFor.call(p, 'sensor.luxus'), ['sensor.luxus_bodenfeuchtigkeit'], 'Plus "Luxus": moisture slot');

  const t1 = { name: 'Plant' }, t2 = { name: 'Plant' };
  P._fillTile.call(p, t1, plantType, 'plant.farn');
  P._fillTile.call(p, t2, plantType, 'sensor.palme');
  assert.equal(t1.name, 'Farn', 'new plant tile named like the plant (plant.*)');
  assert.equal(t2.name, 'Palme', 'new plant tile named like the plant (Plus)');

  const sug = (id) => (window.casoraLegacy.suggest({ entity: id, template: 'old_plant_card' }, hass)[0] || {}).type;
  assert.equal((sug('plant.farn') || {}).id, 'plant', 'import: plant.* → plant tile');
  assert.equal((sug('sensor.palme') || {}).id, 'plant', 'import: Plus plant → plant tile');
  assert.notEqual((sug('sensor.palme_bodenfeuchtigkeit') || {}).id, 'plant', 'import: a reading is no plant tile');
  console.log('ok plant_plus: Studio');
}

console.log('ok plant_plus');
