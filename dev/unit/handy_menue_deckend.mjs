// dashfix2 (06.10.2026): Glocken-Liste und Räume-Menü am Handy (WebKit) waren durchscheinend – Text
// der Seite schien durch, vor allem dunkel. D-01 verlangt deckende Flächen.
//   node dev/unit/handy_menue_deckend.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const rd = (p) => fs.readFileSync(new URL('../../custom_components/casora/' + p, import.meta.url), 'utf8');
for (const t of ['theme_weich.yaml', 'theme_nebel.yaml']) {
  const v = [...rd(t).matchAll(/casora-menu-pane-webkit:\s*(\S+)/g)].map((m) => m[1]);
  assert.equal(v.length, 2, t + ': hell + dunkel');
  for (const c of v) assert.ok(/^rgb\(/.test(c), t + ': ' + c + ' nicht deckend');
}
const nav = rd('scripts/local/04-navigation.js');
assert.ok(/indexOf\('menu-pane-webkit'\) < 0\) m\.style\.backgroundColor = 'var\(--casora-mnav-menu-pane/.test(nav), 'Räume-Menü überschreibt die deckende WebKit-Fläche');
assert.ok(/_preload\(\)/.test(nav) && /new Image\(\)/.test(nav), 'Raum-Symbole werden vorab geladen');
console.log('ok handy_menue_deckend');
