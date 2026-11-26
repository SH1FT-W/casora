// Prüfrunde w03-01: the hold menu of a light group names the brightness of the light popup's dial (its lamps), not the
// group's own brightness. HA reported 255 (100 %) for a group whose lit lamps were 74/204/204 – the dial said 29 %
// or their average, the hold menu 100 % with the 100 % pill marked.
//   node dev/unit/halten_licht_gruppe.mjs
// @deckt: custom_components/casora/scripts/local/22-halten.js#leaves,model custom_components/casora/scripts/local/03-popups.js#level,v3Stage
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../custom_components/casora/scripts/local/' + p, import.meta.url), 'utf8');
const stages = [];
const UI = { stage: (t, o) => { stages.push(o); return ''; }, quick: () => '', settings: () => '', esc: (x) => String(x), page: () => {} };
const states = {};
const hass = { states, entities: {}, devices: {}, areas: {}, callService: () => {} };
const pop = { getAttribute: (k) => (k === 'data-casora-pv' ? 'v3' : null) };
globalThis.window = globalThis;
window._casoraUI = UI;
window.casoraPopup = { element: pop, shown: pop };
globalThis.document = { querySelector: () => ({ hass }), documentElement: {}, addEventListener: () => {} };
globalThis.addEventListener = () => {};
globalThis.getComputedStyle = () => ({ getPropertyValue: () => 'soft' });
globalThis.casoraLocale = () => 'de-DE';
// The light popup block of 03-popups.js, then the hold menu.
const src = read('03-popups.js');
const a = src.lastIndexOf('(function () {', src.indexOf('if (window._casoraLightSoft) return;'));
const b = src.indexOf('\n})();', a) + 6;
new Function(src.slice(a, b))();
new Function(read('22-halten.js'))();
const L = window._casoraLightSoft, H = window._casoraHold;
assert.equal(typeof window.casoraLightLevel, 'function', 'shared brightness');

const lamp = (id, state, bri, modes) => {
  states[id] = { entity_id: id, state, attributes: { friendly_name: id, supported_color_modes: modes || ['brightness'], ...(bri != null ? { brightness: bri } : {}) } };
};
lamp('light.qa_kitchen', 'on', 74);
lamp('light.qa_garage', 'on', 204);
lamp('light.qa_mixed', 'on', 204);
lamp('light.qa_hall', 'off', null);
// A group inside the group: its lamps count, not the sub-group.
states['light.qa_upstairs'] = { entity_id: 'light.qa_upstairs', state: 'on', attributes: { entity_id: ['light.qa_garage', 'light.qa_mixed'], brightness: 255, supported_color_modes: ['brightness'] } };
const G = 'light.qa_all_lamps';
states[G] = { entity_id: G, state: 'on', attributes: { friendly_name: 'Lamps', entity_id: ['light.qa_kitchen', 'light.qa_upstairs', 'light.qa_hall'],
  brightness: 255, supported_color_modes: ['brightness'] } };

const lamps = ['light.qa_kitchen', 'light.qa_garage', 'light.qa_mixed', 'light.qa_hall'];
L.render({ gid: G, flat: { name: 'Lamps', lights: lamps, room: lamps } }, 'body', states, hass, null);
const dial = stages[0].value;
assert.equal(dial, Math.round((29 + 80 + 80) / 3), 'the dial averages the lit lamps');

const hold = H.model(states[G], { states, timers: {} });
const bright = hold.quick.find((q) => q.label === 'Helligkeit');
assert.equal(bright.value, ' · ' + dial + ' %', 'hold menu: the same value as the dial, not the group\'s 100 %');
assert.deepEqual(bright.items.map((x) => !!x.on), [false, false, false], 'no pill marked when none matches');

// Only the kitchen on: 29 % in both, no pill (25/50/100 are more than 3 away).
lamp('light.qa_garage', 'off', null);
lamp('light.qa_mixed', 'off', null);
stages.length = 0;
L.render({ gid: G, flat: { name: 'Lamps', lights: lamps, room: lamps } }, 'body', states, hass, null);
assert.equal(stages[0].value, 29);
assert.equal(H.model(states[G], { states, timers: {} }).quick[0].value, ' · 29 %');

// A single lamp keeps its own brightness.
assert.equal(H.model(states['light.qa_kitchen'], { states, timers: {} }).quick[0].value, ' · 29 %');
console.log('halten_licht_gruppe: ok');
