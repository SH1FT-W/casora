// @deckt: custom_components/casora/scripts/local/03-popups.js#R.next,R.heroHtml
// Recipe tile (03-popups.js, _casoraRecipe): the meal plan's next seven days are counted by the calendar. In the
// week the clocks go back (25.10.) a dish six days ahead lay 145 hours away and was dropped as „more than six days“.
//   node dev/unit/rezept_woche_umstellung.mjs
process.env.TZ = 'Europe/Berlin';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/03-popups.js', import.meta.url), 'utf8');
const pick = (re) => { const m = re.exec(src); assert.ok(m, 'not found: ' + re); return m[0]; };
const code = pick(/  var dayStart = function \(d\) \{[^\n]*\n/) + pick(/  R\.next = function \(states\) \{[\s\S]*?\n  \};\n/);
const NOW = new Date(2026, 9, 20, 18, 0).getTime();
class FakeDate extends Date { constructor(...a) { if (a.length) super(...a); else super(NOW); } static now() { return NOW; } }
const R = new Function('Date', 'cal', 'parseMin', 'var R = {};\n' + code + 'return R;')(FakeDate, () => 'calendar.plan', () => null);
const plan = (when) => ({ 'calendar.plan': { state: 'off', attributes: { message: 'Suppe', start_time: when } } });

// Tuesday 20.10. → Monday 26.10. is six days ahead, across the clock change: still in the week.
assert.ok(R.next(plan('2026-10-26 12:00:00')), 'six days ahead across the clock change: in the plan');
assert.equal(R.next(plan('2026-10-27 12:00:00')), null, 'seven days ahead: not');
assert.ok(R.next(plan('2026-10-21 12:00:00')), 'tomorrow');
console.log('ok rezept_woche_umstellung');
