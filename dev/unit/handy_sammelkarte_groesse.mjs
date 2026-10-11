// Größe einer Sammelkarte (Bedingung → auto-entities → Karussell) gilt für die Kacheln darin.
//   node dev/unit/handy_sammelkarte_groesse.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

// Das ganze Panel mit einem Mini-DOM laden; die Bausteine stehen dann in window.__casoraPanelInternals.
const dir = new URL('../../custom_components/casora/panel/', import.meta.url);
const fix = (s) => s.replace(/import\.meta\.url/g, '"http://x/casora-panel.js?v=0"');
const noop = () => {};
const stub = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : stub()), apply: () => stub(), construct: () => stub() });
globalThis.window = { addEventListener: noop, location: { pathname: '/' }, matchMedia: () => ({ matches: false, addEventListener: noop }) };
globalThis.HTMLElement = class {};
globalThis.customElements = { get: () => null, define: noop, whenDefined: () => new Promise(() => {}) };
globalThis.document = stub();
globalThis.localStorage = { getItem: () => null, setItem: noop };
const log = console.info;
console.info = noop;
new Function(fix(fs.readFileSync(new URL('casora-panel-types.js', dir), 'utf8')))();
new Function(fix(fs.readFileSync(new URL('casora-panel.js', dir), 'utf8')))();
console.info = log;
const I = window.__casoraPanelInternals;
assert.ok(I && I.syncPairTiles && I.syncTwinTile, 'Bausteine fehlen');
assert.ok(I.setInnerSize, 'setInnerSize fehlt');
const pairOf = (desk, phone) => ({
  desktop: { compact: { rooms: [{ name: 'Home', path: 'home', tiles: desk }] } },
  mobile: { compact: { rooms: [{ name: 'Favorites', tiles: phone }] } },
  link: { links: [{ room: 0, section: 0, overview: true }] },
});

// Gemeldet 11.10.2026: Pflanzen-Sammelkarte (Bedingung → auto-entities → Karussell) am Handy im Studio auf
// „klein“ gestellt – die Pflanzen blieben groß: Die Größe stand nur an der Hülle, die Kacheln darin hatten
// aus dem Umzug „large“. Erwartet: Größe an der Sammelkarte gilt für jede Kachel darin, auch nach dem Speichern.
const plant = (e, size) => ({ entity_id: e, state: 'problem', options: { type: 'custom:button-card', template: 'casora_plant', entity: e, variables: { sensors: [], size } } });
const sammel = (size) => ({ type: 'conditional', conditions: [{ condition: 'or', conditions: [{ entity: 'plant.a', state: 'problem' }] }],
  card: { type: 'custom:auto-entities', variables: { size }, card: { type: 'custom:casora-swipe-card' }, card_param: 'cards', filter: { include: [plant('plant.a', size), plant('plant.b', size)] } } });
const sizes = (c) => c.card.filter.include.map((x) => x.options.variables.size);

// 1) Im Studio „klein“ an der Sammelkarte: alle Kacheln darin klein.
{
  const s = sammel('large');
  const n = I.setInnerSize(s, '');
  assert.equal(n, 3);
  assert.deepEqual(sizes(s), ['small', 'small']);
  assert.equal(s.card.variables.size, 'small', 'Platz in der Handy-Reihe (auto-entities) auch klein');
  assert.equal(s.card.card.variables, undefined, 'das Karussell selbst bekommt keine Größe');
  I.setInnerSize(s, 'large');
  assert.deepEqual(sizes(s), ['large', 'large']);
}
// 2) Speichern: Raum-Kachel klein → Handy-Zwilling (noch groß) wird klein.
{
  const desk = sammel('large'); I.setInnerSize(desk, '');
  const p = pairOf([desk], [sammel('large')]);
  I.syncPairTiles(p);
  assert.deepEqual(sizes(p.mobile.compact.rooms[0].tiles[0]), ['small', 'small']);
  assert.equal(p.mobile.compact.rooms[0].tiles[0].card.variables.size, 'small');
}
// 3) Ohne Änderung im Studio bleibt eine importierte Größe innen stehen (Kameras/Pflanzen aus dem Umzug).
{
  const p = pairOf([sammel('large')], [sammel('large')]);
  I.syncPairTiles(p);
  assert.deepEqual(sizes(p.mobile.compact.rooms[0].tiles[0]), ['large', 'large']);
}
console.log('ok handy_sammelkarte_groesse');
