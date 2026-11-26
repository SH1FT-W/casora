// Studio fields numbered "<Label> %" (Prüfrunde u10-10): "Motion sensor 1" stood in English over a German room
// section, because the translation knew "Motion sensor" but had no pattern for "Motion sensor 1". Every numbered
// label of the panel's field tables needs a translation in each language (by pattern or the same word).
//   node dev/unit/studio_nummer_felder.mjs
// @deckt: custom_components/casora/translations/panel/de.json#patterns
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const src = read('custom_components/casora/panel/casora-panel.js');
const labels = [...new Set([...src.matchAll(/E\("[a-z0-9_]+_%", "([^"%]+) %"/g)].map((m) => m[1]))];
assert.ok(labels.includes('Motion sensor') && labels.includes('Light'), 'numbered labels found: ' + labels);
const dir = new URL('../../custom_components/casora/translations/panel/', import.meta.url);
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json') && x !== 'en.json')) {
  const t = JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8'));
  for (const l of labels) {
    const word = t.exact[l];
    // Same word in this language (PlayStation, Person in German): nothing to translate.
    if (!word || word === l) continue;
    const s = l + ' 2';
    const hit = (t.patterns || []).find(([re]) => new RegExp(re).test(s));
    assert.ok(hit, `${f}: "${s}" has a pattern (exact "${l}" → "${word}")`);
  }
}
console.log('ok studio_nummer_felder');
