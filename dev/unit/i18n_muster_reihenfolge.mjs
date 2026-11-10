// Pattern order in the dashboard phrase tables: a specific pattern must win over a general one that also
// matches its text. The runtime takes the first matching pattern, and the sources listed e.g. "^Ø (.+)$"
// before "^Ø von (\d+) Lampen$", so "Ø von 8 Lampen" stayed German in every language.
//   node dev/unit/i18n_muster_reihenfolge.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { phrases } from './lib/i18n_phrases.mjs';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-i18n.js', import.meta.url), 'utf8');

function translator(lang) {
  const win = { __casoraI18nPhrases: phrases() };
  const doc = { querySelector: (q) => (q === 'home-assistant' ? { hass: { locale: { language: lang } } } : null), addEventListener() {} };
  try { new Function('window', 'document', 'customElements', 'MutationObserver', src)(win, doc, { whenDefined: () => new Promise(() => {}), get: () => null }, class { observe() {} }); } catch (e) { /* DOM watcher without a browser */ }
  assert.ok(win.casoraTr, 'casoraTr loaded');
  return win.casoraTr;
}

const en = translator('en');
const EXPECT = [
  ['Ø von 8 Lampen', 'Ø of 8 lamps'],
  ['Regen ab 12 Uhr', 'Rain from 12:00'],
  // Not a shadowing case: the car popup's stage sentence had no pattern with a unit.
  ['Reichweite 140 km', 'Range 140 km'],
  ['Reichweite 1.140 mi', 'Range 1.140 mi'],
];
for (const [de, want] of EXPECT) assert.equal(en(de), want, de);

// These texts must not stay German in any other language.
for (const lang of ['es', 'fr', 'it', 'nl', 'pl', 'pt', 'nb']) {
  const tr = translator(lang);
  for (const [de] of EXPECT) {
    const out = tr(de);
    assert.ok(!/Lampen|Regen ab|Uhr|Reichweite/.test(out), `${lang}: ${de} -> ${out}`);
  }
}
console.log('i18n_muster_reihenfolge: ok');
