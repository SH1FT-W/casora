// 09.10.2026: Fußbodenheizung taktet (hvac_action wechselt minutenweise heating/idle). In der
// Pause unter dem Ziel stand „Bereit“, das klang nach „Ziel erreicht“. Jetzt „Heizt auf“, am Ziel „An · 22°“.
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

assert.equal(tile('heat', at('heating', 21.5)), 'Heizt auf 22°');
assert.equal(tile('heat', at('idle', 21.5)), 'Heizt auf 22°');   // Taktpause unter dem Ziel
assert.equal(tile('heat', at('idle', 21.9)), 'An · 22°');        // innerhalb 0,2 °C = am Ziel
assert.equal(tile('heat', at('idle', 22.4)), 'An · 22°');
assert.equal(tile('heat', at('idle', null)), 'An · 22°');        // ohne Ist-Wert nichts raten
assert.equal(tile('cool', at('idle', 24)), 'Kühlt auf 22°');
assert.equal(tile('cool', at('idle', 22)), 'An · 22°');
assert.equal(tile('off', at('idle', 18)), 'Aus');
console.log('ok thermostat_taktpause');
