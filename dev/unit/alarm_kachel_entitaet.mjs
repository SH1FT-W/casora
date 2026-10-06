// dashfix (06.10.2026): Alarm-Kachel ohne zugeordnete Entität zeigte „Noch nicht eingerichtet“, ihr Popup
// aber den Zustand der Standard-Alarmanlage (alarm_entity, Alarmo) – „Aktiv · Zuhause“. Kachel und
// Popup meinen jetzt dieselbe Anlage; gibt es sie nicht, bleibt die Kachel „nicht eingerichtet“.
//   node dev/unit/alarm_kachel_entitaet.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const T = JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/panel/casora-templates.json', import.meta.url), 'utf8')).templates;
const tile = T.casora_alarm;
assert.ok(typeof tile.entity === 'string' && tile.entity.trim().startsWith('[[['), 'Vorlage setzt eine Ersatz-Entität');
const run = (variables, states) => new Function('variables', 'states', tile.entity.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, ''))(variables, states);
const id = T.casora_popup_alarm.variables.alarm_entity;
assert.equal(run({ alarm_entity: id }, { [id]: { state: 'armed_home' } }), id, 'dieselbe Anlage wie das Popup');
assert.equal(run({ alarm_entity: id }, {}), null, 'ohne Anlage: keine Entität');
assert.equal(run({}, { [id]: {} }), null);
console.log('ok alarm_kachel_entitaet');
