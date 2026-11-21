// #227: a Casora Home drew ~10 W more than a standard dashboard while idle. Every state change in the house hands
// every card a new hass; button-card copies it twice per card and runs an update cycle that ends in "nothing I watch
// changed" (~180 cards on Home). casora-core.js now keeps such a hass aside for Casora cards (button-card lazy hass).
// Checked here on a stand-in for button-card 7's prototype: which hass reaches button-card's own setter, that the
// card still answers with the newest hass, and that cards inside the card get every hass.
//   node dev/unit/button_card_lazy_hass.mjs
// @deckt: custom_components/casora/scripts/casora-core.js#__casoraLazyHass
import fs from 'node:fs';
import assert from 'node:assert/strict';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const a = core.indexOf('// button-card lazy hass (#227)');
const b = core.indexOf('\n})();\n', a) + 6;
assert.ok(a > 0 && b > a, 'lazy hass block in casora-core.js');

// button-card 7: `hass` is a plain setter, `_hass` a Lit property (accessor on the prototype that asks for an update).
const make = () => {
  class Lit { }
  Object.defineProperty(Lit.prototype, '_hass', { configurable: true, enumerable: true,
    get() { return this.__hass; }, set(v) { const old = this.__hass; this.__hass = v; this.updates.push(old); } });
  class Card extends Lit {
    constructor(cfg, mon = []) { super(); this._config = cfg; this._monitoredEntities = mon; this._cards = {}; this.updates = []; this.sets = 0; this._initialSetupComplete = false; }
    set hass(h) { this.sets++; this._hass = h; this._pHass = Object.assign({}, h, { states: 'proxy' });
      Object.keys(this._cards).forEach((k) => { this._cards[k].hass = this._hass; }); this._initialSetupComplete = true; }
  }
  const w = {};
  let ready;
  w.customElements = { get: () => Card, whenDefined: () => ({ then: (f) => { ready = f; } }) };
  new Function('window', 'customElements', core.slice(a, b))(w, w.customElements);
  return { Card, patch: () => ready() };
};

const st = (v) => ({ state: v });
const shell = { user: { name: 'x' }, themes: {}, locale: {}, callService() {} };
const hass = (states, more) => Object.assign({}, shell, more, { states });
const S0 = { 'light.a': st('on'), 'sensor.power': st('1'), 'sensor.other': st('1') };

// ── A Casora card: a change of an entity it does not watch stays out of button-card ──
{
  const { Card, patch } = make();
  patch();
  const card = new Card({ template: ['casora_light'] }, ['light.a']);
  const h0 = hass(S0);
  card.hass = h0;
  assert.equal(card.sets, 1, 'the first hass goes to button-card');
  const h1 = hass({ ...S0, 'sensor.power': st('2') });
  card.hass = h1;
  assert.equal(card.sets, 1, 'a foreign state change does not reach button-card\'s setter');
  assert.equal(card.updates.length, 1, 'and asks for no update');
  assert.equal(card._hass, h1, 'the card still answers with the newest hass');
  const h2 = hass({ ...h1.states, 'sensor.other': st('2') });
  card.hass = h2;
  assert.equal(card.sets, 1);
  assert.equal(card._hass, h2);

  // The watched entity changes: button-card gets it, and its "old" hass is the one it last had (h0), so its own
  // comparison old/new sees the change.
  const h3 = hass({ ...h2.states, 'light.a': st('off') });
  card.hass = h3;
  assert.equal(card.sets, 2, 'a watched entity goes through');
  assert.equal(card.updates[1], h0, 'button-card compares against the hass it last received');
  assert.equal(card._hass, h3);
  assert.equal(card._pHass.user, shell.user);

  // An entity the card starts watching later (a template read it) counts from then on.
  card._monitoredEntities.push('sensor.other');
  const h4 = hass({ ...h3.states, 'sensor.other': st('3') });
  card.hass = h4;
  assert.equal(card.sets, 3, 'a newly watched entity goes through');

  // Anything else on hass (user, theme, language, registries …) goes through, whatever the states do.
  const h5 = hass(h4.states, { themes: { darkMode: true } });
  card.hass = h5;
  assert.equal(card.sets, 4, 'a change outside the states goes through');
  const h6 = hass({ ...h5.states, 'sensor.power': st('9') }, { themes: h5.themes });
  card.hass = h6;
  assert.equal(card.sets, 4, 'and the next foreign state change stays out again');
  assert.equal(card._hass, h6);

  // Setting _hass directly (button-card does inside its setter) drops the one kept aside.
  const h7 = hass(h6.states);
  card._hass = h7;
  assert.equal(card._hass, h7);
}

// ── Cards inside the card get every hass ──
{
  const { Card, patch } = make();
  patch();
  const outer = new Card({ template: 'casora_room' }, ['light.a']);
  // The inner card has no template of its own: it counts as Casora's because it sits in a Casora card.
  const inner = new Card({ name: 'badge' }, ['sensor.power']);
  const foreign = { n: 0, set hass(h) { this.n++; this.h = h; } };
  const h0 = hass(S0);
  outer.hass = h0;
  // button-card creates the inner cards when it draws, after the first hass.
  outer._cards = { badge: inner, other: foreign };
  inner.hass = h0; foreign.hass = h0;
  const h1 = hass({ ...S0, 'sensor.power': st('2') });
  outer.hass = h1;
  assert.equal(outer.sets, 1, 'outer card: nothing it watches changed');
  assert.equal(inner.sets, 2, 'inner card watches the changed entity: button-card gets it');
  assert.equal(foreign.n, 2, 'another element in the card gets every hass');
  assert.equal(foreign.h, h1);
  const h2 = hass({ ...h1.states, 'sensor.other': st('2') });
  outer.hass = h2;
  assert.equal(inner.sets, 2, 'inner card without a template: a foreign change stays out of it too');
  assert.equal(inner._hass, h2, 'inner card answers with the newest hass');
  assert.equal(foreign.n, 3);
}

// ── Not a Casora card, a card still setting up: untouched ──
{
  const { Card, patch } = make();
  patch();
  const own = new Card({ template: ['my_card'] }, []);
  own.hass = hass(S0);
  own.hass = hass({ ...S0, 'sensor.power': st('2') });
  assert.equal(own.sets, 2, 'a card without a Casora template gets every hass');
  const early = new Card({ template: ['casora_light'] }, []);
  early.hass = hass(S0);
  early._initialSetupComplete = false;
  early.hass = hass({ ...S0, 'sensor.power': st('2') });
  assert.equal(early.sets, 2, 'a card that has not finished its setup gets every hass');
}

// ── Another button-card (no _hass accessor): nothing is patched ──
{
  class Old { set hass(h) { this.h = h; } }
  const w = {};
  let ready;
  w.customElements = { get: () => Old, whenDefined: () => ({ then: (f) => { ready = f; } }) };
  new Function('window', 'customElements', core.slice(a, b))(w, w.customElements);
  const before = Object.getOwnPropertyDescriptor(Old.prototype, 'hass').set;
  ready();
  assert.equal(Object.getOwnPropertyDescriptor(Old.prototype, 'hass').set, before, 'unknown button-card stays as it is');
}

console.log('OK button_card_lazy_hass');
