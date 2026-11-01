// Owner, 01.11.2026: the thermostat group (casora_thermostat over a climate group) is the floor heating group of §4.4 –
// shared target, − / +, knob for every room that is on, rooms as rows with › – one logic (03-popups.js _casoraFbhPopup);
// its rooms open as thermostats. Live: dev/qa/regress/r246_klimagruppe_einzeln.mjs.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const T = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const c = T.casora_thermostat.tap_action.casora_popup.content;
assert.match(c, /if \(members\.length && window\._casoraFbhPopup && window\._casoraFbh && window\._casoraFbh\.v3 && window\._casoraFbh\.v3\(\)\)/, 'group goes to the shared popup');
assert.match(c, /room_tpl: \['casora_thermostat'\]/, 'rooms open as thermostats');
const pop = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/03-popups.js', import.meta.url), 'utf8');
assert.ok(pop.includes('roomTpl: Array.isArray(variables.room_tpl) ? variables.room_tpl : null'), 'room_tpl taken over');
assert.ok(pop.includes("template: Array.isArray(d.tpl) ? d.tpl : ['casora_thermostat', 'casora_popup_fbh']"), 'row opens with its template');
console.log('thermostat_group_v3: ok');
