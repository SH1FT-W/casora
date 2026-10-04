// Umzug Hemma 1 (und ältere Fassungen) → Casora: Schalter, Aquarien und Türklingel als Studio-Kacheltypen.
//   node dev/unit/umzug_kacheltypen.mjs
// Entscheidung 03.10.2026: …_switch, …_aquarium und …_doorbell landeten als „eigene Karte“ ohne
// Studio-Felder. Jetzt: Schalter → Schalter-Kachel, Aquarien → Aquarien-Kachel, Türklingel →
// Kamera-Kachel (mit der Kamera der Klingel). Fußball (…_match) bleibt eine eigene Karte.
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
const read = (f) => fs.readFileSync(new URL('../../custom_components/casora/panel/' + f, import.meta.url), 'utf8');
new Function(read('casora-panel-import.js'))();
// casora-panel-types.js: nur die Kacheltypen (die übrigen Teile brauchen den Browser).
const typesSrc = read('casora-panel-types.js');
new Function(typesSrc.slice(0, typesSrc.indexOf('// Symbole, die Casora mitliefert')))();
const types = window.CASORA_TILE_TYPES;
const tpl = (id) => (types.find((t) => t.id === id) || {}).template;
assert.equal(tpl('casora_switch'), 'casora_switch', 'Schalter ist ein Kacheltyp');
assert.equal(tpl('casora_aquariums'), 'casora_aquarium', 'Aquarien-Übersicht ist ein Kacheltyp');
assert.ok(!types.some((t) => /match/.test(String(t.template))), 'Fußball bleibt eigene Karte');
assert.deepEqual(types.find((t) => t.id === 'casora_aquariums').fields.map((f) => f.key).filter((k) => /^entity_/.test(k)),
  ['entity_freshwater', 'entity_saltwater', 'entity_turtle']);

const { upgrade } = window.casoraLegacy;
const tile = (template, entity, name) => ({ card: {}, template, entity, name: name || '', variables: { icon: 'doorbell' } });
const hass = {
  states: { 'camera.klingel_test_live': {}, 'camera.flur': {}, 'binary_sensor.klingel_test': {}, 'binary_sensor.garten_ding': {} },
  entities: { 'binary_sensor.garten_ding': { device_id: 'd1' }, 'camera.flur': { device_id: 'd1' } },
};
// Kamera als Entität: bleibt, nur die Vorlage wechselt; ohne Namen „Doorbell“ (wird übersetzt).
let t = upgrade(tile('casora_doorbell', 'camera.front', ''), hass);
assert.equal(t.template, 'casora_camera'); assert.equal(t.entity, 'camera.front'); assert.equal(t.name, 'Doorbell');
assert.deepEqual(t.variables, { icon: 'doorbell' }, 'Variablen bleiben');
// Klingel-Sensor: Kamera am selben Gerät …
t = upgrade(tile('casora_doorbell', 'binary_sensor.garten_ding', 'Garten'), hass);
assert.equal(t.template, 'casora_camera'); assert.equal(t.entity, 'camera.flur'); assert.equal(t.name, 'Garten');
// … sonst eine mit demselben Namen.
t = upgrade(tile('casora_doorbell', 'binary_sensor.klingel_test', 'Haustür'), hass);
assert.equal(t.entity, 'camera.klingel_test_live');
// Keine Kamera zu finden: bleibt, wie sie ist (eigene Karte, funktioniert weiter).
t = upgrade(tile('casora_doorbell', 'binary_sensor.keller_ding', 'Keller'), hass);
assert.equal(t.template, 'casora_doorbell');
// Andere Kacheln unverändert.
const sw = tile('casora_switch', 'switch.skimmer', 'Skimmer');
assert.equal(upgrade(sw, hass), sw);
const m = tile('casora_match', 'sensor.italien', '');
assert.equal(upgrade(m, hass), m);
console.log('ok umzug_kacheltypen');
