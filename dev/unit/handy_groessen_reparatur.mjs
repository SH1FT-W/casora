// Handy-Größen nach dem Umzug: Abgleich beim Speichern und Reparatur aus der Umzugs-Sicherung.
//   node dev/unit/handy_groessen_reparatur.mjs
// Gemeldet 04.10.2026: Nach dem Umzug von Hemma waren am Handy alle Kacheln klein. Umzüge vor
// 1.0.3 gaben „groß“ nicht an die Raum-Kacheln weiter; das erste Speichern im Studio schrieb die
// Raum-Kachel (ohne Größe) aufs Handy. Dazu: (a) gleiche Kacheln im Raum bekamen beim Speichern
// alle die Einstellungen der letzten, (b) alle bedingten Karten galten als dieselbe Kachel und
// rückten am Handy an die Stelle der ersten. restorePhoneSizes holt die Größen einmalig aus der
// gesicherten Hemma-Handy-Ansicht (Studio: _restoreUmzugSizes).
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
assert.ok(I && I.syncPairTiles && I.restorePhoneSizes && I.hasTileSize, 'Bausteine fehlen');

const t = (template, entity, vars) => ({ type: 'custom:button-card', template, entity, ...(vars ? { variables: vars } : {}) });
const cond = (card) => ({ type: 'conditional', conditions: [{ entity: card.entity || 'x.y', state: 'on' }], card });
const clone = (x) => JSON.parse(JSON.stringify(x));
const size = (x) => ((x && x.type === 'conditional' ? x.card : x).variables || {}).size;
const sig = (x) => { const c = x.type === 'conditional' ? x.card : x; return (x.type === 'conditional' ? '?' : '') + [].concat(c.template || c.type)[0] + '|' + (c.entity || ''); };

// (a)+(b) Speichern: gleiche Kacheln der Reihe nach, bedingte Karten an ihrer Stelle.
{
  const desk = { compact: { rooms: [{ name: 'Home', path: 'home', tiles: [
    cond(t('casora_alarm', 'alarm_control_panel.a')),
    t('casora_lock', 'lock.tuer', { size: 'large' }),
    cond(t('casora_vacuum', 'vacuum.r', { size: 'large' })),
    t('casora_light', 'light.a'),
    t('casora_light', 'light.a', { size: 'large' }),
    cond(t('casora_solar_tip', 'binary_sensor.solar', { size: 'large' })),
  ] }] } };
  const phone = { compact: { rooms: [{ name: 'Favorites', tiles: [
    cond(t('casora_alarm', 'alarm_control_panel.a')),
    t('casora_lock', 'lock.tuer'),
    cond(t('casora_vacuum', 'vacuum.r', { size: 'large' })),
    t('casora_light', 'light.a'),
    t('casora_light', 'light.a'),
    cond(t('casora_solar_tip', 'binary_sensor.solar', { size: 'large' })),
  ] }] } };
  const pair = { desktop: desk, mobile: phone, link: { links: [{ room: 0, section: 0, overview: true }] } };
  const r = I.syncPairTiles(pair);
  const tiles = phone.compact.rooms[0].tiles;
  assert.deepEqual(tiles.map(sig), desk.compact.rooms[0].tiles.map(sig), 'Reihenfolge wie im Raum, bedingte Karten an ihrer Stelle');
  assert.equal(r.moved, 0, 'nichts umsortiert');
  assert.equal(size(tiles[1]), 'large', 'Schloss groß wie die Raum-Kachel');
  assert.equal(size(tiles[3]), undefined, 'erste von zwei gleichen Lampen: klein wie die erste im Raum');
  assert.equal(size(tiles[4]), 'large', 'zweite: groß wie die zweite im Raum');
  assert.equal(size(tiles[2]), 'large', 'bedingte Karte behält ihre Größe innen');
}

// Früher falsch sortiert (alle bedingten Karten vorn): Speichern stellt die Raum-Reihenfolge her.
{
  const room = [t('casora_lock', 'lock.tuer'), cond(t('casora_vacuum', 'vacuum.r')), t('casora_light', 'light.a'), cond(t('casora_trash', 'sensor.abfall'))];
  const desk = { compact: { rooms: [{ name: 'Home', path: 'home', tiles: clone(room) }] } };
  const phone = { compact: { rooms: [{ name: 'Favorites', tiles: [room[1], room[3], room[0], room[2]].map(clone) }] } };
  const r = I.syncPairTiles({ desktop: desk, mobile: phone, link: { links: [{ room: 0, section: 0, overview: true }] } });
  assert.deepEqual(phone.compact.rooms[0].tiles.map(sig), room.map(sig));
  assert.equal(r.moved, 1);
}

// Reparatur: Prod-ähnliches Paar ohne Größen, Sicherung des Hemma-Handys mit Größen.
{
  const deskTiles = () => [
    cond(t('casora_weather_warning', 'binary_sensor.warn')),
    t('casora_lock', 'lock.tuer'),
    cond({ type: 'custom:casora-swipe-card', cards: [t('casora_camera', 'camera.a'), t('casora_camera', 'camera.b')] }),
    t('casora_light', 'light.gruppe'),
    cond(t('casora_vacuum', 'vacuum.r')),
    t('own_car', 'sensor.auto'),
    t('casora_battery', 'sensor.bat'),
  ];
  const pair = {
    desktop: { compact: { rooms: [
      { name: 'Home', path: 'home', tiles: deskTiles() },
      { name: 'Küche', path: 'kueche', tiles: [t('casora_recipe', 'sensor.casora_rezept'), t('casora_light', 'light.k')] },
      { name: 'Waschküche', path: 'waschkueche', tiles: [t('casora_vacuum', 'vacuum.r'), t('casora_waschmaschine', 'sensor.wm')] },
    ] } },
    mobile: { compact: { rooms: [
      { name: 'Favorites', tiles: deskTiles() },
      { name: 'Küche', tiles: [t('casora_recipe', 'sensor.casora_rezept'), t('casora_light', 'light.k')] },
      { name: 'Waschküche', tiles: [t('casora_vacuum', 'vacuum.r'), t('casora_waschmaschine', 'sensor.wm')] },
    ] } },
  };
  assert.equal(I.hasTileSize(pair.desktop) || I.hasTileSize(pair.mobile), false);
  // Hemma-Handy (umbenannt wie beim Umzug): andere Reihenfolge, „Favoriten“, Hemma-Helfer.
  const L = { size: 'large' };
  const backup = { compact: { rooms: [
    { name: 'Favoriten', tiles: [
      cond(t('casora_weather_warning', 'binary_sensor.warn', L)),
      t('casora_lock', 'lock.tuer', L),
      cond({ type: 'custom:casora-swipe-card', variables: L, cards: [t('casora_camera', 'camera.a', L), t('casora_camera', 'camera.b', L)] }),
      t('casora_light', 'light.gruppe'),
      cond(t('casora_vacuum', 'vacuum.r')),
      t('casora_car', 'sensor.auto', L),
      t('casora_battery', 'sensor.bat', { size: 'small' }),
    ] },
    { name: 'Küche', tiles: [t('casora_recipe', 'sensor.hemma_rezept', L), t('casora_light', 'light.k')] },
    { name: 'Waschküche', tiles: [t('casora_vacuum', 'vacuum.r', L), t('casora_waschmaschine', 'sensor.wm', L)] },
  ] } };
  const r = I.restorePhoneSizes(pair, backup);
  assert.deepEqual(r, { desk: 8, phone: 8 }, JSON.stringify(r));
  const fav = pair.mobile.compact.rooms[0].tiles;
  assert.deepEqual(fav.map(size), ['large', 'large', 'large', undefined, undefined, 'large', 'small']);
  assert.deepEqual(fav[2].card.cards.map((c) => c.variables.size), ['large', 'large'], 'Kameras in der Swipe-Karte');
  assert.equal(size(pair.mobile.compact.rooms[1].tiles[0]), 'large', 'Rezept (Hemma-Helfer → Casora-Helfer)');
  assert.equal(size(pair.mobile.compact.rooms[2].tiles[0]), 'large', 'Saugroboter in der Waschküche groß, in den Favoriten nicht');
  assert.equal(size(pair.desktop.compact.rooms[0].tiles[5]), 'large', 'eigene Kachelart own_car wie casora_car');
  // Danach Speichern: Raum-Kacheln tragen die Größe, das Handy bleibt so.
  pair.link = I.linkPair(pair.desktop, pair.mobile);
  const before = JSON.stringify(pair.mobile.compact.rooms.map((s) => s.tiles.map(size)));
  I.syncPairTiles(pair);
  assert.equal(JSON.stringify(pair.mobile.compact.rooms.map((s) => s.tiles.map(size))), before, 'Speichern behält die Größen');
  assert.equal(I.hasTileSize(pair.mobile), true, 'danach greift die Reparatur nicht noch einmal');
}

console.log('ok handy_groessen_reparatur');
