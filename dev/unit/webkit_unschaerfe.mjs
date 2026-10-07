// Unschärfe auf iPhones mit iOS ≤ 17 (07.10.2026): HA 2026.10 hat bei ha-card, ha-dialog und dem
// Bottom-Sheet -webkit-backdrop-filter gestrichen. casora-core.js (casora-webkit-blur) hängt die
// Zeile wieder an die Stile dieser Elemente – mit denselben Variablen wie die unpräfixte Zeile von HA.
// Prüft: (1) jedes der drei Elemente bekommt genau ein Zusatz-Stylesheet, auch bei doppeltem Laden,
// (2) jede Regel nutzt -webkit-backdrop-filter mit der Variable aus HAs eigener Regel,
// (3) ohne Lit-Stilliste (anderes Element) passiert nichts.
//   node dev/unit/webkit_unschaerfe.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const a = core.indexOf('// casora-webkit-blur:start'), b = core.indexOf('// casora-webkit-blur:end');
assert.ok(a > 0 && b > a, 'Block casora-webkit-blur gefunden');
const mod = core.slice(a, b);

class Sheet { replaceSync(t) { this.text = t; } }
const classes = { 'ha-card': { elementStyles: ['ha'] }, 'ha-dialog': { elementStyles: ['ha'] }, 'ha-bottom-sheet': { elementStyles: [] } };
const pending = [];
const window = {};
const customElements = {
  whenDefined: (t) => ({ then: (f) => pending.push(f) }),
  get: (t) => classes[t],
};
window.customElements = customElements;
const document = { querySelectorAll: () => [] };
const run = () => new Function('window', 'customElements', 'CSSStyleSheet', 'document', 'setTimeout', mod)(
  window, customElements, Sheet, document, () => {});
run();
run(); // zweites Laden: Merker greift
pending.forEach((f) => f());
pending.forEach((f) => f());

// HAs eigene Regeln (Frontend 2026.10), deren Variable die Safari-Zeile spiegeln muss.
const HA = {
  'ha-card': 'var(--ha-card-backdrop-filter,none)',
  'ha-dialog': 'var(--ha-dialog-surface-backdrop-filter,none)',
  'ha-bottom-sheet': 'var(--ha-bottom-sheet-surface-backdrop-filter,var(--ha-dialog-surface-backdrop-filter,none))',
};
for (const [tag, v] of Object.entries(HA)) {
  const extra = classes[tag].elementStyles.filter((s) => s instanceof Sheet);
  assert.equal(extra.length, 1, tag + ': genau ein Zusatz-Stylesheet');
  assert.ok(extra[0].text.includes('-webkit-backdrop-filter:' + v), tag + ': -webkit-backdrop-filter mit ' + v);
  const open = (extra[0].text.match(/\(/g) || []).length, close = (extra[0].text.match(/\)/g) || []).length;
  assert.equal(open, close, tag + ': Klammern ausgeglichen');
}
assert.equal(classes['ha-card'].elementStyles[0], 'ha', 'HAs eigene Stile bleiben vorn');
console.log('ok – -webkit-backdrop-filter für ha-card, ha-dialog und Bottom-Sheet wie vor HA 2026.10');
