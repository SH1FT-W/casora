// The device finders and the Studio's new-tile search on a big house (synthetic: 3000 entities, 600 devices, door
// contacts on devices named like fridges and freezers, no fridge integration, no lawn mower). Bug report 25.10.2026:
// choosing the fridge tile froze the Studio – TILE_MAIN_FIND.casora_fridge ran casoraFridgeFind.all (every device,
// each scanning every entity) once per candidate entity, minutes on a house with a few hundred devices.
// Bounds are generous (a slow CI machine passes, the old quadratic search does not).
//   node dev/unit/finder_performance.mjs
import assert from 'node:assert/strict';
import { loadPanel } from './lib/testhaus.mjs';

const { P, I } = await loadPanel();
window.casoraCommunityOn = new Set(I.TILE_TYPES.filter((t) => t.community).map((t) => t.id));

// ── Synthetic house ──────────────────────────────────────────────────────────────
const AREAS = ['kitchen', 'living', 'bedroom', 'office', 'bath', 'hall', 'garden', 'cellar', 'garage', 'kids'];
function bigHouse({ fridge = false } = {}) {
  const entities = {}, states = {}, devices = {}, areas = {};
  AREAS.forEach((a) => { areas[a] = { area_id: a, name: a[0].toUpperCase() + a.slice(1) }; });
  const add = (dev, domain, obj, attrs, extra) => {
    const id = domain + '.' + obj;
    entities[id] = Object.assign({ entity_id: id, device_id: dev, platform: 'zha', translation_key: null }, extra || {});
    states[id] = { entity_id: id, state: 'unknown', attributes: Object.assign({ friendly_name: obj.replace(/_/g, ' ') }, attrs || {}) };
  };
  // Kinds of device, 5 entities each on average (600 devices → 3000 entities).
  const KINDS = [
    (d, n) => { add(d, 'light', n, {}); add(d, 'sensor', n + '_power', { device_class: 'power', unit_of_measurement: 'W' }); add(d, 'switch', n + '_led', {}, { entity_category: 'config' }); add(d, 'sensor', n + '_rssi', { device_class: 'signal_strength' }, { entity_category: 'diagnostic' }); add(d, 'update', n + '_fw', {}, { entity_category: 'config' }); },
    (d, n) => { add(d, 'sensor', n + '_temperature', { device_class: 'temperature', unit_of_measurement: '°C' }); add(d, 'sensor', n + '_humidity', { device_class: 'humidity', unit_of_measurement: '%' }); add(d, 'sensor', n + '_battery', { device_class: 'battery', unit_of_measurement: '%' }, { entity_category: 'diagnostic' }); add(d, 'sensor', n + '_pressure', { device_class: 'pressure' }); add(d, 'sensor', n + '_lqi', {}, { entity_category: 'diagnostic' }); },
    (d, n) => { add(d, 'switch', n, {}); add(d, 'sensor', n + '_power', { device_class: 'power', unit_of_measurement: 'W' }); add(d, 'sensor', n + '_energy', { device_class: 'energy', unit_of_measurement: 'kWh', state_class: 'total_increasing' }); add(d, 'sensor', n + '_voltage', { device_class: 'voltage' }); add(d, 'button', n + '_identify', {}, { entity_category: 'config' }); },
    (d, n) => { add(d, 'binary_sensor', n + '_contact', { device_class: 'door' }); add(d, 'sensor', n + '_battery', { device_class: 'battery', unit_of_measurement: '%' }, { entity_category: 'diagnostic' }); add(d, 'binary_sensor', n + '_tamper', { device_class: 'tamper' }, { entity_category: 'diagnostic' }); add(d, 'sensor', n + '_rssi', {}, { entity_category: 'diagnostic' }); add(d, 'sensor', n + '_lqi', {}, { entity_category: 'diagnostic' }); },
    (d, n) => { add(d, 'cover', n, {}); add(d, 'climate', n + '_thermostat', {}); add(d, 'media_player', n + '_speaker', {}); add(d, 'camera', n + '_cam', {}); add(d, 'binary_sensor', n + '_motion', { device_class: 'motion' }); },
  ];
  // Door contacts named like fridges and freezers (no temperature: a door alone is no fridge).
  const FRIDGE_NAMES = ['Türkontakt Gefrierschrank', 'Kühlschranktür', 'Freezer door', 'Tiefkühltruhe Kontakt', 'Fridge contact'];
  for (let i = 0; i < 600; i++) {
    const dev = 'dev' + i, n = 'device_' + i;
    const kind = i < FRIDGE_NAMES.length ? 3 : i % KINDS.length;
    devices[dev] = { id: dev, name: i < FRIDGE_NAMES.length ? FRIDGE_NAMES[i] : 'Device ' + i, area_id: AREAS[i % AREAS.length],
      manufacturer: 'Maker ' + (i % 7), model: 'Model ' + (i % 13) };
    KINDS[kind](dev, n);
  }
  if (fridge) {
    // A generic fridge (a thermometer on a device named like one) – the only fridge in the house.
    devices.fridge1 = { id: 'fridge1', name: 'Kühlschrank Küche', area_id: 'kitchen' };
    add('fridge1', 'sensor', 'fridge_inside_temperature', { device_class: 'temperature', unit_of_measurement: '°C' });
    add('fridge1', 'binary_sensor', 'fridge_inside_door', { device_class: 'door' });
  }
  return { entities, states, devices, areas, language: 'de', locale: { language: 'de' }, config: {}, themes: {}, user: { is_admin: true } };
}

const time = (fn) => { const s = performance.now(); const r = fn(); return [r, performance.now() - s]; };
const LIMIT = 1500; // ms per call – the old fridge search took minutes here
const slow = [];
const check = (label, fn) => {
  const [r, ms] = time(fn);
  if (ms > LIMIT) slow.push(`${label}: ${ms.toFixed(0)} ms`);
  return r;
};

// ── 1) No fridge in the house: every finder returns cleanly, quickly ────────────
const hass = bigHouse();
assert.ok(Object.keys(hass.entities).length >= 3000 && Object.keys(hass.devices).length >= 600, 'big house');
const fridges = check('casoraFridgeFind.all', () => window.casoraFridgeFind.all(hass));
assert.deepEqual(fridges, [], 'door contacts named like a fridge are no fridge');
check('casoraLaundryFind.all', () => window.casoraLaundryFind.all(hass));
check('casoraLaundryFind.dishwashers', () => window.casoraLaundryFind.dishwashers(hass));
check('casoraVelairFind.climates', () => window.casoraVelairFind.climates(hass));
check('coffeeAnchors', () => window.__casoraCoffeeAnchors(hass));
check('casoraDevice.entities (every device)', () => Object.keys(hass.devices).forEach((d) => {
  const first = window.casoraDeviceEntities(hass.entities, d)[0];
  if (first) window.casoraDevice.entities(hass, first);
}));

const rooms = [{ path: 'home', name: 'Home', tiles: [], variables: {} }]
  .concat(AREAS.map((a) => ({ path: a, name: hass.areas[a].name, tiles: [], variables: {} })));
const panel = (h) => { const p = Object.create(P); p._hass = h; p._state = { compact: { rooms } }; p._room = 0; return p; };
const p = panel(hass);
const types = I.TILE_TYPES.filter((t) => !t.hidden);
for (const t of types) {
  for (const room of [rooms[0], rooms[1]]) {
    check(`_tileCandidates ${t.id} (${room.path})`, () => P._tileCandidates.call(p, t, room));
  }
}
const fridgeType = types.find((t) => t.id === 'casora_fridge');
const mowerType = types.find((t) => t.id === 'casora_lawn_mower');
assert.deepEqual(P._tileCandidates.call(p, fridgeType, rooms[0]), [], 'no fridge: nothing suggested');
assert.deepEqual(P._tileCandidates.call(p, mowerType, rooms[0]), [], 'no mower: nothing suggested');
// The "Add a tile" menu in a room with an area asks every type at once.
const [, menuMs] = time(() => types.forEach((t) => P._tileCandidates.call(p, t, rooms[1])));
if (menuMs > 3 * LIMIT) slow.push(`menu (all types): ${menuMs.toFixed(0)} ms`);
check('_uxDevices', () => p._uxDevices());
check('casoraAssist.suggest', () => window.casoraAssist.suggest(hass, rooms.map((r) => ({ name: r.name, tiles: [] })), types));
assert.deepEqual(slow, [], 'too slow on a big house:\n  ' + slow.join('\n  '));

// ── 2) One fridge: found through the per-search anchor list, also after the registry changed ──
const withFridge = bigHouse({ fridge: true });
const pf = panel(withFridge);
let cands = P._tileCandidates.call(pf, fridgeType, rooms[0]);
assert.deepEqual(cands.map((c) => c.id), ['sensor.fridge_inside_temperature'], 'the one fridge is suggested');
assert.ok(cands[0].sure, 'as a sure match');
// HA hands over a new registry object after a change: the caches follow it.
delete withFridge.entities['sensor.fridge_inside_temperature'];
withFridge.entities = { ...withFridge.entities };
withFridge.states = { ...withFridge.states };
delete withFridge.states['sensor.fridge_inside_temperature'];
cands = P._tileCandidates.call(pf, fridgeType, rooms[0]);
assert.deepEqual(cands, [], 'fridge gone from the registry: no longer suggested');

console.log(`finder_performance: ok (${Object.keys(hass.entities).length} entities, ${Object.keys(hass.devices).length} devices, ${types.length} tile types, menu ${menuMs.toFixed(0)} ms)`);
