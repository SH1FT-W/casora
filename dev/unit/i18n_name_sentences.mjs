// #175 (English dashboard): two texts put together from a name stayed German.
//   1. The waste tile „Heute Papier 240 l“: the patterns knew bin names with a capital and no digit only. The tile
//      tries the whole sentence first (known names are translated too), else a stand-in name, then the bin's own.
//   2. The notification centre „Verisure Alarm aus“ (name + the state word of casoraSecurityWord): no pattern.
// Through the real runtime translator (as trash_heute_morgen_i18n.mjs).   LC_ALL=en_US.UTF-8 node dev/unit/i18n_name_sentences.mjs
// @deckt: dashboards/casora/button_card_templates.json#casora_trash, custom_components/casora/translations/dashboard/phrases/en.json
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { phrases } from './lib/i18n_phrases.mjs';

const read = (f) => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const i18n = read('custom_components/casora/scripts/casora-i18n.js');
function translator(lang) {
  const win = { __casoraI18nPhrases: phrases() };
  const doc = { querySelector: (q) => (q === 'home-assistant' ? { hass: { locale: { language: lang } } } : null), addEventListener() {} };
  try { new Function('window', 'document', 'customElements', 'MutationObserver', i18n)(win, doc, { whenDefined: () => new Promise(() => {}), get: () => null }, class { observe() {} }); } catch (e) { /* DOM watcher without a browser */ }
  return win.casoraTr;
}
const tr = translator('en');
const ph = { exact: JSON.parse(read('custom_components/casora/translations/dashboard/phrases/en.json')).exact };

// 1. The waste tile.
const tpl = JSON.parse(read('dashboards/casora/button_card_templates.json')).casora_trash;
const js = (s) => s.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
const tile = (label, days, lang) => {
  const window = { casoraTr: lang === 'en' ? tr : null, casoraEsc: (x) => String(x), casoraStateFit: (t) => t,
    casoraDevice: { waste: () => ({ next: { label }, days, bins: [{}], calendar: null }) }, _casoraTrashFetch: () => {} };
  return new Function('window', 'states', 'hass', 'variables', 'entity', js(tpl.state_display))(window, {}, {}, {}, {});
};
for (const name of ['paper', 'Restmüll 240 l', 'GFT (groen)', 'recycling bin']) {
  const out = tile(name, 0, 'en');
  assert.ok(!/\b(Heute|Morgen)\b/.test(out) && out.includes(name) && /today/.test(out), name + ' → ' + out);
  assert.ok(/tomorrow/.test(tile(name, 1, 'en')), name + ' tomorrow');
}
assert.equal(tile('Restmüll', 0, 'en'), 'General waste today', 'a known bin name is still translated with the sentence');
assert.equal(tile('Restmüll 240 l', 0, 'de'), 'Heute Restmüll 240 l', 'German unchanged');
assert.equal(tile('Bio', 1, 'de'), 'Morgen Bio');
// r68 (English Studio preview): two bins on one day („Bio + Restmüll“) stayed German on the tile, the runtime
// translator did not know the joined name; now it goes part by part, and „Bio“ has a phrase of its own.
assert.equal(tile('Bio + Restmüll', 0, 'en'), 'Organic + General waste today', 'two bins today');
assert.equal(tr(tile('Bio + Restmüll', 2, 'en')), '2 days · Organic + General waste', 'two bins in 2 days (translated on the way out)');
assert.equal(tr('Bio + Tonne Hof'), 'Organic + Tonne Hof', 'an own name in a joined one stays');
assert.equal(tr('Tonne + Hof'), 'Tonne + Hof', 'nothing known: unchanged');

// 2. Name + state word of the alarm (01-basis.js describe: an + ' ' + word in lower case).
assert.equal(tr('Verisure Alarm aus'), 'Verisure Alarm off');
assert.equal(tr('Verisure Alarm aktiv · Abwesend'.split(' · ')[0]), 'Verisure Alarm active');
assert.equal(tr('Licht aus'), ph.exact['Licht aus'] ?? 'Licht off', 'exact phrases still win');
console.log('i18n_name_sentences: ok');
