// Polish robot vacuum (owner 14.11.2026, V23): the mode moon „Saugen & wischen“ was clipped („Odkurzanie i…“) – now
// a short form no longer than the German word; „Wischen“ is „mopowanie“ everywhere (the section head said „mycie“).
//   node dev/unit/i18n_pl_vacuum_moon.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const pl = JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/translations/dashboard/phrases/pl.json', import.meta.url), 'utf8'));
const ex = pl.exact || pl;
const moon = ex['Saugen & wischen'];
assert.ok(moon && moon.length <= 'Saugen & wischen'.length, 'pl moon word fits like the German one: ' + moon);
assert.equal(moon, 'Odkurz. + mop');
assert.equal(ex['Saugen und Wischen'], 'Odkurzanie i mopowanie', 'section head: mopowanie');
// Mopping (wischen) is „mop…“, never „mycie“ (that is washing the mop pad).
for (const [de, t] of Object.entries(ex)) {
  if (/wisch/i.test(de)) assert.ok(!/myc|myj/i.test(t), de + ' → ' + t);
}
const built = JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/scripts/i18n/pl.json', import.meta.url), 'utf8'));
assert.equal(built.exact['Saugen & wischen'], moon, 'built table up to date');
console.log('i18n_pl_vacuum_moon: ok');
