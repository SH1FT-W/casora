// Light popup of exactly one lamp (badge of one lamp): the lamp's own row under „Leuchten im Raum“
// switches but does not open the same popup again. A room picked in the house popup is not that
// lamp's popup: a room with a single lamp still opens it.
//   node dev/unit/licht_eigene_zeile.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/03-popups.js', import.meta.url), 'utf8');
const a = src.lastIndexOf('(function () {', src.indexOf('if (window._casoraLightSoft) return;'));
const b = src.indexOf('\n})();', a) + 6;
const states = {};
const hass = { states, callService() {} };
globalThis.window = { addEventListener() {} };
globalThis.document = { querySelector: () => ({ hass }), documentElement: {} };
globalThis.getComputedStyle = () => ({ getPropertyValue: () => 'soft' });
new Function('window', 'document', src.slice(a, b))(window, document);
const S = window._casoraLightSoft;

['light.a', 'light.b', 'light.c'].forEach((id) => {
  states[id] = { entity_id: id, state: 'off', attributes: { friendly_name: id, supported_color_modes: ['onoff'] } };
});
// Which lamp rows open a popup (data-lps-tap with a: 'mi').
const opens = (html) => [...html.matchAll(/<div class="lps-row(?: [^"]*)?"([^>]*)>/g)]
  .map((m) => (m[1].match(/&quot;id&quot;:&quot;([^&]+)&quot;/) || m[1].match(/"id":"([^"]+)"/) || [])[1] || null);

// Popup of light.a alone (badge), its room light.a + light.b.
const one = S.render({ gid: 'light.a', rooms: null, flat: { name: 'Room', rid: 'light.a', lights: ['light.a'], room: ['light.a', 'light.b'] } }, 'body', states, hass);
assert.deepEqual(opens(one), [null, 'light.b'], 'own row does not open, the other lamp does');

// Without a room group: only the lamp itself, not tappable either.
const alone = S.render({ gid: 'light.c', rooms: null, flat: { name: 'Room', rid: 'light.c', lights: ['light.c'], room: null } }, 'body', states, hass);
assert.deepEqual(opens(alone), [null], 'single lamp without room: no row reopening itself');

// House popup, a room with one lamp picked: that lamp still opens.
window._casoraLF = { 'light.all': 1 };
const house = S.render({ gid: 'light.all', init: 1, rooms: [
  { name: 'Two', rid: 'light.two', lights: ['light.a', 'light.b'] },
  { name: 'One', rid: 'light.one', lights: ['light.c'] },
] }, 'body', states, hass);
assert.deepEqual(opens(house), ['light.c'], 'room with one lamp in the house popup: the lamp opens');
console.log('ok licht_eigene_zeile');
