// Every entity field of a room asks _rankedEntityList while the inspector draws; each call folded the names of
// all entities (NFD) and sorted them again – a quarter of a room switch (profile on a test HA: 147 ms over 12
// switches, after the memo 39 ms; room switch median ~45 → ~32 ms). Now ranked once per state of hass.
// The order must stay the same: this room's devices first, then by name; config/diagnostic out except the
// current one; a changed name or registry is picked up.
//   node dev/unit/studio_ranked_entities_memo.mjs
// @deckt: custom_components/casora/panel/casora-panel.js#_rankedEntityList,_entityList
import assert from 'node:assert/strict';
import { loadPanel } from './lib/testhaus.mjs';

const { P } = await loadPanel();
const st = (name) => ({ state: 'off', attributes: { friendly_name: name } });
const hass = {
  states: {
    'light.zeta_kitchen': st('Zeta lamp'),
    'light.alpha': st('Alpha lamp'),
    'light.beta': st('Beta lamp'),
    'light.status_led': st('Status LED'),
    'light.kuche_band': st('Strip'),
  },
  entities: {
    'light.zeta_kitchen': { entity_id: 'light.zeta_kitchen', area_id: 'kueche' },
    'light.alpha': { entity_id: 'light.alpha' },
    'light.beta': { entity_id: 'light.beta', device_id: 'dev1' },
    'light.status_led': { entity_id: 'light.status_led', entity_category: 'config' },
    'light.kuche_band': { entity_id: 'light.kuche_band' },
  },
  devices: { dev1: { id: 'dev1', area_id: 'wohnen' } },
  areas: { kueche: { area_id: 'kueche', name: 'Küche' }, wohnen: { area_id: 'wohnen', name: 'Wohnen' } },
};
const p = Object.create(P);
p._hass = hass;
let pretty = 0;
const pe = P._prettyEntity;
p._prettyEntity = function (v) { pretty++; return pe.call(this, v); };
const kitchen = { path: 'kueche', name: 'Küche', tiles: [] };
const living = { path: 'wohnen', name: 'Wohnen', tiles: [] };

const a = p._rankedEntityList(['light'], null, kitchen, '', null);
// Area (zeta) and name match ("kuche" in the id) first, then by name; the config LED drops out.
assert.deepEqual(a, ['light.kuche_band', 'light.zeta_kitchen', 'light.alpha', 'light.beta']);
const first = pretty;
assert.ok(first > 0);
const b = p._rankedEntityList(['light'], null, kitchen, '', null);
assert.deepEqual(b, a, 'same answer');
assert.notEqual(b, a, 'a copy: a caller may change it');
assert.equal(pretty, first, 'second field with the same list: no names read again');
b.push('x');
assert.equal(p._rankedEntityList(['light'], null, kitchen, '', null).length, 4, 'memo not changed by a caller');

// Another room: its own order, names from the memo.
assert.deepEqual(p._rankedEntityList(['light'], null, living, '', null), ['light.beta', 'light.alpha', 'light.kuche_band', 'light.zeta_kitchen']);
assert.equal(pretty, first, 'names folded once per entity');
// The current one stays, even as config.
assert.ok(p._rankedEntityList(['light'], null, kitchen, 'light.status_led', null).includes('light.status_led'));

// New state of hass (a name changed): ranked again.
p._hass = { ...hass, states: { ...hass.states, 'light.alpha': st('Zulu lamp') } };
assert.deepEqual(p._rankedEntityList(['light'], null, kitchen, '', null), ['light.kuche_band', 'light.zeta_kitchen', 'light.beta', 'light.alpha']);
// Registry changed only (an entity moved into the kitchen): ranked again.
p._hass = { ...p._hass, entities: { ...hass.entities, 'light.beta': { entity_id: 'light.beta', area_id: 'kueche' } } };
assert.deepEqual(p._rankedEntityList(['light'], null, kitchen, '', null).slice(0, 3).sort(), ['light.beta', 'light.kuche_band', 'light.zeta_kitchen']);

console.log('ok studio_ranked_entities_memo');
