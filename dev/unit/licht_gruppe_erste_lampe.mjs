// #37: Without an HA light group the setup names the first light as the group tile's entity, next to
// variables.lights. Tapping that light in the group popup found the group tile again (same popup), and a
// light whose room tile starts with it opened the room list. Expected: a group tile is never the own card
// of its first member - its own tile wins, else the light popup of the device.
//   node dev/unit/licht_gruppe_erste_lampe.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const read = (p) => fs.readFileSync(new URL('../../custom_components/casora/scripts/' + p, import.meta.url), 'utf8');
const core = read('casora-core.js');
const basis = read('local/01-basis.js');
const pick = (src, re) => { const m = src.match(re); assert.ok(m, String(re)); return m[0]; };

const house = { type: 'custom:button-card', template: 'casora_light', entity: 'light.a',
  variables: { lights: ['light.a', 'light.b', 'light.c'], active_entities: ['light.a', 'light.b', 'light.c'], house: true } };
const room = { type: 'custom:button-card', template: 'casora_light', entity: 'light.b',
  variables: { lights: ['light.b', 'light.c'], active_entities: ['light.b', 'light.c'] } };
const lampA = { type: 'custom:button-card', template: 'casora_light', entity: 'light.a' };
const group = { type: 'custom:button-card', template: 'casora_light', entity: 'light.g', variables: { lights: ['light.b', 'light.c'] } };

// Dashboard config (row in a group popup → openViaCard → findCardCfg).
const window = {};
new Function('window', pick(core, /  function standsForGroup\(cfg, entityId\) \{[\s\S]*?\n  \}\n  window\._casoraStandsForGroup = standsForGroup;\n/))(window);
const findCardCfg = new Function('window', pick(basis, /  function findCardCfg\(cfg, entityId\) \{[\s\S]*?\n  \}\n/) + ' return findCardCfg;')(window);
const cfg = { views: [{ cards: [house] }, { cards: [lampA] }, { cards: [room, group] }] };
assert.equal(findCardCfg(cfg, 'light.a'), lampA, 'first light of the house: its own tile, not the house tile');
assert.equal(findCardCfg(cfg, 'light.b'), null, 'first light of a room without own tile: no card (light popup of the device)');
assert.equal(findCardCfg(cfg, 'light.g'), group, 'an HA light group stays its own tile');
assert.equal(findCardCfg({ views: [{ cards: [house] }] }, 'light.a'), null, 'only the house tile: no card');

// Visible tiles (bell, rows without own target → tileFor).
const el = (c) => ({ _config: { tap_action: { casora_popup: {} }, ...c }, getClientRects: () => [1], shadowRoot: null });
const src = [
  pick(core, /  function templatesOf\(cfg\) \{[\s\S]*?\n  \}\n/),
  pick(core, /  function standsForGroup\(cfg, entityId\) \{[\s\S]*?\n  \}\n/),
  pick(core, /  function tileFor\(entityId\) \{[\s\S]*?\n  \}\n/),
].join('\n');
const tiles = [el(house), el(lampA), el(room)];
const document = { querySelectorAll: (sel) => (sel === 'button-card' ? tiles : []) };
const tileFor = new Function('document', src + ' return tileFor;')(document);
assert.equal(tileFor('light.a'), tiles[1], 'own tile before the house tile');
assert.equal(tileFor('light.b'), tiles[0], 'no own tile: still the group listing it (as before)');
console.log('ok licht_gruppe_erste_lampe');
