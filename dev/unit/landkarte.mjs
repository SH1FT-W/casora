// Map tile (community card #159, scripts/local/44-landkarte.js): the tile asks for no entity and appears on the phone,
// the popup is Home Assistant's own map card with the Studio's options and large (wide popup, S5 stage).
//   node dev/unit/landkarte.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const ROOT = new URL('../../', import.meta.url);
const rd = (p) => fs.readFileSync(new URL(p, ROOT), 'utf8');
const C = 'custom_components/casora/';

const win = { innerWidth: 1440, innerHeight: 900 };
new Function('window', rd(C + 'scripts/local/44-landkarte.js'))(win);
const M = win._casoraMapCard;
assert.ok(M, 'module loads');

// Which entities: all persons, then all zones; a chosen list is exact and drops what is gone.
const S = { 'person.b': { state: 'home' }, 'person.a': { state: 'not_home' }, 'zone.home': { state: '1' }, 'sensor.x': { state: '1' } };
assert.deepEqual(M.ids(S, null), ['person.a', 'person.b', 'zone.home']);
assert.deepEqual(M.ids(S, {}), ['person.a', 'person.b', 'zone.home']);
assert.deepEqual(M.ids(S, { map_entities: ['person.b', 'zone.gone'] }), ['person.b']);
assert.deepEqual(M.ids(S, { map_entities: ['zone.gone'] }), [], 'a chosen list is not widened when it is gone');

// Options → HA's map card options, with the defaults the issue asks for.
assert.deepEqual(M.sources({}), []);
assert.deepEqual(M.sources({ map_geo: 'all' }), ['all']);
assert.deepEqual(M.sources({ map_geo: 'usgs' }), ['usgs']);
assert.equal(M.hours({}), 0);
assert.equal(M.hours({ map_hours: 24 }), 24);
assert.equal(M.hours({ map_hours: '12' }), 12);
assert.equal(M.hours({ map_hours: -3 }), 0);
assert.equal(M.zoom({}), null);
assert.equal(M.zoom({ map_zoom: 14 }), 14);
assert.equal(M.zoom({ map_zoom: 0 }), null, 'zoom out of range is ignored');
assert.equal(M.zoom({ map_zoom: 40 }), null);
assert.equal(M.theme({}), 'auto', 'dark mode follows the theme by default');
assert.equal(M.theme({ map_theme: 'dark' }), 'dark');
assert.equal(M.theme({ map_theme: 'x' }), 'auto');

const c0 = M.config(S, {}, 1440, 900);
assert.deepEqual(c0.entities, [{ entity: 'person.a' }, { entity: 'person.b' }, { entity: 'zone.home' }]);
assert.equal(c0.type, 'map');
assert.equal(c0.hours_to_show, 0);
assert.equal(c0.theme_mode, 'auto');
assert.equal('geo_location_sources' in c0, false, 'no geo data by default');
assert.equal('default_zoom' in c0, false, 'zoom left to HA by default');
const c1 = M.config(S, { map_geo: 'all', map_hours: 48, map_zoom: 12, map_theme: 'light' }, 1440, 900);
assert.deepEqual([c1.geo_location_sources, c1.hours_to_show, c1.default_zoom, c1.theme_mode], [['all'], 48, 12, 'light']);

// Large: desktop a ratio for the 900 popup, phone a tall map, nothing absurd on tiny windows.
const ar = (s) => s.split(':').map(Number);
const [dw, dh] = ar(M.ratio(1440, 900));
assert.ok(dw === 848 && dh >= 400 && dh <= 680, 'desktop ' + dw + ':' + dh);
const [pw, ph] = ar(M.ratio(393, 852));
assert.ok(pw === 365 && ph >= 300 && ph / pw > 1, 'phone ' + pw + ':' + ph);
const [sw, sh] = ar(M.ratio(360, 500));
assert.ok(sw > 0 && sh >= 260, 'small window keeps a usable map');

// HA's card rejects no entities and no sources; the popup shows the fallback stage instead.
assert.equal(M.empty({}, {}), true);
assert.equal(M.empty({}, { map_geo: 'all' }), false, 'geo sources alone are enough');
assert.equal(M.empty(S, {}), false);

// The map on the tile: status, markers, a field string that does not change between redraws.
assert.equal(M.word(S, {}), '1 von 2 zu Hause', 'persons on the map as a status');
assert.equal(M.word({ 'zone.home': { state: '0' } }, {}), '', 'no persons: no status');
assert.equal(M.word(S, { map_entities: ['person.b'] }), '1 von 1 zu Hause', 'only the chosen persons count');
const S2 = Object.assign({}, S, { 'geo_location.q': { state: '1', attributes: { source: 'usgs' } }, 'geo_location.w': { state: '1', attributes: { source: 'other' } } });
assert.deepEqual(M.markers(S2, {}), ['person.a', 'person.b', 'zone.home'], 'no geo data by default');
assert.deepEqual(M.markers(S2, { map_geo: 'usgs' }).slice(3), ['geo_location.q'], 'one source');
assert.deepEqual(M.markers(S2, { map_geo: 'all' }).slice(3), ['geo_location.q', 'geo_location.w'], 'all sources');
const host = {};
const a0 = M.tileField(host, { map_geo: 'all' }), a1 = M.tileField(host, { map_geo: 'all' });
assert.equal(a0, a1, 'stable string: a redraw keeps the element and its map');
assert.ok(/casora-tile-map/.test(a0), 'the map element');
assert.deepEqual(host._casoraMapVars, { map_geo: 'all' }, 'the element reads its options from the card');
assert.equal(M.tileField({}, { map_tile: false }), '', 'option off: no map element');
assert.ok(M.MAX_LIVE >= 3 && M.MAX_LIVE <= 6, 'a few maps at once');
const located = { 'person.a': { state: 'home', attributes: { latitude: 52.5, longitude: 13.4 } }, 'person.b': { state: 'x', attributes: { latitude: 52.6, longitude: 13.6 } }, 'zone.z': { state: '0', attributes: { latitude: 50, longitude: 10 } }, 'person.c': { state: 'x', attributes: {} } };
assert.deepEqual(M.bounds(located, ['person.a', 'person.b', 'zone.z', 'person.c']), [[13.4, 52.5], [13.6, 52.6]], 'bounds of the people, zones not counted');
assert.equal(M.bounds(located, ['zone.z', 'person.c']), null, 'nobody located: HA fits');
assert.ok(M.padding(177, 132).top + M.padding(177, 132).bottom < M.padding(280, 200).top + M.padding(280, 200).bottom, 'small tile: less padding, the people spread out');
assert.ok(M.markerScale(132) < M.markerScale(200), 'small tile: smaller markers');

// Popup: S5 stage across the wide popup, 900 wide unless empty or on a phone.
const calls = [];
win._casoraUI = {
  v3: () => true,
  stage: (t, o) => { calls.push([t, o]); return 'STAGE:' + t + ':' + (o.html || o.text || ''); },
  line: (a) => 'LINE:' + a,
  esc: String,
};
win._casoraSoftKit = { secCard: (w, js, st) => ({ watch: w, js }), layout: (o) => Object.assign({ fields: Object.keys(o.fields).sort(), stageWide: o.stageWide, stage: o.stage }, {}) };
const popped = M.popup(S, null, {});
assert.equal(popped.stage, 'stage');
assert.ok(popped.stageWide, 'the map stage spans the popup');
assert.equal(popped.casora_cols, 2, 'wide popup on a desktop');
win.innerWidth = 393;
assert.equal(M.popup(S, null, {}).casora_cols, undefined, 'phone: the sheet decides the width');
win.innerWidth = 1440;
assert.equal(M.popup({}, null, {}).casora_cols, undefined, 'nothing on the map: stays narrow');
win._casoraSoftKit.layout = (o) => o;
const f = M.popup(S, null, {}).fields;
assert.deepEqual(f.line.card.watch, ['person.a', 'person.b'], 'the head follows the persons');
assert.ok(/"type":"map"/.test(f.stage.card.js), 'map config reaches the stage');
assert.deepEqual(f.stage.card.watch, [], 'the stage is drawn once');
assert.equal(M.sec('line', ['person.a', 'person.b'], S), 'LINE:1 von 2 zu Hause');
assert.equal(M.sec('line', ['person.gone'], S), '', 'no persons on the map: no status line');
let mounted = null;
win._casoraStageCard = (el, cfg) => { mounted = cfg; };
const out = M.sec('stage', { type: 'map', aspect_ratio: '848:600' }, S, {});
assert.ok(out.startsWith('STAGE:image'), 'an S5 stage');
assert.ok(/aspect-ratio:848 \/ 600/.test(out), 'the slot reserves the map\'s size');
assert.ok(/--card-background-color:var\(--primary-background-color/.test(out), 'HA\'s markers need their fill back: the popup makes this variable transparent');
assert.equal(mounted.type, 'map');
assert.ok(M.sec('stage', null, S).startsWith('STAGE:status'), 'nothing to show: status stage, not an empty map');

// Tile and templates: no entity needed, unfiltered on the phone, popup v3 and wide.
const T = JSON.parse(rd('dashboards/casora/button_card_templates.json'));
assert.deepEqual(T.casora_map.template, ['casora_entity', 'casora_popup_map']);
assert.equal(T.casora_map.variables.icon, 'map');
assert.equal(T.casora_map.variables.mobile_filter_category, 'unfiltered');
assert.equal(T.casora_map.variables.active_override, false);
assert.match(T.casora_map.state_display, /M && variables\.map_tile !== false/, 'status only with the map on, a rest without the module (Studio preview)');
assert.match(T.casora_map.state_display, /'&nbsp;'/, 'the empty row holds the name on the neighbours\' line');
assert.match(T.casora_map.custom_fields.map, /window\._casoraMapCard \? window\._casoraMapCard\.tileField\(this, variables\) : ''/, 'the tile needs no module (Studio preview)');
assert.deepEqual(T.casora_map.styles.custom_fields.map.filter((x) => x['pointer-events']), [{ 'pointer-events': 'none' }], 'the map layer takes no touch: scrolling and taps reach the tile');
assert.equal(T.casora_map.template.length, 2);
const pop = T.casora_popup_map.tap_action.casora_popup;
assert.equal(pop.variant, 'v3');
assert.ok(/window\._casoraMapCard\.popup/.test(pop.content));
assert.ok(/casoraPopupWidth\('two'\)/.test(pop.style), 'wide popup');
const built = JSON.parse(rd(C + 'panel/casora-templates.json')).templates;
assert.ok(built.casora_map && built.casora_popup_map, 'templates built');
assert.ok(rd(C + 'assets/icons/map.svg').includes('<path'), 'icon file');

// Studio: a Community card without a device, in the same filter category as on the dashboard, without casora-core.
const types = rd(C + 'panel/casora-panel-types.js');
assert.match(types, /id: "casora_map"[^\n]*noEntity: true/);
assert.match(types, /id: "casora_map"[\s\S]{0,400}community: \{ desc:/);
assert.match(types, /"kettle", "co", "map"/, 'icon offered');
const panel = rd(C + 'panel/casora-panel.js');
assert.match(panel, /casora_map: "unfiltered"/, 'the panel has its own filter table (casora-core is not loaded in the Studio)');
assert.match(rd(C + 'scripts/casora-core.js'), /casora_map:\s+'unfiltered'/);
assert.match(panel, /HOUSE_WIDE_TILES = new Set\(\[[^\]]*"casora_map"/);
assert.match(panel, /if \(kind === "casora_map"\) return "";/, 'the Studio tile says nothing, not „Not set“');
assert.ok(rd(C + 'scripts/casora-local.js').includes("'44-landkarte'"));
const coreSrc = rd(C + 'scripts/casora-core.js');
assert.match(coreSrc, /AUTO_ALWAYS = \{[^}]*casora_map: 1/, 'large on the phone, as the camera tile');
assert.match(coreSrc, /'casora_map'\) !== -1 && cfg\.variables && cfg\.variables\.map_tile === false\) return 0/, 'option off: small on the phone');
const tanken = rd(C + 'scripts/local/12-tanken.js');
assert.match(tanken, /window\._casoraHaMap = \{ ok: mapOk, defined: haMapDefined, ml: mlOf \}/, 'the same ha-map loading as the fuel map');

// The entity-less tile reaches the phone dashboard (panel's own check for tiles without an entity).
const dir = new URL(C + 'panel/', ROOT);
const fix = (s) => s.replace(/import\.meta\.url/g, '"http://x/casora-panel.js?v=0"');
const noop = () => {};
const stub = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : stub()), apply: () => stub(), construct: () => stub() });
globalThis.window = { addEventListener: noop, location: { pathname: '/' }, matchMedia: () => ({ matches: false, addEventListener: noop }) };
globalThis.HTMLElement = class {};
globalThis.customElements = { get: () => null, define: noop, whenDefined: () => new Promise(() => {}) };
globalThis.document = stub();
globalThis.localStorage = { getItem: () => null, setItem: noop };
const log = console.info;
console.info = noop;
new Function(fix(fs.readFileSync(new URL('casora-panel-types.js', dir), 'utf8')))();
new Function(fix(fs.readFileSync(new URL('casora-panel.js', dir), 'utf8')))();
console.info = log;
const I = globalThis.window.__casoraPanelInternals;
const tile = { type: 'custom:button-card', template: 'casora_map', name: 'Landkarte' };
const pair = {
  desktop: { compact: { rooms: [{ name: 'Home', path: 'home', tiles: [tile] }] } },
  mobile: { compact: { rooms: [{ name: 'Favorites', tiles: [] }] } },
  link: { links: [{ room: 0, section: 0, overview: true }] },
};
I.syncPairTiles(pair);
assert.equal(pair.mobile.compact.rooms[0].tiles.length, 1, 'the tile without an entity is copied to the phone');
assert.equal(pair.mobile.compact.rooms[0].tiles[0].template, 'casora_map');
const typeRow = I.TILE_TYPES.find((x) => x.id === 'casora_map');
assert.ok(typeRow && typeRow.noEntity && typeRow.community, 'Community card, no device needed');
assert.deepEqual(typeRow.fields.filter((x) => x.key).map((x) => x.key), ['map_tile', 'map_entities', 'map_geo', 'map_hours', 'map_zoom', 'map_theme', 'icon', 'room_name']);
const mt = typeRow.fields.find((x) => x.key === 'map_tile');
assert.deepEqual([mt.type, mt.boolDefault], ['bool', true], 'Map on the tile: on by default');
const hass = { states: { 'geo_location.a': { state: '1', attributes: { source: 'usgs' } }, 'sensor.x': { state: '1' } } };
const geo = typeRow.fields.find((x) => x.key === 'map_geo').dynOptions(hass);
assert.deepEqual(geo.options, ['', 'all', 'usgs'], 'geo sources offered from the home');
assert.equal(typeof globalThis.window.casoraCommunityType, 'function');

console.log('landkarte: ok');
