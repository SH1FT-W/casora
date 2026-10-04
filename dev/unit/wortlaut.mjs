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
