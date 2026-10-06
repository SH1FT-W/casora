// Studio-Vorschau: Swipe-Karten als eine Kachel mit Seitenpunkten.
//   node dev/unit/vorschau_swipe.mjs
// Gemeldet: Swipe-Kacheln, deren Seiten auto-entities sammelt (Luftreiniger, Aquarien), standen in
// der Desktop-Vorschau einzeln nebeneinander und blinkten – mit jedem Schalten kam oder ging eine
// Kachel. Erwartet: eine Kachel (die erste sichtbare Seite) mit Seitenzahl, wie am Dashboard; auch
// eine Swipe-Karte in einer Bedingung (Kameras) zeigt ihre Seiten. Andere Sammelkarten bleiben, wie sie sind.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const noop = () => {};
globalThis.window = { addEventListener: noop };
globalThis.document = { createElement: () => ({}) };
const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel-types.js', import.meta.url), 'utf8');
new Function(src.replace(/import\.meta\.url/g, '"http://x/casora-panel-types.js"').replace(/import\(([^)]*)\)/g, 'Promise.resolve()'))();
const unwrap = window.casoraPreviewUnwrap;
assert.equal(typeof unwrap, 'function');

const tile = (e) => ({ type: 'custom:button-card', template: 'casora_air_purifier', entity: e });
const hass = (on) => ({ states: Object.fromEntries(['fan.a', 'fan.b', 'fan.c'].map((e) => [e, { state: on.includes(e) ? 'on' : 'off' }])) });
const auto = {
  type: 'custom:auto-entities', card: { type: 'custom:casora-swipe-card' }, card_param: 'cards', show_empty: false,
  filter: { include: ['fan.a', 'fan.b', 'fan.c'].map((e) => ({ entity_id: e, state: 'on', options: tile(e) })) },
};

// auto-entities mit Swipe-Karte: eine Kachel, Seiten = gesammelte Karten
{
  const r = unwrap(auto, hass(['fan.a', 'fan.c']));
  assert.ok(!r.cards, 'nicht mehrere Kacheln nebeneinander');
  assert.equal(r.inner.entity, 'fan.a');
  assert.equal(r.pages, 2);
  const r1 = unwrap(auto, hass(['fan.b']));
  assert.equal(r1.inner.entity, 'fan.b');
  assert.equal(r1.pages, 1);
  assert.deepEqual(unwrap(auto, hass([])), { hidden: true });
}

// Swipe in einer Bedingung (Kameras): Seitenpunkte
{
  const cam = { type: 'conditional', conditions: [{ entity: 'fan.a', state: 'on' }],
    card: { type: 'custom:casora-swipe-card', cards: [tile('fan.b'), tile('fan.c')] } };
  const r = unwrap(cam, hass(['fan.a']));
  assert.equal(r.inner.entity, 'fan.b');
  assert.equal(r.pages, 2);
  assert.deepEqual(unwrap(cam, hass([])), { hidden: true });
}

// Einfache Swipe-Karte wie bisher
{
  const r = unwrap({ type: 'custom:casora-swipe-card', cards: [tile('fan.a'), tile('fan.b')] }, hass([]));
  assert.equal(r.inner.entity, 'fan.a');
  assert.equal(r.pages, 2);
}

// auto-entities ohne Swipe (Pflanzen einzeln): weiter mehrere Kacheln
{
  const plain = { ...auto, card: { type: 'grid' } };
  const r = unwrap(plain, hass(['fan.a', 'fan.b']));
  assert.equal(r.cards.length, 2);
}

console.log('ok vorschau_swipe');
