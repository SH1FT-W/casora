// Automatisch einrichten: die Beleuchtung eines Raums nimmt nie die Lichtgruppe des ganzen Hauses.
//   node dev/unit/raum_licht_gruppe.mjs
// Nutzertest 7 (07.10.2026): Im Wohnzimmer standen zwei Lichter, eines davon steckt auch in der
// Hausgruppe „alle Lampen“. Die kleinste Gruppe mit beiden war die Hausgruppe – die Raum-Kachel
// „Beleuchtung“ zeigte dann „1 An“ (ein Licht im Flur) und das Popup „1 von 8 Räumen an“.
// Jetzt: eine Gruppe nur, wenn sie keine fremden Lichter enthält; sonst die Lichter als Liste.
// Die Übersicht (Favoriten über alle Räume) darf die Hausgruppe weiter nehmen.
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
const src = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
window.__casoraPanelInternals = { TILE_TYPES: [], clone: (x) => JSON.parse(JSON.stringify(x)) };
new Function(src('custom_components/casora/panel/casora-panel-basis.js'))();
const B = window.casoraBasis;

function house() {
  const h = { states: {}, entities: {}, devices: {}, areas: {} };
  for (const [id, name] of [['wz', 'Wohnzimmer'], ['ku', 'Küche'], ['bu', 'Büro']]) h.areas[id] = { area_id: id, name };
  const light = (eid, { area = null, name, state = 'off', members } = {}) => {
    h.entities[eid] = { entity_id: eid, device_id: null, area_id: area, platform: 'template' };
    h.states[eid] = { entity_id: eid, state, attributes: { friendly_name: name, ...(members ? { entity_id: members } : {}) } };
  };
  // Wohnzimmer: Deckenlicht und Leselampe – die Leselampe gehört zusätzlich zur Hausgruppe.
  light('light.beispiel_decke', { area: 'wz', name: 'Deckenlicht' });
  light('light.beispiel_lese', { area: 'wz', name: 'Leselampe', state: 'on' });
  // Küche: eine Lichtgruppe mit zwei Spots (genau die Lichter des Raums).
  light('light.beispiel_spot_1', { area: 'ku', name: 'Spot 1' });
  light('light.beispiel_spot_2', { area: 'ku', name: 'Spot 2' });
  light('light.beispiel_kueche', { area: 'ku', name: 'Küche', members: ['light.beispiel_spot_1', 'light.beispiel_spot_2'] });
  // Büro: zwei Lampen, keine eigene Gruppe.
  light('light.beispiel_tisch', { area: 'bu', name: 'Tischlampe', state: 'on' });
  light('light.beispiel_regal', { area: 'bu', name: 'Regal' });
  // Hausgruppe ohne Bereich: enthält die Leselampe, die Küchengruppe und das Büro.
  light('light.beispiel_alle', { name: 'Alle Lampen', state: 'on',
    members: ['light.beispiel_lese', 'light.beispiel_decke', 'light.beispiel_kueche', 'light.beispiel_tisch', 'light.beispiel_regal'] });
  return h;
}

const h = house();
const p = B.plan(h, ['Wohnzimmer', 'Küche', 'Büro'], { ...B.DEFAULTS });
const room = (n) => p.rooms.find((r) => r.name === n);
const lightTiles = (n) => room(n).items.filter((x) => x.type === 'light').map((x) => x.tile);

// Wohnzimmer: nicht die Hausgruppe, sondern beide Lichter als eine Kachel mit Liste.
const wz = lightTiles('Wohnzimmer');
assert.equal(wz.length, 1, 'Wohnzimmer: eine Beleuchtungs-Kachel');
assert.notEqual(wz[0].entity, 'light.beispiel_alle', 'Wohnzimmer: nicht die Hausgruppe');
assert.deepEqual([...wz[0].variables.lights].sort(), ['light.beispiel_decke', 'light.beispiel_lese'], 'Wohnzimmer: genau die beiden Lichter');

// Büro: ebenso – die Hausgruppe enthält auch Wohnzimmer und Küche.
const bu = lightTiles('Büro');
assert.equal(bu.length, 1);
assert.notEqual(bu[0].entity, 'light.beispiel_alle', 'Büro: nicht die Hausgruppe');

// Küche: die eigene Gruppe passt genau und bleibt die Kachel.
const ku = lightTiles('Küche');
assert.equal(ku.length, 1);
assert.equal(ku[0].entity, 'light.beispiel_kueche', 'Küche: eigene Lichtgruppe');

// Übersicht: Favorit „Beleuchtung“ über alle Räume darf die Hausgruppe nehmen.
const fav = p.rooms[0].items.find((x) => x.key === 'fav:light');
assert.ok(fav, 'Übersicht: Favorit Beleuchtung');
assert.equal(fav.tile.entity, 'light.beispiel_alle', 'Übersicht: Hausgruppe erlaubt');

console.log('raum_licht_gruppe: ok');
