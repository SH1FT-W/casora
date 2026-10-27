// Owner (26.10.2026): the bell hides the phone's player list (wave), the ⋯ menu did not. busyElsewhere() of
// 10-weich-welle.js decides; it must count the ⋯ menu (.casora-settings-menu) and the bar's rooms/scenes menu
// (.hmn-menu) like the bell's window (.casora-notify-menu).
//   node dev/unit/welle_menus_hide.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/10-weich-welle.js', import.meta.url), 'utf8');
const a = src.indexOf('function busyElsewhere()');
const b = src.indexOf('function autoOpen()', a);
assert.ok(a > 0 && b > a, 'busyElsewhere missing in 10-weich-welle.js');
const make = (present) => new Function('window', 'document', src.slice(a, b) + '\nreturn busyElsewhere;')(
  { casoraPopup: null, _casoraNotify: null },
  { querySelector: (sel) => (sel.split(',').map((x) => x.trim()).some((x) => present.includes(x)) ? {} : null) });
assert.equal(make([])(), false, 'nothing open');
assert.equal(make(['.casora-notify-menu'])(), true, 'bell');
assert.equal(make(['.casora-settings-menu'])(), true, '⋯ menu');
assert.equal(make(['.hmn-menu'])(), true, 'rooms/scenes menu of the bar');
console.log('welle_menus_hide: ok');
