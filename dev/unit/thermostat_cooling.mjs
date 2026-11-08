// Issue #144: the thermostat popup offered only off, heat and auto, even on an air conditioner. Now it offers the modes the
// device reports; a heating that claims cooling hides it per tile (hide_cooling); fan, preset and swing only on a device that cools.
//   node dev/unit/thermostat_cooling.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null, addEventListener: () => {} };
new Function(fs.readFileSync(new URL('../../custom_components/casora/scripts/local/31-velair.js', import.meta.url), 'utf8'))();
const M = window.casoraClimateModes, X = window.casoraClimateExtras;
const AC = { hvac_modes: ['cool', 'fan_only', 'dry', 'heat_cool', 'heat', 'off'], fan_modes: ['Auto', 'Silence', '1'], fan_mode: 'Silence',
  preset_modes: ['none', 'eco'], preset_mode: 'none', swing_modes: ['off', '3d'], swing_mode: '3d' };

assert.deepEqual(M(AC), ['off', 'heat', 'cool', 'heat_cool', 'dry', 'fan_only'], 'everything the device reports, in a fixed order');
assert.deepEqual(M({ hvac_modes: ['heat', 'off', 'auto'] }), ['off', 'heat', 'auto'], 'heating only: as before');
assert.deepEqual(M({ hvac_modes: ['off', 'heat', 'cool', 'auto'] }, { hide_cooling: true }), ['off', 'heat', 'auto'], 'cooling hidden');
assert.deepEqual(M(AC, { hide_cooling: true }), ['off', 'heat'], 'hide_cooling takes every cooling mode');
assert.deepEqual(M({ hvac_modes: ['off', 'heat', 'made_up'] }), ['off', 'heat'], 'an unknown mode has no word and stays out');
assert.deepEqual(M({}), [], 'no modes');
for (const m of M(AC)) assert.ok(M.LABEL[m] && M.ICON[m], m + ' has a word and an icon');

const calls = [];
const UI = { segments: (items, label) => { calls.push({ label, items }); return `<seg ${label}>`; } };
const html = X(UI, AC, {}, { entity_id: 'climate.ac' });
assert.equal(html.match(/<seg /g).length, 3, 'fan, preset and swing');
assert.deepEqual(calls.map((c) => c.label), ['Lüfter', 'Voreinstellung', 'Lamellen']);
assert.deepEqual(calls[0].items.map((i) => i.label), ['Auto', 'Leise', '1'], 'words regardless of case, numbers stay');
assert.equal(calls[0].items[1].active, true);
assert.deepEqual(calls[0].items[1].svc, { domain: 'climate', service: 'set_fan_mode', data: { fan_mode: 'Silence' }, target: { entity_id: 'climate.ac' } }, 'the raw value goes to HA');
assert.equal(calls[2].items[1].label, '3D');
calls.length = 0;
assert.equal(X(UI, { hvac_modes: ['off', 'heat'], preset_modes: ['eco', 'comfort'], preset_mode: 'eco' }, {}, {}), '', 'a heating-only thermostat gets nothing new');
assert.equal(X(UI, { ...AC }, { hide_cooling: true }, {}), '', 'nor one with cooling hidden');
assert.equal(calls.length, 0);

const T = JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/panel/casora-templates.json', import.meta.url), 'utf8')).templates.casora_thermostat;
for (const k of ['tap_action', 'hold_action']) {
  const c = T[k].casora_popup.content;
  assert.match(c, /_CM\(a, variables\)/, k + ': uses the shared list');
  assert.doesNotMatch(c, /labels = \{ off: 'Aus', heat: 'Heizen', auto: 'Automatik' \}/, k + ': the old filter is gone');
  assert.match(c, /casoraClimateExtras\(UI, a, variables, tgt\)/, k + ': fan, preset, swing');
}
assert.match(fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8'), /key: "hide_cooling"/, 'Studio field');
console.log('thermostat_cooling: ok');
