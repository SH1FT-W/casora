// Light effects in the light popup (user wish Marco, 01.11.2026): a lamp with effect_list (Hue scenes/effects, WLED,
// Govee …) gets the moon „Effekte“ at the wheel; it opens the small menu at the moon (as „Alle (n)“, richtlinien §4.8)
// with every effect – the running one hinterlegt, „Ohne Effekt“ first when the lamp knows none/off. A row calls
// light.turn_on with the effect. Single-lamp popup always; room and house only with exactly one lamp with effects.
// Beside the dial at most two moons (owner, 03.11.2026): „Szenen“ (left, a menu with the room's scenes) and „Effekte“
// (right, also alone).
//   node dev/unit/light_effects.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const pop = read('custom_components/casora/scripts/local/03-popups.js');
const cut = (src, a, b) => { const i = src.indexOf(a); assert.ok(i >= 0, a); const j = src.indexOf(b, i); assert.ok(j > i, b); return src.slice(i, j); };

// ── The light module's effect part ──────────────────────────────────────────
const S = {};
const quickCalls = [];
const win = { _casoraUI: { quick: (items, label, o) => { quickCalls.push({ items, label, o }); return 'Q'; } } };
const fxSrc = cut(pop, "  /* The lamp's own effects", "  // The room's scenes as rows of the „Szenen“ menu");
const api = new Function('window', 'S', 'tr', 'hassNow', 'v3SceneItems', fxSrc + '\nreturn { fxLampOf, v3Moons, hasFx };')(
  win, S, (t) => t, () => null, (list) => (list.length ? { items: list.map((id, i) => ({ icon: 'mdi:palette', text: id, active: i === 1, svc: {} })) } : null));

const hue = { entity_id: 'light.desk', state: 'on', attributes: { effect_list: ['off', 'candle', 'fire', 'partly_cloudy', 'Sunrise'], effect: 'fire' } };
const wled = { entity_id: 'light.strip', state: 'off', attributes: { effect_list: ['Solid', 'Rainbow', 'Fireworks'], effect: 'Solid' } };
const plain = { entity_id: 'light.ceiling', state: 'on', attributes: {} };
const onlyNone = { entity_id: 'light.none', state: 'on', attributes: { effect_list: ['None'] } };
const group = { entity_id: 'light.room', state: 'on', attributes: { entity_id: ['light.desk', 'light.ceiling'], effect_list: ['candle'] } };
const gone = { entity_id: 'light.gone', state: 'unavailable', attributes: { effect_list: ['candle'] } };
const states = { 'light.desk': hue, 'light.strip': wled, 'light.ceiling': plain, 'light.none': onlyNone, 'light.room': group, 'light.gone': gone };

// Which lamps count.
assert.equal(api.hasFx(hue), true);
assert.equal(api.hasFx(plain), false, 'no effect_list');
assert.equal(api.hasFx(onlyNone), false, 'only „None“ is no effect');
assert.equal(api.hasFx(group), false, 'an HA light group is no lamp of its own');
assert.equal(api.hasFx(gone), false, 'unavailable');
assert.equal(api.fxLampOf(['light.desk'], states), 'light.desk', 'single lamp');
assert.equal(api.fxLampOf(['light.desk', 'light.ceiling', 'light.room'], states), 'light.desk', 'room: the only lamp with effects');
assert.equal(api.fxLampOf(['light.desk', 'light.strip'], states), null, 'room: two lamps with effects – their own popups');
assert.equal(api.fxLampOf(['light.ceiling'], states), null);

// The moon and its menu.
const m = S.fxMoon('light.desk', states, null);
assert.equal(m.text, 'Effekte');
assert.equal(m.icon, 'mdi:auto-fix');
assert.equal(m.keep, true, 'kept out of „Alle (n)“');
assert.equal(m.active, true, 'an effect runs: the moon is chosen');
assert.deepEqual(m.menu.map((r) => r.text), ['Ohne Effekt', 'Candle', 'Fire', 'Partly cloudy', 'Sunrise'], 'none first, raw keys read as words');
assert.deepEqual(m.menu.map((r) => r.active), [false, false, true, false, false], 'the running effect');
assert.deepEqual(m.menu[2].svc, { domain: 'light', service: 'turn_on', data: { effect: 'fire' }, target: { entity_id: 'light.desk' } });
assert.deepEqual(m.menu[0].svc.data, { effect: 'off' }, '„Ohne Effekt“ sends the lamp\'s own none/off');
assert.equal(m.menu[1].icon, 'mdi:candle');
// HA's own word wins (entity translation), the raw key only without one.
const named = S.fxName(hue, 'candle', { formatEntityAttributeValue: () => 'Kerze' });
assert.equal(named, 'Kerze');
// WLED: „Solid“ is its no-effect entry; off: nothing chosen.
const w = S.fxMoon('light.strip', states, null);
assert.deepEqual(w.menu.map((r) => r.text), ['Ohne Effekt', 'Rainbow', 'Fireworks']);
assert.deepEqual(w.menu[0].svc.data, { effect: 'Solid' });
assert.ok(w.menu.every((r) => !r.active) && !w.active, 'lamp off: no effect marked');
// Owner report 01.11.2026: a scene lamp without any none entry (Govee/Tuya) still gets „Ohne Effekt“, which sends a
// plain colour: the one remembered before the effect, else the current white tone, else warm white / colour / brightness.
const govee = (attrs) => ({ entity_id: 'light.govee', state: 'on', attributes: { supported_color_modes: ['color_temp', 'rgb'],
  min_color_temp_kelvin: 2700, max_color_temp_kelvin: 6500, effect_list: ['Aurora', 'Sunrise'], ...attrs } });
S._plain = {};
let g = S.fxMoon('light.govee', { 'light.govee': govee({ color_mode: 'color_temp', color_temp_kelvin: 3000 }) }, null);
assert.deepEqual(g.menu.map((r) => r.text), ['Ohne Effekt', 'Aurora', 'Sunrise'], 'no none entry: „Ohne Effekt“ all the same');
assert.equal(g.menu[0].active, true, 'nothing runs: „Ohne Effekt“ chosen');
g = S.fxMoon('light.govee', { 'light.govee': govee({ color_mode: 'onoff', effect: 'Aurora' }) }, null);
assert.equal(g.active, true);
assert.deepEqual(g.menu.map((r) => r.active), [false, true, false], 'the running scene marked');
assert.deepEqual(g.menu[0].svc, { domain: 'light', service: 'turn_on', data: { color_temp_kelvin: 3000 }, target: { entity_id: 'light.govee' } },
  'back to the white tone seen before the effect');
S._plain = {};
assert.deepEqual(S.fxPlain('light.govee', govee({ color_mode: 'onoff', effect: 'Aurora' })), { color_temp_kelvin: 2700 }, 'unknown: warm white');
assert.deepEqual(S.fxPlain('light.x', { attributes: { supported_color_modes: ['rgb'], hs_color: [200, 80] } }), { hs_color: [200, 80] });
assert.deepEqual(S.fxPlain('light.x', { attributes: { supported_color_modes: ['brightness'], brightness: 90 } }), { brightness: 90 });
// Zigbee2MQTT „stop_effect“ and ESPHome „None“ count as the none entry; HA's „off“ wins.
assert.equal(S.fxNone({ attributes: { effect_list: ['blink', 'stop_effect', 'finish_effect'] } }), 'stop_effect');
assert.equal(S.fxNone({ attributes: { effect_list: ['None', 'Rainbow', 'off'] } }), 'off');
// A white tone or colour ends a running effect: the none entry goes along when every target knows the same one.
assert.equal(S.fxEnd(['light.desk'], states), 'off', 'Hue lamp with fire running');
assert.equal(S.fxEnd(['light.desk'], { 'light.desk': { ...hue, attributes: { ...hue.attributes, effect: 'off' } } }), null, 'nothing runs');
assert.equal(S.fxEnd(['light.desk', 'light.ceiling'], states), null, 'targets without the same entry: nothing sent');
assert.equal(S.fxMoon('light.ceiling', states, null), null);
// Effect off: „Ohne Effekt“ is the chosen row, the moon not.
const off = S.fxMoon('light.desk', { 'light.desk': { ...hue, attributes: { ...hue.attributes, effect: 'off' } } }, null);
assert.equal(off.active, false);
assert.equal(off.menu[0].active, true);

// Moons of the stage: „Szenen“ (its menu: the scenes, marked when one holds), then „Effekte“ (right), one quick call.
quickCalls.length = 0;
api.v3Moons(['scene.a', 'scene.b'], states, 'Büro', 'light.desk', null);
assert.deepEqual(quickCalls[0].items.map((x) => x.text), ['Szenen', 'Effekte']);
assert.deepEqual(quickCalls[0].items[0].menu.map((x) => x.text), ['scene.a', 'scene.b']);
assert.equal(quickCalls[0].items[0].keep, true, 'its own moon, never „Mehr (n)“');
assert.equal(quickCalls[0].items[0].active, true, 'a scene holds: the moon is marked');
assert.equal(quickCalls[0].items[1].right, true, '„Effekte“ is the right moon');
quickCalls.length = 0;
api.v3Moons(['scene.a'], states, 'Büro', null, null);
assert.deepEqual(quickCalls[0].items.map((x) => x.text), ['Szenen'], 'one scene: still „Szenen“');
quickCalls.length = 0;
api.v3Moons([], states, 'Büro', 'light.desk', null);
assert.deepEqual(quickCalls[0].items.map((x) => x.text), ['Effekte'], 'no scenes: no „Szenen“');
quickCalls.length = 0;
assert.equal(api.v3Moons([], states, null, null, null), '', 'nothing: no quick call');
assert.equal(quickCalls.length, 0);

// Wiring: room popup (single lamp or the room's only one) and house.
assert.ok(/var fxId = fxLampOf\(single \? \[sc\.lights\[0\]\] : lampIds0, states\);/.test(pop), 'room/single popup picks the lamp');
// Issue 126: a single lamp's page is the end of the chain – its own effects, no room scenes; the room keeps its scenes.
assert.ok(/var alone = S\.lampAlone\(cfg, states\);/.test(pop), 'room popup knows a single lamp\'s page');
assert.ok(/v3Moons\(alone \? \[\] : scenesOf\(h, states, sceneScope\(sc\)\), states, room, fxId, h, sc\.lamp && sc\.room \? sc\.room : ids\)/.test(pop), 'room popup: scenes + effects; a single lamp\'s page: effects only');
// Which page is a single lamp's: a flat lamp, a room chosen up front with one lamp; not a room of several, not a group.
const SA = {};
new Function('S', 'selOf', cut(pop, '  S.lampAlone = function', '  S.keepOrder = function'))(SA, (cfg) => cfg.init);
assert.equal(SA.lampAlone({ flat: { lamp: true, lights: ['light.desk'] } }, states), true, 'a lamp tile: its page');
assert.equal(SA.lampAlone({ flat: { lights: ['light.desk', 'light.ceiling'] } }, states), false, 'a tile listing lamps: the list');
assert.equal(SA.lampAlone({ init: 0, rooms: [{ lights: ['light.desk', 'light.gone_for_good'] }] }, states), true, 'a room of one lamp: its page');
assert.equal(SA.lampAlone({ init: 0, rooms: [{ lights: ['light.desk', 'light.ceiling'] }] }, states), false, 'a room of lamps: the overview with scenes');
assert.equal(SA.lampAlone({ init: 0, rooms: [{ lights: ['light.room'] }] }, states), false, 'a room of one HA group: the overview');
assert.ok(/var fxId = fxLampOf\(all, states\);[\s\S]{0,200}v3Stage\(all, states, true, fxId \? function \(\) \{ return v3Moons\(\[\], states, null, fxId\); \} : null\)/.test(pop), 'house popup');

// ── casora-core: the kept moon stays, the others fold into „Mehr (n)“ ───────
const core = read('custom_components/casora/scripts/casora-core.js');
const src = cut(core, '  // Positions of the moons (degrees', '  // The rings. ring = ');
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const { moons } = new Function('window', 'esc', 'dRound', 'stGlyph', 'stAttrs', 'T_', src + '\nreturn { moons };')(
  {}, esc, (x) => Math.round(x * 10) / 10, (n, c) => '<i class="' + c + '" data-g="' + esc(n) + '"></i>',
  (a) => Object.keys(a || {}).map((k) => ' ' + k + '="' + esc(a[k]) + '"').join(''), (x) => x);
const scene = (t, active) => ({ icon: 'mdi:palette', text: t, active: !!active, svc: { domain: 'scene', service: 'turn_on', target: { entity_id: 'scene.' + t } } });
const parts = (html) => html.split('<div class="hui-moon').slice(1);
// 5 scenes + Effekte: 2 scenes, „Mehr (3)“, „Effekte“ – 4 moons.
let mo = parts(moons([1, 2, 3, 4, 5].map((i) => scene('S' + i, i === 4)).concat([m]), null, {}).html);
assert.equal(mo.length, 4, 'never more than 4 moons');
assert.ok(/aria-label="S1"/.test(mo[0]) && /aria-label="S2"/.test(mo[1]), 'two scenes');
assert.ok(/aria-label="Mehr \(3\)"/.test(mo[2]) && /^ on/.test(mo[2]), '„Mehr (3)“ holds the rest, the chosen S4 marks it');
assert.ok(/aria-label="Effekte"/.test(mo[3]) && /data-casora-moonmenu=""/.test(mo[3]), '„Effekte“ is its own menu moon');
assert.ok(/^ on/.test(mo[3]), 'running effect: moon chosen');
const rows = JSON.parse(mo[3].match(/data-casora-mm="([^"]*)"/)[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
assert.deepEqual(rows.map((r) => r.text), ['Ohne Effekt', 'Candle', 'Fire', 'Partly cloudy', 'Sunrise']);
assert.ok(/data-casora-mm-i="2" data-casora-svc="[^"]*&quot;effect&quot;:&quot;fire&quot;/.test(mo[3]), 'row proxy carries light.turn_on with the effect');
const allRows = JSON.parse(mo[2].match(/data-casora-mm="([^"]*)"/)[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
assert.deepEqual(allRows.map((r) => r.text), ['S3', 'S4', 'S5'], 'only the scenes that are no moon; no menu inside a menu: „Effekte“ is not a row of „Mehr“');
// 3 scenes + Effekte = 4: no „Mehr“.
mo = parts(moons([1, 2, 3].map((i) => scene('S' + i)).concat([m]), null, {}).html);
assert.equal(mo.length, 4);
assert.ok(!mo.some((x) => /Mehr|Alle/.test(x)));
// Effekte alone: one moon with its menu.
mo = parts(moons([m], null, {}).html);
assert.equal(mo.length, 1);
assert.ok(/data-casora-moonmenu/.test(mo[0]));
// A lone moon marked right („Effekte“ of the light popup, owner 03.11.2026) sits on the right (25°), others on the left.
assert.deepEqual(moons([m], null, {}).degs, [25], '„Effekte“ alone: right');
assert.deepEqual(moons([scene('S1')], null, {}).degs, [155], 'a lone other moon: left');
// Without a kept moon: 5 → 3 + „Mehr (2)“.
mo = parts(moons([1, 2, 3, 4, 5].map((i) => scene('S' + i)), null, {}).html);
assert.equal(mo.length, 4);
assert.ok(/aria-label="S3"/.test(mo[2]) && /Mehr \(2\)/.test(mo[3]));
// UI.quick (no wheel): a menu-only moon gives no dead tile.
assert.ok(/!\(x\.menu && !x\.svc && !x\.page\)/.test(core), 'quick tiles skip a menu-only item');

console.log('light_effects: ok');
