// Prüfrunde u01-04: after "Leer beginnen" the phone home showed the heading "Favoriten" with nothing below, while the
// desktop row said "Noch keine Geräte – im Studio hinzufügen". The tile row built its empty line only outside scroll
// mode, and every phone row is in scroll mode. Expected: a row without tiles gets the line on the phone too; a row
// with tiles never does.
//   node dev/unit/empty_hint_phone_row.mjs
// @deckt: custom_components/casora/scripts/smart-row.js#_wantsEmptyHint,_init
import fs from 'node:fs';
import assert from 'node:assert/strict';

let RowClass = null;
const win = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }), innerWidth: 393,
  location: { pathname: '/casora-mobile/home' } };
const sandbox = {
  window: win,
  document: { body: null, addEventListener() {}, documentElement: { style: { setProperty() {} } }, createElement: () => ({ style: {} }) },
  customElements: { define: (n, c) => { RowClass = c; }, get: () => null, whenDefined: () => new Promise(() => {}) },
  HTMLElement: class { dispatchEvent() { return true; } },
  getComputedStyle: () => ({ display: 'flex' }),
  requestAnimationFrame: () => 0, cancelAnimationFrame() {}, setTimeout: () => 0, clearTimeout() {},
  ResizeObserver: class { observe() {} disconnect() {} },
};
const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/smart-row.js', import.meta.url), 'utf8');
new Function(...Object.keys(sandbox), src)(...Object.values(sandbox));
assert.ok(RowClass, 'casora-smart-row defined');

// The phone decides scroll mode from the path (…-mobile); setConfig sets it as on the real dashboard.
const row = (cards, cfg = {}) => { const r = Object.create(RowClass.prototype); r.setConfig({ cards, ...cfg }); return r; };
const phone = row([]);
assert.equal(phone._scrollMode, true, 'phone path: scroll mode');
assert.equal(typeof phone._wantsEmptyHint, 'function', 'the row decides the empty line in one place');
assert.equal(phone._wantsEmptyHint(), true, 'phone row without tiles: empty line');
assert.equal(row([{ type: 'custom:button-card' }])._wantsEmptyHint(), false, 'phone row with tiles: no line');
assert.equal(row([], { scroll_mode: false })._wantsEmptyHint(), true, 'desktop row without tiles: empty line as before');
assert.equal(row([{ type: 'custom:button-card' }], { scroll_mode: false })._wantsEmptyHint(), false, 'desktop row with tiles: none');

// The build uses that rule (and no scroll-mode exception any more).
const init = src.slice(src.indexOf('  async _init() {'), src.indexOf("rowLog('build start'"));
assert.ok(/if \(this\._wantsEmptyHint\(\)\) \{\s*const hint = this\._buildEmptyHint\(\);/.test(init), 'the build asks _wantsEmptyHint');
assert.ok(!/_buildEmptyHint[\s\S]*_scrollMode|_scrollMode[\s\S]*_buildEmptyHint/.test(init.slice(init.indexOf('_wantsEmptyHint'))), 'no scroll-mode exception at the hint');
console.log('empty_hint_phone_row: ok');
