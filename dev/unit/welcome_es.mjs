// "New in Casora" / welcome sheet: Spanish has every text English has, and Spanish HA shows it.
//   node dev/unit/welcome_es.mjs
// At a release only the texts change: fill TEXT.es for every new WHATS_NEW key next to de/en.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel-welcome.js', import.meta.url), 'utf8');

// The TEXT table on its own.
const start = src.indexOf('const TEXT = {');
const end = src.indexOf('\n  };', start);
assert.ok(start > 0 && end > start, 'TEXT table found');
const TEXT = new Function(src.slice(start, end + 5) + '\nreturn TEXT;')();
const keys = (o) => Object.keys(o).sort();
assert.deepEqual(keys(TEXT.es), keys(TEXT.en), 'TEXT.es has exactly the keys of TEXT.en');
assert.deepEqual(keys(TEXT.de), keys(TEXT.en), 'TEXT.de has exactly the keys of TEXT.en');
for (const [k, v] of Object.entries(TEXT.es)) {
  assert.ok(typeof v === 'string' && v.trim(), 'es.' + k + ' filled');
  // A copied English or German text is not a translation (the title keeps only "Casora {version}").
  if (!/^(continue)$/.test(k)) assert.notEqual(v, TEXT.en[k], 'es.' + k + ' differs from English');
  assert.notEqual(v, TEXT.de[k], 'es.' + k + ' differs from German');
  assert.ok(!/[äöÄÖß]/.test(v), 'es.' + k + ' without German letters');
}
assert.ok(TEXT.es.whatsNewTitle.includes('{version}'), 'es title keeps {version}');

// Every WHATS_NEW / WELCOME key is in TEXT.es.
const listKeys = [...src.matchAll(/\["mdi:[^"]+", "(\w+)", "(\w+)"\]/g)].flatMap((m) => [m[1], m[2]]);
assert.ok(listKeys.length >= 6, 'WELCOME and WHATS_NEW entries found');
for (const k of listKeys) assert.ok(TEXT.es[k], 'TEXT.es.' + k + ' for the list entry');

// Run the module: Spanish HA → Spanish, languages without a table → English.
const win = {};
const storage = { getItem: () => '26.10.99', setItem() {} };
const run = new Function('window', 'document', 'localStorage', 'setTimeout',
  src.replace(/import\.meta\.url/g, JSON.stringify('http://x/casora-panel-welcome.js?v=26.10.99.123')));
run(win, { querySelector: () => null, addEventListener() {}, removeEventListener() {} }, storage, () => 0);
assert.equal(typeof win.casoraWhatsNew, 'function', 'casoraWhatsNew defined');
const es = win.casoraWhatsNew('es');
assert.equal(es.title, 'Novedades de Casora 26.10.99');
assert.deepEqual(win.casoraWhatsNew('es-ES').items, es.items, 'es-ES uses Spanish');
const en = win.casoraWhatsNew('en');
assert.equal(es.items.length, en.items.length);
es.items.forEach(([t, x], i) => {
  assert.ok(t && x, 'item ' + i + ' filled');
  assert.notEqual(t, en.items[i][0], 'item ' + i + ' Spanish title');
});
assert.deepEqual(win.casoraWhatsNew('sv').items, en.items, 'languages without a table: English');
console.log('ok welcome_es');
