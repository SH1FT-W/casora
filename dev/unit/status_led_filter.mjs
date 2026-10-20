// "Start fresh" leaves out status LEDs (setting "skip_leds", casora-panel-basis.js), not LED strips (Studio, 19.10.2026).
// The rule was "entity ID ends in _led": it also dropped real lamps such as an LED strip "Bett LED" (light.bett_led),
// while the status LEDs of routers and cameras (UniFi led_control, Reolink status_led) carry the config category in
// HA anyway and never reach the plan (in the test house all four do). Now: an ID ending in "status_led" or the
// integration's key of a status LED, with or without category.
//   node dev/unit/status_led_filter.mjs
import assert from 'node:assert/strict';
import { loadPanel } from './lib/testhaus.mjs';

await loadPanel();
const B = window.casoraBasis;
const hass = { states: {}, entities: {}, devices: {}, areas: { sz: { area_id: 'sz', name: 'Schlafzimmer' } }, language: 'de' };
const lamp = (eid, extra) => {
  const dev = 'd_' + eid.split('.')[1];
  hass.devices[dev] = { id: dev, name: eid.split('.')[1], area_id: 'sz' };
  hass.entities[eid] = Object.assign({ entity_id: eid, device_id: dev, platform: 'x' }, extra || {});
  hass.states[eid] = { entity_id: eid, state: 'on', attributes: { friendly_name: eid } };
};
lamp('light.bett_led'); // LED strip, a real lamp
lamp('light.becken_led_light'); // aquarium lamp
lamp('light.deckenlampe');
lamp('light.ap_flur_led', { entity_category: 'config', translation_key: 'led_control' }); // UniFi access point
lamp('light.kamera_status_led', { entity_category: 'config', translation_key: 'status_led' }); // Reolink camera
lamp('light.esp_buero_status_led'); // ESPHome status LED without category
lamp('light.kamera_hof_led', { translation_key: 'status_led' }); // status LED by key, category missing

const lights = () => {
  const plan = B.plan(hass, ['Schlafzimmer'], Object.assign({}, B.DEFAULTS));
  const room = plan.rooms.find((r) => r.name === 'Schlafzimmer');
  return [].concat(...room.items.map((x) => [].concat(x.group || [], x.entity || []))).filter((e) => /^light\./.test(e)).sort();
};
assert.deepEqual(lights(), ['light.becken_led_light', 'light.bett_led', 'light.deckenlampe'],
  'LED strip and aquarium lamp stay, status LEDs (by category, ID or key) stay out');
// With the setting off, only the category keeps a status LED out (as in the device assistant).
const off = B.plan(hass, ['Schlafzimmer'], Object.assign({}, B.DEFAULTS, { skip_leds: false }));
const all = [].concat(...off.rooms.find((r) => r.name === 'Schlafzimmer').items.map((x) => [].concat(x.group || [], x.entity || [])));
assert.ok(all.includes('light.esp_buero_status_led') && !all.includes('light.ap_flur_led'), 'setting off: category still counts');
console.log('status_led_filter: ok');
