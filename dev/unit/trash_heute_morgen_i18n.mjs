// Waste tile and popup head on pickup day (02.11.2026, r68): "Heute Restmüll" stayed German in the English
// preview. Since the pickup date wins over the countdown (00-finder.js), the test house's tile reaches the
// days 0 / 1 branch ("Heute <bin>", "Morgen <bin>"), and no phrase pattern covered it in any language.
// Checks the tile's own strings through the real runtime translator, in every further language.
//   LC_ALL=en_US.UTF-8 TZ=UTC node dev/unit/trash_heute_morgen_i18n.mjs
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

// The strings the tile builds for days 0 and 1 (casora_trash state_display).
const T = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const sd = T.casora_trash.state_display;
assert.ok(sd.includes('`Heute ${label}`') && sd.includes('`Morgen ${label}`'), 'tile still builds "Heute/Morgen <bin>"');

const en = translator('en');
assert.equal(en('Heute Restmüll'), 'General waste today');
assert.equal(en('Morgen Restmüll'), 'General waste tomorrow');
// A bin name without a translation (user's own label) still loses the German day word.
assert.equal(en('Heute Quxtonne'), 'Quxtonne today');
// Specific patterns keep winning over the general one.
assert.equal(en('Heute 3'), '3 today');
assert.equal(en('Heute 14:05'), 'Today 14:05');

const DAY = /\b(Heute|Morgen)\b/;
for (const lang of ['es', 'fr', 'it', 'nl', 'pl', 'pt']) {
  const tr = translator(lang);
  for (const de of ['Heute Restmüll', 'Morgen Restmüll', 'Heute Bio', 'Morgen Papier']) {
    const out = tr(de);
    assert.ok(out !== de && !DAY.test(out) && !/Restmüll/.test(out), `${lang}: ${de} -> ${out}`);
  }
}
console.log('trash_heute_morgen_i18n: ok');
