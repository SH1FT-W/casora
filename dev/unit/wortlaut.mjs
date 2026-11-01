// Wording: a state word after a number is small, as inside a sentence – „1 an“, „3 an“, „2 aktiv“, „2 schwach“
// (owner, 01.11.2026; replaces the capitals of 23.09.2026). Standing alone it stays „An“.
// Ohne Zahl klein (07.10.2026): „Keine aktiv“ (wie im Studio), englisch „None active“.
// Design-Durchsicht 1.2, D13c (Entscheidung 08.10.2026): Zähler der Szenen-Badge klein wie mitten im
// Satz – „2 aktiv“ (löst „2 Aktiv“ ab). Licht „1 an“ since 01.11.2026.
// node dev/unit/wortlaut.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const T = JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/panel/casora-templates.json', import.meta.url), 'utf8')).templates;
const light = JSON.stringify(T.casora_badge_light_group);
assert.ok(light.includes("'1 an'") && light.includes('${onCount} an`') && !light.includes('${onCount} An`'), 'Licht-Gruppenbadge: „1 an“ / „N an“');
const scene = JSON.stringify(T.casora_badge_scene_group);
assert.ok(scene.includes("'Keine aktiv'") && !scene.includes("'Keine Aktiv'") && scene.includes("' aktiv'") && !scene.includes("' Aktiv'"), 'Szenen-Badge: „Keine aktiv“ / „N aktiv“');
// Die Quelle (dashboards/casora) muss dasselbe sagen – sonst dreht build-templates.py es zurück.
const SRC = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
// Paket ist verschlankt (tools/js_schlank.py) – die Quelle muss dieselben Wörter tragen.
const srcL = JSON.stringify(SRC.casora_badge_light_group), srcS = JSON.stringify(SRC.casora_badge_scene_group);
assert.ok(srcL.includes("'1 an'") && srcL.includes('${onCount} an`'), 'Quelle = Paket (Licht-Gruppenbadge)');
assert.ok(srcS.includes("'Keine aktiv'") && srcS.includes("' aktiv'") && !srcS.includes("' Aktiv'"), 'Quelle = Paket (Szenen-Badge)');
const en = JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/translations/dashboard/phrases/en.json', import.meta.url), 'utf8'));
assert.ok(en.exact['Keine aktiv'] === 'None active' && !en.exact['Keine Aktiv'] && en.patterns.some((p) => p[0] === '^(\\d+) aktiv$') && en.patterns.some((p) => p[0] === '^(\\d+) an$'),
  'englische Übersetzung: „None active“, „N aktiv“, „N an“');
console.log('ok wortlaut');

// Akku-Stufen (05.10.2026, Nachauftrag K1 „Batterie states überarbeiten“): eine Regel überall –
// OK / Schwach (≤ 20 %) / Fast leer (≤ 10 %) aus window.casoraBattery. Kachel „N schwach“ (number +
// small state word like „1 an“, 01.11.2026), Popup-Kopf „N Akkus schwach“ / „Alle Batterien OK“ (1.3, V7), Glocke ebenso.
const bat = JSON.stringify(T.casora_battery);
assert.ok(bat.includes("' schwach'") && bat.includes("'OK'") && bat.includes('casoraBattery'), 'Batterien-Kachel: „OK“ / „N schwach“ über casoraBattery');
const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
assert.ok(/WORD: \{ ok: 'OK', low: 'Schwach', crit: 'Fast leer', charging: 'Lädt'/.test(core), 'casoraBattery: Stufenwörter');
assert.ok(core.includes("' Akkus schwach'"), 'Glocke: „N Akkus schwach“');
const soft = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/08-weich-kompakt.js', import.meta.url), 'utf8');
assert.ok(soft.includes("'Alle Batterien OK'") && soft.includes("' Akkus schwach'"), 'Batterien-Popup (Weich): Kopfzeile');
assert.ok(en.exact['Alle Batterien OK'] && en.patterns.some((p) => p[0] === '^(\\d+) Schwach$'), 'englische Akku-Wörter');
console.log('ok akku-wortlaut');
