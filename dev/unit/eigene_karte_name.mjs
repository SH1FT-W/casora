// Eigene Karten im Studio benennen: Name in variables.casora_name, sonst aus der Karte gelesen.
//   node dev/unit/eigene_karte_name.mjs
// Gemeldet 03.10.2026: In der Kachelliste stand bei eigenen Karten nur „Eigene Karte“, mehrere
// waren nicht zu unterscheiden. Jetzt: oben der Name, darunter die Art. Der Name gehört zu den
// Kachel-Eigenschaften (TILE_OWN_KEYS) und muss den Rundlauf Einlesen/Speichern überstehen.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');
function grab(re) {
  const m = re.exec(src);
  assert.ok(m, 'nicht gefunden: ' + re);
  const end = src.indexOf('\n}', m.index);
  const semi = src.indexOf('\n};', m.index);
  const stop = semi >= 0 && semi <= end ? semi + 3 : end + 2;
  return src.slice(m.index, stop);
}
const one = (re) => { const m = re.exec(src); assert.ok(m, 'nicht gefunden: ' + re); return m[0]; };
const code = [
  one(/^const clone = .*$/m),
  // Von TILE_OWN_KEYS bis hostBareTiles am Stück (Hülle, Namen, Container-Erkennung).
  src.slice(src.indexOf('const TILE_OWN_KEYS = '),
    src.indexOf('\n', src.indexOf('(c) => (isBareCard(c) ? wrapCustomCard(c)')) + 1),
  grab(/^function stable\(/m),
  grab(/^const omit = /m),
  grab(/^function roomVisibility\(/m),
  grab(/^function extractConfig\(/m),
  grab(/^function expandConfig\(/m),
  'return { TILE_OWN_KEYS, customTileName, wrapCustomCard, extractConfig, expandConfig };',
].join('\n');
const { TILE_OWN_KEYS, customTileName, wrapCustomCard, extractConfig, expandConfig } = new Function(code)();

assert.ok(TILE_OWN_KEYS.has('casora_name'), 'casora_name ist eine Kachel-Eigenschaft');

const states = { 'sensor.beispiel_temperatur': { attributes: { friendly_name: 'Beispiel Temperatur' } } };
const name = (t) => (customTileName(t, states) || {}).name || null;

// Ohne alles: kein Name (Liste zeigt dann einmal „Eigene Karte“).
assert.equal(name(wrapCustomCard({ type: 'markdown', content: 'x' })), null);
// title/name der Karte darin.
assert.equal(name(wrapCustomCard({ type: 'entities', title: 'Mein Titel', entities: [] })), 'Mein Titel');
// Erste Entität mit Anzeigenamen, auch als {entity: …} oder verschachtelt.
assert.equal(name(wrapCustomCard({ type: 'custom:mini-graph-card', entities: ['sensor.gibt_es_nicht', 'sensor.beispiel_temperatur'] })), 'Beispiel Temperatur');
assert.equal(name(wrapCustomCard({ type: 'entities', entities: [{ entity: 'sensor.beispiel_temperatur' }] })), 'Beispiel Temperatur');
assert.equal(name(wrapCustomCard({ type: 'tile', entity: 'sensor.beispiel_temperatur' })), 'Beispiel Temperatur');
// Vorlagen-Ausdrücke sind kein Name.
assert.equal(name(wrapCustomCard({ type: 'custom:button-card', name: '[[[ return 1 ]]]' })), null);
// Eigener Name schlägt alles.
const own = wrapCustomCard({ type: 'entities', title: 'Mein Titel', entities: [] }, { casora_name: 'Wetterkarte' });
assert.deepEqual(customTileName(own, states), { name: 'Wetterkarte', own: true });
// Steht er in der eingefügten Karte, wandert er wie die anderen Eigenschaften zur Hülle.
const pasted = wrapCustomCard({ type: 'markdown', content: 'x', variables: { casora_name: 'Notiz', farbe: 'rot' } });
assert.equal(pasted.variables.casora_name, 'Notiz');
assert.deepEqual(pasted.custom_fields.card.variables, { farbe: 'rot' });

// Rundlauf: Dashboard einlesen und wieder schreiben – nichts geht verloren.
const lovelace = { views: [{ type: 'custom:grid-layout', path: 'wohnzimmer', title: 'Wohnzimmer', layout: {}, cards: [
  { type: 'custom:button-card', template: 'casora_room', name: 'Wohnzimmer', variables: {} },
  { type: 'vertical-stack', cards: [] },
  { type: 'custom:casora-smart-row', cards: [own, { type: 'markdown', content: 'nackt' }] },
] }] };
const st = extractConfig(lovelace);
const tiles = st.compact.rooms[0].tiles;
assert.equal(tiles[0].variables.casora_name, 'Wetterkarte');
assert.equal(tiles[1].template, 'casora_custom', 'nackte Karte wird gehostet');
const back = expandConfig(st.compact, st.scaffold, st.extras, st.templates);
const again = extractConfig(back);
assert.deepEqual(again.compact.rooms[0].tiles, tiles, 'Rundlauf verlustfrei');
assert.deepEqual(back.views[0].cards[2].cards[0], own, 'eigene Karte unverändert gespeichert');
console.log('ok eigene_karte_name');
