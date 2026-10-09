// Jalousien-Popup (07.10.2026): Rollos mit Geräteklasse shutter standen unter „Fensterläden“,
// obwohl Kachel und Titel „Jalousie“ sagen. Erwartet: blind, shade, shutter, window und Rollos
// ohne Klasse sind eine Gruppe „Jalousien“ mit den Kachel-Symbolen; Vorhang, Markise, Tür,
// Garage und Tor bleiben eigene Gruppen. 1.2.1: Kachel/Badge/Popup-Ring mit demselben Symbol wie die Zeilen.
//   node dev/unit/jalousien_gruppe.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const i = core.indexOf('  var BLIND = {');
const END = "'/casora_assets/icons/' + name + '.svg';\n  };";
const j = core.indexOf(END, i) + END.length;
assert.ok(i > 0 && j > i, 'casoraCoverKind nicht gefunden');
const w = { casoraIconUrl: (n) => '/casora_assets/icons/' + n + '.svg' };
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

// 1.2.1: Kachel, Badge und Popup-Ring zeigen dasselbe Symbol wie die Popup-Zeilen
// (offen bei open/opening/stopping, sonst zu; vorher cover_open1/cover_closed1/cover_60).
const u = (state, attrs, vars, id) => w.casoraCoverIconUrl({ entity_id: id || 'cover.x', state, attributes: attrs || {} }, vars);
const I = (n) => '/casora_assets/icons/' + n + '.svg';
assert.equal(u('open', { current_position: 100 }), I('cover_open'), 'offen');
assert.equal(u('open', { current_position: 50 }), I('cover_open'), 'teilweise offen wie die Zeile');
assert.equal(u('opening'), I('cover_open'));
assert.equal(u('stopping'), I('cover_open'));
assert.equal(u('closing', { current_position: 40 }), I('cover_closed'), 'schließt wie die Zeile');
assert.equal(u('closed', { current_position: 0 }), I('cover_closed'), 'zu');
assert.equal(u('unavailable'), I('cover_closed'));
assert.equal(u('open', { device_class: 'garage' }), I('door-open'), 'Garage bleibt Tür');
assert.equal(u('closed', { device_class: 'curtain' }), I('curtain-closed'), 'Vorhang bleibt Vorhang');
assert.equal(u('open', { device_class: 'awning' }), I('window-shade-open'), 'Markise');
// Eigenes Symbol aus dem Studio geht vor (je Zustand), „Automatisch“ und mdi: nicht.
assert.equal(u('open', {}, { icon_open: 'curtain-open', icon_closed: 'lock' }), I('curtain-open'));
assert.equal(u('closed', {}, { icon_open: 'curtain-open', icon_closed: 'lock' }), I('lock'));
assert.equal(u('closed', {}, { icon_open: 'curtain-open' }), I('cover_closed'), 'nur Offen-Symbol eigen');
assert.equal(u('open', {}, { icon_open: '/local/mein.svg' }), '/local/mein.svg');
assert.equal(u('open', {}, { icon_open: 'Default' }), I('cover_open'));
assert.equal(u('open', {}, { icon_open: 'mdi:blinds' }), I('cover_open'));

// Vorlagen: Kachel und Badge fragen casoraCoverIconUrl, die schmalen Lamellen sind weg.
const tpl = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
for (const t of ['casora_cover', 'casora_badge_cover']) {
  const s = JSON.stringify(tpl[t]);
  assert.ok(s.includes('casoraCoverIconUrl(entity, variables)'), t + ' nutzt casoraCoverIconUrl');
  assert.ok(!/cover_(open1|closed1|60)/.test(s), t + ' ohne cover_open1/cover_closed1/cover_60');
}

// Englisch: die Überschrift heißt „Blinds“.
const en = JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/translations/dashboard/phrases/en.json', import.meta.url), 'utf8'));
assert.equal(en.exact.Jalousien, 'Blinds');
console.log('jalousien_gruppe: ok');
