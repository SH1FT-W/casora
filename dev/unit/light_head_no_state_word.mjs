// A lamp's popup shows no state word („An“/„Aus“) under its name: the dial says it (owner, 01.11.2026).
// Checks the head fallback in casora-core.js skips light entities.   node dev/unit/light_head_no_state_word.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const i = src.indexOf('_headFallback(again) {');
assert.ok(i > 0, 'head fallback found');
const body = src.slice(i, src.indexOf('_tileWord() {', i));
const skip = body.search(/indexOf\('light\.'\) === 0\) return;/);
const word = body.indexOf('window.casoraStateWord(h, cur)');
assert.ok(skip > 0 && skip < word, 'light entities return before the state word is put into the head');
console.log('ok light_head_no_state_word');
// The light popup's own status line (03-popups.js hero) is empty for one lamp in v3 as well.
const pop = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/03-popups.js', import.meta.url), 'utf8');
assert.ok(/if \(v3h && sc\.room && sc\.lights\.length === 1\) sub = '';/.test(pop), 'v3 single lamp: no status line in the light popup');
assert.ok(/return sub \? '<div class="lps-head"><div class="lps-s hui-line">'/.test(pop), 'no .hui-line without a status');
console.log('ok light_head_no_state_word (popup line)');
