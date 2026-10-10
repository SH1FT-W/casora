// V1 (1.3): Deutsch schreibt Prozent einheitlich „62 %“ mit schmalem geschütztem Leerzeichen (U+202F),
// egal ob der Code „62%“ oder „62 %“ baut; Englisch bleibt „62%“. Läuft über casoraTr (button-card-Texte).
//   node dev/unit/prozent_de.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-i18n.js', import.meta.url), 'utf8');
const load = (language) => {
  const win = {};
  const doc = { querySelector: (q) => (q === 'home-assistant' ? { hass: { locale: { language } } } : null), addEventListener() {} };
  try { new Function('window', 'document', 'customElements', 'MutationObserver', src)(win, doc, { whenDefined: () => new Promise(() => {}), get: () => null }, class { observe() {} }); } catch (e) { /* DOM-Wächter */ }
  return win.casoraTr;
};
const N = ' ';
const de = load('de');
assert.equal(de('62%'), '62' + N + '%');
assert.equal(de('62 %'), '62' + N + '%');
assert.equal(de('62 %'), '62' + N + '%');
assert.equal(de('62' + N + '%'), '62' + N + '%');
assert.equal(de('1 An · 40%'), '1 An · 40' + N + '%');
assert.equal(de('62% Geöffnet'), '62' + N + '% Geöffnet');
assert.equal(de('Boden bei 55%'), 'Boden bei 55' + N + '%');
// HTML: nur Text, nicht Attribute oder <style>
assert.equal(de('<div style="width:62%">62%</div>'), '<div style="width:62%">62' + N + '%</div>');
assert.equal(de('<style>.a{width:50%}</style>50 %'), '<style>.a{width:50%}</style>50' + N + '%');
// Kein Prozent ohne Zahl davor anfassen
assert.equal(de('% Akku'), '% Akku');
const en = load('en');
assert.equal(en('62' + N + '%'), '62%');
assert.equal(en('62 %'), '62%');
console.log('ok prozent_de');
