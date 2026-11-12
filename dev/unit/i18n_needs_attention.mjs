// #185 (English dashboard): the notification of a vacuum in error, „<name> braucht Aufmerksamkeit“ (casora-core.js,
// notification centre), stayed German: only the bare words had a translation, the sentence with a name had no pattern.
// Through the real runtime translator, every dashboard language.   LC_ALL=en_US.UTF-8 node dev/unit/i18n_needs_attention.mjs
// @deckt: custom_components/casora/translations/dashboard/phrases/en.json
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { phrases } from './lib/i18n_phrases.mjs';

const read = (f) => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const i18n = read('custom_components/casora/scripts/casora-i18n.js');
function translator(lang) {
  const win = { __casoraI18nPhrases: phrases() };
  const doc = { querySelector: (q) => (q === 'home-assistant' ? { hass: { locale: { language: lang } } } : null), addEventListener() {} };
  try { new Function('window', 'document', 'customElements', 'MutationObserver', i18n)(win, doc, { whenDefined: () => new Promise(() => {}), get: () => null }, class { observe() {} }); } catch (e) { /* DOM watcher without a browser */ }
  return win.casoraTr;
}
// The sentence casora-core.js builds for a vacuum in error.
assert.match(read('custom_components/casora/scripts/casora-core.js'), /label: name \+ ' braucht Aufmerksamkeit'/, 'source sentence unchanged');

for (const lang of ['en', 'es', 'fr', 'it', 'nb', 'nl', 'pl', 'pt']) {
  const tr = translator(lang);
  const words = JSON.parse(read(`custom_components/casora/translations/dashboard/phrases/${lang}.json`)).exact['braucht Aufmerksamkeit'];
  for (const name of ['Robbi', 'Roborock Qrevo S', 'Saugi 2']) {
    const out = tr(name + ' braucht Aufmerksamkeit');
    assert.equal(out, name + ' ' + words, `${lang}: ${name} → ${out}`);
  }
  // The updates sentences keep their own wording (exact entry and the AI pattern come first).
  assert.equal(tr('1 Update braucht Aufmerksamkeit'),
    JSON.parse(read(`custom_components/casora/translations/dashboard/phrases/${lang}.json`)).exact['1 Update braucht Aufmerksamkeit'], lang + ': 1 update');
  const ai = JSON.parse(read(`custom_components/casora/translations/dashboard/phrases/${lang}.json`)).patterns
    .find((p) => p[0] === '^KI: 1 Update braucht Aufmerksamkeit$');
  assert.equal(tr('KI: 1 Update braucht Aufmerksamkeit'), ai[1], lang + ': AI update sentence keeps its pattern');
}
console.log('i18n_needs_attention: ok');
