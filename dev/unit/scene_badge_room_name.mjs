// Room scene badges (25.10.2026): "Glut Wohnzimmer" in the room Wohnzimmer shows as "Glut", the room name
// already stands above the row. The room passes its name to each scene badge; without one (Home) names stay.
//   node dev/unit/scene_badge_room_name.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const T = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const src = T.casora_badge_scene.name;
const m = src.match(/const strip = \(t\) => \{[\s\S]*?\n  \};/);
assert.ok(m, 'strip in casora_badge_scene.name');
const mk = (room) => new Function('room', m[0] + '\nreturn strip;')(room);
const wz = mk('Wohnzimmer');
assert.equal(wz('Glut Wohnzimmer'), 'Glut');
assert.equal(wz('Wohnzimmer Kino'), 'Kino');
assert.equal(wz('Polarlicht wohnzimmer'), 'Polarlicht', 'case-insensitive');
assert.equal(wz('Kino · Wohnzimmer'), 'Kino');
assert.equal(wz('WZ Dreamview'), 'WZ Dreamview', 'abbreviation stays');
assert.equal(wz('Wohnzimmerlicht'), 'Wohnzimmerlicht', 'only whole words');
assert.equal(wz('Wohnzimmer'), 'Wohnzimmer', 'never empty');
assert.equal(mk('')('Glut Wohnzimmer'), 'Glut Wohnzimmer', 'no room: unchanged');
assert.equal(mk('Bad (oben)')('Abend Bad (oben)'), 'Abend', 'regex characters in the room name');
assert.ok(/template: 'casora_badge_scene', entity: id,\s*variables: \{ enabled: true, room_name: variables\.room_name \|\| variables\.aqi_room_name \|\| '' \}/.test(JSON.stringify(T).replace(/\\n/g, '\n')), 'room passes its name');
console.log('ok scene_badge_room_name');
