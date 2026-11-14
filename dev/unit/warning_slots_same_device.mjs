// Issue #196 (auto): a weather warning tile set to „Warnung 1“ of „Wetter & Warnungen“ alone, without „Warnungs-Sensoren“,
// showed only that slot: with Warnung 1 (Windböen), 2 (Frost) and 3 (Glätte) active the tile said „Windböen“, the popup
// listed Windböen only and the bell had no row for Frost and Glätte. Expected: the tile reads every warning slot of its
// device (entity registry: same device_id, platform and translation_key, binary_sensor only), so the tile says
// „Windböen · 2 weitere“, the popup lists all three and the bell has one „Wetterwarnung: …“ row each that opens the tile.
// Sensors listed by hand still count (union, no doubles); other binary_sensors of the device stay out.
//   node dev/unit/warning_slots_same_device.mjs
// @deckt: custom_components/casora/scripts/local/01-basis.js#casoraWarnings,sources,siblings,pickedSources dashboards/casora/button_card_templates.json#casora_weather_warning,casora_popup_weather_warning custom_components/casora/scripts/casora-core.js#wants
import fs from 'node:fs';
import assert from 'node:assert/strict';

const R = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const basis = R('../../custom_components/casora/scripts/local/01-basis.js');
const core = R('../../custom_components/casora/scripts/casora-core.js');
const T = JSON.parse(R('../../dashboards/casora/button_card_templates.json'));

// ── fixtures: five slots of one device, one foreign slot device, a connectivity sensor of the same device ──
const id = (n) => 'binary_sensor.wetter_warnung_' + n;
const iso = (h) => new Date(Date.now() + h * 3600000).toISOString();
const W = {
  1: { severity: 'Moderate', headline: 'Amtliche WARNUNG vor WINDBÖEN', event: 'WINDBÖEN', description: 'Es treten Windböen auf.' },
  2: { severity: 'Minor', headline: 'Amtliche WARNUNG vor FROST', event: 'FROST', description: 'Es tritt leichter Frost auf.' },
  3: { severity: 'Minor', headline: 'Amtliche WARNUNG vor GLÄTTE', event: 'GLÄTTE', description: 'Es tritt Glätte auf.' },
};
const slot = (n, eid = id(n)) => ({ entity_id: eid, state: W[n] ? 'on' : 'off', last_changed: iso(-1),
  attributes: { friendly_name: 'Wetter Warnung ' + n, device_class: 'safety', region: 'Teststadt',
    ...(W[n] ? { ...W[n], sent: iso(-2), expires: iso(5 + n) } : {}) } });
const states = {};
for (let n = 1; n <= 5; n++) states[id(n)] = slot(n);
states['binary_sensor.wetter_verbindung'] = { entity_id: 'binary_sensor.wetter_verbindung', state: 'on', attributes: { device_class: 'connectivity' } };
states['binary_sensor.andere_warnung_1'] = slot(2, 'binary_sensor.andere_warnung_1');
const reg = (eid, dev, tk, platform = 'wetter') => ({ entity_id: eid, device_id: dev, platform, translation_key: tk });
const entities = {
  ...Object.fromEntries([1, 2, 3, 4, 5].map((n) => [id(n), reg(id(n), 'dev1', 'warning')])),
  'binary_sensor.wetter_verbindung': reg('binary_sensor.wetter_verbindung', 'dev1', 'connected'),
  'sensor.wetter_warnung_anzahl': reg('sensor.wetter_warnung_anzahl', 'dev1', 'warning'),
  'binary_sensor.andere_warnung_1': reg('binary_sensor.andere_warnung_1', 'dev2', 'warning'),
};
const hass = { states, entities, devices: {}, areas: {} };

// ── the shared rule (01-basis.js casoraWarnings) ──
const block = basis.match(/  window\.casoraWarnings = \(function \(\) \{[\s\S]*?\n  \}\)\(\);\n/);
assert.ok(block, 'casoraWarnings block in 01-basis.js');
const win = { matchMedia: () => ({ matches: false }), casoraStateFit: (t) => t };
new Function('window', block[0])(win);
const CW = win.casoraWarnings;
assert.deepEqual(CW.sources(id(1), [], entities), [1, 2, 3, 4, 5].map(id), 'Warnung 1 alone brings 2–5 of its device');
assert.deepEqual(CW.sources(id(1), [id(3), 'binary_sensor.andere_warnung_1'], entities),
  [id(1), id(3), 'binary_sensor.andere_warnung_1', id(2), id(4), id(5)], 'hand-picked sensors stay, no doubles');
assert.ok(!CW.sources(id(1), [], entities).includes('binary_sensor.wetter_verbindung'), 'another binary_sensor of the device stays out');
assert.ok(!CW.sources(id(1), [], entities).includes('sensor.wetter_warnung_anzahl'), 'a sensor of the device stays out');
assert.ok(!CW.sources(id(1), [], entities).includes('binary_sensor.andere_warnung_1'), 'slots of another device stay out');
assert.deepEqual(CW.sources(id(1), []), [id(1)], 'without the registry: the entity alone, as before');
assert.deepEqual(CW.sources('binary_sensor.wetter_verbindung', [], entities), ['binary_sensor.wetter_verbindung'],
  'a seed of its own translation_key brings nothing');
assert.deepEqual(CW.sources(id(1), [], { [id(1)]: { entity_id: id(1), device_id: null, platform: 'wetter', translation_key: 'warning' } }),
  [id(1)], 'without device: nothing more');
const ten = Object.fromEntries([1, 2, 10].map((n) => [id(n), reg(id(n), 'dev1', 'warning')]));
assert.deepEqual(CW.siblings(id(1), ten), [id(2), id(10)], 'slot order: _2 before _10');

// ── tile and popup with Warnung 1 alone ──
const tile = T.casora_weather_warning, popup = T.casora_popup_weather_warning;
const js = (s) => s.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
const fn = (s) => new Function('states', 'entity', 'user', 'hass', 'variables', 'html', js(s));
globalThis.window = win;
const levels = fn(tile.variables.levels)({}, null, {}, {}, {});
const vars = { sensors: [], levels };
assert.match(fn(tile.state_display).call({}, states, states[id(1)], {}, hass, vars), /Windböen · 2 weitere/, 'tile: Windböen plus two more');
// The narrow tile's short form: casoraStateFit counts the parts after „ · “, so „Windböen · 2 weitere“ became „+1“;
// the tile hands its own short form „Windböen +2“ (alt) so the pill says +2.
{
  const calls = [];
  win.casoraStateFit = (t, w, a) => { calls.push([t, a]); return t; };
  fn(tile.state_display).call({}, states, states[id(1)], {}, hass, vars);
  assert.deepEqual(calls.at(-1), ['Windböen · 2 weitere', 'Windböen +2'], 'short form with the real count');
  fn(tile.state_display).call({}, states, states[id(1)], {}, { ...hass, entities: {} }, vars);
  assert.deepEqual(calls.at(-1), ['Windböen', undefined], 'one warning: no short form, no counter');
  win.casoraStateFit = (t) => t;
}
const off1 = { ...states, [id(1)]: { ...states[id(1)], state: 'off' } };
assert.equal(fn(tile.state[0].value)(off1, off1[id(1)], {}, hass, vars), true, 'tile active while only another slot is on');
win._casoraUI = { tokens: new Proxy({}, { get: (o, k) => 'var(--t-' + String(k) + ')' }),
  esc: (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  hero: (o) => '<hero>' + o.value + '</hero>' };
const card = fn(popup.tap_action.casora_popup.content)(states, states[id(1)], {}, hass, vars).cards[0];
for (const k of ['WINDBÖEN', 'FROST', 'GLÄTTE']) assert.ok(card.custom_fields.list.includes('WARNUNG vor ' + k), 'popup lists ' + k);
assert.ok([2, 3, 4, 5].every((n) => card.triggers_update.includes(id(n))), 'popup redraws on every slot');

// ── bell (01-basis.js notify extension) with Warnung 1 alone on the tile ──
const bs = basis.indexOf('(function () {\n  if (window._casoraNotifyLocal) return;');
assert.ok(bs > 0, 'notify extension (01-basis) found');
globalThis.window = globalThis;
globalThis.document = { addEventListener: () => {}, querySelector: () => null, createElement: () => ({ style: {}, setAttribute() {} }), body: { appendChild() {} } };
globalThis.addEventListener = () => {};
globalThis.setInterval = () => 0;
globalThis.setTimeout = () => 0;
window.casoraWarnings = CW;
window.CASORA_NOTIFY_EXTENSIONS = [];
const LC = { views: [{ cards: [{ type: 'custom:button-card', template: 'casora_weather_warning', entity: id(1), variables: { sensors: [] } }] }] };
window._casoraLovelaceCfg = () => LC;
new Function(basis.slice(bs, basis.indexOf('\n})();', bs) + 6))();
const ext = window.CASORA_NOTIFY_EXTENSIONS[0];
const generic = [1, 2, 3].map((n) => ({ id: 'casora:safety:' + id(n), label: 'Sicherheitswarnung', sub: 'Wetter Warnung ' + n, entity: id(n) }));
const rows = ext.standing(hass, generic, { nameOf: (st) => st.attributes.friendly_name });
assert.deepEqual(rows.filter((r) => String(r.id).startsWith('casora:safety:')), [], 'no generic rows');
const warn = rows.filter((r) => String(r.id).startsWith('casora:warning:'));
assert.deepEqual(warn.map((r) => [r.entity, r.label]).sort(),
  [[id(1), 'Wetterwarnung: Windböen'], [id(2), 'Wetterwarnung: Frost'], [id(3), 'Wetterwarnung: Glätte']], 'one bell row per active slot');
assert.ok(!ext.watch(hass).includes('binary_sensor.andere_warnung_1'), 'a slot of another device, not on the tile, stays out of the bell');

// ── bell row target: casora-core wants() matches the tile set to Warnung 1 for Warnung 2 ──
const wi = core.indexOf('  function wants(cfg, names, entityId) {');
assert.ok(wi > 0, 'wants() in casora-core.js');
const wantsSrc = core.slice(wi, core.indexOf('\n  }\n', wi) + 4);
const wants = new Function('window', 'hassOf', 'templatesOf', wantsSrc + '\nreturn wants;')(
  { casoraWarnings: CW }, () => hass, (c) => [].concat(c.template || []));
const NAMES = ['casora_weather_warning', 'casora_popup_weather_warning'];
assert.equal(wants(LC.views[0].cards[0], NAMES, id(2)), true, 'the tile on Warnung 1 is the target for Warnung 2');
assert.equal(wants(LC.views[0].cards[0], NAMES, 'binary_sensor.andere_warnung_1'), false, 'not for a slot of another device');
assert.equal(wants({ template: 'casora_light', entity: 'light.a' }, ['casora_light'], 'light.b'), false, 'other tiles unchanged');
console.log('warning_slots_same_device: ok');
