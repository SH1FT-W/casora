// ── Weich: Panel hinter der Medien-Welle oben rechts (05.10.2026, 1.0.7, Entwurf A „Liste“) ─────
// Nur im Weich-Design und nur am Desktop/Tablet (am Handy gibt es keine Welle). Ein Tipp auf die
// Welle öffnet ein ruhiges Menü unter ihr – Optik wie das Mitteilungsmenü (casoraMenuGlass) –,
// darin je Player eine Zeile genau wie die Liste „Aktuelle Wiedergabe“ (09-weich-wiedergabe.js:
// Cover, Titel, „Interpret · Gerät“, Fortschritt, runder Play/Pause-Knopf). Ein Tipp auf eine
// Zeile öffnet das große Medien-Popup wie bisher; Tipp daneben oder Escape schließt. Stoppt die
// letzte Wiedergabe, blendet das Panel sich selbst aus (die Welle verschwindet wie bisher).
//
// Anbindung an die Vorlagen:
//   casora_now_playing        → meldet sich über mount() an (Liste = variables.settled, dieselbe
//                               wie der Kachel-Stapel); im Welle-Betrieb trägt der Host das Attribut
//                               data-casora-welle und blendet den Stapel (#np_main) aus.
//   casora_now_playing_header → Tipp ruft toggle() statt den Helfer casora_now_playing_minimized
//                               umzuschalten; die Füllung der Welle folgt --casora-welle-min.
// Andere Designs und das Handy behalten den Kachel-Stapel über den Helfer.
(function () {
  if (window._casoraWelle) return;
  var W = window._casoraWelle = {};

  var soft = function () { return typeof window._casoraSoft === 'function' && window._casoraSoft(); };
  var phone = function () { return window.matchMedia('(max-width: 767px), (max-height: 500px)').matches; };
  var T = function (de) { return window.casoraTr ? window.casoraTr(de) : de; };
  var getHass = function () { var h = document.querySelector('home-assistant'); return h && h.hass; };
  var tplOf = function (el) { return el && el._config ? [].concat(el._config.template || []) : []; };

  W.on = function () { return soft() && !phone(); };

  // ── Angemeldete Karten (casora_now_playing) ──
  var cards = [];
  W.mount = function (card, vars) {
    try {
      if (!card) return 0;
      var c = null;
      for (var i = 0; i < cards.length; i++) if (cards[i].card === card) { c = cards[i]; break; }
      if (!c) { c = { card: card }; cards.push(c); }
      c.vars = vars || {};
      if (!timer) timer = setInterval(tick, 1000);
      mark(c);
      if (menu && pe.card && pe.src === c) requestAnimationFrame(function () { paint(false); });
    } catch (e) { /* nie die Vorlage brechen */ }
    return W.on() ? 1 : 0;
  };

  // Welle und Stapel einer Karte in den Welle-Betrieb schalten (oder zurück).
  function header(c) {
    var sr = c.card.shadowRoot, f = sr && sr.getElementById('np_head');
    return (f && f.querySelector('button-card')) || null;
  }
  function mark(c) {
    var on = W.on();
    if (c.card.hasAttribute('data-casora-welle') !== on) c.card.toggleAttribute('data-casora-welle', on);
    var hd = header(c);
    if (hd) {
      if (hd.hasAttribute('data-casora-welle') !== on) hd.toggleAttribute('data-casora-welle', on);
      hd.style.setProperty('--casora-welle-min', menu && pe.src === c ? '0' : '1');
    }
  }

  // Karten, die vor diesem Modul gerendert haben, einmal neu rendern lassen (wie 09).
  function discover() {
    try {
      if (!soft()) return;
      (function walk(r, d) {
        if (!r || d > 14) return;
        r.querySelectorAll('*').forEach(function (el) {
          if (el.localName === 'button-card' && tplOf(el).indexOf('casora_now_playing') >= 0
            && !cards.some(function (c) { return c.card === el; })) {
            var h = el._hass || el.hass;
            if (h) el.hass = Object.assign({}, h);
            if (typeof el.requestUpdate === 'function') el.requestUpdate('_config', undefined);
          }
          if (el.shadowRoot) walk(el.shadowRoot, d + 1);
        });
      })(document, 0);
    } catch (e) { /* nur Nachfassen */ }
  }
  [600, 2500, 6000, 15000].forEach(function (t) { setTimeout(discover, t); });

  var timer = 0;
  function tick() {
    var now = Date.now();
    cards = cards.filter(function (c) {
      if (c.card.isConnected) { c.gone = 0; return true; }
      if (!c.gone) c.gone = now;
      return now - c.gone < 120000;
    });
    cards.forEach(function (c) { if (c.card.isConnected) mark(c); });
    if (menu) {
      if (!W.on() || !pe.src || !pe.src.card.isConnected) close();
      else paint(false);
    }
    if (!cards.length && !menu) { clearInterval(timer); timer = 0; }
  }

  // Was gerade läuft – dieselbe Regel wie die Sichtbarkeit der Welle (casora_now_playing_header,
  // variables.open): ist die Liste leer, verschwindet die Welle, und das Panel schließt sich.
  function list(c) {
    var v = (c && c.vars) || {}, h = getHass();
    if (!h || typeof window._casoraNP !== 'function') return [];
    var on = v.enabled;
    if (on === false || ['false', '0', 'no', 'off', 'disabled'].indexOf(String(on == null ? '' : on).trim().toLowerCase()) >= 0) return [];
    try {
      var pin = v.pin_entity && h.states[v.pin_entity];
      return window._casoraNP(h.states, Object.assign({}, v, { pinned_key: (pin && pin.state) || '' })) || [];
    } catch (e) { return []; }
  }

  // Die (ausgeblendete) Stapel-Kachel zu einer Zeile – ihr Tipp öffnet das gewohnte Medien-Popup.
  function original(key) {
    var c = pe.src, sr = c && c.card.shadowRoot;
    var f = sr && sr.getElementById('np_main'), stack = f && f.querySelector('button-card');
    var ssr = stack && stack.shadowRoot;
    var l = Array.isArray(c.vars.settled) ? c.vars.settled : [];
    for (var i = 0; i < l.length && ssr; i++) {
      if (!l[i]) continue;
      if (l[i].key !== key) continue;
      var slot = ssr.getElementById('s' + (i + 1));
      return (slot && slot.querySelector('button-card')) || null;
    }
    return null;
  }

  // ── Panel ──
  var CSS = ''
    // Die Liste liegt im Menü: Abstände wie die Zeilen des Mitteilungsmenüs.
    + '.w{padding:0 6px 8px}'
    + '.l .rc{padding:10px 10px 10px 8px}'
    + '.l .r.hs:before{left:74px;right:12px}';

  var menu = null, body = null, wrap = null, head = null;
  // Eintrag im Format von 09 (_casoraNPSoft.paint/bind): Zeilen, Signatur, Öffnen.
  var pe = { kind: 'wave', card: null, src: null, rows: {}, list: [], sig: null,
    original: function (key) { return original(key); },
    onOpen: function () { close(); } };

  function place() {
    if (!menu || !pe.card) return;
    var GLASS = window.casoraMenuGlass;
    var wv = pe.card.shadowRoot && pe.card.shadowRoot.querySelector('.np-head-wave');
    var r = (wv || pe.card).getBoundingClientRect();
    // Rechts bündig mit der Kopfleiste (Stapel-Breite), wie bisher die Kacheln unter der Welle.
    var outer = pe.src && pe.src.card.getBoundingClientRect();
    var right = Math.max(r.right, outer && outer.width ? outer.right : 0);
    var w = menu.offsetWidth;
    menu.style.top = (GLASS ? GLASS.dropTop(r, 12) : Math.round(r.bottom + 12)) + 'px';
    menu.style.left = Math.round(Math.max(12, Math.min(right - w, window.innerWidth - w - 12))) + 'px';
    body.style.maxHeight = Math.max(160, Math.min(560, window.innerHeight - parseFloat(menu.style.top) - 24
      - (head ? head.offsetHeight : 0))) + 'px';
  }

  function paint(force) {
    if (!menu) return;
    var h = getHass(); if (!h) return;
    var l = list(pe.src);
    // Letzte Wiedergabe beendet: sanft schließen statt einen leeren Zustand zu zeigen.
    if (!l.length) { close(true); return; }
    if (force) pe.sig = null;
    var NP = window._casoraNPSoft;
    if (!NP || !NP.paint) return;
    var built = NP.paint(pe, wrap, l, h.states, { panel: true });
    // Gruppen zählen (gleicher Titel auf mehreren Playern = eine Wiedergabe).
    var n = NP.group ? NP.group(l).length : l.length;
    var label = n === 1 ? T('Läuft gerade') : T(n + ' Wiedergaben');
    if (head.textContent !== label) head.textContent = label;
    if (built !== null) place();
  }

  function open(anchor) {
    var GLASS = window.casoraMenuGlass, NP = window._casoraNPSoft;
    if (!GLASS || !NP || !NP.paint) return false;
    var src = null;
    for (var up = anchor, i = 0; up && i < 6 && !src; i++) {
      var rn = up.getRootNode && up.getRootNode();
      up = rn && rn.host;
      cards.forEach(function (c) { if (c.card === up) src = c; });
    }
    if (!src || !list(src).length) return false;
    pe.card = anchor; pe.src = src; pe.sig = null;

    menu = document.createElement('div');
    menu.className = 'casora-welle-menu';
    menu.setAttribute('role', 'dialog');
    menu.setAttribute('aria-label', T('Aktuelle Wiedergabe'));
    menu.setAttribute('data-no-i18n', '');
    Object.assign(menu.style, {
      position: 'fixed', zIndex: '99999', boxSizing: 'border-box',
      width: 'min(392px, calc(100vw - 24px))', padding: '0', overflow: 'hidden',
    });
    GLASS.apply(menu);
    // Wie das Mitteilungsmenü: weicher Schatten des Designs statt Glas-Rand.
    menu.style.boxShadow = 'var(--casora-notify-shadow, ' + menu.style.boxShadow + ')';

    var inner = document.createElement('div');
    Object.assign(inner.style, { borderRadius: 'inherit', overflow: 'hidden', clipPath: 'inset(0 round ' + GLASS.radius + ')' });
    // Kopfzeile außerhalb der Liste, damit bei vielen Playern nur die Zeilen scrollen.
    head = document.createElement('div');
    head.className = 'casora-welle-head';
    Object.assign(head.style, {
      padding: '13px 18px 3px', fontFamily: 'var(--primary-font-family, system-ui)',
      fontSize: '13px', fontWeight: '600', letterSpacing: '.01em', lineHeight: '1.3',
      color: 'var(--casora-menu-fg-sub, var(--secondary-text-color, rgba(98,87,76,.92)))',
    });
    inner.appendChild(head);

    body = document.createElement('div');
    Object.assign(body.style, { overflowY: 'auto', overscrollBehavior: 'contain', boxSizing: 'border-box' });
    var host = document.createElement('div');
    var sr = host.attachShadow({ mode: 'open' });
    sr.innerHTML = '<style>' + NP.CSS + CSS + '</style><div class="w"></div>';
    wrap = sr.querySelector('.w');
    NP.bind(pe, sr);
    body.appendChild(host);
    inner.appendChild(body);
    menu.appendChild(inner);
    document.body.appendChild(menu);
    GLASS.lockScroll && GLASS.lockScroll(menu, body);

    paint(true);
    place();
    GLASS.enter(menu);
    mark(src);

    setTimeout(function () {
      if (!menu) return;
      window.addEventListener('keydown', onKey, true);
      document.addEventListener('pointerdown', onAway, true);
      window.addEventListener('resize', onResize);
    }, 0);
    return true;
  }

  function onKey(e) { if (e.key === 'Escape') close(); }
  function onAway(e) {
    var path = (e.composedPath && e.composedPath()) || [e.target];
    if (!menu || path.indexOf(menu) !== -1) return;
    // Tipp auf die Welle selbst: deren Aktion schließt (toggle).
    if (pe.card && path.indexOf(pe.card) !== -1) return;
    close();
  }
  function onResize() {
    if (!menu) return;
    if (!W.on()) { close(); return; }
    place();
  }

  // gentle: von selbst geschlossen (letzte Wiedergabe beendet) – langsamer ausblenden, im Takt der Welle.
  function close(gentle) {
    if (!menu) return;
    var m = menu, src = pe.src;
    menu = null; body = null; wrap = null; head = null;
    window.removeEventListener('keydown', onKey, true);
    document.removeEventListener('pointerdown', onAway, true);
    window.removeEventListener('resize', onResize);
    if (src) mark(src);
    pe.sig = null;
    var GLASS = window.casoraMenuGlass;
    if (gentle === true || !GLASS) {
      m.style.pointerEvents = 'none';
      m.style.transition = 'opacity 320ms cubic-bezier(0.32,0.72,0,1), transform 320ms cubic-bezier(0.32,0.72,0,1)';
      m.style.opacity = '0';
      m.style.transform = 'translateY(-4px)';
      setTimeout(function () { if (m.parentNode) m.remove(); }, 360);
    } else GLASS.exit(m, function () { if (m.parentNode) m.remove(); });
  }

  // Ausblenden oder abgelaufene Pausen-Frist (casora-core.js): Karten neu rechnen lassen – die
  // Sichtbarkeit der Welle (variables.open) nutzt dieselbe gefilterte Liste – und das Menü nachziehen.
  window.addEventListener('casora-np-changed', function () {
    cards.forEach(function (c) {
      if (!c.card.isConnected) return;
      try { if (window.casoraKick) window.casoraKick(c.card); } catch (e) { /* egal */ }
    });
    if (menu) paint(true);
  });

  W.toggle = function (anchor) {
    if (menu) { close(); return; }
    // Ein anderes Menü (Mitteilungen, Einstellungen) zuerst schließen, wie die Glocke es tut.
    try { if (window._casoraNotify) window._casoraNotify.close(); } catch (e) { /* egal */ }
    var pop = window.casoraPopup && window.casoraPopup.element;
    if (pop && pop.hasAttribute('open')) { window.casoraPopup.close(); return; }
    open(anchor);
  };
  W.close = close;
  Object.defineProperty(W, 'isOpen', { get: function () { return !!menu; } });
})();
