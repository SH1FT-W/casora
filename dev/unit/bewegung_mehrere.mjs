// #150: several motion sensors per room count as one on the phone chip.   node dev/unit/bewegung_mehrere.mjs
// @deckt: custom_components/casora/scripts/casora-core.js#casoraMotionOf dashboards/casora/button_card_templates.json#casora_mobile_sensor_chips
import fs from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../../', import.meta.url);
const core = fs.readFileSync(new URL('custom_components/casora/scripts/casora-core.js', root), 'utf8');
const m = core.match(/window\.casoraMotionOf = function[\s\S]*?\n  };\n/);
assert.ok(m, 'casoraMotionOf found');
const window = {};
new Function('window', m[0])(window);
const of = window.casoraMotionOf;
const A = 'binary_sensor.a', B = 'binary_sensor.b';
const two = { motion_entity: A, motion_entity_2: B };

assert.deepEqual(of({ motion_entity: A }, { [A]: { state: 'on' } }), { ids: [A], entity: A, state: 'on' }, 'one sensor as before');
assert.equal(of(two, { [A]: { state: 'off' }, [B]: { state: 'on' } }).state, 'on', 'second on: on');
assert.equal(of(two, { [A]: { state: 'off' }, [B]: { state: 'on' } }).entity, B, 'second on: it is the one to show');
assert.equal(of(two, { [A]: { state: 'off' }, [B]: { state: 'off' } }).state, 'off', 'all off: off');
assert.equal(of(two, { [A]: { state: 'off' }, [B]: { state: 'off' } }).entity, A, 'all off: the first');
assert.equal(of(two, { [A]: { state: 'unavailable' }, [B]: { state: 'off' } }).state, 'off', 'one gone, one off: off');
assert.equal(of(two, {}).state, 'unavailable', 'none known: unavailable');
assert.equal(of(null, {}).entity, null, 'no room: nothing');

// The chip itself: redraws for any sensor, and reads the helper.
const tpl = JSON.parse(fs.readFileSync(new URL('dashboards/casora/button_card_templates.json', root), 'utf8'));
const chip = tpl.casora_mobile_sensor_chips.custom_fields.rooms_row.card.cards.find((c) => c.icon === 'mdi:motion-sensor');
assert.equal(chip.triggers_update, 'all', 'a sensor that is not the current entity also redraws it');
const ev = (t, states, variables) => new Function('states', 'variables', 'window', t.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, ''))(states, variables, window);
const states = { 'input_select.casora_mobile_filter': { state: 'bad' }, [A]: { state: 'off' }, [B]: { state: 'on' } };
const variables = { room_chips: { bad: two } };
assert.equal(ev(chip.entity, states, variables), B, 'tile follows the active sensor');
assert.match(ev(chip.name, states, variables), /Erkannt/, 'tile says detected');
assert.ok(!/Nicht erkannt/.test(ev(chip.name, states, variables)), 'not "not detected"');
assert.match(ev(chip.name, { ...states, [B]: { state: 'off' } }, variables), /Nicht erkannt/, 'all off');
assert.equal(ev(chip.styles.card[0].display, states, { room_chips: {} }), 'none', 'no sensor: hidden');
console.log('ok – several motion sensors');
