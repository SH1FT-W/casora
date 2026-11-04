// Oven tile „Backofen“ (casora_oven, owner 04.11.2026) without HA. Before, an oven reached a tile only as
// „Geschirrspüler“ or „Gerät mit Ablauf“ (with the dishwasher's symbol); the Studio offered no oven.
//  1. casoraOvenFind (00-finder.js) finds the test house's ovens – Home Connect in HA core and Home Connect Local – and
//     nothing else (no dishwasher, coffee machine, fridge); an oven reporting only its programme counts too.
//  2. Tile words: off „Aus“, ready „Bereit“, heating „Heizt auf 180 °C“, at temperature „178 °C“, with the time left
//     („noch 24 Min.“) or the finish time („Fertig um …“), paused, done, unavailable; highlight level and colour.
//  3. The oven popup (_casoraOven in 02-devices.js) takes its fields from the same table.
//  4. Template casora_oven: oven symbol, casora_entity + casora_popup_oven, tap opens the oven popup, hold per the
//     global hold setting, the tile's text from casoraOvenFind (the Studio preview has it).
//  5. Studio: tile type „Oven“; adding it suggests the ovens as sure matches; the assistant suggests them as ovens,
//     never as dishwashers; „Backofen“ finds the type.
// Devices and names invented (dev/casora_mock/oven.py).   node dev/unit/oven_tile.mjs
// @deckt: custom_components/casora/scripts/local/00-finder.js#casoraOvenFind custom_components/casora/scripts/local/02-devices.js#_casoraOven
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { testhaus, loadPanel } from './lib/testhaus.mjs';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
const ROOT = new URL('../../', import.meta.url);
const rd = (p) => fs.readFileSync(new URL(p, ROOT), 'utf8');
new Function(rd('custom_components/casora/scripts/local/00-finder.js'))();
const OF = window.casoraOvenFind;
assert.ok(OF && OF.tile && OF.all, 'casoraOvenFind missing (00-finder.js)');

// ── 1. Finder on the test house ──────────────────────────────────────────
const H = testhaus({ publicOnly: true });
const S = H.states;
const all = OF.all(H);
assert.deepEqual(all.map((o) => [o.device, o.anchor, o.source]).sort(), [
  [H.entities['sensor.testbackofen_betriebszustand'].device_id, 'sensor.testbackofen_betriebszustand', 'home_connect'],
  [H.entities['sensor.testofen_betriebszustand'].device_id, 'sensor.testofen_betriebszustand', 'homeconnect_ws'],
].sort(), 'test house: the two ovens, by their keys');
assert.equal(OF.is(H, 'switch.testofen_kindersicherung'), true, 'any entity of the oven');
const notOven = Object.keys(S).filter((id) => /^sensor\..*(spuel|geschirr|kaffee|coffee|frost)/i.test(id)).filter((id) => OF.is(H, id));
assert.deepEqual(notOven, [], 'no dishwasher, coffee machine or fridge of the test house is an oven');
const c0 = OF.find(H, 'sensor.testofen_betriebszustand');
assert.equal(c0.temp, 'sensor.testofen_aktuelle_temperatur');
assert.equal(c0.target, 'number.testofen_sollwert_temperatur');
assert.equal(c0.powerSel, 'select.testofen_betriebszustand');
assert.equal(OF.field(H, 'sensor.testbackofen_betriebszustand', 'temp'), 'sensor.testbackofen_aktuelle_garraumtemperatur');
// Only a programme (no cavity sensor): still an oven; the same keys with a dishwasher programme: none.
{
  const ent = (id, key) => ({ entity_id: id, device_id: 'ov', platform: 'home_connect', translation_key: key });
  const h = (opt) => ({ devices: { ov: { id: 'ov', name: 'Ofen' } },
    entities: { 'sensor.o_st': ent('sensor.o_st', 'operation_state'), 'select.o_sel': ent('select.o_sel', 'selected_program') },
    states: { 'sensor.o_st': { state: 'ready', attributes: {} }, 'select.o_sel': { state: opt, attributes: { options: [opt] } } } });
  assert.equal(OF.is(h('cooking_oven_program_heating_mode_hot_air'), 'sensor.o_st'), true, 'programme only: oven');
  assert.deepEqual(OF.all(h('cooking_oven_program_heating_mode_hot_air')).map((o) => o.anchor), ['sensor.o_st']);
  assert.equal(OF.is(h('dishcare_dishwasher_program_eco_50'), 'sensor.o_st'), false, 'dishwasher programme: no oven');
}

// ── 2. Tile words ────────────────────────────────────────────────────────
const WS = 'sensor.testofen_betriebszustand', HC = 'sensor.testbackofen_betriebszustand';
const set = (o) => Object.entries(o).forEach(([id, v]) => { S[id] = { ...S[id], state: String(v) }; });
const tile = (id) => OF.tile(H, id, S);
assert.equal(tile(WS), 'Aus', 'Home Connect Local in standby: Aus');
assert.equal(OF.level(H, WS, S), 0);
assert.equal(tile(HC), 'Bereit', 'Home Connect core, on and ready');
set({ 'switch.testbackofen_einschalter': 'off' });
assert.equal(tile(HC), 'Aus', 'power off: Aus');
set({ [WS]: 'run', 'select.testofen_betriebszustand': 'on', 'sensor.testofen_aktuelle_temperatur': 152 });
assert.equal(tile(WS), 'Heizt auf 180 °C', 'well below the target: heating up');
assert.equal(OF.level(H, WS, S), 1, 'highlighted while running');
assert.equal(OF.color(1), 'var(--casora-color-orange, #DE8A4E)');
set({ 'sensor.testofen_aktuelle_temperatur': 178 });
assert.equal(tile(WS), '178 °C', 'at temperature: the cavity');
set({ 'sensor.testofen_verbleibende_programmlaufzeit': 0.4 });
assert.equal(tile(WS), '178 °C · noch 24 Min.', 'time left in hours (Home Connect Local)');
set({ 'sensor.testofen_verbleibende_programmlaufzeit': 2 });
assert.ok(/^178 °C · Fertig um \d\d:\d\d$/.test(tile(WS)), 'over an hour: the finish time – ' + tile(WS));
set({ [WS]: 'pause' });
assert.equal(tile(WS), 'Pausiert · 178 °C');
set({ [WS]: 'finished' });
assert.equal(tile(WS), 'Fertig'); assert.equal(OF.level(H, WS, S), 1, 'done: the food is inside');
set({ [WS]: 'error' });
assert.equal(OF.level(H, WS, S), 2); assert.equal(OF.color(2), 'var(--casora-color-red, #FF453A)');
set({ [WS]: 'unavailable' });
assert.equal(tile(WS), 'Nicht verfügbar'); assert.equal(OF.level(H, WS, S), 0);
assert.equal(OF.tile(H, 'sensor.gibt_es_nicht', S), 'Nicht verfügbar', 'entity gone: calm, no TypeError');
assert.equal(OF.tile(H, undefined, S), '', 'no entity: no text'); assert.equal(OF.level(H, undefined, S), 0);
// Home Connect core: the finish time is a timestamp.
set({ 'switch.testbackofen_einschalter': 'on', [HC]: 'run', 'sensor.testbackofen_aktuelle_garraumtemperatur': 200 });
S['sensor.testbackofen_programm_endzeit'] = { ...S['sensor.testbackofen_programm_endzeit'], state: new Date(Date.now() + 10 * 60000 + 5000).toISOString() };
assert.equal(tile(HC), '200 °C · noch 10 Min.');

// ── 3. The popup reads the same table ───────────────────────────────────
{
  const src = rd('custom_components/casora/scripts/local/02-devices.js');
  const a = src.indexOf('(function () {\n  if (window._casoraOven) return;');
  const b = src.indexOf('\n})();', a);
  assert.ok(a > 0 && b > a, '_casoraOven block');
  globalThis.document = { querySelector: () => null };
  new Function(src.slice(a, b + 6))();
  const O = window._casoraOven;
  const c = O.find(H, WS);
  assert.equal(c.temp, c0.temp); assert.equal(c.st, WS); assert.equal(c.power, 'select.testofen_betriebszustand');
  assert.equal(O.is(H, HC), true); assert.equal(O.tile(WS, S, H), tile(WS));
  assert.ok(!/var FIELDS = \{/.test(src.slice(a, b)), 'no second field table in 02-devices.js');
}

// ── 4. Template ─────────────────────────────────────────────────────────
const T = JSON.parse(rd('dashboards/casora/button_card_templates.json'));
const t = T.casora_oven, p = T.casora_popup_oven;
assert.ok(t && p, 'templates casora_oven / casora_popup_oven');
assert.deepEqual(t.template, ['casora_entity', 'casora_popup_oven']);
assert.equal(t.variables.icon, 'stove', 'oven symbol, not the dishwasher');
assert.ok(/casoraOvenFind[\s\S]*O\.tile\(hass, entity\?\.entity_id, states\)/.test(t.state_display), 'tile text from casoraOvenFind');
assert.ok(/CASORA_HOLD_MENU/.test(t.hold_action.action), 'hold per the global hold setting');
assert.deepEqual(t.icon_tap_action, { action: 'none' }, 'icon tap = tile tap');
const pop = p.tap_action.casora_popup;
assert.ok(/window\._casoraOven\.popup\(entity\?\.entity_id, states, hass\)/.test(pop.content), 'tap opens the oven popup');
assert.equal(pop.variant, 'v3');
assert.ok(/casoraPopupWidth\('two'\)/.test(pop.style), 'two columns like the oven popup on the appliance tile');
assert.ok(/'Backofen'/.test(pop.title), 'title falls back to „Backofen“');
const B = JSON.parse(rd('custom_components/casora/panel/casora-templates.json')).templates;
assert.ok(B.casora_oven && B.casora_popup_oven && /casoraOvenFind/.test(B.casora_oven.state_display),
  'casora-templates.json rebuilt (tools/build-templates.py)');

// ── 5. Studio ───────────────────────────────────────────────────────────
const H2 = testhaus({ publicOnly: true });
const { P, I } = await loadPanel();
const type = I.TILE_TYPES.find((x) => x.id === 'casora_oven');
assert.ok(type && type.template === 'casora_oven' && type.icon === 'stove', 'tile type „Oven“');
const home = { path: 'home', name: 'Home', tiles: [], variables: {} };
const pp = Object.create(P); pp._hass = H2; pp._state = { compact: { rooms: [home] } }; pp._room = 0;
const cands = P._tileCandidates.call(pp, type, home);
assert.deepEqual(cands.map((x) => x.id).sort(), [HC, WS].sort(), 'new oven tile suggests the two ovens and nothing else');
assert.ok(cands.every((x) => x.sure), 'as sure matches');
const dish = I.TILE_TYPES.find((x) => x.id === 'casora_dishwasher');
assert.ok(!P._tileCandidates.call(pp, dish, home).some((x) => x.id === HC || x.id === WS), 'the dishwasher tile does not offer the ovens');
const sug = window.casoraAssist.suggest(H2, [home], I.TILE_TYPES);
assert.deepEqual(sug.filter((x) => x.type === 'casora_oven').map((x) => x.entity).sort(), [HC, WS].sort(), 'assistant suggests the ovens');
assert.ok(!sug.some((x) => x.type !== 'casora_oven' && (x.entity === HC || x.entity === WS)), 'the ovens under no other type');
assert.ok(/casora_oven: \["backofen"/.test(rd('custom_components/casora/panel/casora-panel-assist.js')), '„Backofen“ finds the oven type');
console.log('oven_tile: ok');
