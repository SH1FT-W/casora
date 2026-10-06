// dashfix2 (06.10.2026): Thermostat-Kachel zeigte „Bereit · 5.5°“ mit Punkt statt Komma.
//   node dev/unit/thermostat_komma.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const tpl = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const body = tpl.casora_thermostat.state_display.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
const run = (state, attributes) => new Function('entity', 'window', body)({ state, attributes }, {});
assert.equal(run('heat', { temperature: 19.5 }), 'Bereit · 19,5°');
assert.equal(run('heat', { temperature: 21 }), 'Bereit · 21°');
assert.equal(run('auto', { target_temp_low: 18.5, target_temp_high: 22 }), 'Automatik · 18,5–22°');
console.log('ok thermostat_komma');
