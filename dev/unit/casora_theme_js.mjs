// Casora's designs in the browser (scripts/casora-theme.js), without HA.  node dev/unit/casora_theme_js.mjs
// HACS review (hacs/default#12143): no theme file, no HA theme registry. The integration serves the designs
// (theme.py) and this script applies them like HA applies a theme: --name for every value (base, then the
// light/dark mode), --rgb-name for hex colours, in one :root rule with !important. It also puts the design
// into the browser's copy of HA's theme list, where UIX looks up its theme styles by name and HA's profile
// theme picker lists them. Owner report on 26.10.60b2: a profile theme named after a Casora design (theme-file
// era) or HA's "default" hid every Studio choice. Which design shows: profile design > real other HA theme >
// installation design (also for Backend-selected, unknown and old names); HA's "default" picked = HA's look, but a
// "default" written by the Studio of 26.10.60b1 is migrated to Backend-selected once per user.
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

function env({ cache, cache2, hass, updateHass = false }) {
  const store = new Map(Object.entries(cache ? { 'casora.theme.v1': JSON.stringify(cache) } : {}));
  if (cache2) store.set('casora.theme.v2', JSON.stringify(cache2));
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
  const settheme = [];
  const updates = [];
  const haEl = { hass, dispatchEvent: (e) => { if (e.type === 'settheme') { settheme.push(e.detail.theme);
    haEl.hass.selectedTheme = { ...(haEl.hass.selectedTheme || {}), ...e.detail }; } } };
  // HA's root element: _updateHass hands out a new hass (as HA does)
  if (updateHass) haEl._updateHass = (patch) => { updates.push(patch); haEl.hass = { ...haEl.hass, ...patch }; };
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
  return { api: ctx.casoraTheme, rule: () => rules[rules.length - 1], events, store, haEl, attrs, tick, settheme, updates };
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
  const cached = JSON.parse(e.store.get('casora.theme.v2'));
  assert.ok(cached.themes['Casora Glas'] && cached.design === 'Casora Glas', 'cached for the next load');
  await e.tick();
  assert.ok(sent.some((m) => m.type === 'casora/theme/get' && m.name === 'Casora Nebel'), 'the other designs are loaded too (HA picker)');
  assert.ok(['Casora', 'Casora Glas', 'Casora Nebel'].every((n) => hass.themes.themes[n]), 'all designs in HA\'s list');
  assert.ok(hass.themes.themes.Moonbeam, 'HA\'s own themes stay');

  // Dark mode
  hass.themes = { ...hass.themes, darkMode: true };
  e.api.apply();
  assert.equal(e.rule().style.get('--primary-background-color')[0], 'gD', 'dark mode values');
  assert.ok(hass.themes.themes['Casora Glas'], 'HA replaced its list: registered again');

  // The profile's choice: a design wins; old name, "default", nothing, unknown → installation; own theme → none
  hass.selectedTheme = { theme: 'Casora Nebel' };
  e.api.apply();
  await e.tick();
  assert.equal(e.rule().style.get('--primary-background-color')[0], 'nD', 'profile design applied');
  assert.equal(sent.filter((m) => m.type === 'casora/theme/get' && m.name === 'Casora Nebel').length, 1, 'fetched once');
  assert.equal(e.api.active({ ...hass, selectedTheme: { theme: 'Hemma 2' } }), 'Casora Glas', 'old name, installation design Casora Glas');
  assert.equal(e.api.active({ ...hass, selectedTheme: { theme: 'Casora Weich' } }), 'Casora Glas', 'stale Casora Weich does not hide the installation design');
  assert.equal(e.api.active({ ...hass, selectedTheme: { theme: 'Gone Theme' } }), 'Casora Glas', 'a name HA no longer has → installation');
  assert.equal(e.api.active({ ...hass, selectedTheme: { theme: '' } }), 'Casora Glas', 'Backend-selected → installation');
  hass.selectedTheme = { theme: 'Moonbeam' };
  e.api.apply();
  assert.equal(e.api.active(hass), '', 'own HA theme: no Casora design');
  assert.equal(e.rule().style.size, 0, 'nothing applied over the own theme');
  assert.ok(!e.attrs.has('data-casora-design'));
  hass.themes.themes.Hemma = {};
  hass.selectedTheme = { theme: 'Hemma' };
  assert.equal(e.api.active(hass), '', 'Hemma\'s theme stays while HA has it');
  hass.selectedTheme = { theme: 'default' };
  assert.equal(e.api.active(hass), '', 'HA\'s built-in theme ("Home Assistant") picked: no Casora design');
  hass.selectedTheme = { dark: true };
  assert.equal(e.api.active(hass), 'Casora Glas', 'no own choice → installation design');

  // Installation design "" (own theme): an old name maps to today's design
  cb({ design: '', names: ['Casora', 'Casora Glas', 'Casora Nebel'], hash: '' });
  assert.equal(e.api.active(hass), '');
  assert.equal(e.api.active({ ...hass, selectedTheme: { theme: 'Hemma 2' } }), 'Casora Glas', 'no installation design: Hemma 2 → Casora Glas');
  assert.equal(e.api.active({ ...hass, selectedTheme: { theme: 'default' } }), '', '"default" without installation design: none');
  await e.api.set('Casora');
  assert.deepEqual(sent[sent.length - 1], { type: 'casora/theme/set', design: 'Casora' }, 'saved over the WebSocket');
  assert.equal(e.api.design(), 'Casora');
}

// 4. Owner's path: profile names a design (theme-file era), HA's picker, Studio pick, migration
{
  let cb;
  const sent = [];
  const userData = {};
  const conn = {
    sendMessagePromise: async (m) => {
      sent.push(m);
      if (m.type === 'casora/theme/get') return { name: m.name, theme: T(m.name[7] || 'c'), hash: 'x' + m.name };
      if (m.type === 'frontend/get_user_data') return { value: userData[m.key] ?? null };
      if (m.type === 'frontend/set_user_data') { userData[m.key] = m.value; return null; }
      return null;
    },
    subscribeMessage: async (fn) => { cb = fn; return () => {}; },
  };
  const own = { 'primary-color': '#000' };
  const list = { Moonbeam: own };
  const hass = { connection: conn, user: { id: 'u' }, selectedTheme: { theme: 'Casora' }, themes: { darkMode: false, themes: list } };
  const e = env({ hass, updateHass: true });
  await e.tick();
  const names = ['Casora', 'Casora Glas', 'Casora Nebel'];
  cb({ design: 'Casora', names, hash: 'h', hashes: { Casora: 'h' }, theme: T('c') });
  await e.tick();
  const h = () => e.haEl.hass;
  assert.ok(e.updates.length > 0, 'designs handed to HA as a new theme list (picker is memoised on it)');
  assert.notEqual(h().themes.themes, list, 'new list object');
  assert.ok(names.every((n) => h().themes.themes[n]) && h().themes.themes.Moonbeam === own, 'designs + own theme in the list');
  assert.deepEqual(e.settheme, [], 'profile "Casora" = installation design stays (the Studio writes it there)');
  assert.equal(userData.casora_theme_profile, true, 'migration remembered per user');
  assert.equal(e.api.active(h()), 'Casora');

  // Profile picks another design in HA's picker: it wins for this user
  h().selectedTheme = { theme: 'Casora Nebel' };
  e.api.apply();
  assert.equal(e.api.active(h()), 'Casora Nebel');
  // Studio pick: written into this user's profile too, so HA's picker names it
  await e.api.set('Casora Glas');
  assert.deepEqual(e.settheme, ['Casora Glas'], 'Studio pick → profile shows the design');
  assert.equal(e.api.active(h()), 'Casora Glas');
  assert.equal(e.rule().style.get('--primary-background-color')[0], 'GL', 'Studio pick applied at once');
  // A real theme of the user's own wins over everything
  h().selectedTheme = { theme: 'Moonbeam' };
  e.api.apply();
  assert.equal(e.api.active(h()), '');
  assert.equal(e.rule().style.size, 0, 'no Casora design over the own theme');
  // Studio "own theme" ("") keeps an own profile theme
  await e.api.set('');
  assert.deepEqual(e.settheme, ['Casora Glas'], 'own theme stays in the profile');
  // Old name of the theme-file era in the profile: rewritten (installation design set → Backend-selected)
  await e.api.set('Casora');
  h().selectedTheme = { theme: 'Hemma 2' };
  e.api.apply();
  assert.equal(e.settheme[e.settheme.length - 1], '', 'Hemma 2 → Backend-selected');
  assert.equal(e.api.active(h()), 'Casora');
  // HA replaces its list (themes_updated): designs put back
  e.haEl.hass = { ...h(), themes: { ...h().themes, themes: { Moonbeam: own } } };
  e.api.apply();
  assert.ok(names.every((n) => h().themes.themes[n]), 'designs back after HA reloaded its themes');
  // "default" written by the Studio of 26.10.60b1: migrated once per user
  delete userData.casora_theme_profile;
  const e3 = env({ hass: { ...hass, selectedTheme: { theme: 'default' } }, updateHass: true });
  await e3.tick();
  cb({ design: 'Casora', names, hash: 'h', hashes: {}, theme: T('c') });
  await e3.tick();
  assert.deepEqual(e3.settheme, [''], '"default" of 26.10.60b1 → Backend-selected');
  assert.equal(e3.api.active(e3.haEl.hass), 'Casora');
  // Second page load: migration not again
  const e2 = env({ hass: { ...hass, selectedTheme: { theme: 'default' } }, updateHass: true });
  await e2.tick();
  cb({ design: 'Casora', names, hash: 'h', hashes: {}, theme: T('c') });
  await e2.tick();
  assert.deepEqual(e2.settheme, [], 'per-user migration runs once');
  assert.equal(e2.api.active(e2.haEl.hass), '', 'afterwards "Home Assistant" picked in the profile is HA\'s look');
}

// 4b. Register guard (lag report after 26.10.60b2): _updateHass redraws the whole frontend, so the designs go to
// HA's theme list once per list, never from inside the own call, and at most 3 times in 10 s even when something
// copies the theme objects into a new list on every update (a loop register → _updateHass → apply → register).
{
  const names = ['Casora', 'Casora Glas'];
  const cache2 = { themes: { Casora: T('c'), 'Casora Glas': T('g') }, hashes: { Casora: 'h', 'Casora Glas': 'g' }, names, design: 'Casora' };
  const fresh = () => ({ selectedTheme: { theme: 'Casora' }, themes: { darkMode: false, themes: { Moonbeam: { 'primary-color': '#000' } } } });
  // a. Plain HA: one hand-over, then nothing however often apply() runs (interval, html style changes).
  {
    const e = env({ cache2, hass: fresh(), updateHass: true });
    e.api.apply();
    const n = e.updates.length;
    assert.ok(n >= 1 && names.every((x) => e.haEl.hass.themes.themes[x]), 'designs handed to HA');
    for (let i = 0; i < 20; i++) e.api.apply();
    assert.equal(e.updates.length, n, 'no further _updateHass for a completed list');
    assert.equal(e.api.registerStats().updates, n, 'counted');
    // HA reloads its themes (new list without the designs): handed over once more
    e.haEl.hass = { ...e.haEl.hass, themes: { ...e.haEl.hass.themes, themes: { Moonbeam: {} } } };
    e.api.apply(); e.api.apply();
    assert.equal(e.updates.length, n + 1, 'a new list from HA: once again');
  }
  // b. Something copies the theme objects on every update: at most 3 hand-overs, then filled in place.
  {
    const e = env({ cache2, hass: fresh(), updateHass: true });
    e.haEl._updateHass = (patch) => {
      e.updates.push(patch);
      const p = patch.themes ? { ...patch, themes: { ...patch.themes, themes: JSON.parse(JSON.stringify(patch.themes.themes)) } } : patch;
      e.haEl.hass = { ...e.haEl.hass, ...p };
    };
    // HA's list now holds copies of the designs (other objects than Casora's)
    e.haEl.hass = { ...e.haEl.hass, themes: { ...e.haEl.hass.themes, themes: JSON.parse(JSON.stringify(e.haEl.hass.themes.themes)) } };
    for (let i = 0; i < 30; i++) e.api.apply();
    assert.ok(e.updates.length <= 3, 'copying list: at most 3 _updateHass in 10 s (' + e.updates.length + ')');
    assert.ok(e.api.registerStats().inPlace >= 1, 'then filled in place');
    const n = e.updates.length;
    for (let i = 0; i < 30; i++) e.api.apply();
    assert.equal(e.updates.length, n, 'and it stays quiet');
    assert.ok(names.every((x) => e.haEl.hass.themes.themes[x]), 'designs still in HA\'s list');
  }
  // c. _updateHass that applies again right away (synchronous observer): no nested hand-over.
  {
    const e = env({ cache2, hass: fresh(), updateHass: true });
    const orig = e.haEl._updateHass;
    let depth = 0, maxDepth = 0;
    e.haEl._updateHass = (patch) => {
      depth++; maxDepth = Math.max(maxDepth, depth);
      orig({ ...patch, themes: patch.themes && { ...patch.themes, themes: { ...patch.themes.themes, Other: {} } } });
      e.haEl.hass = { ...e.haEl.hass, themes: { ...e.haEl.hass.themes, themes: { Moonbeam: {} } } };
      e.api.apply();
      depth--;
    };
    e.haEl.hass = { ...e.haEl.hass, themes: { ...e.haEl.hass.themes, themes: { Moonbeam: {} } } };
    e.api.apply();
    assert.equal(maxDepth, 1, 'never from inside its own _updateHass');
  }
  // d. A newer version of a design (hash changed) in a completed list still reaches HA's list.
  {
    let cb;
    const conn = { sendMessagePromise: async () => null, subscribeMessage: async (fn) => { cb = fn; return () => {}; } };
    const e = env({ cache2, hass: { ...fresh(), connection: conn }, updateHass: true });
    await e.tick();
    cb({ design: 'Casora', names, hash: 'h2', hashes: { Casora: 'h2', 'Casora Glas': 'g' }, theme: T('new') });
    await e.tick();
    assert.equal(e.haEl.hass.themes.themes.Casora['primary-background-color'], undefined);
    assert.equal(e.haEl.hass.themes.themes.Casora.modes.light['primary-background-color'], 'newL', 'new version in HA\'s list');
  }
}

// 5. Cache v2: all designs at once on the next load; outdated ones fetched again
{
  const e = env({ cache2: { themes: { Casora: T('c'), 'Casora Nebel': T('n') }, hashes: { Casora: 'a', 'Casora Nebel': 'old' },
    names: ['Casora', 'Casora Nebel'], design: 'Casora Nebel' } });
  assert.equal(e.rule().style.get('--primary-background-color')[0], 'nL', 'cached design applies before HA is there');
  assert.ok(e.api.theme('Casora'), 'other designs cached too');
}

// 3. Nothing cached, nothing chosen: nothing applied
{
  const e = env({});
  assert.equal(e.rule().style.size, 0, 'no variables before anything is known');
  assert.equal(e.api.design(), undefined);
  assert.deepEqual(e.api.vars(null, true), {});
}
console.log('ok casora_theme_js');
