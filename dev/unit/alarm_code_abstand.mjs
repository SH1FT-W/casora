// u07-11: alarm with a code, disarmed – the round „Scharf schalten“ moon at the wheel's foot reached 3 px into the
// „Code eingeben“ field right under the wheel. Expected: the field keeps the distance the pill under such a wheel keeps
// (casora-core.js DIAL_CSS: .hui-stage.dial.mb > .hui-dl + .hui-st-act{margin-top:24px}), and no inline margin-top
// that would beat the rule.
//   node dev/unit/alarm_code_abstand.mjs
// @deckt: 07-weich-spezial.js#AL.code
import assert from 'node:assert/strict';
import fs from 'node:fs';

const rd = (p) => fs.readFileSync(new URL('../../custom_components/casora/scripts/' + p, import.meta.url), 'utf8');
const src = rd('local/07-weich-spezial.js'), core = rd('casora-core.js');
const win = { CSS: null, addEventListener: () => {}, removeEventListener: () => {}, _casoraUI: { quick: () => '', page: () => {} } };
new Function('window', 'document', 'CSS', src)(win, { querySelector: () => null, addEventListener: () => {} }, null);
const AL = win._casoraAlarmSoft;

const html = AL.code({ st: 'disarmed', needArm: true, numeric: true });
assert.ok(html, 'code field for a code alarm');
// Order: the field's <style> first, then the field – right after the wheel in the stage (extra follows the dial).
const m = html.match(/^<style>([\s\S]*?)<\/style><div class="cal-code" style="([^"]*)"/);
assert.ok(m, 'style then field');
const pill = core.match(/\.hui-stage\.dial\.mb > \.hui-dl \+ \.hui-st-act\{margin-top:(\d+)px;\}/);
assert.ok(pill, 'pill distance in the core');
const rule = m[1].match(/\.hui-stage\.dial\.mb > \.hui-dl \+ style \+ \.cal-code\{margin-top:(\d+)px;?\}/);
assert.ok(rule, 'field under a wheel with a bottom moon gets a top margin');
assert.equal(rule[1], pill[1], 'same distance as the pill under the wheel');
assert.ok(!/(^|;)\s*margin\s*:/.test(m[2]) && !/margin-top/.test(m[2]), 'no inline margin-top beating the rule: ' + m[2]);
assert.ok(/margin-bottom:12px/.test(m[2]), 'bottom distance kept');

// The disarmed stage puts the field straight after the wheel: no countdown bar before it.
assert.ok(/extra: na \? '' : \(cd\.bar \|\| ''\) \+ AL\.code\(I\)/.test(src), 'field is the stage extra');
assert.deepEqual(AL.count({ left: null }, '#000'), { bar: '', n: '' }, 'no bar without a countdown');
console.log('alarm_code_abstand: ok');
