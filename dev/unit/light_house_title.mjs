// Issue #30: the house-wide "Lights" tile on Home (setup: entity = first light, variables.lights = all lights)
// opened a popup titled after the room of its first light, with "Leuchten im Raum" over every light of the house
// and that room as label. Now: "Beleuchtung", heading "Leuchten", no room label – detected at runtime for existing
// dashboards and marked by the setup (variables.house) for new ones. Room tiles keep their room, also when their
// list holds lamps of other rooms; light badges keep their entity's name.
//   node dev/unit/light_house_title.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const T = JSON.parse(read('dashboards/casora/button_card_templates.json'));

let soft = false;
globalThis.window = globalThis;
globalThis.document = { addEventListener: () => {}, querySelector: () => null, documentElement: {} };
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
globalThis.getComputedStyle = () => ({ getPropertyValue: () => (soft ? 'soft' : '') });
globalThis.innerWidth = 1200;
globalThis.addEventListener = () => {};
window.casoraIconUrl = (n) => '/casora_assets/icons/' + n + '.svg';

// Real code: setup plan, room lookup, soft light popup, light popup (LPC), room label of the popup head.
window.__casoraPanelInternals = { TILE_TYPES: [{ id: 'light', template: 'casora_light' }], clone: (x) => JSON.parse(JSON.stringify(x)) };
new Function(read('custom_components/casora/panel/casora-panel-basis.js'))();
const B = window.casoraBasis;
const basis = read('custom_components/casora/scripts/local/01-basis.js');
const b0 = basis.indexOf('window._casoraRoomNames = function');
new Function(basis.slice(b0, basis.indexOf('window._casoraStreamOk = function', b0)))();
const pop = read('custom_components/casora/scripts/local/03-popups.js');
const p0 = pop.lastIndexOf('(function () {', pop.indexOf('if (window._casoraLightSoft) return;'));
new Function(pop.slice(p0, pop.indexOf('\n})();', p0) + 6))();
const LS = window._casoraLightSoft;
let softCfg = null;
const cards0 = LS.cards;
LS.cards = (cfg, ...rest) => { softCfg = cfg; return cards0(cfg, ...rest); };
const lpcSrc = T.casora_popup_light.custom_fields.lpc_init;
new Function('entity', 'states', 'hass', 'variables', lpcSrc.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, ''))(null, {}, null, {});
const core = read('custom_components/casora/scripts/casora-core.js');
const cm = core.match(/  var HOUSE_POPUP = [^\n]*\n  function roomLabelOf\(src\) \{[\s\S]*?\n  \}\n/);
assert.ok(cm, 'roomLabelOf in casora-core.js');
const roomLabelOf = new Function(cm[0] + ' return roomLabelOf;')();

// A made-up house: areas, lights (no devices, like helpers), optional light groups.
function house(lights, groups = {}) {
  const h = { states: {}, entities: {}, devices: {}, areas: {} };
  for (const [id, name] of [['wz', 'Wohnzimmer'], ['ku', 'Küche'], ['bad', 'Bad'], ['flur', 'Flur']]) h.areas[id] = { area_id: id, name };
  for (const [id, area, name, on] of lights) {
    h.entities[id] = { entity_id: id, device_id: null, area_id: area, platform: 'template' };
    h.states[id] = { entity_id: id, state: on ? 'on' : 'off', attributes: { friendly_name: name, supported_color_modes: ['brightness'], brightness: on ? 128 : null } };
  }
  for (const [id, [name, members, area]] of Object.entries(groups)) {
    h.entities[id] = { entity_id: id, device_id: null, area_id: area || null, platform: 'group' };
    h.states[id] = { entity_id: id, state: 'off', attributes: { friendly_name: name, entity_id: members, supported_color_modes: ['brightness'] } };
  }
  return h;
}
const LIGHTS = [
  ['light.demo_wz_decke', 'wz', 'Wohnzimmer Decke', true],
  ['light.demo_wz_lese', 'wz', 'Leselampe'],
  ['light.demo_ku_spot', 'ku', 'Spot'],
  ['light.demo_bad_spiegel', 'bad', 'Beleuchtung Spiegel'],
];
const lightTile = (entity, variables, name) => ({ type: 'custom:button-card', template: 'casora_light', entity, ...(name ? { name } : {}), ...(variables ? { variables } : {}) });
const room = (title, tiles) => ({ title, path: title.toLowerCase(), cards: [{ type: 'custom:button-card', template: 'casora_room', name: title }, ...tiles] });
const useDash = (views) => { const cfg = { views }; window._casoraLovelaceCfg = () => cfg; return cfg; };

// The popup as a tile opens it: header title, soft body, room label above the title.
function popup(h, tile) {
  const vars = Object.assign({}, T.casora_popup_light.variables, T[tile.template].variables, tile.variables || {});
  const ent = h.states[tile.entity];
  soft = false;
  const head = window._casoraLPC(ent, h.states, h, vars, 'header');
  const title = head.title;
  // Standard look: the power control in the head names what it switches.
  const strs = (o) => (typeof o === 'string' ? [o] : o && typeof o === 'object' ? Object.values(o).flatMap(strs) : []);
  const std = strs(head.actions).join('\n');
  soft = true; softCfg = null;
  window._casoraLPC(ent, h.states, h, vars);
  const body = softCfg ? LS.render(softCfg, 'body', h.states, h, null) : '';
  soft = false;
  const label = roomLabelOf({ _config: { template: tile.template, variables: tile.variables }, _stateObj: ent, _hass: h });
  const heading = (body.match(/<div class="lps-lbl">([^<]*)<\/div><div class="lps-rows">/) || [])[1];
  return { title, std, body, label, heading };
}
const see = (r) => JSON.stringify([r.title, r.heading, r.label]);

// (a) Setup-shaped Home tile, no HA groups, on a dashboard made before the setup marked it.
{
  const h = house(LIGHTS);
  const p = B.plan(h, ['Wohnzimmer', 'Küche', 'Bad'], { ...B.DEFAULTS });
  const fav = p.rooms[0].items.find((x) => x.key === 'fav:light');
  assert.ok(fav && Array.isArray(fav.tile.variables.lights) && fav.tile.variables.lights.length === 4, 'setup: one Home tile over all lights');
  const old = JSON.parse(JSON.stringify(fav.tile));
  delete old.variables.house;
  useDash([{ path: 'home', cards: [old] }].concat(p.rooms.slice(1).map((r) => room(r.name, r.items.map((x) => x.tile)))));
  const r = popup(h, old);
  assert.equal(r.title, 'Beleuchtung', '(a) title: ' + r.title);
  assert.equal(r.heading, 'Leuchten', '(a) heading: ' + r.heading);
  assert.equal(r.label, '', '(a) no room label: ' + r.label);
  assert.ok(r.body.includes('>Wohnzimmer Decke<') && r.body.includes('>Beleuchtung Spiegel<'), '(a) lamp names not shortened');
  assert.ok(r.std.includes(': "Beleuchtung";') && !r.std.includes('"Wohnzimmer"'), '(a) standard look: power control label');
  // Room tile of the same dashboard (two lights, one area) keeps its room.
  const wz = p.rooms.find((x) => x.name === 'Wohnzimmer').items.find((x) => x.type === 'light').tile;
  const rw = popup(h, wz);
  assert.equal(rw.title, 'Wohnzimmer', '(a) room tile title: ' + rw.title);
  assert.equal(rw.heading, 'Leuchten im Raum', '(a) room tile heading');
}

// (b) Mixed: one plain room, the other rooms' tiles are area-less HA light groups (members are no tiles).
{
  const h = house(LIGHTS.concat([['light.demo_ku_2', 'ku', 'Spot 2'], ['light.demo_bad_2', 'bad', 'Decke']]), {
    'light.demo_kueche': ['Küche', ['light.demo_ku_spot', 'light.demo_ku_2']],
    'light.demo_bad': ['Bad', ['light.demo_bad_spiegel', 'light.demo_bad_2']],
  });
  const all = ['light.demo_wz_decke', 'light.demo_ku_spot', 'light.demo_ku_2', 'light.demo_bad_spiegel', 'light.demo_bad_2'];
  const home = lightTile('light.demo_wz_decke', { lights: all, active_entities: all }, 'Lichter');
  useDash([{ path: 'home', cards: [home] }, room('Wohnzimmer', [lightTile('light.demo_wz_decke')]),
    room('Kochnische', [lightTile('light.demo_kueche')]), room('Bad', [lightTile('light.demo_bad')])]);
  const r = popup(h, home);
  assert.equal(r.title, 'Beleuchtung', '(b) title: ' + r.title);
  assert.equal(r.heading, 'Leuchten', '(b) heading');
  assert.equal(r.label, '', '(b) no room label');
  // The room's group tile keeps the room's (Studio) name.
  assert.equal(popup(h, lightTile('light.demo_kueche')).title, 'Kochnische', '(b) group tile of a room');
}

// (c) Room tile with two lights in one area keeps the room name.
{
  const h = house(LIGHTS);
  const t = lightTile('light.demo_wz_decke', { lights: ['light.demo_wz_decke', 'light.demo_wz_lese'] }, 'Lichter');
  useDash([{ path: 'home', cards: [] }, room('Wohnzimmer', [t]), room('Küche', [lightTile('light.demo_ku_spot')])]);
  const r = popup(h, t);
  assert.equal(r.title, 'Wohnzimmer', '(c) title');
  assert.equal(r.heading, 'Leuchten im Raum', '(c) heading');
  assert.equal(r.label, 'Wohnzimmer', '(c) room label');
  assert.ok(r.body.includes('>Decke<'), '(c) lamp names lose the room name as before');
}

// (d) Room renamed in the Studio ("Kochecke", area "Küche") keeps its name.
{
  const h = house(LIGHTS.concat([['light.demo_ku_2', 'ku', 'Spot 2']]));
  const t = lightTile('light.demo_ku_spot', { lights: ['light.demo_ku_spot', 'light.demo_ku_2'] }, 'Lichter');
  useDash([{ path: 'home', cards: [] }, room('Kochecke', [t]), room('Wohnzimmer', [lightTile('light.demo_wz_decke')])]);
  const r = popup(h, t);
  assert.equal(r.title, 'Kochecke', '(d) title: ' + r.title);
  assert.equal(r.heading, 'Leuchten im Raum', '(d) heading');
}

// (e) An own popup title (room_name) wins; the list stays the house's.
{
  const h = house(LIGHTS);
  const all = LIGHTS.map((x) => x[0]);
  const home = lightTile('light.demo_wz_decke', { lights: all, room_name: 'Alle Lampen' }, 'Lichter');
  useDash([{ path: 'home', cards: [home] }, room('Wohnzimmer', [lightTile('light.demo_wz_decke')]), room('Küche', [lightTile('light.demo_ku_spot')]),
    room('Bad', [lightTile('light.demo_bad_spiegel')])]);
  const r = popup(h, home);
  assert.equal(r.title, 'Alle Lampen', '(e) own title in the popup');
  assert.equal(r.heading, 'Leuchten', '(e) heading');
  assert.equal(r.label, '', '(e) no room label');
  const expr = T.casora_light.tap_action.casora_popup.title.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
  const vars = Object.assign({}, T.casora_popup_light.variables, home.variables);
  assert.equal(new Function('entity', 'states', 'variables', 'hass', expr).call({ _config: home }, h.states[home.entity], h.states, vars, h), 'Alle Lampen', '(e) tile title');
}

// (f) A single lamp tile keeps its name and its room label.
{
  const h = house(LIGHTS);
  const t = lightTile('light.demo_bad_spiegel', null, 'Spiegel');
  useDash([{ path: 'home', cards: [] }, room('Bad', [t]), room('Küche', [lightTile('light.demo_ku_spot')])]);
  const expr = T.casora_light.tap_action.casora_popup.title.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
  const vars = Object.assign({}, T.casora_popup_light.variables, T.casora_light.variables);
  assert.equal(new Function('entity', 'states', 'variables', 'hass', expr).call({ _config: t }, h.states[t.entity], h.states, vars, h), 'Spiegel', '(f) tile title');
  assert.equal(window._casoraLightsHouse(vars, t.entity, null, h), false, '(f) one lamp is no house');
  assert.equal(roomLabelOf({ _config: t, _stateObj: h.states[t.entity], _hass: h }), 'Bad', '(f) room label');
}

// (g) All-lights HA group (plain lights, no area) as the Home tile.
{
  const h = house(LIGHTS, { 'light.demo_alle': ['Alle Lampen', LIGHTS.map((x) => x[0])] });
  const home = lightTile('light.demo_alle', null, 'Lichter');
  useDash([{ path: 'home', cards: [home] }, room('Wohnzimmer', [lightTile('light.demo_wz_decke')]), room('Küche', [lightTile('light.demo_ku_spot')])]);
  const r = popup(h, home);
  assert.equal(r.title, 'Beleuchtung', '(g) title: ' + r.title);
  assert.equal(r.heading, 'Leuchten', '(g) heading');
  assert.equal(r.label, '', '(g) no room label');
}

// (h) The setup marks the Home tile; the marker decides even where the lights look like one room.
{
  const h = house(LIGHTS);
  const p = B.plan(h, ['Wohnzimmer', 'Küche', 'Bad'], { ...B.DEFAULTS });
  const fav = p.rooms[0].items.find((x) => x.key === 'fav:light');
  assert.equal(fav.tile.variables.house, true, '(h) setup marks the Home light tile');
  p.rooms.slice(1).forEach((r) => r.items.forEach((x) => assert.ok(!(x.tile.variables || {}).house, '(h) room tiles are not marked: ' + r.name)));
  // Setup with an all-lights HA group: the Home tile takes it and is marked too.
  const hg = house(LIGHTS, { 'light.demo_alle': ['Alle Lampen', LIGHTS.map((x) => x[0])] });
  const fg = B.plan(hg, ['Wohnzimmer', 'Küche', 'Bad'], { ...B.DEFAULTS }).rooms[0].items.find((x) => x.key === 'fav:light');
  assert.deepEqual([fg.tile.entity, fg.tile.variables], ['light.demo_alle', { house: true }], '(h) group tile marked');
  // Only living room lights in the house: runtime sees one room, the marker still says house.
  const two = ['light.demo_wz_decke', 'light.demo_wz_lese'];
  const home = lightTile('light.demo_wz_decke', { lights: two, house: true }, 'Lichter');
  useDash([{ path: 'home', cards: [home] }, room('Wohnzimmer', [lightTile('light.demo_wz_decke', { lights: two })])]);
  const r = popup(h, home);
  assert.equal(r.title, 'Beleuchtung', '(h) title');
  assert.equal(r.heading, 'Leuchten', '(h) heading');
  assert.equal(r.label, '', '(h) no room label');
  assert.equal(popup(h, lightTile('light.demo_wz_decke', { lights: two }, 'Lichter')).title, 'Wohnzimmer', '(h) without marker: the room');
}

// (i) Setup-shaped Home tile without the marker whose first entry is a room's HA light group (with and without area).
for (const area of [true, false]) {
  const tag = area ? '(i) ' : '(i, no area) ';
  const h = house(LIGHTS.concat([['light.demo_ku_2', 'ku', 'Spot 2']]), {
    'light.demo_wohnzimmer': ['Wohnzimmer', ['light.demo_wz_decke', 'light.demo_wz_lese'], area ? 'wz' : null],
    'light.demo_kueche': ['Küche', ['light.demo_ku_spot', 'light.demo_ku_2'], area ? 'ku' : null],
  });
  const p = B.plan(h, ['Wohnzimmer', 'Küche', 'Bad'], { ...B.DEFAULTS });
  const fav = p.rooms[0].items.find((x) => x.key === 'fav:light');
  assert.equal(fav.tile.entity, 'light.demo_wohnzimmer', tag + 'Home tile entity is the first room group');
  const old = JSON.parse(JSON.stringify(fav.tile));
  delete old.variables.house;
  useDash([{ path: 'home', cards: [old] }].concat(p.rooms.slice(1).map((r) => room(r.name, r.items.map((x) => x.tile)))));
  const r = popup(h, old);
  assert.deepEqual([r.title, r.heading, r.label], ['Beleuchtung', 'Leuchten', ''], tag + 'Home tile: ' + see(r));
  assert.ok(r.std.includes(': "Beleuchtung";') && !r.std.includes('"Wohnzimmer"'), tag + 'standard look: power control label');
  const g = popup(h, lightTile('light.demo_wohnzimmer', null, 'Lights'));
  assert.deepEqual([g.title, g.heading, g.label], ['Wohnzimmer', 'Leuchten im Raum', 'Wohnzimmer'], tag + 'room group tile');
  // The lights badge of the house lists the same groups.
  h.states['input_select.demo_row'] = { entity_id: 'input_select.demo_row', state: 'none', attributes: {} };
  const badge = { type: 'custom:button-card', template: 'casora_badge_light_group', entity: 'input_select.demo_row',
    variables: { entity_1: 'light.demo_wohnzimmer', entity_2: 'light.demo_kueche', entity_3: 'light.demo_bad_spiegel' } };
  const b = popup(h, badge);
  assert.deepEqual([b.title, b.heading], ['Beleuchtung', 'Leuchten'], tag + 'lights badge: ' + see(b));
}

// (j) A scene tile in a room does not claim the lamps of other rooms it lists.
{
  const h = house(LIGHTS);
  h.states['scene.demo_abend'] = { entity_id: 'scene.demo_abend', state: 'scening', attributes: { friendly_name: 'Abend', entity_id: ['light.demo_wz_decke', 'light.demo_ku_spot'] } };
  const all = ['light.demo_wz_decke', 'light.demo_wz_lese', 'light.demo_ku_spot'];
  const home = lightTile('light.demo_wz_decke', { lights: all }, 'Lichter');
  useDash([{ path: 'home', cards: [home] }, room('Wohnzimmer', [lightTile('light.demo_wz_decke'),
    { type: 'custom:button-card', template: 'casora_scene', entity: 'scene.demo_abend' }])]);
  const r = popup(h, home);
  assert.deepEqual([r.title, r.heading, r.label], ['Beleuchtung', 'Leuchten', ''], '(j) Home tile: ' + see(r));
}

// (k) A room tile keeps its room when its list holds a lamp of another room: one tiled there, one from another
// room's area, or an own lamp also tiled in a further room. Desktop and phone dashboards.
{
  const h = house(LIGHTS.concat([['light.demo_ku_2', 'ku', 'Spot 2']]));
  const mixed = ['light.demo_wz_decke', 'light.demo_wz_lese', 'light.demo_ku_spot'];
  const cases = [
    ['lamp tiled in another room', mixed, room('Küche', [lightTile('light.demo_ku_spot')])],
    ["lamp of another room's area", mixed, room('Küche', [lightTile('light.demo_ku_2')])],
    ['own lamp also tiled elsewhere', ['light.demo_wz_decke', 'light.demo_wz_lese'], room('Leseecke', [lightTile('light.demo_wz_lese')])],
  ];
  for (const [what, list, other] of cases) {
    const t = lightTile('light.demo_wz_decke', { lights: list }, 'Lichter');
    useDash([{ path: 'home', cards: [] }, room('Wohnzimmer', [t]), other]);
    const r = popup(h, t);
    assert.deepEqual([r.title, r.heading, r.label], ['Wohnzimmer', 'Leuchten im Raum', 'Wohnzimmer'], '(k) ' + what + ': ' + see(r));
  }
  // Phone: one view, rooms under headers, the Home tiles under the favorites header.
  const header = (name, fav) => ({ type: 'custom:button-card', template: 'casora_mobile_header', name, ...(fav ? { variables: { favorites: true } } : {}) });
  const home = lightTile('light.demo_wz_decke', { lights: LIGHTS.map((x) => x[0]) }, 'Lichter');
  const t = lightTile('light.demo_wz_decke', { lights: mixed }, 'Lichter');
  useDash([{ path: 'home', cards: [header('Favoriten', true), home, header('Wohnzimmer'), t, header('Küche'), lightTile('light.demo_ku_spot'),
    header('Bad'), lightTile('light.demo_bad_spiegel')] }]);
  assert.equal(popup(h, t).title, 'Wohnzimmer', '(k) phone: room tile');
  const r = popup(h, home);
  assert.deepEqual([r.title, r.heading, r.label], ['Beleuchtung', 'Leuchten', ''], '(k) phone: Home tile ' + see(r));
}

// (l) A light badge for a group over several rooms (a floor) keeps the group's name, like the badge itself.
{
  const h = house(LIGHTS, { 'light.demo_etage': ['Etage', ['light.demo_wz_decke', 'light.demo_ku_spot']] });
  useDash([{ path: 'home', cards: [] }, room('Wohnzimmer', [lightTile('light.demo_wz_decke')]), room('Küche', [lightTile('light.demo_ku_spot')])]);
  const r = popup(h, { type: 'custom:button-card', template: 'casora_badge_light', entity: 'light.demo_etage' });
  assert.equal(r.title, 'Etage', '(l) badge popup title: ' + r.title);
}

// (m) Without a dashboard (Studio preview) the check looks up the page once, not once per lamp.
{
  const many = Array.from({ length: 12 }, (_, i) => ['light.demo_n' + i, i % 2 ? 'wz' : 'ku', 'Lampe ' + i]);
  const h = house(many);
  const ids = many.map((x) => x[0]);
  let n = 0;
  window._casoraLovelaceCfg = () => { n++; return null; };
  assert.equal(window._casoraLightsHouse({ lights: ids }, ids[0], ids, h), true, '(m) the areas still tell the house');
  assert.equal(n, 1, '(m) page lookups: ' + n);
}

// Cached LPC code from before is replaced; English for the new heading.
assert.ok(Number((lpcSrc.match(/window\._casoraLPCv !== (\d+)/) || [])[1]) >= 84, 'LPC version bumped');
assert.equal(JSON.parse(read('custom_components/casora/translations/dashboard/phrases/en.json')).exact.Leuchten, 'Lights');
console.log('light_house_title: ok');
