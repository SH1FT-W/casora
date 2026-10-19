// Lights found when setting up (Basis, Device Assistant, badge fill all use casoraAssist.suggest): lamps behind a hub
// (Hue, Zigbee, Matter), several lights on one device, entity area before device area, a power sensor on the
// dashboard does not hide the lamp, the light of a ceiling fan, and the light badge reads all ten lights.
//   node dev/unit/licht_erkennung.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null, addEventListener() {}, head: { appendChild() {} }, createElement: () => ({ style: {} }) };
globalThis.addEventListener = () => {};
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null, define() {} };
const src = (p) => fs.readFileSync(new URL('../../custom_components/casora/' + p, import.meta.url), 'utf8');
new Function(src('scripts/local/00-finden.js'))();
new Function(src('panel/casora-panel-assist.js'))();

const hass = { states: {}, entities: {}, devices: {}, areas: { wz: { area_id: 'wz', name: 'Wohnzimmer' }, ku: { area_id: 'ku', name: 'Küche' }, bu: { area_id: 'bu', name: 'Büro' } } };
const dev = (id, name, area, extra) => { hass.devices[id] = Object.assign({ id, name, area_id: area }, extra || {}); };
const ent = (eid, device, extra, attrs) => {
  hass.entities[eid] = Object.assign({ entity_id: eid, device_id: device }, extra || {});
  hass.states[eid] = { entity_id: eid, state: 'off', attributes: Object.assign({ friendly_name: eid }, attrs || {}) };
};
dev('bridge', 'Bridge', null);
dev('hue1', 'Stehlampe', 'wz', { via_device_id: 'bridge' });
ent('light.stehlampe', 'hue1');
dev('zcoord', 'Coordinator', null);
dev('z1', 'Deckenlampe Küche', 'ku', { via_device_id: 'zcoord' });
ent('light.deckenlampe_kueche', 'z1'); ent('sensor.deckenlampe_kueche_linkquality', 'z1', { entity_category: 'diagnostic' });
// Part of another device behind it (no light): stays out.
dev('printer', 'Drucker', 'bu'); dev('ams', 'AMS', 'bu', { via_device_id: 'printer' });
ent('sensor.ams_humidity', 'ams');
// Two-channel dimmer: one light per channel, second channel assigned to another room.
dev('dim', 'Dimmer 2PM', 'wz');
ent('light.dimmer_kanal_1', 'dim', {}, { friendly_name: 'Leselampe' });
ent('light.dimmer_kanal_2', 'dim', { area_id: 'ku' }, { friendly_name: 'Unterschrank' });
ent('sensor.dimmer_power', 'dim', {}, { device_class: 'power' });
// Plug-in lamp whose power sensor is already on the dashboard (room energy list).
dev('plug', 'Lichterkette', 'wz');
ent('light.lichterkette', 'plug'); ent('sensor.lichterkette_power', 'plug', {}, { device_class: 'power' });
// Ceiling fan with a light.
dev('fan', 'Deckenventilator', 'bu');
ent('fan.deckenventilator', 'fan'); ent('light.deckenventilator_licht', 'fan', {}, { friendly_name: 'Ventilator Licht' });
// Light of a device that already has a tile: not suggested again.
dev('used', 'Alte Lampe', 'wz'); ent('light.alte_lampe', 'used');

const types = ['light', 'fan', 'cover', 'thermostat', 'media', 'lock', 'vacuum', 'humidifier', 'casora_camera', 'casora_alarm']
  .map((id) => ({ id, label: id }));
const rooms = [{ name: 'Wohnzimmer', tiles: [{ entity: 'light.alte_lampe' }], energy_entities: ['sensor.lichterkette_power'] },
  { name: 'Küche', tiles: [] }, { name: 'Büro', tiles: [] }];
const out = window.casoraAssist.suggest(hass, rooms, types);
const by = (e) => out.find((x) => x.entity === e);
const where = (e) => by(e) && by(e).room;

assert.equal(where('light.stehlampe'), 'Wohnzimmer', 'Hue lamp behind the bridge');
assert.equal(where('light.deckenlampe_kueche'), 'Küche', 'Zigbee lamp behind the coordinator');
assert.ok(!out.some((x) => x.device === 'ams'), 'printer part stays out');
assert.equal(where('light.dimmer_kanal_1'), 'Wohnzimmer');
assert.equal(where('light.dimmer_kanal_2'), 'Küche', 'channel in its own area');
assert.equal(by('light.dimmer_kanal_2').name, 'Unterschrank');
assert.notEqual(by('light.dimmer_kanal_1').id, by('light.dimmer_kanal_2').id, 'one id per channel');
assert.equal(where('light.lichterkette'), 'Wohnzimmer', 'power sensor on the dashboard does not hide the lamp');
assert.equal(by('fan.deckenventilator').type, 'fan');
assert.equal(by('light.deckenventilator_licht').type, 'light', 'fan light as its own tile');
assert.equal(where('light.deckenventilator_licht'), 'Büro');
assert.ok(!by('light.alte_lampe'), 'lamp on a tile is not suggested again');

// Light badge: the room passes ten lights, the badge reads all ten.
const T = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const badge = JSON.stringify(T.casora_badge_light_group);
assert.ok(badge.includes('variables?.entity_10') && !/entity_8\\n\s*\]/.test(badge), 'badge reads entity_9 and entity_10');
assert.ok('entity_10' in T.casora_badge_light_group.variables);
console.log('licht_erkennung: ok');
