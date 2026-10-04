// „Casora wurde aktualisiert“ (1.0.5): Vergleich Lade-Stempel ↔ casora/version und die Auswahl
// der Cache-Einträge, die „Neu laden“ löscht.   node dev/unit/neu_laden.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const core = read('custom_components/casora/scripts/casora-core.js');
const a = core.indexOf('// casora-update-check:start');
const b = core.indexOf('// casora-update-check:end');
assert.ok(a > 0 && b > a, 'Block gefunden');

globalThis.window = globalThis;
new Function(core.slice(a, b))();
const need = window.casoraUpdateNeeded;
const own = window.casoraIsOwnUrl;

// Gleicher Stand: kein Hinweis.
assert.equal(need('1759600000', { version: '1.0.5', stamp: '1759600000' }, null), false);
// Neuer Stand auf dem Server: Hinweis.
assert.equal(need('1759600000', { version: '1.0.5', stamp: '1759700000' }, null), true);
// Auch ein älterer (Rückstufung) ist ein anderer Code.
assert.equal(need('1759700000', { version: '1.0.4', stamp: '1759600000' }, null), true);
// Zahl statt Text vom Server.
assert.equal(need('1759600000', { stamp: 1759700000 }, null), true);
// Weggeklickt für genau diesen Stand: nicht noch einmal …
assert.equal(need('1759600000', { stamp: '1759700000' }, '1759700000'), false);
// … aber beim nächsten neuen Stand wieder.
assert.equal(need('1759600000', { stamp: '1759800000' }, '1759700000'), true);
// Kein Stempel (yaml-Modus), alte Integration ohne Befehl, Lader ohne ?v=: still.
assert.equal(need('1759600000', { version: '1.0.5', stamp: null }, null), false);
assert.equal(need('1759600000', null, null), false);
assert.equal(need('1759600000', {}, null), false);
assert.equal(need(undefined, { stamp: '1759700000' }, null), false);
assert.equal(need('', { stamp: '1759700000' }, null), false);
// Unsinn wird nicht als Update gewertet.
assert.equal(need('1.0.5.123', { stamp: '1759700000' }, null), false);
assert.equal(need('1759600000', { stamp: 'abc' }, null), false);

// Nur Casoras Adressen kommen aus dem Cache – HAs eigene bleiben.
for (const u of [
  'http://ha:8123/casora_scripts/casora-core.js?v=1759600000',
  'http://ha:8123/casora_scripts/local/02-geraete.js?v=1',
  '/casora_assets/fonts/hanken-grotesk.css',
  'https://ha.example/casora_panel/casora-studio.js?v=1.0.5.1',
  'http://ha/casora_images/x.jpg',
  'http://ha/local/casora/rooms/kueche.jpg',
]) assert.equal(own(u), true, u);
for (const u of [
  'http://ha:8123/frontend_latest/app.js',
  'http://ha:8123/static/icons/favicon.ico',
  'http://ha:8123/local/other/casora_x.js',
  'http://ha:8123/hacsfiles/button-card/button-card.js',
  'http://ha:8123/api/casora_scripts',
  'http://ha:8123/casora-studio',
  'http://ha:8123/lovelace/casora_scripts/',
  'not a url ::',
]) assert.equal(own(u), false, u);

console.log('neu_laden: ok');
