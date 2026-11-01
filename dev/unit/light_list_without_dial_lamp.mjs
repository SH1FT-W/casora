// Owner, 01.11.2026: the v3 light popup of one lamp leaves that lamp out of „Leuchten im Raum“ – it is open in the dial
// above; the list holds the room's other lamps and counts only them. Alone in its room: no list at all.
//   node dev/unit/light_list_without_dial_lamp.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/03-popups.js', import.meta.url), 'utf8');
const a = src.lastIndexOf('(function () {', src.indexOf('if (window._casoraLightSoft) return;'));
const b = src.indexOf('\n})();', a) + 6;
const states = {};
const hass = { states, callService() {} };
globalThis.window = { addEventListener() {},
  casoraPopup: { element: { getAttribute: (k) => (k === 'data-casora-pv' ? 'v3' : null) } },
  _casoraUI: { v3: () => true, stage: () => '<div class="stage"></div>', quick: () => '', settings: () => '' } };
globalThis.document = { querySelector: () => ({ hass }), documentElement: {} };
globalThis.getComputedStyle = () => ({ getPropertyValue: () => 'soft' });
new Function('window', 'document', src.slice(a, b))(window, document);
const S = window._casoraLightSoft;

[['light.desk', 'on'], ['light.shelf', 'on'], ['light.floor', 'off'], ['light.single', 'on']].forEach(([id, st]) => {
  states[id] = { entity_id: id, state: st, attributes: { friendly_name: id.split('.')[1], supported_color_modes: ['onoff'] } };
});
const rows = (html) => [...html.matchAll(/<div class="lps-tx"><b>([^<]*)<\/b>/g)].map((m) => m[1]);

const one = S.render({ gid: 'light.desk', rooms: null, flat: { name: 'Room', rid: 'light.desk', lights: ['light.desk'],
  room: ['light.desk', 'light.shelf', 'light.floor'] } }, 'body', states, hass);
assert.deepEqual(rows(one), ['shelf', 'floor'], 'the dial\'s lamp is not listed again');
assert.ok(one.includes('Leuchten im Raum · 1 von 2 an'), 'the heading counts the listed lamps');

const alone = S.render({ gid: 'light.single', rooms: null, flat: { name: 'Room', rid: 'light.single', lights: ['light.single'], room: null } },
  'body', states, hass);
assert.deepEqual(rows(alone), [], 'alone in its room: no list');
assert.ok(!alone.includes('Leuchten im Raum'), 'and no heading');

// A room popup keeps all its lamps.
const room = S.render({ gid: 'light.room', rooms: null, flat: { name: 'Room', rid: 'light.room', lights: ['light.desk', 'light.shelf', 'light.floor'],
  room: null } }, 'body', states, hass);
assert.deepEqual(rows(room), ['desk', 'shelf', 'floor']);
console.log('light_list_without_dial_lamp: ok');
