// Checkup 10/2026 (Prod): Kalender-Popup – zu lange Einträge: Titel endete mit „…“, die Unterzeile
// (Kalender · bis … · Ort) lief weiter. Erwartet: beide einzeilig mit Auslassung.
//   node dev/unit/checkup_kalender_auslassung.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/06-kalender.js', import.meta.url), 'utf8');
for (const cls of ['hcal-tt', 'hcal-ts']) {
  const m = src.match(new RegExp("'\\." + cls + "\\{([^}]*)\\}"));
  assert.ok(m, cls + ' gefunden');
  for (const need of ['overflow:hidden', 'text-overflow:ellipsis', 'white-space:nowrap']) assert.ok(m[1].includes(need), cls + ': ' + need);
}
console.log('ok kalender_auslassung');
