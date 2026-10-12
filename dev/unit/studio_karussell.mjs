// Studio 1.4: Karussell als Kachelart und Zustände zur Auswahl bei Bedingungen.  node dev/unit/studio_karussell.mjs
// Handy-Übernahme beim Speichern (syncPairTiles): neue Karussells gehen aufs Handy, Seiten folgen dem Raum,
// importierte Karussells ohne Kennung bleiben am Handy unverändert, bis man sie im Studio bearbeitet.
import fs from 'node:fs';
import assert from 'node:assert/strict';

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
assert.ok(I && I.condStates && I.syncPairTiles && I.markCarousel, 'Bausteine fehlen');

// ── Zustände je Entität ───────────────────────────────────────────────────────
const hass = { states: {
  'media_player.musik_test': { state: 'paused', attributes: {} },
  'light.diele_test': { state: 'on', attributes: {} },
  'input_select.modus': { state: 'Kino', attributes: { options: ['Normal', 'Kino', 'Urlaub'] } },
  'climate.bad': { state: 'heat', attributes: { hvac_modes: ['off', 'heat'] } },
  'sensor.temperatur': { state: '21.5', attributes: { unit_of_measurement: '°C' } },
  'sensor.waschmaschine': { state: 'Spülen', attributes: { device_class: 'enum', options: ['Aus', 'Waschen', 'Spülen'] } },
  'person.anna': { state: 'home', attributes: {} },
  'zone.arbeit': { state: '0', attributes: { friendly_name: 'Arbeit' } },
  'button.klingel': { state: '2026-10-12T10:00:00+00:00', attributes: {} },
} };
const vals = (id) => I.condStates(hass, id).values;
assert.ok(['playing', 'paused', 'idle', 'off'].every((v) => vals('media_player.musik_test').includes(v)), 'Mediaplayer');
assert.deepEqual(vals('light.diele_test').slice(0, 2), ['on', 'off']);
assert.deepEqual(vals('input_select.modus').slice(0, 3), ['Normal', 'Kino', 'Urlaub'], 'Optionen der Auswahl');
assert.deepEqual(vals('climate.bad').slice(0, 2), ['off', 'heat'], 'nur die Modi des Thermostats');
assert.ok(!vals('climate.bad').includes('cool'));
assert.ok(vals('sensor.waschmaschine').includes('Waschen'), 'enum-Sensor');
assert.ok(vals('person.anna').includes('Arbeit') && vals('person.anna').includes('not_home'), 'Zonen');
assert.ok(vals('light.diele_test').includes('unavailable'), 'nicht verfügbar wählbar');
assert.deepEqual(I.condStates(hass, 'sensor.temperatur'), { kind: 'number', unit: '°C' });
assert.equal(I.condStates(hass, 'button.klingel'), null, 'Zeitstempel bleibt frei');

// ── Karussell ────────────────────────────────────────────────────────────────
const tile = (tpl, e) => ({ type: 'custom:button-card', template: tpl, entity: e, name: e });
const pairOf = (desk, phone) => ({
  desktop: { compact: { rooms: [{ name: 'Wohnzimmer', path: 'wz', tiles: desk }] } },
  mobile: { compact: { rooms: [{ name: 'Wohnzimmer', tiles: phone }] } },
  link: { links: [{ room: 0, section: 0 }] },
});
assert.ok(I.isCarouselCard({ type: 'custom:casora-swipe-card', cards: [] }));
assert.ok(!I.isPageTile({ type: 'custom:casora-swipe-card', cards: [] }) && I.isPageTile(tile('casora_light', 'light.a')));

// 1) Neu im Studio: geht aufs Handy, die Seiten darin stehen dort nicht noch einmal einzeln.
{
  const car = I.markCarousel({ type: I.CAROUSEL_CARD, cards: [tile('casora_light', 'light.a'), tile('casora_cover', 'cover.b')] }, 'n');
  const p = pairOf([car], []);
  I.syncPairTiles(p);
  const ph = p.mobile.compact.rooms[0].tiles;
  assert.equal(ph.length, 1, 'ein Karussell am Handy');
  assert.equal(ph[0].cards.length, 2);
  assert.equal(I.carouselId(ph[0]), I.carouselId(car));
  // 2) Seite dazu und umsortiert → Handy folgt, ohne Doppel.
  car.cards.unshift(tile('casora_media', 'media_player.c'));
  I.syncPairTiles(p);
  assert.equal(p.mobile.compact.rooms[0].tiles.length, 1);
  assert.deepEqual(p.mobile.compact.rooms[0].tiles[0].cards.map((c) => c.entity), ['media_player.c', 'light.a', 'cover.b']);
  // 3) Aufgelöst → Handy hat die Kacheln einzeln, das Karussell ist weg.
  p.desktop.compact.rooms[0].tiles = car.cards.slice();
  I.syncPairTiles(p);
  assert.deepEqual(p.mobile.compact.rooms[0].tiles.map((c) => c.entity), ['media_player.c', 'light.a', 'cover.b']);
}
// 4) Importiert, nicht bearbeitet: Handy-Karussell mit eigenen Seiten bleibt genau so.
{
  const desk = { type: I.CAROUSEL_CARD, cards: [tile('casora_camera', 'camera.a'), tile('casora_camera', 'camera.b')] };
  const phone = { type: I.CAROUSEL_CARD, cards: [tile('casora_camera', 'camera.b')] };
  const p = pairOf([desk], [phone]);
  I.syncPairTiles(p);
  assert.equal(p.mobile.compact.rooms[0].tiles.length, 1);
  assert.deepEqual(p.mobile.compact.rooms[0].tiles[0].cards.map((c) => c.entity), ['camera.b'], 'Handy unverändert');
  // 5) Im Studio bearbeitet („i…“): übernimmt das Gegenstück, kein zweites Karussell.
  I.markCarousel(desk, 'i');
  desk.cards.push(tile('casora_camera', 'camera.c'));
  I.syncPairTiles(p);
  const ph = p.mobile.compact.rooms[0].tiles;
  assert.equal(ph.length, 1, 'kein Doppel');
  assert.deepEqual(ph[0].cards.map((c) => c.entity), ['camera.a', 'camera.b', 'camera.c']);
}
// 6) Ein neues Karussell vor einem importierten übernimmt dessen Handy-Gegenstück nicht.
{
  const imp = { type: I.CAROUSEL_CARD, cards: [tile('casora_camera', 'camera.a')] };
  const fresh = I.markCarousel({ type: I.CAROUSEL_CARD, cards: [tile('casora_light', 'light.z')] }, 'n');
  const phone = { type: I.CAROUSEL_CARD, cards: [tile('casora_camera', 'camera.a')] };
  const p = pairOf([fresh, imp], [phone]);
  I.syncPairTiles(p);
  const ph = p.mobile.compact.rooms[0].tiles;
  assert.equal(ph.length, 2);
  assert.ok(ph.some((c) => c.cards[0].entity === 'camera.a' && !I.carouselId(c)), 'Import am Handy unberührt');
}
console.log('ok studio_karussell');
