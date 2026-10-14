// Community (1.5): Kartenwünsche ohne Persönliches, Community-Karten nur nach Hinzufügen in der
// Kachelauswahl, Entfernen findet und löscht benutzte Kacheln.  node dev/unit/community_karten.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../custom_components/casora/panel/' + p, import.meta.url), 'utf8');
const mod = { exports: {} };
const win = {};
new Function('module', 'window', read('casora-panel-community.js'))(mod, win);
const C = mod.exports;
assert.ok(C.wishBody && C.cards && C.usage && C.dropTiles, 'Bausteine fehlen');
assert.ok(!('share' in C) && !('validate' in C), 'Teilen ist raus');

// Kachelarten: Community-Karten stehen erst nach Hinzufügen in der Auswahl.
const fake = { id: 'casora_qa_com', label: 'QA card', template: 'casora_qa_com', domains: ['sensor'], community: { desc: 'x' } };
// Umhüllung aus casora-panel-types.js (window.casoraCommunityType), auf eine Prüf-Kachelart angewandt.
const src = read('casora-panel-types.js');
const a = src.indexOf('window.casoraCommunityType = (t) => {');
const w2 = {};
new Function('window', src.slice(a, src.indexOf('\n};\n', a) + 4))(w2);
const normal = { id: 'casora_normal', template: 'casora_normal' };
[fake, normal].forEach(w2.casoraCommunityType);
w2.casoraCommunityType(fake);
const pickable = (t) => !t.hidden && (!t.onlyIf || t.onlyIf({}));
assert.equal(pickable(fake), false, 'nicht hinzugefügt → nicht in der Auswahl');
w2.casoraCommunityOn = new Set(['casora_qa_com']);
assert.equal(pickable(fake), true, 'hinzugefügt → in der Auswahl (auch doppelt umhüllt)');
assert.equal(pickable(normal), true, 'normale Kachelarten unverändert');
assert.deepEqual(C.cards([fake, { id: 'b' }, { ...fake, id: 'c', hidden: true }]).map((t) => t.id), ['casora_qa_com']);

// Benutzung zählen und entfernen: direkt, in Bedingung, im Karussell (leeres Karussell fällt weg).
const t = (tpl) => ({ type: 'custom:button-card', template: tpl, entity: 'sensor.x' });
const rooms = [
  { tiles: [t('casora_qa_com'), t('casora_light'), { type: 'conditional', conditions: [], card: t(['casora_qa_com']) }] },
  { tiles: [{ type: 'custom:casora-swipe-card', cards: [t('casora_qa_com'), t('casora_light')] },
    { type: 'custom:casora-swipe-card', cards: [t('casora_qa_com')] }] },
];
assert.equal(C.usage(rooms, fake), 4);
assert.equal(C.dropTiles(rooms, fake), 4);
assert.equal(C.usage(rooms, fake), 0);
assert.equal(rooms[0].tiles.length, 1);
assert.equal(rooms[1].tiles.length, 1, 'leeres Karussell entfernt');
assert.equal(rooms[1].tiles[0].cards.length, 1);

// Kartenwunsch: anonymisiert, mit Kennung für den Stand.
const hass = { config: { version: '2026.10.0' },
  states: { 'sensor.wohnzimmer_volvo_tank': { state: '42', attributes: { unit_of_measurement: '%', friendly_name: 'Mein Volvo', latitude: 1 } } },
  entities: { 'sensor.wohnzimmer_volvo_tank': { platform: 'volvo', translation_key: 'fuel_level' } } };
const w = C.wishBody({ device: 'Volvo', entities: ['sensor.wohnzimmer_volvo_tank'], tile: 'Tank', popup: '', image: '' }, hass, 'abc123');
assert.ok(!/wohnzimmer|Mein Volvo|latitude/.test(w.body), 'nichts Persönliches');
assert.ok(w.body.includes('<!-- casora-id:abc123 -->'));
assert.deepEqual(w.plat, ['volvo']);
const u = C.issueUrl('Kartenwunsch: Volvo', w.body, ['kartenwunsch']);
assert.ok(u.startsWith('https://github.com/SH1FT-W/casora/issues/new?'));

// Jede mitgelieferte Community-Karte hat ein Vorschaubild (sonst leere Fläche in der Community-Liste).
const typesSrc = read('casora-panel-types.js');
const list = typesSrc.slice(typesSrc.indexOf('window.CASORA_TILE_TYPES = ['), typesSrc.indexOf('\n];', typesSrc.indexOf('window.CASORA_TILE_TYPES = [')));
const comIds = list.split('\n  { id: "').slice(1).filter((x) => /\bcommunity: \{/.test(x)).map((x) => x.split('"')[0]);
assert.ok(comIds.includes('casora_lawn_mower'), 'Mähroboter ist Community-Karte: ' + comIds);
for (const id of comIds) {
  const prev = (typesSrc.split('{ id: "' + id + '"')[1] || '').match(/preview: "([^"]+)"/);
  const file = prev ? null : new URL('../../custom_components/casora/assets/community/' + id + '.webp', import.meta.url);
  assert.ok(prev || fs.existsSync(file), 'Vorschaubild fehlt: assets/community/' + id + '.webp');
}
console.log('community_karten: ok');
