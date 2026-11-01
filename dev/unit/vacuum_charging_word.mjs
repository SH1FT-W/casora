// Vacuum stage (owner, 01.11.2026): „Lädt“ in the wheel and „Akku 100 % · lädt…“ under it – the word twice. The battery
// line says „lädt“ only when the state does not say it already.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/02-devices.js', import.meta.url), 'utf8');
assert.ok(/var chgSaid = \/\^lädt\/i\.test\(String\(s\.label \|\| ''\)\);/.test(src), 'state word checked');
assert.ok(/on\(c\.charging\) && !chgSaid \? ' · ' \+ trV\('lädt'\)/.test(src), 'no second „lädt“');
const line = (label, charging) => ['Akku 100 %'].map((x) => x + (charging && !/^lädt/i.test(label) ? ' · lädt' : ''))[0];
assert.equal(line('Lädt', true), 'Akku 100 %');
assert.equal(line('Angedockt', true), 'Akku 100 % · lädt');
console.log('vacuum_charging_word: ok');
