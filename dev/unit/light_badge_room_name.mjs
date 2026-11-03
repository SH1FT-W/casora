// Room light badges (03.11.2026): a room's lamp chips drop the room name ("Stehlampe Wohnzimmer" in the room
// Wohnzimmer shows as "Stehlampe"), as the scene badges do. The room passes its name to each lamp chip (desktop
// badge row and phone room row); without one (Home's room chips) names stay. Rooms saved without aqi_room_name fall
// back to the room card's name (desktop) or the phone's _name (regress r507).
//   node dev/unit/light_badge_room_name.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const T = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const body = T.casora_badge_light.name.replace(/^\s*\[\[\[/, '').replace(/\]\]\]\s*$/, '');
globalThis.window = {};
const name = (fn, room, state = 'off') => {
  const html = new Function('entity', 'variables', body)({ state, attributes: { friendly_name: fn } }, { chip_room: room });
  return html.match(/<div class="badge-title">([^<]*)</)[1];
};
assert.equal(name('Stehlampe Wohnzimmer', 'Wohnzimmer'), 'Stehlampe');
assert.equal(name('Lightstrip Aquarium Wohnzimmer', 'Wohnzimmer'), 'Lightstrip Aquarium');
assert.equal(name('Wohnzimmer Spots', 'Wohnzimmer'), 'Spots');
assert.equal(name('Spots wohnzimmer', 'Wohnzimmer'), 'Spots', 'case-insensitive');
assert.equal(name('Wohnzimmerlampe', 'Wohnzimmer'), 'Wohnzimmerlampe', 'only whole words');
assert.equal(name('Wohnzimmer', 'Wohnzimmer'), 'Wohnzimmer', 'never empty');
assert.equal(name('Stehlampe Wohnzimmer', ''), 'Stehlampe Wohnzimmer', 'no room: unchanged');
assert.equal(name('Badezimmer', 'Zuhause'), 'Bad', 'short names still apply');
assert.equal(name('Spiegel Bad (oben)', 'Bad (oben)'), 'Spiegel', 'regex characters in the room name');
for (const [k, f, expr] of [['casora_room', 'badges_lights', /variables\.room_name \|\| variables\.aqi_room_name \|\| this\._config\?\.name/],
  ['casora_mobile_sensor_chips', 'room_sub_lights', /_rv\.room_name \|\| _rv\.aqi_room_name \|\| _rv\._name/]]) {
  const cards = T[k].custom_fields[f].card.cards;
  assert.equal(cards.length, 10, k);
  cards.forEach((c, i) => assert.ok(expr.test((c.variables || {}).chip_room || ''), `${k} chip ${i + 1} gets the room name (chip_room)`));
  // room_name is the light popup's own title (casora_popup_light): a chip setting it titled Home's room chip „Zuhause“
  // and a lamp chip with its room (03.11.2026, r508).
  cards.forEach((c, i) => assert.ok(!('room_name' in (c.variables || {})), `${k} chip ${i + 1} leaves the popup's room_name alone`));
}
console.log('ok light_badge_room_name');
