// Moons (richtlinien §4.8, owner 01.11.2026): never a hyphen or a break inside a word („Alle aktualisie-ren“, „Saugen
// & wi-schen“). Lines break at spaces only; a long word is set smaller to fit the moon, or the item brings a short word.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
// Every CSS rule for the moon's word: no automatic hyphenation, no break inside words.
const rules = core.match(/'\.hui-moon[^']*span\{[^']*'/g) || [];
assert.ok(rules.length >= 1, 'moon word rule found');
for (const r of rules) {
  assert.ok(!/hyphens:auto/.test(r), 'no hyphens:auto: ' + r);
  assert.ok(!/overflow-wrap:break-word|word-break:break-all/.test(r), 'no break inside words: ' + r);
}
assert.ok(/'\.hui-moon span\{[^']*'\s*\+\s*'overflow-wrap:normal;word-break:keep-all;hyphens:manual;/.test(core), 'moon word: keep-all, manual hyphens');

// moonWordFit: the size follows the longest word.
const dRound = (x) => Math.round(x * 10) / 10;
const fnSrc = core.match(/function moonWordFit\(text\) \{[\s\S]*?\n  \}/)[0];
const moonWordFit = new Function('dRound', fnSrc + '\nreturn moonWordFit;')(dRound);
assert.equal(moonWordFit('Saugen'), '', 'short words keep 11 px');
for (const w of ['Wischen & Saugen', 'Abwesenheit', 'Aktualisieren', 'Staubsaugermodus']) {
  const st = moonWordFit(w);
  const lw = Math.max(...w.split(/\s+/).map((x) => x.length));
  if (lw < 10) { assert.equal(st, ''); continue; }
  const m = /calc\(\(clamp\(62px, 20cqw, 76px\) - 8px\) \/ ([\d.]+)\)/.exec(st);
  assert.ok(m, w + ': size from the moon width');
  // At the smallest moon (62 px) the longest word fits its line (≈ .56 em per bold letter) unless the 7 px floor holds.
  const fs = Math.max(7, Math.min(lw >= 13 ? 9 : 10, (62 - 8) / Number(m[1])));
  assert.ok(fs * lw * 0.56 <= 54.5 || fs === 7, `${w}: fits (${fs.toFixed(1)} px)`);
}
// The span carries it; the action keeps its short word (act.short) as before.
assert.ok(/'<span' \+ moonWordFit\(shown\) \+ '>'/.test(core), 'moon span uses moonWordFit');
assert.ok(/short: act\.short \|\| null/.test(core), 'act.short still supported');
console.log('moon_no_hyphen: ok');
