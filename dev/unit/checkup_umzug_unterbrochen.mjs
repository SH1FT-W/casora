// Umzug: Merker „unterbrochen“ nach gescheitertem Import und „Aufräumen“ nur für Halbfertiges.
//   node dev/unit/checkup_umzug_unterbrochen.mjs
// Checkup 10/2026: Scheiterte der Import (Fehlermeldung statt Fertig), blieb der Merker stehen.
// Beim nächsten Öffnen bot das Studio „Aufräumen“ an und löschte jedes Dashboard unter der
// gemerkten Adresse mit passendem Titel – auch ein später neu angelegtes, fertiges.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const store = {};
globalThis.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
const P = {};
globalThis.customElements = { whenDefined: () => Promise.resolve(), get: () => ({ prototype: P }) };
window.__casoraPanelInternals = { FINGERPRINT_KEY: 'casora_fp', fingerprintOf: (o) => o };
const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel-umzug.js', import.meta.url), 'utf8')
  .replace('new URL("./hemma-originals.json", import.meta.url).href', '"x"');
new Function(src)();
await new Promise((r) => setTimeout(r, 0));
const { halfLeft } = window.casoraUmzug;
const KEY = 'casora.umzug.pending';

// ── halfLeft: nur ohne gespeicherte Konfiguration oder ohne Seiten ──
const pend = { src: 'hemma', target: 'mein-zuhause', title: 'Mein Zuhause' };
const list = [
  { id: 'a', mode: 'storage', url_path: 'mein-zuhause', title: 'Mein Zuhause' },
  { id: 'b', mode: 'storage', url_path: 'mein-zuhause-mobile', title: 'Mein Zuhause Mobile' },
  { id: 'c', mode: 'storage', url_path: 'anderes', title: 'Mein Zuhause' },
  { id: 'd', mode: 'storage', url_path: 'mein-zuhause', title: 'Fremd' },
];
const hassWith = (cfgs) => ({ callWS: async (m) => {
  assert.equal(m.type, 'lovelace/config');
  const c = cfgs[m.url_path];
  if (c instanceof Error) throw c;
  return c;
} });
const notFound = Object.assign(new Error('No config found.'), { code: 'config_not_found' });
const full = { views: [{ path: 'home', cards: [{ template: 'casora_room' }] }] };
const ids = async (cfgs) => (await halfLeft(hassWith(cfgs), pend, list)).map((d) => d.id);

assert.deepEqual(await ids({ 'mein-zuhause': notFound, 'mein-zuhause-mobile': notFound }), ['a', 'b'], 'ohne Konfiguration → aufräumen');
assert.deepEqual(await ids({ 'mein-zuhause': { views: [] }, 'mein-zuhause-mobile': notFound }), ['a', 'b'], 'leer → aufräumen');
assert.deepEqual(await ids({ 'mein-zuhause': full, 'mein-zuhause-mobile': full }), [], 'fertiges Dashboard bleibt');
assert.deepEqual(await ids({ 'mein-zuhause': full, 'mein-zuhause-mobile': notFound }), ['b'], 'nur das halbfertige Handy-Dashboard');
assert.deepEqual(await ids({ 'mein-zuhause': new Error('Verbindung weg'), 'mein-zuhause-mobile': full }), [], 'Lesefehler → bleibt');

// ── Gescheiterter Import: Merker weg, _flowDone zurück ──
const origDone = function () { throw new Error('Fertig darf hier nicht kommen'); };
const panel = (importFn) => {
  const p = Object.create(P);
  Object.assign(p, {
    _hass: { states: {}, callWS: async (m) => (m.type === 'casora/hemma/status' ? { installed: false } : {}) },
    _flowDone: origDone,
    _flowPath: () => 'mein-zuhause',
    _bundleOnce: async () => ({ templates: {} }),
    _import: importFn,
  });
  return p;
};
const a = () => ({ c: { url_path: 'hemma', title: 'Hemma' }, newTitle: 'Mein Zuhause', groups: [], unchanged: [], cfg: { views: [] } });

let during = null;
let p = panel(async function () { during = store[KEY]; /* Fehlerbildschirm, kein _flowDone */ });
await p._casoraUmzugRun(a(), {});
assert.ok(during && JSON.parse(during).target === 'mein-zuhause', 'Merker steht während des Imports');
assert.equal(store[KEY], undefined, 'Merker nach gescheitertem Import weg');
assert.equal(p._flowDone, origDone);

p = panel(async function () { throw new Error('kaputt'); });
await assert.rejects(p._casoraUmzugRun(a(), {}));
assert.equal(store[KEY], undefined, 'Merker auch nach Ausnahme weg');
assert.equal(p._flowDone, origDone);

console.log('ok checkup_umzug_unterbrochen');
process.exit(0);
