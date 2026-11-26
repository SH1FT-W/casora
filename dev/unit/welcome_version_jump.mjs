// Prüfrunde w01-04: after a big version jump the What's new sheet listed only the last release's points without a
// word about the skipped ones, and after a downgrade it came up for the older version. Expected: a downgrade shows
// nothing; a jump over at least one release links "Everything new since <seen>"; the next release says "All changes".
//   node dev/unit/welcome_version_jump.mjs
// @deckt: custom_components/casora/panel/casora-panel-welcome.js#startMode,sinceText,verCmp
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel-welcome.js', import.meta.url), 'utf8');

function run(dashList, seen) {
  const store = new Map([['casora.studio.intro', '1']].concat(seen ? [['casora.seenVersion', seen]] : []));
  const storage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) };
  const timers = [];
  let shown = 0;
  const html = [];
  const panel = { _hass: { language: 'en' }, _dashList: dashList, isConnected: true };
  const doc = {
    querySelector: (q) => (q === 'casora-panel' ? panel : null), querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {},
    createElement: () => { shown++; return { setAttribute() {}, attachShadow: () => { const r = { querySelector: () => ({ addEventListener() {} }) };
      Object.defineProperty(r, 'innerHTML', { set: (v) => html.push(v) }); return r; }, remove() {} }; },
    body: { appendChild() {} },
  };
  // Object.keys(localStorage) reads the stored keys.
  const ls = new Proxy(storage, { ownKeys: () => [...store.keys()], getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }) });
  new Function('window', 'document', 'localStorage', 'setTimeout',
    src.replace(/import\.meta\.url/g, JSON.stringify('http://x/casora-panel-welcome.js?v=26.11.30.1')))({}, doc, ls, (f) => timers.push(f));
  while (timers.length) timers.shift()();
  const welcome = html.some((h) => h.includes('Welcome to Casora'));
  return { shown, html: html.join(''), seen: store.get('casora.seenVersion') };
}


const dash = [{ url_path: 'casora' }];
assert.equal(run(dash, '26.11.31').shown, 0, 'downgrade (seen a newer version): no sheet');
assert.equal(run(dash, '26.12.1').shown, 0, 'downgrade across months: no sheet');
const jump = run(dash, '26.11.10');
assert.equal(jump.shown, 1, 'jump: the sheet');
assert.ok(jump.html.includes('Everything new since 26.11.10'), 'jump: link names the gap');
const next = run(dash, '26.11.29');
assert.ok(next.html.includes('All changes') && !next.html.includes('since'), 'next release: plain link');
const beta = run(dash, '26.11.30b7');
assert.equal(beta.shown, 1, 'from the beta to the release: the sheet');
assert.ok(beta.html.includes('All changes'), 'from its own beta: plain link');
console.log('welcome_version_jump: ok');
