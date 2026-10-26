// Studio → ⋯ → Help → "Copy diagnostics…" (casora-panel-diagnostics.js) without a browser.
// A made-up house full of "private" names (pets, people, rooms, street, hosts, a custom integration, an own
// theme): none of them may reach the text, only counts, domains, known integrations and versions. The counts
// come from the real panel filters (_rankedEntityList, _tileCandidates, listCategory) – issue #25 would have
// read "device_tracker 3 all, 3 diag" with the lists that Casora leaves.
// Also: wiring (help menu, search, loader in __init__.py) and the German texts.
// Energy (#78/#79): HA's energy settings as counts, the energy badges per dashboard (automatic or by hand, sensors
// per room against what the room's area has), never an entity id or a name.
//   node dev/unit/studio_diagnostics.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const noop = () => {};

// ── Load the real panel class, then the diagnostics module ───────────────────
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
assert.ok(Panel, 'panel class');
globalThis.customElements.whenDefined = () => Promise.resolve();
new Function(fix(read('custom_components/casora/panel/casora-panel-diagnostics.js')))();
await new Promise((r) => setImmediate(r));
console.info = info;
const P = Panel.prototype;
const DG = window.casoraDiagnostics;
assert.ok(DG && DG.collect && DG.format, 'pure part');
assert.equal(typeof P._diagShow, 'function', 'dialog on the panel');
const I = window.__casoraPanelInternals;
assert.ok(I.TILE_MAIN_FIND && I.tileMissingEntity && I.tileEntityGone, 'helpers exported for the diagnostics');

// ── A made-up house with private names everywhere ───────────────────────────
const PRIVATE = ['Fluffyquill', 'Brambleton', 'Zorvanka', 'Quixtenberg', 'Wobbleshire', 'Gristlewood', 'Plumtwist',
  'Snorkelgasse 17', 'Villa Kumquat', 'kumquat-villa.example', '10.77.12.9', 'xn-secret-token-123', '48.1371',
  'Moonbeam theme', 'zorvanka_garden', 'SN-99887766', 'AB:CD:EF:01:23:45', 'fluffyquill', 'brambleton', 'quixtenberg'];
const st = (id, state, attributes) => ({ entity_id: id, state, attributes: attributes || {} });
const TA = 'device_tracker.fluffyquill_gps', TB = 'device_tracker.brambleton_gps';
const PHONE = 'device_tracker.quixtenberg_phone', LIGHT = 'light.wobbleshire_ceiling', LED = 'light.gristlewood_router_led';
const BATT = 'sensor.fluffyquill_battery', PERSON = 'person.quixtenberg', GARDEN = 'switch.zorvanka_garden_pump';
const OFF = 'sensor.plumtwist_disabled_power', NOSTATE = 'sensor.plumtwist_missing', HIDDEN = 'light.plumtwist_hidden';
const reg = (id, o) => ({ entity_id: id, ...o });
const entities = {
  [TA]: reg(TA, { device_id: 'hwA', platform: 'tractive', entity_category: 'diagnostic', name: 'Fluffyquill' }),
  [TB]: reg(TB, { device_id: 'hwB', platform: 'tractive', entity_category: 'diagnostic' }),
  [PHONE]: reg(PHONE, { device_id: 'phone', platform: 'mobile_app', entity_category: 'diagnostic' }),
  [BATT]: reg(BATT, { device_id: 'hwA', platform: 'tractive', entity_category: 'diagnostic' }),
  [LIGHT]: reg(LIGHT, { device_id: 'lamp', platform: 'hue', area_id: 'wobbleshire' }),
  [LED]: reg(LED, { device_id: 'router', platform: 'zorvanka_garden', entity_category: 'config' }),
  [GARDEN]: reg(GARDEN, { device_id: 'pump', platform: 'zorvanka_garden' }),
  [PERSON]: reg(PERSON, { platform: 'person' }),
  [NOSTATE]: reg(NOSTATE, { device_id: 'pump', platform: 'zorvanka_garden' }),
  [HIDDEN]: reg(HIDDEN, { device_id: 'lamp', platform: 'hue', hidden: true }),
};
const devices = {
  hwA: { id: 'hwA', name: 'Fluffyquill Tracker', manufacturer: 'Tractive GmbH', serial_number: 'SN-99887766', area_id: 'gristlewood' },
  hwB: { id: 'hwB', name: 'Brambleton Tracker', manufacturer: 'Tractive GmbH' },
  phone: { id: 'phone', name: "Quixtenberg's phone", connections: [['mac', 'AB:CD:EF:01:23:45']] },
  lamp: { id: 'lamp', name: 'Wobbleshire ceiling', area_id: 'wobbleshire' },
  router: { id: 'router', name: 'Gristlewood router', configuration_url: 'http://10.77.12.9' }, pump: { id: 'pump', name: 'Zorvanka pump' },
};
const states = {
  [TA]: st(TA, 'home', { friendly_name: 'Fluffyquill', latitude: 48.1371, longitude: 11.5754, source_type: 'gps' }),
  [TB]: st(TB, 'Snorkelgasse 17', { friendly_name: 'Brambleton' }),
  [PHONE]: st(PHONE, 'home', { friendly_name: "Quixtenberg's phone" }),
  [BATT]: st(BATT, '80', { friendly_name: 'Fluffyquill battery', device_class: 'battery', unit_of_measurement: '%' }),
  [LIGHT]: st(LIGHT, 'on', { friendly_name: 'Wobbleshire ceiling' }),
  [LED]: st(LED, 'on', { friendly_name: 'Gristlewood router LED' }),
  [GARDEN]: st(GARDEN, 'off', { friendly_name: 'Zorvanka garden pump' }),
  [PERSON]: st(PERSON, 'Villa Kumquat', { friendly_name: 'Quixtenberg' }),
  [HIDDEN]: st(HIDDEN, 'off', { friendly_name: 'Plumtwist hidden' }),
  'zone.home': st('zone.home', '1', { friendly_name: 'Villa Kumquat', latitude: 48.1371, longitude: 11.5754 }),
};
// The full registry (admin): also the disabled entity, which the frontend's hass.entities leaves out.
const fullRegistry = Object.values(entities).map((e) => ({ ...e, original_name: 'Plumtwist ' + e.entity_id, unique_id: 'xn-secret-token-123',
  hidden_by: e.hidden ? 'user' : null, disabled_by: null }))
  .concat([{ entity_id: OFF, platform: 'zorvanka_garden', device_id: 'pump', disabled_by: 'user', hidden_by: null, entity_category: null, name: 'Plumtwist' }]);
const hass = {
  states, entities, devices,
  areas: { wobbleshire: { area_id: 'wobbleshire', name: 'Wobbleshire' }, gristlewood: { area_id: 'gristlewood', name: 'Gristlewood' } },
  language: 'de', locale: { language: 'de' },
  config: { version: '2026.10.2', location_name: 'Villa Kumquat', latitude: 48.1371, longitude: 11.5754,
    internal_url: 'http://10.77.12.9:8123', external_url: 'https://kumquat-villa.example' },
  themes: { default_theme: 'Moonbeam theme', darkMode: true }, selectedTheme: { theme: 'Moonbeam theme', dark: true },
  user: { name: 'Quixtenberg', id: 'xn-secret-token-123' }, auth: { data: { access_token: 'xn-secret-token-123', hassUrl: 'http://10.77.12.9:8123' } },
  callWS: async (m) => {
    if (m.type === 'casora/version') return { version: '26.10.43' };
    if (m.type === 'config/entity_registry/list') return fullRegistry;
    throw new Error('unexpected ' + m.type);
  },
};
window.casoraCommunityOn = new Set(['casora_pet', 'Fluffyquill']);
window.__casoraVersion = '';
const tile = (o) => ({ type: 'custom:button-card', ...o });
const rooms = [
  { path: 'home', name: 'Villa Kumquat', tiles: [tile({ template: 'casora_light', entity: LIGHT })], variables: {} },
  { path: 'wobbleshire', name: 'Wobbleshire', tiles: [tile({ template: 'casora_pet', entity: TA }), tile({ template: 'casora_light', entity: 'light.gone_quixtenberg' })], variables: {} },
];
const panel = () => {
  const p = Object.create(P);
  p._hass = hass;
  p._state = { compact: { rooms } };
  p._room = 1;
  p._dashList = [{ url_path: 'villa-kumquat', title: 'Villa Kumquat' }, { url_path: 'villa-kumquat-mobile', title: 'Quixtenberg phone' }];
  p._dashUrl = 'villa-kumquat';
  p.classList = { contains: () => false };
  return p;
};
// Energy: HA's settings with private sensor ids, Home from them, the room's badge chosen by hand with one left out.
const PREFS = {
  energy_sources: [
    { type: 'grid', stat_energy_from: 'sensor.fluffyquill_import', stat_rate: 'sensor.fluffyquill_grid_power' },
    { type: 'solar', stat_energy_from: 'sensor.brambleton_pv_energy' },
    { type: 'gas', stat_energy_from: 'sensor.zorvanka_gas' },
  ],
  device_consumption: [
    { stat_consumption: 'sensor.wobbleshire_kwh', stat_rate: 'sensor.wobbleshire_w', name: 'Wobbleshire heater' },
    { stat_consumption: 'sensor.gristlewood_kwh' },
  ],
};
window.casoraEnergyPrefs = Object.assign(() => PREFS, { load: async () => PREFS, tried: true });
window.casoraEnergyHouse = (h, pr) => (pr === PREFS ? { ids: ['sensor.fluffyquill_grid_power'], power: 'sensor.fluffyquill_grid_power' } : null);
new Function(read('custom_components/casora/panel/casora-panel-basis.js'))();
rooms[0].variables = { energy_power_entity: 'sensor.fluffyquill_grid_power', casora_energy_auto: 'prefs' };
rooms[1].variables = { energy_entities: ['sensor.plumtwist_disabled_power', 'sensor.wobbleshire_w'], energy_exclude: ['sensor.zorvanka_plug'],
  casora_energy_auto: false };
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
Object.defineProperty(globalThis, 'navigator', { value: { userAgent: UA }, configurable: true });

// ── The real panel collects ───────────────────────────────────────────────────
const p = panel();
const data = await P._diagData.call(p);
const text = DG.format(data);

// Nothing private in the text
for (const w of PRIVATE) assert.ok(!text.toLowerCase().includes(w.toLowerCase()), 'private word in the diagnostics: ' + w);
for (const id of Object.keys(states).concat(Object.keys(entities), [OFF])) assert.ok(!text.includes(id), 'entity id in the diagnostics: ' + id);
assert.ok(!/sensor\.|heater/i.test(text), 'no energy sensor ids or device names');
assert.ok(!/https?:|\d+\.\d+\.\d+\.\d+|@/.test(text.replace(/\d+\.\d+\.\d+ · Home/, '')), 'no URL, IP or address: ' + text);
// Only plain characters: letters, digits, spaces, a few signs, and the fence.
assert.ok(/^[A-Za-z0-9 _.,:()=+·–\-\n`/*?]+$/.test(text), 'unexpected characters:\n' + text);
console.log('ok diagnostics: no private data');

// Shape and numbers
assert.ok(text.startsWith('```text\nCasora-Diagnose · '), 'code block with header');
assert.ok(text.endsWith('\n```\n'), 'closed code block');
assert.ok(text.includes('Casora 26.10.43 · Home Assistant 2026.10.2 · language de'), 'versions and language');
assert.ok(text.includes('theme other (dark)'), 'own theme only as "other"');
assert.ok(text.includes('Studio previous · desktop · browser · Chrome on macOS · 1400x900'), 'device line: ' + text.split('\n')[3]);
assert.ok(text.includes('dashboards: 2 Casora (1 phone layout) · this one: 2 rooms, 3 tiles, 1 without device'), 'dashboards');
assert.ok(text.includes('community cards added: casora_pet\n'), 'community ids only (no stray names)');
assert.ok(text.includes('entities: 12 · disabled 1 · hidden 1 · no state 1'), 'totals');
const row = (d) => (text.split('\n').find((l) => l.startsWith(d + ' ')) || '').trim().split(/\s+/);
// device_tracker: 3 all, 3 diag, 0 config, 0 hidden, 0 disabled, 2 without area (hwA has one), 0 no state,
// lists 3 (trackers stay in since #25), tiles 3.
assert.deepEqual(row('device_tracker'), ['device_tracker', '3', '3', '0', '0', '0', '2', '0', '3', '3'], 'device_tracker row');
// light: ceiling, router LED (config), hidden one. Lists: the Studio leaves the config LED out.
assert.deepEqual(row('light'), ['light', '3', '0', '1', '1', '0', '1', '0', '2', '1'], 'light row');
// sensor: battery (diagnostic, but sensors stay in lists; no tile suggestion), the disabled one, one without state.
assert.deepEqual(row('sensor'), ['sensor', '3', '1', '0', '0', '1', '2', '1', '1', '0'], 'sensor row');
assert.ok(/\ncasora_pet +2\n/.test(text), 'pet tile finds both trackers');
assert.ok(/\ntractive +3  device_tracker 2, sensor 1\n/.test(text), 'known integration with domains');
assert.ok(text.includes('other integrations: 3 (7 entities)'), 'custom integrations only counted');
console.log('ok diagnostics: counts from the real filters');

// Energy section: settings as counts, the open dashboard's badges (unsaved state), per room assigned/found.
assert.ok(text.includes('energy settings (HA): set up · grid 1 (power 1) · solar 1 (power 0) · battery 0 · gas 1 · water 0'
  + ' · devices 2 (power 1) · house from settings: yes'), 'energy settings line:\n' + text);
{
  const head = text.split('\n').findIndex((l) => l.startsWith('dashboard '));
  assert.ok(head > 0, 'energy table');
  assert.deepEqual(text.split('\n')[head + 1].trim().split(/\s+/), ['1+', '1', '1', 'settings', '0', '1', '1', '2:0'], 'one room, by hand, two sensors, one left out, none found in its area');
}
// The pure part: every mode, phone halves never counted twice, unknown settings.
{
  const e = DG.energyOf(null, null, [{ current: false, rooms: [
    { home: true, vars: { energy_entities: ['a', 'b'], casora_energy_auto: 2, casora_energy_rooms: true } },
    { vars: { energy_entities: ['a', 'x'], energy_exclude: ['x'], casora_energy_auto: 2 }, found: 2 },
    { vars: { energy_power_entity: 'b', casora_energy_auto: true }, found: 1 },
    { vars: { show_energy: false, energy_entities: ['c'] }, found: 1 },
    { vars: {}, found: 3 },
    { vars: { energy_cost_month: 'm' }, found: null },
  ] }]);
  assert.equal(e.prefs, 'unknown');
  assert.deepEqual(e.dashboards[0], { current: false, rooms: 5, badges: 3, home: 'rooms-chosen', auto: 2, manual: 0, left: 1,
    per: ['1:2', '1:1', 'off', '0:3', '0:x'] });
  assert.deepEqual(['prefs', 'house', 2, false, undefined].map((m) => DG.energyBadge({ energy_power_entity: 'p', casora_energy_auto: m }, true).mode),
    ['settings', 'name', 'rooms', 'manual', 'manual']);
  assert.equal(DG.energyBadge({}, true).mode, 'none');
  const legacy = DG.energyOf({ energy_sources: [{ type: 'grid', flow_from: [], power: [{ stat_rate: 'g' }] }, { type: 'battery', power_config: { stat_rate: 'b' } }, { type: 'wind' }] }, false, []);
  assert.deepEqual([legacy.prefs, legacy.power.grid, legacy.power.battery, legacy.sources.other, legacy.house], ['yes', 1, 1, 1, false]);
  assert.equal(DG.energyOf({}, null, []).prefs, 'none');
  assert.ok(DG.format(DG.collect(hass, { energy: { prefs: {}, house: null, dashboards: [] } })).includes('energy settings (HA): not set up · house from settings: –'));
}
console.log('ok diagnostics: energy');

// Without the full registry (no admin): disabled is "–", nothing breaks.
{
  const d2 = DG.collect(hass, { lists: () => 1 });
  assert.equal(d2.disabled, null);
  assert.ok(DG.format(d2).includes('disabled –'), 'unknown disabled count');
}
// Cleaning: odd values never pass.
assert.equal(DG.cleanVersion('2026.10.2'), '2026.10.2');
assert.equal(DG.cleanVersion('http://10.77.12.9'), '?');
assert.equal(DG.cleanWord('Fluffyquill'), '?');
assert.equal(DG.cleanTheme('Casora Nebel'), 'Casora Nebel');
assert.equal(DG.cleanTheme('Moonbeam theme'), 'other');
assert.deepEqual(DG.envOf('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Home Assistant/2025.9'),
  { app: 'app', os: 'iOS', browser: 'Safari' });
assert.deepEqual(DG.envOf('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/141.0 Mobile Safari/537.36', { externalApp: true }),
  { app: 'app', os: 'Android', browser: 'Chrome' });
console.log('ok diagnostics: cleaning');

// ── Wiring ───────────────────────────────────────────────────────────────────
{
  const panelSrc = read('custom_components/casora/panel/casora-panel.js');
  assert.ok(/\{ id: "issue", label: "Report a problem"[^\n]*\n[^\n]*\n\s*\.\.\.\(typeof this\._diagShow === "function" \? \[\{ id: "diag", label: "Copy diagnostics…"/.test(panelSrc),
    'help menu: right after "Report a problem"');
  assert.ok(/if \(id === "diag"\) return this\._diagShow\(\);/.test(panelSrc), 'help menu opens the dialog');
  const mehr = read('custom_components/casora/panel/casora-panel-b-mehr.js');
  assert.ok(/A\("diag", "Copy diagnostics…", "diagnose[^"]*github/.test(mehr), 'findable in the Studio search');
  const sv = read('custom_components/casora/scripts_view.py');
  assert.equal((sv.match(/"casora-panel-diagnostics\.js"/g) || []).length, 1, 'in STUDIO_MODULES (stamp + loader, scripts_view.py)');
  const de = JSON.parse(read('custom_components/casora/translations/panel/de.json')).exact;
  for (const k of ['Copy diagnostics…', 'Diagnostics', 'Copy', 'Copied', 'Close', 'Report a problem',
    'Paste it into your GitHub issue. It contains only counts, versions and integrations – no names of devices, rooms or people, no addresses.',
    'The diagnostics could not be collected.', 'Copying is not possible here. The text is selected – copy it by hand.',
    'GitHub is open – paste the diagnostics into your issue.']) assert.ok(de[k], 'German text: ' + k);
  assert.equal(de['Copy diagnostics…'], 'Diagnose kopieren …', 'Studio ellipsis with a space');
  console.log('ok diagnostics: wiring and texts');
}
console.log('ok studio_diagnostics');
