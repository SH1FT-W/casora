// B-ALARM: Alarmo-Zustand armed_custom_bypass heißt überall „Teilweise“ – passend zu
// „Aktiv · Zuhause/Abwesend/Nacht/Urlaub/Teilweise“, „Aus“, „Alarm!“ (Weich) und in Standard/Glas.
//   node dev/unit/alarm_teilweise.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const T = JSON.parse(read('custom_components/casora/panel/casora-templates.json')).templates;
const strings = (o) => typeof o === 'string' ? [o] : o && typeof o === 'object' ? Object.values(o).flatMap(strings) : [];
// Alarm-Vorlagen: kein „Bypass“ als Wort für den Alarm mehr (Solarbank-„Bypass“ ist etwas anderes).
for (const name of ['casora_alarm', 'casora_badge_security', 'casora_badge_contact_group', 'casora_popup_alarm', 'casora_mobile_sensor_chips']) {
  const all = strings(T[name]).join('\n') + JSON.stringify(T[name]);
  assert.ok(!/'Bypass'|"Bypass"|\(Bypass\)|· Bypass|Sensoren temporär deaktiviert/.test(all), name + ': noch „Bypass“');
}
for (const name of ['casora_badge_security', 'casora_popup_alarm']) {
  const all = strings(T[name]).join('\n');
  assert.ok(all.includes("label: 'Teilweise', description: 'Einzelne Sensoren ausgenommen'"), name + ': Modus-Knopf');
  assert.ok(all.includes("armed_custom_bypass: 'Aktiviert · Teilweise'"), name + ': Zustand');
}
const chips = JSON.stringify(T.casora_mobile_sensor_chips);
assert.ok(chips.includes('"id":"armed_custom_bypass","label":"Teilweise"') || chips.includes('"label":"Teilweise"'), 'Handy-Chips: Modus „Teilweise“');
// Zentrales Wort (Weich) und Glocke/Verlauf (Standard/Glas)
assert.ok(read('custom_components/casora/scripts/local/00-finden.js').includes("armed_custom_bypass: 'Teilweise'"));
assert.ok(read('custom_components/casora/scripts/casora-core.js').includes("armed_custom_bypass: 'Alarm scharf – Teilweise'"));
assert.ok(read('custom_components/casora/scripts/local/01-basis.js').includes("armed_custom_bypass: 'Teilweise' };"));
console.log('ok alarm_teilweise');
