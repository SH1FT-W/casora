// Detail round #3 (01.11.2026): „Seit 09:37“ in the head was HA's start (last_changed after a restart), not a change.
// The frame's since text leaves out a time a fifth of all states share (the start) and says „Vor 11 Min.“ under an
// hour (§3); the head drops its part when the stage already says a time.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const a = core.indexOf('    _sinceText(cur) {');
const b = core.indexOf('\n    }\n', a);
assert.ok(a > 0 && b > a, '_sinceText');
const body = core.slice(a + '    _sinceText(cur) {'.length, b);
const now = Date.now(), iso = (ms) => new Date(ms).toISOString();
const start = now - 3 * 3600000;
const states = {};
for (let i = 0; i < 40; i++) states['sensor.s' + i] = { last_changed: iso(start + 1000 * (i % 30)) };
for (let i = 0; i < 10; i++) states['sensor.t' + i] = { last_changed: iso(now - (i + 2) * 3600000 - 7 * 60000) };
globalThis.window = {};
globalThis.document = { querySelector: () => ({ hass: { states } }) };
const CasoraPopup = {};
const since = new Function('CasoraPopup', 'return function (cur) {' + body + '\n};')(CasoraPopup);
assert.equal(since({ last_changed: iso(start + 5000) }), '', 'the restart minute: no „Seit“');
assert.match(since({ last_changed: iso(now - 11 * 60000) }), /^Vor 11 Min\.$/, 'under an hour: „Vor 11 Min.“');
assert.match(since({ last_changed: iso(now - 5 * 3600000) }), /^Seit /, 'a real change hours ago: „Seit …“');
assert.match(core, /\(seit\|zuletzt\|vor \\d\|gerade eben\)\/i\.test\(stageAll\)/, 'the head drops its part when the stage says a time');
// #4/#5: the head drops a later part that is the stage's number, and a measurement of the tile's entity is no state word.
assert.match(core, /norm\(sp\.textContent\) !== norm\(stageVal\)/, 'a head part equal to the stage value goes');
assert.match(core, /var meas0 = \(dom0 === 'sensor'/, 'a measurement is not shown as the head word');
console.log('head_since_start: ok');
