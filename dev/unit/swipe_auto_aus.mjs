// B-JS-09: Swipe-Karte – wird sie während des Aufbaus wieder ausgehängt, startet kein Auto-Wischen,
// und ein laufendes Intervall beendet sich selbst, sobald die Karte nicht mehr im Dokument hängt.
//   node dev/unit/swipe_auto_aus.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
let Cls = null;
const timers = new Map(); let n = 0;
const sb = {
  window: { customCards: [] }, document: {}, HTMLElement: class {},
  customElements: { define: (x, c) => { Cls = c; }, get: () => null, whenDefined: () => Promise.resolve() },
  setInterval: (fn) => { timers.set(++n, fn); return n; }, clearInterval: (id) => timers.delete(id),
};
const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-swipe-card.js', import.meta.url), 'utf8');
new Function(...Object.keys(sb), src)(...Object.values(sb));
const card = Object.create(Cls.prototype);
Object.assign(card, { _config: { auto_swipe_interval: 5000 }, _cards: [1, 2], _index: 0, _goTo() {} });
Object.defineProperty(card, 'isConnected', { value: false, writable: true });
card._startAutoSwipe();
assert.equal(timers.size, 0, 'ausgehängt: kein Intervall');
card.isConnected = true;
card._startAutoSwipe();
assert.equal(timers.size, 1, 'eingehängt: Intervall läuft');
card.isConnected = false;
[...timers.values()][0]();
assert.equal(timers.size, 0, 'Intervall beendet sich nach dem Aushängen');
console.log('ok swipe_auto_aus');
