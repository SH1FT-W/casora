// Casora's designs in the browser (scripts/casora-theme.js), without HA.  node dev/unit/casora_theme_js.mjs
// HACS review (hacs/default#12143): no theme file, no HA theme registry. The integration serves the designs
// (theme.py) and this script applies them like HA applies a theme: --name for every value (base, then the
// light/dark mode), --rgb-name for hex colours, in one :root rule with !important. It also puts the design
// into the browser's copy of HA's theme list, where UIX looks up its theme styles by name.
import fs from 'node:fs';
import vm from 'node:vm';
import strict from 'node:assert/strict';

// Objects from the script's own realm (vm): compare plain copies.
const plain = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
const assert = Object.assign((...a) => strict(...a), strict, { deepEqual: (a, b, m) => strict.deepEqual(plain(a), plain(b), m) });

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-theme.js', import.meta.url), 'utf8');

const T = (bg, extra = {}) => ({
  'primary-color': '#03a9f4', 'rgb-own-color': '1,2,3', 'own-color': '#ffffff', 'uix-theme': 'X', 'casora-u': 'var(--x)',
  modes: { light: { 'primary-background-color': bg + 'L' }, dark: { 'primary-background-color': bg + 'D' } }, ...extra,
});

function env({ cache, hass }) {
  const store = new Map(Object.entries(cache ? { 'casora.theme.v1': JSON.stringify(cache) } : {}));
  const events = [];
  const rules = [];
  const mkRule = () => {
    const props = new Map();
    return { style: {
      setProperty(k, v, p) { props.set(k, [v, p]); },
      get cssText() { return [...props].map(([k, [v, p]]) => `${k}:${v}${p ? ' !' + p : ''}`).join(';'); },
      set cssText(x) { if (!x) props.clear(); },
      get: (k) => props.get(k),
      get size() { return props.size; },
    } };
  };
  const head = { appendChild(el) { el.isConnected = true; el.sheet = { cssRules: [mkRule()] }; rules.push(el.sheet.cssRules[0]); } };
  const attrs = new Set();
  const haEl = { hass };
  const doc = {
    head, documentElement: { toggleAttribute: (a, on) => (on ? attrs.add(a) : attrs.delete(a)) },
    querySelector: (s) => (s === 'home-assistant' ? haEl : null),
    createElement: () => ({ textContent: '', isConnected: false }),
    dispatchEvent: (e) => events.push(e),
  };
  const timers = [];
  const ctx = {
    document: doc, localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    MutationObserver: class { observe() {} },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    setTimeout: (fn) => timers.push(fn), setInterval: () => 0, Promise, JSON, parseInt, isNaN, String, Object, Array,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  const tick = async () => { for (let i = 0; i < 5; i++) { while (timers.length) timers.shift()(); await new Promise((r) => setImmediate(r)); } };
  return { api: ctx.casoraTheme, rule: () => rules[rules.length - 1], events, store, haEl, attrs, tick };
}

// 1. Cached design applies at once, before HA is there (no flash on reload)
{
  const e = env({ cache: { name: 'Casora', theme: T('c'), hash: 'h1', names: ['Casora', 'Casora Glas'], design: 'Casora' } });
  const s = e.rule().style;
  assert.deepEqual(s.get('--primary-background-color'), ['cL', 'important'], 'light mode from the cache');
  assert.deepEqual(s.get('--primary-color'), ['#03a9f4', 'important']);
  assert.deepEqual(s.get('--rgb-primary-color'), ['3,169,244', 'important'], 'rgb from hex, like HA');
  assert.equal(s.get('--rgb-own-color')[0], '1,2,3', 'own rgb value kept, not derived');
  assert.equal(s.get('--rgb-casora-u'), undefined, 'no rgb for non-hex');
  assert.equal(s.get('--modes'), undefined, 'modes are no variable');
  assert.ok(e.attrs.has('data-casora-design'));
  assert.equal(e.api.design(), 'Casora');
}

// 2. Subscription: the server's design wins, is registered for UIX and cached
{
  let cb, sentMsg;
  const sent = [];
  const conn = {
    sendMessagePromise: async (m) => { sent.push(m); return m.type === 'casora/theme/get' ? { name: m.name, theme: T('n'), hash: 'h3' } : null; },
    subscribeMessage: async (fn, m) => { cb = fn; sentMsg = m; return () => {}; },
  };
  const hass = { connection: conn, themes: { darkMode: false, themes: { Moonbeam: {} } } };
  const e = env({ cache: { name: 'Casora', theme: T('c'), hash: 'h1', names: ['Casora', 'Casora Glas', 'Casora Nebel'], design: 'Casora' }, hass });
  await e.tick();
  assert.deepEqual(sentMsg, { type: 'casora/theme/subscribe', hash: 'h1' }, 'sends the cached version');
  cb({ design: 'Casora Glas', names: ['Casora', 'Casora Glas', 'Casora Nebel'], hash: 'h2', theme: T('g') });
  assert.equal(e.rule().style.get('--primary-background-color')[0], 'gL', 'server design applied');
  assert.ok(hass.themes.themes['Casora Glas'], 'design in the browser copy of HA theme list (UIX)');
  assert.ok(e.events.some((x) => x.type === 'uix-update' && x.detail.reason === 'theme'), 'UIX told to look again');
  assert.equal(JSON.parse(e.store.get('casora.theme.v1')).name, 'Casora Glas', 'cached for the next load');

  // Dark mode
  hass.themes = { ...hass.themes, darkMode: true };
  e.api.apply();
  assert.equal(e.rule().style.get('--primary-background-color')[0], 'gD', 'dark mode values');
  assert.ok(hass.themes.themes['Casora Glas'], 'HA replaced its list: registered again');

  // The browser's own choice: old Casora name → today's design; own HA theme → none; "default" → installation
  hass.selectedTheme = { theme: 'Casora Nebel' };
  e.api.apply();
  await e.tick();
  assert.ok(sent.some((m) => m.type === 'casora/theme/get' && m.name === 'Casora Nebel'), 'other design fetched once');
  assert.equal(e.rule().style.get('--primary-background-color')[0], 'nD', 'browser design applied');
  hass.selectedTheme = { theme: 'Hemma 2' };
  assert.equal(e.api.active(hass), 'Casora Glas', 'Hemma 2 → Casora Glas');
  hass.selectedTheme = { theme: 'Moonbeam' };
  e.api.apply();
  assert.equal(e.api.active(hass), '', 'own HA theme: no Casora design');
  assert.equal(e.rule().style.size, 0, 'nothing applied over the own theme');
  assert.ok(!e.attrs.has('data-casora-design'));
  hass.themes.themes.Hemma = {};
  hass.selectedTheme = { theme: 'Hemma' };
  assert.equal(e.api.active(hass), '', 'Hemma\'s theme stays while HA has it');
  hass.selectedTheme = { theme: 'default' };
  assert.equal(e.api.active(hass), '', 'HA\'s built-in theme picked: no Casora design');
  hass.selectedTheme = { dark: true };
  assert.equal(e.api.active(hass), 'Casora Glas', 'no own choice → installation design');

  // Installation design "" (own theme) and setting it from the Studio
  cb({ design: '', names: ['Casora', 'Casora Glas', 'Casora Nebel'], hash: '' });
  assert.equal(e.api.active(hass), '');
  await e.api.set('Casora');
  assert.deepEqual(sent[sent.length - 1], { type: 'casora/theme/set', design: 'Casora' }, 'saved over the WebSocket');
  assert.equal(e.api.design(), 'Casora');
}

// 3. Nothing cached, nothing chosen: nothing applied
{
  const e = env({});
  assert.equal(e.rule().style.size, 0, 'no variables before anything is known');
  assert.equal(e.api.design(), undefined);
  assert.deepEqual(e.api.vars(null, true), {});
}
console.log('ok casora_theme_js');
