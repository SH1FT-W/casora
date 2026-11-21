// #227: every state change in the house re-checked each tile row five times (next frame, 100/250/500 ms, 1.5 s),
// each check a forced style recalculation: a layout per state change on Home while nobody touches anything. A change
// that no tile of the row watches (button-card's _monitoredEntities, the tile's entity / active_entities) now gets
// one calm look per 5 s instead; a watched entity, an unknown card, the load phase and anything else on hass
// re-check at once as before.
//   node dev/unit/kachelreihe_fremder_zustand.mjs
// @deckt: custom_components/casora/scripts/smart-row.js#_hassMatters,hass
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const win = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }), innerWidth: 1440 };
let RowClass = null;
const frames = [], timers = [];
const sandbox = {
  window: win, document: { body: null, addEventListener() {}, documentElement: { style: { setProperty() {} } }, createElement: () => ({ style: {} }) },
  customElements: { define: (n, c) => { RowClass = c; }, get: () => null, whenDefined: () => new Promise(() => {}) },
  HTMLElement: class {}, requestAnimationFrame: (f) => { frames.push(f); return frames.length; }, cancelAnimationFrame() {},
  getComputedStyle: () => ({ display: 'block' }),
  setTimeout: (f, ms) => { timers.push({ f, ms }); return timers.length; }, clearTimeout() {}, ResizeObserver: class { observe() {} disconnect() {} },
};
new Function(...Object.keys(sandbox), read('custom_components/casora/scripts/smart-row.js'))(...Object.values(sandbox));
assert.ok(RowClass, 'row class defined');

const tile = (mon, more) => Object.assign({ localName: 'button-card', _monitoredEntities: mon, _initialSetupComplete: true, n: 0, set hass(h) { this.n++; } }, more);
const mk = (cards, cfgs, builtAgo = 60000) => {
  const row = Object.create(RowClass.prototype);
  Object.assign(row, { _config: { cards: cfgs }, _cards: cards, _wrappers: [], _cardsCreated: true, _initialized: true, isConnected: true,
    _builtAt: Date.now() - builtAgo, _filterWait: true, looks: 0 });
  row._updateWrapperVisibility = function () { this.looks++; };
  row._updateSort = () => {}; row._autoSize = () => {};
  return row;
};
const shell = { themes: {}, user: {}, locale: {} };
const st = (v) => ({ state: v });
let states = { 'light.a': st('on'), 'switch.b': st('off'), 'sensor.power': st('1'), 'sensor.extra': st('1') };
const next = (id) => { states = { ...states, [id]: st(String(Math.random())) }; return { ...shell, states }; };
const reset = () => { frames.length = 0; timers.length = 0; };

// ── A row of button-card tiles: foreign state changes ──
{
  const a = tile(['light.a']), b = tile(['switch.b']);
  const row = mk([a, b], [{ type: 'custom:button-card', entity: 'light.a' }, { type: 'custom:button-card', entity: 'switch.b', active_entities: ['sensor.extra'] }]);
  row.hass = next('sensor.power');          // first hass: looked at
  assert.equal(frames.length, 1, 'first hass: the row is checked');
  frames.shift()(); reset();
  for (let i = 0; i < 25; i++) row.hass = next('sensor.power');
  assert.equal(a.n, 26, 'every tile still gets every hass');
  assert.equal(frames.length, 0, '25 foreign state changes: no check per change');
  assert.deepEqual(timers.map((t) => t.ms), [5000], 'one calm look is scheduled, nothing else (' + timers.map((t) => t.ms) + ')');
  const looks = row.looks;
  timers[0].f();
  assert.equal(row.looks, looks + 1, 'the calm look checks the row once');
  reset();

  // A watched entity, the tile's own entity, its active_entities: checked at once.
  row.hass = next('light.a');
  assert.equal(frames.length, 1, 'a watched entity: checked in the next frame');
  frames.shift()(); reset();
  row.hass = next('sensor.extra');
  assert.equal(frames.length, 1, 'active_entities of a tile: checked in the next frame');
  frames.shift()(); reset();
  a._monitoredEntities.push('sensor.power');
  row.hass = next('sensor.power');
  assert.equal(frames.length, 1, 'an entity a tile starts to watch counts');
  frames.shift()(); reset();

  // Anything else on hass.
  row.hass = { ...shell, themes: { darkMode: true }, states };
  assert.equal(frames.length, 1, 'a change outside the states: checked');
  // The same hass again (the row re-applies it after a filter change).
  frames.shift()(); reset();
  row.hass = row._rawHass;
  assert.equal(frames.length, 1, 'the same hass set again: checked');
}

// ── Unknown card, card still setting up, load phase: as before ──
{
  for (const [name, card, ago] of [
    ['a card that is no button-card', { localName: 'hui-conditional-card', set hass(h) {} }, 60000],
    ['a button-card without a watch list', { localName: 'button-card', _initialSetupComplete: true, set hass(h) {} }, 60000],
    ['a button-card still setting up', tile(['light.a'], { _initialSetupComplete: false }), 60000],
    ['the load phase', tile(['light.a']), 2000],
  ]) {
    reset();
    const row = mk([card], [{ type: 'custom:button-card', entity: 'light.a' }], ago);
    row.hass = next('sensor.power');
    frames.shift()(); reset();
    row.hass = next('sensor.power');
    assert.equal(frames.length, 1, name + ': every state change checks the row');
  }
}
console.log('OK kachelreihe_fremder_zustand');
