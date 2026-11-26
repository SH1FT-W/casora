// @deckt: custom_components/casora/panel/casora-panel-types.js#casoraTileIconUrl,casoraTileState,casoraTileIsOffline,casoraTileArtUrl
// @deckt: custom_components/casora/panel/casora-panel.js#_miniModel,_phoneRoomSceneList,_paintBadge,_paintTile,_dashHelpersLoad
// Studio preview = dashboard (review 26.11.2026, z3: u04-02, u09-05, d02-04, d02-05, u01-05). The preview drew
// TV, Apple TV, PlayStation and the cameras tile with the speaker/doorbell fallback, a blinds group "Geöffnet"
// instead of "Alle geöffnet", no offline rim, a grey ball instead of the club crest, the scenes badge as a pale
// stack, badge texts through the panel's English keys ("1 allumées", "Aucun actif") and no scenes on the phone's
// room page. Each now comes from the dashboard's own template chain / helpers.
//   node dev/unit/studio_preview_dashboard_match.mjs
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
const store = new Map();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) }, configurable: true });
globalThis.customElements = { get: () => Panel, define: (n, c) => { Panel = c; }, whenDefined: () => new Promise(noop) };
const fix = (s) => s.replace(/import\.meta\.url/g, '"http://x/casora-panel.js?v=0"');
const info = console.info;
console.info = noop;
globalThis.document = stub();
new Function(fix(read('custom_components/casora/panel/casora-panel-types.js')))();
new Function(fix(read('custom_components/casora/panel/casora-panel.js')))();
await new Promise((r) => setImmediate(r));
console.info = info;
const P = Panel.prototype;

const templates = JSON.parse(read('dashboards/casora/button_card_templates.json'));
globalThis.DOMParser = class { parseFromString(t) { return { body: { textContent: t.replace(/<[^>]+>/g, ''), querySelectorAll: () => [] } }; } };
const st = (id, state, a) => ({ entity_id: id, state, attributes: { friendly_name: id, ...a } });
const states = {
  'media_player.tv': st('media_player.tv', 'off', { device_class: 'tv', friendly_name: '55" Neo QLED' }),
  'media_player.atv': st('media_player.atv', 'off', { friendly_name: 'Apple TV' }),
  'media_player.ps': st('media_player.ps', 'off', { friendly_name: 'PlayStation 5' }),
  'media_player.box': st('media_player.box', 'off', { friendly_name: 'Kitchen speaker' }),
  'camera.door': st('camera.door', 'unavailable'),
  'cover.blinds': st('cover.blinds', 'open', { entity_id: ['cover.a', 'cover.b'] }),
  'cover.a': st('cover.a', 'open'), 'cover.b': st('cover.b', 'open'),
  'sensor.club': st('sensor.club', 'PRE', { team_logo: 'https://example.invalid/club.png' }),
  'scene.cosy': st('scene.cosy', '2026-11-26T08:00:00Z', { friendly_name: 'Cosy', entity_id: ['light.sofa'] }),
  'scene.movie': st('scene.movie', '2026-11-26T08:00:00Z', { friendly_name: 'Movie' }),
  'scene.kitchen': st('scene.kitchen', '2026-11-26T08:00:00Z', { friendly_name: 'Cook', entity_id: ['light.counter'] }),
  'light.sofa': st('light.sofa', 'off'), 'light.counter': st('light.counter', 'off'),
  'light.a': st('light.a', 'on'), 'light.b': st('light.b', 'off'),
  'light.desk': st('light.desk', 'off'),
  'scene.read': st('scene.read', '2026-11-26T08:00:00Z', { friendly_name: 'Read', entity_id: ['light.desk'] }),
  'scene.mood': st('scene.mood', '2026-11-26T08:00:00Z', { friendly_name: 'Mood', entity_id: ['light.b'] }),
};
const hass = { states, language: 'de', locale: { language: 'de' }, formatEntityState: (s) => s.state,
  areas: { living: { area_id: 'living', name: 'Living room' }, kitchen: { area_id: 'kitchen', name: 'Kitchen' },
    den: { area_id: 'den', name: 'Study' } },
  devices: {},
  entities: { 'scene.cosy': {}, 'scene.movie': { area_id: 'living' }, 'scene.kitchen': {}, 'scene.read': {}, 'scene.mood': {},
    'light.desk': { area_id: 'den' },
    'light.sofa': { area_id: 'living' }, 'light.counter': { area_id: 'kitchen' }, 'media_player.tv': { area_id: 'living' } } };
const bc = (template, entity, variables) => ({ type: 'custom:button-card', template, entity, ...(variables ? { variables } : {}) });

// A freshly opened Studio has none of the dashboard helpers (casora-studio.js does not import casora-core.js,
// casora-i18n.js or casora-local.js): painting a tile or a badge loads them once (_casoraCardsReady, as popups do)
// and draws again when they are there – the offline rim, "Alle geöffnet" and the badge words stayed out before.
const core = read('custom_components/casora/scripts/casora-core.js');
const realHelpers = () => {
  const a = core.indexOf('// casora-offline:start'), b = core.indexOf('// casora-offline:end');
  const i = core.indexOf('  window.casoraCoverSummary = function'), j = core.indexOf('  window.casoraCoverIconUrl = function');
  assert.ok(a > 0 && b > a && i > 0 && j > i, 'casora-core blocks');
  window.casoraStateFit = (t) => t;
  new Function(core.slice(a, b))();
  new Function('window', core.slice(i, j))(window);
};
{
  const evs = {};
  const add0 = globalThis.addEventListener, rem0 = globalThis.removeEventListener;
  globalThis.addEventListener = (n, f) => { (evs[n] = evs[n] || new Set()).add(f); };
  globalThis.removeEventListener = (n, f) => { if (evs[n]) evs[n].delete(f); };
  let loads = 0, draws = 0;
  const panel = Object.assign(Object.create(P), { _state: {}, _rebuildPreview() { draws++; },
    _casoraCardsReady: async () => { loads++; realHelpers(); window.casoraTr = (t) => t; return true; } });
  assert.equal(typeof window.casoraTileOffline, 'undefined', 'test starts like a fresh Studio');
  try { P._paintBadge.call(panel, { id: 'lights', dash: '1 an', text: '1 on', icon: 'light', color: '' }); } catch (e) { /* stub DOM */ }
  assert.equal(loads, 1, 'a badge with dashboard words loads the dashboard scripts');
  await new Promise((r) => setImmediate(r));
  assert.equal(draws, 1, 'drawn again once casora-core and the translation are there');
  try { P._paintTile.call(panel, { entity: 'light.a' }, 0, {}); } catch (e) { /* stub DOM */ }
  assert.equal(loads, 1, 'loaded once per Studio');
    window.casoraLightTallyText = (t) => (t.on === 1 ? '1 an' : '?');
  (evs['casora-local-loaded'] || new Set()).forEach((f) => f());
  assert.equal(draws, 2, 'casora-local.js done: drawn again with the light tally');
  assert.equal((evs['casora-local-loaded'] || new Set()).size, 0, 'and stops listening');
  const fresh = { _state: {}, _rebuildPreview() { draws++; }, _casoraCardsReady: async () => { loads++; return true; } };
  P._dashHelpersLoad.call(fresh);
  assert.equal(loads, 1, 'nothing to load once every helper is there');
  globalThis.addEventListener = add0; globalThis.removeEventListener = rem0;
}

// Icons from the template chain (casora_media: device kind; casora_cameras: camera) instead of speaker/doorbell.
const icon = (t) => window.casoraTileIconUrl(t, states[t.entity], hass, templates);
assert.equal(icon(bc('casora_media', 'media_player.tv')), '/casora_assets/icons/tv.svg', 'TV icon');
assert.equal(icon(bc('casora_media', 'media_player.atv')), '/casora_assets/icons/apple_tv.svg', 'Apple TV icon');
assert.equal(icon(bc('casora_media', 'media_player.ps')), '/casora_assets/icons/ps5.svg', 'PlayStation icon');
assert.equal(icon(bc('casora_media', 'media_player.box')), '/casora_assets/icons/speaker.svg', 'a speaker stays a speaker');
assert.equal(icon(bc(['casora_cameras', 'casora_popup_camera'], 'camera.door', { cameras: ['camera.door'] })),
  '/casora_assets/icons/camera.svg', 'cameras tile: camera icon');

// Blinds group: the dashboard's summary words (casora-core.js casoraCoverSummaryText, the real one).
assert.equal(window.casoraTileState(bc('casora_cover', 'cover.blinds'), states['cover.blinds'], hass, templates),
  'Alle geöffnet', 'blinds group says "Alle geöffnet" like the dashboard');

// Offline rim (casora_entity state casora_offline, casora-core.js casoraTileOffline); the cameras tile opts out.
assert.equal(window.casoraTileIsOffline(bc('casora_camera', 'camera.door'), states['camera.door'], hass, templates), true,
  'an unavailable camera is marked offline');
assert.equal(window.casoraTileIsOffline(bc(['casora_cameras', 'casora_popup_camera'], 'camera.door', { cameras: ['camera.door'] }),
  states['camera.door'], hass, templates), false, 'the cameras tile opts out as on the dashboard');
assert.equal(window.casoraTileIsOffline(bc('casora_media', 'media_player.tv'), states['media_player.tv'], hass, templates), false,
  'a device that is only off is not offline');

// Club crest of the football tile from its entity_picture.
window._casoraFootball = { info: () => ({ team: { logo: 'https://example.invalid/club.png' } }), img: (u) => u + '#round' };
assert.equal(window.casoraTileArtUrl(bc(['casora_football', 'casora_popup_football'], 'sensor.club'), states['sensor.club'], hass, templates),
  'https://example.invalid/club.png#round', 'football tile shows the crest');
assert.equal(window.casoraTileArtUrl(bc('casora_media', 'media_player.tv'), states['media_player.tv'], hass, templates), null,
  'other tiles get no art from here');

// Phone room page: the room's scenes as _casoraSC.list finds them (area of the room, own area wins), also the ones
// hidden in the phone bar's scene menu; none for a room without an area.
const fake = { _hass: hass, _casoraSceneHide: ['scene.cosy', 'scene.movie'] };
assert.deepEqual(P._phoneRoomSceneList.call(fake, 'Living room', []).map((x) => x.id), ['scene.cosy', 'scene.movie'],
  'living room: its scenes');
assert.deepEqual(P._phoneRoomSceneList.call(fake, 'Lounge', [bc('casora_media', 'media_player.tv')]).map((x) => x.id),
  ['scene.cosy', 'scene.movie'], 'renamed room: the area of its tiles');
assert.deepEqual(P._phoneRoomSceneList.call(fake, 'Attic', []), [], 'no area: no scenes (not all of them)');
// The area saved with the room (variables.area, kept on renaming; the phone page gets it as card.area) comes first.
assert.deepEqual(P._phoneRoomSceneList.call(fake, 'Lounge', [], 'living').map((x) => x.id), ['scene.cosy', 'scene.movie'],
  'renamed room with its saved area: the scenes of that area, also without tiles');
assert.deepEqual(P._phoneRoomSceneList.call(fake, 'Kitchen', [bc('casora_media', 'media_player.tv')], 'living').map((x) => x.id),
  ['scene.cosy', 'scene.movie'], 'the saved area wins over a matching name');
// Area ids count like names (roomEntityIds: id or name).
assert.deepEqual(P._phoneRoomSceneList.call(fake, 'den', []).map((x) => x.id), ['scene.read'], 'room named like an area id');
// #142 catch-all room: no clear majority, so no area; the tile devices themselves decide (roomEntityIdsFrom).
assert.deepEqual(P._phoneRoomSceneList.call(fake, 'Everything',
  [bc('casora_media', 'media_player.tv'), bc('casora_light', 'light.counter')]).map((x) => x.id), ['scene.kitchen'],
  'catch-all room: only the scenes that switch its tiles, not all of the most frequent area');
// Tiles without any area: the scenes that switch them, as on the phone.
assert.deepEqual(P._phoneRoomSceneList.call(fake, 'Shed', [bc('casora_light', 'light.b')]).map((x) => x.id), ['scene.mood'],
  'room without areas: the scenes of its devices');

// Badges: scenes badge with the palette in the scene badge colour, never dimmed; light and scene texts in the
// dashboard's German words for the dashboard translation.
const model = (V) => P._miniModel.call({ _hass: hass, _state: { compact: { rooms: [] } }, _sceneCatalog: () => [] },
  { name: 'Living room', path: 'living', variables: V }, { place: 'room' });
const sc = model({ show_scenes: true, scene_entities: ['scene.cosy'] }).find((b) => b.id === 'scenes');
assert.ok(sc && /^data:image\/svg\+xml/.test(sc.icon) && decodeURIComponent(sc.icon).includes('M17.5,12A1.5'), 'scenes badge: mdi:palette');
assert.ok(/--casora-scene-badge-color/.test(sc.color) && !sc.dim, 'scenes badge: scene badge colour, full strength');
assert.equal(sc.dash, 'Keine aktiv', 'scenes badge: dashboard wording');
const li = model({ light_entity_1: 'light.a', light_entity_2: 'light.b' }).find((b) => b.id === 'lights');
assert.equal(li && li.dash, '1 an', 'lights badge: the dashboard tally words');
console.log('ok preview: icons, blinds words, offline rim, crest, room scenes and badges as on the dashboard');
