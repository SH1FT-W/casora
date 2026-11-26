// @deckt: custom_components/casora/panel/casora-panel.js#isClockSensor,_entityList,_rankedEntityList,SECTIONS
// Studio › Look › Clock › Time sensor (Prüfrunde u03-06): the list offered every sensor (energy, power, temperature)
// and took a temperature without a word. It offers sensors that show a time now, keeps the value already chosen, and
// a note says what the field is for.
//   node dev/unit/zeitsensor_auswahl.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { loadPanel } from './lib/testhaus.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;
const src = fs.readFileSync(ROOT + 'custom_components/casora/panel/casora-panel.js', 'utf8');
const { P } = await loadPanel();

const field = src.split('\n').find((l) => l.includes('E("time_entity", "Time sensor"'));
assert.ok(field, 'the field');
const accept = (field.match(/accept: "(\w+)"/) || [])[1];
assert.ok(accept, 'the time sensor field narrows its list');
assert.match(src.slice(src.indexOf(field), src.indexOf(field) + 400), /hint: "[^"]+"/, 'a note under the field');

const st = (state, a) => ({ state, attributes: a || {} });
const me = Object.create(P);
me._hass = { states: {
  'sensor.time': st('08:32'),
  'sensor.date_time': st('2026-11-26, 08:32'),
  'sensor.office_clock': st('8:32'),
  'sensor.aircube_temperature': st('21.5', { device_class: 'temperature', unit_of_measurement: '°C' }),
  'sensor.power': st('230', { device_class: 'power', unit_of_measurement: 'W' }),
  'sensor.last_seen': st('2026-11-26T07:00:00+00:00', { device_class: 'timestamp' }),
}, entities: {}, devices: {} };
me._roomArea = () => null;
me._prettyEntity = (e) => e;
const list = me._rankedEntityList(['sensor'], undefined, null, '', accept);
assert.deepEqual(list.slice().sort(), ['sensor.date_time', 'sensor.office_clock', 'sensor.time'], 'only sensors that show a time: ' + list);
// A value chosen before stays offered, though it shows no time.
const kept = me._rankedEntityList(['sensor'], undefined, null, 'sensor.aircube_temperature', accept);
assert.ok(kept.includes('sensor.aircube_temperature'), 'the chosen value stays in the list');
console.log('zeitsensor_auswahl: ok');
