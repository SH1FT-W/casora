// Casora Glas: menus and windows (bell, ⋯, rooms/scenes on the phone) must hide what lies below them.
// At .50/.58 tile names and scene chips read through the list (Prüfung 2 E01).
//   node dev/unit/glass_menus_readable.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const y = fs.readFileSync(new URL('../../custom_components/casora/theme_glas.yaml', import.meta.url), 'utf8');
const KEYS = ['casora-menu-pane', 'casora-menu-pane-webkit', 'casora-mnav-menu-bg'];
for (const k of KEYS) {
  const vals = [...y.matchAll(new RegExp('^\\s+' + k + ':\\s*rgba\\([^)]*,\\s*([0-9.]+)\\)', 'gm'))].map((m) => +m[1]);
  assert.equal(vals.length, 2, k + ': light and dark');
  vals.forEach((a) => assert.ok(a >= 0.85, `${k} alpha ${a} < .85`));
}
assert.match(y, /^\s+casora-window-backdrop:\s*blur/m, 'windows keep their blur in Glas');
assert.ok(fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8')
  .includes("getPropertyValue('--casora-window-backdrop')"), 'casoraMenuGlass.frame reads the window blur');
console.log('glass_menus_readable: ok');
