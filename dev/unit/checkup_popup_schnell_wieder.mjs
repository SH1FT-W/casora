// Checkup 10/2026: casora-popup – ein Popup, das bis 400 ms nach dem Schließen des vorigen geöffnet
// wurde, ging verloren: open() hielt das schließende Popup für offen, das späte finish() räumte
// danach den neuen Inhalt ab. Erwartet: open() schließt ein laufendes Schließen erst fertig ab.
//   node dev/unit/checkup_popup_schnell_wieder.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const c0 = core.indexOf('    close() {');
const c1 = core.indexOf('\n    _dynamicCss(cfg) {', c0);
assert.ok(c0 > 0 && c1 > c0, 'close() gefunden');
const o = core.indexOf('    async open(data) {');
const head = core.slice(o, o + 500);
assert.ok(/if \(this\.hasAttribute\('closing'\) && this\._closeFinish\) this\._closeFinish\(\);[\s\S]*var wasOpen = this\.hasAttribute\('open'\);/.test(head),
  'open() schließt ein laufendes Schließen ab, bevor es wasOpen liest');

// close() echt ausführen, mit einfachen Attrappen.
const timers = [];
const env = {
  document: { removeEventListener() {}, documentElement: { style: {} } },
  window: { removeEventListener() {} },
  setTimeout: (fn) => { timers.push(fn); },
  CustomEvent: class { constructor(t) { this.type = t; } },
};
const Popup = new Function('document', 'window', 'setTimeout', 'CustomEvent',
  'return class {' + core.slice(c0, c1) + '\n}')(env.document, env.window, env.setTimeout, env.CustomEvent);
const p = new Popup();
const attrs = new Set(['open']);
const el = () => ({ textContent: 'x', hidden: false, style: { removeProperty() {} }, addEventListener() {} });
Object.assign(p, {
  hasAttribute: (n) => attrs.has(n), setAttribute: (n) => attrs.add(n), removeAttribute: (n) => attrs.delete(n),
  surface: el(), container: el(), _extra: el(), _dyn: el(), _bridge: {}, _headReset() {},
  dispatchEvent() {},
});
p.close();
assert.ok(attrs.has('closing') && attrs.has('open'), 'schließt (Animation läuft)');
assert.equal(typeof p._closeFinish, 'function', 'Abschluss gemerkt');
// Was open() jetzt tut: sofort fertig schließen.
p._closeFinish();
assert.ok(!attrs.has('open') && !attrs.has('closing'), 'fertig geschlossen');
assert.equal(p._closeFinish, null, 'Merker gelöscht');
// Das späte finish() (Zeitgeber) darf das danach geöffnete Popup nicht mehr abräumen.
attrs.add('open'); p.container.textContent = 'neu';
timers.forEach((fn) => fn());
assert.ok(attrs.has('open') && p.container.textContent === 'neu', 'neues Popup bleibt offen');
console.log('ok popup_schnell_wieder');
