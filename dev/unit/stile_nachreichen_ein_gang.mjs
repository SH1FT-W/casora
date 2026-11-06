// Extra sheets for HA's elements (casora-webkit-blur: ha-card, ha-dialog, ha-bottom-sheet; shadow room: button-card)
// reach elements drawn before the module through a walk over every shadow root, 1.5 s later. That was one
// whole-page walk per tag – four while the test house's desktop dashboard loads (~3500 querySelectorAll('*')).
// Expected: one shared walk, every drawn element gets its sheet exactly once, other elements none.
//   node dev/unit/stile_nachreichen_ein_gang.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const a = core.indexOf('// casora-webkit-blur:start'), b = core.indexOf('// casora-webkit-blur:end');
assert.ok(a > 0 && b > a, 'block casora-webkit-blur found');
const i = core.indexOf("(function () {\n  if (window.__casoraShadowRoom");
assert.ok(i > 0, 'shadow room block found');
const shadowRoom = core.slice(i, core.indexOf('})();\n', i) + 6);

class Sheet { replaceSync(t) { this.text = t; } }
const classes = { 'ha-card': { elementStyles: [] }, 'ha-dialog': { elementStyles: [] }, 'ha-bottom-sheet': { elementStyles: [] }, 'button-card': { elementStyles: [], prototype: {} } };
const pending = [];
const customElements = { whenDefined: () => ({ then: (f) => pending.push(f) }), get: (t) => classes[t] };
const window = { customElements };
const timers = [];
const setTimeout = (f, ms) => { timers.push([f, ms]); return timers.length; };

// Page drawn before the module: tiles (button-card → ha-card), a dialog, an unrelated element.
let star = 0;
const host = (name, kids = []) => ({ localName: name, shadowRoot: { adoptedStyleSheets: [], querySelectorAll: (s) => { if (s === '*') star++; return kids; } } });
const cards = [], tiles = [];
for (let k = 0; k < 20; k++) { const c = host('ha-card'); cards.push(c); tiles.push(host('button-card', [c, host('ha-ripple')])); }
const dialog = host('ha-dialog');
const other = host('hui-view', [...tiles, dialog]);
const document = { querySelectorAll: (s) => { if (s === '*') star++; return [other]; } };

const args = ['window', 'customElements', 'CSSStyleSheet', 'document', 'setTimeout'];
new Function(...args, core.slice(a, b))(window, customElements, Sheet, document, setTimeout);
new Function(...args, shadowRoom)(window, customElements, Sheet, document, setTimeout);
pending.forEach((f) => f());
await Promise.resolve(); await Promise.resolve();

assert.equal(timers.length, 1, `one deferred walk for all four tags (got ${timers.length})`);
assert.equal(timers[0][1], 1500, 'after 1.5 s as before');
timers[0][0]();
const perWalk = 3 + tiles.length * 3; // document, hui-view, dialog; each tile, its ha-card and ripple
assert.equal(star, perWalk, `one walk (${star} querySelectorAll('*'))`);
const sheetOf = (tag) => classes[tag].elementStyles.find((s) => s instanceof Sheet);
for (const c of cards) assert.deepEqual(c.shadowRoot.adoptedStyleSheets, [sheetOf('ha-card')], 'ha-card: its sheet once');
for (const t of tiles) assert.deepEqual(t.shadowRoot.adoptedStyleSheets, [sheetOf('button-card')], 'button-card: its sheet once');
assert.deepEqual(dialog.shadowRoot.adoptedStyleSheets, [sheetOf('ha-dialog')], 'ha-dialog: its sheet once');
assert.deepEqual(other.shadowRoot.adoptedStyleSheets, [], 'other elements: nothing');
// A tag defined later starts a new walk of its own.
window.__casoraAdoptLater('ha-bottom-sheet', new Sheet());
assert.equal(timers.length, 2, 'a later tag schedules again');
console.log('ok stile_nachreichen_ein_gang');
