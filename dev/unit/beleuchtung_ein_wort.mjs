// One word for the lights badge in Studio and dashboard (V21, newcomer round 14.11.2026): the English Studio said
// "Lights", the dashboard "Lighting" (German both "Beleuchtung"). The word list (docs/handbuch/wortliste.md) has
// Beleuchtung = lighting; every language's Studio word for "Lights" is its dashboard word for "Beleuchtung".
//   node dev/unit/beleuchtung_ein_wort.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const tr = (p) => JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/translations/' + p, import.meta.url), 'utf8'));
const dashEn = tr('dashboard/phrases/en.json').exact['Beleuchtung'];
assert.equal(tr('panel/en.json').exact['Lights'], dashEn, 'English Studio says what the dashboard says');
assert.equal(tr('panel/de.json').exact['Lights'], 'Beleuchtung', 'German as before');
for (const l of ['es', 'fr', 'it', 'nb', 'nl', 'pl', 'pt']) {
  assert.equal(tr('panel/' + l + '.json').exact['Lights'], tr('dashboard/phrases/' + l + '.json').exact['Beleuchtung'], l + ': one word');
}
// The built table the Studio loads carries it (tools/build-panel-i18n.py).
const built = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel-i18n.js', import.meta.url), 'utf8');
assert.ok(built.includes('"Lights":"' + dashEn + '"'), 'built English table has it');
console.log('ok beleuchtung_ein_wort');
