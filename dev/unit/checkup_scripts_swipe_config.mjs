// Checkup 10/2026: Swipe-Karte – setConfig mit geänderten Karten baute nicht neu auf (_built blieb),
// die alten Karten blieben stehen. Erwartet: geänderte Konfiguration → Neuaufbau ab Karte 1,
// gleiche Konfiguration (HA ruft setConfig oft erneut) → nichts verwerfen.
//   node dev/unit/checkup_scripts_swipe_config.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
let Cls = null;
const sb = {
  window: { customCards: [] }, document: {}, HTMLElement: class {},
  customElements: { define: (x, c) => { Cls = c; }, get: () => null, whenDefined: () => Promise.resolve() },
  setInterval: () => 0, clearInterval() {},
};
const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-swipe-card.js', import.meta.url), 'utf8');
new Function(...Object.keys(sb), src)(...Object.values(sb));
const card = Object.create(Cls.prototype);
card.shadowRoot = {};
let builds = 0;
card._build = function () { builds++; if (!this._built) { this._built = true; this._cards = this._config.cards.slice(); } };

card.setConfig({ cards: [{ type: 'a' }, { type: 'b' }] });
assert.equal(builds, 1);
assert.deepEqual(card._cards, [{ type: 'a' }, { type: 'b' }]);
card._index = 1;
card.setConfig({ cards: [{ type: 'a' }, { type: 'b' }] });  // gleicher Inhalt, neues Objekt
assert.equal(card._built, true, 'gleich: kein Neuaufbau');
assert.equal(card._index, 1, 'gleich: Karte bleibt');
card._dots = ['d1', 'd2'];
card.setConfig({ cards: [{ type: 'c' }] });
assert.equal(card._index, 0, 'geändert: ab Karte 1');
assert.equal(card._dots, null, 'alte Punkte verworfen');
assert.deepEqual(card._cards, [{ type: 'c' }], 'geändert: neu aufgebaut');
assert.throws(() => card.setConfig({ cards: [] }));
console.log('ok swipe_config');
