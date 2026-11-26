// Test round 26.11.2026 (u05-02): a thermostat that is off at its frost guard (5 °C). The popup's dial says
// „Einschalten auf 20,0 °C“ and its + heats at 20 °C; the tile's switch only set „Heizen“ and the device stayed at 5 °C
// („Bereit“, nothing heats). Now the switch, the icon tap and the dial share one rule (casoraThermoToggle /
// casoraThermoOnTarget).
//   node dev/unit/thermostat_einschalten.mjs
// @deckt: custom_components/casora/scripts/local/01-basis.js#casoraThermoToggle,casoraThermoOnTarget dashboards/casora/button_card_templates.json#casora_thermostat
import fs from 'node:fs';
import assert from 'node:assert/strict';

const rd = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
globalThis.window = globalThis;
const basis = rd('custom_components/casora/scripts/local/01-basis.js');
const b0 = basis.indexOf('window.casoraThermoOnTarget = function');
new Function(basis.slice(b0, basis.indexOf('window.casoraPopupTitle = function', b0)))();
const T = JSON.parse(rd('custom_components/casora/panel/casora-templates.json')).templates;
const body = (s) => s.replace(/^\s*\[\[\[/, '').replace(/\]\]\]\s*$/, '');
const tpl = T.casora_thermostat;
const run = (src, e, states = {}) => new Function('entity', 'states', 'variables', body(src))(e, states, {});
const ent = (id, state, attrs = {}) => ({ entity_id: id, state, attributes: { hvac_modes: ['off', 'heat'], temperature: 5, min_temp: 5, max_temp: 30, ...attrs } });

// The reported case: off at 5 °C, never seen on – the switch heats at 20 °C like the dial.
{
  const e = ent('climate.example_bath', 'off');
  assert.equal(run(tpl.variables.toggle_service, e), 'climate.set_temperature', 'switch: set_temperature, not only the mode');
  assert.deepEqual(run(tpl.variables.toggle_service_data, e), { entity_id: 'climate.example_bath', temperature: 20, hvac_mode: 'heat' });
}
// Seen on at 22 °C on this page, then switched off: on again at 22 °C (the dial's „Einschalten auf 22,0 °C“).
{
  const on = ent('climate.example_hall', 'heat', { temperature: 22 });
  assert.deepEqual(run(tpl.variables.toggle_service_data, on), { entity_id: 'climate.example_hall', hvac_mode: 'off' }, 'on: switches off');
  assert.equal(run(tpl.variables.toggle_service, on), 'climate.set_hvac_mode');
  const off = ent('climate.example_hall', 'off', { temperature: 5 });
  assert.equal(run(tpl.variables.toggle_service_data, off).temperature, 22);
  assert.equal(window.casoraThermoOnTarget(off), 22, 'the dial reads the same target');
}
// Its own target above the minimum stays.
assert.equal(window.casoraThermoToggle(ent('climate.example_a', 'off', { temperature: 19.5 })).data.temperature, 19.5);
// No temperature (mode only), a cooler, a group, the helper on Automatik: only the mode, as before.
{
  const modeOnly = ent('climate.example_b', 'off', { temperature: undefined, supported_features: 0 });
  assert.deepEqual(window.casoraThermoToggle(modeOnly), { service: 'climate.set_hvac_mode', data: { entity_id: 'climate.example_b', hvac_mode: 'heat' } });
  const cooler = ent('climate.example_c', 'off', { hvac_modes: ['off', 'cool'] });
  assert.deepEqual(window.casoraThermoToggle(cooler).data, { entity_id: 'climate.example_c', hvac_mode: 'cool' });
  const group = ent('climate.example_g', 'off', { member_entities: ['climate.a', 'climate.b'] });
  assert.equal(window.casoraThermoToggle(group).service, 'climate.set_hvac_mode', 'groups never get a target');
  const auto = ent('climate.example_d', 'off', { hvac_modes: ['off', 'heat', 'auto'] });
  assert.deepEqual(window.casoraThermoToggle(auto, { 'input_select.casora_thermostat_mode': { state: 'auto' } }).data, { entity_id: 'climate.example_d', hvac_mode: 'auto' });
}
// The icon tap (temp_puck) and the popup's dial use the same helpers.
assert.match(tpl.custom_fields.temp_puck, /window\.casoraThermoToggle\(_h\.states\[/, 'icon tap reads the rule when tapped');
for (const k of ['tap_action', 'hold_action']) assert.match(tpl[k].casora_popup.content, /window\.casoraThermoOnTarget\(entity\)/, k + ': dial target');
console.log('ok thermostat switch heats at the dial\'s target');
