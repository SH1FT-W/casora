// @deckt: custom_components/casora/scripts/local/31-velair.js#casoraClimateExtras
// Issue #219: a heating thermostat reports preset_modes [none, home, sleep], the thermostat popup offered presets only on a
// device that cools. Now a heating-only thermostat gets the same „Voreinstellung“ choice; fan and swing stay with cooling.
//   node dev/unit/thermostat_presets_heating.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null, addEventListener: () => {} };
new Function(fs.readFileSync(new URL('../../custom_components/casora/scripts/local/31-velair.js', import.meta.url), 'utf8'))();
const X = window.casoraClimateExtras;
const calls = [];
const UI = { segments: (items, label) => { calls.push({ label, items }); return `<seg ${label}>`; } };
const run = (attrs, variables) => { calls.length = 0; return X(UI, attrs, variables || {}, { entity_id: 'climate.trv' }); };
const HEAT = { hvac_modes: ['heat', 'off', 'auto'], preset_modes: ['none', 'home', 'sleep'], preset_mode: 'sleep' };

// Heating only with presets: one choice, the current preset marked, the raw value goes to set_preset_mode.
const html = run(HEAT);
assert.equal(html.match(/<seg /g).length, 1, 'the preset choice alone');
assert.match(html, /^<div style="height:18px"><\/div><seg Voreinstellung>$/, 'same gap and label as on a cooling device');
assert.deepEqual(calls[0].items.map((i) => i.label), ['Keine', 'Zuhause', 'Schlafen']);
assert.deepEqual(calls[0].items.map((i) => i.active), [false, false, true], 'the current preset_mode is marked');
assert.deepEqual(calls[0].items[1].svc, { domain: 'climate', service: 'set_preset_mode', data: { preset_mode: 'home' }, target: { entity_id: 'climate.trv' } });

// Every known preset has a German word (translated by the phrase files); an unknown one shows its own name.
run({ hvac_modes: ['heat', 'off'], preset_modes: ['none', 'home', 'away', 'sleep', 'eco', 'comfort', 'boost', 'activity', 'Frostschutz 2'], preset_mode: 'none' });
assert.deepEqual(calls[0].items.map((i) => i.label), ['Keine', 'Zuhause', 'Abwesend', 'Schlafen', 'Eco', 'Komfort', 'Boost', 'Aktiv', 'Frostschutz 2']);
const en = JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/translations/dashboard/phrases/en.json', import.meta.url), 'utf8'));
const flat = JSON.stringify(en);
for (const w of ['Voreinstellung', 'Keine', 'Zuhause', 'Abwesend', 'Schlafen', 'Eco', 'Komfort', 'Boost', 'Aktiv']) assert.ok(flat.includes(JSON.stringify(w) + ':'), w + ' has a translation');

// Heating only: fan and swing stay out even when reported.
run({ ...HEAT, fan_modes: ['auto', 'low'], fan_mode: 'auto', swing_modes: ['off', 'on'], swing_mode: 'off' });
assert.deepEqual(calls.map((c) => c.label), ['Voreinstellung']);

// Nothing to choose: no presets, only „none“, or a single preset.
assert.equal(run({ hvac_modes: ['heat', 'off'] }), '', 'no preset_modes');
assert.equal(run({ hvac_modes: ['heat', 'off'], preset_modes: [] }), '', 'empty list');
assert.equal(run({ hvac_modes: ['heat', 'off'], preset_modes: ['none'], preset_mode: 'none' }), '', 'only none');
assert.equal(run({ hvac_modes: ['heat', 'off'], preset_modes: ['none', 'None'] }), '', 'none in any case');
assert.equal(run({ hvac_modes: ['heat', 'off'], preset_modes: ['eco'], preset_mode: 'eco' }), '', 'a single preset is no choice');
assert.equal(run({ hvac_modes: ['heat', 'off'], preset_modes: 'eco' }), '', 'not a list');
assert.equal(calls.length, 0);

// A heating that claims cooling, hidden per tile: treated as heating only.
run({ ...HEAT, hvac_modes: ['off', 'heat', 'cool'], fan_modes: ['auto', 'low'] }, { hide_cooling: true });
assert.deepEqual(calls.map((c) => c.label), ['Voreinstellung']);

// A device that cools: unchanged – fan, preset, swing in this order.
const AC = { hvac_modes: ['cool', 'heat', 'off'], fan_modes: ['auto', 'low'], fan_mode: 'low', preset_modes: ['none', 'eco'], preset_mode: 'none',
  swing_modes: ['off', 'on'], swing_mode: 'off' };
run(AC);
assert.deepEqual(calls.map((c) => c.label), ['Lüfter', 'Voreinstellung', 'Lamellen']);
assert.deepEqual(calls[1].items.map((i) => [i.label, i.active]), [['Keine', true], ['Eco', false]]);
run({ ...AC, preset_modes: ['none'] });
assert.deepEqual(calls.map((c) => c.label), ['Lüfter', 'Lamellen'], 'cooling with only none: as before');
console.log('thermostat_presets_heating: ok');
