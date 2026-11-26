// @deckt: custom_components/casora/panel/casora-panel.js#SECTIONS,custom_components/casora/translations/panel/de.json
// Settings texts from the Prüfrunde 26.11.2026: the clock's „Suffix“ was a bare technical word without a note (u03-07),
// the German Studio wrote „Wand-Tablet“ and „Wandtablet“ side by side (u03-11, the word list says Wandtablet), and the
// bell's Home Assistant switch explained itself with the service name persistent_notification.create (u04-12).
//   node dev/unit/einstellungen_texte.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const panel = read('custom_components/casora/panel/casora-panel.js');
const de = JSON.parse(read('custom_components/casora/translations/panel/de.json'));

// u03-07: the field says what goes there and has a note with an example.
const suffix = panel.split('\n').find((l) => l.includes('"time_suffix"') && l.includes('T('));
assert.ok(suffix, 'the clock\'s text field exists');
assert.doesNotMatch(suffix, /T\("time_suffix", "Suffix"\)/, 'not the bare word „Suffix“');
assert.match(suffix, /hint: "[^"]+"/, 'a note under the field');

// u03-11: one spelling in the German Studio.
const texts = [...Object.values(de.exact || {}), ...(de.patterns || []).map((p) => p[1])].join('\n');
assert.doesNotMatch(texts, /Wand-Tablet/, 'Wandtablet, as in the word list');
assert.match(read('docs/handbuch/wortliste.md'), /\| Wandtablet \|/);

// u04-12: no service names in the hints people read.
const hints = [...panel.matchAll(/hint: "((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
assert.ok(hints.length > 50);
assert.deepEqual(hints.filter((h) => /persistent_notification|\w+\.\w+_\w+\(/.test(h)), [], 'hints in plain words');
console.log('einstellungen_texte: ok');
