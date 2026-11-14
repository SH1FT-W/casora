// V16 (optimisation round 14.11.2026, owner's go): moons with long effect names a lamp brings („Thunderstorm“,
// „Daylight-simulation“) were set at 9–10 px to fit. Expected: such a moon shows a short word (its first word, cut to
// 8 letters + „…“ if that is long too) at the normal 11 px; the full name stays tooltip and aria-label. Only moons that ask
// for it (it.fit: the aquarium light's effects and profiles), curated words („Beschatten“) keep the size rule.
//   node dev/unit/moon_fit_word.mjs
// @deckt: custom_components/casora/scripts/casora-core.js#moonFitWord,moonHtml, custom_components/casora/scripts/local/02-devices.js#_casoraAqMoons
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const core = read('custom_components/casora/scripts/casora-core.js');
const dev = read('custom_components/casora/scripts/local/02-devices.js');
const dRound = (x) => Math.round(x * 10) / 10;
const fn = (name) => { const m = core.match(new RegExp('function ' + name + '\\((text|it, deg, cls)\\) \\{[\\s\\S]*?\\n  \\}')); assert.ok(m, name + ' found'); return m[0]; };
const moonFitWord = new Function(fn('moonFitWord') + '\nreturn moonFitWord;')();
const moonWordFit = new Function('dRound', fn('moonWordFit') + '\nreturn moonWordFit;')(dRound);
const moonWordCls = new Function(fn('moonWordCls') + '\nreturn moonWordCls;')();

// Short names stay as they are.
for (const t of ['Lightning', 'Crescent moon', 'Sun and lightning', 'Partly cloudy', 'Mond']) assert.equal(moonFitWord(t), null, t);
// Long ones get a short word at 11 px (no smaller class, no inline size).
const cases = { Thunderstorm: 'Thunders…', 'Daylight-simulation': 'Daylight', 'Sun and Thunderstorm': 'Sun',
  'Sonnenaufgangssimulation': 'Sonnenau…', 'Mondlicht Wellenbewegung': 'Mondlicht' };
for (const [t, want] of Object.entries(cases)) {
  const s = moonFitWord(t);
  assert.equal(s, want, t);
  assert.equal(moonWordFit(s), '', t + ': no smaller size for the short word');
  assert.equal(moonWordCls(s), '', t + ': no lw/xw class');
}

// The moon uses it for it.fit and keeps the full name as tooltip/aria-label.
const html = fn('moonHtml');
assert.ok(/it\.fit \? moonFitWord\(base\)/.test(html), 'moonHtml: it.fit → short word');
assert.ok(/short \? ' title="' \+ esc\(it\.text\)/.test(html), 'moonHtml: full name as tooltip when shortened');
assert.ok(/aria-label="' \+ esc\(it\.text/.test(html), 'moonHtml: full name for screen readers');
// The aquarium light's effect and profile moons ask for it.
const aq = dev.slice(dev.indexOf('window._casoraAqMoons = function'), dev.indexOf('window._casoraAqCtl = function'));
assert.equal((aq.match(/fit: true/g) || []).length, 2, 'aquarium moons: effects and profiles carry fit');
console.log('moon_fit_word: ok');
