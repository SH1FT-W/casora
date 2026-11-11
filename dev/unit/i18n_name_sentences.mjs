// #175 (English dashboard): two texts put together from a name stayed German.
//   1. The waste tile „Heute Papier 240 l“: the patterns knew bin names with a capital and no digit only. The tile
//      now translates the sentence with a stand-in name and puts the bin's name in afterwards.
//   2. The notification centre „Verisure Alarm aus“ (name + the state word of casoraSecurityWord): no pattern.
// The lookup below is the one of casora-i18n.js (exact first, then the first matching pattern, parts translated
// again).   node dev/unit/i18n_name_sentences.mjs
// @deckt: dashboards/casora/button_card_templates.json#casora_trash, custom_components/casora/translations/dashboard/phrases/en.json
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (f) => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const ph = JSON.parse(read('custom_components/casora/translations/dashboard/phrases/en.json'));
const RE = ph.patterns.map(([p, t]) => [new RegExp(p), t]);
const one = (core, depth = 0) => {
  if (typeof ph.exact[core] === 'string') return ph.exact[core];
  if (depth > 2) return null;
  for (const [re, t] of RE) {
    const m = core.match(re);
    if (m) return t.replace(/\{(\d)\}/g, (x, n) => { const g = m[+n] ?? ''; const s = /[A-Za-zÄÖÜäöüß]/.test(g) ? one(g, depth + 1) : null; return s ?? g; });
  }
  return null;
};
const tr = (s) => one(s.trim()) ?? s;

// 1. The waste tile.
const tpl = JSON.parse(read('dashboards/casora/button_card_templates.json')).casora_trash;
const js = (s) => s.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
const tile = (label, days, lang) => {
  const window = { casoraTr: lang === 'en' ? tr : null, casoraEsc: (x) => String(x), casoraStateFit: (t) => t,
    casoraDevice: { waste: () => ({ next: { label }, days, bins: [{}], calendar: null }) }, _casoraTrashFetch: () => {} };
  return new Function('window', 'states', 'hass', 'variables', 'entity', js(tpl.state_display))(window, {}, {}, {}, {});
};
for (const name of ['paper', 'Papier', 'Restmüll 240 l', 'GFT (groen)', 'Bio + Papier']) {
  const out = tile(name, 0, 'en');
  assert.equal(tr(out), out, 'English, no German left: ' + out);
  assert.ok(out.includes(name) && /today/.test(out), name + ' → ' + out);
  assert.ok(/tomorrow/.test(tile(name, 1, 'en')), name + ' tomorrow');
}
assert.equal(tile('Restmüll 240 l', 0, 'de'), 'Heute Restmüll 240 l', 'German unchanged');
assert.equal(tile('Bio', 1, 'de'), 'Morgen Bio');

// 2. Name + state word of the alarm (01-basis.js describe: an + ' ' + word in lower case).
assert.equal(tr('Verisure Alarm aus'), 'Verisure Alarm off');
assert.equal(tr('Verisure Alarm aktiv · Abwesend'.split(' · ')[0]), 'Verisure Alarm active');
assert.equal(tr('Licht aus'), ph.exact['Licht aus'] ?? 'Licht off', 'exact phrases still win');
console.log('i18n_name_sentences: ok');
