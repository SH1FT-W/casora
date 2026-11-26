// English UI text is American like Home Assistant (docs/handbuch/wortliste.md §5 V4): color, recognize, favorite,
// gray – Prüfrunde w06-10 found „colour“ and „recognise“ in the Studio. Checks the string literals of the Studio
// (comments are not UI) and the English dashboard phrases.
// casora-panel-welcome.js is left out: its „What's new“ texts are written with the release (CLAUDE.md).
//   node dev/unit/english_us_spelling.mjs
// @deckt: custom_components/casora/panel/casora-panel.js, custom_components/casora/panel/casora-panel-basis.js
import fs from 'node:fs';
import assert from 'node:assert/strict';

const BRITISH = /\b(colour\w*|recognis\w*|favourite\w*|grey|behaviour\w*|organis\w*|cancelled)\b/i;
const DIR = new URL('../../custom_components/casora/panel/', import.meta.url);
const bad = [];
for (const f of fs.readdirSync(DIR)) {
  if (!f.endsWith('.js') || f === 'casora-panel-welcome.js' || f === 'casora-panel-i18n.js') continue;
  const src = fs.readFileSync(new URL(f, DIR), 'utf8');
  // String literals only ("…" and '…'), never comments or identifiers.
  for (const m of src.matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'/g)) {
    const s = m[1] ?? m[2];
    if (/\s/.test(s) && BRITISH.test(s)) bad.push(f + ': ' + s.slice(0, 90));
  }
}
const en = JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/translations/dashboard/phrases/en.json', import.meta.url), 'utf8'));
Object.values(en.exact).concat(en.patterns.map((p) => p[1])).forEach((v) => { if (BRITISH.test(v)) bad.push('phrases/en.json: ' + v); });
assert.deepEqual(bad, [], 'British spelling in English UI text');
console.log('ok english us spelling');
