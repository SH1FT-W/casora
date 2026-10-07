// „Wer sieht das?“: alle Schalter aus heißt nicht „alle sehen es“ (Review 1.1.1).
// Vorher wurde „niemand“ zu „ohne Einschränkung“ gespeichert – die Kachel war für alle sichtbar.
// Jetzt bleibt alles, wie es war, und ein Hinweis nennt den Weg (Kachel ausschalten).
//   node dev/unit/wer_sieht_niemand.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../custom_components/casora/' + p, import.meta.url), 'utf8');
class Panel {}
const ce = { whenDefined: () => Promise.resolve(), get: () => Panel };
new Function('window', 'customElements', 'requestAnimationFrame', 'setTimeout', read('panel/casora-panel-b-mehr.js'))(
  { document: {} }, ce, (f) => f(), (f) => f());
await new Promise((r) => setImmediate(r));
const P = Panel.prototype;
assert.equal(typeof P._mWhoSheet, 'function', '_mWhoSheet fehlt');

const users = [{ id: 'u1', name: 'Eins' }, { id: 'u2', name: 'Zwei' }];
async function run(cur, picked) {
  const self = Object.create(P);
  const toasts = [];
  let saved = null;
  // Dialog: Schalter setzen wie gewünscht, dann „Fertig“.
  Object.assign(self, {
    _mUsers: async () => users,
    _bToast: (m) => toasts.push(m),
    _ask: async ({ extend }) => {
      const sws = [];
      const mk = () => ({ className: '', classList: { add() {} }, setAttribute() {}, appendChild() {}, append() {}, textContent: '' });
      globalThis.document = { createElement: mk };
      self._boolSwitch = (on, def, change) => { const s = { on, change }; sws.push(s); return s; };
      extend({ box: { classList: { add() {} }, insertBefore() {} }, acts: {} });
      sws.forEach((s, i) => { const want = picked.includes(users[i].id); if (want !== s.on) s.change(want); });
      return true;
    },
  });
  await self._mWhoSheet(cur, 'Tile', (ids) => { saved = ids; });
  return { saved, toasts };
}

// Alle aus: nichts gespeichert, Hinweis.
let r = await run(['u1'], []);
assert.equal(r.saved, null, 'niemand an → nichts geändert (war: für alle sichtbar)');
assert.equal(r.toasts.length, 1, 'Hinweis');
// Einer an: nur er.
r = await run([], ['u2']);
assert.deepEqual(r.saved, ['u2']);
// Alle an: ohne Einschränkung.
r = await run(['u1'], ['u1', 'u2']);
assert.deepEqual(r.saved, []);
console.log('ok wer_sieht_niemand');
