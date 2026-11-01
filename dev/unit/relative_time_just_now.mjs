// Owner, 01.11.2026: a relative time under one minute is „gerade eben“ (translated: „just now“ …) everywhere; from one
// minute on it stays „vor 2 Min.“ … Rounding to minutes had said „vor 1 Min.“ from 30 s on, the camera „vor 40 s“.
//   node dev/unit/relative_time_just_now.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const rd = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const core = rd('custom_components/casora/scripts/casora-core.js');
const a = core.indexOf('  window.casoraAgoMin = function');
assert.ok(a > 0, 'shared helper casoraAgoMin');
const window = {};
new Function('window', core.slice(a, core.indexOf('  };', a) + 4))(window);
assert.equal(window.casoraAgoMin(45000), 0, '45 s: under a minute');
assert.equal(window.casoraAgoMin(59999), 0);
assert.equal(window.casoraAgoMin(60000), 1);
assert.equal(window.casoraAgoMin(150000), 3, 'from one minute on rounded as before');
assert.equal(window.casoraAgoMin(-5000), 0, 'clock skew');

// Camera still age.
const c = core.indexOf('  window.casoraCamFresh = function');
new Function('window', core.slice(c, core.indexOf('\n  };', core.indexOf('window.casoraCamAge', c)) + 5))(window);
assert.equal(window.casoraCamAge(40000, 5), 'gerade eben');
assert.equal(window.casoraCamAge(125000, 5), 'vor 2 Min.');

// The person popup's „Zuletzt“ (15-person.js), a module function with its own now.
const ctx = { window: Object.assign({}, window), document: { addEventListener() {}, querySelector: () => null } };
vm.runInNewContext(rd('custom_components/casora/scripts/local/15-person.js'), ctx);
const now = Date.UTC(2026, 10, 1, 12, 0, 0);
assert.equal(ctx.window._casoraPerson.ago(now - 45000, now), 'gerade eben', '45 s ago');
assert.equal(ctx.window._casoraPerson.ago(now - 125000, now), 'vor 2 Min.');

// A popup line in 03-popups.js (vacuum, car, …): the shared shape „m < 1 ? 'gerade eben'“.
const pop = rd('custom_components/casora/scripts/local/03-popups.js');
const i = pop.indexOf("return m < 1 ? 'gerade eben'");
const j = pop.lastIndexOf('var m = ', i);
const line = pop.slice(j, pop.indexOf('\n', i));
const ago = (ms) => new Function('window', 't', line + '\n')(window, Date.now() - ms);
assert.equal(ago(45000), 'gerade eben');
assert.equal(ago(125000), 'vor 2 Min.');

// No relative time rounds to minutes on its own any more: every Math.round(… / 60000) in front of a „gerade eben“
// goes through casoraAgoMin (scripts and templates).
const files = fs.readdirSync(new URL('../../custom_components/casora/scripts/local/', import.meta.url))
  .map((f) => rd('custom_components/casora/scripts/local/' + f)).concat([core, rd('dashboards/casora/button_card_templates.json')]);
let bare = 0;
for (const f of files) {
  for (const m of f.matchAll(/Math\.round\(\(\(?(?:now \|\| )?Date\.now\(\)\)? - [\w.()]+\) \/ 60000\)/g)) {
    const before = f.slice(Math.max(0, m.index - 80), m.index);
    if (f.slice(m.index, m.index + 450).includes('gerade eben') && !(before.includes('window.casoraAgoMin(') && /\) : (Math\.max\(0, )?$/.test(before))) bare++;
  }
}
assert.equal(bare, 0, 'every minute count before „gerade eben“ uses casoraAgoMin');
for (const lang of ['en', 'es', 'fr', 'it', 'nl', 'pl', 'pt']) {
  const ex = JSON.parse(rd('custom_components/casora/translations/dashboard/phrases/' + lang + '.json')).exact;
  assert.ok(ex['gerade eben'] && ex['Gerade eben'], lang + ': „gerade eben“ translated');
}
console.log('relative_time_just_now: ok');
