// ── Tanken im Auto-Popup (Casora 1.2) ─────────────────────────────────────
// Zeile „Tanken · ab X,XX €“ direkt unter Tankstand/Reichweite (window._casoraCar, 03-popups.js) und
// eigene Ansicht im selben Popup: Empfehlung (Aussage, Begründung, Preis-Skala Tief → jetzt → Hoch),
// „Typischer Tag“ als Säulen, die besten 3 als Kacheln, Karte „In der Nähe“ (HAs eigene Karte mit Umkreis
// und Preis-Pillen; ohne sie die schlichte Punktkarte), Umschalter Günstigste/Nächste/Offen mit Liste,
// Quellenhinweis „Daten: Tankerkönig, CC BY 4.0“.
// Daten: Sensor sensor.casora_tanken_<auto>_<kraftstoff> (tanken.py), Attribut car_device_id = Gerät
// des Autos. Ohne Sensor (nicht eingerichtet, E-Auto, Kraftstoff „aus“) gibt es keine Zeile.
// Markenlogos werden zur Laufzeit geladen (nicht im Repo, nur Adressen); unbekannte Marken: farbige
// Kürzel-Kreise, freie Tankstellen: Zapfsäule. Nur im Weich-Design (Casora, Nebel).
(function () {
  if (window._casoraTank) return;
  var K = window._casoraTank = {};
  var FUEL = { e5: 'Super E5', e10: 'Super E10', diesel: 'Diesel' };
  var loc = function () { return window.casoraLocale ? window.casoraLocale() : 'de-DE'; };
  var fmt = function (n, d) { return Number(n).toLocaleString(loc(), { minimumFractionDigits: d, maximumFractionDigits: d }); };
  var price = function (p) { return fmt(p, 3); };
  var km = function (d) { return fmt(d, 1) + ' km'; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var GAS = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23000' d='M19.77,7.23L19.78,7.22L16.06,3.5L15,4.56L17.11,6.67C16.17,7.03 15.5,7.93 15.5,9A2.5,2.5 0 0,0 18,11.5C18.36,11.5 18.69,11.42 19,11.29V18.5A1,1 0 0,1 18,19.5A1,1 0 0,1 17,18.5V14A2,2 0 0,0 15,12H14V5A2,2 0 0,0 12,3H6A2,2 0 0,0 4,5V21H14V13.5H15.5V18.5A2.5,2.5 0 0,0 18,21A2.5,2.5 0 0,0 20.5,18.5V9C20.5,8.31 20.22,7.68 19.77,7.23M12,10H6V5H12V10M18,10A1,1 0 0,1 17,9A1,1 0 0,1 18,8A1,1 0 0,1 19,9A1,1 0 0,1 18,10Z'/%3E%3C/svg%3E";

  // ── Daten ────────────────────────────────────────────────────────────────
  // Gerät des Autos (p wie in window._casoraCar: Präfix oder Entität), dann der passende Sensor.
  K.device = function (p) {
    var C = window._casoraCar, ha = document.querySelector('home-assistant');
    var R = (ha && ha.hass && ha.hass.entities) || {};
    if (!C) return null;
    var m = C.map(p), ids = Object.keys(m);
    for (var i = 0; i < ids.length; i++) { var x = R[m[ids[i]]]; if (x && x.device_id) return x.device_id; }
    return null;
  };
  K.sensorId = function (p, states) {
    var dev = K.device(p);
    if (!dev || !states) return null;
    var ids = Object.keys(states);
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      if (id.indexOf('sensor.casora_tanken_') !== 0) continue;
      var a = states[id] && states[id].attributes;
      if (a && a.car_device_id === dev) return id;
    }
    return null;
  };
  K.watch = function (p, states) { var id = K.sensorId(p, states); return id ? [id] : []; };
  var info = function (st) {
    var a = (st && st.attributes) || {};
    var n = parseFloat(st && st.state);
    return { price: isNaN(n) ? null : n, fuel: FUEL[a.fuel] || a.fuel || '', stations: Array.isArray(a.stations) ? a.stations : [],
      typical: Array.isArray(a.typical) ? a.typical : null, low: a.low, high: a.high, learn: a.learn_days_left,
      radius: a.radius_km, origin: a.origin, center: Array.isArray(a.center) && a.center.length === 2 && a.center[0] != null ? a.center : null, updated: a.updated, error: a.error, source: a.source, count: a.count };
  };

  // ── Empfehlung (rein rechnerisch, dev/unit/tanken_empfehlung.mjs) ─────────
  // o: price (günstigste offene jetzt), typical (24 Stundenmittel oder null), hour (0–23), tank (%),
  //    range (km), learn (Resttage der Lernphase), fuel (Anzeigename).
  // → { kind: lernen|keine|knapp|warten|jetzt|egal, tone: good|warn|neutral, eyebrow, title, text, short, hour }
  K.advice = function (o) {
    o = o || {};
    var fuel = o.fuel || 'Kraftstoff';
    if (o.learn > 0) {
      return { kind: 'lernen', tone: 'neutral', eyebrow: 'Lernphase', title: 'Empfehlung kommt bald',
        text: 'Die Empfehlung kommt, sobald genug Preise gesammelt sind, in etwa ' + (o.learn === 1 ? 'einem Tag' : o.learn + ' Tagen') + '.',
        short: 'Preise werden gesammelt' };
    }
    if (o.price == null) return { kind: 'keine', tone: 'neutral', eyebrow: 'Gerade', title: 'Keine offene Tankstelle', text: 'Im Umkreis hat gerade keine Tankstelle geöffnet.', short: 'keine offen' };
    if ((o.tank != null && o.tank <= 15) || (o.range != null && o.range < 60)) {
      var why = o.tank != null && o.range != null ? 'Tank bei ' + Math.round(o.tank) + ' %, noch etwa ' + Math.round(o.range) + ' km. '
        : o.tank != null ? 'Tank bei ' + Math.round(o.tank) + ' %. ' : 'Noch etwa ' + Math.round(o.range) + ' km. ';
      return { kind: 'knapp', tone: 'warn', eyebrow: 'Tank knapp', title: 'Jetzt tanken',
        text: why + 'Warten lohnt sich nicht.', short: 'Tank knapp' };
    }
    var T = o.typical, h = o.hour;
    var cur = T && T[h] != null ? T[h] : null;
    var best = null, bh = null;
    // Die nächsten 12 Stunden, nur zu üblichen Tankzeiten (6 bis 22 Uhr).
    for (var i = 1; T && i <= 12; i++) {
      var hh = (h + i) % 24;
      if (hh < 6 || hh > 22 || T[hh] == null) continue;
      if (best == null || T[hh] < best - 0.0005) { best = T[hh]; bh = hh; }
    }
    var ref = cur != null ? cur : o.price;
    var save = best != null ? ref - best : 0;
    if (best != null && save >= 0.02) {
      var ct = Math.round(save * 100);
      var later = bh > h;
      var title = bh >= 17 ? (later ? 'Warte bis heute Abend' : 'Warte bis morgen Abend')
        : bh <= 10 ? (later ? 'Warte bis heute Vormittag' : 'Warte bis morgen früh')
          : (later ? 'Warte bis ' + bh + ' Uhr' : 'Warte bis morgen ' + bh + ' Uhr');
      return { kind: 'warten', tone: 'good', hour: bh, eyebrow: (later ? 'Heute' : 'Morgen') + ' ab ' + bh + ' Uhr', title: title,
        text: (o.range != null ? 'Tank reicht noch ' + Math.round(o.range) + ' km. ' : '')
          + 'Ab ' + bh + ' Uhr lag ' + fuel + ' in den letzten 14 Tagen im Schnitt ' + ct + ' ct niedriger.',
        short: bh >= 17 && later ? 'abends günstiger' : 'ab ' + bh + ' Uhr günstiger' };
    }
    if (o.low != null && o.price <= o.low + 0.01) {
      return { kind: 'jetzt', tone: 'good', eyebrow: 'Guter Zeitpunkt', title: 'Jetzt tanken',
        text: fuel + ' liegt gerade im unteren Bereich der letzten 14 Tage.', short: 'jetzt günstig' };
    }
    return { kind: 'egal', tone: 'neutral', eyebrow: 'Heute', title: 'Kein großer Unterschied',
      text: 'In den nächsten Stunden ändert sich der Preis meist um weniger als 2 ct.', short: 'kaum Unterschied' };
  };

  var carInfo = function (p, states) {
    var C = window._casoraCar;
    var r = C ? C.read(p, states) : {};
    return { tank: r.ev ? null : r.tank, range: r.range };
  };
  var adviceFor = function (p, states, I) {
    var c = carInfo(p, states);
    return K.advice({ price: I.price, typical: I.typical, hour: new Date().getHours(), tank: c.tank, range: c.range,
      learn: I.learn, fuel: I.fuel, low: I.low });
  };

  // ── Zeile im Auto-Popup (unter dem Tankbalken) ───────────────────────────
  K.row = function (p, states) {
    var UI = window._casoraUI, HH = window._casoraHH;
    if (!UI || !(HH && HH.on())) return '';
    var id = K.sensorId(p, states);
    if (!id) return '';
    var I = info(states[id]);
    var sub;
    if (I.error && !I.stations.length) sub = 'Abruf gestört';
    else if (I.price == null && !I.stations.length) sub = 'Preise werden geladen';
    else sub = I.fuel + ' · ' + adviceFor(p, states, I).short;
    return '<div style="height:10px"></div><div class="casora-tank-row" data-casora-tank="' + esc(p || '') + '">'
      + UI.group([{ icon: 'mdi:gas-station', iconTone: 'accent', label: 'Tanken', sub: sub,
        value: I.price != null ? 'ab ' + price(I.price) + ' €' : '—', tappable: true }], null) + '</div>';
  };

  // ── Ansicht ──────────────────────────────────────────────────────────────
  var COLORS = ['#5E8C7A', '#5B7FA6', '#B07D4F', '#9A6B8F', '#7D8A4E', '#A35E5E', '#4F8A9A', '#8A7A4E'];
  // Kürzel aus dem Namen (erstes und letztes Wort: „Autohof Nord“ → AN), sonst aus der Marke.
  K.abbr = function (s) {
    var words = function (t) { return String(t || '').replace(/[^A-Za-zÄÖÜäöüß0-9 -]/g, ' ').split(/[\s-]+/).filter(Boolean); };
    var w = words(s.n);
    if (w.length < 2) w = words(s.b).length ? words(s.b) : w;
    if (!w.length) return '?';
    return (w.length > 1 ? w[0].charAt(0) + w[w.length - 1].charAt(0) : w[0].slice(0, 2)).toUpperCase();
  };
  var color = function (s) {
    var k = String(s.b || s.n || ''), h = 0;
    for (var i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
    return COLORS[h % COLORS.length];
  };
  /* Logos der gängigen Marken (1.2): nur die Adressen stehen hier, das Bild lädt der Browser. Quelle je Marke
     das Seiten-Symbol der Marke über Googles Symbol-Dienst (128 px), sonst Wikimedia (330 px) oder das Logo der
     Marken-Seite; jede Adresse am 08.10.2026 geprüft (Bild ≥ 64 px, kein Platzhalter). Tankerkönig schreibt
     Marken frei („Pludra Musterstadt“, „Schonhoff Mineralöle“), daher Abgleich über ganze Wörter (Kleinschreibung,
     Umlaute) bzw. Wortanfang ohne Leerzeichen. Reihenfolge zählt: erste passende Marke gewinnt. Marken ohne
     brauchbares Logo (z. B. Elan, Markant, Tank & Wasch) behalten das Kürzel; freie Tankstellen die Zapfsäule. */
  var FAV = function (d) { return 'https://www.google.com/s2/favicons?domain=' + d + '&sz=128'; };
  var WM = function (p) { var n = p.split('/').pop(); return 'https://upload.wikimedia.org/wikipedia/commons/thumb/' + p + '/330px-' + n + (/\.png$/.test(n) ? '' : '.png'); };
  var BRANDS = [
    [['aral'], 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/Aral_Logo.svg/250px-Aral_Logo.svg.png'],
    [['shell'], FAV('shell.de')], [['esso'], FAV('esso.de')],
    [['totalenergies', 'total'], WM('f/f0/Logo_TotalEnergies_%282021%29.png')],
    [['jet'], FAV('jet.de')], [['avia'], FAV('avia.de')], [['omv'], FAV('omv.de')], [['hem'], FAV('hem-tankstelle.de')],
    [['star'], FAV('star.de')], [['orlen'], WM('d/d1/Orlen_wordmark_logo.svg')], [['bft'], FAV('bft.de')],
    [['westfalen'], FAV('westfalen.com')], [['hoyer'], FAV('hoyer.de')], [['q1'], WM('2/25/Q1_logo.svg')],
    [['agip', 'eni'], FAV('agip.de')], [['tamoil'], WM('5/5a/Tamoil.svg')],
    // Lanfer: nur das runde Zeichen links aus dem Schriftzug (Ausschnitt), Wiro: Oval mit viel Rand (vergrößert).
    [['lanfer'], 'https://www.lanfer-energie.de/hs-fs/hubfs/Lanfer%20One-Pager/Lanfer_Energie_Logo_2%20C_ohne%20verlauf%20(1).png?width=600', { crop: [0, 0, 120, 119, 600, 137] }],
    [['raiffeisen', 'rwg'], WM('9/93/Raiffeisen-Giebelkreuz.svg')], [['team'], FAV('team.de')],
    [['classic'], 'https://www.classic-oil.de/wp-content/uploads/2021/05/CLASSIC_Logo_web_home.png'],
    [['calpam'], WM('1/12/Calpam_Mineral%C3%B6l-Gesellschaft_logo.svg')], [['sprint', 'go'], FAV('go-sprint.de')],
    [['baywa'], FAV('baywa.de')], [['globus'], FAV('globus.de')], [['kaufland'], WM('d/d0/Kaufland_Logo.svg')],
    [['famila'], FAV('famila.de')], [['marktkauf'], WM('6/6b/Marktkauf.svg')], [['v markt', 'vmarkt'], WM('7/75/V-Markt-Logo.png')],
    [['gulf'], FAV('gulf.de')], [['ed'], FAV('ed-tankstellen.de')], [['score'], FAV('score-tankstellen.de')],
    [['nordoel'], FAV('nordoel.de')], [['pludra'], FAV('pludra-tankstellen.de')],
    [['schonhoff'], 'https://www.schonhoff-mineraloele.de/uploads/YENGIbZN/768x0_480x0/logo-schonhoff.png'],
    [['wiro'], 'https://wittrock.de/wp-content/uploads/2020/05/wirologo.png', { zoom: 1.75 }],
    [['mr wash', 'mrwash'], FAV('mrwash.de')], [['bavaria petrol', 'bavariapetrol'], WM('6/60/Bavaria_Petrol_Logo.svg')],
    [['oil'], FAV('oil-tankstellen.de')],
  ];
  // „Mr. Wash“ → „mr wash“, „Nordöl“ → „nordoel“, „V-Markt“ → „v markt“.
  var norm = function (t) {
    return String(t || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  };
  K.brand = function (s) {
    var b = norm(s && s.b), w = ' ' + b + ' ', c = b.replace(/ /g, '');
    if (!b) return null;
    for (var i = 0; i < BRANDS.length; i++) for (var j = 0; j < BRANDS[i][0].length; j++) {
      var a = BRANDS[i][0][j];
      if (w.indexOf(' ' + a + ' ') >= 0 || (a.length >= 4 && a.indexOf(' ') < 0 && c.indexOf(a) === 0)) return BRANDS[i];
    }
    return null;
  };
  K.logo = function (s) { var m = K.brand(s); return m ? m[1] : null; };
  // Freie Tankstelle („freie Tankstelle“, „Frei“, „Freie TS“) ohne Markenlogo: Zapfsäule statt Kürzel.
  K.free = function (s) { return !K.brand(s) && /^frei(e)?( |$)/.test(norm(s && s.b)); };
  /* Einheitlicher Logo-Kreis (Kacheln und Liste gleich): ruhiger heller Grund, Logo mit Innenabstand eingepasst;
     im Dunkelmodus der ganze Kreis gedämpft (weiße Logo-Flächen verschmelzen mit dem Grund, nichts grell).
     Lädt das Bild nicht oder kommt ein Platzhalter (Googles Globus, ≤ 16 px), wird der Kreis zum Kürzel.
     Das Ergebnis je Adresse bleibt gemerkt – Neuzeichnen (Umschalter, neue Preise) zeigt sofort das Richtige. */
  var SEEN = {};
  K.seen = SEEN;
  // Lage des Bilds im Kreis: quadratische Zeichen mit 16 % Rand, breite Schriftzüge (Seitenverhältnis > 1,6)
  // fast über die volle Breite, Ausschnitt (crop) zeigt nur das Zeichen am linken Rand.
  var fit = function (r, o) {
    o = o || {};
    var wide = !o.crop && r > 1.6, ins = wide ? 8 : 16;
    // Ausschnitt [x, y, b, h, Bildbreite, Bildhöhe]: genau dieses Rechteck mittig in den Kreis (Lanfer-Zeichen).
    if (Array.isArray(o.crop)) {
      var c = o.crop, S = 100 - 2 * ins, k = S / Math.max(c[2], c[3]);
      var ox = ins + (S - c[2] * k) / 2 - c[0] * k, oy = ins + (S - c[3] * k) / 2 - c[1] * k;
      return 'left:' + ox.toFixed(2) + '%;top:' + oy.toFixed(2) + '%;width:' + (c[4] * k).toFixed(2) + '%;height:' + (c[5] * k).toFixed(2) + '%;object-fit:fill;max-width:none;'
        // Nur das Rechteck zeigen, nicht den angrenzenden Schriftzug.
        + 'clip-path:inset(' + (c[1] / c[5] * 100).toFixed(2) + '% ' + ((c[4] - c[0] - c[2]) / c[4] * 100).toFixed(2) + '% ' + ((c[5] - c[1] - c[3]) / c[5] * 100).toFixed(2) + '% ' + (c[0] / c[4] * 100).toFixed(2) + '%);';
    }
    return 'left:' + ins + '%;top:' + ins + '%;width:' + (100 - 2 * ins) + '%;height:' + (100 - 2 * ins) + '%;'
      + 'object-fit:' + (o.crop ? 'cover;object-position:left center;' : 'contain;') + (o.zoom ? 'transform:scale(' + o.zoom + ');' : '');
  };
  K.lg = function (img, failed) {
    var u = img.getAttribute('data-u'), box = img.parentNode;
    var ok = !failed && img.naturalWidth > 16 && img.naturalHeight > 16;
    SEEN[u] = ok ? img.naturalWidth / img.naturalHeight : 0;
    if (ok) {
      var m = K.brand({ b: box && box.getAttribute('data-b') });
      img.style.cssText += ';' + fit(SEEN[u], m && m[2]) + 'opacity:1';
      return;
    }
    if (!box) return;
    img.remove();
    box.style.background = box.getAttribute('data-c');
    box.style.filter = 'none';
    box.style.boxShadow = 'none';
    box.setAttribute('data-logo', 'kuerzel');
    var t = box.querySelector('span');
    if (t) t.style.display = 'grid';
  };
  K.mark = function (s, size, dark) {
    var px = size + 'px', m = K.brand(s), lg = m && m[1], st = lg ? SEEN[lg] : 0;
    var wrap = 'class="ct-logo" style="width:' + px + ';height:' + px + ';border-radius:50%;flex:none;position:relative;overflow:hidden;';
    var abbr = function (show) {
      return '<span style="position:absolute;inset:0;display:' + (show ? 'grid' : 'none') + ';place-items:center;color:#fff;'
        + 'font-size:' + Math.round(size * .34) + 'px;font-weight:800;letter-spacing:.02em">' + esc(K.abbr(s)) + '</span>';
    };
    if (lg && st !== 0) {
      return '<div ' + wrap + 'background:#fff;box-shadow:inset 0 0 0 .5px rgba(0,0,0,.12);'
        + (dark ? 'filter:brightness(.84) saturate(.9);' : '') + '" data-logo="bild" data-b="' + esc(s.b) + '" data-c="' + color(s) + '">'
        + '<img src="' + esc(lg) + '" data-u="' + esc(lg) + '" alt="" decoding="async" referrerpolicy="no-referrer" '
        + 'onload="window._casoraTank.lg(this)" onerror="window._casoraTank.lg(this,1)" '
        + 'style="position:absolute;' + fit(st || 1, m[2]) + 'display:block;opacity:' + (st ? 1 : 0) + ';transition:opacity .18s">' + abbr(false) + '</div>';
    }
    if (K.free(s)) {
      return '<div ' + wrap + 'background:var(--casora-soft-control-fill, rgba(140,115,90,0.10));display:grid;place-items:center" data-logo="frei">'
        + '<span style="width:52%;height:52%;background:var(--casora-soft-sub, currentColor);-webkit-mask:url(&quot;' + GAS + '&quot;) center/contain no-repeat;'
        + 'mask:url(&quot;' + GAS + '&quot;) center/contain no-repeat"></span></div>';
    }
    return '<div ' + wrap + 'background:' + color(s) + '" data-logo="kuerzel">' + abbr(true) + '</div>';
  };
  var sup = function (p) { var s = price(p); return esc(s.slice(0, -1)) + '<sup style="font-size:.62em;margin-left:1px">' + esc(s.slice(-1)) + '</sup>'; };
  var short = function (n) {
    // „Freie Tankstelle Mühlweg“ → „Mühlweg“: Gattungswörter weg, letztes Wort bleibt.
    var w = String(n || '').split(/\s+/).filter(function (x) { return !/^(freie|tankstelle|tankpunkt|tankhof|autohof|stadttankstelle)$/i.test(x); });
    return w.length ? w.slice(-2).join(' ') : String(n || '');
  };

  var tok = function () {
    var UI = window._casoraUI || {}, T = UI.tokens || {};
    var dark = false;
    try { dark = matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { /* egal */ }
    var root = document.querySelector('home-assistant');
    if (root && root.hass && root.hass.themes && typeof root.hass.themes.darkMode === 'boolean') dark = root.hass.themes.darkMode;
    var GOOD = 'var(--casora-popup-ui-good, #6AAE78)';
    var ROW = 'var(--casora-soft-row-fill, rgba(140,115,90,0.07))';
    return { T: T, dark: dark, GOOD: GOOD, WARN: 'var(--casora-popup-ui-warn, #E39A3B)', BAD: 'var(--casora-popup-ui-bad, #D35A4E)',
      ACC: 'var(--casora-popup-ui-accent, var(--casora-color-teal, #4E9E95))', SUB: 'var(--casora-soft-sub, ' + T.ink2 + ')',
      ROW: ROW, CTL: 'var(--casora-soft-control-fill, rgba(140,115,90,0.10))', RAD: 'var(--casora-popup-row-radius, 24px)',
      TINT: function (c) { return 'color-mix(in srgb, ' + c + ' ' + (dark ? 22 : 16) + '%, ' + ROW + ')'; } };
  };

  var verdict = function (A, I, k) {
    var c = A.tone === 'warn' ? k.WARN : A.tone === 'good' ? k.GOOD : k.SUB;
    var out = '<div class="ct-verdict" style="background:' + (A.tone === 'neutral' ? k.ROW : k.TINT(c)) + ';border-radius:' + k.RAD + ';padding:18px 20px 16px;">'
      + '<div style="font-size:12px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:' + c + '">' + esc(A.eyebrow) + '</div>'
      + '<div style="font-size:21px;font-weight:800;letter-spacing:-.015em;color:' + k.T.ink + ';margin:4px 0;line-height:1.2">' + esc(A.title) + '</div>'
      + '<div class="ct-why" style="font-size:13.5px;font-weight:500;line-height:1.4;color:' + k.SUB + '">' + esc(A.text) + '</div>';
    // Preis-Skala Tief → jetzt → Hoch (nur mit Tageskurve)
    if (A.kind !== 'lernen' && I.price != null && I.low != null && I.high != null) {
      var lo = Math.min(I.low, I.price), hi = Math.max(I.high, I.price);
      var pos = hi > lo ? Math.round((I.price - lo) / (hi - lo) * 100) : 50;
      out += '<div class="ct-scale" style="position:relative;height:8px;border-radius:99px;margin:18px 9px 8px;background:linear-gradient(90deg,' + k.GOOD + ',#E2BE5A 55%,' + k.BAD + ')">'
        + '<i style="position:absolute;top:-5px;left:' + pos + '%;width:18px;height:18px;box-sizing:border-box;border-radius:50%;background:#fff;border:3px solid ' + k.T.ink + ';transform:translateX(-50%)"></i></div>'
        + '<div style="display:flex;justify-content:space-between;gap:8px;font-size:12px;font-weight:500;color:' + k.SUB + ';font-variant-numeric:tabular-nums;margin:0 2px">'
        + '<span>' + esc(price(lo)) + ' € Tief</span><span style="font-weight:700;color:' + k.T.ink + '">jetzt ' + esc(price(I.price)) + ' €</span><span>' + esc(price(hi)) + ' € Hoch</span></div>';
    }
    return out + '</div>';
  };
  /* „Typischer Tag“ (1.2): Säulen als casora-chart (Säulen-Art, Skala rechts, gepunktete Linien) in der
     Diagramm-Karte, Etikett wie die übrigen Diagramme. Farben wie bisher: jetzt = Akzent, günstige Stunden grün. */
  var dayPoints = function (I, k) {
    var T = I.typical, vals = [], out = [];
    if (!T) return out;
    for (var h = 6; h <= 23; h++) if (T[h] != null) vals.push(T[h]);
    if (!vals.length) return out;
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), span = Math.max(0.01, hi - lo);
    var now = new Date().getHours(), d0 = new Date(); d0.setMinutes(0, 0, 0);
    for (h = 6; h <= 23; h++) {
      if (T[h] == null) continue;
      out.push({ t: d0.setHours(h), v: T[h], tick: h % 3 === 0 ? h : null,
        color: h === now ? k.ACC : T[h] <= lo + span * 0.3 ? k.GOOD : null });
    }
    return out;
  };
  var day = function (I, A, k) {
    if (!I.typical || A.kind === 'lernen' || !dayPoints(I, k).length) return '';
    return '<div class="ct-day" style="background:' + k.ROW + ';border-radius:' + k.RAD + ';padding:16px 10px 6px;">'
      + '<div style="font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--casora-soft-label, ' + k.SUB + ');padding:0 6px;text-align:left">'
      + '<span>Typischer Tag</span><span> · </span><span>Ø 14 Tage</span></div>'
      + '<div class="ct-day-chart" data-casora-nodismiss="" style="min-height:154px;margin:8px 0 0"></div></div>';
  };
  /* Säulen nach jedem Zeichnen der Ansicht einhängen (Inhalt kommt als HTML-Text). */
  var mountDay = function (I) {
    var slot = V && V.inner.querySelector('.ct-day-chart');
    if (!slot) return;
    var cfg = { type: 'custom:casora-chart', kind: 'bar', points: dayPoints(I, tok()), unit: '€', decimals: 3, height: 120 };
    customElements.whenDefined('casora-chart').then(function () {
      if (!slot.isConnected) return;
      var el = document.createElement('casora-chart');
      slot.appendChild(el);
      el.setConfig(cfg);
      var ha = document.querySelector('home-assistant');
      if (ha && ha.hass) el.hass = ha.hass;
    });
  };
  var top3 = function (I, k) {
    var s = I.stations.filter(function (x) { return x.o; }).slice(0, 3);
    if (!s.length) return '';
    return '<div class="ct-top" style="display:grid;grid-template-columns:repeat(' + s.length + ',minmax(0,1fr));gap:10px">' + s.map(function (x, i) {
      return '<div style="min-width:0;background:' + (i ? k.ROW : k.TINT(k.GOOD)) + ';border-radius:' + k.RAD + ';padding:14px 8px 12px;text-align:center">'
        + '<div style="display:flex;justify-content:center;margin-bottom:8px">' + K.mark(x, 38, k.dark) + '</div>'
        + '<div style="font-size:17px;font-weight:800;color:' + k.T.ink + ';font-variant-numeric:tabular-nums">' + sup(x.p) + '</div>'
        + '<div style="font-size:12.5px;font-weight:600;color:' + k.T.ink + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px">' + esc(short(x.n)) + '</div>'
        + '<div style="font-size:12px;font-weight:500;color:' + k.SUB + '">' + (x.d != null ? esc(km(x.d)) : '&nbsp;') + '</div></div>';
    }).join('') + '</div>';
  };
  // Fläche der Karte (Punktkarte und HA-Karte gleich, 1.2.1): unten Platz für den OSM-Hinweis (ATT), Mitte um
  // dessen halbe Höhe nach oben, Umkreis = halbe kleinere Restseite abzüglich Rand.
  var ATT = 20;
  var frame = function (W, H) { return { cx: W / 2, cy: (H - ATT) / 2, r: Math.max(20, Math.min(W, H - ATT) / 2 - 8) }; };
  /* Umkreis, Stationen und Preise (SVG, 1.2.1 Entwurf A). at(p) → [x, y] in Pixeln; onMap: über der HA-Karte
     (Pillen mit leichtem Schatten); avoid: Rechteck des OSM-Hinweises { x, y, w, h } oder null.
     Jede Station ist ein Punkt am echten Ort (günstigster Preis grün, geschlossen gestrichelt, mehrere am selben
     Ort mit Doppelring). Nur die 4 günstigsten Orte bekommen eine Preis-Pille neben dem Punkt mit kurzem Strich;
     Pillen weichen einander, dem Standort, der km-Angabe und dem OSM-Hinweis aus und bleiben ganz in der Fläche.
     Passt eine nirgends hin, bleibt nur der Punkt. */
  var pins = function (I, k, W, H, at, c, rad, onMap, avoid) {
    var cx = c[0], cy = c[1], f1 = function (n) { return (+n).toFixed(1); };
    var SUBC = k.dark ? 'rgba(238,232,225,.62)' : 'rgba(58,50,43,.55)', MUTE = k.dark ? '#D8D0C7' : '#6B5F55';
    var RING = k.dark ? '#2A2420' : '#fff', FONT = 'font-family="Inter,-apple-system,system-ui,sans-serif"';
    var s = '<circle class="ct-reach" cx="' + f1(cx) + '" cy="' + f1(cy) + '" r="' + f1(rad) + '" fill="' + k.ACC + '" opacity="' + (onMap ? '.10' : '.08') + '"/>'
      + '<circle cx="' + f1(cx) + '" cy="' + f1(cy) + '" r="' + f1(rad) + '" fill="none" stroke="' + k.ACC + '" stroke-opacity="' + (onMap ? '.5' : '.3') + '" stroke-width="1.5"/>';
    // km-Angabe rechts oben am Kreis (nur wenn sie in die Fläche passt).
    var lab = null;
    if (I.radius) {
      lab = { x: cx + rad * 0.707 + 4, y: cy - rad * 0.707 - 4, w: 36, h: 13 };
      if (lab.x + lab.w > W - 4 || lab.y - lab.h < 2) lab = null;
      else s += '<text class="ct-km" x="' + f1(lab.x) + '" y="' + f1(lab.y) + '" font-size="10.5" font-weight="600" ' + FONT + ' fill="' + SUBC + '">' + esc(fmt(I.radius, 0) + ' km') + '</text>';
    }
    // Stationen nach Ort bündeln (gleicher Ort = ein Punkt); je Ort zählt die offene günstigste.
    var groups = [];
    I.stations.forEach(function (p) {
      var xy = at(p);
      if (!xy) return;
      var g = groups.filter(function (q) { return Math.abs(q.xy[0] - xy[0]) < 2 && Math.abs(q.xy[1] - xy[1]) < 2; })[0];
      if (g) g.items.push(p); else groups.push({ xy: xy, items: [p] });
    });
    groups.forEach(function (g) { g.best = g.items.slice().sort(function (a, b) { return (a.o === b.o ? 0 : a.o ? -1 : 1) || a.p - b.p; })[0]; });
    var open = I.stations.filter(function (x) { return x.o; });
    var minP = open.length ? Math.min.apply(null, open.map(function (x) { return x.p; })) : null;
    var isMin = function (p) { return p.o && minP != null && Math.abs(p.p - minP) < 0.0005; };
    var pillG = groups.filter(function (g) { return g.best.o; })
      .sort(function (a, b) { return a.best.p - b.best.p || (a.best.d == null ? 99 : a.best.d) - (b.best.d == null ? 99 : b.best.d); }).slice(0, 4);
    // Pillen platzieren: 8 Richtungen in zwei Abständen, harte Regeln (Fläche, Hinweis, Standort, andere Pillen),
    // sonst möglichst wenig andere Punkte verdecken und nah am eigenen Punkt.
    var pw = 54, ph = 24, gap = 7, placed = [];
    var over = function (x, y, r) { return x + pw / 2 > r.x && x - pw / 2 < r.x + r.w && y + ph / 2 > r.y && y - ph / 2 < r.y + r.h; };
    var ok = function (x, y) {
      if (x - pw / 2 < 6 || x + pw / 2 > W - 6 || y - ph / 2 < 6 || y + ph / 2 > H - 6) return false;
      if (avoid && over(x, y, { x: avoid.x - 3, y: avoid.y - 3, w: avoid.w + 6, h: avoid.h + 6 })) return false;
      if (over(x, y, { x: cx - 10, y: cy - 10, w: 20, h: 20 })) return false;
      return placed.every(function (q) { return Math.abs(q.x - x) >= pw + 4 || Math.abs(q.y - y) >= ph + 3; });
    };
    var DIRS = [[0, -1], [0, 1], [1, 0], [-1, 0], [1, -1], [-1, -1], [1, 1], [-1, 1]];
    pillG.forEach(function (g) {
      var best = null;
      [1, 1.6].forEach(function (dist) {
        DIRS.forEach(function (d) {
          var y = g.xy[1] + d[1] * (ph / 2 + gap) * dist;
          var x = d[0] && !d[1] ? g.xy[0] + d[0] * (pw / 2 + gap) * dist : g.xy[0] + d[0] * (pw / 2) * 0.9 * dist;
          if (!ok(x, y)) return;
          var hits = groups.filter(function (q) { return q !== g && Math.abs(q.xy[0] - x) < pw / 2 + 5 && Math.abs(q.xy[1] - y) < ph / 2 + 5; }).length;
          var sc = hits * 3 + (lab && over(x, y, { x: lab.x, y: lab.y - lab.h, w: lab.w, h: lab.h }) ? 3 : 0) + dist + (d[0] && d[1] ? 0.4 : 0) + (d[1] > 0 ? 0.2 : 0);
          if (!best || sc < best.sc) best = { x: x, y: y, sc: sc };
        });
      });
      if (best) placed.push({ g: g, x: best.x, y: best.y });
    });
    // Striche, dann Punkte, dann Pillen (günstigste zuletzt, liegt oben).
    placed.forEach(function (q) {
      var ex = Math.max(q.x - pw / 2, Math.min(q.x + pw / 2, q.g.xy[0])), ey = Math.max(q.y - ph / 2, Math.min(q.y + ph / 2, q.g.xy[1]));
      s += '<line x1="' + f1(q.g.xy[0]) + '" y1="' + f1(q.g.xy[1]) + '" x2="' + f1(ex) + '" y2="' + f1(ey) + '" stroke="' + (isMin(q.g.best) ? k.GOOD : MUTE) + '" stroke-width="1.4" stroke-opacity=".8"/>';
    });
    groups.forEach(function (g) {
      var on = placed.some(function (q) { return q.g === g; }), b = g.best, col = !b.o ? 'none' : isMin(b) ? k.GOOD : MUTE;
      s += '<circle class="ct-dot" cx="' + f1(g.xy[0]) + '" cy="' + f1(g.xy[1]) + '" r="' + (on ? 5 : 4) + '" fill="' + col + '" stroke="' + (b.o ? RING : SUBC) + '" stroke-width="' + (b.o ? 1.6 : 1.4) + '"'
        + (b.o ? '' : ' stroke-dasharray="2 1.6"') + ' opacity="' + (on || isMin(b) || !b.o ? 1 : 0.75) + '"/>';
      if (g.items.length > 1) s += '<circle cx="' + f1(g.xy[0]) + '" cy="' + f1(g.xy[1]) + '" r="' + (on ? 8 : 7) + '" fill="none" stroke="' + (col === 'none' ? SUBC : col) + '" stroke-width="1.3" opacity=".7"/>';
    });
    var shadow = onMap ? ' style="filter:drop-shadow(0 1px 2px rgba(0,0,0,' + (k.dark ? '.5' : '.22') + '))"' : '';
    placed.slice().reverse().forEach(function (q) {
      var b = q.g.best, m = isMin(b), t = price(b.p);
      s += '<g class="ct-pin"' + shadow + '><rect x="' + f1(q.x - pw / 2) + '" y="' + f1(q.y - ph / 2) + '" width="' + pw + '" height="' + ph + '" rx="' + ph / 2 + '" fill="'
        + (m ? k.GOOD : (k.dark ? '#4A423B' : '#FFFDF9')) + '"/>'
        + '<text x="' + f1(q.x) + '" y="' + f1(q.y + 1) + '" text-anchor="middle" dominant-baseline="middle" font-size="13" font-weight="700" ' + FONT + ' fill="' + (m ? '#fff' : (k.dark ? '#EEE8E1' : '#3A322B')) + '">'
        + esc(t.slice(0, -1)) + '<tspan font-size="8.8" dy="-4.2">' + esc(t.slice(-1)) + '</tspan></text></g>';
    });
    return s + '<circle cx="' + f1(cx) + '" cy="' + f1(cy) + '" r="6" fill="' + k.ACC + '" stroke="#fff" stroke-width="3"/>';
  };
  var reachOf = function (I, pts) {
    return I.radius || Math.max.apply(null, pts.map(function (x) { return Math.max(Math.abs(x.x), Math.abs(x.y)); }).concat([1]));
  };
  // Punktkarte ohne Kartendienst (Rückfall, liegt immer unter der HA-Karte): Umkreis, eigener Standort, Preise als Pillen.
  var map = function (I, k, h, w) {
    var pts = I.stations.filter(function (x) { return x.x != null && x.y != null; });
    if (!pts.length) return '';
    // Bildfläche im Seitenverhältnis der Spalte (sonst schneidet „slice“ oben/unten Pillen ab).
    var H = h, W = Math.max(H, Math.round(w || 300)), F = frame(W, H), cx = F.cx, cy = F.cy;
    var reach = reachOf(I, pts);
    var sc = F.r / reach;
    var ground = k.dark ? 'rgba(255,255,255,0.045)' : 'rgba(140,115,90,0.10)';
    var line = k.dark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.75)';
    return '<div class="ct-mapbox" style="position:relative;height:' + h + 'px;border-radius:' + k.RAD + ';overflow:hidden">'
      + '<svg class="ct-map" viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + h + '" preserveAspectRatio="xMidYMid slice" style="display:block;border-radius:' + k.RAD + ';overflow:hidden">'
      + '<rect width="' + W + '" height="' + H + '" fill="' + ground + '"/>'
      + '<line x1="0" y1="' + cy + '" x2="' + W + '" y2="' + cy + '" stroke="' + line + '" stroke-width="3"/>'
      + '<line x1="' + cx + '" y1="0" x2="' + cx + '" y2="' + H + '" stroke="' + line + '" stroke-width="3"/>'
      + pins(I, k, W, H, function (p) { return p.x != null && p.y != null ? [cx + p.x * sc, cy - p.y * sc] : null; }, [cx, cy], reach * sc, false, null)
      + '</svg></div>';
  };

  // ── HA-Karte unter Umkreis und Pillen ────────────────────────────────────
  // HAs eigenes Karten-Element (ha-map, ab HA 2026.9 mit dem eigenen Kartendienst „map_tiles“ samt Token;
  // HA kümmert sich um Dienst und Token). Liegt als eigene Ebene über der Punktkarte und bleibt beim
  // Neuzeichnen der Ansicht erhalten; sichtbar erst, wenn Kacheln geladen sind – sonst bleibt die Punktkarte.
  var mapOk = function () {
    var ha = document.querySelector('home-assistant');
    var comps = ha && ha.hass && ha.hass.config && ha.hass.config.components;
    // Ohne „map_tiles“ (älteres HA) holt ha-map Kacheln von einem Dienst, der inzwischen einen Schlüssel will.
    return !!(comps && comps.indexOf('map_tiles') >= 0);
  };
  var haMapDefined = function () {
    if (customElements.get('ha-map')) return Promise.resolve(true);
    if (!window.loadCardHelpers) return Promise.resolve(false);
    var ha = document.querySelector('home-assistant');
    // Die Kartenkarte lädt ha-map mit; angezeigt wird sie nicht.
    var load = window.loadCardHelpers().then(function (h) { var c = h.createCardElement({ type: 'map', entities: ['zone.home'] }); if (c && ha) c.hass = ha.hass; return customElements.whenDefined('ha-map'); })
      .then(function () { return true; }, function () { return false; });
    return Promise.race([load, new Promise(function (r) { setTimeout(function () { r(!!customElements.get('ha-map')); }, 6000); })]);
  };
  var geo = function (I, p) {
    if (p.lat != null && p.lng != null) return [p.lat, p.lng];
    if (p.x == null || p.y == null || !I.center) return null;
    return [I.center[0] + p.y / 110.57, I.center[1] + p.x / (111.32 * Math.cos(I.center[0] * Math.PI / 180))];
  };
  // Zoom (Leaflet-Zählung), bei dem der Umkreis wie bei der Punktkarte den Radius aus frame() hat.
  var zoomFor = function (lat, reachKm, W, H) {
    var mpp = reachKm * 1000 / frame(W, H).r;
    return Math.max(3, Math.min(17, Math.log(156543.03 * Math.cos(lat * Math.PI / 180) / mpp) / Math.LN2));
  };
  var hmStyle = '#map{background:transparent;border-radius:inherit;overflow:hidden}.leaflet-map-pane{filter:var(--ct-filter,none)}'
    + ':host{border-radius:inherit;overflow:hidden}.leaflet-control-zoom,.leaflet-control-scale{display:none!important}'
    + '.leaflet-control-attribution{font-size:9px!important;line-height:1.3!important;padding:1px 6px!important;border-radius:8px 0 0 0;'
    + 'background:var(--ct-att-bg)!important;color:var(--ct-att-fg)!important;pointer-events:auto}'
    + '.leaflet-control-attribution a{color:inherit!important}';
  // HA 2026.10: ha-map zeichnet direkt mit MapLibre (kein Leaflet mehr, m._engine._map). Gleiche Schnittstelle
  // wie Leaflet für syncMap; MapLibre zählt Zoom in 512er-Kacheln (eine Stufe weniger als Leaflet).
  var mlOf = function (m) { return m && !m.leafletMap && m._engine && m._engine._map && m._engine._map.project ? m._engine._map : null; };
  var lmOf = function (m) {
    if (!m) return null;
    if (m.leafletMap) return m.leafletMap;
    var ml = mlOf(m);
    if (!ml) return null;
    return {
      invalidateSize: function () { ml.resize(); },
      setView: function (c, z) { ml.jumpTo({ center: [c[1], c[0]], zoom: z - 1 }); },
      latLngToContainerPoint: function (ll) { var q = ml.project([ll[1], ll[0]]); return { x: q.x, y: q.y }; },
      containerPointToLatLng: function (pt) { var q = ml.unproject(pt); return { lat: q.lat, lng: q.lng }; },
    };
  };
  var hmStyleMl = '.maplibregl-canvas{filter:var(--ct-filter,none)}.maplibregl-ctrl-top-left,.maplibregl-ctrl-top-right,.maplibregl-ctrl-scale{display:none!important}'
    + '.maplibregl-ctrl-attrib{font-size:9px!important;line-height:1.3!important;padding:1px 6px!important;border-radius:8px 0 0 0;background:var(--ct-att-bg)!important;color:var(--ct-att-fg)!important}'
    + '.maplibregl-ctrl-attrib a{color:inherit!important}.maplibregl-ctrl-attrib-button{display:none!important}';
  var hmCreate = function (v) {
    var layer = document.createElement('div');
    layer.className = 'ct-hamap';
    layer.dataset.state = 'laden';
    layer.style.cssText = 'position:absolute;z-index:2;overflow:hidden;isolation:isolate;opacity:0;transition:opacity .35s ease;pointer-events:none;';
    var hm = { layer: layer, el: null, key: null, view: null, tiles: 0, errors: 0 };
    v.hm = hm;
    v.box.appendChild(layer);
    haMapDefined().then(function (ok) {
      if (V !== v || !layer.isConnected) return;
      if (!ok) { layer.dataset.state = 'fehler'; return; }
      var ha = document.querySelector('home-assistant'), hass = ha && ha.hass;
      var m = document.createElement('ha-map');
      // Verbindung wie aus HAs Kontext (der Popup liegt evtl. außerhalb); ohne sie gäbe es kein Token.
      if (hass) m._connection = { connection: hass.connection, hassUrl: function (u) { return hass.hassUrl(u); } };
      m.themeMode = v.hmDark ? 'dark' : 'light';
      m.zoom = 13;
      m.style.cssText = 'display:block;width:100%;height:100%;border-radius:inherit;overflow:hidden;';
      layer.insertBefore(m, layer.firstChild);
      hm.el = m;
      var t0 = Date.now();
      var wait = setInterval(function () {
        if (V !== v || !m.isConnected) { clearInterval(wait); return; }
        var lm = m.leafletMap, mlx = mlOf(m);
        if (mlx && !hm.hooked) {
          hm.hooked = true;
          ['dragPan', 'scrollZoom', 'boxZoom', 'doubleClickZoom', 'touchZoomRotate', 'keyboard', 'dragRotate', 'touchPitch'].forEach(function (x) { if (mlx[x] && mlx[x].disable) mlx[x].disable(); });
          var st2 = document.createElement('style'); st2.textContent = hmStyleMl; if (m.shadowRoot) m.shadowRoot.appendChild(st2);
          hm.ml = mlx;
          // Nur wirklich geladene Kacheln zählen (bei gestörtem Dienst bleibt es bei 0 → Punktkarte).
          mlx.on('data', function (e) { if (e && e.tile && (!e.tile.state || e.tile.state === 'loaded')) hm.tiles++; });
          mlx.on('error', function () { hm.errors++; });
          if (mlx.queryRenderedFeatures && mlx.loaded() && mlx.queryRenderedFeatures().length) hm.tiles++;
          hm.view = null;
          syncMap();
        }
        if (lm && !hm.hooked) {
          hm.hooked = true;
          ['dragging', 'touchZoom', 'doubleClickZoom', 'scrollWheelZoom', 'boxZoom', 'keyboard', 'tap'].forEach(function (x) { if (lm[x] && lm[x].disable) lm[x].disable(); });
          if (lm.zoomControl) lm.zoomControl.remove();
          lm.options.zoomSnap = 0;
          var st = document.createElement('style'); st.textContent = hmStyle; m.shadowRoot.appendChild(st);
          // Kacheln zählen: Vektorkarte (MapLibre) bzw. Rasterkacheln.
          lm.eachLayer(function (l) {
            var ml = l.getMaplibreMap && l.getMaplibreMap();
            if (ml) {
              hm.ml = ml;
              ml.on('data', function (e) { if (e && e.tile) hm.tiles++; });
              ml.on('error', function () { hm.errors++; });
            } else if (l.on && l.getTileUrl) {
              l.on('tileload', function () { hm.tiles++; });
              l.on('tileerror', function () { hm.errors++; });
            }
          });
          hm.view = null;
          syncMap();
        }
        // Sichtbar, sobald Kacheln da sind und die Karte fertig gezeichnet hat.
        var done = (lm || mlx) && hm.tiles > 0 && (!hm.ml || hm.ml.loaded());
        if (done) { clearInterval(wait); layer.dataset.state = 'ok'; layer.style.opacity = '1'; hm.key = null; syncMap(); return; }
        if (Date.now() - t0 > 12000) {
          clearInterval(wait);
          layer.dataset.state = 'fehler';
          m.remove(); hm.el = null;
        }
      }, 150);
    });
  };
  // Ebene auf den Platz der Punktkarte legen, Ausschnitt und Pillen setzen.
  var syncMap = function () {
    if (!V) return;
    var hm = V.hm, ph = V.box.querySelector('.ct-mapbox');
    var id = K.sensorId(V.p, hassStates()), I = id ? info(hassStates()[id]) : null;
    if (!ph || !I || !I.center || !mapOk()) { if (hm) hm.layer.style.display = 'none'; return; }
    var k = tok();
    if (!hm) { V.hmDark = k.dark; hmCreate(V); hm = V.hm; }
    if (hm.layer.dataset.state === 'fehler') { hm.layer.style.display = 'none'; return; }
    // Lage über offset* (unabhängig von Popup-Animationen mit transform); box ist der Bezug (position:relative).
    var x0 = 0, y0 = 0, e = ph;
    while (e && e !== V.box) { x0 += e.offsetLeft; y0 += e.offsetTop; e = e.offsetParent; }
    if (!e) { var br = V.box.getBoundingClientRect(), rr = ph.getBoundingClientRect(); x0 = rr.left - br.left; y0 = rr.top - br.top; }
    var W = ph.offsetWidth, H = ph.offsetHeight;
    var L = hm.layer.style;
    L.display = '';
    L.left = x0 + 'px'; L.top = y0 + 'px';
    L.width = W + 'px'; L.height = H + 'px';
    L.borderRadius = k.RAD;
    // WebGL-Fläche hält sich nicht immer an border-radius (dunkle Ecken) – zusätzlich zuschneiden.
    L.clipPath = 'inset(0 round ' + k.RAD + ')';
    // Ruhiger Grund: Farben zurückgenommen.
    var m = hm.el, lm = lmOf(m);
    // Filter nur auf der Kartenfläche (auf dem ganzen Element bricht er am Handy die runden Ecken).
    if (m) m.style.setProperty('--ct-filter', k.dark ? 'saturate(.5) brightness(.9)' : 'saturate(.45) contrast(.9) brightness(1.02)');
    // OSM-Hinweis: im Dunkelmodus dunkel hinterlegt (1.2.1).
    if (m) { m.style.setProperty('--ct-att-bg', k.dark ? 'rgba(28,24,21,.72)' : 'rgba(255,255,255,.6)'); m.style.setProperty('--ct-att-fg', k.dark ? '#bdb3a9' : '#555'); }
    // Schleier in Popup-Farbe über der Karte, unter den Pillen.
    var wash = hm.layer.querySelector('.ct-hamap-wash');
    if (!wash) { wash = document.createElement('div'); wash.className = 'ct-hamap-wash'; wash.style.cssText = 'position:absolute;inset:0;pointer-events:none;'; hm.layer.insertBefore(wash, hm.layer.querySelector('svg.ct-hamap-pins')); }
    wash.style.background = k.dark ? 'rgba(28,24,21,.28)' : 'rgba(250,246,240,.32)';
    if (m && m.themeMode !== (k.dark ? 'dark' : 'light')) m.themeMode = k.dark ? 'dark' : 'light';
    if (!lm || !hm.hooked || !W || !H) return;
    var pts = I.stations.filter(function (x) { return geo(I, x); });
    var reach = reachOf(I, I.stations.filter(function (x) { return x.x != null && x.y != null; }));
    var view = [I.center[0], I.center[1], reach, W, H].join('|');
    if (view !== hm.view) {
      hm.view = view;
      lm.invalidateSize({ animate: false });
      var z = zoomFor(I.center[0], reach, W, H);
      lm.setView(I.center, z, { animate: false });
      // Mitte um die halbe Höhe des OSM-Hinweises nach oben (wie frame()).
      var sh = lm.containerPointToLatLng([W / 2, H / 2 + ATT / 2]);
      if (sh) lm.setView([sh.lat, sh.lng], z, { animate: false });
    }
    // OSM-Hinweis messen (Pillen weichen ihm aus); noch nicht gezeichnet → rechts unten angenommen.
    var at = m && m.shadowRoot && m.shadowRoot.querySelector('.maplibregl-ctrl-attrib, .leaflet-control-attribution');
    var lr = hm.layer.getBoundingClientRect(), ar = at ? at.getBoundingClientRect() : null;
    var avoid = ar && ar.width > 0 ? { x: Math.round(ar.left - lr.left), y: Math.round(ar.top - lr.top), w: Math.round(ar.width), h: Math.round(ar.height) }
      : { x: W - Math.min(W, 200), y: H - 16, w: Math.min(W, 200), h: 16 };
    var key = view + '|' + k.dark + '|' + JSON.stringify(avoid) + '|' + JSON.stringify(pts.map(function (x) { return [x.p, x.o, geo(I, x)]; }));
    if (key === hm.key) return;
    hm.key = key;
    var pt = function (ll) { var q = lm.latLngToContainerPoint(ll); return [q.x, q.y]; };
    var c = pt(I.center), north = pt([I.center[0] + reach / 110.57, I.center[1]]);
    var svg = hm.layer.querySelector('svg.ct-hamap-pins');
    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'ct-hamap-pins');
      svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:hidden;';
      hm.layer.appendChild(svg);
    }
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.innerHTML = pins(I, k, W, H, function (p) { var g = geo(I, p); return g ? pt(g) : null; }, c, Math.abs(c[1] - north[1]), true, avoid);
  };
  var LEAD = 'casora-tank-logo:';
  var SORTS = [['guenstig', 'Günstigste'], ['naechste', 'Nächste'], ['offen', 'Offen']];
  var list = function (I, sort) {
    var UI = window._casoraUI;
    var s = I.stations.slice();
    if (sort === 'naechste') s.sort(function (a, b) { return (a.d == null ? 999 : a.d) - (b.d == null ? 999 : b.d); });
    else if (sort === 'offen') s = s.filter(function (x) { return x.o; });
    var more = Math.max(0, s.length - 12);
    var rows = s.slice(0, 12), dark = tok().dark;
    // Die Zeile bekommt einen Platzhalter als Bild; danach tritt der einheitliche Logo-Kreis an seine Stelle.
    var out = UI.group(rows.map(function (x, i) {
      return { image: LEAD + i, imageFit: 'cover', label: x.n || x.b || '?',
        sub: [x.d != null ? km(x.d) : null, x.o ? 'offen' : 'zu'].filter(Boolean).join(' · '), subTone: x.o ? null : 'warn',
        value: price(x.p) + ' €' };
    }), null).replace(/<img src="casora-tank-logo:(\d+)"[^>]*>/g, function (m, i) { return K.mark(rows[+i], 38, dark); });
    if (more) out += '<div style="font-size:12.5px;font-weight:500;text-align:center;margin-top:10px;color:var(--casora-soft-sub, inherit)">und ' + more + ' weitere</div>';
    if (!s.length) out = UI.group([{ icon: 'mdi:gas-station-off-outline', iconTone: 'rgba(255,255,255,0.18)', label: 'Gerade keine offen' }], null);
    return out;
  };
  var stamp = function (iso) {
    var t = Date.parse(iso || '');
    return isNaN(t) ? null : new Date(t).toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' });
  };

  K.html = function (p, states, sort, wide, bw) {
    var UI = window._casoraUI;
    var id = K.sensorId(p, states);
    if (!UI || !id) return '';
    var I = info(states[id]), k = tok(), A = adviceFor(p, states, I);
    var sp = function (px) { return '<div style="height:' + px + 'px"></div>'; };
    var n = I.stations.length;
    var head = UI.line(I.price != null ? 'ab ' + price(I.price) + ' €' : 'Noch keine Preise',
      wide && n ? [I.fuel, n === 1 ? '1 Tankstelle' + (I.radius ? ' in ' + fmt(I.radius, 0) + ' km' : '') : n + ' Tankstellen' + (I.radius ? ' in ' + fmt(I.radius, 0) + ' km' : '')] : [I.fuel]) + sp(20);
    var foot = '<div class="ct-src" style="font-family:' + k.T.font + ';font-size:12px;font-weight:500;color:' + k.SUB + ';text-align:center;padding:2px 6px 0;">'
      // Je Teil ein eigener Text (die Übersetzung arbeitet je Textstück).
      + [I.fuel, I.radius ? 'Umkreis ' + fmt(I.radius, 0) + ' km um ' + (I.origin === 'car' ? 'das Auto' : 'Zuhause') : null,
        stamp(I.updated) ? 'Stand ' + stamp(I.updated) : null, 'Daten: Tankerkönig, CC BY 4.0'].filter(Boolean)
        .map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('<span> · </span>') + '</div>';
    if (!n) {
      var why = I.error ? 'Tankerkönig antwortet gerade nicht: ' + I.error : 'Casora fragt alle 10 Minuten, die ersten Preise kommen gleich.';
      return '<div style="font-family:' + k.T.font + '">' + head
        + '<div class="ct-empty" style="max-width:520px;margin:0 auto;background:' + k.ROW + ';border-radius:' + k.RAD + ';padding:24px;text-align:center">'
        + '<div style="font-size:16px;font-weight:700;color:' + k.T.ink + '">' + (I.error ? 'Tankpreise gerade nicht abrufbar' : 'Preise werden geladen') + '</div>'
        + '<div style="font-size:13px;font-weight:500;color:' + k.SUB + ';line-height:1.45;margin-top:6px">' + esc(why) + '</div></div>' + sp(18) + foot + '</div>';
    }
    var L = UI.label('Empfehlung') + verdict(A, I, k) + (day(I, A, k) ? sp(10) + day(I, A, k) : '') + sp(18) + UI.label('Am günstigsten') + top3(I, k);
    var m = map(I, k, wide ? 220 : 200, bw ? (wide ? (bw - 26) / 2 : bw) : 0);
    var seg = '<div class="ct-seg">' + UI.segments(SORTS.map(function (s) { return { label: s[1], active: s[0] === sort }; }), null) + '</div>';
    var R = UI.label('In der Nähe') + (m ? m + sp(12) : '') + seg + sp(12) + '<div class="ct-list">' + list(I, sort) + '</div>';
    return '<div style="font-family:' + k.T.font + '">' + head + (wide
      ? '<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);column-gap:var(--casora-popup-col-gap, 26px);align-items:start"><div>' + L + '</div><div>' + R + '</div></div>'
      : L + sp(18) + R) + sp(18) + foot + '</div>';
  };

  // ── Ansicht im offenen Popup ein- und ausblenden ─────────────────────────
  var V = null;  // { pop, p, sort, saved… }
  var popEl = function () { var P = window.casoraPopup; return P && P.element && P.element.hasAttribute('open') ? P.element : null; };
  var hassStates = function () { var ha = document.querySelector('home-assistant'); return (ha && ha.hass && ha.hass.states) || {}; };
  var render = function (keepScroll) {
    if (!V) return;
    var sr = V.pop.shadowRoot, content = sr.querySelector('.content');
    var top = content ? content.scrollTop : 0;
    var bw = V.box.getBoundingClientRect().width;
    var wide = bw > 700 || (bw === 0 && window.innerWidth > 760);
    var pad = parseFloat(V.box.style.paddingLeft) || 0;
    V.inner.innerHTML = K.html(V.p, hassStates(), V.sort, wide, bw ? bw - 2 * pad : 0);
    V.wide = wide;
    var sid = K.sensorId(V.p, hassStates());
    if (sid) mountDay(info(hassStates()[sid]));
    syncMap();
    if (content) content.scrollTop = keepScroll ? top : 0;
    if (window._casoraSepScan) window._casoraSepScan(sr);
  };
  K.open = function (p) {
    var pop = popEl();
    if (!pop || V) return false;
    var sr = pop.shadowRoot, cont = sr.querySelector('.content .container');
    var close = sr.querySelector('.header-close'), surf = sr.querySelector('.surface');
    if (!cont || !close || !surf) return false;
    // Seitenabstand wie der Popup-Inhalt (erste Statuszeile bzw. Zeile), sonst wie im Entwurf.
    var first = (function () {
      var w = window.__pierce ? window.__pierce('.hui-line, .hui-srow', cont) : [];
      return w.find(function (e) { return e.getBoundingClientRect().width > 0; });
    })();
    var cr = cont.getBoundingClientRect();
    var pad = first ? Math.max(0, Math.round(first.getBoundingClientRect().left - cr.left)) : (window.innerWidth > 760 ? 26 : 14);
    if (first && first.classList.contains('hui-line')) pad = window.innerWidth > 760 ? 26 : 14;
    var srow = first && first.classList.contains('hui-srow') ? first : null;
    if (srow) pad = Math.max(0, Math.round(srow.getBoundingClientRect().left - cr.left));
    V = { pop: pop, p: p, sort: 'guenstig', hidden: [], title: sr.querySelector('.header-title').textContent };
    [].slice.call(cont.children).forEach(function (c) { V.hidden.push([c, c.style.display]); c.style.display = 'none'; });
    var ex = sr.querySelector('.extra');
    if (ex && !ex.hidden) { V.extra = ex; ex.hidden = true; }
    var box = document.createElement('div');
    box.className = 'casora-tank-view';
    box.style.cssText = 'padding:0 ' + pad + 'px 24px;box-sizing:border-box;position:relative;z-index:1;text-align:left;';
    // Inhalt neu zeichnen, ohne die HA-Karte (eigene Ebene in box) jedes Mal neu zu laden.
    var inner = document.createElement('div');
    box.appendChild(inner);
    cont.appendChild(box);
    V.box = box;
    V.inner = inner;
    sr.querySelector('.header-title').textContent = 'Tanken';
    var ring = sr.querySelector('.header-ring');
    if (ring && !ring.hidden) { V.ring = ring.innerHTML; ring.innerHTML = '<span class="g" style="--g:url(&quot;' + GAS + '&quot;)"></span>'; }
    // Zurück: Spiegelbild des Schließen-Knopfs (gleiche Größe und Höhe, linke Seite).
    var back = close.cloneNode(true);
    back.classList.add('casora-tank-back');
    back.setAttribute('aria-label', 'Zurück');
    back.hidden = false;
    var path = back.querySelector('path');
    if (path) path.setAttribute('d', 'M15.41,16.58L10.83,12L15.41,7.41L14,6L8,12L14,18L15.41,16.58Z');
    var place = function () {
      var s = surf.getBoundingClientRect(), r = close.getBoundingClientRect();
      back.style.position = 'absolute';
      back.style.top = (r.top - s.top) + 'px';
      back.style.left = (s.right - r.right) + 'px';
      back.style.right = 'auto';
      back.style.margin = '0';
      back.style.zIndex = '5';
    };
    surf.appendChild(back);
    place();
    V.back = back;
    V.onResize = function () { if (!V) return; place(); var w = V.box.getBoundingClientRect().width > 700; if (w !== V.wide) render(true); else syncMap(); };
    window.addEventListener('resize', V.onResize);
    // Popup zu oder neu befüllt: Ansicht verlassen.
    V.mo = new MutationObserver(function () { if (V && (!pop.hasAttribute('open') || !box.isConnected)) K.leave(true); });
    V.mo.observe(pop, { attributes: true, attributeFilter: ['open'] });
    V.mo.observe(cont, { childList: true });
    V.last = null;
    V.poll = setInterval(function () {
      if (!V) return;
      var id = K.sensorId(V.p, hassStates()), st = id && hassStates()[id];
      var lu = st ? st.last_updated : null;
      if (V.last !== null && lu !== V.last) render(true);
      V.last = lu;
    }, 4000);
    render(false);
    return true;
  };
  K.leave = function (closing) {
    if (!V) return;
    var v = V; V = null;
    clearInterval(v.poll);
    v.mo.disconnect();
    window.removeEventListener('resize', v.onResize);
    if (v.back) v.back.remove();
    if (v.box) v.box.remove();
    if (closing && !v.pop.hasAttribute('open')) { /* Popup zu: nur aufräumen */ }
    var sr = v.pop.shadowRoot;
    v.hidden.forEach(function (x) { if (x[0].isConnected) x[0].style.display = x[1]; });
    if (v.extra) v.extra.hidden = false;
    var ttl = sr.querySelector('.header-title');
    if (ttl && ttl.textContent === 'Tanken') ttl.textContent = v.title;
    var ring = sr.querySelector('.header-ring');
    if (ring && v.ring != null) ring.innerHTML = v.ring;
    var content = sr.querySelector('.content');
    if (content && !closing) content.scrollTop = 0;
  };
  K.active = function () { return !!V; };

  // ── Antippen (wie die Popup-Knöpfe: click + touchend ohne Wischen) ────────
  var last = 0, tp = null;
  var fire = function (ev) {
    var path = (ev.composedPath && ev.composedPath()) || [];
    for (var i = 0; i < path.length; i++) {
      var el = path[i];
      if (!el || !el.classList) continue;
      if (el.dataset && el.dataset.casoraTank !== undefined) {
        if (Date.now() - last < 400) return;
        last = Date.now();
        ev.preventDefault(); ev.stopPropagation();
        K.open(el.dataset.casoraTank || null);
        return;
      }
      if (el.classList.contains('casora-tank-back')) {
        if (Date.now() - last < 400) return;
        last = Date.now();
        window._casoraSuppressDismiss = Date.now() + 600;
        ev.preventDefault(); ev.stopPropagation();
        K.leave(false);
        return;
      }
      if (el.classList.contains('hui-sg') && V) {
        var seg = el.closest && el.closest('.ct-seg');
        if (!seg) continue;
        if (Date.now() - last < 400) return;
        last = Date.now();
        var idx = [].indexOf.call(el.parentNode.children, el);
        if (SORTS[idx]) { V.sort = SORTS[idx][0]; render(true); }
        ev.preventDefault(); ev.stopPropagation();
        return;
      }
    }
  };
  document.addEventListener('touchstart', function (ev) { var t = ev.touches && ev.touches[0]; tp = t ? { x: t.clientX, y: t.clientY, moved: false } : null; }, { capture: true, passive: true });
  document.addEventListener('touchmove', function (ev) {
    var t = ev.touches && ev.touches[0];
    if (tp && t && (Math.abs(t.clientX - tp.x) > 10 || Math.abs(t.clientY - tp.y) > 10)) tp.moved = true;
  }, { capture: true, passive: true });
  document.addEventListener('click', fire, true);
  document.addEventListener('touchend', function (ev) { var moved = !!(tp && tp.moved); tp = null; if (!moved) fire(ev); }, true);
})();
