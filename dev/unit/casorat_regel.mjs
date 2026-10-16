// Übersetzer heißt window.casoraTr (casora-i18n.js) – ein window.casoraT gibt es nicht. Module, die
// `window.casoraT ? window.casoraT(x) : x` schrieben, zeigten Rückfragen, Hinweise und Live-Texte
// (Person, Mäher, Updates, Ziele, Kaffee) auf Englisch weiter deutsch.  node dev/unit/casorat_regel.mjs
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = new URL('../../custom_components/casora/', import.meta.url).pathname;
// Frigate-Karte (23-frigate.js) zieht in ihrer eigenen Fix-Runde nach – danach Eintrag löschen.
const LATER = new Set(['scripts/local/23-frigate.js']);
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.js$/.test(e.name)) files.push(p);
  }
})(root);
assert.ok(files.length > 20, 'Skripte gefunden');
const bad = [];
for (const f of files) {
  const rel = path.relative(root, f);
  if (LATER.has(rel)) continue;
  fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    // window.casoraT / casoraT( – aber nicht casoraTr, _casoraT (Kern-Schlüssel), casoraTextEm …
    if (/(^|[^\w$])casoraT(?![\w$])/.test(line)) bad.push(rel + ':' + (i + 1) + ': ' + line.trim().slice(0, 120));
  });
}
assert.deepEqual(bad, [], 'window.casoraT gibt es nicht – window.casoraTr nehmen:\n' + bad.join('\n'));

// Gegenprobe: die Regel greift.
assert.ok(/(^|[^\w$])casoraT(?![\w$])/.test('var T = function (x) { return window.casoraT ? window.casoraT(x) : x; };'));
assert.ok(!/(^|[^\w$])casoraT(?![\w$])/.test('window.casoraTr(x); window._casoraT(k, en); casoraTextEm(t)'));
console.log('casorat_regel: ok (' + files.length + ' Skripte)');
