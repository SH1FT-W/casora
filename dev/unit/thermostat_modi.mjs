// Thermostat-Kachel (casora_thermostat) im Modus Auto & Co.
//   node dev/unit/thermostat_modi.mjs
// B-TPL-01: Tippen schaltet jeden Modus außer Aus aus (vorher: Auto → Heizen); einschalten nur mit
//           einem Modus, den das Gerät kennt (Helfer auf „cool“ bei reiner Heizung → Heizen).
import fs from 'node:fs';
import assert from 'node:assert/strict';
const T = JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/panel/casora-templates.json', import.meta.url), 'utf8')).templates;
const body = (s) => s.replace(/^\s*\[\[\[/, '').replace(/\]\]\]\s*$/, '');
const tpl = T.casora_thermostat;
const ent = (state, attrs = {}) => ({ entity_id: 'climate.x', state, attributes: { hvac_modes: ['off', 'heat', 'auto'], temperature: 21, ...attrs } });
const toggle = (e, helper) => new Function('entity', 'states', 'variables', body(tpl.variables.toggle_service_data))(
  e, helper ? { 'input_select.casora_thermostat_mode': { state: helper } } : {}, {});
for (const st of ['auto', 'heat', 'cool', 'heat_cool', 'dry', 'fan_only']) assert.equal(toggle(ent(st)).hvac_mode, 'off', st + ' → aus');
assert.equal(toggle(ent('off')).hvac_mode, 'heat', 'aus → Heizen (ohne Helfer)');
assert.equal(toggle(ent('off'), 'cool').hvac_mode, 'heat', 'Helfer cool, Gerät nur Heizen → Heizen');
assert.equal(toggle(ent('off', { hvac_modes: ['off', 'cool'] }), 'heat').hvac_mode, 'cool', 'reines Kühlgerät → Kühlen');
assert.equal(toggle(ent('off', { hvac_modes: ['off', 'heat', 'cool'] }), 'cool').hvac_mode, 'cool', 'Helfer cool und Gerät kann es');
const puck = JSON.stringify(tpl);
assert.ok(!puck.includes("const nextMode = ['cool','heat'].includes(entity?.state)"), 'Symbol-Tipp: alte Regel weg');
console.log('ok B-TPL-01');

// B-TPL-02: Kachel-Text im Modus Auto nicht „Aus“; ohne temperature kein „undefined°“.
{
  globalThis.window = globalThis;
  const disp = (e, act = {}) => { window.casoraClimateActive = () => act; return new Function('entity', 'states', 'variables', body(tpl.state_display))(e, {}, {}); };
  assert.equal(disp(ent('auto')), 'Automatik · 21°');
  assert.equal(disp(ent('heat_cool', { temperature: undefined, target_temp_low: 20, target_temp_high: 24 })), 'Automatik · 20–24°');
  assert.equal(disp(ent('heat', { temperature: undefined }), { heating: true }), 'Heizt', 'ohne Ziel kein undefined');
  assert.equal(disp(ent('heat'), { heating: true }), 'Heizt auf 21°');
  assert.equal(disp(ent('off')), 'Aus');
}
console.log('ok B-TPL-02');
