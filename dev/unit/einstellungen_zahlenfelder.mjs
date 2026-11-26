// @deckt: custom_components/casora/panel/casora-panel-settings.js#_csSave,_csFocusBad,numBad,radiusOf
// Number fields in the settings (Prüfrunde u04-04, u04-06): the electricity price took „5“ without a word and its
// error stood at the top of the page, out of sight; the fuel radius cut 100 to 25 and dropped 0 silently. Now both say
// so at the field, saving refuses the value and brings the field into view.
//   node dev/unit/einstellungen_zahlenfelder.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { loadPanel } from './lib/testhaus.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;
const src = fs.readFileSync(ROOT + 'custom_components/casora/panel/casora-panel-settings.js', 'utf8');
const { P } = await loadPanel();
const fix = (s) => s.replace(/import\.meta\.url/g, '"http://x/casora-panel.js?v=0"').replace(/\bimport\((["'])/g, 'Promise.reject($1');
new Function(fix(src))();
await new Promise((r) => setImmediate(r));
assert.equal(typeof P._csSave, 'function', 'settings module loaded');

const studio = (cs) => {
  const me = Object.create(P);
  const field = { focused: 0, seen: 0, focus() { field.focused++; }, scrollIntoView() { field.seen++; } };
  me._cs = Object.assign({ S: {}, S0: '{}', O: {}, O0: '{}' }, cs);
  me._csDirty = () => true;
  me._csRepaint = () => {};
  me._hass = { callWS: () => { me.sent = true; return Promise.resolve({}); } };
  me.shadowRoot = { querySelector: (q) => (/aria-invalid="true"/.test(q) ? field : null) };
  me.field = field;
  return me;
};

// The price: refused, and the field comes into view with the focus.
const a = studio({ O: { price_kwh: 5 } });
assert.equal(await a._csSave(), false);
assert.match(a._cs.err, /0 and 2/);
assert.deepEqual([a.field.seen, a.field.focused], [1, 1], 'the wrong field is shown and focused');

// The fuel radius: 100 is not cut to 25 behind one's back, saving refuses it at the field.
const b = studio({ tk: {}, F: { radius: 100, cars: [] }, F0: JSON.stringify({ radius: 5, cars: [] }) });
assert.equal(await b._csSave(), false);
assert.match(b._cs.err, /1 and 25 km/);
assert.equal(b.sent, undefined, 'nothing sent');
assert.equal(b.field.focused, 1);
// Typing keeps what was typed (no silent clamp, 0 is not dropped): the save check above decides.
assert.doesNotMatch(src, /F\.radius = Math\.max\(1, Math\.min\(25/, 'the fuel radius is not clamped while typing');
assert.match(src, /numBad\(rr\.row, rin, radiusBad\(F\.radius, 25\)/, 'the fuel radius says so at the field');
assert.match(src, /numBad\(pr\.row, inp, priceBad\(O\.price_kwh\)/, 'the price says so at the field');
console.log('einstellungen_zahlenfelder: ok');
