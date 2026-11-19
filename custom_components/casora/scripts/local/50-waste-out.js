// ── Waste put out (issue #211) ───────────────────────────────────────────────
// On the pickup day (or the evening before, while the waste tile is active) a tap on the tile's icon confirms
// "put out": the tile hides until the next pickup, a notice offers „Rückgängig“. The waste popup carries the same
// as a switch row „Rausgestellt“ (on/off, so it is also the way back). The header line under the greeting keeps
// naming the pickup (casoraHomeNext reads the bins, not this list).
// Shared by every device and user: the integration keeps the list (waste_out.py, casora/waste_out/subscribe|set)
// and pushes changes to every open dashboard; localStorage only gives the first paint before the push arrives.
// A confirmation is keyed by the pickup („2026-11-20|restmüll“), so the next pickup has another key and the tile
// comes back by itself.
//   window._casoraWasteOut.key(W, now)        → key of the pickup the tile is active for, or null
//   window._casoraWasteOut.isOut(W, now)      → that pickup is confirmed
//   window._casoraWasteOut.hidden(hass, vars) → the tile hides (template `hidden`)
//   window._casoraWasteOut.due(hass, vars)    → an icon tap confirms (template `icon_tap_action`)
//   window._casoraWasteOut.confirm(hass, vars)  icon tap
//   window._casoraWasteOut.set(hass, key, out)  write (optimistic), push to the server
//   window._casoraWasteOut.rowHtml(hass, W)   → the popup's „Rausgestellt“ row ('' when nothing is due)
(function () {
  if (window._casoraWasteOut) return;
  var O = window._casoraWasteOut = {};
  var LS = 'casora_waste_out';
  var T = function (x) { return typeof window.casoraTr === 'function' ? window.casoraTr(x) : x; };
  var esc = function (t) { return (window.casoraEsc || function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); })(t); };
  var rows = {};
  try {
    var cached = JSON.parse(localStorage.getItem(LS) || 'null');
    if (cached && typeof cached === 'object' && cached.rows && typeof cached.rows === 'object') rows = cached.rows;
  } catch (e) { /* first paint without the cache */ }
  var two = function (n) { return (n < 10 ? '0' : '') + n; };

  O.key = function (W, now) {
    if (!W || !W.next || W.days == null || !isFinite(W.days) || W.days < 0 || W.days > 1 || W.duty === false) return null;
    var d = new Date(now || Date.now());
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + W.days);
    var label = String(W.next.label || '').trim().toLowerCase();
    if (!label) return null;
    return (d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()) + '|' + label).slice(0, 200);
  };
  O.isOut = function (W, now) {
    var k = O.key(W, now);
    return !!(k && rows[k] > 0);
  };
  O.rows = function () { return rows; };

  var wasteOf = function (hass, variables) {
    try { return window.casoraDevice && window.casoraDevice.waste ? window.casoraDevice.waste(hass, variables || {}) : null; } catch (e) { return null; }
  };

  // ── Server list: subscribe once per connection ─────────────────────────────
  var conn = null;
  var apply = function (next) {
    var before = JSON.stringify(rows);
    rows = next && typeof next === 'object' ? next : {};
    try { localStorage.setItem(LS, JSON.stringify({ rows: rows })); } catch (e) { /* shared list only */ }
    if (JSON.stringify(rows) !== before) O.redraw();
  };
  O.ensure = function (hass) {
    var c = hass && hass.connection;
    if (!c || c === conn || typeof c.subscribeMessage !== 'function') return;
    conn = c;
    try {
      Promise.resolve(c.subscribeMessage(function (v) {
        if (conn === c && v && typeof v === 'object') apply(v.rows);
      }, { type: 'casora/waste_out/subscribe' })).catch(function () { if (conn === c) conn = null; });
    } catch (e) { conn = null; }
  };
  // Waste tiles draw again (hidden or back); other tiles stay as they are.
  var isTrash = function (el) {
    var t = el && el._config && el._config.template;
    return /casora_trash/.test(JSON.stringify(t || ''));
  };
  O.redraw = function () {
    try { if (typeof window.casoraKickAll === 'function') window.casoraKickAll('waste-out', isTrash); } catch (e) { /* the next state push redraws */ }
  };

  O.hidden = function (hass, variables) {
    if (window.casoraInStudio && window.casoraInStudio()) return false;
    O.ensure(hass);
    return O.isOut(wasteOf(hass, variables));
  };
  O.due = function (hass, variables) {
    O.ensure(hass);
    var W = wasteOf(hass, variables);
    return !!(O.key(W) && !O.isOut(W));
  };

  var notice = function (detail) {
    if (typeof window.casoraNotice === 'function') { window.casoraNotice(detail, { overPopup: true }); return; }
    var ha = document.querySelector('home-assistant');
    if (!ha) return;
    var ev = new Event('hass-notification', { bubbles: true, composed: true });
    ev.detail = detail;
    ha.dispatchEvent(ev);
  };
  O.set = function (hass, key, out) {
    if (!key) return Promise.resolve(false);
    var prev = rows[key];
    var next = Object.assign({}, rows);
    if (out) next[key] = Date.now(); else delete next[key];
    apply(next);
    O.ensure(hass);
    var c = hass && hass.connection;
    if (!c || typeof c.sendMessagePromise !== 'function') return Promise.resolve(true);
    return Promise.resolve(c.sendMessagePromise({ type: 'casora/waste_out/set', key: key, out: !!out })).then(function (r) {
      if (r && r.rows) apply(r.rows);
      return true;
    }, function () {
      // Not saved (older integration, no connection): back to what it was, and say so.
      var back = Object.assign({}, rows);
      if (prev) back[key] = prev; else delete back[key];
      apply(back);
      notice({ message: T('Hat nicht geklappt') });
      return false;
    });
  };
  O.confirm = function (hass, variables) {
    var W = wasteOf(hass, variables), key = O.key(W);
    if (!key) return;
    if (window.casoraHaptic) window.casoraHaptic('success');
    O.set(hass, key, true).then(function (ok) {
      if (!ok) return;
      notice({ message: T('Müll ist rausgestellt'), duration: 6000,
        action: { text: T('Rückgängig'), action: function () { O.set(hass, key, false); } } });
    });
  };

  // ── Popup row ──────────────────────────────────────────────────────────────
  var switchHtml = function (key, on) {
    return '<div role="switch" tabindex="0" aria-label="' + esc(T('Rausgestellt')) + '" aria-checked="' + (on ? 'true' : 'false') + '"'
      + ' data-casora-wasteout="' + esc(key) + '" style="position:relative;width:44px;height:26px;cursor:pointer;'
      + 'border-radius:999px;flex:none;transition:background .2s ease;background:'
      + (on ? 'var(--casora-sw-on, var(--casora-lps-switch-on, #B67A50))' : 'var(--casora-sw-off, rgba(58,50,43,0.38))') + ';">'
      + '<div style="position:absolute;top:3px;left:' + (on ? '21px' : '3px') + ';width:20px;height:20px;border-radius:50%;pointer-events:none;'
      + 'background:var(--casora-lps-knob, #fff);box-shadow:var(--casora-sw-ks, 0 1px 3px rgba(0,0,0,0.2));transition:left .2s ease;"></div></div>';
  };
  var innerRowHtml = function (W, key, on) {
    var UI = window._casoraUI;
    if (!UI || !UI.group) return '';
    return UI.group([{
      icon: on ? 'mdi:check' : 'mdi:trash-can-outline', iconTone: on ? 'good' : (W.next.color || null),
      label: 'Rausgestellt',
      sub: on ? 'Kachel bis zur nächsten Abholung ausgeblendet' : W.next.label + ' · ' + (W.days === 0 ? 'Heute' : 'Morgen'),
      active: on, tappable: true, noChev: true, endHtml: switchHtml(key, on),
    }]);
  };
  O.rowHtml = function (hass, W) {
    O.ensure(hass);
    var key = O.key(W);
    if (!key) return '';
    var on = !!(rows[key] > 0);
    // ha-card.disabled: the popup's content card has no tap action, its rows still take taps.
    return '<style>ha-card.disabled{pointer-events:auto!important;}</style>'
      + '<div data-casora-wasteout-box="" data-casora-wasteout-w="' + esc(JSON.stringify({ label: W.next.label, color: W.next.color || null, days: W.days })) + '">'
      + innerRowHtml(W, key, on) + '</div>';
  };
  // A tap on the row or its switch flips it; the row redraws at once (the tile behind hides or comes back).
  var flip = function (box, key) {
    var hass = (document.querySelector('home-assistant') || {}).hass;
    var on = !(rows[key] > 0);
    if (window.casoraHaptic) window.casoraHaptic('selection');
    O.set(hass, key, on);
    var W = null;
    try { W = JSON.parse(box.getAttribute('data-casora-wasteout-w') || 'null'); } catch (e) { W = null; }
    if (W && W.label) box.innerHTML = innerRowHtml({ next: { label: W.label, color: W.color }, days: W.days }, key, on);
  };
  var onTap = function (ev) {
    if (ev.type === 'keydown' && ev.key !== 'Enter' && ev.key !== ' ') return;
    var path = (ev.composedPath && ev.composedPath()) || [];
    var key = null, box = null;
    for (var i = 0; i < path.length; i++) {
      var n = path[i];
      if (!n || n.nodeType !== 1) continue;
      if (!key && n.hasAttribute('data-casora-wasteout')) key = n.getAttribute('data-casora-wasteout');
      if (!key && n.classList && n.classList.contains('hui-row')) {
        var sw = n.querySelector('[data-casora-wasteout]');
        if (sw) key = sw.getAttribute('data-casora-wasteout');
      }
      if (n.hasAttribute('data-casora-wasteout-box')) { box = n; break; }
    }
    if (!key || !box) return;
    ev.preventDefault();
    ev.stopPropagation();
    flip(box, key);
  };
  window.addEventListener('click', onTap, true);
  window.addEventListener('keydown', onTap, true);
})();
