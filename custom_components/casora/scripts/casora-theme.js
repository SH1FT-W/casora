// Casora's designs on every page (theme.py). Loaded by Home Assistant itself on every page
// (frontend.add_extra_js_url), not as a dashboard resource.
//
// Home Assistant has no API for an integration to add a theme, so the integration serves its designs and
// this script applies the chosen one the way HA applies a theme: every value as a CSS variable --name
// (plus --rgb-name for hex colours), base values first, then those of the current light/dark mode.
// They sit in one `:root` rule with !important: HA keeps its own theme inline on <html>, the rule wins over
// it without both writing the same inline style.
//
// All designs are also put into the browser's copy of HA's theme list (hass.themes.themes): HA's profile
// theme picker lists them, HA applies one picked there like any theme, and UIX looks up its theme styles
// (uix-*, card-mod-*) by name there. Nothing is written to HA's configuration for that.
//
// Which design this browser shows (active()):
//   • the user's profile theme names a Casora design → that design (a deliberate choice of this user);
//   • it names another theme HA really has, or HA's built-in one ("default", "Home Assistant" in the picker)
//     → none (a deliberate choice of another theme wins);
//   • otherwise → the design of the installation (Studio › Settings › Design). That includes "Backend-selected"
//     (no profile theme), a name HA no longer has and an old Casora name of the theme-file era (≤ 26.10.59).
// Old Casora names in the profile are rewritten (migrate()): to "Backend-selected" when the installation has a
// design, else to today's name. Once per user, a profile theme that is the installation design itself (the
// Studio of the theme-file era wrote it there) or "default" (the Studio of 26.10.60b1 wrote that when a design
// was picked) becomes "Backend-selected", so Casora looks like Casora and later Studio choices show.
// Choosing a design in the Studio (set()) also lets this user's profile follow the installation again.
//
//   window.casoraTheme.design()      installation design: undefined (not loaded), null (not chosen), "" (none), name
//   window.casoraTheme.active(hass)  design this browser shows ("" = none)
//   window.casoraTheme.names()       all Casora designs
//   window.casoraTheme.theme(name)   a loaded design (object as in theme_*.yaml, merged), or null
//   window.casoraTheme.load(name)    Promise of a design (fetched once)
//   window.casoraTheme.set(design)   Promise: save the installation design (admins); the profile follows it
//   window.casoraTheme.scope()       "all" (every page) or "casora" (only Casora dashboards and panels, issue 129)
//   window.casoraTheme.setScope(s)   Promise: save where the design applies (admins)
//   window.casoraTheme.vars(theme, dark)  {"--name": value} as applied
//   window.casoraTheme.onChange(fn)  called after every change of what is applied
//   window.casoraTheme.registerStats()  {updates, inPlace}: designs handed to HA's theme list (see register())
(function () {
  if (window.casoraTheme) return;
  var CACHE = 'casora.theme.v2';
  var CACHE_V1 = 'casora.theme.v1';
  // Per user (HA's frontend user data): the one-time profile migration ran.
  var MIGRATED_KEY = 'casora_theme_profile';
  // Former names (theme.py THEME_RENAMED, "Hemma" only while it is no HA theme of its own).
  var RENAMED = { 'Casora Weich': 'Casora', 'Casora Standard': 'Casora Glas', 'Casora Glass': 'Casora Glas',
    'Hemma 2': 'Casora Glas', 'Hemma 1': 'Casora Glas', 'Hemma': 'Casora Glas' };
  var state = { design: undefined, names: [], themes: {}, hashes: {}, applied: null, server: false, scope: 'all', dashboards: [], off: false, had: false };
  var listeners = [];
  var pending = {};

  try {
    var c2 = JSON.parse(localStorage.getItem(CACHE) || 'null');
    if (c2 && c2.themes) {
      state.themes = c2.themes;
      state.hashes = c2.hashes || {};
      state.names = Array.isArray(c2.names) ? c2.names : Object.keys(c2.themes);
      if (c2.design !== undefined) state.design = c2.design;
      if (c2.scope === 'casora') state.scope = 'casora';
      if (Array.isArray(c2.dashboards)) state.dashboards = c2.dashboards;
    } else {
      var c = JSON.parse(localStorage.getItem(CACHE_V1) || 'null');
      if (c && c.name && c.theme) {
        state.themes[c.name] = c.theme;
        state.hashes[c.name] = c.hash || '';
        state.names = Array.isArray(c.names) ? c.names : [c.name];
        if (c.design !== undefined) state.design = c.design;
      }
    }
  } catch (e) { /* no storage: wait for the server */ }

  function root() { return document.querySelector('home-assistant'); }
  function hassNow() { var el = root(); return el && el.hass; }

  function isDark(h) {
    if (h && h.themes && typeof h.themes.darkMode === 'boolean') return h.themes.darkMode;
    try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { return false; }
  }

  function known(n) { return state.names.indexOf(n) >= 0; }

  function selection(h) {
    var sel = h && h.selectedTheme;
    if (!sel) { try { sel = JSON.parse(localStorage.getItem('selectedTheme') || 'null'); } catch (e) { sel = null; } }
    if (typeof sel === 'string') sel = { theme: sel };
    return sel && sel.theme ? sel.theme : '';
  }

  // A theme HA itself has (not one of ours put into its list).
  function realTheme(h, n) {
    var list = h && h.themes && h.themes.themes;
    return !!(list && list[n]) && !known(n);
  }

  // An old Casora name that no longer exists ("Hemma" only while HA has no theme of that name).
  function stale(h, n) {
    return !!RENAMED[n] && !known(n) && !(n === 'Hemma' && realTheme(h, n));
  }

  // The profile's say: a design, "" (another real theme wins) or undefined (follow the installation).
  function browserPick(h) {
    var n = selection(h);
    if (!n) return undefined;
    if (n === 'default') return '';
    if (known(n)) return n;
    if (stale(h, n)) return state.design ? undefined : RENAMED[n];
    return realTheme(h, n) ? '' : undefined;
  }

  // Issue 129: with the scope "casora" the design applies only on Casora's own panels (casora-studio …) and on
  // dashboards the server names as Casora dashboards; every other page keeps HA's look.
  function casoraPage() {
    var seg = '';
    try { seg = decodeURIComponent(String(window.location.pathname || '').split('/')[1] || ''); } catch (e) { seg = ''; }
    if (!seg) seg = 'lovelace';
    return seg === 'casora-studio' || state.dashboards.indexOf(seg) >= 0;
  }

  function active(h) {
    if (state.scope === 'casora' && !casoraPage()) return '';
    var b = browserPick(h || hassNow());
    if (b !== undefined) return b;
    return state.design || '';
  }

  // hex2rgb as in HA's frontend (common/color/convert-color.ts).
  function hexToRgb(v) {
    var x = v.replace('#', '');
    if (x.length !== 6) { var y = ''; for (var i = 0; i < x.length; i++) y += x[i] + x[i]; x = y; }
    var r = [parseInt(x.substring(0, 2), 16), parseInt(x.substring(2, 4), 16), parseInt(x.substring(4, 6), 16)];
    return r.some(function (n) { return isNaN(n); }) ? null : r.join(',');
  }

  function vars(theme, dark) {
    var rules = {}, out = {}, k;
    if (!theme) return out;
    for (k in theme) if (k !== 'modes') rules[k] = theme[k];
    var m = theme.modes && theme.modes[dark ? 'dark' : 'light'];
    if (m) for (k in m) rules[k] = m[k];
    for (k in rules) {
      var v = String(rules[k]);
      out['--' + k] = v;
      if (v.charAt(0) !== '#' || rules['rgb-' + k] !== undefined) continue;
      var rgb = hexToRgb(v);
      if (rgb) out['--rgb-' + k] = rgb;
    }
    return out;
  }

  var ruleEl = null;
  function rule() {
    if (!ruleEl || !ruleEl.isConnected) {
      ruleEl = document.createElement('style');
      ruleEl.id = 'casora-theme';
      ruleEl.textContent = ':root{}';
      (document.head || document.documentElement).appendChild(ruleEl);
    }
    return ruleEl.sheet && ruleEl.sheet.cssRules[0];
  }

  // All loaded designs into the browser's copy of HA's theme list. A new list object, handed to HA's root
  // element (_updateHass), so HA's theme picker (memoised on the list) shows them; without that method the
  // list is filled in place (HA still finds a design picked there, UIX its styles). HA replaces the list on
  // every themes_updated (e.g. "Reload themes"); apply() runs again then and puts them back.
  // _updateHass makes the whole frontend draw again, so it is guarded (casoraTheme.registerStats() counts):
  //   • in a list Casora already completed, a design counts only when it is absent or Casora has a newer version of
  //     it – an object something else copied in (another identity, same design) does not make it hand the list again;
  //   • never from inside its own _updateHass;
  //   • at most UPDATE_MAX calls in UPDATE_WINDOW ms – beyond that the list is filled in place (no redraw), so
  //     nothing can turn this into a loop (themes_updated → register → _updateHass → apply → …).
  var UPDATE_MAX = 3, UPDATE_WINDOW = 10000;
  var completed = typeof WeakMap === 'function' ? new WeakMap() : null;   // list → {name: object Casora put in}
  var registering = false;
  var recent = [];
  var stats = { updates: 0, inPlace: 0 };
  function register(h) {
    var list = h && h.themes && h.themes.themes;
    if (!list || registering) return false;
    var done = completed && completed.get(list);
    var missing = state.names.filter(function (n) {
      return state.themes[n] && list[n] !== state.themes[n] && !(done && list[n] && list[n] !== done[n]);
    });
    if (!missing.length) return false;
    var el = root();
    var now = Date.now();
    recent = recent.filter(function (t) { return now - t < UPDATE_WINDOW; });
    if (el && typeof el._updateHass === 'function' && recent.length < UPDATE_MAX) {
      var next = {};
      for (var k in list) next[k] = list[k];
      missing.forEach(function (n) { next[n] = state.themes[n]; });
      var themes = {};
      for (k in h.themes) themes[k] = h.themes[k];
      themes.themes = next;
      recent.push(now);
      registering = true;
      try {
        el._updateHass({ themes: themes });
        stats.updates++;
        if (completed) completed.set(next, snapshot());
        return true;
      } catch (e) { /* fall back to filling in place */ } finally { registering = false; }
    }
    try { missing.forEach(function (n) { list[n] = state.themes[n]; }); } catch (e) { return false; }
    stats.inPlace++;
    if (completed) completed.set(list, snapshot());
    return true;
  }
  function snapshot() {
    var o = {};
    state.names.forEach(function (n) { if (state.themes[n]) o[n] = state.themes[n]; });
    return o;
  }

  function notify() {
    listeners.slice().forEach(function (fn) { try { fn(); } catch (e) { /* listener's own error */ } });
  }

  // The user's profile theme through HA's own event (HA stores it in the browser and the user's data).
  function setProfile(theme) {
    var el = root();
    if (!el) return false;
    el.dispatchEvent(new CustomEvent('settheme', { detail: { theme: theme } }));
    return true;
  }

  var migrating = {};
  function migrate(h) {
    if (!state.server || !h || !h.user) return;
    var n = selection(h);
    // Old name of the theme-file era: follow the installation design, or today's name without one.
    if (n && stale(h, n) && !migrating[n]) {
      migrating[n] = true;
      setProfile(state.design ? '' : RENAMED[n]);
      return;
    }
    // Once per user: "default" written by the Studio of 26.10.60b1 → "Backend-selected". A profile that names
    // the installation design stays: the Studio writes it there itself.
    if (migrating[MIGRATED_KEY]) return;
    var c = conn();
    if (!c) return;
    migrating[MIGRATED_KEY] = true;
    c.sendMessagePromise({ type: 'frontend/get_user_data', key: MIGRATED_KEY }).then(function (r) {
      if (r && r.value) return null;
      var now = selection(hassNow());
      if (now === 'default') setProfile('');
      return c.sendMessagePromise({ type: 'frontend/set_user_data', key: MIGRATED_KEY, value: true });
    }).catch(function () { /* user data not available: try on the next page load */ });
  }

  // Scope "casora": HA itself must not apply a Casora design (it would on every page): a Casora name in this user's
  // profile becomes "Backend-selected" (the installation design, which Casora applies on Casora pages only). The
  // designs stay in HA's list: card-mod/UIX look their styles up there by the --card-mod-theme of Casora's rule.
  function scopeProfile(h) {
    if (state.scope !== 'casora' || !state.server || !h || !h.user) return;
    var n = selection(h), ours = !!n && (known(n) || !!RENAMED[n]);
    // Once per pick: a later Casora pick in HA's profile is taken back again.
    if (!ours) { migrating.scope = false; return; }
    if (!migrating.scope && setProfile('')) migrating.scope = true;
  }

  var PAGE_WIDE = ['casora-body-font', 'casora-fo-body-scroll'];
  function apply(force) {
    var h = hassNow();
    migrate(h);
    scopeProfile(h);
    var name = active(h);
    var dark = isDark(h);
    var t = name ? state.themes[name] : null;
    if (name && !t) { load(name).then(function () { apply(true); }, function () {}); }
    var key = (t ? name + '|' + (state.hashes[name] || '') : '') + '|' + dark;
    var reg = register(h);
    var changed = force || key !== state.applied;
    // Issue 129: mark a page outside the scope on every pass (the key stays the same without a Casora design).
    var off = state.scope === 'casora' && !casoraPage();
    if (off !== state.off) { state.off = off; document.documentElement.toggleAttribute('data-casora-scope-off', off); }
    // Casora's other page-wide rules (body font, hidden scrollbars) step back there too; switched by media, so the
    // rules themselves stay exactly as before.
    PAGE_WIDE.forEach(function (id) {
      var el = document.getElementById && document.getElementById(id);
      if (el && (el.media === 'not all') !== off) el.media = off ? 'not all' : '';
    });
    var r = changed ? rule() : null;
    if (r) {
      state.applied = key;
      r.style.cssText = '';
      var v = vars(t, dark);
      for (var k in v) r.style.setProperty(k, v[k], 'important');
      document.documentElement.toggleAttribute('data-casora-design', !!t);
    }
    // UIX looks its theme styles up again (it also listens for this after HA's own theme changes); also when the design
    // goes away (scope "casora", another page), or card-mod keeps the sidebar/root styles of the page before.
    var had = state.had;
    if (r) state.had = !!t;
    if ((reg && t) || (r && (t || (had && state.scope === 'casora')))) document.dispatchEvent(new CustomEvent('uix-update', { detail: { reason: 'theme', variablesChanged: !!r } }));
    if (r) notify();
  }

  function remember() {
    try {
      var themes = {};
      state.names.forEach(function (n) { if (state.themes[n]) themes[n] = state.themes[n]; });
      localStorage.setItem(CACHE, JSON.stringify({ themes: themes, hashes: state.hashes, names: state.names, design: state.design,
        scope: state.scope, dashboards: state.dashboards }));
      localStorage.removeItem(CACHE_V1);
    } catch (e) { /* full or blocked: next load asks the server */ }
  }

  function conn() {
    var h = hassNow();
    var c = h && h.connection;
    return c && typeof c.sendMessagePromise === 'function' ? c : null;
  }

  function whenConn() {
    return new Promise(function (resolve) {
      (function wait() { var c = conn(); if (c) resolve(c); else setTimeout(wait, 150); })();
    });
  }

  function load(name) {
    if (state.themes[name]) return Promise.resolve(state.themes[name]);
    if (!pending[name]) {
      pending[name] = whenConn().then(function (c) {
        return c.sendMessagePromise({ type: 'casora/theme/get', name: name });
      }).then(function (r) {
        state.themes[r.name] = r.theme;
        state.hashes[r.name] = r.hash || '';
        return r.theme;
      }).finally(function () { delete pending[name]; });
    }
    return pending[name];
  }

  // Every design once (for HA's theme picker), then cached with the others.
  function loadAll() {
    var miss = state.names.filter(function (n) { return !state.themes[n]; });
    if (!miss.length) return Promise.resolve();
    return Promise.all(miss.map(function (n) { return load(n).catch(function () { return null; }); }))
      .then(function () { remember(); apply(); });
  }

  var ready = new Promise(function (resolve) {
    whenConn().then(function (c) {
      var hash = state.design ? (state.hashes[state.design] || '') : '';
      var msg = { type: 'casora/theme/subscribe' };
      if (hash) msg.hash = hash;
      var first = true;
      var go = function (p) {
        if (!p) return;
        state.names = p.names || state.names;
        state.design = p.design === undefined ? null : p.design;
        state.scope = p.scope === 'casora' ? 'casora' : 'all';
        // No list yet (HA still starting): keep the cached one, or Casora dashboards would lose their look meanwhile.
        if (Array.isArray(p.dashboards)) state.dashboards = p.dashboards;
        state.server = true;
        // A cached design of another version is fetched again.
        if (p.hashes) {
          Object.keys(state.themes).forEach(function (n) {
            if (state.names.indexOf(n) < 0 || (p.hashes[n] && p.hashes[n] !== state.hashes[n])) delete state.themes[n];
          });
        }
        if (p.design && p.theme) { state.themes[p.design] = p.theme; state.hashes[p.design] = p.hash || ''; }
        remember();
        apply();
        loadAll();
        if (first) { first = false; resolve(); }
      };
      if (typeof c.subscribeMessage === 'function') {
        c.subscribeMessage(go, msg).catch(function () { resolve(); });
      } else resolve();
    });
  });

  function set(design) {
    return whenConn().then(function (c) {
      return c.sendMessagePromise({ type: 'casora/theme/set', design: design || '' });
    }).then(function () {
      state.design = design || '';
      // The Studio's choice is also this user's profile theme, so HA's own picker names it ("Casora Nebel")
      // instead of an empty "use default" field. Other users who picked nothing keep following the installation.
      if (design && known(design) && state.scope !== 'casora') setProfile(design);
      else {
        // "Own theme" in the Studio: a Casora name in the profile goes, a real HA theme of the user's stays.
        var n = selection(hassNow());
        if (n && (known(n) || RENAMED[n])) setProfile('');
      }
      remember();
      apply();
    });
  }

  function setScope(scope) {
    scope = scope === 'casora' ? 'casora' : 'all';
    return whenConn().then(function (c) {
      return c.sendMessagePromise({ type: 'casora/theme/set', scope: scope });
    }).then(function () {
      state.scope = scope;
      // HA already holds the designs in its list (this page registered them): a Casora design in this user's profile
      // would still be applied by HA on every page, so the profile follows the installation again.
      remember();
      apply(true);
    });
  }

  window.casoraTheme = {
    design: function () { return state.design; },
    scope: function () { return state.scope; },
    setScope: setScope,
    casoraPage: casoraPage,
    active: active,
    names: function () { return state.names.slice(); },
    theme: function (name) { return (name && state.themes[name]) || null; },
    load: load,
    set: set,
    vars: vars,
    ready: ready,
    renamed: RENAMED,
    onChange: function (fn) { listeners.push(fn); },
    apply: function () { apply(true); },
    // How often the designs were handed to HA (_updateHass) or filled into its list in place (tests).
    registerStats: function () { return { updates: stats.updates, inPlace: stats.inPlace }; },
  };

  // Light/dark and the browser's theme choice: HA re-applies its theme on <html> whenever either changes;
  // the system setting and a slow check cover the rest (and HA replacing its theme list).
  apply();
  try {
    new MutationObserver(function () { apply(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });
  } catch (e) { /* no observer: the check below */ }
  try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { setTimeout(apply, 50); }); } catch (e) { /* old browser */ }
  // Scope "casora": another page may want another look (HA fires location-changed on its own navigation).
  try {
    window.addEventListener('location-changed', function () { apply(); });
    window.addEventListener('popstate', function () { apply(); });
  } catch (e) { /* no events: the check below */ }
  setInterval(function () { apply(); }, 1500);
})();
