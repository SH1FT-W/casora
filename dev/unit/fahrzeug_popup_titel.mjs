// Issue #17: Der Titel des Auto-Popups kam aus dem Entitätsnamen und kürzte nur „Reichweite…“ –
// eine Kachel auf „…_tankstand“ hieß „Auto Tankstand“. Erwartet: Gerätename (name_by_user vor name),
// eigener room_name der Kachel weiter zuerst, ohne Gerät wie bisher.   node dev/unit/fahrzeug_popup_titel.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const T = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const pops = [];
(function walk(o) {
  if (!o || typeof o !== 'object') return;
  if (o.casora_popup && typeof o.casora_popup.title === 'string') pops.push(o.casora_popup.title);
  Object.values(o).forEach(walk);
})(T.casora_popup_car);
assert.ok(pops.length >= 1, 'Titel-Ausdruck nicht gefunden');

const run = (code, { entity, variables = {}, hass }) => {
  const body = code.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
  const window = {}, document = { querySelector: () => null };
  return new Function('entity', 'variables', 'hass', 'window', 'document', body)(entity, variables, hass, window, document);
};
const hass = {
  entities: {
    'sensor.auto_tankstand': { device_id: 'd1' }, 'sensor.auto_reichweite': { device_id: 'd1' },
    'sensor.zweit_tankstand': { device_id: 'd2' }, 'sensor.ohne_geraet_tankstand': {},
  },
  devices: { d1: { name: 'Kombi TDI', name_by_user: null }, d2: { name: 'Werkname', name_by_user: 'Zweitwagen' } },
};
const ent = (id, fn) => ({ entity_id: id, attributes: { friendly_name: fn } });
for (const code of pops) {
  assert.equal(run(code, { entity: ent('sensor.auto_tankstand', 'Kombi TDI Tankstand'), hass }), 'Kombi TDI');
  assert.equal(run(code, { entity: ent('sensor.auto_reichweite', 'Kombi TDI Reichweite'), hass }), 'Kombi TDI');
  assert.equal(run(code, { entity: ent('sensor.zweit_tankstand', 'Werkname Tankstand'), hass }), 'Zweitwagen');
  assert.equal(run(code, { entity: ent('sensor.auto_tankstand', 'x'), variables: { room_name: 'Familienauto' }, hass }), 'Familienauto');
  assert.equal(run(code, { entity: ent('sensor.ohne_geraet_tankstand', 'Alt Reichweite kombiniert'), hass }), 'Alt');
  assert.equal(run(code, { entity: null, hass: null }), 'Fahrzeug');
}
console.log('fahrzeug_popup_titel: ok (' + pops.length + ' Titel)');
