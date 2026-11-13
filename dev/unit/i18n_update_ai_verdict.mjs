// #175 (English dashboard): an update row read „New: 8.8.14 · KI: Unkritisch". The row's subline (08-weich-kompakt.js,
// U.rows) is „Neu: <version> · KI: <verdict>"; only some verdicts had a pattern of their own, the rest stayed German.
// Through the real runtime translator, every dashboard language and every verdict the row can show.
//   LC_ALL=en_US.UTF-8 node dev/unit/i18n_update_ai_verdict.mjs
// @deckt: custom_components/casora/translations/dashboard/phrases/en.json,custom_components/casora/scripts/local/08-weich-kompakt.js#AI_TXT,custom_components/casora/scripts/local/03-popups.js
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
const src = read('custom_components/casora/scripts/local/08-weich-kompakt.js');
assert.match(src, /'Neu: ' \+ a\.latest_version/, 'row subline still starts with „Neu: <version>"');
assert.match(src, /' · KI: ' \+ t\[0\]/, 'row subline still ends with „ · KI: <verdict>"');
const table = src.match(/var AI_TXT = \{([\s\S]*?)\};/)[1];
const entries = [...table.matchAll(/\[\s*'([^']+)',\s*('?\w+'?)\s*\]/g)].map((m) => ({ text: m[1], tinted: m[2] !== 'null' }));
const verdicts = entries.map((e) => e.text);
assert.ok(verdicts.length >= 7, 'verdicts found: ' + verdicts.join(', '));

const GERMAN = /\b(KI|Unkritisch|Handeln|Unklar|Nicht geprüft|prüft|Fehler|Neu)\b/;
for (const lang of ['en', 'es', 'fr', 'it', 'nb', 'nl', 'pl', 'pt']) {
  const tr = translator(lang);
  for (const v of verdicts) {
    const de = 'Neu: 8.8.14.20179 · KI: ' + v;
    const out = tr(de);
    // „KI" is also the Norwegian word for AI; check the verdict and „Neu" there.
    const bad = lang === 'nb' ? /\b(Unkritisch|Handeln|Unklar|Nicht geprüft|prüft|Fehler|Neu)\b/ : GERMAN;
    assert.ok(!bad.test(out), `${lang}: „${de}" → „${out}"`);
    assert.ok(out.includes('8.8.14.20179'), `${lang}: version kept in „${out}"`);
    // The tinted row (U.tint) splits off „● <verdict>" as its own text.
    if (entries.find((e) => e.text === v).tinted) {
      const dot = tr('● ' + v);
      assert.ok(!bad.test(dot), `${lang}: „● ${v}" → „${dot}"`);
    }
  }
  // The AI summary lines of the updates popup (08-weich-kompakt.js, 03-popups.js).
  for (const de of ['KI: 1 Breaking Change', 'KI: 3 Breaking Changes', 'KI: 2 von 5 geprüft']) {
    const out = tr(de);
    const bad = lang === 'nb' ? /\b(Breaking Changes?|von|geprüft)\b/ : /\b(KI|Breaking Changes?|von|geprüft)\b/;
    assert.ok(!bad.test(out), `${lang}: „${de}" → „${out}"`);
  }
}
console.log('i18n_update_ai_verdict: ok');
