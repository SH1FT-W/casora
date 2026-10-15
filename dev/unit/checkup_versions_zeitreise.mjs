// Zeitreise (Rewind): Fehlerzweige von _cvShow und der Pfeiltasten-Listener.
//   node dev/unit/checkup_versions_zeitreise.mjs
// Checkup 10/2026: (1) Ließ sich ein Stand nicht lesen oder nicht darstellen, blieb die vorherige
// Vorschau samt „Diese Version wiederherstellen“ stehen – der Knopf stellte den vorher gezeigten
// Stand her. (2) Der keydown-Listener an window wurde nie abgemeldet (HA baut das Panel neu).
import fs from 'node:fs';
import assert from 'node:assert/strict';

let resolveDef;
const P = {};
const window = {
  __casoraPanelInternals: { extractAny: (cfg) => JSON.parse(JSON.stringify(cfg)) },
  addEventListener: (type) => { window.direct.push(type); },
  direct: [],
};
const customElements = {
  whenDefined: () => new Promise((r) => { resolveDef = r; }),
  get: () => ({ prototype: P }),
};
const vsrc = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel-versions.js', import.meta.url), 'utf8');
new Function('window', 'customElements', vsrc)(window, customElements);
resolveDef();
await new Promise((r) => setTimeout(r, 0));
assert.equal(typeof P._cvShow, 'function', '_cvShow fehlt');

// Mini-Panel: zählt, was _cvShow aufruft.
function panel() {
  const cls = new Set();
  const calls = [];
  const p = Object.create(P);
  Object.assign(p, {
    classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c) },
    shadowRoot: { querySelector: () => null, querySelectorAll: () => [] },
    _cvPaintRows() {}, _cvBanner() { calls.push('banner'); }, _cvActions() { calls.push('actions:' + (this._cvPeek ? this._cvPeek.v.id : '-')); },
    _rebuildPreview() { calls.push('preview'); }, _cvError(m) { calls.push('error'); this.err = m; },
    _dashUrl: 'test-dash', cls, calls,
  });
  return p;
}
const rooms = { compact: { rooms: [{ path: 'home', name: 'Home', tiles: [] }] } };
const old = { id: 'v1' };

// Stand nicht darstellbar (keine Räume): Vorschau weg, keine „Wiederherstellen“-Aktion für v1.
{
  const p = panel();
  p._cvPeek = { v: old, state: rooms }; p.cls.add('cv-peek');
  p._cvCache = { v2: { config: { compact: { rooms: [] } } } };
  await p._cvShow({ id: 'v2' });
  assert.equal(p._cvPeek, null, 'Vorschau-Stand muss weg');
  assert.equal(p.cls.has('cv-peek'), false);
  assert.ok(p.calls.includes('preview') && p.calls.includes('banner'), 'Vorschau/Banner neu');
  assert.ok(p.calls.includes('actions:-'), 'Aktionen ohne Vorschau-Stand');
  assert.ok(p.calls.includes('error'));
}

// Lesefehler: genauso.
{
  const p = panel();
  p._cvPeek = { v: old, state: rooms };
  p._hass = { callWS: async () => { throw new Error('weg'); } };
  await p._cvShow({ id: 'v3' });
  assert.equal(p._cvPeek, null);
  assert.ok(p.calls.includes('actions:-'));
}

// Später angekommener Lesefehler eines überholten Aufrufs ändert nichts.
{
  const p = panel();
  let fail;
  p._hass = { callWS: () => new Promise((_, rej) => { fail = rej; }) };
  const slow = p._cvShow({ id: 'v4' });
  p._cvCache = { v1: { config: rooms } };
  await p._cvShow(old);
  assert.equal(p._cvPeek.v.id, 'v1');
  p.calls.length = 0;
  fail(new Error('spät'));
  await slow;
  assert.equal(p._cvPeek.v.id, 'v1', 'überholter Fehler darf die Vorschau nicht löschen');
  assert.deepEqual(p.calls, []);
}

// Pfeiltasten-Listener über _gOn (disconnectedCallback meldet ab), nur einmal.
{
  const p = panel();
  const reg = [];
  p._gOn = (t, type, fn) => reg.push([t, type, fn]);
  p._cvRender = () => {}; p._cvSideRow = () => {};
  p._cvOpenPage(); p._cvOpenPage();
  assert.equal(reg.length, 1);
  assert.equal(reg[0][0], window); assert.equal(reg[0][1], 'keydown');
  assert.deepEqual(window.direct, [], 'nicht direkt an window');
}
console.log('ok checkup_versions_zeitreise');
