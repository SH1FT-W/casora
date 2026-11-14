// Issue #196: a weather warning tile with a device (entity „Warnung 1“) and more „Warnungs-Sensoren“ (Warnung 2–5)
// read only the sensors list and dropped its own entity: with Warnung 1 (Windböen) and Warnung 2 (Frost) active the
// popup listed Frost only. Expected: tile and popup read the entity and the sensors together (01-basis.js
// casoraWarnings.sources), every active warning appears once.
//   node dev/unit/warning_tile_entity_and_sensors.mjs
// @deckt: custom_components/casora/scripts/local/01-basis.js#casoraWarnings dashboards/casora/button_card_templates.json#casora_weather_warning,casora_popup_weather_warning
import fs from 'node:fs';
import assert from 'node:assert/strict';

const R = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const basis = R('../../custom_components/casora/scripts/local/01-basis.js');
const T = JSON.parse(R('../../dashboards/casora/button_card_templates.json'));

const block = basis.match(/  window\.casoraWarnings = \(function \(\) \{[\s\S]*?\n  \}\)\(\);\n/);
assert.ok(block, 'casoraWarnings block in 01-basis.js');
globalThis.window = { matchMedia: () => ({ matches: false }), casoraStateFit: (t) => t };
new Function('window', block[0])(window);
const W = window.casoraWarnings;

// Five warning slots of one device, made-up region; slot 1 and 2 active.
const slot = (n, on, a) => ({ entity_id: 'binary_sensor.wetter_warnung_' + n, state: on ? 'on' : 'off',
  last_changed: '2026-11-14T12:32:00+01:00', attributes: { region: 'Teststadt', ...(a || {}) } });
const states = {
  'binary_sensor.wetter_warnung_1': slot(1, true, { severity: 'Moderate', headline: 'Amtliche WARNUNG vor WINDBÖEN',
    event: 'WINDBÖEN', description: 'Es treten Windböen auf.', sent: '2026-11-14T10:00:00+01:00', expires: '2026-11-14T20:00:00+01:00' }),
  'binary_sensor.wetter_warnung_2': slot(2, true, { severity: 'Minor', headline: 'Amtliche WARNUNG vor FROST',
    event: 'FROST', description: 'Es tritt leichter Frost auf.', sent: '2026-11-14T12:32:00+01:00', expires: '2026-11-15T04:00:00+01:00' }),
  'binary_sensor.wetter_warnung_3': slot(3, false), 'binary_sensor.wetter_warnung_4': slot(4, false),
  'binary_sensor.wetter_warnung_5': slot(5, false),
};
const entity = states['binary_sensor.wetter_warnung_1'];
const sensors = ['binary_sensor.wetter_warnung_2', 'binary_sensor.wetter_warnung_3', 'binary_sensor.wetter_warnung_4',
  'binary_sensor.wetter_warnung_5'];

// ── tile: name, state line, active ──
const tile = T.casora_weather_warning, popup = T.casora_popup_weather_warning;
const js = (s) => s.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
const fn = (s) => new Function('states', 'entity', 'user', 'hass', 'variables', 'html', js(s));
const levels = fn(tile.variables.levels)({}, null, {}, {}, {});
const vars = { sensors, levels };
assert.match(fn(tile.state_display).call({}, states, entity, {}, {}, vars), /Windböen · 1 weitere/, 'tile: Windböen (slot 1) plus one more');
assert.equal(fn(tile.state[0].value)({ ...states, 'binary_sensor.wetter_warnung_2': slot(2, false) }, entity, {}, {}, vars), true,
  'tile active with only its own entity on');

// ── popup: both warnings listed ──
const UI = { tokens: new Proxy({}, { get: (o, k) => 'var(--t-' + String(k) + ')' }),
  esc: (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  hero: (o) => '<hero>' + o.value + '</hero>' };
window._casoraUI = UI;
const out = fn(popup.tap_action.casora_popup.content)(states, entity, {}, {}, vars);
const card = out.cards[0];
const list = card.custom_fields.list || '';
assert.ok(list.includes('Amtliche WARNUNG vor WINDBÖEN'), 'popup lists Windböen (the tile entity)');
assert.ok(list.includes('Amtliche WARNUNG vor FROST'), 'popup lists Frost (from the sensors list)');
assert.ok(card.triggers_update.includes('binary_sensor.wetter_warnung_1'), 'popup redraws when the tile entity changes');
// Sensors only (older tiles without an entity in the list) keep working.
const out2 = fn(popup.tap_action.casora_popup.content)(states, null, {}, {}, vars);
assert.ok(!out2.cards[0].custom_fields.list.includes('WINDBÖEN') && out2.cards[0].custom_fields.list.includes('FROST'), 'no entity: the list alone');

// ── the shared rule ──
assert.equal(typeof W.sources, 'function', 'casoraWarnings.sources');
assert.deepEqual(W.sources('binary_sensor.wetter_warnung_1', sensors), ['binary_sensor.wetter_warnung_1', ...sensors], 'entity first, then the list');
assert.deepEqual(W.sources('binary_sensor.wetter_warnung_1', []), ['binary_sensor.wetter_warnung_1'], 'empty list: the entity alone');
assert.deepEqual(W.sources('binary_sensor.wetter_warnung_1', ['binary_sensor.wetter_warnung_1', 'x.y', null]),
  ['binary_sensor.wetter_warnung_1', 'x.y'], 'no doubles, no empty entries');
assert.deepEqual(W.sources(null, ['a.b']), ['a.b'], 'no entity: the list');
assert.deepEqual(W.sources(undefined, '[[[ return 1 ]]]'), [], 'a list that is no array counts as empty');

// No template keeps the old „sensors replace the entity“ rule.
for (const [name, t] of [['tile', tile], ['popup', popup]]) {
  assert.ok(!/variables\.sensors\.length[^;]*\? *variables\.sensors *:/.test(JSON.stringify(t)), name + ': sensors no longer replace the entity');
}
console.log('warning_tile_entity_and_sensors: ok');
