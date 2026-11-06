// Desktop clock guard (01-basis): hides the clock while the glass room pill lies over it. It looks the bar and the
// clocks up again every 30 s (sooner when one is missing) – with two whole-page walks, one per selector
// (~875 querySelectorAll('*') each on the test house's desktop dashboard). Expected: one walk finds both, and the
// guard still hides a covered clock and shows it again.
//   node dev/unit/uhr_waechter_suche.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/01-basis.js', import.meta.url), 'utf8');
const a = src.indexOf('// ── Desktop: Uhrzeit nicht unter der Glas-Pille');
const b = src.indexOf('// ── HA-Kopfzeile ausblenden', a);
assert.ok(a > 0 && b > a, 'clock guard block found');

let star = 0;
const rect = (left, right) => ({ left, right, top: 0, bottom: 40, width: right - left, height: 40 });
const el = (name, id, extra = {}) => ({ localName: name, id, isConnected: true, shadowRoot: null, style: { visibility: '' }, ...extra });
const root = (kids) => ({
  querySelectorAll(sel) {
    if (sel === '*') { star++; return kids; }
    if (sel[0] === '#') return kids.filter((k) => k.id === sel.slice(1));
    return kids.filter((k) => k.localName === sel);
  },
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
});
let barRect = rect(100, 600);
const pill = el('div', '', { getBoundingClientRect: () => barRect });
const bar = el('casora-nav-bar', '');
bar.shadowRoot = root([pill]);
bar.shadowRoot.querySelector = (s) => (s === '.bar' ? pill : null);
const clock = el('div', 'time', { getBoundingClientRect: () => rect(20, 140) });
const tiles = Array.from({ length: 30 }, () => { const t = el('button-card', ''); t.shadowRoot = root([el('ha-card', '')]); return t; });
const view = el('hui-view', ''); view.shadowRoot = root([clock, ...tiles]);
const document = root([view, bar]);
document.hidden = false;

let tick = null;
const window = { matchMedia: () => ({ matches: true }) };
new Function('window', 'document', 'setInterval', src.slice(a, b))(window, document, (f) => { tick = f; return 1; });
assert.equal(typeof tick, 'function', 'guard runs on an interval');

const perWalk = 1 + 1 + 30 + 1; // document, the view, the tiles, the bar
tick();
assert.equal(star, perWalk, `one walk finds the bar and the clock (${star} querySelectorAll('*'), one walk = ${perWalk})`);
assert.equal(clock.style.visibility, 'hidden', 'covered clock hidden');
barRect = rect(300, 600);
tick();
assert.equal(clock.style.visibility, '', 'clock back once the pill moved away');
assert.equal(star, perWalk, 'no new walk while bar and clock are there');
console.log('ok uhr_waechter_suche');
