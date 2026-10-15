// Checkup 10/2026: casora-popup – ein später Neuaufbau (ll-rebuild, whenDefined, langsames
// createCardElement) der vorigen Runde überschrieb ein inzwischen geöffnetes anderes Popup.
// Erwartet: open() zählt die Runde hoch, _buildCard verwirft alles aus einer älteren Runde.
//   node dev/unit/checkup_scripts_popup_runde.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const a = core.indexOf('    async _buildCard(config, host) {');
const b = core.indexOf('\n    _syncTargets() {', a);
assert.ok(a > 0 && b > a, '_buildCard gefunden');
const o = core.indexOf('    async open(data) {');
assert.ok(/this\._openGen = \(this\._openGen \|\| 0\) \+ 1;/.test(core.slice(o, o + 600)), 'open() zählt die Runde hoch');

let made = [];
let pending = null;
const helpers = {
  createCardElement: (cfg) => {
    const el = { cfg, localName: 'hui-test-card', ls: {}, addEventListener(t, fn) { this.ls[t] = fn; } };
    made.push(el);
    if (pending) return pending.then(() => el);
    return el;
  },
};
const whenDef = [];
const customElements = { get: () => null, whenDefined: () => new Promise((r) => { whenDef.push(r); }) };
const document = { querySelector: () => null };
const Popup = new Function('cardHelpers', 'customElements', 'document',
  'return class {' + core.slice(a, b) + '\n}')(() => Promise.resolve(helpers), customElements, document);

const mk = () => {
  const p = new Popup();
  const kids = [];
  p.container = { kids, set textContent(v) { kids.length = 0; }, appendChild(x) { kids.push(x); } };
  p._bridge = { _provided: true, hass: {} };
  p._syncTargets = () => {};
  p._open = true;
  p.hasAttribute = (n) => n === 'open' && p._open;
  p._openGen = 1;
  return p;
};
const tick = () => new Promise((r) => setTimeout(r, 0));

// ll-rebuild und whenDefined aus Runde 1 kommen nach dem Öffnen von Runde 2.
{
  const p = mk();
  await p._buildCard({ type: 'a' });
  assert.equal(p.container.kids[0].cfg.type, 'a');
  const old = made.at(-1);
  p._openGen = 2;                               // anderes Popup geöffnet
  await p._buildCard({ type: 'b' });
  assert.equal(p.container.kids[0].cfg.type, 'b');
  const n = made.length;
  old.ls['ll-rebuild']();
  whenDef[0]();                                 // whenDefined der Runde 1
  await tick(); await tick();
  assert.equal(made.length, n, 'kein Neuaufbau aus alter Runde');
  assert.equal(p.container.kids[0].cfg.type, 'b', 'neues Popup bleibt');
  // Gleiche Runde: Neuaufbau weiter erlaubt.
  made.at(-1).ls['ll-rebuild']();
  await tick(); await tick();
  assert.equal(made.length, n + 1, 'Neuaufbau in derselben Runde');
  assert.equal(p.container.kids[0].cfg.type, 'b');
}
// Langsames createCardElement: Runde wechselt währenddessen → nichts einsetzen.
{
  const p = mk();
  let go; pending = new Promise((r) => { go = r; });
  const q = p._buildCard({ type: 'langsam' });
  await tick();
  p._openGen = 2;
  pending = null;
  await p._buildCard({ type: 'neu' });
  go(); await q;
  assert.equal(p.container.kids.length, 1);
  assert.equal(p.container.kids[0].cfg.type, 'neu', 'späte Karte überschreibt nicht');
}
console.log('ok Popup-Runde');
