// ── Screensavers for wall tablets ───────────────────────────────────────────────────────────────────────────────
// After some minutes without a touch a tablet shows a screensaver over the dashboard; a touch brings the dashboard
// back. Set per dashboard in the Studio (Settings › Screensaver): casora_screensaver (minutes, empty = off),
// casora_screensaver_kind (which one, „mix“ = one after the other) and casora_screensaver_calendar. Like
// casora_idle_home they ride in the hero card of each view.
// Every screensaver is drawn from what the house knows (time, sun, weather, the dashboard's room photos); nothing is
// loaded from another server. The same drawing serves the Studio's preview (mount into any box): all sizes are
// container units, so it looks the same small and full screen. The content wanders a few pixels every minute, so
// nothing burns in.
//   window._casoraSaver.KINDS                  → [{ id, label, needs }]
//   window._casoraSaver.words(lang, h, m)      → the time as people say it: [{ t, acc }] lines (nine languages)
//   window._casoraSaver.dayShare(now, rise, set) → 0…1 share of the daylight that has passed, null at night
//   window._casoraSaver.sky(share)             → the sky's colours for that share (null = night)
//   window._casoraSaver.landSvg(scene, w, h)   → one drawn landscape (window._casoraSaver.SCENES)
//   window._casoraSaver.html(kind, ctx)        → the screensaver's markup
//   window._casoraSaver.mount(host, kind, o)   → draws into host and keeps it current; returns { update, destroy }
(function () {
  if (window._casoraSaver) return;
  var S = window._casoraSaver = {};
  var esc = window.casoraEsc || function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var T = function (t) { return typeof window.casoraTr === 'function' ? window.casoraTr(t) : t; };
  var hassOf = function () { var ha = document.querySelector('home-assistant'); return (ha && ha.hass) || null; };
  var loc = function () { return window.casoraLocale ? window.casoraLocale() : 'de-DE'; };
  var langOf = function () { return String(loc()).slice(0, 2).toLowerCase(); };

  // label: the name in the Studio (its texts are English at the source, translations/panel).
  S.KINDS = [
    { id: 'himmel', label: 'Sky' }, { id: 'land', label: 'Landscapes' }, { id: 'fotos', label: 'Photos' },
    { id: 'wort', label: 'Word clock' },
  ];

  // ── The time as people say it ────────────────────────────────────────────
  // Five-minute steps. A line marked acc is the part that changes most (drawn in the accent colour).
  // The words per language as one piece of data (not texts of the interface: nothing here is translated).
  // lang:hours 12,1…11 | the eleven five-minute steps (> = belongs to the coming hour) | lead | lead at one o'clock |
  // word after a full hour | extra (de: „ein“ before Uhr; fr: the hour words; pl: the hours in the genitive).
  var WORDS = {};
  ('de:zwölf,eins,zwei,drei,vier,fünf,sechs,sieben,acht,neun,zehn,elf|fünf nach,zehn nach,Viertel nach,zwanzig nach,fünf vor halb>,halb>,fünf nach halb>,zwanzig vor>,Viertel vor>,zehn vor>,fünf vor>|Es ist|Es ist|Uhr|ein;en:twelve,one,two,three,four,five,six,seven,eight,nine,ten,eleven|five past,ten past,quarter past,twenty past,twenty-five past,half past,twenty-five to>,twenty to>,quarter to>,ten to>,five to>|It is|It is|o’clock|;nl:twaalf,een,twee,drie,vier,vijf,zes,zeven,acht,negen,tien,elf|vijf over,tien over,kwart over,tien voor half>,vijf voor half>,half>,vijf over half>,tien over half>,kwart voor>,tien voor>,vijf voor>|Het is|Het is|uur|;nb:tolv,ett,to,tre,fire,fem,seks,sju,åtte,ni,ti,elleve|fem over,ti over,kvart over,ti på halv>,fem på halv>,halv>,fem over halv>,ti over halv>,kvart på>,ti på>,fem på>|Klokken er|Klokken er||;es:doce,una,dos,tres,cuatro,cinco,seis,siete,ocho,nueve,diez,once|y cinco,y diez,y cuarto,y veinte,y veinticinco,y media,menos veinticinco>,menos veinte>,menos cuarto>,menos diez>,menos cinco>|Son las|Es la|en punto|;fr:douze,une,deux,trois,quatre,cinq,six,sept,huit,neuf,dix,onze|cinq,dix,et quart,vingt,vingt-cinq,et demie,moins vingt-cinq>,moins vingt>,moins le quart>,moins dix>,moins cinq>|Il est|Il est|pile| heure, heures;it:dodici,una,due,tre,quattro,cinque,sei,sette,otto,nove,dieci,undici|e cinque,e dieci,e un quarto,e venti,e venticinque,e mezza,meno venticinque>,meno venti>,meno un quarto>,meno dieci>,meno cinque>|Sono le|È l’|in punto|;pt:doze,uma,duas,três,quatro,cinco,seis,sete,oito,nove,dez,onze|e cinco,e dez,e um quarto,e vinte,e vinte e cinco,e meia,menos vinte e cinco>,menos vinte>,menos um quarto>,menos dez>,menos cinco>|São|É|em ponto|;pl:dwunasta,pierwsza,druga,trzecia,czwarta,piąta,szósta,siódma,ósma,dziewiąta,dziesiąta,jedenasta|pięć po,dziesięć po,kwadrans po,dwadzieścia po,dwadzieścia pięć po,wpół do>,za dwadzieścia pięć>,za dwadzieścia>,za kwadrans>,za dziesięć>,za pięć>|Jest|Jest||dwunastej,pierwszej,drugiej,trzeciej,czwartej,piątej,szóstej,siódmej,ósmej,dziewiątej,dziesiątej,jedenastej').split(';').forEach(function (row) {
    var i = row.indexOf(':'), f = row.slice(i + 1).split('|');
    WORDS[row.slice(0, i)] = { num: f[0].split(','), step: f[1].split(',').map(function (x) { return [x.replace('>', ''), />$/.test(x)]; }),
      lead: f[2], lead1: f[3], full: f[4], extra: f[5] ? f[5].split(',') : [] };
  });
  S.words = function (lang, h, m) {
    var l = WORDS[lang] ? lang : 'en', W = WORDS[l];
    var step = Math.round(m / 5) % 12, hour = (h + (Math.round(m / 5) === 12 ? 1 : 0)) % 12;
    var st = step ? W.step[step - 1] : null;
    var hh = (hour + (st && st[1] ? 1 : 0)) % 12, one = hh === 1;
    var line = function (t, acc) { return { t: t, acc: !!acc }; };
    if (l === 'pl') {
      // po + genitive of this hour; wpół do + genitive of the coming one; za … + nominative of the coming one.
      if (!step) return [line(W.lead), line(W.num[hh], 1)];
      return [line(W.lead), line(st[0], 1), line(step <= 6 ? W.extra[hh] : W.num[hh])];
    }
    if (l === 'es' || l === 'fr' || l === 'it' || l === 'pt') {
      // Hour first, then the minutes.
      var hourT = l === 'fr' ? W.num[hh] + (one ? W.extra[0] : W.extra[1]) : W.num[hh];
      var lead = one ? W.lead1 : W.lead;
      return [line(l === 'it' && one ? lead + hourT : lead + ' ' + hourT), line(step ? st[0] : W.full, 1)];
    }
    if (step) return [line(W.lead), line(st[0], 1), line(W.num[hh])];
    var out = [line(W.lead), line(l === 'de' && one ? W.extra[0] : W.num[hh], 1)];
    if (W.full) out.push(line(W.full));
    return out;
  };

  // ── Sun and sky ──────────────────────────────────────────────────────────
  S.dayShare = function (now, rise, set) {
    var n = +now, r = +rise, s = +set;
    if (!isFinite(r) || !isFinite(s) || s <= r || n < r || n > s) return null;
    return (n - r) / (s - r);
  };
  // Sunrise and sunset of today from sun.sun (next_rising / next_setting are always the coming ones).
  S.sunTimes = function (hass, now) {
    var st = hass && hass.states && hass.states['sun.sun'];
    if (!st) return null;
    var rise = Date.parse(st.attributes.next_rising), set = Date.parse(st.attributes.next_setting), day = 86400000;
    if (isNaN(rise) || isNaN(set)) return null;
    var n = +now;
    // By day the coming sunrise is tomorrow's: today's was a day earlier (close enough for a picture).
    if (st.state === 'above_horizon') return { rise: rise - day, set: set };
    // By night: before midnight both are tomorrow's, after midnight both are today's.
    return n > set - day && rise > set ? { rise: rise - day, set: set - day } : { rise: rise, set: set };
  };
  var SKY = [
    [0, ['#2B3A67', '#7A6C9C', '#E8A07A', '#F6D2A2']], [0.12, ['#3E6FA8', '#7FAAD2', '#C9DDE6', '#F3E6CC']],
    [0.5, ['#2F6FB5', '#6FA8DC', '#B9D8EC', '#E6F1F4']], [0.86, ['#3A5F9A', '#7C8FBE', '#D9A48A', '#F2C592']],
    [1, ['#24365A', '#4A5F8C', '#B07C82', '#F2B27E']],
  ];
  var NIGHT = ['#070B1E', '#0F1A36', '#1A2A4C', '#27375A'];
  var hex = function (c) { var n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  var mix = function (a, b, t) { var x = hex(a), y = hex(b); return 'rgb(' + [0, 1, 2].map(function (i) { return Math.round(x[i] + (y[i] - x[i]) * t); }).join(',') + ')'; };
  S.sky = function (share) {
    if (share == null) return NIGHT.slice();
    share = Math.max(0, Math.min(1, share));
    for (var i = 1; i < SKY.length; i++) {
      if (share <= SKY[i][0]) {
        var a = SKY[i - 1], b = SKY[i], t = (share - a[0]) / (b[0] - a[0]);
        return a[1].map(function (c, k) { return mix(c, b[1][k], t); });
      }
    }
    return SKY[SKY.length - 1][1].slice();
  };

  // ── Drawn landscapes ─────────────────────────────────────────────────────
  var rng = function (seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
  // One ridge line as a closed path down to the bottom. kind: peaks (sharp), hills (round), dunes (long and soft).
  var ridge = function (r, w, h, base, amp, kind, step) {
    var waves = [], n = kind === 'dunes' ? 3 : 5;
    for (var i = 0; i < n; i++) waves.push({ f: (kind === 'dunes' ? 0.6 : 1) * (i + 1) * (0.7 + r() * 0.9) * Math.PI * 2 / w, p: r() * 7, a: 1 / Math.pow(i + 1, kind === 'peaks' ? 1.05 : 1.6) });
    var d = 'M0 ' + h;
    for (var x = 0; x < w + step; x += step) {
      if (x > w) x = w;
      var v = 0, tot = 0;
      waves.forEach(function (o) { var s = Math.sin(x * o.f + o.p); v += o.a * (kind === 'peaks' ? 1 - 2 * Math.abs(s) : s); tot += o.a; });
      d += 'L' + x + ' ' + (base - (v / tot) * amp).toFixed(1);
    }
    return d + 'L' + w + ' ' + h + 'Z';
  };
  S.SCENES = [
    { id: 'alpenglow', name: 'Alpenglühen', seed: 11, sky: ['#2B3A67', '#7A6C9C', '#E8A07A', '#F6D2A2'], sun: { x: .72, y: .58, r: 46, c: '#FFE9C4' },
      layers: { n: 5, kind: 'peaks', far: '#B48A9A', near: '#241F33', top: .46, bottom: .9, amp: .2 }, mist: '#F6D2A2' },
    { id: 'fjord', name: 'Fjord am Morgen', seed: 23, sky: ['#3C5A78', '#8FB0C4', '#DCE6E4', '#F3EDE0'], sun: { x: .7, y: .3, r: 34, c: '#FFFFFF' },
      layers: { n: 4, kind: 'peaks', far: '#8FA9B8', near: '#1F3440', top: .4, bottom: .7, amp: .24 }, water: { y: .72, a: '#9DB9C6', b: '#274555' }, mist: '#E6EEEE' },
    { id: 'duenen', name: 'Dünen', seed: 37, sky: ['#E9B872', '#F3CF9A', '#F8E3C0', '#FBEFD9'], sun: { x: .8, y: .26, r: 40, c: '#FFF6DF' },
      layers: { n: 5, kind: 'dunes', far: '#E4B981', near: '#8A5230', top: .5, bottom: .92, amp: .13 } },
    { id: 'nebelwald', name: 'Nebelwald', seed: 41, sky: ['#5F7F7A', '#9DB8AE', '#D5E0D6', '#EEF1E6'],
      layers: { n: 6, kind: 'hills', far: '#A9C2B7', near: '#16302B', top: .38, bottom: .9, amp: .12, trees: true }, mist: '#EEF1E6' },
    { id: 'meer', name: 'Abend am Meer', seed: 53, sky: ['#2A2F5B', '#8A4F7D', '#E8795A', '#FBC37A'], sun: { x: .62, y: .63, r: 58, c: '#FFE1A8' },
      layers: { n: 2, kind: 'hills', far: '#5B3A5E', near: '#2A1F3A', top: .6, bottom: .66, amp: .05 }, water: { y: .66, a: '#F0986A', b: '#231C3D' } },
    { id: 'bergsee', name: 'Bergsee', seed: 67, sky: ['#3F78B5', '#7FB0DA', '#BFDCEC', '#E9F3F4'], sun: { x: .78, y: .2, r: 30, c: '#FFFFFF' },
      layers: { n: 4, kind: 'peaks', far: '#9CB9CF', near: '#24483F', top: .36, bottom: .68, amp: .26 }, water: { y: .7, a: '#8FC0D8', b: '#1F4A52' } },
    { id: 'polarlicht', name: 'Polarlicht', seed: 71, sky: ['#070B1E', '#0F1F3A', '#16384A', '#1E4A4E'], stars: 130, aurora: ['#5BE0A6', '#57B6E8', '#A77BE0'],
      layers: { n: 4, kind: 'peaks', far: '#1D3A47', near: '#05080F', top: .58, bottom: .9, amp: .18 } },
    { id: 'canyon', name: 'Canyon', seed: 83, sky: ['#3B5B8C', '#8FA9C8', '#E9C9A6', '#F6DDBC'], sun: { x: .84, y: .4, r: 36, c: '#FFF1D6' },
      layers: { n: 6, kind: 'hills', far: '#D69A7A', near: '#5A2418', top: .46, bottom: .94, amp: .15, mesa: true } },
    { id: 'huegel', name: 'Sanfte Hügel', seed: 97, sky: ['#6FA7D6', '#A9CDE6', '#DDEBE6', '#F4F2DE'], sun: { x: .76, y: .22, r: 38, c: '#FFFBE8' },
      layers: { n: 6, kind: 'hills', far: '#B5CFA6', near: '#2F5A33', top: .5, bottom: .93, amp: .09 }, clouds: 4 },
    { id: 'winternacht', name: 'Winternacht', seed: 101, sky: ['#0B1230', '#1C2A55', '#3A4A7C', '#6C7AA6'], stars: 90, moon: { x: .78, y: .22, r: 30 },
      layers: { n: 5, kind: 'peaks', far: '#7C8CB4', near: '#141B38', top: .46, bottom: .9, amp: .2 }, mist: '#8E9CC4' },
  ];
  S.landSvg = function (s, w, h) {
    var r = rng(s.seed), id = 'cl' + s.id, out = [];
    var stops = s.sky.map(function (c, i) { return '<stop offset="' + (i / (s.sky.length - 1)) + '" stop-color="' + c + '"/>'; }).join('');
    out.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="xMidYMid slice" aria-hidden="true">');
    out.push('<defs><linearGradient id="' + id + 's" x1="0" y1="0" x2="0" y2="1">' + stops + '</linearGradient>');
    if (s.sun) out.push('<radialGradient id="' + id + 'g"><stop offset="0" stop-color="' + s.sun.c + '" stop-opacity=".9"/><stop offset=".35" stop-color="' + s.sun.c + '" stop-opacity=".35"/><stop offset="1" stop-color="' + s.sun.c + '" stop-opacity="0"/></radialGradient>');
    if (s.water) out.push('<linearGradient id="' + id + 'w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + s.water.a + '"/><stop offset="1" stop-color="' + s.water.b + '"/></linearGradient>');
    if (s.mist) out.push('<linearGradient id="' + id + 'm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + s.mist + '" stop-opacity="0"/><stop offset=".5" stop-color="' + s.mist + '" stop-opacity=".5"/><stop offset="1" stop-color="' + s.mist + '" stop-opacity="0"/></linearGradient>');
    if (s.aurora) out.push('<filter id="' + id + 'b" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="16"/></filter>');
    out.push('</defs><rect width="' + w + '" height="' + h + '" fill="url(#' + id + 's)"/>');
    for (var i = 0; i < (s.stars || 0); i++) {
      out.push('<circle cx="' + (r() * w).toFixed(1) + '" cy="' + (r() * h * 0.6).toFixed(1) + '" r="' + (0.5 + r() * 1.3).toFixed(2) + '" fill="#fff" opacity="' + (0.25 + r() * 0.7).toFixed(2) + '"/>');
    }
    if (s.aurora) s.aurora.forEach(function (c, k) {
      var y0 = h * (0.14 + k * 0.09), d = 'M-40 ' + y0;
      for (var x = 0; x <= w + 40; x += 60) d += ' L' + x + ' ' + (y0 + Math.sin(x / (150 + k * 40) + k * 2) * 46 + Math.sin(x / 61 + k) * 14).toFixed(1);
      out.push('<path d="' + d + '" fill="none" stroke="' + c + '" stroke-width="' + (64 - k * 14) + '" stroke-linecap="round" opacity="' + (0.5 - k * 0.1) + '" filter="url(#' + id + 'b)"/>');
    });
    if (s.sun) {
      out.push('<circle cx="' + s.sun.x * w + '" cy="' + s.sun.y * h + '" r="' + s.sun.r * 5 + '" fill="url(#' + id + 'g)"/>');
      out.push('<circle cx="' + s.sun.x * w + '" cy="' + s.sun.y * h + '" r="' + s.sun.r + '" fill="' + s.sun.c + '"/>');
    }
    if (s.moon) {
      var mx = s.moon.x * w, my = s.moon.y * h, mr = s.moon.r;
      out.push('<circle cx="' + mx + '" cy="' + my + '" r="' + mr * 3.2 + '" fill="#DCE4FF" opacity=".10"/><circle cx="' + mx + '" cy="' + my + '" r="' + mr + '" fill="#F2F4FF"/>');
      out.push('<circle cx="' + (mx + mr * 0.42) + '" cy="' + (my - mr * 0.18) + '" r="' + mr * 0.86 + '" fill="' + s.sky[0] + '"/>');
    }
    for (var c = 0; c < (s.clouds || 0); c++) {
      var cx = (0.1 + r() * 0.8) * w, cy = (0.1 + r() * 0.22) * h, cw = 120 + r() * 160;
      out.push('<g fill="#fff" opacity=".7"><ellipse cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" rx="' + (cw / 2).toFixed(1) + '" ry="' + (cw / 9).toFixed(1) + '"/><ellipse cx="' + (cx - cw * .18).toFixed(1) + '" cy="' + (cy - cw * .07).toFixed(1) + '" rx="' + (cw * .22).toFixed(1) + '" ry="' + (cw * .12).toFixed(1) + '"/><ellipse cx="' + (cx + cw * .14).toFixed(1) + '" cy="' + (cy - cw * .1).toFixed(1) + '" rx="' + (cw * .26).toFixed(1) + '" ry="' + (cw * .15).toFixed(1) + '"/></g>');
    }
    var L = s.layers, landBottom = s.water ? s.water.y * h : h;
    for (var k = 0; k < L.n; k++) {
      var t = L.n === 1 ? 1 : k / (L.n - 1);
      var base = (L.top + (L.bottom - L.top) * t) * h, amp = L.amp * h * (1 - t * 0.45);
      var col = mix(L.far, L.near, Math.pow(t, 0.9));
      out.push('<path d="' + ridge(r, w, landBottom, base, amp, L.kind, L.mesa ? 46 : 8) + '" fill="' + col + '"/>');
      if (L.trees && k >= 1) {
        var n = 46 + k * 10, th = 20 + k * 12;
        for (var q = 0; q < n; q++) {
          var tx = r() * w, ty = base - amp * 0.2 + r() * amp * 0.7;
          out.push('<path d="M' + tx.toFixed(1) + ' ' + (ty - th).toFixed(1) + 'l' + (th * 0.26).toFixed(1) + ' ' + th + 'h-' + (th * 0.52).toFixed(1) + 'z" fill="' + col + '"/>');
        }
      }
      if (s.mist && k < L.n - 1) out.push('<rect x="0" y="' + (base - amp * 0.2).toFixed(1) + '" width="' + w + '" height="' + (amp * 1.5 + 40).toFixed(1) + '" fill="url(#' + id + 'm)" opacity="' + (0.9 - t * 0.5).toFixed(2) + '"/>');
    }
    if (s.water) {
      var wy = s.water.y * h;
      out.push('<rect x="0" y="' + wy + '" width="' + w + '" height="' + (h - wy) + '" fill="url(#' + id + 'w)"/>');
      if (s.sun) for (var z = 0; z < 16; z++) {
        var ry = wy + 8 + z * z * 1.25, rw = s.sun.r * (2.4 - z * 0.08) * (0.7 + r() * 0.6);
        if (ry > h) break;
        out.push('<rect x="' + (s.sun.x * w - rw / 2 + (r() - .5) * 26).toFixed(1) + '" y="' + ry.toFixed(1) + '" width="' + rw.toFixed(1) + '" height="' + (2 + z * 0.35).toFixed(1) + '" rx="2" fill="' + s.sun.c + '" opacity="' + (0.75 - z * 0.04).toFixed(2) + '"/>');
      }
      for (var u = 0; u < 22; u++) {
        out.push('<rect x="' + (r() * w).toFixed(1) + '" y="' + (wy + 10 + r() * (h - wy - 16)).toFixed(1) + '" width="' + (30 + r() * 140).toFixed(1) + '" height="1.6" rx="1" fill="#fff" opacity="' + (0.06 + r() * 0.12).toFixed(2) + '"/>');
      }
    }
    return out.join('') + '</svg>';
  };

  // ── What a screensaver knows ─────────────────────────────────────────────
  // Weather pictures that ship with Casora (assets/weather), by Home Assistant's condition.
  var WX = { sunny: 'clear-day', 'clear-night': 'clear-night-fill', cloudy: 'cloudy-fill', partlycloudy: 'partly-cloudy-day-fill', fog: 'fog-fill',
    rainy: 'rain-fill', pouring: 'rain-heavy-fill', snowy: 'snow-fill', 'snowy-rainy': 'weather-mixed-fill', hail: 'weather-mixed-fill',
    lightning: 'thunder-fill', 'lightning-rainy': 'lightning-rainy-fill', windy: 'cloudy-fill', 'windy-variant': 'cloudy-fill', exceptional: 'cloudy-fill' };
  S.weather = function (hass, entityId) {
    var st = hass && entityId && hass.states && hass.states[entityId];
    if (!st || st.state === 'unavailable' || st.state === 'unknown') return null;
    var t = st.attributes && st.attributes.temperature, text = st.state;
    try { if (hass.formatEntityState) text = hass.formatEntityState(st); } catch (e) { /* the raw state */ }
    return { temp: t == null || t === '' || isNaN(Number(t)) ? null : Math.round(Number(t)), text: String(text || ''),
      icon: '/casora_assets/weather/' + (WX[st.state] || 'cloudy-fill') + '.svg' };
  };
  // The rooms of the dashboard with a photo: [{ name, url }] (the room photos people chose in the Studio).
  S.rooms = function (cfg, hass, dark) {
    var out = [], seen = {};
    ((cfg && cfg.views) || []).forEach(function (v) {
      var vars = ((((v.cards || [])[0]) || {}).variables) || {};
      var ref = (dark && vars.image_night) || vars.image;
      if (!ref || typeof window.casoraPhotoUrl !== 'function') return;
      var url = window.casoraPhotoUrl(ref, hass);
      if (!url || seen[url]) return;
      seen[url] = 1;
      out.push({ name: String(v.title || vars.title || ''), url: url });
    });
    return out;
  };
  var timeText = function (now, hass) {
    var h12 = hass && hass.locale && hass.locale.time_format === '12';
    var h = now.getHours();
    if (h12) h = ((h + 11) % 12) + 1;
    return (h12 ? String(h) : String(h).padStart(2, '0')) + ':' + String(now.getMinutes()).padStart(2, '0');
  };
  var dateText = function (now) {
    var d = new Intl.DateTimeFormat(loc(), { weekday: 'long', day: 'numeric', month: 'long' }).format(now);
    return d.charAt(0).toUpperCase() + d.slice(1);
  };
  var hm = function (ts) { return new Intl.DateTimeFormat(loc(), { hour: '2-digit', minute: '2-digit' }).format(new Date(ts)); };

  // ── Drawing ──────────────────────────────────────────────────────────────
  // One unit is a hundredth of the box's shorter side (cqmin), so a preview and a wall tablet look the same.
  var u = function (n) { return (n / 8.2).toFixed(3) + 'cqmin'; };
  var CSS = '.cs-sv{position:absolute;inset:0;overflow:hidden;container-type:size;color:#F6EFE6;text-align:left;'
    + 'font-family:var(--primary-font-family, var(--ha-font-family, system-ui, sans-serif));-webkit-user-select:none;user-select:none;}'
    + '.cs-sv *{box-sizing:border-box;margin:0;padding:0;}'
    + '.cs-sv svg.cs-bg, .cs-sv .cs-bg{position:absolute;inset:0;width:100%;height:100%;display:block;}'
    + '.cs-sv .cs-in{position:absolute;inset:0;transform:translate(var(--cs-dx, 0px), var(--cs-dy, 0px));transition:transform 4s ease;}'
    + '.cs-sv .cs-time{font-weight:500;letter-spacing:-.045em;line-height:1;font-variant-numeric:tabular-nums;}'
    + '.cs-sv .cs-date{font-weight:600;letter-spacing:-.01em;color:rgba(255,255,255,.84);}'
    + '.cs-sv .cs-shade{position:absolute;inset:0;background:linear-gradient(0deg, rgba(10,8,6,.72) 0%, rgba(10,8,6,.24) 34%, rgba(10,8,6,0) 58%);}'
    + '.cs-sv .cs-bar{position:absolute;left:' + u(72) + ';right:' + u(72) + ';bottom:' + u(62) + ';display:flex;justify-content:space-between;align-items:flex-end;gap:' + u(24) + ';}'
    + '.cs-sv .cs-bar .cs-time{font-size:' + u(124) + ';margin-left:-' + u(5) + ';text-shadow:0 ' + u(6) + ' ' + u(30) + ' rgba(0,0,0,.35);}'
    + '.cs-sv .cs-bar .cs-date{font-size:' + u(22) + ';margin-top:' + u(6) + ';}'
    + '.cs-sv .cs-name{text-align:right;font-size:' + u(19) + ';font-weight:600;color:rgba(255,255,255,.86);}'
    + '.cs-sv .cs-name b{display:block;font-size:' + u(30) + ';font-weight:700;color:#fff;letter-spacing:-.01em;}'
    + '.cs-sv .cs-photo{position:absolute;inset:-2%;background-size:cover;background-position:center;animation:cs-pan 60s ease-in-out infinite alternate;}'
    + '@keyframes cs-pan{from{transform:scale(1.04) translate(-1%, 0);}to{transform:scale(1.1) translate(1.2%, -1%);}}'
    + '@media (prefers-reduced-motion: reduce){.cs-sv .cs-photo{animation:none;}}'
    // Himmel
    + '.cs-sv .cs-top{position:absolute;left:' + u(72) + ';right:' + u(72) + ';top:' + u(64) + ';display:flex;justify-content:space-between;align-items:flex-start;gap:' + u(24) + ';}'
    + '.cs-sv .cs-top .cs-time{font-size:' + u(188) + ';margin-left:-' + u(8) + ';}'
    + '.cs-sv .cs-top .cs-date{font-size:' + u(26) + ';margin-top:' + u(10) + ';}'
    + '.cs-sv .cs-wx{text-align:right;padding-top:' + u(22) + ';}'
    + '.cs-sv .cs-wx .cs-t{display:flex;align-items:center;justify-content:flex-end;gap:' + u(14) + ';font-size:' + u(68) + ';font-weight:600;letter-spacing:-.03em;line-height:1;}'
    + '.cs-sv .cs-wx img{width:' + u(62) + ';height:' + u(62) + ';filter:brightness(0) invert(1);}'
    + '.cs-sv .cs-wx p{font-size:' + u(21) + ';font-weight:600;color:rgba(255,255,255,.84);margin-top:' + u(10) + ';}'
    + '.cs-sv .cs-arc{position:absolute;left:' + u(72) + ';right:' + u(72) + ';bottom:' + u(110) + ';height:' + u(330) + ';}'
    + '.cs-sv .cs-arc svg{width:100%;height:100%;display:block;overflow:visible;}'
    + '.cs-sv .cs-ends{position:absolute;left:' + u(72) + ';right:' + u(72) + ';bottom:' + u(58) + ';display:flex;justify-content:space-between;gap:' + u(16) + ';font-size:' + u(17) + ';font-weight:600;color:rgba(255,255,255,.86);}'
    + '.cs-sv .cs-ends b{font-weight:700;color:#fff;font-variant-numeric:tabular-nums;}'
    // Wortuhr (light by day, dark by night)
    + '.cs-sv.cs-wort{background:#F2EBE0;color:#2A2520;}.cs-sv.cs-wort.cs-dark{background:#191613;color:#F3ECE2;}'
    + '.cs-sv .cs-words{position:absolute;left:' + u(84) + ';right:' + u(60) + ';top:50%;transform:translateY(-58%);font-size:' + u(148) + ';font-weight:700;letter-spacing:-.045em;line-height:.98;}'
    + '.cs-sv .cs-words span{display:block;}.cs-sv .cs-words .cs-acc{color:#C8693F;}.cs-sv.cs-dark .cs-words .cs-acc{color:#E08A5C;}'
    + '.cs-sv .cs-foot{position:absolute;left:' + u(90) + ';right:' + u(84) + ';bottom:' + u(76) + ';display:flex;justify-content:space-between;align-items:flex-end;gap:' + u(20) + ';font-size:' + u(26) + ';font-weight:600;opacity:.7;}'
    + '.cs-sv .cs-foot b{font-weight:700;font-variant-numeric:tabular-nums;}'
    + '.cs-sv .cs-foot .cs-fw{display:flex;align-items:center;gap:' + u(12) + ';font-weight:700;}'
    + '.cs-sv .cs-foot img{width:' + u(40) + ';height:' + u(40) + ';}.cs-sv.cs-wort:not(.cs-dark) .cs-foot img{filter:brightness(0);}.cs-sv.cs-dark .cs-foot img{filter:brightness(0) invert(1);}'
    // Narrow boxes (portrait tablet): the big time gives way.
    + '@container (aspect-ratio < 1){.cs-sv .cs-top{flex-direction:column;}.cs-sv .cs-wx{text-align:left;padding-top:0;}.cs-sv .cs-wx .cs-t{justify-content:flex-start;}'
    + '.cs-sv .cs-top .cs-time{font-size:' + u(150) + ';}.cs-sv .cs-words{font-size:' + u(104) + ';}.cs-sv .cs-bar{flex-direction:column;align-items:flex-start;}.cs-sv .cs-name{text-align:left;}}';

  var bar = function (ctx, name, sub) {
    var wx = ctx.wx;
    return '<div class="cs-shade"></div><div class="cs-bar"><div><div class="cs-time">' + esc(timeText(ctx.now, ctx.hass)) + '</div>'
      + '<div class="cs-date">' + esc(dateText(ctx.now)) + (wx && wx.temp != null ? ' · ' + wx.temp + '° ' + esc(wx.text.toLowerCase()) : '') + '</div></div>'
      + (name ? '<div class="cs-name"><b data-no-i18n>' + esc(name) + '</b>' + esc(sub || '') + '</div>' : '') + '</div>';
  };
  var DRAW = {
    // The sky is the picture: its colours follow the sun's height, the sun sits on its path between rise and set.
    himmel: function (ctx) {
      var sun = ctx.sun, share = sun ? S.dayShare(ctx.now, sun.rise, sun.set) : null;
      var sky = S.sky(sun ? share : 0.5), wx = ctx.wx;
      var W = 1036, H = 330, x0 = 0, x1 = W, top = 40;
      // Quadratic curve from the left end over the top to the right end; the point for a share of the day.
      var at = function (t) { var a = 1 - t; return [a * a * x0 + 2 * a * t * (W / 2) + t * t * x1, a * a * H + 2 * a * t * (top * 2 - H) + t * t * H]; };
      var pts = function (to) { var d = ''; for (var i = 0; i <= 60; i++) { var p = at(to * i / 60); d += (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); } return d; };
      var p = share == null ? null : at(share);
      var left = sun && share != null ? Math.round((sun.set - +ctx.now) / 60000) : null;
      // Whole sentences with placeholders: the translation works on the finished text.
      var mid = share == null ? T('Nacht') : left >= 60 ? T('Noch {h} Std. {m} Min. Tageslicht'.replace('{h}', Math.floor(left / 60)).replace('{m}', left % 60))
        : T('Noch {m} Min. Tageslicht'.replace('{m}', left));
      return '<div class="cs-bg" style="background:linear-gradient(180deg, ' + sky[0] + ' 0%, ' + sky[1] + ' 36%, ' + sky[2] + ' 74%, ' + sky[3] + ' 100%)"></div><div class="cs-in">'
        + '<div class="cs-top"><div><div class="cs-time">' + esc(timeText(ctx.now, ctx.hass)) + '</div><div class="cs-date">' + esc(dateText(ctx.now)) + '</div></div>'
        + (wx ? '<div class="cs-wx"><div class="cs-t"><img src="' + esc(wx.icon) + '" alt="">' + (wx.temp != null ? wx.temp + '°' : '') + '</div><p>' + esc(wx.text) + '</p></div>' : '') + '</div>'
        + (sun ? '<div class="cs-arc"><svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">'
          + '<defs><radialGradient id="cs-glow"><stop offset="0" stop-color="#FFE9BF" stop-opacity=".95"/><stop offset=".32" stop-color="#FFD9A0" stop-opacity=".5"/><stop offset="1" stop-color="#FFD9A0" stop-opacity="0"/></radialGradient></defs>'
          + '<line x1="0" y1="' + H + '" x2="' + W + '" y2="' + H + '" stroke="rgba(255,255,255,.5)" stroke-width="2" vector-effect="non-scaling-stroke"/>'
          + '<path d="' + pts(1) + '" fill="none" stroke="rgba(255,255,255,.42)" stroke-width="2.5" stroke-dasharray="2 9" stroke-linecap="round" vector-effect="non-scaling-stroke"/>'
          + (p ? '<path class="cs-done" d="' + pts(share) + '" fill="none" stroke="#FFE3B0" stroke-width="3.5" stroke-linecap="round" vector-effect="non-scaling-stroke"/>'
            + '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="64" fill="url(#cs-glow)"/><circle class="cs-sun" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="19" fill="#FFF1D2"/>' : '')
          + '</svg></div><div class="cs-ends"><span>' + esc(T('Aufgang')) + ' <b>' + esc(hm(sun.rise)) + '</b></span><span>' + esc(mid) + '</span><span>' + esc(T('Untergang')) + ' <b>' + esc(hm(sun.set)) + '</b></span></div>' : '')
        + '</div>';
    },
    // A drawn landscape; a new one every ten minutes, dark ones by night.
    land: function (ctx) {
      var night = ctx.sun ? S.dayShare(ctx.now, ctx.sun.rise, ctx.sun.set) == null : (ctx.now.getHours() < 7 || ctx.now.getHours() >= 20);
      var pool = S.SCENES.filter(function (s) { return !!s.stars === night; });
      if (!pool.length) pool = S.SCENES;
      var s = pool[Math.floor(+ctx.now / 600000) % pool.length];
      return S.landSvg(s, 1180, 820).replace('<svg ', '<svg class="cs-bg" ') + '<div class="cs-in">' + bar(ctx, T(s.name), T('Landschaften')) + '</div>';
    },
    // The dashboard's own room photos, slowly moving; a new room every two minutes.
    fotos: function (ctx) {
      var rooms = ctx.rooms || [];
      if (!rooms.length) return DRAW.land(ctx);
      var r = rooms[Math.floor(+ctx.now / 120000) % rooms.length];
      return '<div class="cs-photo" style="background-image:url(&quot;' + esc(r.url) + '&quot;)"></div><div class="cs-in">' + bar(ctx, r.name, '') + '</div>';
    },
    wort: function (ctx) {
      var wx = ctx.wx, lines = S.words(langOf(), ctx.now.getHours(), ctx.now.getMinutes());
      return '<div class="cs-in"><div class="cs-words" data-no-i18n>' + lines.map(function (l) { return '<span' + (l.acc ? ' class="cs-acc"' : '') + '>' + esc(l.t) + '</span>'; }).join('') + '</div>'
        + '<div class="cs-foot"><div><b>' + esc(timeText(ctx.now, ctx.hass)) + '</b> · ' + esc(dateText(ctx.now)) + '</div>'
        + (wx && wx.temp != null ? '<div class="cs-fw"><img src="' + esc(wx.icon) + '" alt="">' + wx.temp + '°</div>' : '') + '</div></div>';
    },
  };
  S.context = function (o) {
    o = o || {};
    var hass = o.hass || hassOf(), now = o.now || new Date(), vars = o.vars || {};
    var dark = !!(hass && hass.themes && hass.themes.darkMode);
    return { now: now, hass: hass, vars: vars, dark: dark, sun: o.sun !== undefined ? o.sun : S.sunTimes(hass, now),
      wx: o.wx !== undefined ? o.wx : S.weather(hass, vars.weather_entity), rooms: o.rooms || S.rooms(o.config, hass, dark) };
  };
  // „mix“ shows one after the other, five minutes each.
  S.kindAt = function (kind, now) {
    var ids = S.KINDS.map(function (k) { return k.id; });
    if (kind === 'mix') return ids[Math.floor(+now / 300000) % ids.length];
    return ids.indexOf(kind) === -1 ? ids[0] : kind;
  };
  S.html = function (kind, ctx) {
    var k = S.kindAt(kind, ctx.now);
    return '<div class="cs-sv cs-' + k + (ctx.dark ? ' cs-dark' : '') + '" data-kind="' + k + '">' + DRAW[k](ctx) + '</div>';
  };
  S.mount = function (host, kind, o) {
    o = o || {};
    var last = '', timer = 0, n = 0;
    if (!document.getElementById('cs-sv-css')) {
      var st = document.createElement('style');
      st.id = 'cs-sv-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    var root = host.getRootNode && host.getRootNode();
    if (root && root !== document && root.querySelector && !root.querySelector('style.cs-sv-css')) {
      var s2 = document.createElement('style');
      s2.className = 'cs-sv-css';
      s2.textContent = CSS;
      root.appendChild(s2);
    }
    var update = function () {
      var ctx = S.context(typeof o.context === 'function' ? o.context() : o.context);
      var html = S.html(typeof o.kind === 'function' ? o.kind() : kind, ctx);
      if (html !== last) { last = html; host.innerHTML = html; }
      // Wander a few pixels so nothing burns in (not in a preview).
      if (o.drift) {
        var el = host.firstElementChild;
        n++;
        if (el) { el.style.setProperty('--cs-dx', (Math.sin(n / 3) * 10).toFixed(1) + 'px'); el.style.setProperty('--cs-dy', (Math.cos(n / 4) * 8).toFixed(1) + 'px'); }
      }
    };
    update();
    timer = setInterval(update, o.every || 20000);
    return { update: update, destroy: function () { clearInterval(timer); host.innerHTML = ''; } };
  };

  // The settings of the dashboard: the first value found on a view's hero card.
  S.vars = function (cfg) {
    var out = {}, keys = ['casora_screensaver', 'casora_screensaver_kind', 'casora_screensaver_calendar', 'weather_entity'];
    ((cfg && cfg.views) || []).forEach(function (v) {
      var vars = ((((v.cards || [])[0]) || {}).variables) || {};
      keys.forEach(function (k) { if ((out[k] == null || out[k] === '') && vars[k] != null && vars[k] !== '') out[k] = vars[k]; });
    });
    return out;
  };
  S.minutes = function (v) { var n = parseFloat(v); return isFinite(n) && n > 0 ? Math.min(n, 240) : 0; };
  // ── On the dashboard ─────────────────────────────────────────────────────
  if (!window.document || window.document.nodeType !== 9 || S._booted) return;
  S._booted = true;
  var FORCE = /[?&]casora_saver=1/.test(location.search), OFF = /[?&]casora_saver=0/.test(location.search);
  // The tablet navbar's own test, as „Return to Home when idle“ uses it.
  var TABLET = window.matchMedia ? window.matchMedia('(hover: none) and (pointer: coarse) and (min-width: 600px)') : null;
  var lastAct = Date.now(), layer = null, live = null, rootEl = null, lookedAt = 0;
  var bump = function () { lastAct = Date.now(); };
  ['pointerdown', 'touchstart', 'keydown', 'wheel', 'scroll'].forEach(function (t) { window.addEventListener(t, bump, { capture: true, passive: true }); });
  window.addEventListener('location-changed', bump, true);
  var deep = function (root, tag, depth) {
    if (!root || depth > 10 || !root.querySelector) return null;
    var hit = root.querySelector(tag);
    if (hit) return hit;
    var kids = root.querySelectorAll('*');
    for (var i = 0; i < kids.length; i++) if (kids[i].shadowRoot) { var f = deep(kids[i].shadowRoot, tag, depth + 1); if (f) return f; }
    return null;
  };
  var config = function () {
    if (/^\/casora-studio/.test(location.pathname)) return null;
    if (!rootEl || !rootEl.isConnected) {
      if (Date.now() - lookedAt < 8000) return null;
      lookedAt = Date.now();
      rootEl = deep(document, 'hui-root', 0);
    }
    var ll = rootEl && rootEl.lovelace;
    return ll && !ll.editMode ? (ll.config || null) : null;
  };
  var hide = function () {
    if (!layer) return;
    if (live) { live.destroy(); live = null; }
    layer.remove();
    layer = null;
    bump();
  };
  S.hide = hide;
  var show = function (cfg) {
    if (layer) return;
    layer = document.createElement('div');
    layer.className = 'cs-sv-layer';
    layer.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#101010;cursor:pointer;touch-action:none;';
    // A touch only wakes the dashboard: it must not reach a tile underneath.
    var wake = function (ev) { ev.preventDefault(); ev.stopPropagation(); hide(); };
    ['pointerdown', 'touchstart', 'click', 'contextmenu'].forEach(function (t) { layer.addEventListener(t, wake, { passive: false }); });
    document.body.appendChild(layer);
    live = S.mount(layer, null, { drift: true, kind: function () { return S.vars(config() || cfg).casora_screensaver_kind || 'mix'; },
      context: function () { var c = config() || cfg; return { config: c, vars: S.vars(c) }; } });
  };
  S.show = show;
  S.shown = function () { return !!layer; };
  setInterval(function () {
    if (OFF) return;
    var cfg = config();
    if (!cfg) { if (layer) hide(); return; }
    var mins = S.minutes(S.vars(cfg).casora_screensaver);
    if (!mins || (!FORCE && !(TABLET && TABLET.matches))) { if (layer) hide(); bump(); return; }
    // Never over an open popup: someone is reading it.
    if (window.casoraPopup && window.casoraPopup.surface) { if (layer) hide(); bump(); return; }
    if (!layer && Date.now() - lastAct >= mins * 60000) show(cfg);
  }, 5000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden && !layer) bump(); });
})();
