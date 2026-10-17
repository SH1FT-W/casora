// casoraLocale (casora-i18n.js) liefert immer ein gültiges Sprachkürzel für toLocale*/Intl – ein ungültiges
// aus HA (z. B. „es_ES“) ließ die Klingel-/Frigate-Kachel mit RangeError („JSTemplate error“) abbrechen.
//   node dev/unit/i18n_locale.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

let hass = null;
globalThis.window = globalThis;
globalThis.document = { querySelector: (q) => (q === 'home-assistant' ? { hass } : null), addEventListener: () => {} };
const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-i18n.js', import.meta.url), 'utf8');
new Function(src)();
assert.equal(typeof window.casoraLocale, 'function');

const cases = [
  [{ locale: { language: 'es' } }, 'es'], [{ locale: { language: 'es_ES' } }, 'es-ES'], [{ locale: { language: 'de-DE' } }, 'de-DE'],
  [{ locale: { language: 'zh-Hans' } }, 'zh-Hans'], [{ locale: { language: 'pt-BR' } }, 'pt-BR'], [{ language: 'nb' }, 'nb'],
  [{ locale: { language: '' } }, 'en'], [{}, 'en'], [{ locale: { language: 'x' } }, 'en'], [{ locale: { language: '!!' } }, 'en'],
  [{ locale: { language: 'es-ES-' } }, 'es'], [{ locale: { language: 'EN_us' } }, 'en-US'],
];
for (const [h, want] of cases) {
  hass = h;
  const got = window.casoraLocale();
  assert.equal(got, want, JSON.stringify(h));
  // Das Kürzel muss Intl annehmen – genau daran scheiterte die Kachel.
  assert.doesNotThrow(() => new Date(0).toLocaleTimeString(got, { hour: 'numeric', minute: '2-digit' }), got);
}
hass = null;
assert.equal(window.casoraLocale(), 'en', 'ohne HA');
console.log('i18n_locale: ok');
