// Bedingte Kacheln (type: conditional) beim Speichern aufs Handy: Bedingung und Kachel darin mit.
//   node dev/unit/handy_bedingung.mjs
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

const t = (template, entity, vars) => ({ type: 'custom:button-card', template, entity, ...(vars ? { variables: vars } : {}) });
const cond = (states, card) => ({ type: 'conditional', conditions: [{ condition: 'state', entity: 'alarm_control_panel.haus', state: states }], card });
const pairOf = (desk, phone) => ({
  desktop: { compact: { rooms: [{ name: 'Home', path: 'home', tiles: desk }] } },
  mobile: { compact: { rooms: [{ name: 'Favorites', tiles: phone }] } },
  link: { links: [{ room: 0, section: 0, overview: true }] },
});

// Gemeldet 06.10.2026: Bedingung der Alarm-Kachel im Studio geändert – am Handy galt weiter die alte.
{
  const modes = ['armed_home', 'armed_away'];
  const p = pairOf(
    [cond(['armed_vacation', 'triggered'], t('casora_alarm', 'alarm_control_panel.haus', { modes }))],
    [cond(['armed_away', 'armed_vacation', 'triggered'], t('casora_alarm', 'alarm_control_panel.haus', { modes: ['armed_home'], mobile_filter_category: 'security' }))],
  );
  const r = I.syncPairTiles(p);
  const m = p.mobile.compact.rooms[0].tiles;
  assert.equal(m.length, 1, 'keine zweite Kachel');
  assert.equal(r.synced, 1);
  assert.deepEqual(m[0].conditions[0].state, ['armed_vacation', 'triggered'], 'Bedingung wie am Desktop');
  assert.deepEqual(m[0].card.variables.modes, modes, 'Einstellung der Kachel darin wie am Desktop');
  assert.equal(m[0].card.variables.mobile_filter_category, 'security', 'Handy-eigener Filter bleibt');
  // Kopie, nicht dieselben Objekte.
  p.desktop.compact.rooms[0].tiles[0].conditions[0].state.push('x');
  assert.equal(m[0].conditions[0].state.length, 2);
}

// Studio-Hinweis: gespeicherter Handy-Stand je bedingter Raum-Kachel; nach dem Abgleich gleich.
{
  const p = pairOf(
    [cond(['triggered'], t('casora_alarm', 'alarm_control_panel.haus')), t('casora_lock', 'lock.tuer')],
    [cond(['armed_away', 'triggered'], t('casora_alarm', 'alarm_control_panel.haus')), t('casora_lock', 'lock.tuer')],
  );
  const shell = p.desktop.compact.rooms[0].tiles[0];
  const snap = I.phoneCondSnapshot(p);
  assert.equal(snap.size, 1, 'nur bedingte Kacheln');
  assert.notEqual(snap.get(shell), I.condChain(shell), 'Handy weicht ab');
  I.syncPairTiles(p);
  assert.equal(I.phoneCondSnapshot(p).get(shell), I.condChain(shell), 'nach dem Speichern gleich');
}

// Verschachtelt (Bedingung in Bedingung): beide Ebenen.
{
  const p = pairOf(
    [{ type: 'conditional', conditions: [{ condition: 'screen', media_query: '(min-width: 0px)' }], card: cond(['triggered'], t('casora_alarm', 'alarm_control_panel.haus')) }],
    [{ type: 'conditional', conditions: [], card: cond(['armed_away'], t('casora_alarm', 'alarm_control_panel.haus')) }],
  );
  I.syncPairTiles(p);
  const m = p.mobile.compact.rooms[0].tiles[0];
  assert.equal(m.conditions[0].condition, 'screen');
  assert.deepEqual(m.card.conditions[0].state, ['triggered']);
}

// Sammelkarte darin (Swipe): nur die Bedingung, die Karten darin bleiben am Handy.
{
  const sw = (n) => ({ type: 'custom:casora-swipe-card', cards: Array.from({ length: n }, (_, i) => t('casora_camera', 'camera.c' + i)) });
  const p = pairOf([cond(['triggered'], sw(2))], [cond(['armed_away'], sw(3))]);
  I.syncPairTiles(p);
  const m = p.mobile.compact.rooms[0].tiles[0];
  assert.deepEqual(m.conditions[0].state, ['triggered']);
  assert.equal(m.card.cards.length, 3, 'Swipe-Karte am Handy unverändert');
}

// Normale Kachel wie bisher.
{
  const p = pairOf([t('casora_lock', 'lock.tuer', { size: 'large' })], [t('casora_lock', 'lock.tuer')]);
  I.syncPairTiles(p);
  const m = p.mobile.compact.rooms[0].tiles[0];
  assert.equal(m.variables.size, 'large');
  assert.equal(m.conditions, undefined);
}

console.log('ok handy_bedingung');
