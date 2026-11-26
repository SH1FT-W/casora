// d05-09 (review 26.11.2026): on a narrow desktop/tablet width (769-834, 1024 with HA's sidebar) the room pill started
// 20 px from the content's edge, right over the clock, and the clock guard hid the clock. Owner: the clock stays, the
// pill starts beside it. The clock guard publishes the clock's right edge (window._casoraClockRight), the pill's
// narrow layout starts 12 px after it (window._casoraPillLeft).
//   node dev/unit/tablet_clock_beside_pill.mjs
// @deckt: custom_components/casora/scripts/local/01-basis.js#_casoraPillLeft,_casoraClockRight,_casoraPillPlace,_casoraTimeGuard
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/01-basis.js', import.meta.url), 'utf8');
const m = src.match(/window\._casoraPillLeft = function \(left\) \{[\s\S]*?\n  \};\n/);
assert.ok(m, '_casoraPillLeft');
const window = {};
new Function('window', m[0])(window);

// No clock (time hidden, or no row): 20 px from the content's edge, as before.
window._casoraClockRight = 0;
assert.equal(window._casoraPillLeft(0), 20);
// Clock 23 … 81 px at 834 without a sidebar: the pill starts 12 px after it.
window._casoraClockRight = 81;
assert.equal(window._casoraPillLeft(0), 93, 'beside the clock');
// 1024 with HA's sidebar (content from 256): the clock at 279 … 337 → 93 px inside the content.
window._casoraClockRight = 337;
assert.equal(window._casoraPillLeft(256), 93, 'beside the clock, sidebar open');

// The narrow layout uses it; the clock guard publishes the clock's edge in the pill's row.
const place = src.slice(src.indexOf('window._casoraPillPlace = true;'), src.indexOf('window._casoraTimeGuard = true;'));
assert.match(place, /var RIGHT = 232, LEFT = window\._casoraPillLeft\(left\);/, 'narrow pill starts beside the clock');
const guard = src.slice(src.indexOf('window._casoraTimeGuard = true;'), src.indexOf('window._casoraHeaderGuard = true;'));
assert.match(guard, /window\._casoraClockRight = cr;/, 'guard publishes the clock edge');
assert.match(guard, /r\.bottom > b\.top && r\.top < b\.bottom\)\)\) cr = Math\.max\(cr, r\.right\)/, 'only a clock in the pill\'s row');
console.log('tablet_clock_beside_pill: ok');
