// dashfix2 (06.10.2026): the thermostat tile showed „Bereit · 5.5°“ with a point instead of a comma. Since the calm
// tile (02.11.2026) it shows no target; the comma stays for the room reading in front.
//   node dev/unit/thermostat_komma.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const tpl = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const body = tpl.casora_thermostat.state_display.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
const run = (state, attributes) => new Function('entity', 'window', body)({ state, attributes }, {});
assert.equal(run('heat', { temperature: 19.5, current_temperature: 19.5 }), '19,5° · Bereit');
assert.equal(run('heat', { temperature: 21, current_temperature: 21 }), '21° · Bereit');
assert.equal(run('auto', { target_temp_low: 18.5, target_temp_high: 22, current_temperature: 20.25 }), '20,3° · Automatik');
console.log('ok thermostat_komma');
