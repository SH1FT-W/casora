// Detail round #11: the measurement page's label is the room, not the device; a reading's chart has its colour
// (richtlinien §7.3: temperature orange), also the chart tile's first series without a chosen colour.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/18-ziele.js', import.meta.url), 'utf8');
const a = src.indexOf('  Z.chartColor = function (st) {');
assert.ok(a > 0, 'Z.chartColor');
const chartColor = new Function(src.slice(a, src.indexOf('\n  };', a) + 5).replace('Z.chartColor = ', 'return ').trim())();
assert.match(chartColor({ attributes: { device_class: 'temperature' } }), /casora-color-orange/);
assert.match(chartColor({ attributes: { unit_of_measurement: '°C' } }), /casora-color-orange/);
assert.match(chartColor({ attributes: { device_class: 'humidity' } }), /casora-color-blue/);
assert.match(chartColor({ attributes: { device_class: 'carbon_dioxide' } }), /casora-color-teal/);
assert.equal(chartColor({ attributes: { device_class: 'power' } }), '', 'else the chart\'s own colour');
assert.ok(src.includes("color: Z.chartColor(st) }]"), 'measurement page uses it');
assert.ok(/back, roomV \|\| areaOf\(h, id\) \|\| ''\)/.test(src), 'label: the room, else the HA area');
const ch = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/27-chart.js', import.meta.url), 'utf8');
assert.ok(ch.includes("String(color || '').trim() || auto || STEPS[i % 4]"), 'chart tile: first series without a colour');
console.log('measure_page_v3: ok');
