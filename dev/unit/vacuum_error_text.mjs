// Robot vacuum error (issue #33): the popup head said "error" (the raw state, not translated) and never
// why. Now "Fehler", and the reason from the vacuum's error sensor – Roborock's codes in Casora's words,
// others (Dreame: translation_key "error", codes like forward_suffocate) in Home Assistant's own text.
//   node dev/unit/vacuum_error_text.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const cut = (src, a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); assert.ok(i > -1 && j > i, 'block: ' + a); return src.slice(i, j); };

// Home Assistant's text for an entity state (as hass.formatEntityState gives it in German).
const HA_TEXT = { forward_suffocate: 'Der Roboter steckt fest oder kann nicht vorwärts fahren\nMöglicherweise ist der Roboter blockiert.' };
const hass = {
  formatEntityState: (s) => HA_TEXT[s.state] || s.state,
  devices: { robot: { id: 'robot' } },
  entities: {
    'vacuum.example_robot': { entity_id: 'vacuum.example_robot', device_id: 'robot' },
    'sensor.example_robot_error': { entity_id: 'sensor.example_robot_error', device_id: 'robot', translation_key: 'error' },
    'sensor.example_robot_battery': { entity_id: 'sensor.example_robot_battery', device_id: 'robot' },
  },
  states: {},
};
const window = {};
globalThis.document = { querySelector: (s) => (s === 'home-assistant' ? { hass } : null) };
new Function('window', 'document', read('custom_components/casora/scripts/local/00-finden.js'))(window, globalThis.document);
assert.ok(window.casoraDevice && window.casoraDevice.map, 'finder');

const geraete = read('custom_components/casora/scripts/local/02-geraete.js');
const str = (states, e) => { const s = e && states[e] && states[e].state; return !s || ['unknown', 'unavailable', 'none', 'off'].includes(s) ? null : s; };
const num = (states, e) => { const v = e && states[e] ? parseFloat(states[e].state) : NaN; return Number.isFinite(v) ? v : null; };
window._casoraLaundry = { util: { str, num, DIM: {} } };
new Function('window', 'document', cut(geraete, '// ── Saugroboter (casora_vacuum', '// ── Benachrichtigungen'))(window, globalThis.document);
const V = window._casoraVac;

const states = (vac, err) => ({
  'vacuum.example_robot': { entity_id: 'vacuum.example_robot', state: vac, attributes: {} },
  'sensor.example_robot_error': { entity_id: 'sensor.example_robot_error', state: err, attributes: {} },
});
const head = (vac, err) => {
  const S = states(vac, err);
  hass.states = S;
  const c = V.resolve(S['vacuum.example_robot'], {}, S, hass);
  return { c, s: V.state(c, S), todo: V.todo(c, S) };
};

let r = head('error', 'forward_suffocate');
assert.equal(r.c.err, 'sensor.example_robot_error', 'Dreame error sensor found by its translation_key');
assert.equal(r.s.label, 'Fehler', 'raw "error" in Casora\'s words');
assert.ok(r.s.error);
assert.equal(r.todo[0] && r.todo[0].label, 'Der Roboter steckt fest oder kann nicht vorwärts fahren', 'HA text, first line');
assert.equal(r.todo[0].level, 2);

r = head('docked', 'no_error');
assert.ok(!r.todo.some((t) => t.level === 2), 'no_error: nothing to show');
r = head('docked', 'lidar_blocked');
assert.equal(r.todo[0].label, 'Lidar blockiert', 'Roborock codes keep Casora\'s words');
r = head('error', 'some_new_code');
assert.equal(r.todo[0].label, 'some new code', 'no text anywhere: the code with spaces');

// The popup head puts the reason first on an error.
assert.ok(/if \(s\.error\) sub\.unshift\(todo\[0\]\.label\); else sub\.push\(todo\[0\]\.label\);/.test(geraete), 'reason first');
// "Fehler" has an English phrase.
assert.equal(JSON.parse(read('custom_components/casora/translations/dashboard/phrases/en.json')).exact.Fehler, 'Error');

console.log('ok vacuum_error_text');
