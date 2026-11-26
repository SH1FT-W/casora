// CasoraPopup focus on open: a tile tap calls open() twice (the second within ~100 ms, while already open). That
// second call bumps _openGen and starts no new _focusIn, so the focus-in retries must not stop on it.
//   node dev/unit/popup_focus_in_reopen.mjs
// @deckt: custom_components/casora/scripts/casora-core.js#_focusIn,close
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const a = src.indexOf('    _focusIn() {');
const b = src.indexOf('    _owns(n) {', a);
assert.ok(a > 0 && b > a, '_focusIn found');
let active = null;
const timers = [];
const Popup = new Function('deepFocus', 'document', 'setTimeout', `return class { ${src.slice(a, b)} }`)(
  () => active, { body: { tag: 'body' }, documentElement: {} }, (fn, ms) => timers.push({ fn, ms }));

const tile = { tag: 'tile' };
const p = new Popup();
let laidOut = false; // the sheet is held invisible at first: a hidden element takes no focus
p.content = { focus() { if (laidOut) active = p.content; } };
Object.assign(p, { _openGen: 1, _focusBack: [tile], hasAttribute: (k) => k === 'open', _owns: (n) => n === p.content });
active = tile;
p._focusIn();
timers.shift().fn(); // 0 ms: still hidden
assert.equal(active, tile, 'hidden sheet takes no focus');
p._openGen++; // the second open() of the same tap
laidOut = true;
timers.forEach((t) => t.fn());
assert.equal(active, p.content, 'focus moves into the popup after the second open() call');

// A focus the user moved elsewhere meanwhile is left alone.
const other = { tag: 'other' };
timers.length = 0; laidOut = false; active = tile;
p._focusIn(); timers.shift().fn(); active = other; laidOut = true;
timers.forEach((t) => t.fn());
assert.equal(active, other, 'never takes the focus from somewhere else');
// close() ends the round: a late retry of the closed opening does nothing (the reopen starts its own).
const c = src.slice(src.indexOf('    close() {'), src.indexOf("this.setAttribute('closing', '');", src.indexOf('    close() {')));
assert.match(c, /this\._focusRound = \(this\._focusRound \|\| 0\) \+ 1/, 'close ends the focus round');
console.log('ok popup_focus_in_reopen');
