// Badges filled from the HA area on loading (#57) read as one line per room (Prüfrunde u02-06).
//   node dev/unit/aenderungsliste_badges_auto.mjs
// The list said „Badges geändert: Garage“ and „Raumeinstellungen geändert: Garage“ – the second only for the marker
// casora_badges_auto. Now one line „Badges filled in from the area: Garage“, and taking it back resets both.
// @deckt: casora-panel-b-mehr.js#changeLines,changeItems,revertLine
import fs from 'node:fs';
import assert from 'node:assert/strict';

const win = {};
new Function('window', fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel-b-mehr.js', import.meta.url), 'utf8'))(win);
const { changeLines, revertLine } = win.__casoraStudioMehr;
const J = JSON.stringify;
const room = (path, name, variables) => ({ path, name, tiles: [], variables: variables || {} });
const st = (rooms) => [{ rooms }, {}, {}, null, null];
const clone = (x) => JSON.parse(J(x));

const base = st([room('home', 'Home'), room('garage', 'Garage'), room('garten', 'Garten')]);
const now = clone(base);
for (const r of now[0].rooms.slice(1)) Object.assign(r.variables, { lights_entities: ['light.' + r.path], casora_badges_auto: true });
assert.deepEqual(changeLines(base, now, {}), [
  'Badges filled in from the area: Garage',
  'Badges filled in from the area: Garten',
], 'one understandable line per room');

const r = revertLine(base, now, 0, {});
assert.ok(r.state, 'the line can be taken back');
assert.equal(J(r.state[0].rooms[1].variables), J({}), 'marker and badges go back together');
assert.deepEqual(changeLines(base, r.state, {}), ['Badges filled in from the area: Garten']);

// A later badge edit on an already filled room is a normal badge change.
const later = clone(now); later[0].rooms[1].variables.lights_entities = ['light.x'];
assert.deepEqual(changeLines(now, later, {}), ['Badges changed: Garage']);
console.log('aenderungsliste_badges_auto: ok');
