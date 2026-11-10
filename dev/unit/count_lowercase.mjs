// Owner, 01.11.2026: a count in a badge or heading is a phrase – its state word in small letters („3 an“, „2 offen“,
// „2 schwach“, „3 verfügbar“); a state word standing alone („An“ on a tile) stays capitalized. Every language follows
// („3 on“, „2 low“).   node dev/unit/count_lowercase.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const rd = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

// 1. The light tally (badge, tile, popup line).
const basis = rd('custom_components/casora/scripts/local/01-basis.js');
const a = basis.indexOf('window.casoraLightTallyText = function');
const window = {};
new Function('window', basis.slice(a, basis.indexOf('};', a) + 2))(window);
assert.equal(window.casoraLightTallyText({ tot: 4, on: 2 }), '2 an');
assert.equal(window.casoraLightTallyText({ tot: 1, on: 1 }), 'An', 'standing alone: capitalized');
assert.equal(window.casoraLightTallyText({ tot: 1, on: 0 }), 'Aus');

// 2. The entity list's summary and tile.
const list = rd('custom_components/casora/scripts/local/34-entity-list.js');
const win2 = {};
new Function('window', 'document', list)(win2, { addEventListener() {}, querySelector: () => null });
const L = win2._casoraEntityList;
assert.deepEqual(L.summary({ n: 26, on: 3, toggles: 5 }), ['26 Geräte', '3 an']);

// 3. Templates and scripts build no capitalized count any more.
const T = rd('dashboards/casora/button_card_templates.json');
const scripts = fs.readdirSync(new URL('../../custom_components/casora/scripts/local/', import.meta.url))
  .map((f) => rd('custom_components/casora/scripts/local/' + f)).join('\n') + rd('custom_components/casora/scripts/casora-core.js');
const CAP = /(\+ ['"] |\} )(An|Aus|Aktiv|Offen|Verfügbar|Unterwegs|Schwach)['"`]/g;
for (const [name, text] of [['templates', T], ['scripts', scripts]]) {
  const hits = (text.match(CAP) || []);
  assert.deepEqual(hits, [], name + ': a count with a capitalized state word');
}
assert.ok(T.includes("s.low.length + ' schwach'") && T.includes('`${n} verfügbar`'), 'battery and update badges');

// 4. Translations: the small words are known in every language.
const tr = (lang, s) => {
  const P = JSON.parse(rd('custom_components/casora/translations/dashboard/phrases/' + lang + '.json'));
  if (P.exact[s]) return P.exact[s];
  for (const [re, rep] of P.patterns) { const m = s.match(new RegExp(re)); if (m) return rep.replace(/\{(\d+)\}/g, (_, i) => m[+i]); }
  return null;
};
assert.equal(tr('en', '3 an'), '3 on');
assert.equal(tr('en', '2 offen'), '2 open');
assert.equal(tr('en', '2 schwach'), '2 low');
assert.equal(tr('en', '3 verfügbar'), '3 available');
for (const lang of ['es', 'fr', 'it', 'nl', 'pl', 'pt', 'nb']) {
  for (const s of ['3 an', '2 offen', '2 schwach', '3 verfügbar']) assert.ok(tr(lang, s), lang + ': ' + s);
}
// Studio (English source, German table): „3 on“ → „3 an“.
const pd = JSON.parse(rd('custom_components/casora/translations/panel/de.json'));
assert.ok(pd.patterns.some(([re, rep]) => re === '^(\\d+) on$' && rep === '{1} an'), 'Studio German');
console.log('count_lowercase: ok');
