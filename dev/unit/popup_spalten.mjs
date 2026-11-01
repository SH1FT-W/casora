// Weather popup v3 columns (owner 01.11.2026, popup-richtlinien-v3 §7.1), static: left the dial and under it the one
// Verlauf, right „7 Tage“, then „Nächste Stunden“, then the details – before, the next hours sat under the dial and the
// Verlauf at the end of the right column (455 px left against 1211 px right). On the phone the order stays: stage,
// next hours, 7 days, Verlauf, details. The geometry is measured with a test HA: dev/qa/regress/r452_popup_spalten.mjs.
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
console.log('popup_spalten: ok');
