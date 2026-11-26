// u09-14 (English/Dutch bell): device names were translated only sometimes. „Schlafzimmer Fenster ist offen“
// became „Bedroom window is open“ (an exact phrase, and the pattern translated the name part when it happened to
// be in the dictionary), „Waschküche Fenster ist offen“ stayed „Waschküche Fenster is open“. V24: names people
// give in HA are not translated. A pattern placeholder {=N} now keeps its group verbatim; the bell sentences that
// start with a name use it in every language, so only Casora's own words are translated.
// Through the real runtime translator (as i18n_name_sentences.mjs).   LC_ALL=en_US.UTF-8 node dev/unit/i18n_bell_names_verbatim.mjs
// @deckt: tools/build-i18n.py, custom_components/casora/scripts/local/01-basis.js#zonePhrase, custom_components/casora/scripts/casora-i18n.js, custom_components/casora/translations/dashboard/phrases/en.json, custom_components/casora/translations/dashboard/phrases/nl.json
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
// The rest of the bell (review of u09-14): a person in a zone gets „im/in der/am/auf der Arbeit“ (zonePhrase in
// 01-basis.js), vacuums, appliances, plants, the alarm and updates; the name stays in each of them, as it does in
// „hat fertig gereinigt“ and „steht in zu trockener Luft“.
assert.equal(en('Licht ist im Büro'), 'Licht is at Büro');
assert.equal(en('Licht ist in der Schule'), 'Licht is at Schule');
assert.equal(en('Licht ist am See'), 'Licht is at See');
assert.equal(en('Licht ist auf der Arbeit'), 'Licht is at work');
assert.equal(en('Saugroboter reinigt'), 'Saugroboter cleaning');
assert.equal(en('Saugroboter hat fertig gereinigt'), 'Saugroboter finished cleaning');
assert.equal(en('Licht steht in zu feuchter Luft'), 'Licht: air too humid');
assert.equal(en('Licht steht in zu trockener Luft'), 'Licht: air too dry');
assert.equal(en('Licht braucht Wasser'), 'Licht needs water');
assert.equal(en('Küche ist gleich fertig'), 'Küche is almost done');
assert.equal(en('Küche läuft'), 'Küche running');
assert.equal(en('Küche ausgelöst'), 'Küche triggered');
assert.equal(en('Küche aktiv · Abwesend'), 'Küche active · ' + phraseTable('en').exact['Abwesend']);
assert.equal(en('Licht Update verfügbar'), 'Licht update available');
assert.equal(nl('Licht ist im Büro'), 'Licht is in Büro');
// Casora's own words with the same endings keep their translation.
assert.equal(en('Update läuft'), 'Update running');
assert.equal(en('Alarm ausgelöst'), 'Alarm triggered');
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
  '^(.+) reinigt$', '^(.+) ist gleich fertig$', '^(.+) läuft$', '^(.+) unscharf$', '^(.+) scharf · (.+)$',
  '^(.+) ausgeschaltet$', '^(.+) ausgelöst$', '^(.+) aktiv · (Zuhause|Abwesend|Nacht|Urlaub|Bypass)$',
  '^(.+) Update verfügbar$', '^(.+) ist auf der Arbeit$', '^(.+) ist im (.+)$', '^(.+) ist in der (.+)$',
  '^(.+) ist am (.+)$',
  // Every PLANT_WORD sentence (casora-core.js).
  '^(.+) braucht Wasser$', '^(.+) braucht Dünger$', '^(.+) ist überdüngt$', '^(.+) braucht mehr Licht$',
  '^(.+) bekommt zu viel Sonne$', '^(.+) steht zu kalt$', '^(.+) steht zu warm$', '^(.+) steht in zu feuchter Luft$',
];
// The zone after the person is a name from HA too.
const ZONE_TOO = ['^(.+) ist bei (.+)$', '^(.+) ist im (.+)$', '^(.+) ist in der (.+)$', '^(.+) ist am (.+)$'];
for (const f of fs.readdirSync(new URL('../../custom_components/casora/translations/dashboard/phrases/', import.meta.url))) {
  const lang = f.replace(/\.json$/, '');
  if (lang === 'de') continue;
  const t = JSON.parse(read('custom_components/casora/translations/dashboard/phrases/' + f));
  for (const rx of NAME_FIRST) {
    const p = t.patterns.find((x) => x[0] === rx);
    assert.ok(p, lang + ': pattern ' + rx);
    assert.ok(p[1].includes('{=1}') && !p[1].includes('{1}'), lang + ': ' + rx + ' keeps the name verbatim: ' + p[1]);
    if (ZONE_TOO.includes(rx)) assert.ok(p[1].includes('{=2}') && !p[1].includes('{2}'), lang + ': ' + rx + ' keeps the zone verbatim: ' + p[1]);
  }
  assert.ok(!('Schlafzimmer Fenster ist offen' in t.exact), lang + ': no exact phrase for one test-house name');
}
console.log('i18n_bell_names_verbatim: ok');
