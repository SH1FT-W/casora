// Carbon monoxide in the air quality popup (#95): its own field, thresholds and icon. "carbon_monoxide" contains
// "carbon", which used to give it the CO2 thresholds (1000/1500/2000 ppm), so it always read "good".
//   node dev/unit/air_quality_co.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const T = JSON.parse(read('dashboards/casora/button_card_templates.json'));
const all = JSON.stringify(T);

// 1. Every list of air quality sensors passed to the popup has CO next to CO2.
const lists = all.match(/aqi_entity_pm25,[^\]]*\]/g) || [];
assert.ok(lists.length >= 12, 'lists found: ' + lists.length);
lists.forEach((l) => assert.ok(/aqi_entity_co2,[^,]*aqi_entity_co\]/.test(l), 'CO in ' + l));
console.log('ok CO in', lists.length, 'sensor lists');

// 2. The popup's compact threshold function: CO gets 9/35/100 ppm, CO2 keeps its own.
const m = all.match(/const sensorThresh=\(eid\)=>\{.*?return\{good:null,moderate:null,high:null\};\};/);
assert.ok(m, 'sensorThresh found');
const src = JSON.parse('"' + m[0] + '"');
const thresh = (states) => new Function('states', src + ' return sensorThresh;')(states);
const st = { 'sensor.demo_co': { state: '4', attributes: { device_class: 'carbon_monoxide' } },
  'sensor.demo_kohlenmonoxid': { state: '4', attributes: {} },
  'sensor.demo_co2': { state: '800', attributes: { device_class: 'carbon_dioxide' } } };
const f = thresh(st);
assert.deepEqual(f('sensor.demo_co'), { good: 9, moderate: 35, high: 100 }, 'CO by device class');
assert.deepEqual(f('sensor.demo_kohlenmonoxid'), { good: 9, moderate: 35, high: 100 }, 'CO by name');
assert.deepEqual(f('sensor.demo_co2'), { good: 1000, moderate: 1500, high: 2000 }, 'CO2 unchanged');
console.log('ok thresholds');

// 3. CO before CO2 wherever both are checked (thresholds, badge level, icon).
const co = (all.match(/dc === 'carbon_monoxide'\)/g) || []).length + (all.match(/dc==='carbon_monoxide'\)/g) || []).length;
assert.ok(co >= 7, 'CO checks: ' + co);
console.log('ok CO checks:', co);

// 4. Studio: the field and the phone's room-to-chips list.
assert.ok(read('custom_components/casora/panel/casora-panel.js').includes('E("aqi_entity_co", "CO", ["sensor"]), classes: ["carbon_monoxide"]'), 'Studio field');
assert.ok(read('custom_components/casora/scripts/casora-core.js').includes("'aqi_entity_co2', 'aqi_entity_co']"), 'phone room list');
console.log('air_quality_co: ok');
