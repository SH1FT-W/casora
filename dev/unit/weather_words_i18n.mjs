// Every German weather word the weather card can show has a phrase in every other dashboard language, in the
// source phrase files and in the shipped tables. tools/i18ncheck.py cannot see a missing phrase like this.
//   node dev/unit/weather_words_i18n.mjs
// @deckt: dashboards/casora/button_card_templates.json#casora_weather custom_components/casora/translations/dashboard/phrases/*.json custom_components/casora/scripts/i18n/*.json
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const T = JSON.parse(read('dashboards/casora/button_card_templates.json'));
const PHRASES = 'custom_components/casora/translations/dashboard/phrases/';
const COMPILED = 'custom_components/casora/scripts/i18n/';

// The body of one object literal in a template source, e.g. "const map = { ... };".
function objectBody(src, head) {
  const at = src.indexOf(head);
  assert.ok(at >= 0, 'found ' + head);
  const open = src.indexOf('{', at);
  return src.slice(open + 1, src.indexOf('};', open));
}

// The label map ('sunny': 'Sonnig') and the popup map ('fog': ['Nebel', icon]).
const words = new Set([
  ...[...objectBody(T.casora_weather.label, 'const map =').matchAll(/:\s*'([^']+)'/g)].map((m) => m[1]),
  ...[...objectBody(T.casora_weather.tap_action.casora_popup.content, 'const COND =').matchAll(/\[\s*'([^']+)'/g)].map((m) => m[1]),
]);
assert.ok(words.size >= 20 && words.has('Nebel') && words.has('Windig & bewölkt'), 'German words read from the card: ' + words.size);

const langs = fs.readdirSync(new URL('../../' + PHRASES, import.meta.url))
  .filter((f) => f.endsWith('.json') && f !== 'de.json').map((f) => f.slice(0, -5));
assert.ok(langs.length >= 7, 'phrase files found: ' + langs.length);

const missing = [];
for (const lang of langs) {
  for (const dir of [PHRASES, COMPILED]) {
    const exact = JSON.parse(read(dir + lang + '.json')).exact || {};
    for (const w of words) if (!String(exact[w] ?? '').trim()) missing.push(dir + lang + '.json: ' + w);
  }
}
assert.deepEqual(missing, [], 'every German weather word has a translation');
console.log('ok weather_words_i18n (' + words.size + ' words x ' + langs.length + ' languages)');
