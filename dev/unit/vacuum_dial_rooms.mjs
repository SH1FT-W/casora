// Robot vacuum popup v3 (owner 01.11.2026): while cleaning, the head said „Reinigt“ and the wheel repeated it
// („Reinigt Küc…“, cut). Now the wheel's word is only the room(s), whole („Küche“, „Küche, Bad“, „Küche +2“),
// area and time the small line under it. Without a chosen room the start button was greyed out („Räume
// auswählen“) and read as broken: now a quiet hint „Räume antippen“, the button appears with the first room.
//   node dev/unit/vacuum_dial_rooms.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const cut = (src, a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); assert.ok(i > -1 && j > i, 'block: ' + a); return src.slice(i, j); };

const hass = {
  devices: { robot: { id: 'robot' } },
  areas: { kitchen: { area_id: 'kitchen', name: 'Küche' }, bath: { area_id: 'bath', name: 'Bad' } },
  entities: {
    'vacuum.example_robot': { entity_id: 'vacuum.example_robot', device_id: 'robot' },
    'sensor.example_robot_current_room': { entity_id: 'sensor.example_robot_current_room', device_id: 'robot' },
    'sensor.example_robot_cleaning_progress': { entity_id: 'sensor.example_robot_cleaning_progress', device_id: 'robot' },
    'sensor.example_robot_cleaning_area': { entity_id: 'sensor.example_robot_cleaning_area', device_id: 'robot' },
  },
  states: {},
  callService: () => {},
};
const window = {};
globalThis.document = { querySelector: (s) => (s === 'home-assistant' ? { hass } : null) };
new Function('window', 'document', read('custom_components/casora/scripts/local/00-finder.js'))(window, globalThis.document);

const src = read('custom_components/casora/scripts/local/02-devices.js');
const str = (states, e) => { const s = e && states[e] && states[e].state; return !s || ['unknown', 'unavailable', 'none', 'off'].includes(s) ? null : s; };
const num = (states, e) => { const v = e && states[e] ? parseFloat(states[e].state) : NaN; return Number.isFinite(v) ? v : null; };
window._casoraLaundry = { util: { str, num, DIM: {}, f: (v) => String(v), dur: (m) => m + ' Min.' }, fetch: () => {} };
let stageOpts = null;
const esc = (x) => String(x).replace(/[&<>"]/g, (c) => '&#' + c.charCodeAt(0) + ';');
window._casoraUI = { esc, tokens: { ink: '#fff', ink3: '#888', font: 'x' }, stage: (k, o) => { stageOpts = o; return ''; }, hero: () => '' };
new Function('window', 'document', cut(src, '// ── Robot vacuum (casora_vacuum', '// ── Notifications'))(window, globalThis.document);
const V = window._casoraVac;

// The room word.
assert.equal(V.roomsWord(['Küche']), 'Küche');
assert.equal(V.roomsWord(['Küche', 'Bad']), 'Küche, Bad');
assert.equal(V.roomsWord(['Wohnzimmer', 'Schlafzimmer', 'Bad']), 'Wohnzimmer +2', 'long lists shortened, never cut');
assert.equal(V.roomsWord([]), '');

// The wheel while cleaning the kitchen: no „Reinigt“ (the head says it), the room whole.
const S = {
  'vacuum.example_robot': { entity_id: 'vacuum.example_robot', state: 'cleaning', attributes: {} },
  'sensor.example_robot_current_room': { entity_id: 'sensor.example_robot_current_room', state: 'Küche', attributes: {} },
  'sensor.example_robot_cleaning_progress': { entity_id: 'sensor.example_robot_cleaning_progress', state: '82', attributes: {} },
  'sensor.example_robot_cleaning_area': { entity_id: 'sensor.example_robot_cleaning_area', state: '12', attributes: {} },
};
hass.states = S;
const c = V.resolve(S['vacuum.example_robot'], {}, S, hass);
c.room = 'sensor.example_robot_current_room'; c.progress = 'sensor.example_robot_cleaning_progress'; c.area = 'sensor.example_robot_cleaning_area';
V.inner('v_stage', c, S);
assert.ok(stageOpts, 'stage rendered');
assert.equal(stageOpts.value, '82');
assert.equal(stageOpts.word, 'Küche', 'the wheel names the room only');
assert.ok(!/Reinigt/.test(stageOpts.word + (stageOpts.program || '')), 'no „Reinigt“ in the wheel');
assert.ok(/12 m²/.test(stageOpts.program || ''), 'area as the small line');

// Two rooms started from the popup: both, even while the robot reports the current one.
V.started['vacuum.example_robot'] = { t: Date.now(), n: ['Küche', 'Bad'] };
V.inner('v_stage', c, S);
assert.equal(stageOpts.word, 'Küche, Bad');

// Rooms: nothing chosen → the hint, not a disabled button; with a room → „1 Raum reinigen“.
V.areas['vacuum.example_robot'] = ['kitchen', 'bath'];
V.sel['vacuum.example_robot'] = [];
let h = V.inner('v_rooms', c, S);
assert.ok(/class="hv-go hint"[^>]*>Räume antippen</.test(h), 'hint when nothing is chosen');
assert.ok(!/hv-go dis/.test(h), 'no greyed-out button');
V.sel['vacuum.example_robot'] = ['kitchen'];
h = V.inner('v_rooms', c, S);
assert.ok(/class="hv-go"[^>]*>1 Raum reinigen</.test(h), 'button with a chosen room');

// Every language has the hint.
for (const l of ['en', 'es', 'fr', 'it', 'nl', 'pl', 'pt']) {
  const ex = JSON.parse(read('custom_components/casora/translations/dashboard/phrases/' + l + '.json')).exact;
  assert.ok(ex['Räume antippen'], l + ': Räume antippen');
}

console.log('ok vacuum_dial_rooms');
