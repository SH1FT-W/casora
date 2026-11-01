// A room light popup with lamps in different colours (owner report, 01.11.2026):
//  1. Warm/Neutral/Kalt reach every lit lamp of the scope, colour-only lamps too (HA emulates the white tone on them),
//     and the room's last scene is no longer marked once a lamp changed after it (a scene „Polarlicht“ stayed marked).
//  2. Only one segment field is chosen: the one every lit lamp shows; mixed – none.
//  3. Lamps in different colours: the ring blends their colours (o.ringColors → ring.grad, a gradient along the fill).
//   node dev/unit/light_mixed_room.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const src = read('custom_components/casora/scripts/local/03-popups.js');
const a = src.lastIndexOf('(function () {', src.indexOf('if (window._casoraLightSoft) return;'));
const b = src.indexOf('\n})();', a) + 6;
const stages = [], quicks = [];
const UI = { stage: (t, o) => { stages.push(o); if (typeof o.moons === 'function') o.moons(); return ''; },
  quick: (items) => { quicks.push(items); return ''; }, settings: () => '', esc: (x) => String(x), page: () => {} };
const pop = { getAttribute: (k) => (k === 'data-casora-pv' ? 'v3' : null) };
const states = {};
const hass = { states, entities: {}, devices: {}, areas: { office: { area_id: 'office', name: 'Office' } } };
globalThis.window = { addEventListener: () => {}, _casoraUI: UI, casoraPopup: { element: pop } };
globalThis.document = { querySelector: () => ({ hass }), documentElement: {}, addEventListener: () => {} };
globalThis.getComputedStyle = () => ({ getPropertyValue: () => 'soft' });
new Function('window', 'document', src.slice(a, b))(window, document);
const S = window._casoraLightSoft;

const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();
const lamp = (id, modes, attrs, changedAgo) => {
  states[id] = { entity_id: id, state: 'on', last_updated: iso(changedAgo == null ? 3600000 : changedAgo),
    attributes: { friendly_name: id, supported_color_modes: modes, brightness: 200, min_color_temp_kelvin: 2200, max_color_temp_kelvin: 6500, ...attrs } };
  hass.entities[id] = { area_id: 'office' };
};
const render = (ids) => {
  stages.length = 0; quicks.length = 0;
  S.render({ gid: 'light.office', flat: { name: 'Office', lights: ids, room: ids } }, 'body', states, hass, null);
  const o = stages[0];
  return { o, seg: (o.seg || []).map((s) => ({ l: s.label, on: !!s.active, tg: s.svc && s.svc.target.entity_id, data: s.svc && s.svc.data })) };
};

lamp('light.spots', ['color_temp', 'hs', 'xy'], { color_mode: 'color_temp', color_temp_kelvin: 2700 });
lamp('light.strip', ['color_temp', 'rgb'], { color_mode: 'rgb', hs_color: [210, 90], rgb_color: [30, 120, 255] });
lamp('light.bulb', ['rgb'], { color_mode: 'rgb', hs_color: [0, 90], rgb_color: [255, 30, 30], effect_list: ['Aurora', 'Forest'] });

// 2. Mixed: no field chosen (before: „Warm“ and „Farbe“ at once).
let r = render(['light.spots', 'light.strip', 'light.bulb']);
assert.deepEqual(r.seg.map((s) => s.l), ['Warm', 'Neutral', 'Kalt', 'Farbe']);
assert.deepEqual(r.seg.map((s) => s.on), [false, false, false, false], 'mixed white tone and colour: nothing chosen');
// 1. Warm reaches every lit lamp, the colour-only bulb too.
assert.deepEqual(r.seg[0].tg, ['light.spots', 'light.strip', 'light.bulb'], 'white tone for every lit lamp');
assert.deepEqual(r.seg[0].data, { color_temp_kelvin: 2700 });
// 3. The ring blends the lamps' colours in list order.
assert.equal(r.o.ringColors.length, 3, JSON.stringify(r.o.ringColors));
assert.equal(r.o.ringColors[1], 'rgb(30,120,255)');
assert.equal(r.o.ringColors[2], 'rgb(255,30,30)');
assert.equal(r.o.ringColor, r.o.ringColors[0], 'one colour for the moons: the first');
// All the same: one field, one colour.
states['light.strip'].attributes = { ...states['light.strip'].attributes, color_mode: 'color_temp', color_temp_kelvin: 2650 };
r = render(['light.spots', 'light.strip']);
assert.deepEqual(r.seg.map((s) => s.on), [true, false, false, false], 'all warm: „Warm“');
assert.equal(r.o.ringColors, null, 'one tone: no blend');
// An effect runs on a lamp: no field chosen.
states['light.bulb'].attributes = { ...states['light.bulb'].attributes, effect: 'Aurora' };
r = render(['light.spots', 'light.strip', 'light.bulb']);
assert.ok(r.seg.every((s) => !s.on), 'effect running: nothing chosen');

// 1. The room's last scene: marked until a lamp changes after it (2 min to settle).
states['scene.aurora'] = { entity_id: 'scene.aurora', state: iso(600000), attributes: { friendly_name: 'Aurora Office' } };
hass.entities['scene.aurora'] = { area_id: 'office' };
const sceneOn = () => { render(['light.spots', 'light.strip']); const it = (quicks[0] || []).find((x) => /Aurora/.test(x.text)); return it && it.active; };
assert.equal(sceneOn(), true, 'scene 10 min ago, lamps unchanged since: marked');
states['light.strip'].last_updated = iso(60000);
assert.equal(sceneOn(), false, 'a lamp changed after the scene: no longer marked');

// casora-core: ring.grad draws a gradient along the fill.
const core = read('custom_components/casora/scripts/casora-core.js');
assert.ok(/if \(Array\.isArray\(o\.ringColors\) && o\.ringColors\.length > 1 && !off\) \{ ring\.grad = /.test(core), 'S1 takes o.ringColors');
assert.ok(/var stroke = ring\.heat \? [^;]*grad \? 'url\(#' \+ esc\(id\) \+ 'g\)'/.test(core), 'fill stroked with the gradient');
console.log('light_mixed_room: ok');
