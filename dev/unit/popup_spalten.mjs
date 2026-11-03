// Weather popup v3 columns (owner 01.11.2026, popup-richtlinien-v3 §7.1), static: left the dial and under it the one
// Verlauf, right „7 Tage“, then „Nächste Stunden“, then the details – before, the next hours sat under the dial and the
// Verlauf at the end of the right column (455 px left against 1211 px right). On the phone the order stays: stage,
// next hours, 7 days, Verlauf, details. The geometry is measured with a test HA: dev/qa/regress/r457_popup_spalten.mjs.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const ROOT = new URL('../../', import.meta.url);
const T = JSON.parse(fs.readFileSync(new URL('dashboards/casora/button_card_templates.json', ROOT), 'utf8'));
const wx = T.casora_weather.tap_action.casora_popup.content;
const b3 = wx.slice(wx.indexOf('const body3 = css'), wx.indexOf('const body = _v3 ? body3'));
assert.ok(b3.length > 500, 'weather v3: body3 not found');
const at = (s) => { const i = b3.indexOf(s); assert.ok(i > 0, 'weather v3: missing ' + s); return i; };
const leftEnd = at("+ '<div style=\"display:flex;flex-direction:column;gap:var(--casora-popup-sec-gap, 24px);min-width:0;\">'");
assert.ok(at('hw-slot-stage-') < at("'<div class=\"hw-o4\">' + chartH") && at("'<div class=\"hw-o4\">' + chartH") < leftEnd,
  'weather v3: left column = dial, then the Verlauf');
assert.ok(leftEnd < at('>7 Tage<') && at('>7 Tage<') < at('>Nächste Stunden<') && at('>Nächste Stunden<') < at("UI.group(det3, 'Details')"),
  'weather v3: right column = 7 Tage, Nächste Stunden, Details');
assert.ok(/max-width: 760px\)\{\.hw3>div\{display:contents!important;\}\.hw3 \.hw-o2\{order:2;\}\.hw3 \.hw-o3\{order:3;\}\.hw3 \.hw-o4\{order:4;\}\.hw3 \.hw-o5\{order:5;\}\}/.test(b3)
  && /hw-o2"><div class="hw-l">Nächste Stunden/.test(b3) && /hw-o3"><div class="hw-l">7 Tage/.test(b3) && /hw-o5">' \+ UI\.group\(det3/.test(b3),
  'weather v3: phone keeps stage, next hours, 7 days, Verlauf, details');

// Column balance (owner 02.11.2026, casora-core colBalance): the plan from measured heights. head = the left column's
// fixed part, items = the right column's sections in reading order; rule A moves the first items under the head, rule B
// makes one column of a long left and a short right column.
const core = fs.readFileSync(new URL('custom_components/casora/scripts/casora-core.js', ROOT), 'utf8');
const consts = core.match(/var BAL_KEY = [^\n]*\n/)[0];
const fn = core.slice(core.indexOf('function balSum('), core.indexOf('  // Ids carry only'));
assert.ok(fn.length > 200, 'colBalance: balPlan not found');
const plan = new Function(consts + fn + 'return balPlan;')();
// Light house popup, measured 01.11.2026: the dial 359 px left, 8 room rows right (602 px) → rows continue under the dial.
const rows = [96].concat(Array(7).fill(74));
const pa = plan({ head: 359, items: rows, gap: 8, tail: 0 }, true);
assert.ok(pa.k > 0 && !pa.one, 'rule A: the first rows go under the dial ' + JSON.stringify(pa));
const sum = (a, g) => a.reduce((x, h) => x + h, 0) + (a.length - 1) * g;
const L = 359 + 8 + sum(rows.slice(0, pa.k), 8), R = sum(rows.slice(pa.k), 8);
assert.ok(Math.abs(L - R) <= 120, `rule A: columns within 120 px (${L} / ${R})`);
// Sections: a stage of 300 px, the right column 4 sections (842 px) → the first ones under the stage, reading order kept.
const pb = plan({ head: 300, items: [180, 220, 200, 170], gap: 24, tail: 0 }, true);
assert.equal(pb.k, 1, 'rule A: one section under the stage ' + JSON.stringify(pb));
// Rule B: a lock's dial (361 px) and one short device row (76 px) → one column; not without v3 (allowOne false).
assert.deepEqual(plan({ head: 361, items: [76], gap: 22, tail: 0 }, true), { k: 0, one: true }, 'rule B: one column');
assert.deepEqual(plan({ head: 361, items: [76], gap: 22, tail: 0 }, false), { k: 0, one: false }, 'rule B only in v3');
// A long left with a right column above ONE_MAX stays (the 3D printer's camera under the dial, owner 01.11.2026).
assert.deepEqual(plan({ head: 680, items: [150, 120], gap: 22, tail: 0 }, true), { k: 0, one: false }, 'long right part stays');
// Balanced enough: nothing moves (gap ≤ 120 px).
assert.deepEqual(plan({ head: 359, items: [200, 180], gap: 22, tail: 0 }, true), { k: 0, one: false }, 'balanced stays');
// The last item never leaves the right column.
const pc = plan({ head: 50, items: [400], gap: 22, tail: 0 }, true);
assert.equal(pc.k, 0, 'one item stays right');
// Ids stand in a CSS comment and a <style>: a room or entity name can never close either.
const ids = core.slice(core.indexOf('function balHash('), core.indexOf('  var colBalance = {'));
const safe = new Function(ids + 'return balSafe;')();
for (const bad of ['lps:a*/b', 'x</style><b>', 'k:light.a|b c']) assert.ok(/^[\w.:,|~-]+$/.test(safe(bad)), 'balSafe: ' + safe(bad));
assert.ok(safe('x'.repeat(400)).length <= 160, 'balSafe: long ids shortened');
// The helpers hand their split to colBalance (one rule everywhere).
for (const [f, re] of [['02-devices.js', /CB\.split\(bal\.id/], ['05-weich-mehr.js', /CB\.split\(bal\.id/], ['05-standard-medien.js', /CB\.split\(bal\.id/]]) {
  assert.ok(re.test(fs.readFileSync(new URL('custom_components/casora/scripts/local/' + f, ROOT), 'utf8')), f + ': layout uses colBalance');
}
// Owner 03.11.2026: a list is never split – the light popups (one list right of the dial) stay out of the balance.
assert.ok(!/colBalance/.test(fs.readFileSync(new URL('custom_components/casora/scripts/local/03-popups.js', ROOT), 'utf8')), '03-popups.js: light popups do not split their list');
console.log('popup_spalten: ok');
