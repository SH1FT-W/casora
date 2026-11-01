// Popup v3 §7.1 (01.11.2026): the one Verlauf of a popup with a wheel sits on the left under the wheel, the right
// column holds lists only; the phone reads stage → Verlauf → lists. Covers both layout helpers (K.layout in
// 05-weich-mehr.js, H.layout in 02-devices.js) and the template-built fan / air purifier popups.
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.innerWidth = 1400;
globalThis.document = { querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {}, head: { appendChild: () => {} },
  createElement: () => ({ style: {}, setAttribute: () => {}, appendChild: () => {} }), documentElement: { style: {} } };
globalThis.customElements = { get: () => null, define: () => {}, whenDefined: () => Promise.resolve() };
globalThis.addEventListener = () => {};
const src = (p) => fs.readFileSync(new URL('../../custom_components/casora/scripts/local/' + p, import.meta.url), 'utf8');

try { new Function(src('02-devices.js'))(); } catch (e) { /* the rest needs a DOM – H exists before */ }
new Function(src('05-weich-mehr.js'))();
const H = window._casoraHH, K = window._casoraSoftKit;
assert.ok(H && H.layout && H.histKey && K && K.layout, 'layout helpers loaded');

const sec = (n) => K.secCard(['sensor.x'], 'return "' + n + '";', { 'sensor.x': { state: '1' } });
const keysOf = (card) => {
  const g = ((card.styles || {}).grid || []).find((x) => x['grid-template-areas']);
  return g ? g['grid-template-areas'].replace(/"/g, '').split(/\s+/).filter(Boolean) : [];
};

// K.layout – the network popup's call (metric = throughput chart).
for (const [hist, extra] of [['metric', {}], ['chart', {}], ['plot', { history: 'plot' }]]) {
  globalThis.innerWidth = 1400;
  const fields = { stage: { card: sec('s') }, wl: { card: sec('w') }, inet: { card: sec('i') }, nd: { card: sec('n') } };
  fields[hist] = { card: { type: 'custom:casora-chart', series: [] } };
  const o = Object.assign({ fields, top: [], stage: 'stage', left: ['wl', 'inet'], right: ['nd', hist], moveLeft: ['nd'],
    narrowOrder: ['wl', 'inet', 'nd', hist] }, extra);
  const wide = K.layout(o);
  assert.deepEqual(keysOf(wide.custom_fields.main.card), ['stage', hist], `K.layout ${hist}: left = stage + Verlauf`);
  assert.deepEqual(keysOf(wide.custom_fields.side.card), ['wl', 'inet', 'nd'], `K.layout ${hist}: right = lists only`);
  globalThis.innerWidth = 390;
  const narrow = K.layout(o);
  assert.deepEqual(keysOf(narrow), ['stage', hist, 'wl', 'inet', 'nd'], `K.layout ${hist}: phone stage → Verlauf → lists`);
}

// K.layout without narrowOrder, with history: false, and with a picture stage (S5 spans both columns – unchanged).
globalThis.innerWidth = 390;
assert.deepEqual(keysOf(K.layout({ fields: { stage: { card: sec('s') }, a: { card: sec('a') }, chart: { card: sec('c') } }, top: [], stage: 'stage', left: [], right: ['a', 'chart'] })),
  ['stage', 'chart', 'a'], 'K.layout: phone order without narrowOrder');
globalThis.innerWidth = 1400;
const off = K.layout({ fields: { stage: { card: sec('s') }, a: { card: sec('a') }, chart: { card: sec('c') } }, top: [], stage: 'stage', left: [], right: ['a', 'chart'], history: false });
assert.deepEqual(keysOf(off.custom_fields.side.card), ['a', 'chart'], 'K.layout history:false keeps the chart among the lists');
const s5 = K.layout({ fields: { stage: { card: sec('s') }, a: { card: sec('a') }, chart: { card: sec('c') } }, top: [], stage: 'stage', stageWide: true, left: ['a'], right: ['chart'] });
assert.ok(!keysOf(s5.custom_fields.main.card).includes('stage'), 'K.layout S5: picture stage stays across both columns');

// H.layout – device popups (aquarium, floor heating room, fridge …).
globalThis.innerWidth = 1400;
const hf = { hero: '[[[ return "h"; ]]]', stage: '[[[ return "s"; ]]]', chart: '<div>c</div>', list: '[[[ return "l"; ]]]', chan: '[[[ return "k"; ]]]' };
const hl = H.layout({ entity: 'sensor.x', watch: ['sensor.x'], fields: hf, top: ['hero'], stage: 'stage', left: ['chart'], right: ['list', 'chan'] });
assert.deepEqual(keysOf(hl.custom_fields.left.card), ['stage', 'chart'], 'H.layout: left = stage + Verlauf');
assert.deepEqual(keysOf(hl.custom_fields.right.card), ['list', 'chan'], 'H.layout: right = lists only');
// Phone reads top → left → right, i.e. stage → Verlauf → lists.
assert.deepEqual(keysOf(hl), ['hero', 'left', 'right'], 'H.layout: phone order left before right');
// Only a Verlauf beside the stage: one column (552), stage then Verlauf.
const h1 = H.layout({ entity: 'sensor.x', watch: [], fields: { hero: hf.hero, stage: hf.stage, chart: hf.chart }, top: ['hero'], stage: 'stage', left: [], right: ['chart'] });
assert.equal(h1.casora_cols, 1, 'H.layout: stage + Verlauf alone is one column');
assert.deepEqual(keysOf(h1.custom_fields.left.card), ['stage', 'chart'], 'H.layout: one column stage → Verlauf');
// A chart in the top row (v2 layout) is left alone.
assert.equal(H.histKey({ top: ['hero', 'chart'], stage: 'stage' }, () => true), null, 'histKey ignores a chart in top');

// Template-built popups: fan and air purifier put the chart into the left column (v3 branch).
const T = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
for (const n of ['casora_fan', 'casora_air_purifier']) {
  const c = T[n].tap_action.casora_popup.content;
  const v3 = c.slice(c.indexOf('if (_v3o) {'), c.indexOf('if (typeof window !== \'undefined\' && window.innerWidth > 760) {\n    const top'));
  assert.ok(/const left3 = \[part\('seg'[\s\S]*?concat\(chart \?/.test(v3), `${n}: Verlauf under the wheel (left column)`);
  assert.ok(!/right3/.test(v3), `${n}: no Verlauf in the right column`);
  assert.ok(v3.indexOf('.concat(chart ?') < v3.lastIndexOf("part('status'"), `${n}: phone stage → Verlauf → Status`);
}
console.log('popup_v3_history_left: ok');
process.exit(0);
