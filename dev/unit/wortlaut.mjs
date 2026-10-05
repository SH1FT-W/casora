// Wortlaut-Entscheidung (23.09.2026): Zustandswort hinter einer Zahl GROSS –
// „1 An“, „3 An“, „Keine Aktiv“, „2 Aktiv“. Nicht wieder auf klein „korrigieren“.
// node dev/unit/wortlaut.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const T = JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/panel/casora-templates.json', import.meta.url), 'utf8')).templates;
const light = JSON.stringify(T.casora_badge_light_group);
assert.ok(light.includes("'1 An'") && light.includes('${onCount} An`'), 'Licht-Gruppenbadge: „1 An“ / „N An“');
const scene = JSON.stringify(T.casora_badge_scene_group);
assert.ok(scene.includes("'Keine Aktiv'") && scene.includes("' Aktiv'"), 'Szenen-Badge: „Keine Aktiv“ / „N Aktiv“');
// Die Quelle (dashboards/casora) muss dasselbe sagen – sonst dreht build-templates.py es zurück.
const SRC = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
assert.equal(JSON.stringify(SRC.casora_badge_light_group), light, 'Quelle = Paket (Licht-Gruppenbadge)');
assert.equal(JSON.stringify(SRC.casora_badge_scene_group), scene, 'Quelle = Paket (Szenen-Badge)');
const en = JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/translations/dashboard/phrases/en.json', import.meta.url), 'utf8'));
assert.ok(en.exact['Keine Aktiv'] && en.patterns.some((p) => p[0] === '^(\\d+) Aktiv$') && en.patterns.some((p) => p[0] === '^(\\d+) An$'),
  'englische Übersetzung für die großen Formen');
console.log('ok wortlaut');

// Akku-Stufen (05.10.2026, Nachauftrag K1 „Batterie states überarbeiten“): eine Regel überall –
// OK / Schwach (≤ 20 %) / Fast leer (≤ 10 %) aus window.casoraBattery. Kachel „N Schwach“ (Zahl +
// Zustandswort groß wie „1 An“), Popup-Kopf „N Akkus schwach“ / „Alle Akkus OK“, Glocke ebenso.
const bat = JSON.stringify(T.casora_battery);
assert.ok(bat.includes("' Schwach'") && bat.includes("'OK'") && bat.includes('casoraBattery'), 'Batterien-Kachel: „OK“ / „N Schwach“ über casoraBattery');
const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
assert.ok(/WORD: \{ ok: 'OK', low: 'Schwach', crit: 'Fast leer', charging: 'Lädt'/.test(core), 'casoraBattery: Stufenwörter');
assert.ok(core.includes("' Akkus schwach'"), 'Glocke: „N Akkus schwach“');
const soft = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/08-weich-kompakt.js', import.meta.url), 'utf8');
assert.ok(soft.includes("'Alle Akkus OK'") && soft.includes("' Akkus schwach'"), 'Batterien-Popup (Weich): Kopfzeile');
assert.ok(en.exact['Alle Akkus OK'] && en.patterns.some((p) => p[0] === '^(\\d+) Schwach$'), 'englische Akku-Wörter');
console.log('ok akku-wortlaut');
