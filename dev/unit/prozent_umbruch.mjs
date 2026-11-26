// Prüfrunde d05-06: in the Polish blinds popup the button read "Zacienij 50" with "%" alone on the next line (the
// translation keeps "50 %" with a plain space), and "Gilt für alle 6" became "Dotyczy wszystkich (6)", too long for
// the line under the number ("Dotyczy wszyst-.."). Expected: in every language that writes a space before %, the
// space is a non-breaking one; the Polish hint is short.
//   node dev/unit/prozent_umbruch.mjs
// @deckt: tools/build-i18n.py custom_components/casora/scripts/casora-i18n.js
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { phrases } from './lib/i18n_phrases.mjs';
const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-i18n.js', import.meta.url), 'utf8');

const trIn = (language) => {
  const win = { __casoraI18nPhrases: phrases() };
  const doc = { querySelector: (q) => (q === 'home-assistant' ? { hass: { locale: { language } } } : null), addEventListener() {} };
  try { new Function('window', 'document', 'customElements', 'MutationObserver', src)(win, doc, { whenDefined: () => new Promise(() => {}), get: () => null }, class { observe() {} }); } catch (e) { /* no DOM */ }
  assert.ok(win.casoraTr, 'casoraTr loaded');
  return win.casoraTr;
};

for (const l of ['pl', 'fr', 'nl', 'es', 'it', 'pt', 'nb']) {
  const out = trIn(l)('Beschatten 50 %');
  assert.ok(/50/.test(out) && /%/.test(out), l + ': translated: ' + out);
  assert.ok(!/\d %/.test(out), l + ': no plain space before % (' + JSON.stringify(out) + ')');
}
assert.equal(trIn('en')('Beschatten 50 %'), 'Shade 50%', 'en: no space');
assert.equal(trIn('pl')('Gilt für alle 6'), 'Wszystkie (6)', 'pl: short hint');
console.log('prozent_umbruch: ok');
