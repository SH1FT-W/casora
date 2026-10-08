// B-ISS-11 (#11): relative Zeit nach Kalendertagen – vor 36 Stunden ist „Gestern“, nicht „vor 2 Tagen“.
// Dauer („seit …“): unter 1 Std. Minuten statt „0 Std.“, 23,5 Std. nicht „24 Std.“.
//   node dev/unit/relative_zeit.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const read = (p) => fs.readFileSync(new URL('../../custom_components/casora/scripts/' + p, import.meta.url), 'utf8');
const NOW = new Date(2026, 9, 6, 21, 0, 0).getTime();   // heute 21:00 Ortszeit
const RealDate = Date;
class FakeDate extends RealDate { constructor(...a) { super(...(a.length ? a : [NOW])); } static now() { return NOW; } static parse(x) { return RealDate.parse(x); } }
const H = 3600000;
const pick = (src, re) => { const m = src.match(re); assert.ok(m, String(re)); return m[0]; };

const core = new Function('Date', pick(read('casora-core.js'), /  function ago\(ms\) \{[\s\S]*?\n  \}\n/) + ' return ago;')(FakeDate);
assert.equal(core(NOW - 36 * H), 'gestern', 'Statusmeldung: gestern 9 Uhr → gestern (D13, 1.2: klein wie mitten im Satz)');
assert.equal(core(NOW - 5 * H), 'vor 5 Std.');
assert.equal(core(NOW - 60 * H), 'vor 2 Tagen', 'vorgestern 9 Uhr → vor 2 Tagen');

const dev = new Function('Date', pick(read('local/02-geraete.js'), /  var ago = function \(d\) \{[\s\S]*?\n  \};/) + ' return ago;')(FakeDate);
assert.equal(dev(new RealDate(NOW - 36 * H)), 'gestern', 'Geräte-Popup: 36 h → gestern');
assert.equal(dev(new RealDate(NOW - 50 * H)), 'vor 2 Tagen');

const wm = read('local/05-weich-mehr.js');
const ago = new Function('Date', pick(wm, /  var ago = function \(ts\) \{[\s\S]*?\n  \};/) + ' return ago;')(FakeDate);
assert.equal(ago(new RealDate(NOW - 36 * H).toISOString()), 'vor 1 T.', 'Weich: 36 h → vor 1 T.');
const since = new Function('Date', pick(wm, /  var since = function \(ts\) \{[\s\S]*?\n  \};/) + ' return since;')(FakeDate);
assert.equal(since(new RealDate(NOW - 20 * 60000).toISOString()), '20 Min.', 'unter 1 Std.: Minuten');
assert.equal(since(new RealDate(NOW - 23.6 * H).toISOString()), '1 Tag', '23,6 Std. → 1 Tag statt 24 Std.');
assert.equal(since(new RealDate(NOW - 36 * H).toISOString()), '1 Tag', 'Dauer 36 Std. → 1 Tag');
assert.equal(since(new RealDate(NOW - 5 * H).toISOString()), '5 Std.');
console.log('ok relative_zeit');

// Alle übrigen „vor X T.“/„vor X Tagen“ der Module rechnen über window.casoraDaysAgo (Kalendertage).
{
  const core = read('casora-core.js');
  const def = pick(core, /  window\.casoraDaysAgo = function \(m\) \{[\s\S]*?\n  \};/);
  const w = {};
  new Function('window', 'Date', def)(w, FakeDate);
  assert.equal(w.casoraDaysAgo(36 * 60), 1, '36 Std. → 1 Tag (gestern)');
  assert.equal(w.casoraDaysAgo(24 * 60), 1);
  assert.equal(w.casoraDaysAgo(60 * 60), 2, '60 Std. (vorgestern 9 Uhr) → 2');
  for (const f of ['04-navigation.js', '02-geraete.js', '03-popups.js', '05-standard-medien.js', '08-weich-szenen.js', '08-weich-kompakt.js']) {
    const s = read('local/' + f);
    assert.ok(!/[^:] Math\.round\(m \/ 1440\)/.test(s.replace(/window\.casoraDaysAgo \? window\.casoraDaysAgo\(m\) : Math\.round\(m \/ 1440\)/g, '')), f + ': noch 24-h-Rundung');
  }
}
console.log('ok tage_ueberall');
