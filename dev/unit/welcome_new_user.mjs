// E12 (test 2): a new user (no Casora dashboard yet) never sees "New in Casora …" – even when casora.* keys from
// the dashboard scripts make the sheet think it is an update. Someone with a dashboard still gets the news.
//   node dev/unit/welcome_new_user.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel-welcome.js', import.meta.url), 'utf8');

function run(dashList) {
  const store = new Map([['casora.some.flag', '1']]);
  const storage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) };
  const timers = [];
  let shown = 0;
  const panel = { _hass: { language: 'en' }, _dashList: dashList, isConnected: true };
  const doc = {
    querySelector: (q) => (q === 'casora-panel' ? panel : null), querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {},
    createElement: () => { shown++; return { setAttribute() {}, attachShadow: () => ({ querySelector: () => ({ addEventListener() {} }) }), remove() {} }; },
    body: { appendChild() {} },
  };
  // Object.keys(localStorage) reads the stored keys.
  const ls = new Proxy(storage, { ownKeys: () => [...store.keys()], getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }) });
  new Function('window', 'document', 'localStorage', 'setTimeout',
    src.replace(/import\.meta\.url/g, JSON.stringify('http://x/casora-panel-welcome.js?v=26.11.1.1')))({}, doc, ls, (f) => timers.push(f));
  while (timers.length) timers.shift()();
  return { shown, seen: store.get('casora.seenVersion') };
}

const fresh = run([]);
assert.equal(fresh.shown, 0, 'no "New in Casora" for a new user');
assert.ok(fresh.seen, 'marked as seen, so it does not come after the first dashboard either');
assert.equal(run([{ url_path: 'casora' }]).shown, 1, 'an existing user still gets the news');
console.log('ok welcome: new users');

// E13: the Hemma line of the Studio's welcome says what Hemma is and only comes when one was found.
{
  const panel = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');
  const i = panel.indexOf('_welcomeScreen() {');
  const body = panel.slice(i, panel.indexOf('async _afterWelcome()', i));
  assert.ok(!body.includes('"Bring Your Hemma"'), 'no bare "Bring Your Hemma"');
  assert.ok(/if \(!moves\.length[^\n]*return;\n[\s\S]*Hemma, its predecessor/.test(body), 'explained, only after a find');
  console.log('ok welcome: Hemma line');
}
