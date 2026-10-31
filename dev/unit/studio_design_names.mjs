// Studio texts never name the internal design names: "Soft"/"Weich" is the Casora look (design-regeln.md §0), users
// only know "Casora" and "Casora Nebel". The camera hint said "(Soft design hides them)" / „im Design Weich“.
//   node dev/unit/studio_design_names.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const dir = new URL('../../custom_components/casora/translations/panel/', import.meta.url);
const bad = [];
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  const t = JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8'));
  const pairs = Object.entries(t.exact || {}).concat(t.patterns || []);
  for (const [k, v] of pairs) {
    if (/\bSoft design\b/i.test(k)) bad.push(f + ' key: ' + k);
    if (/\b(im Design Weich|Design Weich|diseño Suave|design Doux|design Morbido|design Zacht|styl Miękki|design Suave)\b/.test(String(v))) bad.push(f + ': ' + v);
  }
}
assert.deepEqual(bad, [], 'Studio texts naming the internal design name');
console.log('studio_design_names: ok');
