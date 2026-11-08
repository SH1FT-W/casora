// Issue #136: with Battery Notes every device stood twice in the battery popup („Weitere Geräte“) and the
// count „55 Batterien“ was too high – Battery Notes adds a second battery sensor („Battery+“, platform
// battery_notes) to the device next to the original. Expected: one row per device; two real batteries of one device
// (different readings) both stay; a list the user picked by hand stays as picked. Devices and names made up.
//   node dev/unit/battery_notes_twin.mjs
// @deckt: custom_components/casora/scripts/local/00-finder.js#casoraPopupHide
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null, addEventListener: () => {} };
globalThis.addEventListener = () => {};
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/00-finder.js', import.meta.url), 'utf8');
const a = src.indexOf('// ── Hidden rows of automatic popups');
new Function(src.slice(a, src.indexOf('// ── Velair:', a)))();
const H = window.casoraPopupHide;

const entities = {}, states = {};
const add = (id, platform, device, state, name) => {
  entities[id] = { entity_id: id, platform, device_id: device };
  states[id] = { entity_id: id, state, attributes: { device_class: 'battery', unit_of_measurement: '%', friendly_name: name } };
};
add('sensor.kitchen_sensor_battery', 'zha', 'd_kitchen', '32', 'Kitchen sensor');
add('sensor.kitchen_sensor_battery_plus', 'battery_notes', 'd_kitchen', '32', 'Kitchen sensor');
add('sensor.cam_battery', 'reolink', 'd_cam', '55', 'Cam');
add('sensor.cam_battery_2', 'reolink', 'd_cam', '55', 'Cam');
add('sensor.lock_battery', 'nuki', 'd_lock', '80', 'Lock');
add('sensor.lock_keypad_battery', 'nuki', 'd_lock', '40', 'Lock keypad');
add('sensor.only_notes_battery_plus', 'battery_notes', 'd_notes', '70', 'Notes only');
const hass = { entities, states, devices: {}, areas: {} };

const ids = (v) => H.batteries(states, v || {}, hass).map((e) => e.entity_id).sort();
assert.deepEqual(ids(), ['sensor.cam_battery', 'sensor.kitchen_sensor_battery', 'sensor.lock_battery', 'sensor.lock_keypad_battery',
  'sensor.only_notes_battery_plus'], 'one row per device; two different batteries of one device stay; a device only Battery Notes reads stays');
assert.equal(H.entries('casora_battery', hass, {}).length, 5, 'Studio list: the same rows');
const picked = ['sensor.kitchen_sensor_battery', 'sensor.kitchen_sensor_battery_plus'];
assert.deepEqual(ids({ batteries: picked }), picked, 'a hand-picked list stays as picked');
// The popup itself built its own list and kept both rows (reported again after 26.11.21; the tile and the Studio list
// were already right): the real template code, both popups (room/Home) and their width rule.
{
  const P = JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/panel/casora-templates.json', import.meta.url), 'utf8')).templates.casora_popup_battery;
  const hass = { entities, states };
  const window = globalThis;
  for (const key of ['tap_action', 'icon_tap_action']) {
    const c = P[key].casora_popup.content;
    const a = c.indexOf('const allBatteries = ('), b = c.indexOf('.sort((a, b) => a.battery_pct - b.battery_pct);', a);
    assert.ok(a > 0 && b > a, key + ': list found');
    const run = (filterList) => new Function('window', 'states', 'hass', 'variables', 'filterList', 'EXCLUDED_IDS', 'PERSONAL_DEVICE_RE',
      c.slice(a, b) + '; return allBatteries.map((e) => e.entity_id);')(window, states, hass, {}, filterList, new Set(), /^$^/);
    const ids = run(null);
    assert.ok(!ids.includes('sensor.kitchen_sensor_battery_plus'), key + ': Battery Notes twin gone');
    assert.ok(ids.includes('sensor.kitchen_sensor_battery'), key + ': the original stays');
    assert.ok(ids.includes('sensor.lock_keypad_battery') && ids.includes('sensor.lock_battery'), key + ': two real batteries stay');
    const picked = ['sensor.kitchen_sensor_battery', 'sensor.kitchen_sensor_battery_plus'];
    assert.deepEqual(run(picked), picked, key + ': a picked list stays as picked');
    assert.match(P[key].casora_popup.style, /batteryTwin/, key + ': the width counts the same rows');
  }
}

console.log('battery_notes_twin: ok');
