// Glocke: Sensoren, die nur technisch device_class door tragen, sind keine Türen (03.10.2026).
// Tankerkönig legt je Tankstelle einen „Status“-Sensor (an = geöffnet) mit device_class door an –
// die Glocke meldete „… Status ist offen“. window.casoraNotAnOpening (00-finden.js) erkennt
// solche Plattformen, Sensoren mit Ortsangabe und Diagnose-Entitäten; casora-core.js fragt es
// vor jeder „ist offen“-Meldung.
//   node dev/unit/glocke_keine_tuer.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
const src = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
new Function(src('custom_components/casora/scripts/local/00-finden.js'))();

const no = window.casoraNotAnOpening;
assert.equal(typeof no, 'function');
const h = { states: {}, entities: {} };
const add = (id, platform, attrs, extra) => {
  h.entities[id] = { entity_id: id, platform, ...(extra || {}) };
  h.states[id] = { entity_id: id, state: 'on', attributes: { device_class: 'door', ...attrs } };
};
add('binary_sensor.tankstelle_beispiel_status', 'tankerkoenig', { friendly_name: 'Tankstelle Beispiel Status' });
add('binary_sensor.laden_offen', 'rest', { friendly_name: 'Laden', latitude: 52.1, longitude: 9.9 });
add('binary_sensor.diagnose_tuer', 'zha', { friendly_name: 'Diagnose' }, { entity_category: 'diagnostic' });
add('binary_sensor.haustuer', 'zha', { friendly_name: 'Haustür' });
add('binary_sensor.fenster_bad', 'zha', { friendly_name: 'Fenster Bad', device_class: 'window' });
add('binary_sensor.ohne_registry', undefined, { friendly_name: 'Garagentor' });
delete h.entities['binary_sensor.ohne_registry'];

assert.equal(no(h, 'binary_sensor.tankstelle_beispiel_status'), true, 'Tankerkönig-Status ist keine Tür');
assert.equal(no(h, 'binary_sensor.laden_offen'), true, 'Sensor mit Ortsangabe ist keine Tür');
assert.equal(no(h, 'binary_sensor.diagnose_tuer'), true, 'Diagnose-Entität zählt nicht');
assert.equal(no(h, 'binary_sensor.haustuer'), false, 'echte Tür bleibt');
assert.equal(no(h, 'binary_sensor.fenster_bad'), false, 'echtes Fenster bleibt');
assert.equal(no(h, 'binary_sensor.ohne_registry'), false, 'ohne Registry-Eintrag bleibt');
assert.equal(no(null, 'binary_sensor.x'), false, 'ohne hass kein Fehler');

// Die Glocke (casora-core.js) fragt vor „ist offen“.
const core = src('custom_components/casora/scripts/casora-core.js');
const doors = core.slice(core.indexOf("if (on('doors')"), core.indexOf("' ist offen'"));
assert.ok(/notAnOpening\(hass, id\)/.test(doors), 'Glocke prüft notAnOpening vor der Tür-Meldung');
assert.ok(/window\.casoraNotAnOpening/.test(core), 'Glocke nutzt casoraNotAnOpening');
console.log('ok glocke_keine_tuer');
