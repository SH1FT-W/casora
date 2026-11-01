// Dial on the phone (pruefung-2: DH-01, DH-02, fam-01, fam-02, DD-01) without a browser.
//   node dev/unit/dial_touch.mjs
// - A press in the open gap at the bottom, in the middle or outside the ring starts nothing (dialFrom → null);
//   while dragging, the gap still snaps to the nearer end.
// - The dial is not touch-action:none (the sheet scrolls over it); fingers go through the touch gesture, not
//   the pointer drag; the sheet ignores touches that began on the ring; the dial counts as popup content.
//   The gestures themselves: dev/qa/regress/r378_dial_touch.mjs.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const cut = (start, end) => { const i = core.indexOf(start); assert.ok(i >= 0, start); const j = core.indexOf(end, i); assert.ok(j > i, end); return core.slice(i, j); };
const src = cut('    var dialFrom = function (el, b, cx, cy, ring) {', '    // One step of a dial');
const { dialFrom } = new Function(src + '\nreturn { dialFrom };')();
const el = { dataset: { casoraSlider: '{}' } };
const b = { left: 0, top: 0, width: 420 };
const at = (deg, r) => [210 + r * Math.cos(deg * Math.PI / 180), 210 + r * Math.sin(deg * Math.PI / 180)];
const press = (deg, r, ring = true) => dialFrom(el, b, ...at(deg, r), ring);

assert.equal(press(135, 150), 0, 'start of the arc');
assert.equal(press(45, 150), 100, 'end of the arc');
assert.equal(press(270, 150), 50, 'top = half');
for (const deg of [60, 90, 120]) assert.equal(press(deg, 150), null, 'gap at ' + deg + '° starts nothing');
assert.equal(press(270, 60), null, 'middle starts nothing');
assert.equal(press(270, 205), null, 'outside the ring starts nothing');
assert.equal(press(100, 150, false), 0, 'dragging into the gap snaps to the nearer end (start)');
assert.equal(press(80, 150, false), 100, 'dragging into the gap snaps to the nearer end (end)');

assert.ok(/\.hui-dl\{[^}]*touch-action:pan-y/.test(core) && !/\.hui-dl\{[^}]*touch-action:none/.test(core), 'dial lets the sheet scroll');
assert.ok(core.includes("if (ev.pointerType === 'touch') return;"), 'fingers do not start the pointer drag');
assert.ok(/_bindSheetDrag\(surface, grab, content\) \{[\s\S]{0,400}if \(e\._casoraDialRing\) \{ tracking = false; return; \}/.test(core), 'sheet ignores ring touches');
// A popup card with tap_action none is "disabled" in button-card (pointer-events:none); the stage takes the
// pointer events back, or the ring never gets the finger and the phone sheet drags instead (single cover).
assert.ok(/var STAGE_CSS = 'ha-card\.disabled\{pointer-events:auto!important;\}'/.test(core), 'stage re-enables a disabled popup card');
assert.ok(/_overWidget\(ev\) \{[\s\S]*?contains\('hui-dl'\)/.test(core), 'dial is content for the background tap');
// A tap without turning commits nothing; turning is relative to the start (no jump to the finger).
const gest = cut("    var DIAL_HOLD = 260", "    document.addEventListener('touchcancel', tdialEnd, true);");
assert.ok(/if \(!d\.turning\) return;/.test(gest), 'a tap does not commit');
assert.ok(/base \+ tdial\.turned \/ 270 \* 100/.test(gest), 'relative turning');
console.log('ok dial_touch');
