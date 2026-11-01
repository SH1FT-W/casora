// Detail round #22: the phone's climate popup (Home badge) said a small „21°“ in the dial – now the word of the
// temperature row („Angenehm“) and the readings as facts.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/35-phone-hub.js', import.meta.url), 'utf8');
const a = src.indexOf("    if (cat === 'climate' && /^[\\d−-]/.test(String(o.text).trim())) {");
assert.ok(a > 0, 'climate block');
const b = src.indexOf("    var lv = rows.map(", a);
const run = (text, rows) => { const o = { text }; new Function('cat', 'o', 'rows', src.slice(a, b))('climate', o, rows); return o; };
const r = run('21°', [{ title: 'Temperatur', sub: 'Angenehm · 21°' }, { title: 'Luftfeuchtigkeit', sub: 'Gut · 55 %' }, { title: 'Jalousien', sub: '6 geöffnet' }]);
assert.equal(r.text, 'Angenehm');
assert.deepEqual(r.facts, [{ label: 'Temperatur', value: '21°' }, { label: 'Luftfeuchtigkeit', value: '55 %' }]);
assert.equal(run('Zu warm', [{ title: 'Temperatur', sub: 'Warm · 26°' }]).text, 'Zu warm', 'a word stays');
console.log('climate_hub_word: ok');
