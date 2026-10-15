// Warn-Kachel und Warn-Popup heißen allgemein „Warnungen“ (nicht „NINA“) – die Sensoren können aus NINA,
// vom DWD oder aus einer Integration kommen, die beides bündelt.
//   node dev/unit/warnungen_namen.mjs
// Gewünscht 15.10.2026: Popup „NINA-Warnungen“, „Aktuell keine NINA-Meldungen“ und Kachel „NINA“ passten
// nicht mehr, seit die Warnungen (DWD + Bevölkerungsschutz) aus einer anderen Integration kommen.
// Das Warngebiet kommt aus dem Attribut `region`, wenn der Sensor eines hat, sonst wie bisher aus dem
// NINA-Entitätsnamen.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const all = JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/panel/casora-templates.json', import.meta.url), 'utf8')).templates;
const tile = JSON.stringify(all.casora_weather_warning);
const popup = JSON.stringify(all.casora_popup_weather_warning);

for (const [name, src] of [['casora_weather_warning', tile], ['casora_popup_weather_warning', popup]]) {
  assert.ok(!/NINA-Warnung|NINA-Meldung|return \\"NINA/.test(src), `${name}: noch „NINA“ im sichtbaren Text`);
}
assert.ok(tile.includes('return \\"Warnungen\\"'), 'Kachel ohne Warnung heißt „Warnungen“');
assert.ok(popup.includes('Aktuell keine Warnungen'), 'Popup ohne Warnung: „Aktuell keine Warnungen“');
assert.ok(popup.includes("'Amtliche Warnung'"), 'Ersatztitel einer Warnung: „Amtliche Warnung“');
assert.ok(popup.includes('attributes?.region'), 'Warngebiet aus dem Attribut region');
assert.ok(popup.includes('nina_warning_'), 'NINA-Entitätsname bleibt als Rückfall für das Gebiet');

const basis = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/01-basis.js', import.meta.url), 'utf8');
assert.ok(!basis.includes('Amtliche Warnung (NINA)'), 'Glocke: Unterzeile ohne „(NINA)“');

console.log('warnungen_namen: ok');
