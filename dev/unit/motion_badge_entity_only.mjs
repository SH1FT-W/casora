// Nav motion badge: only a plain entity ID goes into the expression.   node dev/unit/motion_badge_entity_only.mjs
// @deckt: custom_components/casora/panel/casora-panel.js#retargetRoutes
// HACS review round 5, point 3: retargetRoutes() builds "[[[ … states['<motion_entity>'] … ]]]" from a room
// variable. A value from an imported file (or a hand edit) like "binary_sensor.x'];steal();//" must not become
// code: such a room gets no badge, a plain entity ID still does.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');
function grab(re) {
  const m = re.exec(src);
  assert.ok(m, 'not found: ' + re);
  const end = src.indexOf('\n}', m.index);
  const semi = src.indexOf('\n};', m.index);
  const stop = semi >= 0 && semi <= end ? semi + 3 : end + 2;
  return src.slice(m.index, stop);
}
const one = (re) => { const m = re.exec(src); assert.ok(m, 'not found: ' + re); return m[0]; };
const S = new Function([
  one(/^const clone = .*$/m),
  one(/^const HOME_ROOM_NAME = .*$/m),
  one(/^const isDefaultHomeName = .*$/m),
  one(/^const isHomeRoom = [^;]*;/ms),
  one(/^const AUTO_HOME = .*$/m),
  one(/^const MOTION_KEYS = .*$/m),
  one(/^const isLiteralName = .*$/m),
  one(/^const isAutoHome = .*$/m),
  one(/^const isDefaultHome = .*$/m),
  'const roomIcon = () => "mdi:home-variant";',
  grab(/^function roomVisibility\(/m),
  grab(/^function retargetRoutes\(/m),
  'return { retargetRoutes };',
].join('\n'))();

const rooms = [
  { name: 'Home', path: 'home', variables: {} },
  { name: 'Kitchen', path: 'kitchen', variables: { motion_entity: 'binary_sensor.example_motion' } },
  { name: 'Hall', path: 'hall', variables: { motion_entity: "binary_sensor.x'];fetch('//example.invalid');//" } },
  { name: 'Den', path: 'den', variables: { motion_entity: { not: 'a string' } } },
  { name: 'Bath', path: 'bath', variables: { motion_entity: 'binary_sensor.bath_door', motion_entity_2: 'binary_sensor.bath_shower' } },
  { name: 'Attic', path: 'attic', variables: { motion_entity: 'binary_sensor.attic', motion_entity_2: "binary_sensor.x'];steal();//" } },
];
const r = S.retargetRoutes({ views: [{ cards: [{ type: 'custom:casora-nav', routes: [] }] }] }, 'd', rooms);
const routes = (r.config || r).views[0].cards[0].routes;
const by = Object.fromEntries(routes.map((x) => [x.label, x]));
assert.ok(by.Kitchen.badge && by.Kitchen.badge.show.includes("states['binary_sensor.example_motion']"), 'plain entity ID: badge');
assert.equal(by.Hall.badge, undefined, 'quote in the entity: no badge, no code');
assert.equal(by.Den.badge, undefined, 'not a string: no badge');
// #150: several sensors, on while any is on; a bad one is left out, it never becomes code.
assert.ok(by.Bath.badge.show.includes("return ['binary_sensor.bath_door','binary_sensor.bath_shower'].some("), 'two sensors: any of them');
const showOf = (expr, states) => new Function('states', expr.replace('[[[', '').replace(']]]', ''))(states);
assert.equal(showOf(by.Bath.badge.show, { 'binary_sensor.bath_door': { state: 'off' }, 'binary_sensor.bath_shower': { state: 'on' } }), true, 'second sensor on: badge');
assert.equal(showOf(by.Bath.badge.show, { 'binary_sensor.bath_door': { state: 'off' }, 'binary_sensor.bath_shower': { state: 'off' } }), false, 'both off: no badge');
assert.ok(by.Attic.badge.show.includes("states['binary_sensor.attic']") && !by.Attic.badge.show.includes('steal'), 'a bad second sensor is left out');
assert.ok(!JSON.stringify(routes).includes('steal'), 'the bad second sensor appears nowhere');
assert.ok(!JSON.stringify(routes).includes('example.invalid'), 'the injected text appears nowhere');
console.log('PASS motion_badge_entity_only');
