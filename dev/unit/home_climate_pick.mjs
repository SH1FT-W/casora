// Home's climate badge on setup (#96): which temperature, humidity and thermostats Casora picks.
// A NAS's "durchschnittliche_festplattentemperatur" read as the house average ("Durchschnitt"), and a heat pump
// without an area came first among the thermostats.
//   node dev/unit/home_climate_pick.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
const src = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
window.__casoraPanelInternals = { TILE_TYPES: [], clone: (x) => JSON.parse(JSON.stringify(x)) };
new Function(src('custom_components/casora/panel/casora-panel-basis.js'))();
const B = window.casoraBasis;
// The assistant's suggestions (casora-panel-assist.js) reduced to what this test needs: thermostats and their room.
window.casoraAssist = { suggest: (hass) => Object.keys(hass.states).filter((id) => id.startsWith('climate.'))
  .map((id) => ({ id, type: 'thermostat', entity: id, name: id, room: hass.entities[id].area_id ? 'Wohnzimmer' : null })) };

function house(extra) {
  const h = { states: {}, entities: {}, devices: {}, areas: { wz: { area_id: 'wz', name: 'Wohnzimmer' } } };
  const add = (eid, state, attributes, { area = null, device = null } = {}) => {
    h.entities[eid] = { entity_id: eid, device_id: device, area_id: area, platform: 'demo' };
    h.states[eid] = { entity_id: eid, state, attributes };
  };
  add('sensor.demo_nas_volume_1_durchschnittliche_festplattentemperatur', '41',
    { device_class: 'temperature', friendly_name: 'Demo NAS Volume 1 Durchschnittliche Festplattentemperatur' }, { device: 'nas' });
  add('sensor.demo_wz_temperatur', '21.5', { device_class: 'temperature', friendly_name: 'Wohnzimmer Temperatur' }, { area: 'wz', device: 'th' });
  add('sensor.demo_wz_feuchte', '48', { device_class: 'humidity', friendly_name: 'Wohnzimmer Luftfeuchtigkeit' }, { area: 'wz', device: 'th' });
  add('climate.demo_waermepumpe', 'heat', { friendly_name: 'Wärmepumpe Heizung' });
  add('climate.demo_flur', 'heat', { friendly_name: 'Flur Thermostat' });
  add('climate.demo_wz', 'heat', { friendly_name: 'Wohnzimmer Thermostat' }, { area: 'wz' });
  (extra || ((x) => x))(add);
  return h;
}
const home = (h) => { const t = { name: 'Home', home: true, vars: {} }; B.fillBadges(h, [t]); return t.vars; };

// 1. The NAS disk is no house temperature; Home takes the room's sensor instead.
{
  const v = home(house());
  assert.notEqual(v.temp_sensor_1, 'sensor.demo_nas_volume_1_durchschnittliche_festplattentemperatur', 'NAS disk is no house temperature');
  console.log('ok NAS disk skipped:', v.temp_sensor_1 || '(none)');
}
// 2. "Durchschnitt" still counts for a helper without a device (min_max, group).
{
  const v = home(house((add) => add('sensor.durchschnittstemperatur', '21', { device_class: 'temperature', friendly_name: 'Durchschnittstemperatur' })));
  assert.equal(v.temp_sensor_1, 'sensor.durchschnittstemperatur', 'average helper is the house temperature');
  console.log('ok average helper kept');
}
// 3. A heat pump without an area comes after the other thermostats.
{
  const v = home(house());
  const cl = [v.climate_entity_1, v.climate_entity_2, v.climate_entity_3].filter(Boolean);
  assert.ok(cl.length >= 2, 'thermostats picked: ' + cl);
  assert.equal(cl[cl.length - 1], 'climate.demo_waermepumpe', 'heat pump last: ' + cl);
  console.log('ok heat pump last:', cl.join(', '));
}
console.log('home_climate_pick: ok');
