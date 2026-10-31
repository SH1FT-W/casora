// Studio "Add a tile" (test 2, G3): E03 tile types and waste are found by everyday words ("Abfall", "Müll",
// "Bioabfall", "Diagramm"); E15/T14 scenes are scenes, not "Entity with buttons", and are not offered as new devices;
// same names get the device; E05 the waste tile asks for its calendar first and its optional sensor lists only
// waste sensors; E06 the preview shows the waste text without an entity; E30 "Entity list" reads "Geräteliste";
// T12 a new chart asks no random sensors and takes the sensor's name.
//   node dev/unit/studio_add_find.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const noop = () => {};
let Panel = null;
const stub = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : stub()), apply: () => stub(), construct: () => stub() });
globalThis.window = globalThis;
globalThis.location = { pathname: '/' };
globalThis.matchMedia = (q) => ({ matches: /reduced-motion/.test(q), addEventListener: noop });
globalThis.addEventListener = noop;
globalThis.removeEventListener = noop;
globalThis.setTimeout = () => 0;
globalThis.requestAnimationFrame = () => 0;
globalThis.fetch = () => Promise.reject(new Error('offline'));
globalThis.HTMLElement = class {};
globalThis.innerWidth = 1400;
globalThis.innerHeight = 900;
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => null, setItem: noop, removeItem: noop }, configurable: true });
globalThis.customElements = { get: () => Panel, define: (n, c) => { Panel = c; }, whenDefined: () => new Promise(noop) };
const fix = (s) => s.replace(/import\.meta\.url/g, '"http://x/casora-panel.js?v=0"');
const info = console.info;
console.info = noop;
globalThis.document = stub();
new Function(fix(read('custom_components/casora/panel/casora-panel-types.js')))();
new Function(fix(read('custom_components/casora/panel/casora-panel.js')))();
globalThis.customElements.whenDefined = () => Promise.resolve();
new Function(fix(read('custom_components/casora/panel/casora-panel-b-ux.js')))();
await new Promise((r) => setImmediate(r));
console.info = info;
const P = Panel.prototype;
const I = window.__casoraPanelInternals;
const U = window.__casoraStudioUx;
const type = (id) => I.TILE_TYPES.find((t) => t.id === id);

// ── A made-up house with a waste schedule, scenes and two coffee machines ─────
const st = (id, state, a) => ({ entity_id: id, state, attributes: { friendly_name: id, ...a } });
const BIO = 'sensor.bin_organic', REST = 'sensor.bin_residual', CAL = 'calendar.waste_schedule', OTHER_CAL = 'calendar.family';
const PWR = 'sensor.tv_power', SCENE = 'scene.bath_ambient', LIGHT = 'light.bath';
const S1 = 'switch.machine_one_power', S2 = 'switch.machine_two_power';
const states = {
  [BIO]: st(BIO, '2', { friendly_name: 'Bioabfall', daysTo: 2 }),
  [REST]: st(REST, '9', { friendly_name: 'Restabfall' }),
  [CAL]: st(CAL, 'off', { friendly_name: 'Abfuhrkalender' }),
  [OTHER_CAL]: st(OTHER_CAL, 'off', { friendly_name: 'Family' }),
  [PWR]: st(PWR, '50', { friendly_name: 'TV Power', unit_of_measurement: 'W', device_class: 'power', state_class: 'measurement' }),
  [SCENE]: st(SCENE, 'unknown', { friendly_name: 'Ambient bath' }),
  [LIGHT]: st(LIGHT, 'off', { friendly_name: 'Bath light' }),
  'sensor.raw_cfg': st('sensor.raw_cfg', "{'enable_max_voltage': 'DISABLE'}", { friendly_name: 'Plug config' }),
  [S1]: st(S1, 'ready', { friendly_name: 'Operation state' }),
  [S2]: st(S2, 'ready', { friendly_name: 'Operation state' }),
};
const entities = {
  [BIO]: { entity_id: BIO, platform: 'waste_collection_schedule' },
  [REST]: { entity_id: REST, platform: 'waste_collection_schedule' },
  [CAL]: { entity_id: CAL, platform: 'waste_collection_schedule' },
  [SCENE]: { entity_id: SCENE, platform: 'homeassistant', area_id: 'bath' },
  [LIGHT]: { entity_id: LIGHT, platform: 'hue', area_id: 'bath' },
  [S1]: { entity_id: S1, device_id: 'c1', platform: 'x', name: 'Operation state' },
  [S2]: { entity_id: S2, device_id: 'c2', platform: 'x', name: 'Operation state' },
};
const devices = { c1: { id: 'c1', name: 'Kitchen machine' }, c2: { id: 'c2', name: 'Office machine' } };
const hass = { states, entities, devices, areas: { bath: { area_id: 'bath', name: 'Bath' } }, language: 'de' };
const rooms = [{ path: 'home', name: 'Home', tiles: [], variables: {} }, { path: 'bath', name: 'Bath', tiles: [], variables: {} }];
const panel = () => {
  const p = Object.create(P);
  p._hass = hass;
  p._state = { compact: { rooms } };
  p._room = 1;
  return p;
};

// ── E03: tile types by everyday words ───────────────────────────────────────
{
  const types = I.TILE_TYPES.filter((t) => !t.hidden);
  const first = (q) => (U.rankTypes(types, q, 4)[0] || {}).id;
  assert.equal(first('Abfall'), 'casora_trash', '"Abfall" finds the waste tile type');
  assert.equal(first('Müll'), 'casora_trash', '"Müll" finds the waste tile type');
  assert.equal(first('mülltonne'), 'casora_trash');
  assert.equal(first('Diagramm'), 'casora_chart', '"Diagramm" finds the chart tile type');
  assert.deepEqual(U.rankTypes(types, 'xyzzy', 4), [], 'nothing for nonsense');
  // The waste collection itself is an entry of the device list, found by its bins' names.
  const list = panel()._uxDevices();
  const waste = list.find((c) => c.type === 'casora_trash');
  assert.ok(waste && waste.waste && waste.fresh && waste.suggested, 'waste collection offered');
  assert.equal(waste.roomIndex, 0, 'on Home');
  assert.equal(U.rankDevices(list, 'Bioabfall', 5)[0], waste, '"Bioabfall" finds it');
  assert.equal(U.rankDevices(list, 'Müll', 5)[0], waste, '"Müll" finds it');
  // Once a waste tile exists, it is not offered again.
  const p2 = panel();
  p2._state = { compact: { rooms: [{ ...rooms[0], tiles: [{ type: 'custom:button-card', template: 'casora_trash' }] }, rooms[1]] } };
  assert.ok(!p2._uxDevices().some((c) => c.type === 'casora_trash'), 'no second waste entry');
  console.log('ok add: types and waste found');
}

// ── E15/T14: scenes and twins ────────────────────────────────────────────────
{
  const list = panel()._uxDevices();
  const sc = list.find((c) => c.entity === SCENE);
  assert.ok(sc && sc.scene, 'scene listed (findable)');
  assert.notEqual(sc.kind, 'Entity with buttons', 'scene is not "Entity with buttons"');
  assert.equal(sc.kind, 'Scene', 'scene kind');
  const fresh = U.newInRoom(list, 1, 6);
  assert.ok(!fresh.shown.concat(fresh.rest).some((c) => c.scene), 'scenes are no new devices of the room');
  assert.ok(fresh.shown.some((c) => c.entity === LIGHT), 'the light is');
  const twins = list.filter((c) => c.name === 'Operation state');
  assert.deepEqual(twins.map((c) => c.dev).sort(), ['Kitchen machine', 'Office machine'], 'device names to tell twins apart');
  console.log('ok add: scenes and twins');
}

// ── E05: waste tile fields ───────────────────────────────────────────────────
{
  const t = type('casora_trash');
  assert.ok(t.entityAdvanced && t.ownData, 'optional sensor under More');
  assert.equal(t.fields[0].key, 'trash_calendar', 'calendar is the first field');
  const p = panel();
  const sensors = P._rankedEntityList.call(p, t.domains, t.classes, rooms[1], '', t.accept);
  assert.deepEqual([...sensors].sort(), [BIO, REST].sort(), 'only waste sensors, no power or raw config sensor');
  const cals = P._entityList.call(p, ['calendar'], null, 'waste_calendar');
  assert.equal(cals[0], CAL, 'waste calendar first');
  assert.ok(cals.includes(OTHER_CAL), 'other calendars still selectable');
  assert.deepEqual(P._tileCandidates.call(p, t, rooms[0]), [], 'a new waste tile asks for no device');
  console.log('ok add: waste fields');
}

// ── E06: preview text of a waste tile without an entity ──────────────────────
{
  const templates = JSON.parse(read('dashboards/casora/button_card_templates.json'));
  globalThis.DOMParser = class { parseFromString(t) { return { body: { textContent: t, querySelectorAll: () => [] } }; } };
  window.casoraDevice = { waste: () => ({ bins: [{ label: 'Bio' }], calendar: null, days: 2, next: { label: 'Bio' } }) };
  const txt = window.casoraTileState({ type: 'custom:button-card', template: 'casora_trash', entity: '' }, null, hass, templates);
  assert.equal(txt, '2 Tage · Bio', 'same text as the dashboard, not "Automatic"');
  assert.equal(window.casoraTileState({ type: 'custom:button-card', template: 'casora_light', entity: '' }, null, hass, templates), null,
    'other tiles without an entity stay as before');
  console.log('ok add: waste preview');
}

// ── T12: chart ───────────────────────────────────────────────────────────────
{
  const t = type('casora_chart');
  assert.ok(t.pickInEditor, 'chart picks its sensor in the editor');
  const p = panel();
  p._ask = async () => { throw new Error('no question with random sensors'); };
  const room = { path: 'x', name: 'X', tiles: [], variables: {} };
  assert.equal(await P._addTileAsk.call(p, room, t), true);
  assert.equal(room.tiles.length, 1);
  const tile = { type: 'custom:button-card', template: 'casora_chart', entity: '', name: 'Chart', variables: {} };
  P._fillTile.call(p, tile, t, PWR);
  assert.equal(tile.name, 'TV Power', 'named like its sensor');
  console.log('ok add: chart');
}

// ── E30: wording ─────────────────────────────────────────────────────────────
{
  const de = JSON.parse(read('custom_components/casora/translations/panel/de.json')).exact;
  assert.equal(de['Entity list'], 'Geräteliste');
  ['Tile types', 'New tile of this type', 'Waste sensor', 'Scene'].forEach((k) => assert.ok(de[k], 'de: ' + k));
  console.log('ok add: wording');
}
