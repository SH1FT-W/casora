// Englische Phrasen im Dashboard (casora-i18n.js aus translations/dashboard/phrases/en.json).
//   node dev/unit/phrasen_en.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-i18n.js', import.meta.url), 'utf8');
const win = {};
const doc = { querySelector: (q) => (q === 'home-assistant' ? { hass: { locale: { language: 'en' } } } : null), addEventListener() {} };
try { new Function('window', 'document', 'customElements', 'MutationObserver', src)(win, doc, { whenDefined: () => new Promise(() => {}), get: () => null }, class { observe() {} }); } catch (e) { /* DOM-Wächter ohne Browser */ }
const tr = win.casoraTr;
assert.ok(tr, 'casoraTr geladen');
const EXPECT = [
  // B-TPL-05: zwei verschmolzene Muster
  ['3 Termine heute', '3 events today'],
  ['Neu: Casora 1.0.11', 'New: Casora 1.0.11'],
  // B-TPL-09: Updates-Kachel
  ['2 Verfügbar', '2 available'],
];
for (const [de, en] of EXPECT) assert.equal(tr(de), en, de);
console.log('ok phrasen_en');
