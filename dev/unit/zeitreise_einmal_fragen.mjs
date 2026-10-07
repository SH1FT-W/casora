// Zeitreise: Wiederherstellen fragt nur einmal (Nutzertest 4, P 5c).  node dev/unit/zeitreise_einmal_fragen.mjs
// Vorher: bei ungespeicherten Änderungen erst „Verwerfen?“, dann „Wiederherstellen?“ – und aus der
// Vorschau eines Stands stand dieselbe Verlustliste auf der Seite und noch einmal im Dialog.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const P = {};
const window = { __casoraPanelInternals: { extractAny: (c) => c } };
const customElements = { whenDefined: () => Promise.resolve(), get: () => ({ prototype: P }) };
const vsrc = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel-versions.js', import.meta.url), 'utf8');
new Function('window', 'customElements', 'document', 'localStorage', vsrc)(window, customElements, {}, { getItem: () => null, setItem() {} });
await new Promise((r) => setTimeout(r, 0));
assert.equal(typeof P._cvRestore, 'function', '_cvRestore fehlt');

async function run(dirty, o) {
  const asks = [];
  let discarded = 0, lossAsked = 0;
  const self = Object.create(P);
  Object.assign(self, {
    _state: {}, _isDirty: () => dirty, _discardDraft: () => { discarded++; },
    _ask: async (q) => { asks.push(q); return false; },
    _cvLossFor: async () => { lossAsked++; return ['Kachel entfernt: A']; },
    _cvLossBox: () => ({}), _hass: { language: 'de', locale: {} },
  });
  await self._cvRestore({ id: 'v1', ts: '2026-10-07T08:10:00Z' }, o);
  return { asks, discarded, lossAsked };
}
// Ungespeichert + aus der Liste: genau ein Dialog, der das Verwerfen nennt, mit Verlustliste
let r = await run(true);
assert.equal(r.asks.length, 1, 'nur eine Rückfrage');
assert.match(r.asks[0].message, /unsaved edits are discarded/);
assert.ok(r.asks[0].extend, 'Verlustliste im Dialog');
assert.equal(r.discarded, 0, 'abgebrochen → nichts verworfen');
// Aus der Vorschau (Liste steht schon auf der Seite): ein Dialog ohne zweite Liste
r = await run(false, { shown: true });
assert.equal(r.asks.length, 1);
assert.equal(r.asks[0].extend, undefined, 'keine zweite Verlustliste');
assert.equal(r.lossAsked, 0);
assert.doesNotMatch(r.asks[0].message, /discarded/);
// Der Knopf in der Vorschau übergibt shown
assert.match(vsrc, /this\._cvRestore\(peek\.v, \{ shown: true \}\)/);
// Scheitert das Wiederherstellen, bleibt Ungespeichertes erhalten (Review 1.1.1).
{
  let discarded = 0, err = '';
  const self = Object.create(P);
  Object.assign(self, {
    _state: {}, _isDirty: () => true, _discardDraft: () => { discarded++; },
    _ask: async () => true, _cvLossFor: async () => null, _cvLossBox: () => ({}),
    _cvError: (m) => { err = m; },
    _hass: { language: 'de', locale: {}, callWS: async () => { throw new Error('offline'); } },
  });
  await self._cvRestore({ id: 'v1', ts: '2026-10-07T08:10:00Z' });
  assert.match(err, /offline/);
  assert.equal(discarded, 0, 'Fehler beim Wiederherstellen → Änderungen nicht verworfen');
}
console.log('ok zeitreise_einmal_fragen');
