// Casora's designs on every page (theme.py). Loaded by Home Assistant itself on every page
// (frontend.add_extra_js_url), not as a dashboard resource.
//
// Home Assistant has no API for an integration to add a theme, so the integration serves its designs and
// this script applies the chosen one the way HA applies a theme: every value as a CSS variable --name
// (plus --rgb-name for hex colours), base values first, then those of the current light/dark mode.
// They sit in one `:root` rule with !important: HA keeps its own theme inline on <html>, the rule wins over
// it without both writing the same inline style. The design is also added to the browser's copy of HA's
// theme list (hass.themes.themes) - UIX looks up its theme styles (uix-*, card-mod-*) by name there.
//
// Which design: the browser's own theme choice if it names a Casora design (also an old name), none if
// it names another HA theme or HA's built-in one ("default"), otherwise the design of the installation
// (Studio › Settings › Design).
//
//   window.casoraTheme.design()      installation design: undefined (not loaded), null (not chosen), "" (none), name
//   window.casoraTheme.active(hass)  design this browser shows ("" = none)
//   window.casoraTheme.names()       all Casora designs
//   window.casoraTheme.theme(name)   a loaded design (object as in theme_*.yaml, merged), or null
//   window.casoraTheme.load(name)    Promise of a design (fetched once)
//   window.casoraTheme.set(design)   Promise: save the installation design (admins)
//   window.casoraTheme.vars(theme, dark)  {"--name": value} as applied
//   window.casoraTheme.onChange(fn)  called after every change of what is applied
(function () {
  if (window.casoraTheme) return;
  var CACHE = 'casora.theme.v1';
  // Former names (theme.py THEME_RENAMED, "Hemma" only while it is no HA theme of its own).
  var RENAMED = { 'Casora Weich': 'Casora', 'Casora Standard': 'Casora Glas', 'Casora Glass': 'Casora Glas',
    'Hemma 2': 'Casora Glas', 'Hemma 1': 'Casora Glas', 'Hemma': 'Casora Glas' };
  var state = { design: undefined, names: [], themes: {}, hashes: {}, applied: null };
  var listeners = [];
  var pending = {};

  try {
    var c = JSON.parse(localStorage.getItem(CACHE) || 'null');
    if (c && c.name && c.theme) {
      state.themes[c.name] = c.theme;
      state.hashes[c.name] = c.hash || '';
      state.names = Array.isArray(c.names) ? c.names : [c.name];
      if (c.design !== undefined) state.design = c.design;
    }
  } catch (e) { /* no storage: wait for the server */ }

  function root() { return document.querySelector('home-assistant'); }
  function hassNow() { var el = root(); return el && el.hass; }

  function isDark(h) {
    if (h && h.themes && typeof h.themes.darkMode === 'boolean') return h.themes.darkMode;
    try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { return false; }
  }

  function known(n) { return state.names.indexOf(n) >= 0; }

  function browserPick(h) {
    var sel = h && h.selectedTheme;
    if (!sel) { try { sel = JSON.parse(localStorage.getItem('selectedTheme') || 'null'); } catch (e) { sel = null; } }
    var n = sel && sel.theme;
    if (!n) return undefined;
    // "default" is HA's own built-in theme picked in the profile (not "as set for the installation").
    if (n === 'default') return '';
    if (known(n)) return n;
    var other = !!(h && h.themes && h.themes.themes && h.themes.themes[n]);
    // Hemma's own theme stays Hemma while HA still has it.
    if (RENAMED[n] && !(n === 'Hemma' && other)) return RENAMED[n];
    return other ? '' : undefined;
  }

  function active(h) {
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

  // The design into the browser's copy of HA's theme list (UIX finds its styles by name there).
  // HA replaces the list after "Reload themes"; the check below puts it back.
  function register(h, name) {
    var list = h && h.themes && h.themes.themes;
    var t = state.themes[name];
    if (!list || !t || list[name] === t) return false;
    try { list[name] = t; } catch (e) { return false; }
    return true;
  }

  function notify() {
    listeners.slice().forEach(function (fn) { try { fn(); } catch (e) { /* listener's own error */ } });
  }

  function apply(force) {
    var h = hassNow();
    var name = active(h);
    var dark = isDark(h);
    var t = name ? state.themes[name] : null;
    if (name && !t) { load(name).then(function () { apply(true); }, function () {}); }
    var key = (t ? name + '|' + (state.hashes[name] || '') : '') + '|' + dark;
    var reg = t ? register(h, name) : false;
    var changed = force || key !== state.applied;
    var r = changed ? rule() : null;
    if (r) {
      state.applied = key;
      r.style.cssText = '';
      var v = vars(t, dark);
      for (var k in v) r.style.setProperty(k, v[k], 'important');
      document.documentElement.toggleAttribute('data-casora-design', !!t);
    }
    // UIX looks its theme styles up again (it also listens for this after HA's own theme changes).
    if (reg || (r && t)) document.dispatchEvent(new CustomEvent('uix-update', { detail: { reason: 'theme', variablesChanged: !!r } }));
    if (r) notify();
  }

  function remember(name) {
    try {
      localStorage.setItem(CACHE, JSON.stringify({ name: name, theme: state.themes[name], hash: state.hashes[name] || '',
        names: state.names, design: state.design }));
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
        if (p.design && p.theme) { state.themes[p.design] = p.theme; state.hashes[p.design] = p.hash || ''; }
        var shown = active(hassNow());
        if (shown && state.themes[shown]) remember(shown);
        apply();
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
      apply();
    });
  }

  window.casoraTheme = {
    design: function () { return state.design; },
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
  };

  // Light/dark and the browser's theme choice: HA re-applies its theme on <html> whenever either changes;
  // the system setting and a slow check cover the rest (and HA replacing its theme list).
  apply();
  try {
    new MutationObserver(function () { apply(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });
  } catch (e) { /* no observer: the check below */ }
  try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { setTimeout(apply, 50); }); } catch (e) { /* old browser */ }
  setInterval(function () { apply(); }, 1500);
})();
