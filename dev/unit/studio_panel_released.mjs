// HA builds a new Studio panel on every visit. Three references kept every old panel (with its preview) alive:
// a casoraTheme.onChange listener per panel (no unsubscribe), the Esc listener on document from _bWireKeys,
// and the i18n module's strong reference to the last shadow root. Measured (test HA, 4 visits, after GC):
// 4 of 4 old panels alive, heap 132 MB; after the fix 0 of 4, 30 MB.
//   node dev/unit/studio_panel_released.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const root = process.env.CASORA_SRC_ROOT || new URL('../../', import.meta.url).pathname;
const read = (f) => fs.readFileSync(root + 'custom_components/casora/panel/' + f, 'utf8');
const body = (src, start, end) => {
  const a = src.indexOf(start);
  const b = src.indexOf(end, a + start.length);
  assert.ok(a > 0 && b > a, 'found ' + start.trim());
  return src.slice(a, b);
};

// 1. casoraTheme.onChange: wired once at module level, never inside a method (a closure there shares the
//    method's scope and with it `this`).
const panel = read('casora-panel.js');
const setHass = body(panel, '  set hass(hass) {', '\n  // Rebuilding the preview');
assert.ok(!/\.onChange\(/.test(setHass), 'set hass registers no casoraTheme listener itself');
assert.ok(setHass.includes('hookDesign();'), 'set hass wires the design listener through hookDesign');
const hook = body(panel, 'const hookDesign = () => {', '\n};');
assert.ok(hook.includes('designHooked = true'), 'hookDesign wires once');
assert.ok(!/\bthis\b/.test(hook), 'the design listener does not hold a panel');
assert.ok(hook.includes('window._casoraStudioPanel'), 'the design listener follows the panel on screen');
for (const f of fs.readdirSync(root + 'custom_components/casora/panel').filter((x) => /^casora-panel.*\.js$/.test(x))) {
  const n = (read(f).match(/casoraThemeApi\(\)\.onChange\(|casoraTheme\.onChange\(/g) || []).length;
  assert.ok(f === 'casora-panel.js' ? n === 1 : n === 0, f + ': casoraTheme.onChange only in hookDesign');
}

// 2. _bWireKeys: the Esc listener on document goes through _gOn (removed in disconnectedCallback).
const wire = body(read('casora-panel-b.js'), 'P._bWireKeys = function () {', '\n    };');
assert.ok(!/(document|window)\.addEventListener\(/.test(wire), '_bWireKeys adds no direct listener on document/window');
assert.ok(wire.includes('this._gOn(document, "keydown"'), 'Esc on document through _gOn');

// 3. i18n: the shadow root is held weakly.
const i18n = read('casora-panel-i18n.js');
assert.ok(!/\broot = sr\b/.test(i18n), 'no strong reference to the shadow root');
assert.ok(i18n.includes('rootRef = new WeakRef(sr)'), 'shadow root as WeakRef');

console.log('ok studio_panel_released');
