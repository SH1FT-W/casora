// 09.10.2026: floor heating cycles (hvac_action switches heating/idle every few minutes). In the pause below the
// target the tile said „Inaktiv“, which sounded like „target reached“. It says „Heizt“; „Inaktiv“ only at the target
// (calm tile 02.11.2026: no target number).
//   node dev/unit/thermostat_taktpause.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/06-kalender.js', import.meta.url), 'utf8');
const block = src.slice(src.indexOf('// ── Thermostat aktiv?'), src.indexOf('// ── Glocke'));
const window = {};
new Function('window', block)(window);
const tpl = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const body = tpl.casora_thermostat.state_display.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
const tile = (state, attributes) => new Function('entity', 'window', body)({ state, attributes }, window);
const at = (hvac_action, current_temperature, temperature = 22) => ({ hvac_action, current_temperature, temperature });

assert.equal(tile('heat', at('heating', 21.5)), '21,5° · Heizt');
assert.equal(tile('heat', at('idle', 21.5)), '21,5° · Heizt');   // pause below the target
assert.equal(tile('heat', at('idle', 21.9)), '21,9° · Inaktiv');  // within 0.2 °C = at the target
assert.equal(tile('heat', at('idle', 22.4)), '22,4° · Inaktiv');
assert.equal(tile('heat', at('idle', null)), 'Inaktiv');          // no reading: no guess
assert.equal(tile('cool', at('idle', 24)), '24° · Kühlt');
assert.equal(tile('cool', at('idle', 22)), '22° · Inaktiv');
assert.equal(tile('off', at('idle', 18)), '18° · Aus');
// Review 2 (fam-15): without a sensor the thermostat's own reading stands in front.
console.log('ok thermostat_taktpause');
