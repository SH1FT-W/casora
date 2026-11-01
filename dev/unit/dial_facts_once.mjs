// The S7 dial never says a count twice (final review, 01.11.2026): the lock group read „2 entriegelt · 1 klemmt“ as the
// sentence and „2 Entriegelt · 1 Klemmt“ as facts under it, the doors „1 gekippt“ twice, the people „1 unterwegs“ twice.
// UI.stage drops a fact that is a part of the sentence (any case); the next fact takes its place.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const a = core.indexOf('      var said = String(o.text');
assert.ok(a > 0, 'S7 dial: sentence parts');
const b = core.indexOf('.slice(0, 2);', a);
const src = core.slice(a, b + '.slice(0, 2);'.length);
const run = (o) => new Function('o', src + '\nreturn facts;')(o);

assert.deepEqual(run({ text: '2 entriegelt · 1 klemmt · 1 offline', facts: [{ label: 'Verriegelt', value: '1' }, { label: 'Entriegelt', value: '2' },
  { label: 'Klemmt', value: '1' }, { label: 'Offline', value: '1' }, { label: 'Zuletzt', value: 'vor 3 Min.' }] }).map((f) => f.label),
  ['Verriegelt', 'Zuletzt'], 'locks: only what the sentence does not say');
assert.deepEqual(run({ text: '1 gekippt', facts: [{ label: 'gekippt', value: '1' }, { label: 'geschlossen', value: '1' }] }).map((f) => f.label),
  ['geschlossen'], 'doors');
assert.deepEqual(run({ text: 'Alles zu', facts: [{ label: 'geschlossen', value: '4' }, null, { label: 'Zuletzt', value: 'vor 1 Std.' }] }).map((f) => f.label),
  ['geschlossen', 'Zuletzt'], 'nothing said twice: all facts stay (at most two)');
assert.deepEqual(run({ text: null, facts: [{ label: 'Seit', value: '14:42' }] }).length, 1, 'no sentence');
console.log('dial_facts_once: ok');
