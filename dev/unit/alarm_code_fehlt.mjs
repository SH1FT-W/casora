// Prüfrunde u07-02: an alarm panel that needs a code; a tap on „Abwesend“ without a code did nothing visible (only a
// 260 ms shake and focus on a field without a focus ring). Expected: the field says „Erst Code eingeben“ and is
// outlined until someone types; no service call. With a code the call goes out as before.
//   node dev/unit/alarm_code_fehlt.mjs
// @deckt: custom_components/casora/scripts/local/07-weich-spezial.js#AL.askCode,_casoraAlarmTap
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/07-weich-spezial.js', import.meta.url), 'utf8');
const listeners = {};
const calls = [];
const states = { 'alarm_control_panel.code': { state: 'disarmed', attributes: { code_format: 'number', code_arm_required: true, supported_features: 3 } } };
const hass = { states, callService: (d, s, data) => { calls.push([d, s, data]); return Promise.resolve(); } };
const win = {
  CSS: null, removeEventListener: () => {},
  addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
  _casoraUI: { quick: () => '', page: () => {} },
};
const doc = { querySelector: (q) => (q === 'home-assistant' ? { hass } : null), addEventListener: () => {} };
new Function('window', 'document', 'CSS', src)(win, doc, null);

const mkInput = (value) => {
  const ev = {};
  return { value, placeholder: 'Code eingeben', style: {}, focused: 0, focus() { this.focused++; }, animate() {},
    addEventListener(t, fn) { ev[t] = fn; }, fire(t) { if (ev[t]) ev[t](); } };
};
const tap = (inp) => {
  const el = { dataset: { casoraAlarm: JSON.stringify({ s: 'alarm_arm_away', e: 'alarm_control_panel.code' }) },
    getRootNode: () => ({ querySelector: (q) => (q === '.cal-code input' ? inp : null) }), getAttribute: () => null };
  const ev = { type: 'click', composedPath: () => [el], stopImmediatePropagation() {}, stopPropagation() {}, preventDefault() {}, cancelable: true };
  listeners.click.forEach((fn) => fn(ev));
};

const inp = mkInput('');
tap(inp);
assert.equal(calls.length, 0, 'no call without a code');
assert.equal(inp.placeholder, 'Erst Code eingeben', 'the field says what is missing');
assert.match(String(inp.style.boxShadow || ''), /2px/, 'the field is outlined');
assert.ok(inp.focused > 0, 'focused');
inp.fire('input');
assert.equal(inp.style.boxShadow, '', 'typing clears the outline');
assert.equal(inp.placeholder, 'Code eingeben');

const withCode = mkInput('1234');
tap(withCode);
assert.deepEqual(calls, [['alarm_control_panel', 'alarm_arm_away', { entity_id: 'alarm_control_panel.code', code: '1234' }]], 'with a code: armed');
console.log('alarm_code_fehlt: ok');
