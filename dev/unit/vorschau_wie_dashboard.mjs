// Studio-Vorschau zeigt Kacheln wie das Dashboard (Nutzertest 6, H-T4).
//   node dev/unit/vorschau_wie_dashboard.mjs
// Gemeldet: Die Alarm-Kachel auf „Zuhause“ hat keine eigene Entität – die Vorlage nimmt die Alarmanlage
// aus alarm_entity (Standard Alarmo). Das Dashboard zeigte „Alarmo · Zuhause“, das Studio „Alarm ·
// Gerät fehlt“; wer sie für ein Kind ausblenden wollte, fand sie nicht. Erwartet: Entität und Name
// aus der Vorlagenkette wie im Dashboard.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const noop = () => {};
globalThis.window = { addEventListener: noop };
globalThis.document = { createElement: () => ({}), documentElement: {} };
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
window.matchMedia = () => ({ matches: false });
const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel-types.js', import.meta.url), 'utf8');
new Function(src.replace(/import\.meta\.url/g, '"http://x/casora-panel-types.js"').replace(/import\(([^)]*)\)/g, 'Promise.resolve()'))();
const { templates } = JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/panel/casora-templates.json', import.meta.url), 'utf8'));
assert.equal(typeof window.casoraTileEntity, 'function');
assert.equal(typeof window.casoraTileName, 'function');

const alarm = { entity_id: 'alarm_control_panel.alarmo', state: 'armed_home', attributes: { friendly_name: 'Alarmo' } };
const hass = { states: { [alarm.entity_id]: alarm, 'switch.pumpe': { entity_id: 'switch.pumpe', state: 'on', attributes: { friendly_name: 'Pumpe' } } } };

// Alarm ohne eigene Entität: Alarmo aus der Vorlage, Name wie im Dashboard
const tile = { type: 'custom:button-card', template: 'casora_alarm', variables: {} };
assert.equal(window.casoraTileEntity(tile, hass, templates), 'alarm_control_panel.alarmo');
assert.equal(window.casoraTileName(tile, alarm, hass, templates), 'Alarmo');
// … ohne Alarmanlage in HA bleibt es bei „keine Entität“ (Vorschau: Gerät fehlt)
assert.equal(window.casoraTileEntity(tile, { states: {} }, templates), null);
// … eigene Alarmanlage über alarm_entity
const own = { ...tile, variables: { alarm_entity: 'alarm_control_panel.haus' } };
assert.equal(window.casoraTileEntity(own, { states: { 'alarm_control_panel.haus': { state: 'disarmed', attributes: {} } } }, templates), 'alarm_control_panel.haus');
// Eigene Entität und eigener Name gewinnen
assert.equal(window.casoraTileEntity({ ...tile, entity: 'alarm_control_panel.x' }, hass, templates), 'alarm_control_panel.x');
assert.equal(window.casoraTileName({ ...tile, name: 'Haus' }, alarm, hass, templates), null);

// Vorlagenliste (Fußbodenheizung) und feste Namen (Rezept, Wetterwarnung)
assert.equal(window.casoraTileName({ type: 'custom:button-card', template: ['casora_thermostat', 'casora_popup_fbh'] }, null, hass, templates), 'Thermostat');
assert.equal(window.casoraTileName({ type: 'custom:button-card', template: 'casora_recipe' }, null, hass, templates), 'Rezept');
assert.equal(window.casoraTileName({ type: 'custom:button-card', template: 'casora_weather_warning' }, null, hass, templates), 'NINA');
// Fremde Karten: nichts Eigenes
assert.equal(window.casoraTileName({ type: 'tile', entity: 'switch.pumpe' }, hass.states['switch.pumpe'], hass, templates), null);

console.log('ok vorschau_wie_dashboard');
