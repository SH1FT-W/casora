// ── Doorbell moment: a ring brings the doorbell to the front ────────────────────────────────────────────────────────
// When a doorbell rings, every open Casora dashboard in the foreground (wall tablet, desktop, phone) ends the
// screensaver and opens the popup of the doorbell's camera: the Reolink doorbell popup with live picture, sound, talk and
// quick replies (24-klingel.js), else the camera's own popup, else the camera large (18-ziele.js openCamera). Nobody
// touches it: it closes itself after the ring window and the dashboard goes back to where it was (the popup open
// before, the screensaver that was showing). A second ring while it is open only extends it; a ring shortly after it
// closed does not open it again. Nothing opens while someone is typing (Studio, search, any field), on a hidden page,
// in the Studio or while the dashboard is being edited.
// Doorbells are the bell's own (window.casoraIsDoorbell, 00-finder.js): event entities with device_class doorbell,
// the Reolink visitor sensor, an occupancy „ding“ sensor. Only a doorbell with a camera on its device takes part.
// Setting per dashboard (Studio › Settings › Bell & messages): notify_doorbell_front, on unless false. It arrives through
// the bell's configureFrom (desktop: the room card, phone: the desktop twin), window._casoraNotify.doorbellFront.
// Idle cost: one subscribe_entities for the doorbells only (pushed by HA, no polling), plus a check every minute
// whether the registry changed. Nothing runs between rings.
//   window._casoraKlingelMoment.isRing(id, prev, next, now) → did this state change ring? ({s, lc} in seconds)
//   window._casoraKlingelMoment.decide(o)                  → 'open' | 'extend' | 'skip'
//   window._casoraKlingelMoment.camOf(hass, id)            → the camera on the doorbell's device, or null
//   window._casoraKlingelMoment.bells(hass)                → { doorbell id: camera id } of the house
//   window._casoraKlingelMoment.typing(doc)                → is a text field focused (through shadow roots)?
//   window._casoraKlingelMoment.ring(id)                   → handle a ring of this doorbell (tests, the subscription)
(function () {
  if (window._casoraKlingelMoment && typeof window._casoraKlingelMoment.decide === 'function') return;
  var M = window._casoraKlingelMoment = {};
  var RING_MS = 90000;      // the ring window: closes itself after this without a touch
  var QUIET_MS = 30000;     // after it closed, another ring of the same doorbell within this does not reopen it
  var FRESH_MS = 120000;    // a change older than this is a reconnect or restart, not a ring
  M.RING_MS = RING_MS;
  M.QUIET_MS = QUIET_MS;
  var bad = function (s) { return s == null || s === '' || s === 'unknown' || s === 'unavailable'; };

  // ── Pure rules ──────────────────────────────────────────────────────────
  // prev/next: { s: state, lc: last_changed in seconds }. event.*: the state is the time of the last press, a new time
  // is a ring (unknown → a time is the first press since the start; unavailable → anything is the entity coming back).
  // binary_sensor: off → on. Either way the change itself must be fresh.
  M.isRing = function (id, prev, next, now) {
    if (!next || bad(next.s) || !prev || prev.s === 'unavailable' || prev.s === next.s) return false;
    var at = typeof next.lc === 'number' && isFinite(next.lc) ? next.lc * 1000 : null;
    var dom = String(id || '').split('.')[0];
    if (dom === 'event') {
      var t = Date.parse(next.s);
      if (isFinite(t)) at = t;
    } else if (dom === 'binary_sensor') {
      if (next.s !== 'on' || prev.s !== 'off') return false;
    } else return false;
    return at == null || Math.abs((now || Date.now()) - at) <= FRESH_MS;
  };

  // o: { on (setting), cam, hidden, typing, studio, editing, active (the moment's popup is still open), last (when the
  // last moment of this doorbell ended, ms), now }.
  M.decide = function (o) {
    o = o || {};
    if (o.on === false || !o.cam || o.studio || o.editing || o.hidden) return 'skip';
    if (o.active) return 'extend';
    if (o.typing) return 'skip';
    if (o.last && (o.now || Date.now()) - o.last < (M._quietMs || QUIET_MS)) return 'skip';
    return 'open';
  };

  // The live camera of the doorbell's device: the Reolink one (sub before main, 24-klingel.js liveCam), else a camera
  // that is no snapshot camera. Hidden or disabled cameras do not count.
  M.camOf = function (hass, id) {
    var R = (hass && hass.entities) || {}, S = (hass && hass.states) || {}, me = R[id];
    if (!me || !me.device_id) return null;
    var KL = window._casoraKlingel, list = [];
    Object.keys(R).forEach(function (x) {
      var e = R[x];
      if (!e || x.indexOf('camera.') !== 0 || e.device_id !== me.device_id || !S[x] || e.hidden || e.disabled_by) return;
      if (/^snapshots_/.test(String(e.translation_key || ''))) return;
      list.push(x);
    });
    if (!list.length) return null;
    if (KL && typeof KL.liveCam === 'function') {
      var live = list.filter(function (x) { try { return KL.liveCam(hass, x); } catch (e) { return false; } });
      if (live.length) return live[0];
    }
    list.sort(function (a, b) { return (R[a].translation_key === 'sub' ? 0 : 1) - (R[b].translation_key === 'sub' ? 0 : 1) || (a < b ? -1 : 1); });
    return list[0];
  };

  M.bells = function (hass) {
    var out = {}, S = (hass && hass.states) || {}, is = window.casoraIsDoorbell;
    if (typeof is !== 'function') return out;
    Object.keys(S).forEach(function (id) {
      if (!/^(event|binary_sensor)\./.test(id)) return;
      var yes = false;
      try { yes = !!is(hass, id); } catch (e) { yes = false; }
      if (!yes) return;
      var cam = M.camOf(hass, id);
      if (cam) out[id] = cam;
    });
    return out;
  };

  // A focused text field, also inside shadow roots (the Studio and Casora's popups live in them).
  M.typing = function (doc) {
    var a = doc && doc.activeElement, n = 0;
    while (a && a.shadowRoot && a.shadowRoot.activeElement && n++ < 30) a = a.shadowRoot.activeElement;
    if (!a || !a.tagName) return false;
    var tag = String(a.tagName).toUpperCase();
    if (tag === 'TEXTAREA' || a.isContentEditable) return true;
    if (tag !== 'INPUT') return false;
    return !/^(button|checkbox|radio|range|color|file|submit|reset|image|hidden)$/i.test(String(a.type || 'text'));
  };

  // ── On the dashboard ────────────────────────────────────────────────────
  if (!window.document || window.document.nodeType !== 9 || M._booted) return;
  M._booted = true;
  var hassOf = function () { var ha = document.querySelector('home-assistant'); return (ha && ha.hass) || null; };
  var cfgOf = function () { try { return typeof window._casoraLovelaceCfg === 'function' ? window._casoraLovelaceCfg() : null; } catch (e) { return null; } };
  var casoraDash = function (cfg) { return !!(cfg && cfg.button_card_templates && cfg.button_card_templates.casora_room); };
  var editing = function () {
    var ll = window._casoraLLEl;
    return !!(ll && ll.lovelace && ll.lovelace.editMode);
  };
  var ended = {};      // doorbell id → when its last moment ended (ms)
  var cur = null;      // the moment on screen: { id, cam, cfg, prev, saver, timer, touched }
  var touch = function () { if (cur) cur.touched = true; };
  // Still the moment's popup? The popup may redraw itself with a new config (resize, live parts), so the same title
  // counts too; another popup in between always comes from a touch, which ends the moment anyway.
  var same = function (a, b) { return !!(a && b && (a === b || (typeof a.title === 'string' && a.title && a.title === b.title))); };
  var own = function () {
    var P = window.casoraPopup;
    return !!(cur && P && cur.cfg && same(P.current, cur.cfg));
  };
  var unhook = function () {
    ['pointerdown', 'keydown', 'wheel'].forEach(function (t) { window.removeEventListener(t, touch, true); });
  };
  var finish = function (auto) {
    var m = cur;
    if (!m) return;
    cur = null;
    clearTimeout(m.timer);
    unhook();
    ended[m.id] = Date.now();
    if (!auto) return;
    var P = window.casoraPopup;
    if (P && same(P.current, m.cfg)) P.close();
    // Back to where it was: the popup that was open before, else the screensaver that was showing.
    if (m.prev && P) { try { P.open(m.prev); } catch (e) { /* the dashboard as it is */ } return; }
    var SV = window._casoraSaver;
    if (m.saver && SV && typeof SV.start === 'function') setTimeout(function () { if (!cur) SV.start(); }, 400);
  };
  var arm = function (m) {
    clearTimeout(m.timer);
    m.timer = setTimeout(function tick() {
      if (cur !== m) return;
      // Someone used it or another popup took over: it is theirs now.
      if (m.touched || !own()) return finish(false);
      finish(true);
    }, M._ringMs || RING_MS);
  };
  var open = function (id, cam) {
    var P = window.casoraPopup, SV = window._casoraSaver;
    if (!P) return;
    var m = { id: id, cam: cam, cfg: null, prev: P.current || null, saver: !!(SV && SV.shown && SV.shown()), timer: 0, touched: false };
    cur = m;
    if (SV && typeof SV.wake === 'function') SV.wake();
    var KL = window._casoraKlingel, Z = window._casoraZiele, via = window._casoraNotifyOpenViaCard;
    var settle = function (c) {
      m.cfg = c;
      // A touch from now on means someone is looking at it: it stays.
      ['pointerdown', 'keydown', 'wheel'].forEach(function (t) { window.addEventListener(t, touch, { capture: true, passive: true }); });
      arm(m);
    };
    // The tile's tap reports back before its popup is on screen: wait for it (at most two seconds).
    var took = function () {
      var n = 0;
      (function wait() {
        if (cur !== m) return;
        var c = P.current;
        if (c && c !== m.prev) return settle(c);
        if (++n < 25) return void setTimeout(wait, 80);
        cur = null; ended[id] = Date.now();
      })();
    };
    var last = function () {
      if (Z && typeof Z.openCamera === 'function' && Z.openCamera(cam)) return took();
      cur = null;
    };
    if (typeof via !== 'function') return last();
    // The doorbell's tile on this dashboard (same popup, same header), else the tile type built for it, else the camera.
    via(cam, function (ok) {
      if (ok) return took();
      var tpl = KL && typeof KL.is === 'function' && KL.is(hassOf(), cam) ? 'casora_reolink_doorbell' : 'casora_camera';
      via(cam, function (ok2) { if (ok2) took(); else last(); }, { type: 'custom:button-card', template: tpl, entity: cam }, true);
    });
  };
  M.ring = function (id) {
    var h = hassOf(), cfg = cfgOf();
    var cam = bells[id] || (h ? M.camOf(h, id) : null);
    var N = window._casoraNotify;
    var d = M.decide({
      on: !(N && N.doorbellFront === false) && casoraDash(cfg),
      cam: cam,
      hidden: !!document.hidden,
      typing: M.typing(document),
      studio: /^\/casora-studio/.test(location.pathname),
      editing: editing(),
      active: !!(cur && cur.id === id && (own() || !cur.cfg)),
      last: ended[id] || 0,
      now: Date.now(),
    });
    if (d === 'extend') { if (cur.cfg) arm(cur); return d; }
    if (d !== 'open') return d;
    if (cur) finish(false);
    open(id, cam);
    return d;
  };
  // Tests: the doorbells being watched, and shorter windows (M._ringMs, M._quietMs).
  M.watching = function () { return unsub ? Object.keys(bells) : []; };
  M.current = function () { return cur ? { id: cur.id, cam: cur.cam, touched: cur.touched, shown: !!cur.cfg, own: own(), prev: !!cur.prev, saver: cur.saver } : null; };

  // ── Watching the doorbells ──────────────────────────────────────────────
  // subscribe_entities for exactly these ids: HA pushes their changes, nothing else reaches this module.
  var bells = {}, key = '', unsub = null, seen = {}, reg = null, conn = null;
  var onMsg = function (msg) {
    if (!msg) return;
    var now = Date.now();
    if (msg.a) Object.keys(msg.a).forEach(function (id) { var x = msg.a[id] || {}; seen[id] = { s: x.s, lc: x.lc }; });
    if (msg.c) Object.keys(msg.c).forEach(function (id) {
      var add = (msg.c[id] || {})['+'];
      if (!add || add.s === undefined) return;
      var prev = seen[id], next = { s: add.s, lc: typeof add.lc === 'number' ? add.lc : (typeof add.lu === 'number' ? add.lu : null) };
      seen[id] = next;
      if (M.isRing(id, prev, next, now)) { try { M.ring(id); } catch (e) { console.warn('Casora doorbell moment:', e); } }
    });
    if (msg.r) msg.r.forEach(function (id) { delete seen[id]; });
  };
  var stop = function () {
    var u = unsub;
    unsub = null; seen = {};
    if (u) Promise.resolve(u).then(function (f) { if (typeof f === 'function') f(); }).catch(function () {});
  };
  var sync = function () {
    var h = hassOf();
    if (!h || !h.connection || typeof h.connection.subscribeMessage !== 'function' || !h.entities) return;
    if (h.entities === reg && h.connection === conn && key) return;
    var next = M.bells(h), k = Object.keys(next).sort().join(',');
    // The registry or the states may not be there yet: look again soon instead of in a minute.
    if (!k && !reg) { setTimeout(sync, 5000); }
    reg = h.entities;
    bells = next;
    if (k === key && h.connection === conn) return;
    stop();
    key = k; conn = h.connection;
    if (!k) return;
    try {
      unsub = h.connection.subscribeMessage(onMsg, { type: 'subscribe_entities', entity_ids: Object.keys(next) });
      Promise.resolve(unsub).catch(function () { unsub = null; key = ''; });
    } catch (e) { unsub = null; key = ''; }
  };
  setTimeout(sync, 1500);
  setInterval(sync, 60000);
  window.addEventListener('casora-local-loaded', function () { setTimeout(sync, 500); });
})();
