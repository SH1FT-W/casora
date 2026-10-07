// Pflanzen-Popup am Handy (07.10.2026): Messwert-Zeilen hießen „<Pflanze ohne Umlaut> Temperatur 2“,
// weil der Pflanzenname nur bei exakt gleicher Schreibweise vorn weggelassen wurde. Erwartet: Pflanzen-
// bzw. Gerätename vorn weg – unabhängig von Umlauten/Akzenten und Groß-/Kleinschreibung –, der HA-Zusatz
// für doppelte Namen („ 2“) weg, Großschreibung umlautfest. Ohne Browser: cleanName aus der Vorlage laden.
//   node dev/unit/pflanze_messwert_namen.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const tpl = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const src = tpl.casora_popup_plant.tap_action.casora_popup.content;
const a = src.indexOf('  const cleanName = (eid) => {');
assert.ok(a > 0, 'cleanName gefunden');
const b = src.indexOf('\n  };\n', a);
const fnSrc = src.slice(a, b + 5);
// Spalte des Popups: minmax(0, 1fr), sonst schiebt ein langer Name den Inhalt über den Rand.
assert.ok(src.includes("'grid-template-columns': 'minmax(0, 1fr)'"), 'Spalte mit minmax(0, 1fr)');
assert.ok(!src.includes("'grid-template-columns': '1fr'"), 'keine 1fr-Spalte ohne Mindestbreite 0');

const hass = {
  devices: { d_p: { name: 'Grüne Lilie' }, d_s: { name: 'Gruene Lilie Sensor', name_by_user: 'Grune Lilie 2' } },
  entities: { 'plant.lilie': { device_id: 'd_p' }, 'sensor.fremd': { device_id: 'd_s' } },
};
const fn = (plant, pName, st) => new Function('states', 'entity', 'hass', 'plant', fnSrc + '\nreturn cleanName;')(
  st, { attributes: { friendly_name: pName } }, hass, plant);
const st = (n) => ({ state: '1', attributes: { friendly_name: n } });
const states = {
  'sensor.t': st('Grune Lilie Temperatur 2'),
  'sensor.h': st('GRÜNE LILIE Luftfeuchtigkeit'),
  'sensor.m': st('Grüne Lilie Bodenfeuchtigkeit'),
  'sensor.n': st('Grune Lilie 2 Leitfähigkeit'),
  'sensor.fremd': st('Grune Lilie 2 Bodentemperatur'),
  'sensor.kein': st('Grüne Lilien Beleuchtungsstärke'),
  'sensor.nur': st('Grüne Lilie'),
  'sensor.ue': st('Grüne Lilie überdüngt'),
  'sensor.dli': st('Grüne Lilie Dli 24h'),
};
const c = fn('plant.lilie', 'Grüne Lilie', states);
assert.equal(c('sensor.t'), 'Temperatur');
assert.equal(c('sensor.h'), 'Luftfeuchtigkeit');
assert.equal(c('sensor.m'), 'Bodenfeuchtigkeit');
assert.equal(c('sensor.n'), 'Leitfähigkeit');
// Gerätename des Sensors (anders als die Pflanze) fällt ebenfalls weg.
assert.equal(c('sensor.fremd'), 'Bodentemperatur');
// Nur ganze Wörter: „Lilien“ ist nicht „Lilie“.
assert.equal(c('sensor.kein'), 'Grüne Lilien Beleuchtungsstärke');
// Bliebe nichts übrig, bleibt der Name stehen.
assert.equal(c('sensor.nur'), 'Grüne Lilie');
assert.equal(c('sensor.ue'), 'Überdüngt');
assert.equal(c('sensor.dli'), 'Dli 24h');
// Pflanzenname mit Akzent, Messwert ohne.
assert.equal(fn('plant.x', 'Café Pflanze', { 'sensor.a': st('Cafe Pflanze Temperatur 2') })('sensor.a'), 'Temperatur');
console.log('ok pflanze_messwert_namen');
