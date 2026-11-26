// ⌘Z right after adding a tile whose device field takes the focus (Prüfrunde u02-05).   node dev/unit/undo_leeres_feld.mjs
// Switch, device with buttons, game activity and heat pump focus their device field after adding. ⌘Z landed in that
// empty search field and the new tile stayed. A field keeps ⌘Z only once it was typed into since it got the focus.
// @deckt: casora-panel.js#fieldOwnsUndo,_build
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');
const a = src.indexOf('const fieldOwnsUndo = ');
assert.ok(a > 0, 'fieldOwnsUndo exists');
const fieldOwnsUndo = new Function('return ' + src.slice(a + 'const fieldOwnsUndo = '.length, src.indexOf(';\n', a)) + ';')();

// The handler as wired in _build, with a fake document.
const b = src.indexOf('const typed = new WeakSet();');
const wiring = src.slice(b, src.indexOf('    });\n', src.indexOf('"keydown"', b)) + 8);
const on = {};
const P = {
  isConnected: true, _undoStack: [1], undone: 0, _undo() { this.undone++; },
  _gOn(_d, type, fn) { on[type] = fn; },
};
new Function('fieldOwnsUndo', 'document', wiring.replace(/this\./g, 'P.').replace(/^/, 'const P = this;\n')).call(P, fieldOwnsUndo, {});
const ev = (t, extra) => ({ composedPath: () => [t], metaKey: true, key: 'z', preventDefault() {}, ...extra });
const input = { tagName: 'INPUT', value: '' };

on.focusin(ev(input));
on.keydown(ev(input));
assert.equal(P.undone, 1, 'untouched device field: the Studio undoes the new tile');
on.input(ev(input));
on.keydown(ev(input));
assert.equal(P.undone, 1, 'typed into: the field undoes its own typing');
on.focusin(ev(input));
on.keydown(ev(input));
assert.equal(P.undone, 2, 'focus again: untouched again');
on.keydown(ev({ tagName: 'DIV' }));
assert.equal(P.undone, 3, 'outside fields as before');
assert.equal(fieldOwnsUndo({ tagName: 'TEXTAREA' }, new WeakSet()), false);
console.log('undo_leeres_feld: ok');
