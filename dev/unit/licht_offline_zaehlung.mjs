// Light count with lamps HA cannot reach (Prüfrunde u10-06): an unavailable kitchen lamp made the badge say "Aus" and
// Home "Alle aus" next to a tile reading "Offline". The tally counts unreachable lamps (dead) and the words say so:
// all of them "Offline", else the reachable ones plus "· N offline". Every language translates the parts.
//   node dev/unit/licht_offline_zaehlung.mjs
// @deckt: custom_components/casora/scripts/local/01-basis.js#casoraLightTally,casoraLightTallyText
import fs from 'node:fs';
import assert from 'node:assert/strict';

const rd = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const basis = rd('custom_components/casora/scripts/local/01-basis.js');
const window = {};
const grab = (name) => { const a = basis.indexOf(name + ' = function'); assert.ok(a > 0, name); return basis.slice(a, basis.indexOf('\n};', a) + 3); };
new Function('window', grab('window.casoraLightTally') + grab('window.casoraLightTallyText'))(window);
const S = { 'light.qa_a': { state: 'unavailable' }, 'light.qa_b': { state: 'off' }, 'light.qa_c': { state: 'on' }, 'light.qa_d': { state: 'off' } };
window._casoraLightTallyIds = (e) => e.ids;
const tally = (ids) => window.casoraLightTally({ ids }, S);
const text = (ids) => window.casoraLightTallyText(tally(ids));

assert.deepEqual(tally(['light.qa_a', 'light.qa_b']), { kind: 'lamps', tot: 2, on: 0, dead: 1 });
assert.equal(text(['light.qa_a']), 'Offline', 'the one lamp offline');
assert.equal(text(['light.qa_a', 'light.qa_b']), 'Aus · 1 offline', 'not "Alle aus"');
assert.equal(text(['light.qa_a', 'light.qa_b', 'light.qa_d']), '2 aus · 1 offline');
assert.equal(text(['light.qa_a', 'light.qa_c']), 'An · 1 offline');
assert.equal(text(['light.qa_a', 'light.qa_c', 'light.qa_b']), '1 an · 1 offline');
// Nothing offline: the words as before.
assert.equal(text(['light.qa_b', 'light.qa_d']), 'Alle aus');
assert.equal(text(['light.qa_c']), 'An');

// Translations: casora-i18n translates the parts around " · " one by one.
for (const lang of ['en', 'es', 'fr', 'it', 'nb', 'nl', 'pl', 'pt']) {
  const P = JSON.parse(rd('custom_components/casora/translations/dashboard/phrases/' + lang + '.json'));
  const one = (s) => {
    if (P.exact[s]) return P.exact[s];
    for (const [re, rep] of P.patterns) { const m = s.match(new RegExp(re)); if (m) return rep.replace(/\{(\d+)\}/g, (_, i) => m[+i]); }
    return null;
  };
  for (const s of ['Offline', 'Aus', 'An', '2 aus', '1 an', '1 offline']) assert.ok(one(s), `${lang}: "${s}"`);
}
console.log('ok licht_offline_zaehlung');
