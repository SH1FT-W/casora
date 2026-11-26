// Studio "View as: Kind" (Prüfrunde u10-04): with the office set to admin only, the child's dashboard had no office in
// its room bar, the Studio preview still showed it; and the preview's Home light badge still counted the office
// (dashboard side: u10-03). "View as" now hides the room-bar tabs of rooms that person does not see (the room at hand
// stays, with its sentence) and leaves those rooms out of Home's house lights in the preview.
//   node dev/unit/ansehen_als_raumleiste.mjs
// @deckt: custom_components/casora/panel/casora-panel-b-ux.js#_uxMarkPreview custom_components/casora/panel/casora-panel.js#hiddenFromAs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const rd = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const panel = rd('custom_components/casora/panel/casora-panel.js');
const m = /^const hiddenFromAs = [\s\S]*?\n\};\n/m.exec(panel);
assert.ok(m, 'hiddenFromAs');
const hiddenFromAs = new Function(m[0] + 'return hiddenFromAs;')();
assert.ok(/^  setupStep, hiddenFromAs,$/m.test(panel), 'shared with the modules');
assert.ok(panel.includes('allRooms.filter((r) => r !== room && !hiddenFromAs(r, this._uxAs))'), 'preview house lights follow "View as"');
assert.ok(/t\.dataset\.ri = ri;/.test(panel), 'room-bar tabs carry their room');

const proto = {};
let ready;
const defined = new Promise((r) => { ready = r; });
globalThis.window = globalThis;
globalThis.document = { addEventListener() {}, removeEventListener() {}, querySelector: () => null, createElement: () => ({ style: {}, setAttribute() {}, classList: { add() {} } }) };
globalThis.customElements = { whenDefined: () => defined, get: () => ({ prototype: proto }) };
window.__casoraPanelInternals = { hiddenFromAs };
new Function(rd('custom_components/casora/panel/casora-panel-b-ux.js'))();
ready();
await new Promise((r) => setTimeout(r, 0));
assert.equal(typeof proto._uxMarkPreview, 'function');

const el = (ri) => { const c = new Set(); return { dataset: { ri: String(ri) }, classList: { toggle: (k, on) => (on ? c.add(k) : c.delete(k)), contains: (k) => c.has(k) }, has: (k) => c.has(k) }; };
const tabs = [el(0), el(1), el(2), el(3)];
const map = { querySelectorAll: (q) => (q === '.mini-tab[data-ri]' ? tabs : []), querySelector: () => null };
const rooms = [
  { name: 'Zuhause', path: 'home', tiles: [], variables: {} },
  { name: 'Büro', tiles: [], variables: { casora_users: ['admin'] } },
  { name: 'Küche', tiles: [], variables: {} },
  { name: 'Keller', tiles: [], variables: { casora_hidden: true } },
];
const p = { _uxAs: 'kid', _room: 0, _state: { compact: { rooms } }, _mUsersCache: [],
  shadowRoot: { querySelector: (q) => (q === '.card.map' ? map : null) } };
proto._uxMarkPreview.call(p);
assert.deepEqual(tabs.map((t) => t.has('uxashide')), [false, true, false, true], 'kid: office and hidden cellar gone from the bar');
p._uxAs = null;
proto._uxMarkPreview.call(p);
assert.deepEqual(tabs.map((t) => t.has('uxashide')), [false, false, false, false], 'me: every room');
// The room at hand stays in the bar (its sentence says it is not seen).
p._uxAs = 'kid'; p._room = 1;
proto._uxMarkPreview.call(p);
assert.equal(tabs[1].has('uxashide'), false, 'room at hand stays');
console.log('ok ansehen_als_raumleiste');
