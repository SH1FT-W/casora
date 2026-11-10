// ── Chargers near the car (issue 168, charging.py) ───────────────────────────────────────────────────────────────
// A row „Ladesäulen“ in the car popup's battery section (window._casoraCar, 03-popups.js) and a sub page in the same
// popup, built like the fuel view (12-tanken.js): left the recommendation from the battery level (charge now, soon,
// not needed) with the battery scale, the chargers per speed class as columns, and three tiles (nearest, fastest,
// free); right a dot map of the radius, a switch Nächste / Schnellste / Kostenlos and the list. Every charger wears the
// colour of its speed class: up to 11 kW blue, up to 49 kW teal, from 50 kW yellow, from 150 kW orange. A row or tile
// opens the place in the map app. Source line „Daten: Open Charge Map, CC BY 4.0“.
// Data: websocket casora/charging/list, asked when the page opens (Casora keeps the answer for half an hour). Without
// a key (casora/charging/ready) there is no row. No live availability: Open Charge Map has none.
//   window._casoraCharge.item(p, states)  → the row for the car popup, or null
//   window._casoraCharge.cls(s)           → the speed class of one charger (k, label, color, icon)
//   window._casoraCharge.sorted(list, s)  → the list for one switch position (near, fast, free)
//   window._casoraCharge.picks(list)      → the nearest, the fastest and the nearest free charger
//   window._casoraCharge.advice(o)        → what to do, from battery level, range and what is near
//   window._casoraCharge.mark(s, size)    → the operator's logo over the bolt in the class colour
//   window._casoraCharge.body(key)        → the page's content from what is loaded
(function () {
  if (window._casoraCharge) return;
  var X = window._casoraCharge = { ready: null, data: {}, filter: {} };
  // Speed classes, slow to fast: a cool colour for slow, a warm one for fast (never red: that is an error).
  var CLASSES = [
    { k: 'slow', label: '≤11 kW', color: 'var(--casora-color-blue, #5B8FC9)', icon: 'mdi:ev-plug-type2' },
    { k: 'mid', label: '≤49 kW', color: 'var(--casora-color-teal, #4E9E95)', icon: 'mdi:ev-station' },
    { k: 'fast', label: '≥50 kW', color: 'var(--casora-color-yellow, #E8B04A)', icon: 'mdi:flash' },
    { k: 'hpc', label: '≥150 kW', color: 'var(--casora-color-orange, #DE8A4E)', icon: 'mdi:lightning-bolt' },
  ];
  var UNKNOWN = { k: 'unknown', label: 'Leistung unbekannt', color: 'var(--casora-soft-icon-off, rgba(140,115,90,0.45))', icon: 'mdi:ev-station' };
  X.cls = function (s) {
    var kw = s && s.kw;
    if (kw == null) return s && s.hpc ? CLASSES[3] : s && s.dc ? CLASSES[2] : UNKNOWN;
    return kw >= 150 ? CLASSES[3] : kw >= 50 ? CLASSES[2] : kw > 11 ? CLASSES[1] : CLASSES[0];
  };
  var kwText = function (s) { return s.kw != null ? fmt(s.kw, s.kw % 1 ? 1 : 0) + ' kW' : (s.dc ? 'DC' : s.ac ? 'AC' : '—'); };
  // The power as a pill in the colour of the class (the list's right end).
  var pill = function (s) {
    var c = X.cls(s);
    return '<span data-no-i18n style="display:inline-flex;align-items:center;height:26px;padding:0 10px;margin-left:10px;border-radius:999px;'
      + 'font-size:13px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;'
      + 'background:color-mix(in srgb, ' + c.color + ' 24%, transparent);color:color-mix(in srgb, ' + c.color + ' 78%, currentColor);">'
      + esc(kwText(s)) + (s.kw != null && (s.dc || s.ac) ? ' ' + (s.dc ? 'DC' : 'AC') : '') + '</span>';
  };
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

  // „Testladenetz · 6 Ladepunkte · kostenlos“: what is known, nothing made up (the power stands in the pill).
  X.sub = function (s) {
    var bits = [];
    if (s.op) bits.push(s.op);
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

  // ── Page (built like the fuel view, 12-tanken.js: recommendation, chart and three tiles left; map, switch and
  //    list right; one column on the phone) ────────────────────────────────
  var ERR = { wait: 'Gleich noch einmal versuchen', key: 'Open Charge Map nimmt den Schlüssel nicht an',
    limit: 'Zu viele Abfragen, später noch einmal', timeout: 'Open Charge Map antwortet gerade nicht' };
  var SORTS = [['near', 'Nächste'], ['fast', 'Schnellste'], ['free', 'Kostenlos']];
  var BOLT = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23000' d='M11 15H6l7-14v8h5l-7 14z'/%3E%3C/svg%3E";
  var tok = function () {
    var UI = window._casoraUI || {}, T = UI.tokens || {}, dark = false;
    try { dark = matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { /* no matter */ }
    var h = hassOf();
    if (h && h.themes && typeof h.themes.darkMode === 'boolean') dark = h.themes.darkMode;
    var ROW = 'var(--casora-soft-row-fill, rgba(140,115,90,0.07))';
    return { T: T, dark: dark, GOOD: 'var(--casora-popup-ui-good, #6AAE78)', WARN: 'var(--casora-popup-ui-warn, #E39A3B)',
      BAD: 'var(--casora-popup-ui-bad, #D35A4E)', ACC: 'var(--casora-popup-ui-accent, var(--casora-color-teal, #4E9E95))',
      SUB: 'var(--casora-soft-sub, ' + T.ink2 + ')', ROW: ROW, RAD: 'var(--casora-popup-row-radius, 24px)',
      TINT: function (c) { return 'color-mix(in srgb, ' + c + ' ' + (dark ? 22 : 16) + '%, ' + ROW + ')'; } };
  };
  var sp = function (px) { return '<div style="height:' + px + 'px"></div>'; };
  // „Schnellladepark Autohof Nord“ → „Autohof Nord“: the last two words name the place.
  var short = function (n) { var w = String(n || '').split(/\s+/).filter(Boolean); return w.length > 2 ? w.slice(-2).join(' ') : String(n || ''); };
  X.sorted = function (list, sort) {
    var s = (list || []).slice();
    if (sort === 'fast') s.sort(function (a, b) { return (b.kw || 0) - (a.kw || 0) || a.d - b.d; });
    else if (sort === 'free') s = s.filter(function (x) { return x.free; });
    return s;
  };
  // The nearest, the fastest and the nearest free charger (each once).
  X.picks = function (all) {
    var fast = X.sorted(all, 'fast')[0], free = X.sorted(all, 'free')[0], out = [];
    [['Nächste', all[0]], ['Schnellste', fast && fast.kw != null ? fast : null], ['Kostenlos', free]].forEach(function (t) {
      if (t[1] && !out.some(function (o) { return o[1] === t[1]; })) out.push(t);
    });
    return out;
  };
  // What to do, from the battery and what is near: charge now (≤ 20 % or ≤ 50 km), soon (≤ 40 %), or not needed.
  X.advice = function (o) {
    var near = o.nearest, fast = o.fast;
    // Whole sentences with placeholders: the translation works on the finished text.
    var one = fast || near;
    var where = one ? (fast ? 'Nächster Schnelllader: {n}, {d}.' : 'Nächste Ladesäule: {n}, {d}.').replace('{n}', one.n || one.a).replace('{d}', km(one.d))
      : 'Keine Ladesäule in diesem Umkreis';
    var eyebrow = o.soc != null ? 'Akku ' + fmt(o.soc, 0) + ' %' : 'In der Nähe';
    if (o.soc == null) return { tone: 'neutral', eyebrow: eyebrow, title: near ? 'Ladesäulen in der Nähe' : 'Keine Ladesäule', text: where };
    if (o.soc <= 20 || (o.range != null && o.range <= 50)) return { tone: 'warn', eyebrow: eyebrow, title: 'Jetzt laden', text: where };
    if (o.soc <= 40) return { tone: 'neutral', eyebrow: eyebrow, title: 'Bald laden', text: where };
    return { tone: 'good', eyebrow: eyebrow, title: 'Laden nicht nötig',
      text: o.range != null ? 'Der Akku reicht noch etwa {r} {u}.'.replace('{r}', fmt(o.range, 0)).replace('{u}', o.unit || 'km') : 'Der Akku ist gut gefüllt.' };
  };
  var verdict = function (A, soc, k) {
    var c = A.tone === 'warn' ? k.WARN : A.tone === 'good' ? k.GOOD : k.SUB;
    var out = '<div class="ch-verdict" style="background:' + (A.tone === 'neutral' ? k.ROW : k.TINT(c)) + ';border-radius:' + k.RAD + ';padding:18px 20px 16px;">'
      + '<div style="font-size:12px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:' + c + '">' + esc(A.eyebrow) + '</div>'
      + '<div style="font-size:21px;font-weight:800;letter-spacing:-.015em;color:' + k.T.ink + ';margin:4px 0;line-height:1.2">' + esc(A.title) + '</div>'
      + '<div class="ch-why" style="font-size:14px;font-weight:500;line-height:1.4;color:' + k.SUB + '">' + esc(A.text) + '</div>';
    // Battery scale empty → now → full.
    if (soc != null) {
      var pos = Math.max(0, Math.min(100, Math.round(soc)));
      out += '<div class="ch-scale" style="position:relative;height:8px;border-radius:99px;margin:18px 9px 8px;background:linear-gradient(90deg,' + k.BAD + ',#E2BE5A 40%,' + k.GOOD + ')">'
        + '<i style="position:absolute;top:-5px;left:' + pos + '%;width:18px;height:18px;box-sizing:border-box;border-radius:50%;background:#fff;border:3px solid ' + k.T.ink + ';transform:translateX(-50%)"></i></div>'
        + '<div style="display:flex;justify-content:space-between;gap:8px;font-size:12px;font-weight:500;color:' + k.SUB + ';font-variant-numeric:tabular-nums;margin:0 2px">'
        + '<span>leer</span><span style="font-weight:700;color:' + k.T.ink + '">jetzt ' + esc(fmt(soc, 0)) + ' %</span><span>voll</span></div>';
    }
    return out + '</div>';
  };
  // „Ladeleistung · im Umkreis“: how many chargers of each speed class, as columns in the class colours.
  var power = function (all, k) {
    var counts = CLASSES.map(function (c) { return { c: c, n: all.filter(function (s) { return X.cls(s).k === c.k; }).length }; });
    var max = Math.max.apply(null, counts.map(function (x) { return x.n; }).concat([1]));
    var fast = X.sorted(all, 'fast')[0];
    return '<div class="ch-power" style="background:' + k.ROW + ';border-radius:' + k.RAD + ';padding:18px 20px 16px;">'
      + '<div style="font-size:var(--casora-h15-fs,17px);font-weight:var(--casora-h15-fw,700);letter-spacing:var(--casora-h15-ls,-0.01em);text-transform:var(--casora-h15-tt,none);color:var(--casora-h15-c, var(--casora-popup-tiles-text-primary, var(--primary-text-color)));text-align:left">'
      + '<span>Ladeleistung</span><span> · </span><span>im Umkreis</span></div>'
      + (fast && fast.kw != null ? '<div style="display:flex;align-items:baseline;gap:10px;margin:8px 0 0;color:' + k.T.ink + '">'
        + '<span data-no-i18n style="font-size:34px;font-weight:700;letter-spacing:-.02em;font-variant-numeric:tabular-nums">' + esc(fmt(fast.kw, fast.kw % 1 ? 1 : 0)) + '<span style="font-size:17px;font-weight:600"> kW</span></span>'
        + '<span style="font-size:14px;font-weight:500;color:' + k.SUB + '">' + esc('Schnellste, ' + km(fast.d)) + '</span></div>' : '')
      + '<div class="ch-bars" style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;align-items:end;height:112px;margin:14px 0 0">'
      + counts.map(function (x) {
        return '<div class="ch-bar" data-k="' + x.c.k + '" data-n="' + x.n + '" style="display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%;gap:5px">'
          + '<span data-no-i18n style="font-size:13px;font-weight:700;color:' + k.T.ink + ';font-variant-numeric:tabular-nums">' + x.n + '</span>'
          + '<i style="display:block;width:100%;border-radius:10px 10px 4px 4px;min-height:4px;height:' + Math.round(x.n / max * 72) + 'px;background:' + (x.n ? x.c.color : k.ROW) + '"></i></div>';
      }).join('') + '</div>'
      + '<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:6px 0 0;font-size:12px;font-weight:600;color:' + k.SUB + ';text-align:center;white-space:nowrap">'
      + CLASSES.map(function (c) { return '<span data-no-i18n>' + esc(c.label) + '</span>'; }).join('') + '</div></div>';
  };
  // Operator logo, loaded at run time from Google's favicon service by the operator's web domain (as the fuel view
  // does for brands; nothing is in the repo). Under it sits the bolt in the class colour: it shows until the logo is
  // there and stays when there is none (the service's 16 px globe counts as none).
  // Operators whose own address in Open Charge Map is old or has no usable icon: their domain by name. Else the
  // domain Open Charge Map has (s.w, charging.py).
  var KNOWN = [[/ionity/i, 'ionity.eu'], [/\benbw\b/i, 'enbw.com'], [/tesla/i, 'tesla.com'], [/allego/i, 'allego.eu'],
    [/ewe ?go/i, 'ewe-go.de'], [/shell ?recharge|newmotion/i, 'shellrecharge.com'], [/fastned/i, 'fastned.nl'],
    [/\be\.?on\b/i, 'eon.de'], [/ubitricity/i, 'ubitricity.com'], [/vattenfall|incharge/i, 'vattenfall.de'],
    [/\belli\b/i, 'elli.eco'], [/\bmer\b/i, 'mer.eco']];
  X.domain = function (s) {
    for (var i = 0; i < KNOWN.length; i++) if (KNOWN[i][0].test(s.op || '')) return KNOWN[i][1];
    return s.w || null;
  };
  var FAV = function (d) { return 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(d) + '&sz=128'; };
  var SEEN = {};
  X.lg = function (img, failed) {
    var d = img.getAttribute('data-w'), ok = !failed && img.naturalWidth > 16 && img.naturalHeight > 16;
    SEEN[d] = ok;
    if (ok) { img.style.opacity = '1'; if (img.parentNode) img.parentNode.setAttribute('data-logo', 'bild'); }
    else img.remove();
  };
  X.mark = function (s, size) {
    // Every part placed absolutely: the list row's own rules for spans and pictures must not move the bolt.
    // size null: fill the slot it stands in (the list row's picture slot has its own size).
    var c = X.cls(s), w = X.domain(s), logo = w && SEEN[w] !== false, dim = size ? size + 'px' : '100%';
    return '<span class="ch-logo" data-logo="' + (logo && SEEN[w] ? 'bild' : 'blitz') + '" style="position:relative;display:block;box-sizing:border-box;margin:0;padding:0;'
      + 'width:' + dim + ';height:' + dim + ';flex:none;overflow:hidden;border-radius:var(--casora-soft-icon-radius, 30%);background:' + c.color + '">'
      + '<i style="position:absolute;left:22%;top:22%;width:56%;height:56%;margin:0;padding:0;background:#fff;'
      + '-webkit-mask:url(&quot;' + BOLT + '&quot;) center/contain no-repeat;mask:url(&quot;' + BOLT + '&quot;) center/contain no-repeat"></i>'
      + (logo ? '<img src="' + esc(FAV(w)) + '" data-w="' + esc(w) + '" alt="" decoding="async" referrerpolicy="no-referrer" '
        + 'onload="window._casoraCharge.lg(this)" onerror="window._casoraCharge.lg(this,1)" '
        + 'style="position:absolute;left:0;top:0;width:100%;height:100%;margin:0;padding:0;border-radius:0;object-fit:cover;background:#fff;opacity:' + (SEEN[w] ? 1 : 0) + ';transition:opacity .18s">' : '')
      + '</span>';
  };
  // Three tiles like the fuel view's cheapest three: the pick's word, the distance big, the place, the power.
  var top3 = function (picks, k) {
    return '<div class="ch-top" style="display:grid;grid-template-columns:repeat(' + picks.length + ',minmax(0,1fr));gap:10px">'
      + picks.map(function (t, i) {
        var s = t[1], c = X.cls(s);
        return '<div class="ch-c" data-casora-go="' + esc(X.mapUrl(s)) + '" style="cursor:pointer;min-width:0;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;gap:3px;text-align:center;'
          + 'padding:16px 8px 14px;border-radius:' + k.RAD + ';background:' + (i ? k.ROW : k.TINT(c.color)) + '">'
          + X.mark(s, 40)
          + '<div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:' + k.SUB + ';margin-top:8px">' + esc(t[0]) + '</div>'
          + '<div data-no-i18n style="font-size:20px;font-weight:700;letter-spacing:-.02em;color:' + k.T.ink + ';font-variant-numeric:tabular-nums">' + esc(km(s.d)) + '</div>'
          + '<div data-no-i18n style="font-size:14px;font-weight:600;color:' + k.T.ink + ';max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(short(s.n || s.a)) + '</div>'
          + '<div data-no-i18n style="font-size:13px;font-weight:500;color:' + k.SUB + '">' + esc(kwText(s) + (s.kw != null && (s.dc || s.ac) ? ' ' + (s.dc ? 'DC' : 'AC') : '')) + '</div></div>';
      }).join('') + '</div>';
  };
  // Dot map without a map service: the radius, the search centre and every charger as a dot in its class colour at its
  // real place; the picks carry their power as a pill.
  var dots = function (all, picks, radius, k, h) {
    // The circle reaches as far as the farthest charger (rounded up), never past the search radius.
    var far = all.reduce(function (m, s) { return Math.max(m, s.d || 0); }, 0);
    var reach = Math.min(radius, Math.max(1, Math.ceil(far * 1.15)));
    var R = h / 2 - 16, sc = R / reach;
    var px = function (s) { return [s.x * sc, -s.y * sc]; };
    var at = function (q) { return 'left:calc(50% + ' + q[0].toFixed(1) + 'px);top:calc(50% + ' + q[1].toFixed(1) + 'px);'; };
    var inside = all.filter(function (s) { return s.x != null && s.y != null && Math.hypot(s.x, s.y) <= reach * 1.02; });
    var out = '<div class="ch-map" data-reach="' + reach + '" style="position:relative;height:' + h + 'px;overflow:hidden;border-radius:' + k.RAD + ';background:' + k.ROW + '">'
      + '<i style="position:absolute;left:0;right:0;top:50%;height:2px;margin-top:-1px;background:' + k.ROW + '"></i>'
      + '<i style="position:absolute;top:0;bottom:0;left:50%;width:2px;margin-left:-1px;background:' + k.ROW + '"></i>'
      + '<i style="position:absolute;left:50%;top:50%;width:' + (2 * R) + 'px;height:' + (2 * R) + 'px;margin:-' + R + 'px 0 0 -' + R + 'px;box-sizing:border-box;border-radius:50%;'
      +   'background:color-mix(in srgb, ' + k.ACC + ' 12%, transparent);border:1.5px solid color-mix(in srgb, ' + k.ACC + ' 45%, transparent)"></i>'
      + '<span data-no-i18n style="position:absolute;left:calc(50% + ' + Math.round(R * 0.78) + 'px);top:calc(50% + ' + Math.round(R * 0.72) + 'px);font-size:12px;font-weight:600;color:' + k.SUB + '">' + esc(fmt(reach, 0)) + ' km</span>';
    inside.forEach(function (s) {
      out += '<i class="ch-dot" style="position:absolute;' + at(px(s)) + 'width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;background:' + X.cls(s).color + ';box-shadow:0 0 0 2px ' + (k.dark ? 'rgba(0,0,0,.35)' : 'rgba(255,255,255,.8)') + '"></i>';
    });
    out += '<i style="position:absolute;left:50%;top:50%;width:12px;height:12px;margin:-6px 0 0 -6px;box-sizing:border-box;border-radius:50%;background:' + k.ACC + ';border:2px solid #fff"></i>';
    // The picks carry their power as a pill beside their dot: right, left, above or below, wherever no other pill is.
    var placed = [];
    picks.forEach(function (t, i) {
      var s = t[1], c = X.cls(s);
      if (inside.indexOf(s) === -1) return;
      var text = kwText(s), w = 22 + text.length * 7.6, hh = 26, q = px(s);
      var spots = [[q[0] + 9, q[1] - hh / 2], [q[0] - 9 - w, q[1] - hh / 2], [q[0] - w / 2, q[1] - 9 - hh], [q[0] - w / 2, q[1] + 9]];
      var free = spots.filter(function (b) {
        return !placed.some(function (o) { return b[0] < o[0] + o[2] + 4 && b[0] + w + 4 > o[0] && b[1] < o[1] + hh + 4 && b[1] + hh + 4 > o[1]; });
      })[0];
      if (!free) return;
      placed.push([free[0], free[1], w]);
      out += '<span class="ch-pin" data-no-i18n style="position:absolute;' + at(free) + 'box-sizing:border-box;height:' + hh + 'px;line-height:' + hh + 'px;padding:0 10px;border-radius:999px;'
        + 'font-size:13px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;box-shadow:0 2px 8px -3px rgba(0,0,0,.35);'
        + (i ? 'background:' + (k.dark ? '#2f2a25' : '#fff') + ';color:' + k.T.ink : 'background:' + c.color + ';color:#fff') + '">' + esc(text) + '</span>';
    });
    return out + '</div>';
  };
  var stamp = function (iso) {
    var t = Date.parse(iso || '');
    if (isNaN(t)) return null;
    var o = { hour: '2-digit', minute: '2-digit' };
    try { if (new Intl.DateTimeFormat(loc(), o).resolvedOptions().hour12) o.hour = 'numeric'; } catch (e) { /* old browser */ }
    return new Date(t).toLocaleTimeString(loc(), o);
  };
  var carOf = function (key) {
    var C = window._casoraCar, h = hassOf();
    try { var r = C && C.read && h ? C.read(key || null, h.states) : {}; return { soc: r.ev ? r.tank : null, range: r.range, unit: r.rangeU }; } catch (e) { return {}; }
  };
  X.body = function (key) {
    var UI = window._casoraUI, d = X.data[key];
    if (!UI) return '';
    var k = tok();
    var foot = function (bits) {
      return '<div class="ch-src" style="font-family:' + k.T.font + ';font-size:12px;font-weight:500;color:' + k.SUB + ';display:flex;flex-wrap:wrap;justify-content:center;gap:0 5px;padding:2px 6px 0;">'
        + bits.filter(Boolean).map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('<span>·</span>') + '</div>';
    };
    var SRC = 'Daten: Open Charge Map, CC BY 4.0';
    var card = function (title, why) {
      return '<div class="ch-empty" style="max-width:520px;margin:0 auto;background:' + k.ROW + ';border-radius:' + k.RAD + ';padding:24px;text-align:center">'
        + '<div style="font-size:16px;font-weight:700;color:' + k.T.ink + '">' + esc(title) + '</div>'
        + (why ? '<div style="font-size:13px;font-weight:500;color:' + k.SUB + ';line-height:1.45;margin-top:6px">' + esc(why) + '</div>' : '') + '</div>';
    };
    // The first line is the popup's status line (the frame shows it in the head, popup-richtlinien-v3.md §3). A line
    // alone would be taken for the whole content and hidden with it, so every state has a card under it.
    var wrap = function (inner) { return '<div style="font-family:' + k.T.font + ';text-align:left">' + inner + '</div>'; };
    if (!d || (d.loading && !d.stations)) return wrap(UI.line('Ladesäulen werden geladen', []) + sp(20) + card('Ladesäulen werden geladen', null) + sp(18) + foot([SRC]));
    var all = d.stations || [];
    if (d.error && !all.length) return wrap(UI.line('Abruf gestört', [], { tone: 'warn' }) + sp(20) + card('Ladesäulen gerade nicht abrufbar', ERR[d.error] || null) + sp(18) + foot([SRC]));
    var where = d.origin === 'car' ? 'Rund um das Auto' : 'Rund um Zuhause', rad = fmt(d.radius, 0) + ' km';
    var footer = foot([where, rad, stamp(d.updated) ? 'Stand ' + stamp(d.updated) : null, SRC]);
    if (!all.length) return wrap(UI.line('Keine Ladesäule', [where, rad]) + sp(20) + card('Keine Ladesäule in diesem Umkreis', null) + sp(18) + footer);
    var wide = window.innerWidth > 760;
    var sort = X.filter[key] || 'near';
    var car = carOf(key), picks = X.picks(all);
    var fastOne = all.filter(function (s) { return s.kw != null && s.kw >= 50; })[0];
    var A = X.advice({ soc: car.soc, range: car.range, unit: car.unit, nearest: all[0], fast: fastOne });
    var head = UI.line('ab ' + km(all[0].d), [all.length === 1 ? '1 Ladesäule' : all.length + ' Ladesäulen', where, rad]) + sp(20);
    var colL = UI.label('Empfehlung') + verdict(A, car.soc, k) + sp(10) + power(all, k) + sp(18) + UI.label('Beste Wahl') + top3(picks, k);
    var list = X.sorted(all, sort), more = Math.max(0, list.length - 12);
    var shown = list.slice(0, 12);
    // The row gets a placeholder picture; the logo mark takes its place (as in the fuel view).
    var rows = shown.map(function (s, i) {
      var sub = X.sub(s);
      return { image: 'casora-tank-logo:' + i, imageFit: 'cover', label: s.n || s.a || 'Ladesäule', labelLit: !!(s.n || s.a),
        sub: km(s.d) + (sub ? ' · ' + sub : ''), endHtml: pill(s), url: X.mapUrl(s) };
    });
    var listHtml = rows.length ? UI.group(rows, null, null, { keepNames: true }).replace(/<img src="casora-tank-logo:(\d+)"[^>]*>/g, function (m, i) { return X.mark(shown[+i], null); })
      : UI.group([{ icon: 'mdi:ev-station', iconTone: 'rgba(255,255,255,0.18)', label: 'Keine kostenlose Ladesäule' }], null);
    if (more) listHtml += '<div class="ch-more" data-no-i18n style="font-size:13px;font-weight:600;text-align:center;margin-top:10px;color:' + k.SUB + '">+ ' + more + '</div>';
    var seg = '<div class="ch-seg">' + UI.segments(SORTS.map(function (x) { return { label: x[1], active: x[0] === sort, attrs: { 'data-casora-charge-f': x[0] } }; }), null) + '</div>';
    var colR = UI.label('In der Nähe') + dots(all, picks, d.radius, k, wide ? 220 : 200) + sp(12) + seg + sp(12) + '<div class="ch-list">' + listHtml + '</div>';
    return wrap(head + (wide
      ? '<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);column-gap:var(--casora-popup-col-gap, 26px);align-items:start"><div>' + colL + '</div><div>' + colR + '</div></div>'
      : colL + sp(18) + colR) + sp(18) + footer);
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
    H.page('Ladesäulen', ids.slice(0, 1), 'return window._casoraCharge ? window._casoraCharge.inner(' + JSON.stringify(key) + ') : "";', null,
      // The gear leads to Studio › Settings › Chargers nearby, as the fuel view's leads to its settings.
      { gear: 'charging' });
  };
  X.check();
})();
