// B-JS-06: Assist per Sprache – kommt nach dem Stoppen der Aufnahme keine Antwort, gibt ein
// Zeitlimit (wie beim Text-Weg) die Eingabe wieder frei.
//   node dev/unit/assist_sprache_zeitlimit.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/01-basis.js', import.meta.url), 'utf8');
const m = src.match(/      stopRec: (function \(\) \{[\s\S]*?\n      \}),\n/);
assert.ok(m, 'stopRec gefunden');
const timers = [];
const A = { msgs: [], busy: false, sendEnd() {}, cleanupRec() {}, paint() {} };
const stopRec = new Function('A', 'setTimeout', 'return ' + m[1])(A, (fn, ms) => timers.push([fn, ms]));
const r = { done: false, unsub: () => { r.unsubbed = true; } };
A.rec = r;
stopRec();
assert.equal(A.busy, true, 'nach dem Stoppen wartet die Eingabe');
assert.ok(timers.length === 1 && timers[0][1] <= 60000, 'Zeitlimit gesetzt');
timers[0][0]();
assert.equal(A.busy, false, 'nach dem Zeitlimit frei');
assert.ok(A.msgs.some((x) => x.err && /Zeitüberschreitung/.test(x.t)) && r.unsubbed, 'Meldung + abgemeldet');
// Kam die Antwort schon, tut das Zeitlimit nichts.
const r2 = { done: false }; A.rec = r2; A.msgs = []; timers.length = 0;
stopRec(); r2.done = true; A.busy = false; timers[0][0]();
assert.equal(A.msgs.length, 0, 'beantwortet: keine Meldung');
console.log('ok assist_sprache_zeitlimit');
