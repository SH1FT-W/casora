// u01-11 (review 26.11.2026): the setup assistant said "Step 3 of 6" before "Existing dashboards found"; on the way to
// "Move to Casora" the count vanished, so the six announced steps were wrong there. Owner: the move counts on its own
// ("Umzug 1 von 3": overview, customized tiles when there are any, done page); the assistant's way of a new dashboard
// stays 1 to 6 of 6 (V21, studio_setup_assistant.mjs).
//   node dev/unit/umzug_step_count.mjs
// @deckt: custom_components/casora/panel/casora-panel-umzug.js#moveStep,_casoraUmzug,_casoraUmzugChoose,_casoraUmzugRun
// @deckt: custom_components/casora/panel/casora-panel.js#_flowScreen,_flowDone
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const U = read('custom_components/casora/panel/casora-panel-umzug.js');
const P = read('custom_components/casora/panel/casora-panel.js');

// The count itself.
const m = U.match(/const moveStep = \(a, n\) => \{[\s\S]*?\n  \};\n/);
assert.ok(m, 'moveStep');
const moveStep = new Function(m[0] + 'return moveStep;')();
const withTiles = { groups: [{ key: 'casora_light' }] }, plain = { groups: [] };
assert.deepEqual(moveStep(withTiles, 1), { step: [1, 3], stepText: 'Move {1} of {2}' }, 'overview: Move 1 of 3');
assert.deepEqual(moveStep(withTiles, 2).step, [2, 3], 'customized tiles: 2 of 3');
assert.deepEqual(moveStep(withTiles, 'done').step, [3, 3], 'done page: 3 of 3');
assert.deepEqual(moveStep(plain, 1).step, [1, 2], 'no customized tiles: overview 1 of 2');
assert.deepEqual(moveStep(plain, 'done').step, [2, 2], 'and the done page 2 of 2');

// Each screen of the move carries it.
const body = (start) => { const i = U.indexOf(start); assert.ok(i > -1, start); return U.slice(i, U.indexOf('\n    };\n', i)); };
assert.match(body('P._casoraUmzug = async function (o) {'), /title: "Move to Casora",[\s\S]*?\.\.\.moveStep\(a, 1\),/, 'overview counts 1');
assert.match(body('P._casoraUmzugChoose = function (a, o) {'), /\.\.\.moveStep\(a, 2\),/, 'customized tiles count 2');
assert.match(body('P._casoraUmzugRun = async function (a, keep) {'), /Object\.assign\(\{\}, opts, \{ move: true \}, moveStep\(a, "done"\)\)/, 'done page counts last');

// The flow screen shows the move's own words; the done page hands the count on.
const fs0 = P.slice(P.indexOf('  _flowScreen(opts) {'), P.indexOf('  _flowScreen(opts) {') + 6000);
assert.match(fs0, /t\(opts\.stepText \|\| "Step \{1\} of \{2\}"\)/, '_flowScreen: stepText, else "Step"');
const fd = P.slice(P.indexOf('  _flowDone(opts) {'), P.indexOf('  _flowDone(opts) {') + 2500);
assert.match(fd, /step: opts\.step, stepText: opts\.stepText/, '_flowDone hands the step on');
// The main way stays 1-6 of 6.
assert.match(P, /const SETUP_STEPS = 6;/);

// Every language has the words.
for (const f of fs.readdirSync(new URL('../../custom_components/casora/translations/panel/', import.meta.url)).filter((x) => x.endsWith('.json') && x !== 'en.json')) {
  const j = JSON.parse(read('custom_components/casora/translations/panel/' + f));
  const flat = JSON.stringify(j);
  assert.ok(flat.includes('"Move {1} of {2}"'), f + ': "Move {1} of {2}"');
}
assert.ok(JSON.stringify(JSON.parse(read('custom_components/casora/translations/panel/de.json'))).includes('"Umzug {1} von {2}"'), 'de: Umzug n von m');
console.log('umzug_step_count: ok');
