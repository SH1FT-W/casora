// Colour in the v3 light popup (owner report, 01.11.2026: „Ich kann im Licht-Popup gar nicht RGB einstellen?“): the
// stage's segment carries „Farbe“ for lamps with a colour mode (hs/rgb/rgbw/rgbww/xy; an HA group by its members' modes),
// which opens the colour wheel page (data-casora-wheel, 33-color-wheel.js) for the lamps that are on. White-tone lamps
// keep Warm/Neutral/Kalt only; a colour lamp without white tones gets „Weiß“ + „Farbe“. A white tone sent while an
// effect runs carries the lamp's none entry, so it ends the effect too.
//   node dev/unit/light_colour_segment.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const src = read('custom_components/casora/scripts/local/03-popups.js');
const a = src.lastIndexOf('(function () {', src.indexOf('if (window._casoraLightSoft) return;'));
const b = src.indexOf('\n})();', a) + 6;
const stages = [];
const UI = { stage: (t, o) => { stages.push(o); return ''; }, quick: () => '', settings: () => '', esc: (x) => String(x) };
const pop = { getAttribute: (k) => (k === 'data-casora-pv' ? 'v3' : null) };
const states = {};
const hass = { states, entities: {}, devices: {}, areas: {} };
globalThis.window = { addEventListener: () => {}, _casoraUI: UI, casoraPopup: { element: pop } };
globalThis.document = { querySelector: () => ({ hass }), documentElement: {}, addEventListener: () => {} };
globalThis.getComputedStyle = () => ({ getPropertyValue: () => 'soft' });
new Function('window', 'document', src.slice(a, b))(window, document);
const S = window._casoraLightSoft;

const seg = (ids) => {
  stages.length = 0;
  S.render({ gid: 'light.x', flat: { name: null, lights: ids, room: ids } }, 'body', states, hass, null);
  assert.equal(stages.length, 1, 'one stage');
  return (stages[0].seg || []).map((s) => ({ l: s.label, on: !!s.active, wheel: (s.attrs || {})['data-casora-wheel'] || null, data: s.svc && s.svc.data }));
};
const lamp = (id, modes, attrs) => { states[id] = { entity_id: id, state: 'on', attributes: { friendly_name: id, supported_color_modes: modes, brightness: 200,
  min_color_temp_kelvin: 2200, max_color_temp_kelvin: 6500, ...attrs } }; };

lamp('light.ct', ['color_temp'], { color_mode: 'color_temp', color_temp_kelvin: 2700 });
lamp('light.both', ['color_temp', 'xy'], { color_mode: 'xy', hs_color: [10, 90], rgb_color: [255, 60, 30] });
lamp('light.rgb', ['rgb'], { color_mode: 'rgb', hs_color: [0, 0], rgb_color: [255, 255, 255] });
lamp('light.fx', ['color_temp', 'hs'], { color_mode: 'hs', effect_list: ['off', 'candle'], effect: 'candle' });

let s = seg(['light.ct']);
assert.deepEqual(s.map((x) => x.l), ['Warm', 'Neutral', 'Kalt'], 'white-tone lamp: no colour');
s = seg(['light.both']);
assert.deepEqual(s.map((x) => x.l), ['Warm', 'Neutral', 'Kalt', 'Farbe'], 'white tones and colour');
assert.deepEqual(s.map((x) => x.on), [false, false, false, true], 'a colour is set: „Farbe“ chosen');
assert.equal(s[3].wheel, 'light.both', '„Farbe“ opens the colour wheel for the lamp');
s = seg(['light.rgb']);
assert.deepEqual(s.map((x) => x.l), ['Weiß', 'Farbe'], 'colour only: „Weiß“ + „Farbe“');
assert.deepEqual(s[0].data, { hs_color: [0, 0] });
assert.deepEqual(s.map((x) => x.on), [true, false], 'white set: „Weiß“ chosen');
s = seg(['light.ct', 'light.both', 'light.rgb']);
assert.equal(s[s.length - 1].wheel, 'light.both,light.rgb', 'room: the colour lamps that are on');
// HA light group: its supported_color_modes are its members' union.
lamp('light.group', ['color_temp', 'hs'], { entity_id: ['light.ct', 'light.both'], color_mode: 'color_temp', color_temp_kelvin: 4000 });
s = seg(['light.group']);
assert.equal(s[s.length - 1].l, 'Farbe', 'group with a colour member: „Farbe“');
// An effect runs: Warm/Neutral/Kalt send the lamp's „off“ along, „Farbe“ is not chosen (the effect is).
s = seg(['light.fx']);
assert.deepEqual(s[0].data, { color_temp_kelvin: 2700, effect: 'off' }, 'white tone ends the effect');
assert.equal(s[3].on, false);

// The colour wheel: colour data carries the none entry while an effect runs; a list of lamps opens on the first.
const cw = read('custom_components/casora/scripts/local/33-color-wheel.js');
const opened = [];
const w2 = { _casoraLightSoft: S, casoraPopup: { current: null, open: (c) => opened.push(c) } };
const doc2 = { querySelector: () => ({ hass }), addEventListener: () => {} };
new Function('window', 'document', 'customElements', 'HTMLElement', cw)(w2, doc2, { get: () => true }, class {});
const CW = w2._casoraColorWheel;
assert.deepEqual(CW.data([200, 80], ['light.fx'], states), { hs_color: [200, 80], effect: 'off' });
assert.deepEqual(CW.data([200, 80], ['light.both'], states), { hs_color: [200, 80] });
assert.equal(CW.open('light.both,light.rgb'), true);
const wc = opened[0].content.cards[0];
assert.equal(wc.entity, 'light.both');
assert.deepEqual(wc.targets, ['light.both', 'light.rgb'], 'the wheel sets every listed lamp');

// casora-core: a segment field carries its data-* (UI.segments, it.attrs).
const core = read('custom_components/casora/scripts/casora-core.js');
assert.ok(/\+ '"' : ''\)\n\s+\/\/ it\.attrs[^\n]*\n\s+\+ stAttrs\(it\.attrs\)/.test(core), 'segments pass it.attrs through');
console.log('light_colour_segment: ok');
