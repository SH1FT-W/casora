// u09-14 (English/Dutch bell): device names were translated only sometimes. „Schlafzimmer Fenster ist offen“
// became „Bedroom window is open“ (an exact phrase, and the pattern translated the name part when it happened to
// be in the dictionary), „Waschküche Fenster ist offen“ stayed „Waschküche Fenster is open“. V24: names people
// give in HA are not translated. A pattern placeholder {=N} now keeps its group verbatim; the bell sentences that
// start with a name use it in every language, so only Casora's own words are translated.
// Through the real runtime translator (as i18n_name_sentences.mjs).   LC_ALL=en_US.UTF-8 node dev/unit/i18n_bell_names_verbatim.mjs
// @deckt: tools/build-i18n.py, custom_components/casora/scripts/casora-i18n.js, custom_components/casora/translations/dashboard/phrases/en.json, custom_components/casora/translations/dashboard/phrases/nl.json
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { phrases, phraseTable } from './lib/i18n_phrases.mjs';

const read = (f) => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const i18n = read('custom_components/casora/scripts/casora-i18n.js');
function translator(lang) {
  const win = { __casoraI18nPhrases: phrases() };
  const doc = { querySelector: (q) => (q === 'home-assistant' ? { hass: { locale: { language: lang } } } : null), addEventListener() {} };
  try { new Function('window', 'document', 'customElements', 'MutationObserver', i18n)(win, doc, { whenDefined: () => new Promise(() => {}), get: () => null }, class { observe() {} }); } catch (e) { /* DOM watcher without a browser */ }
  return win.casoraTr;
}
const en = translator('en');
const nl = translator('nl');

// The two rows from the report: both names stay as named in HA, the rest is English / Dutch.
assert.equal(en('Schlafzimmer Fenster ist offen'), 'Schlafzimmer Fenster is open');
assert.equal(en('Waschküche Fenster ist offen'), 'Waschküche Fenster is open');
assert.equal(en('Terrassentür ist gekippt'), 'Terrassentür is tilted');
assert.equal(nl('Schlafzimmer Fenster ist offen'), 'Schlafzimmer Fenster staat open');
assert.equal(nl('Waschküche Fenster ist offen'), 'Waschküche Fenster staat open');
// A name that happens to be a dictionary word stays a name.
assert.equal(en('Küche ist offen'), 'Küche is open');
assert.equal(en('Licht Akku schwach'), 'Licht battery low');
assert.equal(en('Zuhause ist angekommen'), 'Zuhause arrived home');
// Casora's own words in a second group are still translated (the alarm mode after „umgeschaltet auf“); a zone
// after „ist bei“ is a name too and stays.
assert.equal(en('Küche umgeschaltet auf Abwesend'), 'Küche switched to ' + phraseTable('en').exact['Abwesend']);
assert.equal(en('Küche ist bei Schlafzimmer'), 'Küche is at Schlafzimmer');
// Casora's own short sentences keep their exact phrase.
assert.equal(en('Tür ist offen'), 'Door is open');
assert.equal(en('Fenster ist offen'), 'Window is open');
assert.equal(nl('Fenster ist offen'), 'Raam staat open');

// No language translates a bell name: every pattern of these sentences keeps group 1 verbatim.
const NAME_FIRST = [
  '^(.+) ist offen$', '^(.+) ist gekippt$', '^(.+) ist angekommen$', '^(.+) hat das Haus verlassen$',
  '^(.+) ist bei (.+)$', '^(.+) hat geklingelt$', '^(.+) hat fertig gereinigt$', '^(.+) entriegelt$',
  '^(.+) Akku fast leer$', '^(.+) Akku schwach$', '^(.+) braucht Aufmerksamkeit$', '^(.+) umgeschaltet auf (.+)$',
  '^(.+) steht zu nass$', '^(.+) steht in zu trockener Luft$',
];
for (const f of fs.readdirSync(new URL('../../custom_components/casora/translations/dashboard/phrases/', import.meta.url))) {
  const lang = f.replace(/\.json$/, '');
  if (lang === 'de') continue;
  const t = JSON.parse(read('custom_components/casora/translations/dashboard/phrases/' + f));
  for (const rx of NAME_FIRST) {
    const p = t.patterns.find((x) => x[0] === rx);
    assert.ok(p, lang + ': pattern ' + rx);
    assert.ok(p[1].includes('{=1}') && !p[1].includes('{1}'), lang + ': ' + rx + ' keeps the name verbatim: ' + p[1]);
  }
  assert.ok(!('Schlafzimmer Fenster ist offen' in t.exact), lang + ': no exact phrase for one test-house name');
}
console.log('i18n_bell_names_verbatim: ok');
