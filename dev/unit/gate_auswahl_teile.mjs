// Patch gate selection by parts of a big script (dev/qa/auswahl-teile.mjs): the scanner keeps brace depth through
// strings, template literals, comments and regexes; a diff hunk lands in its innermost definition; a change reaches
// the globals/elements around it, its callers by unique name, or – weakly – its module.
//   node dev/unit/gate_auswahl_teile.mjs
import assert from 'node:assert/strict';
import { depths, units, hunks, placed, reach } from '../qa/auswahl-teile.mjs';

// ── depths: braces inside strings, templates, comments and regexes don't count ──
const tricky = [
  '(function () {',                                  // 1
  "  var a = '{', b = \"}\", c = `x ${ {k: 1}.k } {`;", // 2
  '  var re = /[{}]\\}/g; // }',                      // 3
  '  /* { */ var d = 1;',                            // 4
  '  function f() {',                                // 5
  '    return a.replace(/}/, "");',                  // 6
  '  }',                                             // 7
  '})();',                                           // 8
].join('\n') + '\n';
const d = depths(tricky);
assert.deepEqual(d.slice(0, 8), [0, 1, 1, 1, 1, 2, 2, 1], 'depth per line start');
assert.equal(d[8], 0, 'balanced at the end');

// ── units, hunks, placed, reach on a small module ──
const src = [
  '(function () {',                                           // 1
  '  var S = window._casoraDemoSoft = { els: {} };',          // 2
  '  function helperUniqueName(x) {',                         // 3
  '    return x + 1;',                                        // 4
  '  }',                                                      // 5
  '  S.buildRows = function (h) {',                             // 6
  '    return helperUniqueName(h);',                          // 7
  '  };',                                                     // 8
  '  window.casoraDemoPublic = function () {',                // 9
  '    return S.buildRows(2);',                                  // 10
  '  };',                                                     // 11
  '  function open() { return 1; }',                         // 12
  '  window.casoraDemoOther = {',                              // 13
  '    pick: function () { return 3; },',                     // 14
  '    waste: function (h) {',                                // 15
  '      return h;',                                          // 16
  '    }',                                                    // 17
  '  };',                                                     // 18
  '  class DemoCard extends HTMLElement {',                   // 19
  '    connectedCallback() {',                                // 20
  '      this.x = 1;',                                        // 21
  '    }',                                                    // 22
  '  }',                                                      // 23
  "  customElements.define('casora-demo-card', DemoCard);",  // 24
  '})();',                                                    // 25
].join('\n');
const all = units(src);
const find = (kind, name) => all.find((u) => u.kind === kind && u.name === name);
assert.ok(find('iife', 'iife@1'), 'module IIFE');
assert.deepEqual([find('function', 'helperUniqueName').start, find('function', 'helperUniqueName').end], [3, 5]);
assert.deepEqual([find('member', 'S.buildRows').start, find('member', 'S.buildRows').end], [6, 8]);
assert.ok(find('global', 'casoraDemoPublic'));
assert.deepEqual([find('prop', 'casoraDemoOther.waste').start, find('prop', 'casoraDemoOther.waste').end], [15, 17], 'key of a global object');
assert.ok(find('element', 'casora-demo-card'));
assert.ok(find('method', 'connectedCallback'));

assert.deepEqual(hunks('@@ -3,0 +4,2 @@\n+a\n+b\n@@ -10 +12 @@\n-x\n+y\n@@ -20,2 +21,0 @@\n-p\n-q\n'),
  [{ start: 4, end: 5 }, { start: 12, end: 12 }, { start: 21, end: 21, deleted: true }]);

const at = (ln) => placed(src, [{ start: ln, end: ln }], all);
assert.deepEqual(at(4).parts.map((u) => u.name), ['helperUniqueName'], 'innermost definition');
assert.deepEqual(at(4).unplaced, []);
// helper → its caller S.buildRows → S is window._casoraDemoSoft (alias); S.buildRows is also called by casoraDemoPublic.
const r1 = reach(src, at(4).parts, all);
assert.ok(r1.has('_casoraDemoSoft') && r1.has('casoraDemoPublic'), [...r1].join(' '));
assert.equal(r1.weak.size, 0);
// a method → its class → the element registering it
assert.deepEqual([...reach(src, at(21).parts, all)], ['casora-demo-card']);
// a key of a global object → "global.key"
assert.deepEqual([...reach(src, at(16).parts, all)], ['casoraDemoOther.waste']);
// a common name without a unique caller → only weakly the module's globals
const r2 = reach(src, at(12).parts, all);
assert.equal(r2.size, 0);
assert.ok(r2.weak.has('casoraDemoPublic') && r2.weak.has('_casoraDemoSoft'), [...r2.weak].join(' '));
// comment-only changes are no part at all
const withComment = src.replace('    return x + 1;', '    // just a note\n    return x + 1;');
assert.deepEqual(placed(withComment, [{ start: 4, end: 4 }]).parts, []);
// a line outside every unit cannot be placed
assert.equal(placed('var x = 1;\nfoo();\n', [{ start: 2, end: 2 }]).unplaced.length, 1);
// A module that only uses a global from elsewhere does not expose it; one that sets it does.
{
  const src = ['(function () {', '  var UI = window._hub;', '  var S = window._own = {};', '  function f() { return 1; }', '  f();', '})();', ''].join('\n');
  const all = units(src);
  const p = placed(src, [{ start: 5, end: 5 }], all);
  const r = reach(src, p.parts, all);
  assert.ok(!r.has('_hub') && !(r.weak && r.weak.has('_hub')), 'a global the module only reads is not its own');
}
console.log('ok gate_auswahl_teile');
