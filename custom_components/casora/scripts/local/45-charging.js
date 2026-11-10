// ── Chargers near the car (issue 168, charging.py) ───────────────────────────────────────────────────────────────
// A row „Ladesäulen“ in the car popup's battery section (window._casoraCar, 03-popups.js) and a sub page in the same
// popup: a filter (all, AC, DC, HPC, free) with the number of chargers each, and the list, nearest first. A row opens
// the place in the map app. Source line „Daten: Open Charge Map, CC BY 4.0“.
// Data: websocket casora/charging/list, asked when the page opens (Casora keeps the answer for half an hour). Without
// a key (casora/charging/ready) there is no row. No live availability: Open Charge Map has none.
//   window._casoraCharge.item(p, states)  → the row for the car popup, or null
//   window._casoraCharge.pick(list, f)    → the chargers of one filter
//   window._casoraCharge.sub(s)           → the second line of one charger
//   window._casoraCharge.body(key)        → the page's content from what is loaded
(function () {
  if (window._casoraCharge) return;
  var X = window._casoraCharge = { ready: null, data: {}, filter: {} };
  var MAX_ROWS = 30;
  var FILTERS = [['all', 'Alle'], ['ac', 'AC'], ['dc', 'DC'], ['hpc', 'HPC'], ['free', 'Kostenlos']];
  var esc = window.casoraEsc || function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var loc = function () { return window.casoraLocale ? window.casoraLocale() : 'de-DE'; };
  var fmt = function (n, d) { return Number(n).toLocaleString(loc(), { minimumFractionDigits: d, maximumFractionDigits: d }); };
  var km = function (d) { return fmt(d, 1) + ' km'; };
  var hassOf = function () { var ha = document.querySelector('home-assistant'); return (ha && ha.hass) || null; };

  // The car's device (p as in window._casoraCar: prefix or entity).
  X.device = function (p) {
    var C = window._casoraCar, h = hassOf(), R = (h && h.entities) || {};
    if (!C || !C.map) return null;
    var m = C.map(p), ids = Object.keys(m);
    for (var i = 0; i < ids.length; i++) { var x = R[m[ids[i]]]; if (x && x.device_id) return x.device_id; }
    return null;
  };

  // Whether a key is set: one call per page load that asks Casora only, never Open Charge Map.
  X.check = function () {
    var h = hassOf();
    if (X._asked || !h || !h.callWS) return;
    X._asked = true;
    h.callWS({ type: 'casora/charging/ready' }).then(function (r) { X.ready = !!(r && r.ready); }, function () { X.ready = false; });
  };

  X.pick = function (list, f) {
    return (list || []).filter(function (s) { return f === 'all' || !f ? true : !!s[f]; });
  };
  // „Testladenetz · 300 kW DC · 6 Ladepunkte · kostenlos“: what is known, nothing made up.
  X.sub = function (s) {
    var bits = [];
    if (s.op) bits.push(s.op);
    if (s.kw != null) bits.push(fmt(s.kw, s.kw % 1 ? 1 : 0) + ' kW' + (s.dc ? ' DC' : s.ac ? ' AC' : ''));
    else if (s.dc || s.ac) bits.push(s.dc ? 'DC' : 'AC');
    if (s.points != null) bits.push(s.points === 1 ? '1 Ladepunkt' : s.points + ' Ladepunkte');
    if (s.free) bits.push('kostenlos');
    return bits.join(' · ');
  };
  X.mapUrl = function (s) {
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(s.lat + ',' + s.lng);
  };

  // ── Row in the car popup ─────────────────────────────────────────────────
  X.item = function (p, states) {
    if (X.ready === null) X.check();
    if (!X.ready) return null;
    var d = X.data[p || ''];
    var first = d && d.stations && d.stations[0];
    return { icon: 'mdi:ev-station', iconTone: 'accent', label: 'Ladesäulen', sub: 'In der Nähe',
      value: first ? 'ab ' + km(first.d) : null, page: 'charging|' + (p || '') };
  };

  // ── Page ─────────────────────────────────────────────────────────────────
  var ERR = { wait: 'Gleich noch einmal versuchen', key: 'Open Charge Map nimmt den Schlüssel nicht an',
    limit: 'Zu viele Abfragen, später noch einmal', timeout: 'Open Charge Map antwortet gerade nicht' };
  X.body = function (key) {
    var UI = window._casoraUI, d = X.data[key];
    if (!UI) return '';
    if (!d || (d.loading && !d.stations)) return UI.note('Ladesäulen werden geladen');
    var all = d.stations || [];
    if (d.error && !all.length) return UI.note(ERR[d.error] || 'Abruf gestört');
    if (!all.length) return UI.note('Keine Ladesäule in diesem Umkreis') + '<div style="height:10px"></div>' + UI.note('Daten: Open Charge Map, CC BY 4.0');
    var f = X.filter[key] || 'all';
    var segs = FILTERS.map(function (x) {
      return { label: x[1] + ' ' + X.pick(all, x[0]).length, active: x[0] === f, attrs: { 'data-casora-charge-f': x[0] } };
    });
    var list = X.pick(all, f);
    var rows = list.slice(0, MAX_ROWS).map(function (s) {
      return { icon: s.hpc ? 'mdi:lightning-bolt' : 'mdi:ev-station', iconTone: s.dc ? 'accent' : null,
        label: s.n || s.a || 'Ladesäule', labelLit: !!(s.n || s.a), sub: X.sub(s) || s.a || null,
        value: km(s.d), url: X.mapUrl(s) };
    });
    var where = (d.origin === 'car' ? 'Rund um das Auto' : 'Rund um Zuhause') + ' · ' + fmt(d.radius, 0) + ' km';
    return UI.segments(segs, null)
      + '<div style="height:var(--casora-popup-sec-gap, 22px)"></div>'
      + (rows.length ? UI.group(rows, 'In der Nähe', null, { keepNames: true }) : UI.note('Keine Ladesäule passt zum Filter'))
      + '<div style="height:10px"></div>' + UI.note(where)
      + UI.note('Daten: Open Charge Map, CC BY 4.0');
  };
  X.inner = function (key) {
    return '<div data-casora-charge-box="' + esc(key) + '" onclick="window._casoraCharge.tap(event)">' + X.body(key) + '</div>';
  };
  // Every box of this car in the open popup (the page is a card of its own, so through the shadow roots).
  var boxes = function (key) {
    var P = window.casoraPopup, out = [];
    var walk = function (root, depth) {
      if (!root || depth > 8 || !root.querySelectorAll) return;
      [].forEach.call(root.querySelectorAll('[data-casora-charge-box]'), function (el) { if (el.dataset.casoraChargeBox === key) out.push(el); });
      [].forEach.call(root.querySelectorAll('button-card, hui-card, hui-vertical-stack-card, hui-conditional-card, .content *'), function (el) { if (el.shadowRoot) walk(el.shadowRoot, depth + 1); });
    };
    if (P && P.element && P.element.shadowRoot) walk(P.element.shadowRoot, 0);
    return out;
  };
  X.paint = function (key) {
    boxes(key).forEach(function (el) { el.innerHTML = X.body(key); });
  };
  X.load = function (key, dev) {
    var h = hassOf(), old = X.data[key];
    if (!h || !h.callWS) return;
    X.data[key] = Object.assign({}, old || {}, { loading: true });
    var msg = { type: 'casora/charging/list' };
    if (dev) msg.device_id = dev;
    h.callWS(msg).then(function (r) {
      X.data[key] = r || { stations: [], error: 'net' };
      X.paint(key);
    }, function () {
      X.data[key] = Object.assign({}, old || { stations: [] }, { loading: false, error: old && old.stations && old.stations.length ? null : 'net' });
      X.paint(key);
    });
  };
  X.tap = function (ev) {
    var path = (ev.composedPath && ev.composedPath()) || [], f = null, box = null;
    for (var i = 0; i < path.length; i++) {
      var el = path[i];
      if (!el || !el.dataset) continue;
      if (f === null && el.dataset.casoraChargeF) f = el.dataset.casoraChargeF;
      if (el.dataset.casoraChargeBox !== undefined) { box = el; break; }
    }
    if (!f || !box) return;
    ev.preventDefault(); ev.stopPropagation();
    if (window.casoraHaptic) window.casoraHaptic('selection');
    var key = box.dataset.casoraChargeBox;
    X.filter[key] = f;
    box.innerHTML = X.body(key);
  };
  (window._casoraPages || (window._casoraPages = {})).charging = function (arg) {
    var H = window._casoraHH, key = arg || '';
    if (!H || !H.page) return;
    var C = window._casoraCar, m = C && C.map ? C.map(arg || null) : {}, ids = Object.keys(m).map(function (k) { return m[k]; });
    X.load(key, X.device(arg || null));
    H.page('Ladesäulen', ids.slice(0, 1), 'return window._casoraCharge ? window._casoraCharge.inner(' + JSON.stringify(key) + ') : "";', ids[0] || null);
  };
  X.check();
})();
