// Jalousien-Popup (07.10.2026): Rollos mit Geräteklasse shutter standen unter „Fensterläden“,
// obwohl Kachel und Titel „Jalousie“ sagen. Erwartet: blind, shade, shutter, window und Rollos
// ohne Klasse sind eine Gruppe „Jalousien“ mit den Kachel-Symbolen; Vorhang, Markise, Tür,
// Garage und Tor bleiben eigene Gruppen.   node dev/unit/jalousien_gruppe.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const i = core.indexOf('  var BLIND = {');
const j = core.indexOf('return COVER_KINDS.blind;\n  };', i) + 'return COVER_KINDS.blind;\n  };'.length;
assert.ok(i > 0 && j > i, 'casoraCoverKind nicht gefunden');
const w = {};
new Function('window', core.slice(i, j))(w);
const k = (dc, id) => w.casoraCoverKind(dc, id || 'cover.x');

for (const dc of ['blind', 'shade', 'shutter', 'window', null, '']) {
  assert.equal(k(dc).key, 'blind', 'Klasse ' + dc);
  assert.equal(k(dc).label, 'Jalousien', 'Überschrift für ' + dc);
  assert.equal(k(dc).open, 'cover_open', 'Kachel-Symbol für ' + dc);
}
assert.equal(k(null, 'cover.rollladen_shutter_bad').key, 'blind', 'Name mit shutter');
assert.equal(k('curtain').label, 'Vorhänge');
assert.equal(k('awning').label, 'Markisen');
assert.equal(k('door').label, 'Türen');
assert.equal(k('garage').label, 'Garage');
assert.equal(k('gate').label, 'Tore');
assert.equal(k(null, 'cover.garage_tor').key, 'garage', 'Garage am Namen');

// Englisch: die Überschrift heißt „Blinds“.
const en = JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/translations/dashboard/phrases/en.json', import.meta.url), 'utf8'));
assert.equal(en.exact.Jalousien, 'Blinds');
console.log('jalousien_gruppe: ok');
