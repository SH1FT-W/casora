// Popup-Layouts (K.layout in 05-weich-mehr.js, H.layout/H.col in 02-geraete.js): jede innere button-card wertet ihre
// Vorlagen selbst aus (do_not_eval: true). Sonst wertet die äußere Karte sie mit aus, beobachtet so deren Entitäten
// und ruft bei jeder Inhaltsänderung setConfig auf die Spalte auf – button-card legt dann alle Bereiche neu an,
// sie blitzen kurz leer auf (17.10.2026: Pulse → Gerät → „Verlauf“ flackerte; davor schon das Licht-Popup).
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.innerWidth = 1400;
globalThis.document = { querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {}, head: { appendChild: () => {} },
  createElement: () => ({ style: {}, setAttribute: () => {}, appendChild: () => {} }), documentElement: { style: {} } };
globalThis.customElements = { get: () => null, define: () => {}, whenDefined: () => Promise.resolve() };
globalThis.addEventListener = () => {};
const src = (p) => fs.readFileSync(new URL('../../custom_components/casora/scripts/local/' + p, import.meta.url), 'utf8');

// Alle verschachtelten Karten-Felder einer Karte (rekursiv) einsammeln.
const nested = (card, path = 'aussen', out = []) => {
  Object.entries((card && card.custom_fields) || {}).forEach(([k, f]) => {
    if (f && typeof f === 'object' && f.card) {
      out.push({ path: path + '.' + k, f });
      nested(f.card, path + '.' + k, out);
    }
  });
  return out;
};
const bad = (card) => nested(card).filter((x) => x.f.card.type === 'custom:button-card' && x.f.do_not_eval !== true).map((x) => x.path);

// K.layout
new Function(src('05-weich-mehr.js'))();
const K = window._casoraSoftKit;
assert.ok(K && K.layout && K.secCard, 'K geladen');
const sec = (n) => K.secCard(['sensor.x'], 'return "' + n + '";', { 'sensor.x': { state: '1' } });
const chart = { type: 'custom:casora-chart', series: [] };
for (const w of [1400, 500]) {
  globalThis.innerWidth = w;
  const lay = K.layout({ fields: { hero: { card: sec('h') }, chart: { card: chart }, vals: { card: sec('v') }, tl: { card: sec('t') }, more: { card: sec('m') } },
    top: ['hero', 'chart'], left: ['vals'], right: ['tl', 'more'] });
  assert.deepEqual(bad(lay), [], 'K.layout (' + w + ' px): innere button-cards mit do_not_eval');
  assert.ok(nested(lay).length >= 4, 'K.layout hat verschachtelte Karten');
  const ch = nested(lay).find((x) => x.f.card.type === 'custom:casora-chart');
  assert.ok(ch && ch.f.do_not_eval === undefined, 'andere Kartentypen bleiben unverändert');
}
globalThis.innerWidth = 1400;

// H.layout (Geräte-Popups)
try { new Function(src('02-geraete.js'))(); } catch (e) { /* Rest braucht DOM – H ist vorher angelegt */ }
const H = window._casoraHH;
assert.ok(H && H.layout && H.own, 'H geladen');
const hl = H.layout({ fields: { top: '[[[ return "k"; ]]]', a: '[[[ return "a"; ]]]', b: { card: sec('b') }, more: { card: sec('m') } },
  top: ['top'], left: ['a'], right: ['b', 'more'], watch: ['sensor.x'], entity: 'sensor.x' });
assert.deepEqual(bad(hl), [], 'H.layout: innere button-cards mit do_not_eval');
assert.ok(nested(hl).length >= 3, 'H.layout hat verschachtelte Karten');
console.log('popup_do_not_eval: ok');
