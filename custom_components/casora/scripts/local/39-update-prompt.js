// ── Update prompt for Casora itself ───────────────────────────────────────────
// When a newer Casora version is offered, an admin sees ONE calm popup on the dashboard, a few seconds after
// the page has loaded and gone idle: "Casora <version> ist da", up to three lines from its release notes and
// "Installieren" / "Später" / "Diese Version überspringen". Nothing here checks for updates: the version, the
// lines and the update entity come from casora/updates/prompt (updates.py), which reads the same update entity
// (every 6 h, beta_updates channel) as Studio → Updates. Only Casora, never other integrations' updates.
//
// Installing works like Studio → Updates: Casora installs nothing itself, HA's update.install on HACS' update
// entity for Casora downloads it; then Casora offers the restart HA needs. Without HACS the main button opens
// the release page instead.
//
// The choice is remembered per HA user in HA's frontend user data (key casora_update_prompt, survives reloads
// and follows the user to other devices), mirrored in localStorage when the user data cannot be written:
//   { off: bool (Studio → Updates: "Update-Hinweis beim Öffnen"), seen: version shown once,
//     skip: version skipped, until: ms timestamp "Später" asks again after }
//
//   window._casoraUpdPrompt.decide({ admin, info, mem, now })   'show' or why not (pure, dev/unit/update_prompt.mjs)
//   window._casoraUpdPrompt.later(mem, now) / .skip(mem, v) / .seen(mem, v) / .setOff(mem, off)   new memory (pure)
//   window._casoraUpdPrompt.run(hass)                          fetch, decide, open; Promise of the reason
(function () {
  if (window._casoraUpdPrompt) return;
  var KEY = 'casora_update_prompt';
  var LS = 'casora.updPrompt';
  var DAY = 864e5;
  var DELAY = 4000;
  var U = window._casoraUpdPrompt = { KEY: KEY, LS: LS, DAY: DAY, DELAY: DELAY };
  var T = function (x) { return window.casoraTr ? window.casoraTr(x) : x; };

  var clean = function (m) { return m && typeof m === 'object' && !Array.isArray(m) ? m : {}; };
  U.decide = function (o) {
    o = o || {};
    var info = o.info, mem = clean(o.mem), now = Number(o.now) || Date.now();
    if (!o.admin) return 'not_admin';
    if (mem.off === true) return 'off';
    if (!info || !info.available || !info.version) return 'none';
    var v = String(info.version);
    if (mem.skip === v) return 'skipped';
    if (Number(mem.until) > now) return 'later';
    if (mem.seen === v) return 'seen';
    return 'show';
  };
  U.seen = function (mem, v) { return Object.assign({}, clean(mem), { seen: String(v) }); };
  // "Später": ask again in 24 h (the same version too, so "seen" is cleared).
  U.later = function (mem, now) { return Object.assign({}, clean(mem), { seen: null, until: (Number(now) || Date.now()) + DAY }); };
  // "Diese Version überspringen": only a newer version asks again.
  U.skip = function (mem, v) { return Object.assign({}, clean(mem), { skip: String(v), seen: String(v), until: null }); };
  U.setOff = function (mem, off) { return Object.assign({}, clean(mem), { off: !!off }); };

  var conn = function (h) { return h && h.connection && typeof h.connection.sendMessagePromise === 'function' ? h.connection : null; };
  // The localStorage mirror is per HA user too (several users can share one browser).
  var lsKey = function (h) { return LS + ':' + String((h && h.user && h.user.id) || ''); };
  var lsGet = function (h) { try { return clean(JSON.parse(localStorage.getItem(lsKey(h)) || 'null')); } catch (e) { return {}; } };
  var lsSet = function (h, m) { try { localStorage.setItem(lsKey(h), JSON.stringify(m)); } catch (e) { /* private mode */ } };
  U.load = function (h) {
    var c = conn(h);
    if (!c) return Promise.resolve(lsGet(h));
    return c.sendMessagePromise({ type: 'frontend/get_user_data', key: KEY })
      .then(function (r) { return r && r.value && typeof r.value === 'object' ? clean(r.value) : lsGet(h); }, function () { return lsGet(h); });
  };
  U.save = function (h, mem) {
    lsSet(h, mem);
    var c = conn(h);
    if (!c) return Promise.resolve(false);
    return c.sendMessagePromise({ type: 'frontend/set_user_data', key: KEY, value: mem }).then(function () { return true; }, function () { return false; });
  };
  var lang = function (h) { return String((h && (h.language || (h.locale && h.locale.language))) || ''); };
  U.info = function (h) { return h.callWS({ type: 'casora/updates/prompt', language: lang(h) || null }); };

  var mem0 = {};
  var current = null;
  var shownCfg = null;
  // Read again before writing: another device (or the Studio toggle) may have changed it since the page loaded.
  var remember = function (h, fn) {
    return U.load(h).then(function (fresh) { mem0 = fn(fresh); return U.save(h, mem0); });
  };

  // ── Popup ──────────────────────────────────────────────────────────────────
  var CSS = '.cup{font-family:var(--casora-font, var(--ha-font-family-body, Inter, system-ui, sans-serif));text-align:left;min-width:0}'
    // button-card's custom field does not wrap by default.
    + '.cup,.cup *{white-space:normal;overflow-wrap:anywhere}'
    + '.cup-lines{margin:0 0 16px;padding:16px 20px;border-radius:var(--casora-v3-stage-radius, 24px);list-style:none;'
    + 'background:var(--casora-soft-row-fill, var(--casora-popup-row-fill, rgba(127,127,127,.12)))}'
    + '.cup-lines li{position:relative;padding:4px 0 4px 18px;font-size:15px;line-height:1.4;font-weight:600;'
    + 'color:var(--casora-popup-tiles-text-primary, var(--primary-text-color))}'
    + '.cup-lines li::before{content:"";position:absolute;left:2px;top:12px;width:7px;height:7px;border-radius:50%;'
    + 'background:var(--casora-popup-ui-action, var(--casora-accent, var(--primary-color)))}'
    + '.cup-sub{margin:0 0 14px;font-size:14px;line-height:1.45;color:var(--casora-popup-tiles-text-secondary, var(--secondary-text-color))}'
    + '.cup [data-casora-updp]{pointer-events:auto!important;cursor:pointer}'
    + '.cup-acts{display:flex;flex-direction:column;gap:10px}'
    + '.cup-b{all:unset;box-sizing:border-box;display:flex;align-items:center;justify-content:center;min-height:48px;padding:0 20px;'
    + 'border-radius:999px;font:inherit;font-size:16px;font-weight:700;text-align:center;transition:transform var(--casora-dur-feedback,160ms)}'
    + '.cup-b:active{transform:scale(var(--casora-press-scale,.97))}'
    + '.cup-b:focus-visible{outline:2px solid var(--casora-popup-ui-action, var(--casora-accent, #276B64));outline-offset:2px}'
    + '.cup-b.pri{background:var(--casora-popup-ui-action, var(--casora-accent, #276B64));color:var(--casora-popup-ui-on-action, #fff)}'
    + '.cup-b.sec{background:var(--casora-soft-control-fill, rgba(127,127,127,.14));color:var(--casora-popup-tiles-text-primary, var(--primary-text-color))}'
    + '.cup-b.quiet{min-height:44px;font-weight:600;font-size:15px;color:var(--casora-popup-tiles-text-secondary, var(--secondary-text-color))}'
    + '@media (prefers-reduced-motion: reduce){.cup-b{transition:none}}'
    + '.cup .busy{opacity:.6;pointer-events:none!important}';

  var esc = function (x) { return window.casoraEsc ? window.casoraEsc(x) : String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  U.html = function (info) {
    var lines = (info.lines || []).slice(0, 3);
    var main = info.can_install ? 'Installieren' : info.hacs_url ? 'In HACS öffnen' : 'Release-Seite öffnen';
    // Stacked pills (long labels do not fit three in a row on the phone): main action, Später, skip as a quiet link.
    var btn = function (what, cls, text) {
      return '<button type="button" class="cup-b ' + esc(cls) + '" data-casora-updp="' + esc(what) + '"><span>' + esc(T(text)) + '</span></button>';
    };
    var actsHtml = [btn('install', 'pri', main), btn('later', 'sec', 'Später'), btn('skip', 'quiet', 'Diese Version überspringen')].join('');
    return '<div class="cup" data-no-i18n><style>' + CSS + '</style>'
      + '<p class="cup-sub">' + esc(T(info.can_install
        ? 'Wird über HACS installiert. Danach braucht Home Assistant einen Neustart.'
        : 'Neue Versionen installierst du über HACS.')) + '</p>'
      + (lines.length ? '<ul class="cup-lines">' + lines.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>' : '')
      + '<div class="cup-acts">' + actsHtml + '</div>'
      + '</div>';
  };

  U.title = function (info) { return T('Casora {v} ist da').replace('{v}', String(info.version)); };

  U.open = function (info) {
    var P = window.casoraPopup;
    if (!P || !P.open) return false;
    current = info;
    shownCfg = {
      title: U.title(info), dismissable: true, dismiss_on_background: true, variant: 'v3',
      ring: { icon: 'mdi:package-up', hue: 'var(--casora-tone-media, var(--casora-color-blue, #5B8FC9))' },
      content: { type: 'vertical-stack', casora_cols: 1, cards: [{ type: 'custom:button-card', tap_action: { action: 'none' }, hold_action: { action: 'none' },
        show_icon: false, show_name: false, show_label: false, show_state: false,
        card_mod: { style: ':host { --ha-card-box-shadow: none !important; } ha-card { background: transparent !important; border: none !important; box-shadow: none !important; cursor: default !important; } ha-ripple { display: none !important; }' },
        styles: { card: [{ background: 'transparent' }, { border: 'none' }, { 'box-shadow': 'none' }, { padding: 'var(--casora-soft-card-top, 6px) 26px 22px 26px' }],
          grid: [{ 'grid-template-areas': '"b"' }, { 'grid-template-columns': '1fr' }],
          custom_fields: { b: [{ 'justify-self': 'stretch' }] } },
        custom_fields: { b: U.html(info) } }] },
    };
    P.open(shownCfg);
    return true;
  };

  var hassNow = function () { var el = document.querySelector('home-assistant'); return el && el.hass; };
  // Only our own popup: an install can take a while, meanwhile the user may have opened another one.
  var close = function () {
    var P = window.casoraPopup;
    if (P && shownCfg && P.current === shownCfg) P.close();
  };
  var navigate = function (path) {
    try { history.pushState(null, '', path); window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } })); } catch (e) { location.href = path; }
  };

  // Same steps as Studio → Updates (_cuInstall, _cuRestart): confirm, update.install on HACS' entry, restart.
  U.install = function (h, info) {
    if (!info.can_install) {
      close();
      if (info.hacs_url) navigate(info.hacs_url);
      else if (info.release_url) window.open(info.release_url, '_blank', 'noopener');
      return Promise.resolve('opened');
    }
    var ask = window.casoraAsk || function () { return Promise.resolve(true); };
    return ask({ title: T('Casora {v} installieren?').replace('{v}', info.version),
      text: T('HACS lädt die neue Version. Danach muss Home Assistant neu starten.'), yes: T('Installieren'), withPopup: true })
      .then(function (ok) {
        if (!ok) return 'cancelled';
        var st = h.states && h.states[info.entity_id];
        if (!st || st.state === 'unavailable' || st.state === 'unknown') {
          window.casoraNotice && window.casoraNotice({ message: T('Der Update-Eintrag von HACS für Casora ist gerade nicht verfügbar. Versuche es gleich noch einmal oder aktualisiere in HACS.'), duration: 8000 }, { overPopup: true });
          return 'unavailable';
        }
        var data = { entity_id: info.entity_id };
        // A version other than HACS' newest (a beta) goes by its release tag, as in the Studio.
        var want = String(info.version).replace(/^v/, '');
        if (want !== String((st.attributes || {}).latest_version || '').replace(/^v/, '')) data.version = 'v' + want;
        busy(true);
        return Promise.resolve(h.callService('update', 'install', data)).then(function () {
          // As the Studio: only a version HACS reports as installed (waiting for the restart) counts.
          return Promise.resolve(U.info(hassNow() || h)).then(function (r) { return r && String(r.pending_restart || '').replace(/^v/, '') === want; }, function () { return false; });
        }).then(function (installed) {
          busy(false);
          if (!installed) {
            window.casoraNotice && window.casoraNotice({ message: T('Installieren hat nicht geklappt.') + ' ' + T('HACS hat die neue Version nicht als installiert gemeldet. Sieh in HACS nach.'), duration: 8000 }, { overPopup: true });
            return 'not_installed';
          }
          close();
          return ask({ title: T('Jetzt neu starten?'), text: T('Casora {v} ist installiert. Home Assistant ist beim Neustart kurz nicht erreichbar.').replace('{v}', want),
            yes: T('Neu starten') }).then(function (go) {
            if (!go) return 'installed';
            return Promise.resolve(h.callService('homeassistant', 'restart', {})).then(function () { return 'restart'; }, function (e) {
              // The restart drops the connection (code 3): not an error.
              if (e && (e.code === 3 || !e.message)) return 'restart';
              window.casoraNotice && window.casoraNotice({ message: T('Der Neustart hat nicht geklappt.') + ' ' + (e.message || e), duration: 8000 });
              return 'restart_failed';
            });
          });
        }, function (e) {
          busy(false);
          window.casoraNotice && window.casoraNotice({ message: T('Installieren hat nicht geklappt.') + ' ' + ((e && e.message) || e), duration: 8000 }, { overPopup: true });
          // HA's Marketplace (2026.11+) installs only after this user read its first-run warning: open its page.
          if (e && e.translation_key === 'warning_not_accepted' && info.hacs_url) { close(); navigate(info.hacs_url); }
          return 'failed';
        });
      });
  };
  var busyNode = null;
  var busy = function (on) {
    if (!busyNode) return;
    busyNode.classList.toggle('busy', !!on);
    var s = busyNode.querySelector('span');
    if (s) {
      if (on) { s.dataset.label = s.textContent; s.textContent = T('Wird installiert …'); } else if (s.dataset.label) s.textContent = s.dataset.label;
    }
  };

  U.choose = function (what, node) {
    var h = hassNow(), info = current;
    if (!h || !info) return Promise.resolve(null);
    if (window.casoraHaptic) window.casoraHaptic('light');
    if (what === 'later') { close(); return remember(h, function (m) { return U.later(m, Date.now()); }).then(function () { return 'later'; }); }
    if (what === 'skip') { close(); return remember(h, function (m) { return U.skip(m, info.version); }).then(function () { return 'skip'; }); }
    busyNode = node || null;
    return U.install(h, info);
  };

  // Taps also on touchend: on the phone button-card swallows the click after a finger tap (as 17-update-detail.js).
  var tp = null, lastTouch = 0;
  document.addEventListener('touchstart', function (ev) {
    var t0 = ev.touches && ev.touches[0];
    tp = t0 ? { x: t0.clientX, y: t0.clientY, moved: false } : null;
  }, { capture: true, passive: true });
  document.addEventListener('touchmove', function (ev) {
    var t1 = ev.touches && ev.touches[0];
    if (tp && t1 && (Math.abs(t1.clientX - tp.x) > 10 || Math.abs(t1.clientY - tp.y) > 10)) tp.moved = true;
  }, { capture: true, passive: true });
  var onTap = function (ev) {
    var p = (ev.composedPath && ev.composedPath()) || [];
    for (var i = 0; i < p.length; i++) {
      var n = p[i];
      if (!n || !n.getAttribute || !n.hasAttribute('data-casora-updp')) continue;
      if (ev.type === 'touchend') {
        var moved = !!(tp && tp.moved);
        tp = null;
        if (moved) return;
        lastTouch = Date.now();
      } else if (Date.now() - lastTouch < 700) { ev.preventDefault(); ev.stopPropagation(); return; }
      if (ev.cancelable) ev.preventDefault();
      ev.stopPropagation();
      if (n.classList.contains('busy')) return;
      U.choose(n.getAttribute('data-casora-updp'), n);
      return;
    }
  };
  document.addEventListener('touchend', onTap, true);
  document.addEventListener('click', onTap, true);

  // ── When ───────────────────────────────────────────────────────────────────
  var onDashboard = function (h) {
    var url = String(h.panelUrl || location.pathname.split('/')[1] || '');
    var p = h.panels && h.panels[url];
    return !!(p && p.component_name === 'lovelace');
  };
  U.run = function (h) {
    if (!h || !h.user || !h.user.is_admin) return Promise.resolve('not_admin');
    return U.load(h).then(function (mem) {
      mem0 = mem;
      if (mem.off === true) return 'off';
      return Promise.resolve(U.info(h)).then(function (info) {
        var why = U.decide({ admin: true, info: info, mem: mem0, now: Date.now() });
        if (why !== 'show') return why;
        // Another popup is open (the user is busy): try again on the next page load.
        if (window.casoraPopup && window.casoraPopup.current) return 'busy';
        if (!U.open(info)) return 'no_popup';
        return remember(h, function (m) { return U.seen(m, info.version); }).then(function () { return 'show'; });
      }, function () { return 'error'; });
    });
  };

  var done = false;
  var tries = 0;
  function start() {
    if (done) return;
    var h = hassNow();
    if (!h || !h.user || !conn(h) || typeof h.callWS !== 'function') { if (++tries < 120) setTimeout(start, 1000); return; }
    if (!h.user.is_admin) { done = true; return; }
    if (!h.panels || !Object.keys(h.panels).length) { if (++tries < 120) setTimeout(start, 1000); return; }
    if (!onDashboard(h)) return;  // on a dashboard later (location-changed)
    done = true;
    // After the page is loaded and idle: never part of the first paint.
    setTimeout(function () {
      var go = function () {
        var hn = hassNow() || h;
        // Left the dashboard meanwhile (Settings, HACS, Studio): wait for the next dashboard.
        if (!onDashboard(hn)) { done = false; return; }
        U.run(hn).catch(function (e) { try { console.warn('Casora: update prompt failed', e); } catch (x) { /* no console */ } });
      };
      if (window.requestIdleCallback) window.requestIdleCallback(go, { timeout: 4000 }); else go();
    }, DELAY);
  }
  U.start = start;
  window.addEventListener('location-changed', function () { setTimeout(start, 300); });
  if (document.readyState === 'complete') start(); else window.addEventListener('load', start);
})();
