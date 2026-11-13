// ── Screensavers for wall tablets ───────────────────────────────────────────────────────────────────────────────
// After some minutes without a touch a tablet shows a screensaver over the dashboard; a touch brings the dashboard
// back. Set per dashboard in the Studio (Settings › Screensaver): casora_screensaver (minutes, empty = off),
// casora_screensaver_kind (which one, „mix“ = one after the other) and casora_screensaver_calendar. Like
// casora_idle_home they ride in the hero card of each view.
// Ten screensavers: sky, drawn landscapes, room photos, word clock, weather, day line, week, music, energy flow and
// the house at rest. Every one is drawn from what the house knows (time, sun, weather and its forecast, calendars,
// waste dates, the playing media player, the energy settings, the bell, the dashboard's room photos); nothing is
// loaded from another server. One that has nothing to show (no music playing, energy not set up) shows the sky. The same drawing serves the Studio's preview (mount into any box): all sizes are
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
    { id: 'wort', label: 'Word clock' }, { id: 'wetter', label: 'Weather' }, { id: 'linie', label: 'Day line' },
    { id: 'woche', label: 'Week' }, { id: 'musik', label: 'Music' }, { id: 'energie', label: 'Energy flow' },
    { id: 'ruhe', label: 'House at rest' },
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
  // The rooms of the dashboard with a photo: [{ name, url, ref }] (the room photos people chose in the Studio).
  // o.url: how a photo name becomes an address (the Studio has its own list; the dashboard casoraPhotoUrl).
  // o.only: the photos picked in the Studio (casora_screensaver_photos, the day photo's name); none picked = all.
  S.rooms = function (cfg, hass, dark, o) {
    o = o || {};
    var out = [], seen = {};
    var urlOf = typeof o.url === 'function' ? o.url : typeof window.casoraPhotoUrl === 'function' ? function (ref) { return window.casoraPhotoUrl(ref, hass); } : null;
    var only = Array.isArray(o.only) && o.only.length ? o.only.map(String) : null;
    if (!urlOf) return out;
    ((cfg && cfg.views) || []).forEach(function (v) {
      var vars = ((((v.cards || [])[0]) || {}).variables) || {};
      if (!vars.image || (only && only.indexOf(String(vars.image)) < 0)) return;
      var ref = (dark && vars.image_night) || vars.image;
      var url = urlOf(ref, dark);
      if (!url || seen[url]) return;
      seen[url] = 1;
      out.push({ name: String(v.title || vars.title || ''), url: url, ref: String(vars.image) });
    });
    return out;
  };
  // ── Data that has to be asked for (kept in the module, a repaint follows when it arrives) ────────────────
  var DATA = S._data = { fc: {}, ev: {}, at: {} }, listeners = [];
  var changed = function () { listeners.slice().forEach(function (fn) { try { fn(); } catch (e) { /* the listener's own */ } }); };
  // Forecast of the weather entity: type „hourly“ or „daily“ (weather/subscribe_forecast, one answer is enough).
  S.forecast = function (hass, entityId, type) {
    var key = entityId + '|' + type;
    if (!hass || !entityId || !hass.connection || !hass.connection.subscribeMessage) return DATA.fc[key] || [];
    if (!(DATA.at[key] && Date.now() - DATA.at[key] < 900000)) {
      DATA.at[key] = Date.now();
      var unsub = null, done = false;
      var stop = function () { if (typeof unsub === 'function') { try { unsub(); } catch (e) { /* closed */ } unsub = null; } };
      Promise.resolve(hass.connection.subscribeMessage(function (msg) {
        var list = msg && msg.forecast;
        if (Array.isArray(list)) { DATA.fc[key] = list; done = true; stop(); changed(); }
      }, { type: 'weather/subscribe_forecast', entity_id: entityId, forecast_type: type })).then(function (u) {
        unsub = u;
        if (done) stop();
      }, function () { /* this weather source has no such forecast */ });
    }
    return DATA.fc[key] || [];
  };
  // The calendars that count: visible ones, not the Workday integration's (as under the greeting, #157).
  S.calendars = function (hass, only) {
    var R = (hass && hass.entities) || {}, S0 = (hass && hass.states) || {};
    if (only && S0[only]) return [only];
    return Object.keys(S0).filter(function (id) {
      var e = R[id];
      return id.indexOf('calendar.') === 0 && !(e && (e.hidden || e.disabled_by || e.platform === 'workday'));
    }).sort().slice(0, 8);
  };
  // Events of the coming days from Home Assistant's calendar API: [{ title, start, end, allDay }] sorted by start.
  S.events = function (hass, ids, days) {
    var key = ids.join(',') + '|' + days;
    if (!hass || !ids.length || typeof hass.callApi !== 'function') return DATA.ev[key] || [];
    if (!(DATA.at[key] && Date.now() - DATA.at[key] < 600000)) {
      DATA.at[key] = Date.now();
      var a = new Date(); a.setHours(0, 0, 0, 0);
      var b = new Date(a.getTime() + days * 86400000);
      var q = '?start=' + encodeURIComponent(a.toISOString()) + '&end=' + encodeURIComponent(b.toISOString());
      Promise.all(ids.map(function (id) {
        return hass.callApi('GET', 'calendars/' + id + q).then(function (rows) { return rows || []; }, function () { return []; });
      })).then(function (lists) {
        var out = [];
        lists.forEach(function (rows) {
          rows.forEach(function (ev) {
            var all = !(ev.start && ev.start.dateTime);
            var st = all ? (ev.start && ev.start.date ? ev.start.date + 'T00:00:00' : null) : ev.start.dateTime;
            var en = ev.end ? (all ? (ev.end.date ? ev.end.date + 'T00:00:00' : null) : ev.end.dateTime) : null;
            var t0 = Date.parse(st);
            if (isNaN(t0)) return;
            out.push({ title: String(ev.summary || ''), start: t0, end: en ? Date.parse(en) : null, allDay: all });
          });
        });
        out.sort(function (x, y) { return x.start - y.start; });
        // The same appointment in several calendars (a family calendar and one's own) counts once.
        var seen = {};
        out = out.filter(function (e) { var k = e.start + '|' + e.title; if (seen[k]) return false; seen[k] = 1; return true; });
        DATA.ev[key] = out;
        changed();
      });
    }
    return DATA.ev[key] || [];
  };
  // Waste pickups as the waste tile knows them: [{ label, days }] (0 = today).
  S.waste = function (hass) {
    try {
      var W = window.casoraDevice && window.casoraDevice.waste ? window.casoraDevice.waste(hass, {}) : null;
      return (W && Array.isArray(W.bins) ? W.bins : []).filter(function (b) { return b && b.days != null && isFinite(b.days) && b.days >= 0; })
        .map(function (b) { return { label: String(b.label || ''), days: Math.round(b.days) }; }).sort(function (x, y) { return x.days - y.days; });
    } catch (e) { return []; }
  };
  // What plays right now: the media player that is playing and has a title (the one changed last).
  S.playing = function (hass) {
    var S0 = (hass && hass.states) || {}, R = (hass && hass.entities) || {}, best = null;
    Object.keys(S0).forEach(function (id) {
      var st = S0[id], a = st.attributes || {}, e = R[id];
      if (id.indexOf('media_player.') !== 0 || st.state !== 'playing' || !a.media_title || (e && (e.hidden || e.disabled_by))) return;
      if (!best || String(st.last_updated) > String(best.st.last_updated)) best = { id: id, st: st };
    });
    if (!best) return null;
    var a = best.st.attributes;
    var dur = Number(a.media_duration), pos = Number(a.media_position), at = Date.parse(a.media_position_updated_at || '');
    if (isFinite(pos) && !isNaN(at)) pos = Math.min(isFinite(dur) ? dur : pos + 1e9, pos + (Date.now() - at) / 1000);
    return { title: String(a.media_title), artist: String(a.media_artist || a.media_album_name || a.app_name || ''), where: String(a.friendly_name || ''),
      cover: a.entity_picture_local || a.entity_picture || '', dur: isFinite(dur) && dur > 0 ? dur : null, pos: isFinite(pos) && pos >= 0 ? pos : null };
  };
  // The house's power right now from Home Assistant's energy settings (00-finder.js): watts, signed as HA keeps them
  // (grid + = from the grid, battery + = from the battery); house = everything that comes in.
  var W_FACTOR = { mW: 0.001, W: 1, kW: 1000, MW: 1e6 };
  S.energy = function (hass) {
    if (typeof window.casoraEnergyHouse !== 'function') return null;
    var H = window.casoraEnergyHouse(hass), S0 = (hass && hass.states) || {};
    if (!H) return null;
    var sum = function (ids) {
      var t = 0, any = false;
      ids.forEach(function (id) {
        var st = S0[id], n = st ? parseFloat(st.state) : NaN;
        if (!isFinite(n)) return;
        t += n * (W_FACTOR[String((st.attributes || {}).unit_of_measurement || 'W')] || 1);
        any = true;
      });
      return any ? t : null;
    };
    var solar = H.solar.length ? sum(H.solar) : null, grid = sum(H.grid), bat = H.battery.length ? sum(H.battery) : null;
    if (grid == null) return null;
    var soc = null;
    if (H.battery.length && typeof window.casoraEnergyBatterySoc === 'function') {
      var sid = window.casoraEnergyBatterySoc(hass, H.battery[0]), sv = sid && S0[sid] ? parseFloat(S0[sid].state) : NaN;
      if (isFinite(sv)) soc = Math.round(sv);
    }
    return { solar: solar, grid: grid, battery: bat, soc: soc, hasSolar: H.solar.length > 0, hasBattery: H.battery.length > 0,
      house: Math.max(0, (solar || 0) + grid + (bat || 0)) };
  };
  // What the bell holds right now (casora-core.js): the rows that ask for someone first.
  S.bell = function () {
    var N = window._casoraNotify, rows = [];
    try { rows = N && Array.isArray(N.rows) ? N.rows : []; } catch (e) { rows = []; }
    return rows.filter(function (r) { return r && r.label; }).map(function (r) {
      return { label: String(r.label), sub: String(r.sub || ''), tone: r.tone === 'bad' ? 'bad' : r.tone === 'warn' ? 'warn' : 'info', rank: r.rank || 9 };
    }).sort(function (x, y) { return (x.tone === 'bad' ? 0 : x.tone === 'warn' ? 1 : 2) - (y.tone === 'bad' ? 0 : y.tone === 'warn' ? 1 : 2); });
  };
  S.people = function (hass) {
    var S0 = (hass && hass.states) || {}, R = (hass && hass.entities) || {};
    return Object.keys(S0).filter(function (id) { return id.indexOf('person.') === 0 && !(R[id] && R[id].hidden); }).sort().slice(0, 5).map(function (id) {
      return { name: String((S0[id].attributes || {}).friendly_name || id.slice(7)), home: S0[id].state === 'home' };
    });
  };
  var kw = function (w) { var a = Math.abs(w); return a >= 1000 ? (a / 1000).toLocaleString(loc(), { maximumFractionDigits: 1 }) + ' kW' : Math.round(a) + ' W'; };
  var wxIcon = function (cond) { return '/casora_assets/weather/' + (WX[cond] || 'cloudy-fill') + '.svg'; };
  var dayName = function (ts, short) { return new Intl.DateTimeFormat(loc(), { weekday: short ? 'short' : 'long' }).format(new Date(ts)); };
  var sameDay = function (a, b) { var x = new Date(a), y = new Date(b); return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate(); };

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
    + '.cs-sv .sv-bar{position:absolute;left:' + u(72) + ';right:' + u(72) + ';bottom:' + u(62) + ';display:flex;justify-content:space-between;align-items:flex-end;gap:' + u(24) + ';}'
    + '.cs-sv .sv-bar .cs-time{font-size:' + u(124) + ';margin-left:-' + u(5) + ';text-shadow:0 ' + u(6) + ' ' + u(30) + ' rgba(0,0,0,.35);}'
    + '.cs-sv .sv-bar .cs-date{font-size:' + u(22) + ';margin-top:' + u(6) + ';}'
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
    // Shared by the six data screensavers: a small clock top left, a line of text top right, quiet plates.
    + '.cs-sv .sv-head{position:absolute;left:' + u(64) + ';right:' + u(64) + ';top:' + u(48) + ';display:flex;justify-content:space-between;align-items:flex-end;gap:' + u(24) + ';}'
    + '.cs-sv .sv-head .cs-time{font-size:' + u(92) + ';margin-left:-' + u(4) + ';}.cs-sv .sv-head .cs-date{font-size:' + u(19) + ';margin-top:' + u(4) + ';color:rgba(246,239,230,.64);}'
    + '.cs-sv .cs-sum{text-align:right;font-size:' + u(20) + ';font-weight:600;color:rgba(246,239,230,.64);min-width:0;}'
    + '.cs-sv .cs-sum b{display:block;font-size:' + u(30) + ';font-weight:700;color:#F6EFE6;letter-spacing:-.02em;}'
    + '.cs-sv .cs-cap{font-size:' + u(13) + ';font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(246,239,230,.64);}'
    + '.cs-sv .cs-body{position:absolute;left:' + u(64) + ';right:' + u(64) + ';top:' + u(214) + ';bottom:' + u(56) + ';}'
    + '.cs-sv.cs-wetter{background:linear-gradient(170deg, #2C3E57 0%, #1E2A3B 55%, #171F2B 100%);}'
    + '.cs-sv .cs-wnow{display:flex;align-items:center;gap:' + u(24) + ';}'
    + '.cs-sv .cs-wnow img{width:' + u(120) + ';height:' + u(120) + ';filter:brightness(0) invert(1);}'
    + '.cs-sv .cs-wnow b{font-size:' + u(140) + ';font-weight:500;letter-spacing:-.05em;line-height:1;}'
    + '.cs-sv .cs-wnow p{font-size:' + u(22) + ';font-weight:600;color:rgba(246,239,230,.64);}.cs-sv .cs-wnow p:first-child{color:#F6EFE6;font-weight:700;}'
    + '.cs-sv .cs-wk{position:absolute;right:0;top:-' + u(160) + ';width:' + u(400) + ';display:flex;flex-direction:column;gap:' + u(4) + ';}'
    + '.cs-sv .cs-wd{display:grid;grid-template-columns:' + u(54) + ' ' + u(40) + ' ' + u(44) + ' 1fr ' + u(44) + ';align-items:center;gap:' + u(10) + ';height:' + u(44) + ';font-size:' + u(18) + ';font-weight:600;font-variant-numeric:tabular-nums;}'
    + '.cs-sv .cs-wd img{width:' + u(30) + ';height:' + u(30) + ';filter:brightness(0) invert(1);}.cs-sv .cs-wd span{color:rgba(246,239,230,.64);text-align:right;}.cs-sv .cs-wd em{font-style:normal;text-align:right;}'
    + '.cs-sv .cs-wd i{position:relative;height:' + u(8) + ';border-radius:99px;background:rgba(255,255,255,.1);}.cs-sv .cs-wd i u{position:absolute;top:0;bottom:0;border-radius:99px;background:linear-gradient(90deg, #5B8FC9, #E8B04A);}'
    + '.cs-sv .cs-curve{position:absolute;left:0;right:0;bottom:0;height:' + u(300) + ';}.cs-sv .cs-curve svg{width:100%;height:100%;display:block;overflow:visible;}'
    + '.cs-sv .cs-pk{position:absolute;transform:translate(-50%, -135%);font-size:' + u(17) + ';font-weight:700;font-variant-numeric:tabular-nums;}.cs-sv .cs-pk.cs-lo{transform:translate(-50%, 45%);}'
    + '.cs-sv .cs-hours{position:absolute;left:0;right:0;bottom:-' + u(30) + ';display:flex;justify-content:space-between;font-size:' + u(15) + ';font-weight:600;color:rgba(246,239,230,.64);}'
    + '.cs-sv.cs-linie{background:radial-gradient(100% 80% at 58% 56%, #2A2622 0%, #181512 70%);}'
    + '.cs-sv .cs-line{position:absolute;left:0;right:0;top:50%;height:' + u(6) + ';margin-top:-' + u(3) + ';border-radius:99px;background:rgba(255,255,255,.16);}'
    + '.cs-sv .cs-line u{position:absolute;left:0;top:0;bottom:0;border-radius:99px;background:#4E9E95;}'
    + '.cs-sv .cs-tick{position:absolute;top:50%;width:' + u(60) + ';margin:' + u(18) + ' 0 0 -' + u(30) + ';text-align:center;font-size:' + u(14) + ';font-weight:600;color:rgba(246,239,230,.64);font-variant-numeric:tabular-nums;}'
    + '.cs-sv .cs-now{position:absolute;top:50%;width:' + u(22) + ';height:' + u(22) + ';margin:-' + u(11) + ' 0 0 -' + u(11) + ';border-radius:50%;background:#F6EFE6;box-shadow:0 0 0 ' + u(11) + ' rgba(78,158,149,.28);}'
    + '.cs-sv .cs-ev{position:absolute;width:' + u(210) + ';margin-left:-' + u(105) + ';background:rgba(255,255,255,.07);border-radius:' + u(20) + ';padding:' + u(14) + ' ' + u(16) + ';}'
    + '.cs-sv .cs-ev.cs-up{bottom:calc(50% + ' + u(34) + ');}.cs-sv .cs-ev.cs-down{top:calc(50% + ' + u(52) + ');}.cs-sv .cs-ev.cs-past{opacity:.5;}.cs-sv .cs-ev.cs-next{background:color-mix(in srgb, #4E9E95 34%, #2a2622);}'
    + '.cs-sv .cs-ev b{display:block;font-size:' + u(17.5) + ';font-weight:700;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.cs-sv .cs-ev span{font-size:' + u(14.5) + ';font-weight:600;color:rgba(246,239,230,.64);font-variant-numeric:tabular-nums;}'
    + '.cs-sv .sv-dot{position:absolute;top:50%;width:' + u(13) + ';height:' + u(13) + ';margin:-' + u(6.5) + ' 0 0 -' + u(6.5) + ';border-radius:50%;background:#F6EFE6;}.cs-sv .sv-dot.cs-past{opacity:.5;}'
    + '.cs-sv .sv-empty{position:absolute;left:0;right:0;top:calc(50% + ' + u(70) + ');text-align:center;font-size:' + u(22) + ';font-weight:600;color:rgba(246,239,230,.64);}'
    + '.cs-sv.cs-woche{background:radial-gradient(110% 90% at 20% 0%, #26302F 0%, #171614 62%);}'
    + '.cs-sv .cs-cols{position:absolute;inset:0;display:grid;grid-template-columns:repeat(7, minmax(0, 1fr));gap:' + u(10) + ';}'
    + '.cs-sv .cs-col{background:rgba(255,255,255,.05);border-radius:' + u(24) + ';padding:' + u(16) + ' ' + u(12) + ' ' + u(14) + ';display:flex;flex-direction:column;min-width:0;overflow:hidden;}'
    + '.cs-sv .cs-col.cs-today{background:color-mix(in srgb, #4E9E95 30%, #232120);}.cs-sv .cs-col.cs-today .cs-cap{color:#F6EFE6;}'
    + '.cs-sv .cs-col .cs-n{font-size:' + u(38) + ';font-weight:600;letter-spacing:-.03em;line-height:1.05;margin-top:' + u(2) + ';font-variant-numeric:tabular-nums;}'
    + '.cs-sv .cs-cw{display:flex;align-items:center;gap:' + u(8) + ';margin-top:' + u(14) + ';font-size:' + u(16) + ';font-weight:700;font-variant-numeric:tabular-nums;min-height:' + u(30) + ';}'
    + '.cs-sv .cs-cw img{width:' + u(30) + ';height:' + u(30) + ';filter:brightness(0) invert(1);}.cs-sv .cs-cw span{color:rgba(246,239,230,.64);font-weight:600;}'
    + '.cs-sv .cs-li{margin-top:' + u(16) + ';display:flex;flex-direction:column;gap:' + u(8) + ';}'
    + '.cs-sv .cs-e{border-radius:' + u(14) + ';padding:' + u(9) + ' ' + u(10) + ';background:rgba(255,255,255,.07);border-left:' + u(4) + ' solid var(--cs-c, #8a857d);}'
    + '.cs-sv .cs-e b{font-size:' + u(14.5) + ';font-weight:700;line-height:1.2;overflow:hidden;overflow-wrap:break-word;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}.cs-sv .cs-e span{display:block;font-size:' + u(13) + ';font-weight:600;color:rgba(246,239,230,.64);font-variant-numeric:tabular-nums;}'
    + '.cs-sv .cs-none{margin-top:' + u(16) + ';font-size:' + u(14) + ';font-weight:600;color:rgba(246,239,230,.34);}'
    + '.cs-sv.cs-musik{background:linear-gradient(135deg, #3A2F45 0%, #2D2540 50%, #162036 100%);}'
    + '.cs-sv .cs-blur{position:absolute;inset:-12%;background-size:cover;background-position:center;filter:blur(' + u(60) + ') saturate(1.3) brightness(.55);}'
    + '.cs-sv .cs-cover{position:absolute;left:' + u(80) + ';top:50%;width:' + u(440) + ';height:' + u(440) + ';margin-top:-' + u(220) + ';border-radius:' + u(34) + ';overflow:hidden;background:rgba(255,255,255,.08) center/cover no-repeat;box-shadow:0 ' + u(40) + ' ' + u(80) + ' -' + u(30) + ' rgba(0,0,0,.7);}'
    + '.cs-sv .cs-corner{position:absolute;right:' + u(80) + ';top:' + u(54) + ';text-align:right;}.cs-sv .cs-corner .cs-time{font-size:' + u(72) + ';}.cs-sv .cs-corner .cs-date{font-size:' + u(18) + ';margin-top:' + u(4) + ';}'
    + '.cs-sv .cs-meta{position:absolute;left:' + u(590) + ';right:' + u(80) + ';top:50%;transform:translateY(-46%);min-width:0;}'
    + '.cs-sv .cs-meta h2{font-size:' + u(58) + ';font-weight:700;letter-spacing:-.03em;line-height:1.05;margin-top:' + u(12) + ';overflow-wrap:anywhere;}.cs-sv .cs-meta h3{font-size:' + u(28) + ';font-weight:600;color:rgba(246,239,230,.64);margin-top:' + u(10) + ';letter-spacing:-.01em;}'
    + '.cs-sv .cs-prog{height:' + u(8) + ';border-radius:99px;background:rgba(255,255,255,.16);margin-top:' + u(52) + ';position:relative;}.cs-sv .cs-prog u{position:absolute;left:0;top:0;bottom:0;border-radius:99px;background:#F6EFE6;}'
    + '.cs-sv .cs-tt{display:flex;justify-content:space-between;font-size:' + u(16) + ';font-weight:600;color:rgba(246,239,230,.64);margin-top:' + u(10) + ';font-variant-numeric:tabular-nums;}'
    + '.cs-sv.cs-energie{background:radial-gradient(110% 80% at 50% 46%, #252B2A 0%, #161918 72%);}'
    + '.cs-sv .cs-flow{position:absolute;left:0;right:0;top:' + u(70) + ';bottom:' + u(200) + ';}'
    // A node hangs on its point by the centre of its circle (--cs-r = the circle's radius); the text follows below.
    + '.cs-sv .cs-fn{position:absolute;--cs-r:' + u(56) + ';transform:translate(-50%, calc(var(--cs-r) * -1));text-align:center;width:' + u(240) + ';}'
    + '.cs-sv .cs-fn.cs-house{--cs-r:' + u(75) + ';}'
    + '.cs-sv .cs-fn i{display:grid;place-items:center;margin:0 auto;border-radius:50%;border:' + u(3) + ' solid var(--cs-c);background:#1B1F1E;width:' + u(112) + ';height:' + u(112) + ';}'
    + '.cs-sv .cs-fn.cs-house i{width:' + u(150) + ';height:' + u(150) + ';}.cs-sv .cs-fn svg{width:44%;height:44%;}'
    + '.cs-sv .cs-fn b{display:block;font-size:' + u(30) + ';font-weight:700;letter-spacing:-.02em;font-variant-numeric:tabular-nums;line-height:1.1;margin-top:' + u(12) + ';}.cs-sv .cs-fn span{font-size:' + u(15) + ';font-weight:600;color:rgba(246,239,230,.64);}'
    + '.cs-sv .cs-fl{position:absolute;top:64%;height:0;margin-top:-' + u(2.5) + ';border-top:' + u(5) + ' dotted var(--cs-c);}'
    + '.cs-sv .cs-fl.cs-l{left:calc(18% + ' + u(74) + ');right:calc(50% + ' + u(93) + ');}.cs-sv .cs-fl.cs-r{left:calc(50% + ' + u(93) + ');right:calc(18% + ' + u(74) + ');}'
    + '.cs-sv .cs-fl.cs-v{left:50%;width:0;height:auto;margin:0 0 0 -' + u(2.5) + ';border-top:0;border-left:' + u(5) + ' dotted var(--cs-c);top:calc(11% + ' + u(140) + ');bottom:calc(36% + ' + u(93) + ');}'
    + '.cs-sv .cs-bal{position:absolute;left:' + u(64) + ';right:' + u(64) + ';bottom:' + u(52) + ';display:grid;grid-template-columns:repeat(4, minmax(0, 1fr));gap:' + u(14) + ';}'
    + '.cs-sv .cs-bal div{background:rgba(255,255,255,.055);border-radius:' + u(22) + ';padding:' + u(16) + ' ' + u(22) + ' ' + u(18) + ';min-width:0;}'
    + '.cs-sv .cs-bal b{display:block;font-size:' + u(28) + ';font-weight:700;margin-top:' + u(4) + ';letter-spacing:-.02em;font-variant-numeric:tabular-nums;}'
    + '.cs-sv.cs-ruhe{background:radial-gradient(90% 90% at 12% 8%, #22302D 0%, #191714 58%);}'
    + '.cs-sv .cs-left{position:absolute;left:' + u(80) + ';top:0;bottom:0;width:' + u(560) + ';display:flex;flex-direction:column;justify-content:center;}'
    + '.cs-sv .cs-left .cs-time{font-size:' + u(172) + ';margin-left:-' + u(8) + ';}.cs-sv .cs-left .cs-date{font-size:' + u(25) + ';margin-top:' + u(8) + ';color:rgba(246,239,230,.64);}'
    + '.cs-sv .cs-say{font-size:' + u(38) + ';font-weight:700;letter-spacing:-.02em;margin-top:' + u(56) + ';}.cs-sv .cs-say small{display:block;font-size:' + u(20) + ';font-weight:600;color:rgba(246,239,230,.64);margin-top:' + u(6) + ';letter-spacing:0;}'
    + '.cs-sv .cs-ppl{display:flex;flex-wrap:wrap;gap:' + u(10) + ';margin-top:' + u(44) + ';}'
    + '.cs-sv .cs-p{display:flex;align-items:center;gap:' + u(10) + ';padding:' + u(7) + ' ' + u(16) + ' ' + u(7) + ' ' + u(7) + ';border-radius:999px;background:rgba(255,255,255,.07);font-size:' + u(16) + ';font-weight:600;}.cs-sv .cs-p.cs-away{opacity:.55;}'
    + '.cs-sv .cs-p i{width:' + u(30) + ';height:' + u(30) + ';border-radius:50%;display:grid;place-items:center;font-style:normal;font-size:' + u(14) + ';font-weight:700;color:#1b1916;background:#E8B04A;}.cs-sv .cs-p.cs-away i{background:#9b958c;}'
    + '.cs-sv .cs-right{position:absolute;right:' + u(80) + ';top:0;bottom:0;width:' + u(400) + ';display:flex;flex-direction:column;justify-content:center;gap:' + u(12) + ';}'
    + '.cs-sv .cs-it{display:flex;align-items:center;gap:' + u(16) + ';background:rgba(255,255,255,.06);border-radius:' + u(22) + ';padding:' + u(15) + ' ' + u(18) + ';min-width:0;}'
    + '.cs-sv .cs-it i{width:' + u(14) + ';height:' + u(14) + ';border-radius:50%;flex:none;background:var(--cs-c);}'
    + '.cs-sv .cs-it b{display:block;font-size:' + u(18) + ';font-weight:700;line-height:1.25;}.cs-sv .cs-it span{font-size:' + u(15) + ';font-weight:600;color:rgba(246,239,230,.64);}'
    // Narrow boxes (portrait tablet): the big time gives way.
    + '@container (aspect-ratio < 1){.cs-sv .cs-top{flex-direction:column;}.cs-sv .cs-wx{text-align:left;padding-top:0;}.cs-sv .cs-wx .cs-t{justify-content:flex-start;}'
    + '.cs-sv .cs-top .cs-time{font-size:' + u(150) + ';}.cs-sv .cs-words{font-size:' + u(104) + ';}.cs-sv .sv-bar{flex-direction:column;align-items:flex-start;}.cs-sv .cs-name{text-align:left;}'
    // Weather: the days go under the current weather. Week: seven rows instead of seven columns.
    + '.cs-sv .cs-wk{position:static;width:auto;margin-top:' + u(44) + ';}.cs-sv.cs-wetter .cs-body{display:flex;flex-direction:column;}.cs-sv .cs-wnow{order:-1;}'
    + '.cs-sv .cs-cols{grid-template-columns:minmax(0, 1fr);grid-auto-rows:minmax(0, 1fr);}'
    + '.cs-sv .cs-col{flex-direction:row;align-items:center;gap:' + u(16) + ';padding:' + u(8) + ' ' + u(22) + ';}.cs-sv .cs-col .cs-cap{width:' + u(58) + ';flex:none;}'
    + '.cs-sv .cs-col .cs-n{width:' + u(52) + ';flex:none;margin:0;}.cs-sv .cs-cw{width:' + u(118) + ';flex:none;margin:0;}'
    + '.cs-sv .cs-li{flex-direction:row;flex:1;min-width:0;margin:0;}.cs-sv .cs-e{flex:0 1 ' + u(190) + ';min-width:0;}.cs-sv .cs-none{margin:0;}'
    // Day line: narrower cards. Music and the house at rest: one under the other.
    + '.cs-sv .cs-ev{width:' + u(132) + ';margin-left:-' + u(66) + ';padding:' + u(10) + ' ' + u(12) + ';}.cs-sv .cs-ev b{font-size:' + u(15) + ';}.cs-sv .cs-ev span{font-size:' + u(13) + ';}'
    + '.cs-sv .cs-cover{left:50%;top:' + u(210) + ';margin:0 0 0 -' + u(220) + ';}.cs-sv .cs-meta{left:' + u(80) + ';top:' + u(710) + ';transform:none;}'
    + '.cs-sv .cs-left{position:static;width:auto;display:block;padding:' + u(170) + ' ' + u(80) + ' 0;}'
    + '.cs-sv .cs-right{position:static;width:auto;padding:' + u(56) + ' ' + u(80) + ' 0;}}';

  var bar = function (ctx, name, sub) {
    var wx = ctx.wx;
    return '<div class="cs-shade"></div><div class="sv-bar"><div><div class="cs-time">' + esc(timeText(ctx.now, ctx.hass)) + '</div>'
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
  var head = function (ctx, title, sub) {
    return '<div class="sv-head"><div><div class="cs-time">' + esc(timeText(ctx.now, ctx.hass)) + '</div><div class="cs-date">' + esc(dateText(ctx.now)) + '</div></div>'
      + (title ? '<div class="cs-sum"><b>' + esc(title) + '</b>' + esc(sub || '') + '</div>' : '') + '</div>';
  };
  var clockOf = function (ts) { return hm(ts); };
  // Now, the coming 24 hours as a curve with the rain under it, and the coming days.
  DRAW.wetter = function (ctx) {
    var wx = ctx.wx;
    if (!wx) return DRAW.himmel(ctx);
    var hours = (ctx.hourly || []).slice(0, 24), days = (ctx.daily || []).slice(0, 5);
    var W = 1052, H = 300, base = H - 40;
    var curve = '';
    var temps = hours.map(function (x) { return Number(x.temperature); }).filter(isFinite);
    if (temps.length >= 6) {
      var lo = Math.min.apply(null, temps), hi = Math.max.apply(null, temps), span = Math.max(1, hi - lo);
      var X = function (i) { return i / (hours.length - 1) * W; }, Y = function (t) { return 34 + (1 - (t - lo) / span) * (base - 110); };
      var d = '', rain = '', maxR = Math.max.apply(null, hours.map(function (x) { return Number(x.precipitation) || 0; }).concat([0]));
      hours.forEach(function (x, i) {
        var t = Number(x.temperature);
        if (isFinite(t)) d += (d ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(t).toFixed(1);
        var r = Number(x.precipitation) || 0;
        if (r > 0 && maxR > 0) {
          var bh = 12 + r / maxR * 52;
          rain += '<rect x="' + (X(i) - 11).toFixed(1) + '" y="' + (base - bh).toFixed(1) + '" width="22" height="' + bh.toFixed(1) + '" rx="6" fill="#5B8FC9"/>';
        }
      });
      var iLo = temps.indexOf(lo), iHi = temps.indexOf(hi);
      var pct = function (x) { return Math.min(97, Math.max(3, x / W * 100)).toFixed(1); };
      curve = '<div class="cs-curve"><svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">'
        + '<defs><linearGradient id="cs-tf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E8B04A" stop-opacity=".36"/><stop offset="1" stop-color="#E8B04A" stop-opacity="0"/></linearGradient></defs>'
        + '<path d="' + d + 'L' + W + ' ' + base + 'L0 ' + base + 'Z" fill="url(#cs-tf)"/>' + rain
        + '<path d="' + d + '" fill="none" stroke="#E8B04A" stroke-width="3.5" stroke-linecap="round" vector-effect="non-scaling-stroke"/>'
        + '<line x1="0" y1="' + base + '" x2="' + W + '" y2="' + base + '" stroke="rgba(255,255,255,.22)" stroke-width="2" vector-effect="non-scaling-stroke"/>'
        + '</svg>'
        + '<b class="cs-pk" style="left:' + pct(X(iHi)) + '%;top:' + (Y(hi) / H * 100).toFixed(1) + '%">' + Math.round(hi) + '°</b>'
        + (iLo !== iHi ? '<b class="cs-pk cs-lo" style="left:' + pct(X(iLo)) + '%;top:' + (Y(lo) / H * 100).toFixed(1) + '%">' + Math.round(lo) + '°</b>' : '')
        + '<div class="cs-hours">' + [0, 6, 12, 18, 23].filter(function (i) { return hours[i] && hours[i].datetime; }).map(function (i) {
          return '<span>' + (i ? esc(clockOf(Date.parse(hours[i].datetime))) : esc(T('Jetzt'))) + '</span>';
        }).join('') + '</div></div>';
    }
    var los = days.map(function (x) { return Number(x.templow); }).filter(isFinite), his = days.map(function (x) { return Number(x.temperature); }).filter(isFinite);
    var mn = Math.min.apply(null, los.concat(his)), mx = Math.max.apply(null, his.concat(los)), sp = Math.max(1, mx - mn);
    var week = days.length && his.length ? '<div class="cs-wk">' + days.map(function (x) {
      var lo2 = Number(x.templow), hi2 = Number(x.temperature);
      var bar = isFinite(lo2) && isFinite(hi2) ? '<i><u style="left:' + ((lo2 - mn) / sp * 100).toFixed(0) + '%;right:' + ((mx - hi2) / sp * 100).toFixed(0) + '%"></u></i>' : '<i></i>';
      return '<div class="cs-wd"><b>' + esc(dayName(Date.parse(x.datetime), true)) + '</b><img src="' + esc(wxIcon(x.condition)) + '" alt=""><span>' + (isFinite(lo2) ? Math.round(lo2) + '°' : '') + '</span>'
        + bar + '<em>' + (isFinite(hi2) ? Math.round(hi2) + '°' : '') + '</em></div>';
    }).join('') + '</div>' : '';
    return '<div class="cs-in">' + head(ctx) + '<div class="cs-body">' + week
      + '<div class="cs-wnow"><img src="' + esc(wx.icon) + '" alt=""><b>' + (wx.temp != null ? wx.temp + '°' : '') + '</b><div><p>' + esc(wx.text) + '</p></div></div>'
      + curve + '</div></div>';
  };
  // The day as one line from 6 to 24: what was, where now is, what comes; the next appointment big at the top.
  DRAW.linie = function (ctx) {
    var now = +ctx.now, d0 = new Date(ctx.now); d0.setHours(0, 0, 0, 0);
    var from = +d0 + 6 * 3600000, to = +d0 + 24 * 3600000;
    var pos = function (t) { return Math.max(0, Math.min(100, (t - from) / (to - from) * 100)); };
    var today = (ctx.events || []).filter(function (e) { return !e.allDay && sameDay(e.start, now) && e.start >= from; }).slice(0, 6);
    var next = (ctx.events || []).filter(function (e) { return !e.allDay && e.start > now; })[0] || null;
    var mins = next ? Math.round((next.start - now) / 60000) : null;
    var inText = next ? (mins >= 60 ? T('in {h} Std. {m} Min.'.replace('{h}', Math.floor(mins / 60)).replace('{m}', mins % 60)) : T('in {m} Min.'.replace('{m}', mins))) : '';
    var whenNext = next && !sameDay(next.start, now) ? dayName(next.start) + ' ' + clockOf(next.start) : inText;
    var out = '<div class="cs-in">' + head(ctx, next ? next.title : T('Heute nichts mehr'), next ? whenNext : '')
      + '<div class="cs-body"><div class="cs-line"><u style="width:' + pos(now).toFixed(1) + '%"></u></div>';
    [6, 9, 12, 15, 18, 21, 24].forEach(function (h) { out += '<div class="cs-tick" style="left:' + ((h - 6) / 18 * 100).toFixed(2) + '%">' + h + '</div>'; });
    var last = { up: -100, down: -100 };
    today.forEach(function (e, i) {
      var p = pos(e.start), past = (e.end || e.start) < now;
      // Above and below in turn; two on the same side keep their distance.
      var side = i % 2 ? 'down' : 'up';
      if (p - last[side] < 19) side = side === 'up' ? 'down' : 'up';
      if (p - last[side] < 19) { out += '<div class="sv-dot' + (past ? ' cs-past' : '') + '" style="left:' + p.toFixed(1) + '%"></div>'; return; }
      last[side] = p;
      var left = Math.max(10, Math.min(90, p));
      out += '<div class="sv-dot' + (past ? ' cs-past' : '') + '" style="left:' + p.toFixed(1) + '%"></div>'
        + '<div class="cs-ev cs-' + side + (past ? ' cs-past' : '') + (e === next ? ' cs-next' : '') + '" style="left:' + left.toFixed(1) + '%"><b data-no-i18n>' + esc(e.title) + '</b><span>'
        + esc(clockOf(e.start) + (e.end ? ' – ' + clockOf(e.end) : '')) + '</span></div>';
    });
    if (now >= from) out += '<div class="cs-now" style="left:' + pos(now).toFixed(1) + '%"></div>';
    if (!today.length) out += '<div class="sv-empty">' + esc(T('Heute keine Termine')) + '</div>';
    return out + '</div></div>';
  };
  // Seven days side by side: weather, appointments, waste. Today stands out.
  var TONES = ['#4E9E95', '#5B8FC9', '#6AAE78', '#DE8A4E', '#E8B04A'];
  var norm = function (s) { return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase(); };
  DRAW.woche = function (ctx) {
    var d0 = new Date(ctx.now); d0.setHours(0, 0, 0, 0);
    var ev = ctx.events || [], bins = ctx.bins || [], daily = ctx.daily || [];
    var nEv = 0, nBin = 0, cols = '';
    for (var i = 0; i < 7; i++) {
      var day = +d0 + i * 86400000, items = [];
      // A waste integration gives a pickup twice, as a calendar event and as a sensor (#171): the pickup line wins.
      var binNames = bins.filter(function (b) { return b.days === i; }).map(function (b) { return norm(b.label); });
      ev.filter(function (e) { return sameDay(e.start, day) && (i || e.allDay || (e.end || e.start) >= +ctx.now) && binNames.indexOf(norm(e.title)) < 0; }).slice(0, 4).forEach(function (e, j) {
        items.push('<div class="cs-e" style="--cs-c:' + TONES[(i + j) % TONES.length] + '"><b data-no-i18n>' + esc(e.title) + '</b><span>' + esc(e.allDay ? T('ganztägig') : clockOf(e.start)) + '</span></div>');
        nEv++;
      });
      bins.filter(function (b) { return b.days === i; }).slice(0, 2).forEach(function (b) {
        items.push('<div class="cs-e"><b data-no-i18n>' + esc(b.label) + '</b><span>' + esc(T('Abholung')) + '</span></div>');
        nBin++;
      });
      var f = daily.filter(function (x) { return sameDay(Date.parse(x.datetime), day); })[0];
      var hi = f ? Number(f.temperature) : NaN, lo = f ? Number(f.templow) : NaN;
      cols += '<div class="cs-col' + (i ? '' : ' cs-today') + '"><div class="cs-cap">' + esc(i ? dayName(day, true) : T('Heute')) + '</div><div class="cs-n">' + new Date(day).getDate() + '</div>'
        + '<div class="cs-cw">' + (f ? '<img src="' + esc(wxIcon(f.condition)) + '" alt="">' + (isFinite(hi) ? Math.round(hi) + '°' : '') + (isFinite(lo) ? '<span>' + Math.round(lo) + '°</span>' : '') : '') + '</div>'
        + (items.length ? '<div class="cs-li">' + items.join('') + '</div>' : '<div class="cs-none">' + esc(T('Nichts geplant')) + '</div>') + '</div>';
    }
    var sub = [nEv === 1 ? T('1 Termin') : T('{n} Termine'.replace('{n}', nEv)), nBin === 1 ? T('1 Abholung') : T('{n} Abholungen'.replace('{n}', nBin))].join(' · ');
    return '<div class="cs-in">' + head(ctx, T('Diese Woche'), sub) + '<div class="cs-body"><div class="cs-cols">' + cols + '</div></div></div>';
  };
  // What is playing, big with its cover; the background is the cover out of focus.
  var mmss = function (sec) { var s2 = Math.max(0, Math.round(sec)); return Math.floor(s2 / 60) + ':' + String(s2 % 60).padStart(2, '0'); };
  DRAW.musik = function (ctx) {
    var m = ctx.media;
    if (!m) return DRAW.himmel(ctx);
    var pct = m.dur && m.pos != null ? Math.max(0, Math.min(100, m.pos / m.dur * 100)) : null;
    var pic = m.cover ? 'background-image:url(&quot;' + esc(m.cover) + '&quot;)' : '';
    return (m.cover ? '<div class="cs-blur" style="' + pic + '"></div>' : '') + '<div class="cs-in"><div class="cs-cover" style="' + pic + '"></div>'
      + '<div class="cs-corner"><div class="cs-time">' + esc(timeText(ctx.now, ctx.hass)) + '</div><div class="cs-date">' + esc(dateText(ctx.now)) + '</div></div>'
      + '<div class="cs-meta"><div class="cs-cap" data-no-i18n>' + esc(m.where) + '</div><h2 data-no-i18n>' + esc(m.title) + '</h2>' + (m.artist ? '<h3 data-no-i18n>' + esc(m.artist) + '</h3>' : '')
      + (pct != null ? '<div class="cs-prog"><u style="width:' + pct.toFixed(1) + '%"></u></div><div class="cs-tt"><span>' + mmss(m.pos) + '</span><span>' + mmss(m.dur) + '</span></div>' : '')
      + '</div></div>';
  };
  // Where the power goes right now: sun, battery and grid around the house, a dotted line for every flow.
  var GLYPH = {
    sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.5" fill="currentColor"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/></g></svg>',
    house: '<svg viewBox="0 0 24 24"><path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" fill="currentColor"/></svg>',
    battery: '<svg viewBox="0 0 24 24"><rect x="6" y="5" width="12" height="16" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><rect x="9" y="11" width="6" height="7" rx="1" fill="currentColor"/><path d="M10 3h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    grid: '<svg viewBox="0 0 24 24"><path d="M12 3 8 21M12 3l4 18M6 9h12M7 15h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  };
  DRAW.energie = function (ctx) {
    var e = ctx.energy;
    if (!e) return DRAW.himmel(ctx);
    var node = function (cls, x, y, glyph, color, value, label) {
      return '<div class="cs-fn ' + cls + '" style="left:' + x + '%;top:' + y + '%;--cs-c:' + color + ';color:' + color + '"><i>' + GLYPH[glyph] + '</i><b style="color:#F6EFE6">' + esc(value) + '</b><span>' + esc(label) + '</span></div>';
    };
    // A dotted line from rim to rim, drawn only while power flows: cs-v sun–house, cs-l battery–house, cs-r house–grid.
    var flow = function (cls, color, on) { return on ? '<div class="cs-fl ' + cls + '" style="--cs-c:' + color + '"></div>' : ''; };
    var out = '<div class="cs-in">' + head(ctx) + '<div class="cs-flow">';
    if (e.hasSolar) out += flow('cs-v', '#E8B04A', (e.solar || 0) > 20) + node('cs-sun', 50, 11, 'sun', '#E8B04A', kw(e.solar || 0), T('Sonne'));
    if (e.hasBattery) out += flow('cs-l', '#4E9E95', Math.abs(e.battery || 0) > 20)
      + node('cs-bat', 18, 64, 'battery', '#4E9E95', e.soc != null ? e.soc + ' %' : kw(e.battery || 0),
        Math.abs(e.battery || 0) <= 20 ? T('Akku') : (e.battery > 0 ? T('Akku gibt ab') : T('Akku lädt')) + (e.soc != null ? ' · ' + kw(e.battery) : ''));
    out += flow('cs-r', '#5B8FC9', Math.abs(e.grid) > 20)
      + node('cs-grid', 82, 64, 'grid', '#5B8FC9', kw(e.grid), Math.abs(e.grid) <= 20 ? T('Netz') : e.grid > 0 ? T('aus dem Netz') : T('ins Netz'))
      + node('cs-house', 50, 64, 'house', '#F6EFE6', kw(e.house), T('Haus verbraucht')) + '</div>';
    var own = e.house > 0 ? Math.max(0, Math.min(100, Math.round((e.house - Math.max(0, e.grid)) / e.house * 100))) : null;
    var tiles = [[T('Verbrauch jetzt'), kw(e.house)]];
    if (e.hasSolar) tiles.push([T('Erzeugung jetzt'), kw(e.solar || 0)]);
    tiles.push([e.grid > 0 ? T('Bezug') : T('Einspeisung'), kw(e.grid)]);
    if (own != null) tiles.push([T('Eigener Strom'), own + ' %']);
    return out + '<div class="cs-bal" style="grid-template-columns:repeat(' + tiles.length + ', minmax(0, 1fr))">' + tiles.map(function (t) {
      return '<div><span class="cs-cap">' + esc(t[0]) + '</span><b>' + esc(t[1]) + '</b></div>';
    }).join('') + '</div></div>';
  };
  // The time, one sentence about the house, who is home, and only what asks for someone.
  var TONE_C = { bad: '#D35A4E', warn: '#DE8A4E', info: '#5B8FC9' };
  DRAW.ruhe = function (ctx) {
    var rows = (ctx.bell || []).slice(0, 5), people = ctx.people || [];
    var n = rows.filter(function (r) { return r.tone !== 'info'; }).length;
    var say = !rows.length ? T('Alles ruhig') : n ? T('Fast alles ruhig') : T('Alles ruhig');
    var small = !rows.length ? T('Nichts braucht dich') : n === 1 ? T('Eine Sache braucht dich') : n > 1 ? T('{n} Dinge brauchen dich'.replace('{n}', n)) : T('Zur Kenntnis');
    return '<div class="cs-in"><div class="cs-left"><div class="cs-time">' + esc(timeText(ctx.now, ctx.hass)) + '</div><div class="cs-date">' + esc(dateText(ctx.now)) + '</div>'
      + '<div class="cs-say">' + esc(say) + '<small>' + esc(small) + '</small></div>'
      + (people.length ? '<div class="cs-ppl">' + people.map(function (p) {
        return '<div class="cs-p' + (p.home ? '' : ' cs-away') + '"><i data-no-i18n>' + esc(p.name.charAt(0).toUpperCase()) + '</i><span data-no-i18n>' + esc(p.name) + '</span></div>';
      }).join('') + '</div>' : '') + '</div>'
      + (rows.length ? '<div class="cs-right">' + rows.map(function (r) {
        return '<div class="cs-it" style="--cs-c:' + TONE_C[r.tone] + '"><i></i><div><b>' + esc(r.label) + '</b>' + (r.sub ? '<span data-no-i18n>' + esc(r.sub) + '</span>' : '') + '</div></div>';
      }).join('') + '</div>' : '') + '</div>';
  };
  // What a preview shows where the house has nothing to show right now (nothing playing, energy not set up, no
  // appointments, no forecast): an example, so every screensaver can be looked at before it is picked.
  S.sample = function (ctx) {
    var now = +ctx.now, d0 = new Date(now); d0.setHours(0, 0, 0, 0);
    var at = function (day, h, m) { return +d0 + day * 86400000 + h * 3600000 + (m || 0) * 60000; };
    if (!ctx.wx) ctx.wx = { temp: 11, text: T('Teils bewölkt'), icon: '/casora_assets/weather/partly-cloudy-day-fill.svg' };
    if (!ctx.hourly.length) ctx.hourly = Array.from({ length: 24 }, function (_, i) {
      return { datetime: new Date(now + i * 3600000).toISOString(), temperature: 7.5 + Math.cos((new Date(now + i * 3600000).getHours() - 15) / 24 * 2 * Math.PI) * 4, precipitation: [0, 0, 0.4, 1.3, 0.8, 0.2][i] || 0 };
    });
    if (!ctx.daily.length) ctx.daily = ['partlycloudy', 'rainy', 'cloudy', 'sunny', 'sunny', 'rainy', 'partlycloudy'].map(function (c, i) {
      return { datetime: new Date(at(i, 12)).toISOString(), condition: c, temperature: [11, 9, 8, 12, 13, 10, 9][i], templow: [4, 5, 3, 2, 4, 6, 5][i] };
    });
    if (!ctx.events.length) ctx.events = [[0, 8, 30, 45, 'Arzttermin'], [0, 12, 30, 60, 'Mittagessen'], [0, 18, 30, 90, 'Einkaufen'], [0, 20, 45, 75, 'Kino'], [1, 10, 0, 120, 'Einkaufen'], [4, 20, 15, 135, 'Kino'], [5, 10, 30, 150, 'Mittagessen']]
      .map(function (e) { return { title: T(e[4]), start: at(e[0], e[1], e[2]), end: at(e[0], e[1], e[2]) + e[3] * 60000, allDay: false }; });
    if (!ctx.media) ctx.media = { title: 'Golden Hour', artist: 'Casora', where: T('Wohnzimmer'), cover: '', dur: 228, pos: 87 };
    if (!ctx.energy) ctx.energy = { solar: 3240, grid: -1180, battery: -640, soc: 72, hasSolar: true, hasBattery: true, house: 1420 };
    return ctx;
  };
  S.context = function (o) {
    o = o || {};
    var hass = o.hass || hassOf(), now = o.now || new Date(), vars = o.vars || {};
    var dark = !!(hass && hass.themes && hass.themes.darkMode);
    var kind = o.kind || '';
    var need = function (list) { return !kind || list.indexOf(kind) > -1; };
    var cals = o.events === undefined && need(['linie', 'woche']) ? S.calendars(hass) : [];
    return { now: now, hass: hass, vars: vars, dark: dark, sun: o.sun !== undefined ? o.sun : S.sunTimes(hass, now),
      wx: o.wx !== undefined ? o.wx : S.weather(hass, vars.weather_entity), rooms: o.rooms || S.rooms(o.config, hass, dark, { url: o.photoUrl, only: vars.casora_screensaver_photos }),
      // Asked for only when the screensaver on show needs it.
      hourly: o.hourly !== undefined ? o.hourly : need(['wetter']) ? S.forecast(hass, vars.weather_entity, 'hourly') : [],
      daily: o.daily !== undefined ? o.daily : need(['wetter', 'woche']) ? S.forecast(hass, vars.weather_entity, 'daily') : [],
      events: o.events !== undefined ? o.events : cals.length ? S.events(hass, cals, 8) : [],
      bins: o.bins !== undefined ? o.bins : need(['woche']) ? S.waste(hass) : [],
      media: o.media !== undefined ? o.media : need(['musik']) ? S.playing(hass) : null,
      energy: o.energy !== undefined ? o.energy : need(['energie']) ? S.energy(hass) : null,
      bell: o.bell !== undefined ? o.bell : need(['ruhe']) ? S.bell() : [],
      people: o.people !== undefined ? o.people : need(['ruhe']) ? S.people(hass) : [] };
  };
  // „mix“ shows one after the other, five minutes each.
  S.kindAt = function (kind, now) {
    var ids = S.KINDS.map(function (k) { return k.id; });
    if (kind === 'mix') return ids[Math.floor(+now / 300000) % ids.length];
    return ids.indexOf(kind) === -1 ? ids[0] : kind;
  };
  S.html = function (kind, ctx) {
    var k = S.kindAt(kind, ctx.now);
    // Nothing to show (no weather entity, nothing playing, energy not set up): the sky, with its own look.
    if ((k === 'wetter' && !ctx.wx) || (k === 'musik' && !ctx.media) || (k === 'energie' && !ctx.energy)) k = 'himmel';
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
      var want = typeof o.kind === 'function' ? o.kind() : kind;
      var base = (typeof o.context === 'function' ? o.context() : o.context) || {};
      var ctx = S.context(Object.assign({}, base, { kind: S.kindAt(want, base.now || new Date()) }));
      if (o.sample) ctx = S.sample(ctx);
      var html = S.html(want, ctx);
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
    // Data that arrives later (forecast, calendar) repaints at once.
    listeners.push(update);
    return { update: update, destroy: function () { clearInterval(timer); listeners.splice(listeners.indexOf(update), 1); host.innerHTML = ''; } };
  };

  // The settings of the dashboard: the first value found on a view's hero card.
  S.vars = function (cfg) {
    var out = {}, keys = ['casora_screensaver', 'casora_screensaver_kind', 'casora_screensaver_calendar', 'casora_screensaver_photos', 'weather_entity'];
    ((cfg && cfg.views) || []).forEach(function (v) {
      var vars = ((((v.cards || [])[0]) || {}).variables) || {};
      keys.forEach(function (k) { if ((out[k] == null || out[k] === '' || (Array.isArray(out[k]) && !out[k].length)) && vars[k] != null && vars[k] !== '') out[k] = vars[k]; });
    });
    return out;
  };
  S.minutes = function (v) { var n = parseFloat(v); return isFinite(n) && n > 0 ? Math.min(n, 240) : 0; };
  // ── On the dashboard ─────────────────────────────────────────────────────
  if (!window.document || window.document.nodeType !== 9 || S._booted) return;
  S._booted = true;
  var FORCE = /[?&]casora_saver=1/.test(location.search), OFF = /[?&]casora_saver=0/.test(location.search);
  // Wall tablets only, never a phone held sideways: the same test as „Return to Home when idle“ (casora-core.js).
  var isTablet = function () { return !!(window.casoraIsWallTablet && window.casoraIsWallTablet()); };
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
    if (!mins || (!FORCE && !isTablet())) { if (layer) hide(); bump(); return; }
    // Never over an open popup: someone is reading it.
    if (window.casoraPopup && window.casoraPopup.surface) { if (layer) hide(); bump(); return; }
    if (!layer && Date.now() - lastAct >= mins * 60000) show(cfg);
  }, 5000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden && !layer) bump(); });
})();
