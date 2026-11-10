// Every German weather word the weather card can show (the condition labels of casora_weather and the
// condition map of its popup) has a phrase in all 7 non-German dashboard languages. The i18n check cannot
// see a missing phrase like this, so the test reads the German words from the template and the phrases
// from translations/dashboard/phrases/<lang>.json (the source that tools/build-i18n.py compiles).
//   node dev/unit/weather_words_i18n.mjs
// @deckt: dashboards/casora/button_card_templates.json#casora_weather, custom_components/casora/translations/dashboard/phrases/en.json
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const T = JSON.parse(read('dashboards/casora/button_card_templates.json'));
const PHRASES = 'custom_components/casora/translations/dashboard/phrases/';
const OTHER = ['en', 'es', 'fr', 'it', 'nl', 'pl', 'pt'];

// The body of one object literal in a template source, e.g. "const map = { ... };".
function objectBody(src, head) {
  const at = src.indexOf(head);
  assert.ok(at >= 0, 'found ' + head);
  const open = src.indexOf('{', at);
  const close = src.indexOf('};', open);
  return src.slice(open + 1, close);
}

// German words the card can show: the label map ('sunny': 'Sonnig') and the popup map ('fog': ['Nebel', icon]).
const label = T.casora_weather.label;
const popup = T.casora_weather.tap_action.casora_popup.content;
const words = new Set([
  ...[...objectBody(label, 'const map =').matchAll(/:\s*'([^']+)'/g)].map((m) => m[1]),
  ...[...objectBody(popup, 'const COND =').matchAll(/\[\s*'([^']+)'/g)].map((m) => m[1]),
]);
assert.ok(words.has('Nebel') && words.has('Sonnig') && words.has('Windig & bewölkt'), 'German words read from the card');
assert.ok(words.size >= 20, 'enough condition words found: ' + words.size);

// The languages are the 7 non-German phrase files; a new language must be added here on purpose.
const files = fs.readdirSync(new URL('../../' + PHRASES, import.meta.url)).filter((f) => f.endsWith('.json') && f !== 'de.json');
assert.deepEqual(files.map((f) => f.slice(0, -5)).sort(), [...OTHER].sort(), 'the 7 non-German phrase files');

const missing = [];
for (const lang of OTHER) {
  const exact = JSON.parse(read(PHRASES + lang + '.json')).exact || {};
  for (const w of words) {
    if (typeof exact[w] !== 'string' || exact[w].trim() === '') missing.push(lang + ': ' + w);
  }
}
assert.deepEqual(missing, [], 'every German weather word has a translation in every language');

console.log('ok weather_words_i18n (' + words.size + ' words x ' + OTHER.length + ' languages)');
