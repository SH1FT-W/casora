// Door/window rows of the contacts popup (issue 135): an alarm panel with several zones showed every row as
// „<room> <panel name>“ – the device's name, then the room in front of the twins. A row is named after the entity
// (room below); the device's name only when the entity has no name of its own or just a kind word.
// All devices and names made up.
//   node dev/unit/contacts_row_names.mjs
// @deckt: custom_components/casora/scripts/local/00-finder.js#casoraContactRowName, dashboards/casora/button_card_templates.json#casora_popup_contacts
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
globalThis.addEventListener = () => {};
const load = (p) => new Function(fs.readFileSync(new URL('../../custom_components/casora/scripts/local/' + p, import.meta.url), 'utf8'))();
load('00-finder.js');

const areas = { hall: { name: 'Diele' }, living: { name: 'Stube' }, alarm: { name: 'Technik' }, bed: { name: 'Kammer' } };
const devices = {
  panel: { id: 'panel', name: 'Zentrale Musteralarm', area_id: 'alarm' },
  aqara: { id: 'aqara', name: 'Haustür', area_id: 'hall' },
  plain: { id: 'plain', name: 'Kontaktsensor Kammerfenster', area_id: 'bed' },
};
const entities = {}, states = {};
const add = (id, dev, area, name, dc) => {
  entities[id] = { entity_id: id, device_id: dev, area_id: area || null };
  states[id] = { entity_id: id, state: 'off', attributes: { friendly_name: name, device_class: dc } };
};
// Alarm panel (device in „Technik“), zones moved to their rooms, each with its own name.
add('binary_sensor.zone_1', 'panel', 'hall', 'Zentrale Musteralarm TÜR', 'door');
add('binary_sensor.zone_2', 'panel', 'living', 'Zentrale Musteralarm TERRASSE GARAGE', 'door');
add('binary_sensor.zone_3', 'panel', 'living', 'Zentrale Musteralarm TERRASSE', 'door');
// One-contact device whose entity is only „Kontakt“: the device names the door (issue #1).
add('binary_sensor.front', 'aqara', null, 'Haustür Kontakt', 'door');
add('binary_sensor.front_battery', 'aqara', null, 'Haustür Batterie', 'battery');
// Device name with a kind prefix, entity is the device's main entity.
add('binary_sensor.bed_window', 'plain', null, 'Kontaktsensor Kammerfenster', 'window');
const hass = { states, entities, devices, areas };

// The popup itself (Weich): rows through a stub of window._casoraUI.
const T = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const body = (s) => s.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
const rows = [];
window._casoraSoft = () => true;
window._casoraUI = {
  tokens: { ink: '#fff', ink2: '#ccc', ink3: '#999', font: 'system-ui' },
  esc: (t) => String(t), soft: () => true, v3: () => false,
  hero: () => '', line: () => '', note: () => '', headline: () => '',
  popupNames: (rs) => (r) => r,
  group: (rs) => { rows.push(...rs); return ''; },
};
const popup = new Function('states', 'entity', 'user', 'hass', 'variables', 'html', body(T.casora_popup_contacts.tap_action.casora_popup.content));
popup(states, null, {}, hass, {});
const byId = Object.fromEntries(rows.map((r) => [r.entity, r]));
assert.equal(byId['binary_sensor.zone_1'].label, 'TÜR', 'row names the zone, not the panel');
assert.equal(byId['binary_sensor.zone_1'].sub, 'Diele');
assert.equal(byId['binary_sensor.zone_2'].label, 'TERRASSE GARAGE');
assert.equal(byId['binary_sensor.front'].label, 'Haustür');
assert.ok(!rows.some((r) => /Musteralarm/.test(r.label)), 'no row named after the panel');

// The helper behind it.
const N = (id) => window.casoraContactRowName(hass, id);
assert.deepEqual(N('binary_sensor.zone_1'), { label: 'TÜR', sub: 'Diele' }, 'panel zone: its own name, room below');
assert.deepEqual(N('binary_sensor.zone_2'), { label: 'TERRASSE GARAGE', sub: 'Stube' });
assert.deepEqual(N('binary_sensor.front'), { label: 'Haustür', sub: 'Diele' }, 'kind word only: the device names it');
assert.deepEqual(N('binary_sensor.bed_window'), { label: 'Kammerfenster', sub: 'Kammer' }, 'kind prefix of the device name dropped');
// HA up to 2026.10: a user's entity name stands alone in friendly_name (docs/ha-annahmen.md).
states['binary_sensor.zone_1'].attributes.friendly_name = 'TÜR';
assert.deepEqual(N('binary_sensor.zone_1'), { label: 'TÜR', sub: 'Diele' }, 'user name without the device in front (HA 2026.10)');
window.CASORA_SETTINGS = { contacts: { names: { 'binary_sensor.zone_3': 'Wintergarten' } } };
assert.deepEqual(N('binary_sensor.zone_3'), { label: 'Wintergarten', sub: 'Stube' }, 'own name from the settings wins');

console.log('contacts_row_names: ok');
