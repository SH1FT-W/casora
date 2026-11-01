// The status line (UI.line in the field „hero“) is lifted into the popup's head only when it stands at the top of the
// content (_findHeadLine: within 90 px). A layout whose `top` leaves „hero“ out puts it into a column below the stage:
// the line stood twice – in the head (the frame's „Seit 14:42“) and under the alarm's pill (final review, 01.11.2026).
import fs from 'node:fs';
import assert from 'node:assert/strict';

const T = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const strings = (o, out = []) => {
  if (typeof o === 'string') out.push(o);
  else if (o && typeof o === 'object') Object.values(o).forEach((v) => strings(v, out));
  return out;
};
let n = 0;
for (const [name, tpl] of Object.entries(T)) {
  for (const s of strings(tpl)) {
    if (!/add\('hero'/.test(s)) continue;
    for (const m of s.matchAll(/_casoraStd\(uiCard,([^\n]*)/g)) {
      for (const t of m[1].matchAll(/top: \[([^\]]*)\]/g)) {
        n++;
        assert.ok(/'hero'/.test(t[1]), `${name}: layout top [${t[1]}] leaves the status line „hero“ below the stage`);
      }
    }
  }
}
assert.ok(n >= 4, 'layouts found');
console.log(`popup_v3_headline_top: ok (${n} layouts)`);
