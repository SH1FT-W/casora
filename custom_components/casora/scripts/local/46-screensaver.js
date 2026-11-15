// ── Screensavers for wall tablets ───────────────────────────────────────────────────────────────────────────────
// After some minutes without a touch a tablet shows a screensaver over the dashboard; a touch brings the dashboard
// back. Set per dashboard in the Studio (Settings › Screensaver): casora_screensaver (minutes, empty = off),
// casora_screensaver_kind (which one, „mix“ = one after the other) and the ones listed below. Like
// casora_idle_home they ride in the hero card of each view.
// Twelve screensavers: sky, drawn landscapes, room photos, word clock, weather, day line, week, music, energy flow,
// the house at rest, cameras and a month calendar. Every one is drawn from what the house knows (time, sun, weather and its forecast, calendars,
// waste dates, the playing media player, the energy settings, the bell, the dashboard's room photos); nothing is
// loaded from another server. One that has nothing to show (no music playing, energy not set up) shows the sky; in the
// alternation („mix“, the kinds picked in casora_screensaver_mix) it is skipped instead. The same drawing serves the Studio's preview (mount into any box): all sizes are
// container units, so it looks the same small and full screen. On the tablet the content wanders a few pixels three
// times a minute, never together with the clock's digits, so nothing burns in (casora_screensaver_wander, false = off).
//   window._casoraSaver.KINDS                  → [{ id, label, needs }]
//   window._casoraSaver.words(lang, h, m)      → the time as people say it: [{ t, acc }] lines (nine languages)
//   window._casoraSaver.dayShare(now, rise, set) → 0…1 share of the daylight that has passed, null at night
//   window._casoraSaver.sky(share)             → the sky's colours for that share (null = night)
//   window._casoraSaver.landSvg(scene, w, h)   → one drawn landscape (window._casoraSaver.SCENES)
//   window._casoraSaver.html(kind, ctx)        → the screensaver's markup
//   window._casoraSaver.mount(host, kind, o)   → draws into host and keeps it current; returns { update, destroy, kind }
//   window._casoraSaver.pool(vars, has)        → the kinds that take turns in „mix“ (picked, with something to show)
//   window._casoraSaver.kindAt(kind, now, pool) → the kind on show
//   window._casoraSaver.canStart() / start()   → start by hand (the dashboard's ⋯ menu), only where one may start
//   window.casoraScreensaver.wake(reason)      → ends the screensaver from outside (presence, doorbell); true if one was on show
//   window._casoraSaver.wake()                 → end it from outside (doorbell ring, 52-klingel-moment.js)
// Studio settings beside the three above: casora_screensaver_mix (kinds that alternate, none = all),
// casora_screensaver_cameras (none = automatic: the real cameras) / _calendars (none = all), casora_screensaver_tint (the playing cover's colour as a wash),
// casora_screensaver_wander (false = the content stands still, for displays that do not burn in),
// casora_screensaver_calendar_range ('2w' = the calendar shows this week and the next instead of the month).
// casora_screensaver_wake (a binary_sensor: when it turns on the screensaver ends; by day Home, at night a dimmed clock),
// casora_screensaver_wake_screen (false = leave a Fully Kiosk screen alone).
(function () {
  if (window._casoraSaver) return;
  var S = window._casoraSaver = {};
  var esc = window.casoraEsc || function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  // Inside a CSS url("…"): quote, backslash and line breaks as CSS escapes (an address never has them).
  var cssUrl = function (u) { return String(u == null ? '' : u).replace(/["\\\n\r\f]/g, function (c) { return '\\' + c.charCodeAt(0).toString(16) + ' '; }); };
  var T = function (t) { return typeof window.casoraTr === 'function' ? window.casoraTr(t) : t; };
  var hassOf = function () { var ha = document.querySelector('home-assistant'); return (ha && ha.hass) || null; };
  var loc = function () { return window.casoraLocale ? window.casoraLocale() : 'de-DE'; };
  var langOf = function () { return String(loc()).slice(0, 2).toLowerCase(); };

  // label: the name in the Studio (its texts are English at the source, translations/panel).
  // icon and tone: the row in the Studio's list of what alternates. needs: shown in the alternation only when the
  // house has it right now (S.has), otherwise skipped.
  S.KINDS = [
    { id: 'himmel', label: 'Sky', icon: 'mdi:weather-sunset', tone: '#E08A5C' },
    { id: 'land', label: 'Landscapes', icon: 'mdi:image-filter-hdr', tone: '#6AAE78' },
    { id: 'fotos', label: 'Photos', icon: 'mdi:image-multiple-outline', tone: '#5B8FC9', needs: 'Only with room photos' },
    { id: 'wort', label: 'Word clock', icon: 'mdi:format-letter-case', tone: '#C8693F' },
    { id: 'wetter', label: 'Weather', icon: 'mdi:weather-partly-cloudy', tone: '#5B8FC9', needs: 'Only with a weather source' },
    { id: 'linie', label: 'Day line', icon: 'mdi:timeline-clock-outline', tone: '#4E9E95' },
    { id: 'woche', label: 'Week', icon: 'mdi:calendar-week', tone: '#4E9E95' },
    { id: 'musik', label: 'Music', icon: 'mdi:music-note', tone: '#A77BE0', needs: 'Only while something is playing' },
    { id: 'energie', label: 'Energy flow', icon: 'mdi:lightning-bolt', tone: '#E8B04A', needs: 'Only with energy set up' },
    { id: 'ruhe', label: 'House at rest', icon: 'mdi:sofa-outline', tone: '#4E9E95' },
    { id: 'kameras', label: 'Cameras', icon: 'mdi:cctv', tone: '#5B8FC9', needs: 'Only with cameras' },
    { id: 'kalender', label: 'Calendar', icon: 'mdi:calendar-month-outline', tone: '#DE8A4E' },
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
  // One scene as a picture. Depth comes from the air: every ridge is lighter at its top than at its foot, the sun and
  // the moon are light without an edge, clouds are soft, and a fine grain lies over all of it like on a print.
  S.landSvg = function (s, w, h) {
    var r = rng(s.seed), id = 'cl' + s.id, out = [], defs = [], body = [];
    var stops = s.sky.map(function (c, i) { return '<stop offset="' + (i / (s.sky.length - 1)) + '" stop-color="' + c + '"/>'; }).join('');
    defs.push('<linearGradient id="' + id + 's" x1="0" y1="0" x2="0" y2="1">' + stops + '</linearGradient>');
    if (s.sun) defs.push('<radialGradient id="' + id + 'g"><stop offset="0" stop-color="' + s.sun.c + '" stop-opacity=".85"/><stop offset=".3" stop-color="' + s.sun.c + '" stop-opacity=".34"/><stop offset="1" stop-color="' + s.sun.c + '" stop-opacity="0"/></radialGradient>'
      + '<radialGradient id="' + id + 'd"><stop offset="0" stop-color="#fff"/><stop offset=".72" stop-color="' + s.sun.c + '"/><stop offset="1" stop-color="' + s.sun.c + '" stop-opacity=".0"/></radialGradient>');
    if (s.moon) defs.push('<radialGradient id="' + id + 'o"><stop offset="0" stop-color="#DCE4FF" stop-opacity=".42"/><stop offset=".4" stop-color="#DCE4FF" stop-opacity=".12"/><stop offset="1" stop-color="#DCE4FF" stop-opacity="0"/></radialGradient>');
    if (s.water) defs.push('<linearGradient id="' + id + 'w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + s.water.a + '"/><stop offset="1" stop-color="' + s.water.b + '"/></linearGradient>');
    if (s.mist) defs.push('<linearGradient id="' + id + 'm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + s.mist + '" stop-opacity="0"/><stop offset=".5" stop-color="' + s.mist + '" stop-opacity=".5"/><stop offset="1" stop-color="' + s.mist + '" stop-opacity="0"/></linearGradient>');
    if (s.aurora) defs.push('<filter id="' + id + 'b" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="22"/></filter>');
    if (s.clouds) defs.push('<filter id="' + id + 'c" x="-20%" y="-80%" width="140%" height="260%"><feGaussianBlur stdDeviation="7"/></filter>');
    defs.push('<filter id="' + id + 'n" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="' + s.seed + '" stitchTiles="stitch"/>'
      + '<feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .9 -.34"/></filter>');
    body.push('<rect width="' + w + '" height="' + h + '" fill="url(#' + id + 's)"/>');
    for (var i = 0; i < (s.stars || 0); i++) {
      body.push('<circle cx="' + (r() * w).toFixed(1) + '" cy="' + (r() * h * 0.6).toFixed(1) + '" r="' + (0.6 + r() * 1.4).toFixed(2) + '" fill="#fff" opacity="' + (0.25 + r() * 0.7).toFixed(2) + '"/>');
    }
    if (s.aurora) s.aurora.forEach(function (c, k) {
      var y0 = h * (0.14 + k * 0.09), d = 'M-40 ' + y0;
      for (var x = 0; x <= w + 40; x += 60) d += ' L' + x + ' ' + (y0 + Math.sin(x / (150 + k * 40) + k * 2) * 46 + Math.sin(x / 61 + k) * 14).toFixed(1);
      body.push('<path d="' + d + '" fill="none" stroke="' + c + '" stroke-width="' + (78 - k * 16) + '" stroke-linecap="round" opacity="' + (0.55 - k * 0.1) + '" filter="url(#' + id + 'b)"/>');
    });
    if (s.sun) {
      body.push('<circle cx="' + s.sun.x * w + '" cy="' + s.sun.y * h + '" r="' + s.sun.r * 7 + '" fill="url(#' + id + 'g)"/>');
      body.push('<circle cx="' + s.sun.x * w + '" cy="' + s.sun.y * h + '" r="' + (s.sun.r * 1.12).toFixed(1) + '" fill="url(#' + id + 'd)"/>');
    }
    if (s.moon) {
      var mx = s.moon.x * w, my = s.moon.y * h, mr = s.moon.r;
      body.push('<circle cx="' + mx + '" cy="' + my + '" r="' + mr * 6 + '" fill="url(#' + id + 'o)"/>');
      // A crescent: the disc without the part a second, shifted disc covers.
      body.push('<path d="M' + (mx - mr * 0.2).toFixed(1) + ' ' + (my - mr).toFixed(1) + 'a' + mr + ' ' + mr + ' 0 1 0 ' + (mr * 1.05).toFixed(1) + ' ' + (mr * 1.42).toFixed(1)
        + 'a' + (mr * 0.86).toFixed(1) + ' ' + (mr * 0.86).toFixed(1) + ' 0 1 1 -' + (mr * 1.05).toFixed(1) + ' -' + (mr * 1.42).toFixed(1) + 'z" fill="#F4F6FF"/>');
    }
    for (var c = 0; c < (s.clouds || 0); c++) {
      var cx = (0.08 + r() * 0.84) * w, cy = (0.1 + r() * 0.2) * h, cw = 220 + r() * 260;
      body.push('<g fill="#fff" opacity=".62" filter="url(#' + id + 'c)"><ellipse cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" rx="' + (cw / 2).toFixed(1) + '" ry="' + (cw / 15).toFixed(1) + '"/>'
        + '<ellipse cx="' + (cx - cw * .14).toFixed(1) + '" cy="' + (cy - cw * .045).toFixed(1) + '" rx="' + (cw * .2).toFixed(1) + '" ry="' + (cw * .07).toFixed(1) + '"/>'
        + '<ellipse cx="' + (cx + cw * .12).toFixed(1) + '" cy="' + (cy - cw * .06).toFixed(1) + '" rx="' + (cw * .17).toFixed(1) + '" ry="' + (cw * .08).toFixed(1) + '"/></g>');
    }
    var L = s.layers, landBottom = s.water ? s.water.y * h : h;
    for (var k = 0; k < L.n; k++) {
      var t = L.n === 1 ? 1 : k / (L.n - 1);
      var base = (L.top + (L.bottom - L.top) * t) * h, amp = L.amp * h * (1 - t * 0.45);
      var tt = Math.pow(t, 0.9), col = mix(L.far, L.near, tt);
      // Lighter where the ridge meets the air, deeper at its foot.
      defs.push('<linearGradient id="' + id + 'r' + k + '" gradientUnits="userSpaceOnUse" x1="0" y1="' + (base - amp).toFixed(1) + '" x2="0" y2="' + Math.min(landBottom, base + amp * 1.6 + h * 0.12).toFixed(1) + '">'
        + '<stop offset="0" stop-color="' + mix(L.far, L.near, Math.max(0, tt - 0.1)) + '"/><stop offset="1" stop-color="' + mix(L.far, L.near, Math.min(1, tt + 0.2)) + '"/></linearGradient>');
      body.push('<path d="' + ridge(r, w, landBottom, base, amp, L.kind, L.mesa ? 46 : 6) + '" fill="url(#' + id + 'r' + k + ')"/>');
      if (L.trees && k >= 1) {
        var n = 46 + k * 10, th = 20 + k * 12;
        for (var q = 0; q < n; q++) {
          var tx = r() * w, ty = base - amp * 0.2 + r() * amp * 0.7;
          body.push('<path d="M' + tx.toFixed(1) + ' ' + (ty - th).toFixed(1) + 'l' + (th * 0.26).toFixed(1) + ' ' + th + 'h-' + (th * 0.52).toFixed(1) + 'z" fill="' + col + '"/>');
        }
      }
      if (s.mist && k < L.n - 1) body.push('<rect x="0" y="' + (base - amp * 0.2).toFixed(1) + '" width="' + w + '" height="' + (amp * 1.5 + 40).toFixed(1) + '" fill="url(#' + id + 'm)" opacity="' + (0.9 - t * 0.5).toFixed(2) + '"/>');
    }
    if (s.water) {
      var wy = s.water.y * h;
      body.push('<rect x="0" y="' + wy + '" width="' + w + '" height="' + (h - wy) + '" fill="url(#' + id + 'w)"/>');
      if (s.sun) {
        // The sun on the water: a soft column of light, then the glints.
        defs.push('<clipPath id="' + id + 'k"><rect x="0" y="' + wy + '" width="' + w + '" height="' + (h - wy) + '"/></clipPath>');
        body.push('<ellipse cx="' + s.sun.x * w + '" cy="' + wy + '" rx="' + s.sun.r * 3.4 + '" ry="' + ((h - wy) * 0.9).toFixed(1) + '" fill="url(#' + id + 'g)" opacity=".5" clip-path="url(#' + id + 'k)"/>');
        for (var z = 0; z < 16; z++) {
          var ry = wy + 8 + z * z * 1.25, rw = s.sun.r * (2.4 - z * 0.08) * (0.7 + r() * 0.6);
          if (ry > h) break;
          body.push('<rect x="' + (s.sun.x * w - rw / 2 + (r() - .5) * 26).toFixed(1) + '" y="' + ry.toFixed(1) + '" width="' + rw.toFixed(1) + '" height="' + (2 + z * 0.35).toFixed(1) + '" rx="2" fill="' + s.sun.c + '" opacity="' + (0.7 - z * 0.04).toFixed(2) + '"/>');
        }
      }
      for (var u2 = 0; u2 < 22; u2++) {
        body.push('<rect x="' + (r() * w).toFixed(1) + '" y="' + (wy + 10 + r() * (h - wy - 16)).toFixed(1) + '" width="' + (30 + r() * 140).toFixed(1) + '" height="1.6" rx="1" fill="#fff" opacity="' + (0.06 + r() * 0.12).toFixed(2) + '"/>');
      }
    }
    body.push('<rect width="' + w + '" height="' + h + '" filter="url(#' + id + 'n)" opacity=".16"/>');
    out.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="xMidYMid slice" aria-hidden="true">');
    return out.join('') + '<defs>' + defs.join('') + '</defs>' + body.join('') + '</svg>';
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
      // The name the room bar shows: the hero card's name (a view's title is its path, „kueche“), else the title.
      var hero = (v.cards || [])[0] || {};
      var own = typeof hero.name === 'string' && hero.name.indexOf('[[[') < 0 ? hero.name.trim() : '';
      var name = own || String(v.title || vars.title || '');
      if (own && typeof window.casoraRoomName === 'function') { try { name = window.casoraRoomName(own, vars).text || name; } catch (e) { /* the name as stored */ } }
      out.push({ name: name, url: url, ref: String(vars.image) });
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
  // The calendars that count: only: one calendar, or the ones picked for the screensaver (casora_screensaver_calendars);
  // none picked (or none of them left) = the ones that count on the calendar tile and under the greeting
  // (window.casoraCalendars, V26), without those shown only in the popup (tile: false).
  S.calendars = function (hass, only) {
    var S0 = (hass && hass.states) || {};
    if (typeof only === 'string' && only && S0[only]) return [only];
    if (Array.isArray(only) && only.length) {
      var mine = only.map(String).filter(function (id) { return id.indexOf('calendar.') === 0 && S0[id]; });
      if (mine.length) return mine.slice(0, 8);
    }
    var all = window.casoraCalendars ? window.casoraCalendars(hass, null) : [];
    return all.filter(function (c) { return c.tile !== false && S0[c.entity]; })
      .map(function (c) { return c.entity; }).slice(0, 8);
  };
  // Events of the coming days from Home Assistant's calendar API: [{ title, start, end, allDay }] sorted by start.
  // from: the first day asked for (the month calendar starts with the week of the 1st); default today.
  S.events = function (hass, ids, days, from) {
    var a = from ? new Date(+from) : new Date(); a.setHours(0, 0, 0, 0);
    var key = ids.join(',') + '|' + days + (from ? '|' + a.getTime() : '');
    if (!hass || !ids.length || typeof hass.callApi !== 'function') return DATA.ev[key] || [];
    if (!(DATA.at[key] && Date.now() - DATA.at[key] < 600000)) {
      DATA.at[key] = Date.now();
      // Calendar days, not 24-hour steps: across a clock change the window still ends at midnight.
      var b = new Date(a); b.setDate(b.getDate() + days);
      var q = '?start=' + encodeURIComponent(a.toISOString()) + '&end=' + encodeURIComponent(b.toISOString());
      Promise.all(ids.map(function (id) {
        return hass.callApi('GET', 'calendars/' + id + q).then(function (rows) { return rows || []; }, function () { return []; });
      })).then(function (lists) {
        var out = [];
        lists.forEach(function (rows, li) {
          rows.forEach(function (ev) {
            var all = !(ev.start && ev.start.dateTime);
            var st = all ? (ev.start && ev.start.date ? ev.start.date + 'T00:00:00' : null) : ev.start.dateTime;
            var en = ev.end ? (all ? (ev.end.date ? ev.end.date + 'T00:00:00' : null) : ev.end.dateTime) : null;
            var t0 = Date.parse(st);
            if (isNaN(t0)) return;
            out.push({ title: String(ev.summary || ''), start: t0, end: en ? Date.parse(en) : null, allDay: all, cal: ids[li] });
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
  // ── Cameras ──────────────────────────────────────────────────────────────
  // The cameras that count: visible, not unavailable, with a picture. only = the ones picked in the Studio
  // (casora_screensaver_cameras), kept as picked (a printer camera too). None picked (or none of them left) =
  // „Automatic“: the cameras with a real picture, without robot vacuum maps, 3D printer cameras and diagnostic
  // cameras (owner 13.11.2026), by the Cameras tile's rule (casoraDevice.notSurveillance in 00-finder.js, printers
  // included as in every automatic list). [{ id, name, url, stream }] (url: Home Assistant's still picture).
  var camOk = function (hass, id) {
    var st = ((hass && hass.states) || {})[id], e = ((hass && hass.entities) || {})[id];
    return id.indexOf('camera.') === 0 && !!st && st.state !== 'unavailable' && !(e && (e.hidden || e.disabled_by)) && !!(st.attributes || {}).entity_picture;
  };
  // Why „Automatic“ leaves a camera out: 'printer', 'map' (a map or a robot vacuum's camera), '' = it takes part.
  var camWhy = function (hass, id) {
    var CD = window.casoraDevice;
    if (!(CD && CD.notSurveillance && CD.notSurveillance(hass, id, true))) return '';
    return CD.isPrinter && CD.isPrinter(hass, id) && !CD.notSurveillance(hass, id, false) ? 'printer' : 'map';
  };
  var camName = function (hass, id) { return String((((hass && hass.states) || {})[id].attributes || {}).friendly_name || id.slice(7)); };
  // Every camera the Studio offers (not a diagnostic one): [{ id, name, auto, why }], auto = „Automatic“ takes it.
  S.cameraChoices = function (hass) {
    var S0 = (hass && hass.states) || {}, R = (hass && hass.entities) || {};
    return Object.keys(S0).filter(function (id) { return camOk(hass, id) && !(R[id] && R[id].entity_category); }).sort().map(function (id) {
      var why = camWhy(hass, id);
      return { id: id, name: camName(hass, id), auto: !why, why: why };
    });
  };
  S.cameras = function (hass, only) {
    var S0 = (hass && hass.states) || {};
    var ids = Array.isArray(only) && only.length ? only.map(String).filter(function (id) { return camOk(hass, id); }) : [];
    if (!ids.length) ids = S.cameraChoices(hass).filter(function (c) { return c.auto; }).map(function (c) { return c.id; });
    return ids.slice(0, 12).map(function (id) {
      var a = S0[id].attributes || {};
      return { id: id, name: camName(hass, id), url: String(a.entity_picture), stream: !!((Number(a.supported_features) || 0) & 2) };
    });
  };
  // One tap in a Studio list (what alternates, cameras, calendars): none picked = automatic (auto, the ids
  // „Automatic“ takes; null = all). From automatic the tap starts from what automatic takes; the result in list order;
  // back to exactly that (or nothing left) = automatic again.
  S.pickNext = function (cur, ids, auto, id) {
    var base = Array.isArray(auto) ? ids.filter(function (x) { return auto.indexOf(x) > -1; }) : ids.slice();
    var from = cur && cur.length ? cur : base;
    var next = from.indexOf(id) > -1 ? from.filter(function (x) { return x !== id; }) : from.concat([id]);
    next = ids.filter(function (x) { return next.indexOf(x) > -1; });
    var same = next.length === base.length && next.every(function (x) { return base.indexOf(x) > -1; });
    return same ? [] : next;
  };
  // A fresh still picture every few seconds without a blank moment: the next one loads in the background and only
  // takes the place of the last one once it is there (a repaint follows).
  var SHOT = {}, SHOT_NEXT = {};
  S.shot = function (cam, now) {
    var next = cam.url + (cam.url.indexOf('?') < 0 ? '?' : '&') + '_cs=' + Math.floor(+now / 8000);
    if (SHOT_NEXT[cam.id] !== next && typeof Image === 'function') {
      SHOT_NEXT[cam.id] = next;
      var img = new Image();
      img.onload = function () { if (SHOT_NEXT[cam.id] === next) { SHOT[cam.id] = next; changed(); } };
      img.src = next;
    }
    return SHOT[cam.id] || cam.url;
  };

  // ── The cover's colour ───────────────────────────────────────────────────
  // The main colour of a picture from its pixels (RGBA, as a canvas gives them): colourful, middle-bright pixels count
  // most, grey and near black or white ones hardly. Brought to a calm brightness, so it tints without shouting.
  S.dominant = function (px) {
    var r = 0, g = 0, b = 0, w = 0, ar = 0, ag = 0, ab = 0, n = 0;
    for (var i = 0; i + 3 < px.length; i += 4) {
      if (px[i + 3] < 128) continue;
      var R0 = px[i], G0 = px[i + 1], B0 = px[i + 2], mx = Math.max(R0, G0, B0), mn = Math.min(R0, G0, B0);
      var l = (mx + mn) / 510, sat = mx === mn ? 0 : (mx - mn) / (255 - Math.abs(mx + mn - 255));
      var k = sat * sat * (l > 0.12 && l < 0.92 ? 1 : 0.05);
      r += R0 * k; g += G0 * k; b += B0 * k; w += k;
      ar += R0; ag += G0; ab += B0; n++;
    }
    if (!n) return null;
    var c = w > n * 0.02 ? [r / w, g / w, b / w] : [ar / n, ag / n, ab / n];
    // HSL: lightness into 0.42…0.6, saturation at most 0.65.
    var M = Math.max.apply(null, c) / 255, m = Math.min.apply(null, c) / 255, L = (M + m) / 2, d = M - m;
    var H = 0, Sa = d === 0 ? 0 : d / (1 - Math.abs(2 * L - 1));
    if (d) {
      var R1 = c[0] / 255, G1 = c[1] / 255, B1 = c[2] / 255;
      H = M === R1 ? ((G1 - B1) / d) % 6 : M === G1 ? (B1 - R1) / d + 2 : (R1 - G1) / d + 4;
      H = (H * 60 + 360) % 360;
    }
    L = Math.max(0.42, Math.min(0.6, L)); Sa = Math.min(0.65, Sa);
    var C = (1 - Math.abs(2 * L - 1)) * Sa, X = C * (1 - Math.abs((H / 60) % 2 - 1)), m2 = L - C / 2;
    var rgb = H < 60 ? [C, X, 0] : H < 120 ? [X, C, 0] : H < 180 ? [0, C, X] : H < 240 ? [0, X, C] : H < 300 ? [X, 0, C] : [C, 0, X];
    return rgb.map(function (v) { return Math.round((v + m2) * 255); });
  };
  var COVER = {};
  // The cover's colour as 'rgb(…)', null until it has been read (a repaint follows) or when it cannot be read.
  S.coverColor = function (url) {
    if (!url) return null;
    if (COVER[url] !== undefined) return COVER[url] === 0 ? null : COVER[url];
    if (typeof Image !== 'function' || !window.document || !document.createElement) return null;
    COVER[url] = 0;
    var img = new Image();
    img.onload = function () {
      try {
        var cv = document.createElement('canvas');
        cv.width = 24; cv.height = 24;
        var cx = cv.getContext('2d');
        cx.drawImage(img, 0, 0, 24, 24);
        var c = S.dominant(cx.getImageData(0, 0, 24, 24).data);
        if (c) { COVER[url] = 'rgb(' + c.join(',') + ')'; changed(); }
      } catch (e) { /* a picture from elsewhere that may not be read: no tint */ }
    };
    img.src = url;
    return null;
  };

  // ── What alternates ──────────────────────────────────────────────────────
  var truthy = function (v) { return v === true || v === 'true' || v === 1 || v === '1'; };
  S.on = truthy;
  // The kinds picked in the Studio for „mix“ (casora_screensaver_mix); none picked = all (as before).
  S.selected = function (vars) {
    var ids = S.KINDS.map(function (k) { return k.id; }), pick = vars && vars.casora_screensaver_mix;
    var mine = Array.isArray(pick) ? ids.filter(function (id) { return pick.indexOf(id) > -1; }) : [];
    return mine.length ? mine : ids;
  };
  // Whether the house has something for this kind right now (c: { hass, vars, rooms }).
  S.has = function (id, c) {
    c = c || {};
    var hass = c.hass, vars = c.vars || {};
    if (id === 'wetter') return !!S.weather(hass, vars.weather_entity);
    if (id === 'musik') return !!S.playing(hass);
    if (id === 'energie') return !!S.energy(hass);
    if (id === 'kameras') return S.cameras(hass, vars.casora_screensaver_cameras).length > 0;
    if (id === 'fotos') return !!(c.rooms && c.rooms.length);
    return true;
  };
  // The kinds that take turns: the picked ones the house has something for; never empty (then the sky).
  S.pool = function (vars, has) {
    var list = S.selected(vars).filter(function (id) { return !has || has(id); });
    return list.length ? list : ['himmel'];
  };
  var kw = function (w) { var a = Math.abs(w); return a >= 1000 ? (a / 1000).toLocaleString(loc(), { maximumFractionDigits: 1 }) + ' kW' : Math.round(a) + ' W'; };
  var wxIcon = function (cond) { return '/casora_assets/weather/' + (WX[cond] || 'cloudy-fill') + '.svg'; };
  var dayName = function (ts, short) { return new Intl.DateTimeFormat(loc(), { weekday: short ? 'short' : 'long' }).format(new Date(ts)); };
  var sameDay = function (a, b) { var x = new Date(a), y = new Date(b); return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate(); };

  // 12 hours like the dashboard's clock (#191): the dashboard's „12-hour clock“ switch (use_12h) first, then the HA
  // user's time format, else the dashboard language.
  var use12 = function (hass, vars) {
    var v = vars && vars.use_12h;
    if (v === true || v === 'true') return true;
    if (v === false || v === 'false') return false;
    var f = hass && hass.locale && hass.locale.time_format;
    if (f === '12') return true;
    if (f === '24') return false;
    try { return !!new Intl.DateTimeFormat((hass && hass.locale && hass.locale.language) || (hass && hass.language) || loc(), { hour: 'numeric' }).resolvedOptions().hour12; } catch (e) { return false; }
  };
  // Set by S.html for the screensaver being drawn: whether its times read in 12 hours.
  var h12 = false;
  var timeText = function (now) {
    var h = now.getHours();
    if (h12) h = ((h + 11) % 12) + 1;
    return (h12 ? String(h) : String(h).padStart(2, '0')) + ':' + String(now.getMinutes()).padStart(2, '0');
  };
  var dateText = function (now) {
    var d = new Intl.DateTimeFormat(loc(), { weekday: 'long', day: 'numeric', month: 'long' }).format(now);
    return d.charAt(0).toUpperCase() + d.slice(1);
  };
  var hm = function (ts) { return new Intl.DateTimeFormat(loc(), h12 ? { hour: 'numeric', minute: '2-digit', hour12: true } : { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ts)); };

  // ── Drawing ──────────────────────────────────────────────────────────────
  // One unit is a hundredth of the box's shorter side (cqmin), so a preview and a wall tablet look the same.
  // Reading distance (owner, 20.11.2026): a wall tablet is read from across the room. Nothing is smaller than 19
  // units (most text 22 and up), every screensaver has one thing that is big, and the ground is a colour of its own
  // instead of grey plates: light by day, deep by night (cs-light; --ink, --ink2, --ink3, --plate, --line, --acc).
  var u = function (n) { return (n / 8.2).toFixed(3) + 'cqmin'; };
  var M = 72;
  // The day line's window and its plates (#233): hours before and after now, the gap between two plates, and per
  // layout a plate's width (both in % of the line) and how many rows a plate holds.
  var LINE = { back: 3, ahead: 15, gap: 1.2, wide: { w: 24, rows: 5 }, tall: { w: 34, rows: 8 } };
  S.LINE = LINE;
  var CSS = '.cs-sv{position:absolute;inset:0;overflow:hidden;container-type:size;text-align:left;'
    + '--ink:#F7F1E8;--ink2:rgba(247,241,232,.72);--ink3:rgba(247,241,232,.42);--plate:rgba(255,255,255,.09);--line:rgba(255,255,255,.17);--acc:#E08A5C;color:var(--ink);'
    + 'font-family:var(--primary-font-family, var(--ha-font-family, system-ui, sans-serif));-webkit-user-select:none;user-select:none;-webkit-font-smoothing:antialiased;}'
    + '.cs-sv.cs-light{--ink:#2A2520;--ink2:rgba(42,37,32,.66);--ink3:rgba(42,37,32,.4);--plate:rgba(42,37,32,.065);--line:rgba(42,37,32,.15);--acc:#C8693F;}'
    + '.cs-sv *{box-sizing:border-box;margin:0;padding:0;}'
    + '.cs-sv svg.cs-bg, .cs-sv .cs-bg{position:absolute;inset:0;width:100%;height:100%;display:block;}'
    + '.cs-sv .cs-in{position:absolute;inset:0;transform:translate(var(--cs-dx, 0px), var(--cs-dy, 0px));transition:transform 4s ease;}'
    + '.cs-sv .cs-time{font-weight:600;letter-spacing:-.055em;line-height:.92;font-variant-numeric:tabular-nums;}'
    + '.cs-sv .cs-date{font-weight:600;letter-spacing:-.012em;color:var(--ink2);}'
    + '.cs-sv img{filter:brightness(0) invert(1);}.cs-sv.cs-light img{filter:brightness(0);opacity:.8;}'
    // Pictures (landscapes, photos): the time big at the bottom left over a soft shade, the name at the right.
    + '.cs-sv .cs-shade{position:absolute;inset:0;background:linear-gradient(0deg, rgba(8,6,5,.78) 0%, rgba(8,6,5,.34) 30%, rgba(8,6,5,0) 56%), linear-gradient(180deg, rgba(8,6,5,.18) 0%, rgba(8,6,5,0) 22%);}'
    + '.cs-sv .sv-bar{position:absolute;left:' + u(M) + ';right:' + u(M) + ';bottom:' + u(60) + ';display:flex;justify-content:space-between;align-items:flex-end;gap:' + u(28) + ';}'
    + '.cs-sv .sv-bar .cs-time{font-size:' + u(176) + ';margin-left:-' + u(8) + ';text-shadow:0 ' + u(4) + ' ' + u(40) + ' rgba(0,0,0,.35);}'
    + '.cs-sv .sv-bar .cs-date{font-size:' + u(32) + ';margin-top:' + u(14) + ';color:rgba(255,255,255,.9);text-shadow:0 ' + u(2) + ' ' + u(16) + ' rgba(0,0,0,.4);}'
    + '.cs-sv .cs-name{text-align:right;font-size:' + u(24) + ';font-weight:600;color:rgba(255,255,255,.8);padding-bottom:' + u(4) + ';text-shadow:0 ' + u(2) + ' ' + u(16) + ' rgba(0,0,0,.4);}'
    + '.cs-sv .cs-name b{display:block;font-size:' + u(40) + ';font-weight:700;color:#fff;letter-spacing:-.02em;line-height:1.15;}'
    + '.cs-sv .cs-photo{position:absolute;inset:-2%;background-size:cover;background-position:center;animation:cs-pan 60s ease-in-out infinite alternate;}'
    + '@keyframes cs-pan{from{transform:scale(1.04) translate(-1%, 0);}to{transform:scale(1.1) translate(1.2%, -1%);}}'
    // Sky
    + '.cs-sv .cs-top{position:absolute;left:' + u(M) + ';right:' + u(M) + ';top:' + u(62) + ';display:flex;justify-content:space-between;align-items:flex-start;gap:' + u(24) + ';}'
    + '.cs-sv .cs-top .cs-time{font-size:' + u(214) + ';margin-left:-' + u(10) + ';text-shadow:0 ' + u(4) + ' ' + u(50) + ' rgba(20,20,40,.18);}'
    + '.cs-sv .cs-top .cs-date{font-size:' + u(34) + ';margin-top:' + u(18) + ';color:rgba(255,255,255,.92);}'
    + '.cs-sv .cs-wx{text-align:right;padding-top:' + u(14) + ';}'
    + '.cs-sv .cs-wx .cs-t{display:flex;align-items:center;justify-content:flex-end;gap:' + u(16) + ';font-size:' + u(88) + ';font-weight:600;letter-spacing:-.04em;line-height:1;}'
    + '.cs-sv .cs-wx img{width:' + u(78) + ';height:' + u(78) + ';}'
    + '.cs-sv .cs-wx p{font-size:' + u(28) + ';font-weight:600;color:rgba(255,255,255,.9);margin-top:' + u(12) + ';}'
    + '.cs-sv .cs-arc{position:absolute;left:' + u(M) + ';right:' + u(M) + ';bottom:' + u(124) + ';height:' + u(300) + ';}'
    + '.cs-sv .cs-arc svg{width:100%;height:100%;display:block;overflow:visible;}'
    + '.cs-sv .cs-ends{position:absolute;left:' + u(M) + ';right:' + u(M) + ';bottom:' + u(58) + ';display:flex;justify-content:space-between;align-items:baseline;gap:' + u(16) + ';font-size:' + u(24) + ';font-weight:600;color:rgba(255,255,255,.82);}'
    + '.cs-sv .cs-ends b{font-weight:700;color:#fff;font-variant-numeric:tabular-nums;font-size:' + u(30) + ';letter-spacing:-.02em;margin-left:' + u(6) + ';}'
    + '.cs-sv .cs-ends span:nth-child(2){font-size:' + u(26) + ';color:#fff;}'
    // Word clock (light by day, dark by night)
    + '.cs-sv.cs-wort{background:#191613;}.cs-sv.cs-wort.cs-light{background:#F2EBE0;}'
    + '.cs-sv .cs-words{position:absolute;left:' + u(84) + ';right:' + u(60) + ';top:50%;transform:translateY(-57%);font-size:' + u(172) + ';font-weight:700;letter-spacing:-.05em;line-height:.96;}'
    + '.cs-sv .cs-words span{display:block;}.cs-sv .cs-words .cs-acc{color:var(--acc);}'
    + '.cs-sv .cs-foot{position:absolute;left:' + u(92) + ';right:' + u(84) + ';bottom:' + u(70) + ';display:flex;justify-content:space-between;align-items:center;gap:' + u(20) + ';font-size:' + u(30) + ';font-weight:600;color:var(--ink2);}'
    + '.cs-sv .cs-foot b{font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums;}'
    + '.cs-sv .cs-foot .cs-fw{display:flex;align-items:center;gap:' + u(12) + ';font-weight:700;color:var(--ink);font-size:' + u(34) + ';}'
    + '.cs-sv .cs-foot img{width:' + u(46) + ';height:' + u(46) + ';}'
    // Shared by the data screensavers: what it is about big at the top left, the clock at the top right.
    + '.cs-sv .sv-head{position:absolute;left:' + u(M) + ';right:' + u(M) + ';top:' + u(58) + ';display:flex;justify-content:space-between;align-items:flex-start;gap:' + u(40) + ';}'
    + '.cs-sv .sv-head .cs-time{font-size:' + u(92) + ';}.cs-sv .sv-head .cs-date{font-size:' + u(25) + ';margin-top:' + u(12) + ';}'
    + '.cs-sv .sv-head .cs-clock{flex:none;}.cs-sv .sv-head .cs-clock:last-child{text-align:right;}'
    + '.cs-sv .cs-sum{min-width:0;font-size:' + u(32) + ';font-weight:600;color:var(--ink2);letter-spacing:-.01em;line-height:1.2;}'
    + '.cs-sv .cs-sum b{display:block;font-size:' + u(84) + ';font-weight:700;color:var(--ink);letter-spacing:-.045em;line-height:1;margin:-' + u(4) + ' 0 ' + u(12) + ' -' + u(4) + ';overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;padding-bottom:.08em;}'
    + '.cs-sv .cs-sum.cs-accent{color:var(--acc);}'
    + '.cs-sv .cs-cap{font-size:' + u(21) + ';font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--ink2);}'
    + '.cs-sv .cs-body{position:absolute;left:' + u(M) + ';right:' + u(M) + ';top:' + u(236) + ';bottom:' + u(60) + ';}'
    // Weather: the sky's colour as the ground, the temperature as the big thing.
    + '.cs-sv.cs-wetter{background:linear-gradient(180deg, #2F6FB8 0%, #5C9AD6 58%, #8FBDE6 100%);}'
    + '.cs-sv.cs-wetter.cs-grey{background:linear-gradient(180deg, #4E6A86 0%, #7C95AD 60%, #A5B8C8 100%);}'
    + '.cs-sv.cs-wetter.cs-dark{background:linear-gradient(180deg, #0B1429 0%, #172849 60%, #25406A 100%);}'
    + '.cs-sv .cs-wnow{position:absolute;left:' + u(M) + ';top:' + u(54) + ';}'
    + '.cs-sv .cs-wnow .cs-wt{display:flex;align-items:center;gap:' + u(22) + ';margin-left:-' + u(6) + ';}'
    + '.cs-sv .cs-wnow img{width:' + u(150) + ';height:' + u(150) + ';}'
    + '.cs-sv .cs-wnow b{font-size:' + u(232) + ';font-weight:600;letter-spacing:-.06em;line-height:.9;font-variant-numeric:tabular-nums;}'
    + '.cs-sv .cs-wnow p{font-size:' + u(38) + ';font-weight:600;letter-spacing:-.015em;margin-top:' + u(16) + ';}'
    + '.cs-sv .cs-corner{position:absolute;right:' + u(M) + ';top:' + u(58) + ';text-align:right;}.cs-sv .cs-corner .cs-time{font-size:' + u(92) + ';}.cs-sv .cs-corner .cs-date{font-size:' + u(25) + ';margin-top:' + u(12) + ';color:rgba(255,255,255,.86);}'
    + '.cs-sv .cs-wk{position:absolute;right:' + u(M) + ';top:' + u(204) + ';width:' + u(430) + ';display:flex;flex-direction:column;}'
    + '.cs-sv .cs-wd{display:grid;grid-template-columns:' + u(62) + ' ' + u(46) + ' ' + u(52) + ' 1fr ' + u(52) + ';align-items:center;gap:' + u(12) + ';height:' + u(50) + ';font-size:' + u(26) + ';font-weight:600;font-variant-numeric:tabular-nums;}'
    + '.cs-sv .cs-wd img{width:' + u(40) + ';height:' + u(40) + ';}.cs-sv .cs-wd span{color:rgba(255,255,255,.74);text-align:right;}.cs-sv .cs-wd em{font-style:normal;text-align:right;font-weight:700;}'
    + '.cs-sv .cs-wd i{position:relative;height:' + u(10) + ';border-radius:99px;background:rgba(255,255,255,.2);}.cs-sv .cs-wd i u{position:absolute;top:0;bottom:0;border-radius:99px;background:linear-gradient(90deg, #BFE0FF, #FFD98A);}'
    + '.cs-sv .cs-curve{position:absolute;left:' + u(M) + ';right:' + u(M) + ';bottom:' + u(104) + ';height:' + u(230) + ';}.cs-sv .cs-curve svg{width:100%;height:100%;display:block;overflow:visible;}'
    + '.cs-sv .cs-pk{position:absolute;transform:translate(-50%, -130%);font-size:' + u(26) + ';font-weight:700;font-variant-numeric:tabular-nums;}.cs-sv .cs-pk.cs-lo{transform:translate(-50%, 35%);}'
    + '.cs-sv .cs-hours{position:absolute;left:0;right:0;bottom:-' + u(48) + ';display:flex;justify-content:space-between;font-size:' + u(23) + ';font-weight:600;color:rgba(255,255,255,.8);font-variant-numeric:tabular-nums;}'
    // Day line (#233): the line with its hours near the foot of the box, the appointments as plates standing on it.
    // --cs-ly: the line's height over the body's foot (the fewer rows the tallest plate has, the higher, so the
    // whole stands in the middle), --cs-pw: a plate's width (S.LINE).
    + '.cs-sv.cs-linie{background:linear-gradient(160deg, #173335 0%, #0F2224 100%);--acc:#7FD0C4;--cs-pl:#21403F;--cs-pe:rgba(255,255,255,.17);--cs-gr:#132A2C;--cs-sh:none;}'
    + '.cs-sv.cs-linie.cs-light{background:linear-gradient(160deg, #E4EEEA 0%, #D2E3DD 100%);--acc:#2F7F76;--cs-pl:#F7FBF9;--cs-pe:rgba(42,37,32,.24);--cs-gr:#DBE8E3;--cs-sh:0 ' + u(3) + ' ' + u(14) + ' rgba(28,44,40,.1);}'
    + '.cs-sv.cs-linie .cs-body{top:' + u(250) + ';bottom:' + u(50) + ';--cs-pw:' + LINE.wide.w + '%;--cs-ly:calc(' + u(84) + ' + (' + LINE.wide.rows + ' - var(--cs-nw, 1)) * ' + u(35.5) + ');}'
    // What is over is the quiet part and fades out at the left; what comes carries the accent.
    + '.cs-sv .cs-line{position:absolute;left:0;right:0;bottom:calc(var(--cs-ly) - ' + u(5) + ');height:' + u(10) + ';border-radius:99px;background:linear-gradient(90deg, transparent 0%, var(--line) 9%);}'
    + '.cs-sv .cs-line u{position:absolute;right:0;top:0;bottom:0;border-radius:99px;background:linear-gradient(90deg, var(--acc) 0%, var(--acc) 62%, color-mix(in srgb, var(--acc) 38%, transparent) 100%);}'
    + '.cs-sv .cs-tick{position:absolute;top:calc(100% - var(--cs-ly) + ' + u(26) + ');width:' + u(80) + ';margin-left:-' + u(40) + ';text-align:center;font-size:' + u(22) + ';font-weight:600;color:var(--ink3);font-variant-numeric:tabular-nums;}'
    // Midnight: the coming day's name, and a notch through the line.
    + '.cs-sv .cs-tick.cs-day{color:var(--ink2);font-weight:700;letter-spacing:.07em;text-transform:uppercase;}'
    + '.cs-sv .cs-tick.cs-day::before{content:"";position:absolute;left:50%;top:-' + u(46) + ';width:' + u(2) + ';height:' + u(40) + ';margin-left:-' + u(1) + ';border-radius:99px;background:var(--ink2);}'
    // An appointment on the line: from its start to its end, set off from the line by a ring in the ground's colour.
    + '.cs-sv .cs-seg{position:absolute;bottom:calc(var(--cs-ly) - ' + u(8) + ');height:' + u(16) + ';min-width:' + u(16) + ';border-radius:99px;background:var(--ink);box-shadow:0 0 0 ' + u(3) + ' var(--cs-gr);}'
    + '.cs-sv .cs-seg.cs-past{background:color-mix(in srgb, var(--ink) 45%, var(--cs-gr));}'
    + '.cs-sv .cs-now{position:absolute;bottom:calc(var(--cs-ly) - ' + u(16) + ');width:' + u(32) + ';height:' + u(32) + ';margin-left:-' + u(16) + ';border-radius:50%;background:var(--ink);border:' + u(7) + ' solid var(--acc);box-shadow:0 0 0 ' + u(12) + ' color-mix(in srgb, var(--acc) 26%, transparent);}'
    // A plate stands on a thin post at its first appointment's start, like a flag; the corner at the post is tight.
    + '.cs-sv .cs-stem{position:absolute;bottom:calc(var(--cs-ly) + ' + u(11) + ');width:' + u(2) + ';height:' + u(37) + ';border-radius:99px;background:var(--ink3);}'
    + '.cs-sv .cs-ev{position:absolute;bottom:calc(var(--cs-ly) + ' + u(40) + ');width:var(--cs-pw);display:flex;flex-direction:column;padding:' + u(6) + ';'
    +   'background:var(--cs-pl);border:' + u(1.5) + ' solid var(--cs-pe);border-radius:' + u(24) + ' ' + u(24) + ' ' + u(24) + ' ' + u(6) + ';box-shadow:var(--cs-sh);}'
    + '.cs-sv .cs-r{min-width:0;padding:' + u(7) + ' ' + u(14) + ' ' + u(8) + ';border-radius:' + u(18) + ';display:flex;flex-direction:column;gap:' + u(1) + ';}'
    + '.cs-sv .cs-r{position:relative;}.cs-sv .cs-r + .cs-r{margin-top:' + u(2) + ';}.cs-sv .cs-r + .cs-r::before{content:"";position:absolute;left:' + u(14) + ';right:' + u(14) + ';top:-' + u(1) + ';height:1px;background:var(--cs-pe);}'
    + '.cs-sv .cs-r.cs-lead::before, .cs-sv .cs-r.cs-lead + .cs-r::before{display:none;}'
    + '.cs-sv .cs-r b{display:block;font-size:' + u(25) + ';font-weight:700;letter-spacing:-.015em;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
    + '.cs-sv .cs-r span{display:flex;align-items:center;gap:' + u(9) + ';font-size:' + u(21) + ';font-weight:600;line-height:1.2;color:var(--ink);font-variant-numeric:tabular-nums;white-space:nowrap;}'
    + '.cs-sv .cs-r span i{flex:none;width:' + u(10) + ';height:' + u(10) + ';border-radius:50%;background:var(--cs-c);}'
    + '.cs-sv .cs-ev.cs-past{background:color-mix(in srgb, var(--cs-pl) 50%, var(--cs-gr));border-color:color-mix(in srgb, var(--cs-pe) 55%, transparent);box-shadow:none;}'
    + '.cs-sv .cs-r.cs-past b, .cs-sv .cs-r.cs-past span{color:var(--ink2);}.cs-sv .cs-r.cs-past span i{opacity:.6;}'
    // What leads: the accent. Alone on its plate the whole plate, among others its row.
    + '.cs-sv .cs-ev.cs-lead{background:var(--acc);border-color:transparent;}.cs-sv .cs-r.cs-lead{background:var(--acc);color:#10201F;}.cs-sv.cs-light .cs-r.cs-lead{color:#fff;}'
    + '.cs-sv .cs-r.cs-lead span{color:inherit;}.cs-sv .cs-r.cs-lead span i{background:currentColor;opacity:.75;}'
    // More appointments than a plate holds: how many have no row.
    + '.cs-sv .cs-more{font-style:normal;padding:' + u(5) + ' ' + u(14) + ' ' + u(6) + ';font-size:' + u(21) + ';font-weight:700;line-height:1.2;color:var(--ink2);font-variant-numeric:tabular-nums;}'
    // Two layouts of the plates, one for wide boxes and one for narrow ones (a plate takes another share of the line there).
    + '.cs-sv .cs-lay.cs-tall{display:none;}'
    // Week
    + '.cs-sv.cs-woche{background:linear-gradient(160deg, #1B2538 0%, #111827 100%);--acc:#8DB6F0;}.cs-sv.cs-woche.cs-light{background:linear-gradient(160deg, #E6ECF4 0%, #D5DFEC 100%);--acc:#3E74B8;}'
    + '.cs-sv.cs-woche .cs-body{top:' + u(250) + ';bottom:' + u(56) + ';left:' + u(M - 14) + ';right:' + u(M - 14) + ';}'
    + '.cs-sv .cs-cols{position:absolute;inset:0;display:grid;grid-template-columns:repeat(7, minmax(0, 1fr));}'
    + '.cs-sv .cs-col{padding:' + u(18) + ' ' + u(14) + ' ' + u(16) + ';display:flex;flex-direction:column;min-width:0;overflow:hidden;border-radius:' + u(26) + ';}'
    + '.cs-sv .cs-col.cs-today{background:var(--plate);box-shadow:inset 0 0 0 ' + u(2) + ' color-mix(in srgb, var(--acc) 55%, transparent);}.cs-sv .cs-col.cs-today .cs-cap{color:var(--acc);}'
    + '.cs-sv .cs-col .cs-cap{font-size:' + u(20) + ';}'
    + '.cs-sv .cs-col .cs-n{font-size:' + u(72) + ';font-weight:600;letter-spacing:-.05em;line-height:1;margin-top:' + u(6) + ';font-variant-numeric:tabular-nums;}'
    + '.cs-sv .cs-cw{display:flex;align-items:center;gap:' + u(8) + ';margin-top:' + u(14) + ';font-size:' + u(24) + ';font-weight:700;font-variant-numeric:tabular-nums;min-height:' + u(38) + ';}'
    + '.cs-sv .cs-cw img{width:' + u(36) + ';height:' + u(36) + ';}.cs-sv .cs-cw span{color:var(--ink3);font-weight:600;}'
    + '.cs-sv .cs-li{margin-top:' + u(20) + ';display:flex;flex-direction:column;gap:' + u(14) + ';}'
    + '.cs-sv .cs-e{padding-left:' + u(12) + ';border-left:' + u(5) + ' solid var(--cs-c, var(--ink3));border-radius:' + u(3) + ';}'
    + '.cs-sv .cs-e b{font-size:' + u(22) + ';font-weight:700;letter-spacing:-.01em;line-height:1.18;overflow:hidden;overflow-wrap:break-word;-webkit-hyphens:auto;hyphens:auto;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}.cs-sv .cs-e span{display:block;font-size:' + u(20) + ';font-weight:600;color:var(--ink2);font-variant-numeric:tabular-nums;margin-top:' + u(2) + ';}'
    + '.cs-sv .cs-none{margin-top:' + u(24) + ';width:' + u(26) + ';height:' + u(5) + ';border-radius:99px;background:var(--line);font-size:0;}'
    // Music
    + '.cs-sv.cs-musik{background:radial-gradient(90% 120% at 12% 20%, #6B3F74 0%, transparent 60%), radial-gradient(90% 120% at 96% 90%, #24477A 0%, transparent 62%), #1B1730;}'
    + '.cs-sv .cs-blur{position:absolute;inset:-12%;background-size:cover;background-position:center;filter:blur(' + u(70) + ') saturate(1.4) brightness(.6);}'
    + '.cs-sv .cs-cover{position:absolute;left:' + u(M + 8) + ';top:50%;width:' + u(480) + ';height:' + u(480) + ';margin-top:-' + u(240) + ';border-radius:' + u(40) + ';overflow:hidden;background:linear-gradient(140deg, #C77DD8 0%, #7A6BE0 52%, #4C8FE0 100%) center/cover no-repeat;box-shadow:0 ' + u(46) + ' ' + u(90) + ' -' + u(30) + ' rgba(0,0,0,.7), inset 0 0 0 ' + u(1.5) + ' rgba(255,255,255,.14);display:grid;place-items:center;}'
    + '.cs-sv .cs-cover svg{width:38%;height:38%;color:rgba(255,255,255,.9);}'
    + '.cs-sv .cs-meta{position:absolute;left:' + u(M + 8 + 480 + 64) + ';right:' + u(M) + ';top:50%;transform:translateY(-44%);min-width:0;}'
    + '.cs-sv .cs-meta .cs-cap{color:rgba(255,255,255,.7);}'
    + '.cs-sv .cs-meta h2{font-size:' + u(78) + ';font-weight:700;letter-spacing:-.04em;line-height:1.02;margin-top:' + u(14) + ';overflow-wrap:anywhere;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;padding-bottom:.08em;}.cs-sv .cs-meta h3{font-size:' + u(38) + ';font-weight:600;color:rgba(255,255,255,.74);margin-top:' + u(10) + ';letter-spacing:-.015em;}'
    + '.cs-sv .cs-prog{height:' + u(10) + ';border-radius:99px;background:rgba(255,255,255,.2);margin-top:' + u(54) + ';position:relative;}.cs-sv .cs-prog u{position:absolute;left:0;top:0;bottom:0;border-radius:99px;background:#fff;}'
    + '.cs-sv .cs-tt{display:flex;justify-content:space-between;font-size:' + u(23) + ';font-weight:600;color:rgba(255,255,255,.72);margin-top:' + u(12) + ';font-variant-numeric:tabular-nums;}'
    // Energy flow
    + '.cs-sv.cs-energie{background:linear-gradient(160deg, #241D12 0%, #15120C 100%);--ground:#1D170F;}.cs-sv.cs-energie.cs-light{background:linear-gradient(160deg, #F6ECD6 0%, #EEDFC0 100%);--ground:#F3E6CC;}'
    + '.cs-sv .cs-flow{position:absolute;left:0;right:0;top:' + u(56) + ';bottom:' + u(196) + ';}'
    // A node hangs on its point by the centre of its circle (--cs-r = the circle's radius); the text follows below.
    + '.cs-sv .cs-fn{position:absolute;--cs-r:' + u(75) + ';transform:translate(-50%, calc(var(--cs-r) * -1));text-align:center;width:' + u(320) + ';}'
    + '.cs-sv .cs-fn.cs-house{--cs-r:' + u(100) + ';}'
    + '.cs-sv .cs-fn i{display:grid;place-items:center;margin:0 auto;border-radius:50%;border:' + u(4) + ' solid var(--cs-c);background:color-mix(in srgb, var(--cs-c) 20%, var(--ground));color:var(--cs-c);width:' + u(150) + ';height:' + u(150) + ';}'
    + '.cs-sv .cs-fn.cs-house i{width:' + u(200) + ';height:' + u(200) + ';background:var(--ink);border-color:var(--ink);color:var(--ground);}.cs-sv .cs-fn svg{width:46%;height:46%;}'
    + '.cs-sv .cs-fn b{display:block;font-size:' + u(46) + ';font-weight:700;letter-spacing:-.035em;font-variant-numeric:tabular-nums;line-height:1.05;margin-top:' + u(14) + ';}.cs-sv .cs-fn span{font-size:' + u(23) + ';font-weight:600;color:var(--ink2);}'
    // The sun's text stands beside its circle, so the line to the house has room.
    + '.cs-sv .cs-fn.cs-sun{width:auto;transform:translate(-' + u(75) + ', calc(var(--cs-r) * -1));display:flex;align-items:center;gap:' + u(24) + ';text-align:left;}.cs-sv .cs-fn.cs-sun i{margin:0;flex:none;}.cs-sv .cs-fn.cs-sun b{margin-top:0;}'
    // A flow: dots that run the way the power goes (cs-rev = the other way).
    + '.cs-sv .cs-fl{position:absolute;top:62%;height:' + u(8) + ';margin-top:-' + u(4) + ';overflow:hidden;}'
    + '.cs-sv .cs-fl::before{content:"";position:absolute;top:0;bottom:0;left:-' + u(26) + ';right:0;background:radial-gradient(circle at ' + u(4) + ' 50%, var(--cs-c) ' + u(3.6) + ', transparent ' + u(4.2) + ') 0 0/' + u(26) + ' 100% repeat-x;animation:cs-run 1.1s linear infinite;}'
    + '.cs-sv .cs-fl.cs-rev::before{animation-direction:reverse;}'
    + '@keyframes cs-run{to{transform:translateX(' + u(26) + ');}}'
    + '.cs-sv .cs-fl.cs-l{left:calc(17% + ' + u(93) + ');right:calc(50% + ' + u(118) + ');}.cs-sv .cs-fl.cs-r{left:calc(50% + ' + u(118) + ');right:calc(17% + ' + u(93) + ');}'
    + '.cs-sv .cs-fl.cs-v{left:50%;width:' + u(8) + ';height:auto;margin:0 0 0 -' + u(4) + ';top:calc(9% + ' + u(93) + ');bottom:calc(38% + ' + u(118) + ');}'
    + '.cs-sv .cs-fl.cs-v::before{left:0;right:0;top:-' + u(26) + ';bottom:0;background:radial-gradient(circle at 50% ' + u(4) + ', var(--cs-c) ' + u(3.6) + ', transparent ' + u(4.2) + ') 0 0/100% ' + u(26) + ' repeat-y;animation-name:cs-fall;}'
    + '@keyframes cs-fall{to{transform:translateY(' + u(26) + ');}}'
    + '.cs-sv .cs-bal{position:absolute;left:' + u(M) + ';right:' + u(M) + ';bottom:' + u(54) + ';display:grid;grid-template-columns:repeat(4, minmax(0, 1fr));border-top:' + u(2) + ' solid var(--line);padding-top:' + u(22) + ';}'
    // Centred under the flow like everything above it (owner, 20.11.2026); the hairlines between stay.
    + '.cs-sv .cs-bal div{min-width:0;padding:0 ' + u(24) + ';border-left:' + u(2) + ' solid var(--line);text-align:center;}.cs-sv .cs-bal div:first-child{border-left:0;}'
    + '.cs-sv .cs-bal .cs-cap{font-size:' + u(22) + ';letter-spacing:0;text-transform:none;font-weight:600;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
    + '.cs-sv .cs-bal b{display:block;font-size:' + u(46) + ';font-weight:700;margin-top:' + u(2) + ';letter-spacing:-.035em;font-variant-numeric:tabular-nums;line-height:1.1;}'
    // House at rest
    + '.cs-sv.cs-ruhe{background:linear-gradient(160deg, #18291F 0%, #0F1A14 100%);--acc:#8FD3A0;}.cs-sv.cs-ruhe.cs-light{background:linear-gradient(160deg, #E6EFE2 0%, #D6E5D2 100%);--acc:#3F8F55;}'
    + '.cs-sv.cs-ruhe.cs-busy{--acc:#F0A766;}.cs-sv.cs-ruhe.cs-light.cs-busy{--acc:#C8693F;}'
    + '.cs-sv .cs-left{position:absolute;left:' + u(M + 8) + ';top:0;bottom:0;right:' + u(M + 8 + 470 + 48) + ';display:flex;flex-direction:column;justify-content:center;min-width:0;}'
    + '.cs-sv .cs-left .cs-time{font-size:' + u(214) + ';margin-left:-' + u(10) + ';}.cs-sv .cs-left .cs-date{font-size:' + u(34) + ';margin-top:' + u(18) + ';}'
    + '.cs-sv .cs-say{font-size:' + u(52) + ';font-weight:700;letter-spacing:-.03em;margin-top:' + u(60) + ';display:flex;flex-wrap:wrap;align-items:center;gap:0 ' + u(18) + ';line-height:1.15;}'
    + '.cs-sv .cs-say::before{content:"";width:' + u(22) + ';height:' + u(22) + ';border-radius:50%;background:var(--acc);box-shadow:0 0 0 ' + u(9) + ' color-mix(in srgb, var(--acc) 24%, transparent);margin:0 ' + u(8) + ' 0 ' + u(9) + ';flex:none;}'
    + '.cs-sv .cs-say small{flex-basis:100%;font-size:' + u(28) + ';font-weight:600;color:var(--ink2);margin-top:' + u(10) + ';letter-spacing:-.01em;}'
    + '.cs-sv .cs-ppl{display:flex;flex-wrap:wrap;gap:' + u(12) + ';margin-top:' + u(46) + ';}'
    + '.cs-sv .cs-p{display:flex;align-items:center;gap:' + u(12) + ';padding:' + u(8) + ' ' + u(22) + ' ' + u(8) + ' ' + u(8) + ';border-radius:999px;background:var(--plate);font-size:' + u(24) + ';font-weight:600;}.cs-sv .cs-p.cs-away{opacity:.5;}'
    + '.cs-sv .cs-p i{width:' + u(42) + ';height:' + u(42) + ';border-radius:50%;display:grid;place-items:center;font-style:normal;font-size:' + u(21) + ';font-weight:700;color:#1b1916;background:#E8B04A;}.cs-sv .cs-p.cs-away i{background:#9b958c;}'
    // Nothing asks for anyone: the whole thing stands in the middle.
    + '.cs-sv.cs-calm .cs-left{left:' + u(M) + ';right:' + u(M) + ';align-items:center;text-align:center;}.cs-sv.cs-calm .cs-left .cs-time{font-size:' + u(260) + ';margin-left:0;}'
    + '.cs-sv.cs-calm .cs-say{justify-content:center;}.cs-sv.cs-calm .cs-ppl{justify-content:center;}'
    + '.cs-sv .cs-right{position:absolute;right:' + u(M + 8) + ';top:0;bottom:0;width:' + u(470) + ';display:flex;flex-direction:column;justify-content:center;gap:' + u(14) + ';}'
    + '.cs-sv .cs-it{display:flex;align-items:center;gap:' + u(20) + ';background:var(--plate);border-radius:' + u(26) + ';padding:' + u(20) + ' ' + u(24) + ';min-width:0;}'
    + '.cs-sv .cs-it i{width:' + u(18) + ';height:' + u(18) + ';border-radius:50%;flex:none;background:var(--cs-c);}'
    + '.cs-sv .cs-it div{min-width:0;}.cs-sv .cs-it b{display:block;font-size:' + u(26) + ';font-weight:700;letter-spacing:-.015em;line-height:1.2;}.cs-sv .cs-it span{font-size:' + u(22) + ';font-weight:600;color:var(--ink2);}'
    // Cameras: one still picture per camera, the grid as large as the count needs.
    + '.cs-sv.cs-kameras{background:linear-gradient(160deg, #1A2026 0%, #0E1114 100%);}'
    + '.cs-sv.cs-kameras .sv-head{top:' + u(44) + ';align-items:center;}.cs-sv.cs-kameras .sv-head .cs-time{font-size:' + u(76) + ';}.cs-sv.cs-kameras .sv-head .cs-date{display:none;}'
    + '.cs-sv.cs-kameras .cs-sum{font-size:' + u(25) + ';}.cs-sv.cs-kameras .cs-sum b{font-size:' + u(52) + ';margin-bottom:' + u(4) + ';}'
    + '.cs-sv.cs-kameras .cs-body{top:' + u(168) + ';bottom:' + u(40) + ';left:' + u(40) + ';right:' + u(40) + ';}'
    + '.cs-sv .cs-cams{position:absolute;inset:0;display:grid;grid-template-columns:repeat(var(--cs-cols), minmax(0, 1fr));grid-template-rows:repeat(var(--cs-rows), minmax(0, 1fr));gap:' + u(12) + ';}'
    + '.cs-sv .cs-cam{position:relative;display:block;min-width:0;min-height:0;border:0;padding:0;font:inherit;color:inherit;text-align:left;cursor:pointer;border-radius:' + u(28) + ';overflow:hidden;'
    +   'background:linear-gradient(160deg, #2C353D, #1B2126);transition:transform .16s ease;-webkit-tap-highlight-color:transparent;}'
    + '.cs-sv .cs-cam:active{transform:scale(var(--casora-press-scale, .97));}'
    + '.cs-sv .cs-shot{position:absolute;inset:0;background-size:cover;background-position:center;}'
    // Until (or where) a camera gives no picture: its symbol, quiet in the middle.
    + '.cs-sv .cs-camic{position:absolute;left:50%;top:50%;transform:translate(-50%, -60%);opacity:.3;--mdc-icon-size:' + u(64) + ';}.cs-sv .cs-camic ha-icon{display:flex;}'
    + '.cs-sv .cs-cam b{position:absolute;left:0;right:0;bottom:0;padding:' + u(44) + ' ' + u(24) + ' ' + u(18) + ';font-size:' + u(25) + ';font-weight:700;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'
    +   'background:linear-gradient(transparent, rgba(0,0,0,.62));}'
    // Month calendar: paper by day, dark by night. No boxes: a hairline per week, today as a filled circle.
    + '.cs-sv.cs-kalender{background:#191613;}.cs-sv.cs-kalender.cs-light{background:#F2EBE0;}'
    + '.cs-sv .cs-kh{position:absolute;left:' + u(M) + ';right:' + u(M) + ';top:' + u(52) + ';display:flex;justify-content:space-between;align-items:flex-start;gap:' + u(24) + ';}'
    + '.cs-sv .cs-kt{display:flex;align-items:baseline;gap:' + u(22) + ';min-width:0;}'
    + '.cs-sv .cs-km{font-size:' + u(92) + ';font-weight:700;letter-spacing:-.05em;line-height:1;color:var(--acc);margin-left:-' + u(4) + ';}.cs-sv .cs-ky{font-size:' + u(92) + ';font-weight:300;letter-spacing:-.05em;line-height:1;color:var(--ink3);font-variant-numeric:tabular-nums;}'
    + '.cs-sv .cs-kc{text-align:right;flex:none;}.cs-sv .cs-kc .cs-time{font-size:' + u(92) + ';}.cs-sv .cs-kc .cs-date{font-size:' + u(25) + ';margin-top:' + u(12) + ';}'
    + '.cs-sv .cs-kg{position:absolute;left:' + u(M) + ';right:' + u(M) + ';top:' + u(206) + ';bottom:' + u(44) + ';display:grid;grid-template-columns:repeat(7, minmax(0, 1fr));'
    +   'grid-template-rows:auto repeat(var(--cs-weeks), minmax(0, 1fr));}'
    + '.cs-sv .cs-kw{font-size:' + u(21) + ';font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--ink3);padding:0 ' + u(8) + ' ' + u(14) + ';}'
    + '.cs-sv .cs-kd{min-width:0;min-height:0;overflow:hidden;padding:' + u(10) + ' ' + u(8) + ' ' + u(4) + ';border-top:' + u(2) + ' solid var(--line);display:flex;flex-direction:column;gap:' + u(5) + ';}'
    + '.cs-sv .cs-kd > b{display:grid;place-items:center;min-width:' + u(50) + ';height:' + u(50) + ';align-self:flex-start;margin-left:-' + u(9) + ';border-radius:99px;font-size:' + u(32) + ';font-weight:600;letter-spacing:-.03em;font-variant-numeric:tabular-nums;flex:none;}'
    // A day of the next or last month stays dimmed, past or not (the 26th of October beside today, the 26th).
    + '.cs-sv .cs-kd.cs-kpast > b{color:var(--ink2);}.cs-sv .cs-kd.cs-kout > b{color:var(--ink3);font-weight:500;}.cs-sv .cs-kd.cs-kpast .cs-kl{opacity:.55;}'
    + '.cs-sv .cs-kd.cs-ktoday > b{background:var(--acc);color:#fff;font-weight:700;}.cs-sv:not(.cs-light) .cs-kd.cs-ktoday > b{color:#191613;}'
    + '.cs-sv .cs-kl{display:flex;flex-direction:column;gap:' + u(3) + ';min-width:0;}'
    + '.cs-sv .cs-ke{display:flex;align-items:center;gap:' + u(8) + ';min-width:0;font-size:' + u(19.5) + ';font-weight:600;line-height:1.2;}'
    + '.cs-sv .cs-ke i{flex:none;width:' + u(10) + ';height:' + u(10) + ';border-radius:50%;background:var(--cs-c);}'
    + '.cs-sv .cs-ke em{font-style:normal;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;}'
    + '.cs-sv .cs-kmore{font-size:' + u(19) + ';font-weight:700;color:var(--ink3);padding-left:' + u(18) + ';}'
    // Two weeks: the span as the big thing, as large as its length leaves room beside the clock (--cs-res: what the
    // clock and the margins take); each title with its time under it.
    + '.cs-sv .cs-kh{--cs-res:' + u(2 * M + 24 + 390) + ';}'
    + '.cs-sv .cs-km.cs-kr{white-space:nowrap;font-size:clamp(' + u(56) + ', calc((100cqw - var(--cs-res)) / var(--cs-n, 16) / .54), ' + u(92) + ');}'
    + '.cs-sv .cs-kn{display:none;font-size:' + u(19) + ';font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--ink3);}'
    + '.cs-sv .cs-k2 .cs-kl{gap:' + u(6) + ';}'
    + '.cs-sv .cs-ke2{display:grid;grid-template-columns:auto minmax(0, 1fr);gap:0 ' + u(8) + ';align-items:center;font-size:' + u(20) + ';line-height:1.12;}'
    + '.cs-sv .cs-ke2 small{grid-column:2;font-size:' + u(19) + ';font-weight:600;line-height:1.08;color:var(--ink2);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
    // The cover's colour as a soft wash from the top left (over the ground, under the content).
    + '.cs-sv .cs-tint{position:absolute;inset:0;pointer-events:none;background:radial-gradient(130% 110% at 12% 0%, var(--cs-t) 0%, transparent 72%);opacity:.42;transition:opacity 2s ease;}'
    + '.cs-sv.cs-light .cs-tint{opacity:.2;}'
    + '@media (prefers-reduced-motion: reduce){.cs-sv .cs-photo, .cs-sv .cs-fl::before{animation:none;}}'
    // Less wide than 16:10 (a 4:3 tablet): the widest pieces give way.
    + '@container (aspect-ratio < 1.45){.cs-sv .cs-cover{width:' + u(400) + ';height:' + u(400) + ';margin-top:-' + u(200) + ';}.cs-sv .cs-meta{left:' + u(M + 8 + 400 + 50) + ';}.cs-sv .cs-meta h2{font-size:' + u(62) + ';}'
    + '.cs-sv .cs-wk{width:' + u(380) + ';}.cs-sv .cs-wnow b{font-size:' + u(200) + ';}.cs-sv .cs-wnow img{width:' + u(124) + ';height:' + u(124) + ';}'
    + '.cs-sv .cs-km, .cs-sv .cs-ky{font-size:' + u(76) + ';}.cs-sv .cs-right{width:' + u(400) + ';}.cs-sv .cs-left{right:' + u(M + 8 + 400 + 40) + ';}.cs-sv .cs-left .cs-time{font-size:' + u(184) + ';}'
    + '.cs-sv.cs-calm .cs-left{right:' + u(M) + ';}.cs-sv.cs-calm .cs-left .cs-time{font-size:' + u(240) + ';}'
    + '.cs-sv .cs-col .cs-n{font-size:' + u(60) + ';}.cs-sv .cs-e b{font-size:' + u(20) + ';}.cs-sv .cs-sum b{font-size:' + u(72) + ';}}'
    // Narrow boxes (portrait tablet): one under the other.
    + '@container (aspect-ratio < 1){.cs-sv .cs-top{flex-direction:column;}.cs-sv .cs-wx{text-align:left;padding-top:0;}.cs-sv .cs-wx .cs-t{justify-content:flex-start;}'
    + '.cs-sv .cs-top .cs-time{font-size:' + u(190) + ';}.cs-sv .cs-words{font-size:' + u(118) + ';}.cs-sv .sv-bar{flex-direction:column;align-items:flex-start;}.cs-sv .cs-name{text-align:left;}'
    + '.cs-sv .sv-bar .cs-time{font-size:' + u(160) + ';}'
    + '.cs-sv .sv-head{flex-direction:column-reverse;gap:' + u(34) + ';}.cs-sv .sv-head .cs-clock:last-child{text-align:left;}.cs-sv .cs-body{top:' + u(420) + ';}.cs-sv.cs-linie .cs-body{top:' + u(420) + ';bottom:' + u(60) + ';--cs-pw:' + LINE.tall.w + '%;--cs-ly:calc(' + u(168) + ' + (' + LINE.tall.rows + ' - var(--cs-nt, 1)) * ' + u(31) + ');}.cs-sv.cs-woche .cs-body{top:' + u(400) + ';}'
    // Weather: the clock leaves, the days go under the current weather, the curve stays at the bottom.
    + '.cs-sv.cs-wetter .cs-corner{display:none;}.cs-sv .cs-wk{left:' + u(M) + ';right:' + u(M) + ';width:auto;top:' + u(400) + ';}.cs-sv .cs-wd{height:' + u(64) + ';}'
    // Week: seven rows instead of seven columns.
    + '.cs-sv .cs-cols{grid-template-columns:minmax(0, 1fr);grid-auto-rows:minmax(0, 1fr);gap:' + u(6) + ';}'
    + '.cs-sv .cs-col{flex-direction:row;align-items:center;gap:' + u(18) + ';padding:' + u(8) + ' ' + u(22) + ';}.cs-sv .cs-col .cs-cap{width:' + u(74) + ';flex:none;}'
    + '.cs-sv .cs-col .cs-n{width:' + u(70) + ';flex:none;margin:0;font-size:' + u(50) + ';}.cs-sv .cs-cw{width:' + u(150) + ';flex:none;margin:0;}'
    + '.cs-sv .cs-li{flex-direction:row;flex:1;min-width:0;margin:0;}.cs-sv .cs-e{flex:0 1 ' + u(230) + ';min-width:0;}.cs-sv .cs-none{margin:0;}'
    // Day line: narrower cards. Music and the house at rest: one under the other.
    + '.cs-sv .cs-lay.cs-wide{display:none;}.cs-sv .cs-lay.cs-tall{display:block;}.cs-sv .cs-r{padding:' + u(6) + ' ' + u(10) + ' ' + u(7) + ';}.cs-sv .cs-r b{font-size:' + u(21) + ';}.cs-sv .cs-r span{font-size:' + u(19) + ';}'
    + '.cs-sv .cs-cover{left:50%;top:' + u(230) + ';width:' + u(480) + ';height:' + u(480) + ';margin:0 0 0 -' + u(240) + ';}.cs-sv .cs-meta{left:' + u(M + 8) + ';top:' + u(790) + ';transform:none;}.cs-sv .cs-meta h2{font-size:' + u(64) + ';}'
    + '.cs-sv .cs-left, .cs-sv.cs-calm .cs-left{position:static;display:block;padding:' + u(190) + ' ' + u(M + 8) + ' 0;text-align:left;}.cs-sv.cs-calm .cs-left{padding-top:' + u(380) + ';}'
    + '.cs-sv .cs-left .cs-time, .cs-sv.cs-calm .cs-left .cs-time{font-size:' + u(200) + ';margin-left:-' + u(10) + ';}.cs-sv.cs-calm .cs-say, .cs-sv.cs-calm .cs-ppl{justify-content:flex-start;}'
    + '.cs-sv .cs-right{position:static;width:auto;padding:' + u(56) + ' ' + u(M + 8) + ' 0;}'
    // Energy: the balance in two rows.
    + '.cs-sv .cs-bal{grid-template-columns:repeat(2, minmax(0, 1fr)) !important;row-gap:' + u(22) + ';}.cs-sv .cs-bal div:nth-child(odd){border-left:0;}.cs-sv .cs-flow{bottom:' + u(300) + ';top:' + u(260) + ';}'
    + '.cs-sv .cs-fn{width:' + u(240) + ';--cs-r:' + u(60) + ';}.cs-sv .cs-fn i{width:' + u(120) + ';height:' + u(120) + ';}.cs-sv .cs-fn.cs-house{--cs-r:' + u(80) + ';}.cs-sv .cs-fn.cs-house i{width:' + u(160) + ';height:' + u(160) + ';}'
    + '.cs-sv .cs-fn b{font-size:' + u(38) + ';}.cs-sv .cs-fn.cs-sun{transform:translate(-' + u(60) + ', calc(var(--cs-r) * -1));}'
    + '.cs-sv .cs-fl.cs-l{left:calc(17% + ' + u(76) + ');right:calc(50% + ' + u(96) + ');}.cs-sv .cs-fl.cs-r{left:calc(50% + ' + u(96) + ');right:calc(17% + ' + u(76) + ');}.cs-sv .cs-fl.cs-v{top:calc(9% + ' + u(76) + ');bottom:calc(38% + ' + u(96) + ');}'
    // Cameras: fewer columns. Calendar: dots only, no titles.
    + '.cs-sv.cs-kameras .sv-head{flex-direction:row;}.cs-sv.cs-kameras .sv-head .cs-clock:last-child{text-align:right;}.cs-sv.cs-kameras .cs-body{top:' + u(168) + ';}'
    + '.cs-sv .cs-ends{font-size:' + u(19) + ';}.cs-sv .cs-ends b{display:block;margin:0;font-size:' + u(27) + ';}.cs-sv .cs-ends span:nth-child(2){font-size:' + u(20) + ';text-align:center;}.cs-sv .cs-ends span:last-child{text-align:right;}'
    + '.cs-sv .cs-cams{grid-template-columns:repeat(var(--cs-pcols), minmax(0, 1fr));grid-template-rows:repeat(var(--cs-prows), minmax(0, 1fr));}'
    + '.cs-sv .cs-kh{flex-direction:column-reverse;gap:' + u(34) + ';}.cs-sv .cs-kc{text-align:left;}.cs-sv .cs-kg{top:' + u(380) + ';}.cs-sv .cs-km, .cs-sv .cs-ky{font-size:' + u(84) + ';}'
    + '.cs-sv .cs-kl{flex-direction:row;flex-wrap:wrap;gap:' + u(6) + ';}.cs-sv .cs-ke em{display:none;}.cs-sv .cs-kmore{padding-left:0;}'
    // Two weeks: a column per week, a row per day (the number and its weekday at the left, the titles with their
    // time in front beside them), so the titles stay readable on a narrow box.
    + '.cs-sv .cs-kh{--cs-res:' + u(2 * M) + ';}'
    + '.cs-sv .cs-kg.cs-k2{grid-template-columns:repeat(2, minmax(0, 1fr));grid-template-rows:repeat(7, minmax(0, 1fr));grid-auto-flow:column;column-gap:' + u(28) + ';}.cs-sv .cs-k2 .cs-kw{display:none;}'
    + '.cs-sv .cs-k2 .cs-kd{display:grid;grid-template-columns:max(' + u(62) + ', calc(var(--cs-wd, 2) * ' + u(15.5) + ' + ' + u(8) + ')) minmax(0, 1fr);grid-template-rows:auto 1fr;column-gap:' + u(12) + ';row-gap:' + u(2) + ';padding:' + u(10) + ' 0 ' + u(4) + ';}'
    + '.cs-sv .cs-k2 .cs-kd > b{margin-left:0;justify-self:start;}.cs-sv .cs-k2 .cs-kn{display:block;grid-column:1;grid-row:2;padding-left:' + u(6) + ';}'
    + '.cs-sv .cs-k2 .cs-kl{grid-column:2;grid-row:1 / span 2;flex-direction:column;flex-wrap:nowrap;gap:' + u(3) + ';padding-top:' + u(4) + ';}'
    + '.cs-sv .cs-k2 .cs-ke2{display:flex;gap:' + u(8) + ';}.cs-sv .cs-k2 .cs-ke em{display:block;}.cs-sv .cs-k2 .cs-ke2 small{order:1;flex:none;}.cs-sv .cs-k2 .cs-ke2 em{order:2;}'
    + '.cs-sv .cs-k2 .cs-kmore{padding-left:' + u(18) + ';}}';

  var clock = function (ctx) {
    return '<div class="cs-clock"><div class="cs-time">' + esc(timeText(ctx.now)) + '</div><div class="cs-date">' + esc(dateText(ctx.now)) + '</div></div>';
  };
  var bar = function (ctx, name, sub) {
    var wx = ctx.wx;
    return '<div class="cs-shade"></div><div class="sv-bar"><div><div class="cs-time">' + esc(timeText(ctx.now)) + '</div>'
      + '<div class="cs-date">' + esc(dateText(ctx.now)) + (wx && wx.temp != null ? ' · ' + wx.temp + '° ' + esc(wx.text.toLowerCase()) : '') + '</div></div>'
      + (name ? '<div class="cs-name"><b data-no-i18n>' + esc(name) + '</b>' + esc(sub || '') + '</div>' : '') + '</div>';
  };
  // The night around now, from today's rise and set: { start: the sunset it began with, end: the coming sunrise };
  // null by day. Before midnight the sunrise is tomorrow's, after midnight the sunset was yesterday's.
  S.nightSpan = function (now, rise, set) {
    var t = +now, day = 86400000;
    if (!isFinite(rise) || !isFinite(set) || set <= rise) return null;
    if (t >= set) return { start: set, end: rise + day };
    if (t < rise) return { start: set - day, end: rise };
    return null;
  };
  // The share of the night that has passed (0 at sunset, 1 at sunrise).
  S.nightShare = function (now, rise, set) {
    var n = S.nightSpan(now, rise, set);
    return n ? Math.max(0, Math.min(1, (+now - n.start) / (n.end - n.start))) : null;
  };
  var STARS = (function () {
    var r = rng(7), out = '';
    for (var i = 0; i < 90; i++) out += '<circle cx="' + (r() * 1312).toFixed(1) + '" cy="' + (r() * 520).toFixed(1) + '" r="' + (0.7 + r() * 1.5).toFixed(2) + '" fill="#fff" opacity="' + (0.18 + r() * 0.6).toFixed(2) + '"/>';
    return '<svg class="cs-bg cs-stars" viewBox="0 0 1312 820" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' + out + '</svg>';
  })();
  var DRAW = {
    // The sky is the picture: its colours follow the sun's height, the sun sits on its path between rise and set;
    // by night the stars are out and the moon takes the same path.
    himmel: function (ctx) {
      var sun = ctx.sun, share = sun ? S.dayShare(ctx.now, sun.rise, sun.set) : null;
      var sky = S.sky(sun ? share : 0.5), wx = ctx.wx;
      var night = sun ? share == null : false, span = night ? S.nightSpan(ctx.now, sun.rise, sun.set) : null;
      var moonAt = span ? S.nightShare(ctx.now, sun.rise, sun.set) : null;
      var W = 1168, H = 300, x0 = 0, x1 = W, top = 34;
      // Quadratic curve from the left end over the top to the right end; the point for a share of the day.
      var at = function (t) { var a = 1 - t; return [a * a * x0 + 2 * a * t * (W / 2) + t * t * x1, a * a * H + 2 * a * t * (top * 2 - H) + t * t * H]; };
      var pts = function (to) { var d = ''; for (var i = 0; i <= 60; i++) { var p = at(to * i / 60); d += (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); } return d; };
      var p = share == null ? null : at(share), q = moonAt == null ? null : at(moonAt);
      // The minutes until the path's right end: sunset by day, the coming sunrise by night.
      var left = sun && share != null ? Math.round((sun.set - +ctx.now) / 60000) : span ? Math.max(0, Math.round((span.end - +ctx.now) / 60000)) : null;
      // Whole sentences with placeholders: the translation works on the finished text.
      var mid = left == null ? T('Nacht')
        : span ? (left >= 60 ? T('Noch {h} Std. {m} Min. bis Sonnenaufgang'.replace('{h}', Math.floor(left / 60)).replace('{m}', left % 60)) : T('Noch {m} Min. bis Sonnenaufgang'.replace('{m}', left)))
        : left >= 60 ? T('Noch {h} Std. {m} Min. Tageslicht'.replace('{h}', Math.floor(left / 60)).replace('{m}', left % 60))
        : T('Noch {m} Min. Tageslicht'.replace('{m}', left));
      // The labels name the two ends of the path that is drawn: by day sunrise and sunset, by night (the moon's
      // way) the sunset the night began with and the coming sunrise (#229).
      var ends = span ? [T('Untergang'), span.start, T('Aufgang'), span.end] : sun ? [T('Aufgang'), sun.rise, T('Untergang'), sun.set] : null;
      return '<div class="cs-bg" style="background:linear-gradient(180deg, ' + sky[0] + ' 0%, ' + sky[1] + ' 36%, ' + sky[2] + ' 74%, ' + sky[3] + ' 100%)"></div>' + (night ? STARS : '') + '<div class="cs-in">'
        + '<div class="cs-top"><div><div class="cs-time">' + esc(timeText(ctx.now)) + '</div><div class="cs-date">' + esc(dateText(ctx.now)) + '</div></div>'
        + (wx ? '<div class="cs-wx"><div class="cs-t"><img src="' + esc(wx.icon) + '" alt="">' + (wx.temp != null ? wx.temp + '°' : '') + '</div><p>' + esc(wx.text) + '</p></div>' : '') + '</div>'
        + (sun ? '<div class="cs-arc"><svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">'
          + '<defs><radialGradient id="cs-glow"><stop offset="0" stop-color="#FFF3D6" stop-opacity=".95"/><stop offset=".22" stop-color="#FFE0A6" stop-opacity=".55"/><stop offset="1" stop-color="#FFD9A0" stop-opacity="0"/></radialGradient>'
          + '<radialGradient id="cs-mglow"><stop offset="0" stop-color="#DCE6FF" stop-opacity=".5"/><stop offset="1" stop-color="#DCE6FF" stop-opacity="0"/></radialGradient></defs>'
          + '<line x1="0" y1="' + H + '" x2="' + W + '" y2="' + H + '" stroke="rgba(255,255,255,.55)" stroke-width="2" vector-effect="non-scaling-stroke"/>'
          + '<path d="' + pts(1) + '" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="3" stroke-dasharray="1 11" stroke-linecap="round" vector-effect="non-scaling-stroke"/>'
          + (p ? '<path class="cs-done" d="' + pts(share) + '" fill="none" stroke="#FFE9BE" stroke-width="5" stroke-linecap="round" vector-effect="non-scaling-stroke"/>'
            + '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="130" fill="url(#cs-glow)"/><circle class="cs-sun" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="27" fill="#FFF6DF"/>' : '')
          + (q ? '<circle cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="96" fill="url(#cs-mglow)"/><circle class="cs-moon" cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="22" fill="#F1F4FF"/>' : '')
          + '</svg></div><div class="cs-ends"><span>' + esc(ends[0]) + ' <b>' + esc(hm(ends[1])) + '</b></span><span>' + esc(mid) + '</span><span>' + esc(ends[2]) + ' <b>' + esc(hm(ends[3])) + '</b></span></div>' : '')
        + '</div>';
    },
    // A drawn landscape; a new one every ten minutes, dark ones by night.
    land: function (ctx) {
      var night = ctx.sun ? S.dayShare(ctx.now, ctx.sun.rise, ctx.sun.set) == null : (ctx.now.getHours() < 7 || ctx.now.getHours() >= 20);
      var pool = S.SCENES.filter(function (s) { return !!s.stars === night; });
      if (!pool.length) pool = S.SCENES;
      var s = pool[Math.floor(+ctx.now / 600000) % pool.length];
      return S.landSvg(s, 1312, 820).replace('<svg ', '<svg class="cs-bg" data-scene="' + esc(s.id) + '" ') + '<div class="cs-in">' + bar(ctx, T(s.name), T('Landschaften')) + '</div>';
    },
    // The dashboard's own room photos, slowly moving; a new room every two minutes.
    fotos: function (ctx) {
      var rooms = ctx.rooms || [];
      if (!rooms.length) return DRAW.land(ctx);
      var r = rooms[Math.floor(+ctx.now / 120000) % rooms.length];
      return '<div class="cs-photo" style="background-image:url(&quot;' + esc(cssUrl(r.url)) + '&quot;)"></div><div class="cs-in">' + bar(ctx, r.name, '') + '</div>';
    },
    wort: function (ctx) {
      var wx = ctx.wx, lines = S.words(langOf(), ctx.now.getHours(), ctx.now.getMinutes());
      return '<div class="cs-in"><div class="cs-words" data-no-i18n>' + lines.map(function (l) { return '<span' + (l.acc ? ' class="cs-acc"' : '') + '>' + esc(l.t) + '</span>'; }).join('') + '</div>'
        + '<div class="cs-foot"><div><b>' + esc(timeText(ctx.now)) + '</b> · ' + esc(dateText(ctx.now)) + '</div>'
        + (wx && wx.temp != null ? '<div class="cs-fw"><img src="' + esc(wx.icon) + '" alt="">' + wx.temp + '°</div>' : '') + '</div></div>';
    },
  };
  // What the screensaver is about, big at the top left (accent = the line under it in the accent colour); the clock
  // at the top right. Without a title the clock stands at the left.
  var head = function (ctx, title, sub, accent) {
    return '<div class="sv-head">' + (title ? '<div class="cs-sum' + (accent ? ' cs-accent' : '') + '"><b>' + esc(title) + '</b>' + esc(sub || '') + '</div>' : '') + clock(ctx) + '</div>';
  };
  var clockOf = function (ts) { return hm(ts); };
  // Now, the coming 24 hours as a curve with the rain under it, and the coming days.
  DRAW.wetter = function (ctx) {
    var wx = ctx.wx;
    if (!wx) return DRAW.himmel(ctx);
    var hours = (ctx.hourly || []).slice(0, 24), days = (ctx.daily || []).slice(0, 5);
    var W = 1168, H = 230, base = H - 6;
    var curve = '';
    var temps = hours.map(function (x) { return Number(x.temperature); }).filter(isFinite);
    if (temps.length >= 6) {
      var lo = Math.min.apply(null, temps), hi = Math.max.apply(null, temps), span = Math.max(1, hi - lo);
      var X = function (i) { return i / (hours.length - 1) * W; }, Y = function (t) { return 44 + (1 - (t - lo) / span) * (base - 120); };
      var pts = [], rain = '', maxR = Math.max.apply(null, hours.map(function (x) { return Number(x.precipitation) || 0; }).concat([0]));
      hours.forEach(function (x, i) {
        var t = Number(x.temperature);
        if (isFinite(t)) pts.push([X(i), Y(t)]);
        var r = Number(x.precipitation) || 0;
        if (r > 0 && maxR > 0) {
          var bh = 12 + r / maxR * 58;
          rain += '<rect x="' + (X(i) - 13).toFixed(1) + '" y="' + (base - bh).toFixed(1) + '" width="26" height="' + bh.toFixed(1) + '" rx="8" fill="#DDF0FF" opacity=".9"/>';
        }
      });
      // A soft line through the hours (Catmull-Rom: each piece leaves and arrives in its neighbours' direction).
      var d = pts.map(function (p, i) {
        if (!i) return 'M' + p[0].toFixed(1) + ' ' + p[1].toFixed(1);
        var a = pts[i - 2] || pts[i - 1], o = pts[i - 1], n = pts[i + 1] || p;
        return 'C' + (o[0] + (p[0] - a[0]) / 6).toFixed(1) + ' ' + (o[1] + (p[1] - a[1]) / 6).toFixed(1) + ' ' + (p[0] - (n[0] - o[0]) / 6).toFixed(1) + ' ' + (p[1] - (n[1] - o[1]) / 6).toFixed(1)
          + ' ' + p[0].toFixed(1) + ' ' + p[1].toFixed(1);
      }).join('');
      var iLo = temps.indexOf(lo), iHi = temps.indexOf(hi);
      var pct = function (x) { return Math.min(97, Math.max(3, x / W * 100)).toFixed(1); };
      curve = '<div class="cs-curve"><svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">'
        + '<defs><linearGradient id="cs-tf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".34"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>'
        + '<path d="' + d + 'L' + W + ' ' + base + 'L0 ' + base + 'Z" fill="url(#cs-tf)"/>' + rain
        + '<path d="' + d + '" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" vector-effect="non-scaling-stroke"/>'
        + '<line x1="0" y1="' + base + '" x2="' + W + '" y2="' + base + '" stroke="rgba(255,255,255,.4)" stroke-width="2" vector-effect="non-scaling-stroke"/>'
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
      var bar2 = isFinite(lo2) && isFinite(hi2) ? '<i><u style="left:' + ((lo2 - mn) / sp * 100).toFixed(0) + '%;right:' + ((mx - hi2) / sp * 100).toFixed(0) + '%"></u></i>' : '<i></i>';
      return '<div class="cs-wd"><b>' + esc(dayName(Date.parse(x.datetime), true)) + '</b><img src="' + esc(wxIcon(x.condition)) + '" alt=""><span>' + (isFinite(lo2) ? Math.round(lo2) + '°' : '') + '</span>'
        + bar2 + '<em>' + (isFinite(hi2) ? Math.round(hi2) + '°' : '') + '</em></div>';
    }).join('') + '</div>' : '';
    return '<div class="cs-in"><div class="cs-wnow"><div class="cs-wt"><img src="' + esc(wx.icon) + '" alt=""><b>' + (wx.temp != null ? wx.temp + '°' : '') + '</b></div><p>' + esc(wx.text) + '</p></div>'
      + '<div class="cs-corner"><div class="cs-time">' + esc(timeText(ctx.now)) + '</div><div class="cs-date">' + esc(dateText(ctx.now)) + '</div></div>'
      + week + curve + '</div>';
  };
  // The day line (#233). A window that travels with the clock: three hours back, fifteen ahead, the same scale at
  // every hour. Now stands still at a sixth of the line, what is over leaves at the left (the finished day takes no
  // room), the evening shows tomorrow morning. Cropping 6–24 to now–24 instead would change the scale every hour and
  // end at midnight. S.dayLine is the model: { from, to, now (%), running, next, lead, items: [{ e, x, x2, past, lead }] }.
  var endOf = function (e) { return e.end && e.end > e.start ? e.end : e.start; };
  S.dayLine = function (events, now) {
    var t = +now, h = 3600000, from = t - LINE.back * h, to = t + LINE.ahead * h;
    var pos = function (x) { return (x - from) / (to - from) * 100; };
    var timed = (events || []).filter(function (e) { return e && !e.allDay && isFinite(e.start); }).sort(function (a, b) { return a.start - b.start; });
    // What leads: an appointment that is running (the one that ends first), else the next one.
    var running = timed.filter(function (e) { return e.start <= t && endOf(e) > t; }).sort(function (a, b) { return endOf(a) - endOf(b); })[0] || null;
    var next = timed.filter(function (e) { return e.start > t; })[0] || null;
    var lead = running || next;
    var items = timed.filter(function (e) { return e.start < to && endOf(e) > from; }).slice(0, 24).map(function (e) {
      return { e: e, x: pos(e.start), x2: pos(endOf(e)), past: endOf(e) <= t, lead: e === lead };
    });
    return { from: from, to: to, now: pos(t), pos: pos, running: running, next: next, lead: lead, items: items };
  };
  // The plates: an appointment gets a plate of width w (%) at its start; those that begin while that plate would
  // still stand there share it, a row each, the earliest on top (close appointments never shrink to a dot without
  // a title). So plates never overlap. More rows than a plate holds: the least important go (what is over first,
  // then the latest; never the one that leads) and are counted. → [{ left, x, rows: [it], more }]
  S.plates = function (items, w, rows) {
    var out = [], cur = null;
    var weight = function (it) { return it.lead ? 3e9 : it.past ? it.x : 2e9 - it.x; };
    items.forEach(function (it) {
      var left = Math.max(0, Math.min(100 - w, it.x));
      if (cur && left < cur.left + w + LINE.gap) { cur.rows.push(it); return; }
      cur = { left: left, x: Math.max(0, Math.min(100, it.x)), rows: [it], more: 0 };
      out.push(cur);
    });
    out.forEach(function (p) {
      if (p.rows.length <= rows) return;
      // Never a bare +1: the line that would say so takes a title's place, so at least two are counted.
      var keep = p.rows.slice().sort(function (a, b) { return weight(b) - weight(a); }).slice(0, rows - 1);
      p.more = p.rows.length - keep.length;
      p.rows = p.rows.filter(function (it) { return keep.indexOf(it) > -1; });
    });
    return out;
  };
  DRAW.linie = function (ctx) {
    // By the whole minute: the line moves on with the clock's digits, not with every repaint in between.
    var now = Math.floor(+ctx.now / 60000) * 60000, m = S.dayLine(ctx.events, now), cals = ctx.cals || [];
    var d0 = new Date(now), tomorrow = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + 1);
    var tone = function (e) { var i = cals.indexOf(e.cal); return TONES[(i < 0 ? 0 : i) % TONES.length]; };
    // The headline: what is running leads (until when), else the next one (in how long; tomorrow or a later day
    // with its time), else a calm line.
    var title, sub = '';
    if (m.running) {
      var end = endOf(m.running);
      title = m.running.title;
      sub = T('jetzt') + ' · ' + T('bis {t}'.replace('{t}', (sameDay(end, now) ? '' : dayName(end, true) + ' ') + clockOf(end)));
    } else if (m.next) {
      var mins = Math.round((m.next.start - now) / 60000);
      title = m.next.title;
      sub = sameDay(m.next.start, now) ? (mins >= 60 ? T('in {h} Std. {m} Min.'.replace('{h}', Math.floor(mins / 60)).replace('{m}', mins % 60)) : T('in {m} Min.'.replace('{m}', mins)))
        : sameDay(m.next.start, tomorrow) ? T('Morgen') + ' · ' + clockOf(m.next.start) : dayName(m.next.start) + ' ' + clockOf(m.next.start);
    } else {
      title = (ctx.events || []).some(function (e) { return !e.allDay && sameDay(e.start, now); }) ? T('Heute nichts mehr') : T('Heute keine Termine');
    }
    var pct = function (v) { return Math.max(0, Math.min(100, v)).toFixed(2); };
    // The hours: every third one; midnight carries the coming day's name.
    var ticks = '', c = new Date(m.from);
    c.setMinutes(0, 0, 0);
    for (var q = +c; q <= m.to; q += 3600000) {
      var dq = new Date(q), hq = dq.getHours();
      if (q < m.from || dq.getMinutes() || hq % 3) continue;
      ticks += '<div class="cs-tick' + (hq ? '' : ' cs-day') + '" style="left:' + pct(m.pos(q)) + '%">' + esc(hq ? hq : dayName(q, true)) + '</div>';
    }
    var segs = m.items.map(function (it) {
      var a = Math.max(0, it.x), b = Math.min(100, it.x2);
      return '<div class="cs-seg' + (it.past ? ' cs-past' : '') + '" style="left:' + pct(a) + '%;width:' + pct(b - a) + '%"></div>';
    }).join('');
    var used = {};
    var lay = function (name) {
      var cfg = LINE[name], html = '';
      used[name] = 1;
      S.plates(m.items, cfg.w, cfg.rows).forEach(function (p) {
        var one = p.rows.length === 1 && !p.more, cls = (p.rows.every(function (it) { return it.past; }) ? ' cs-past' : '') + (one && p.rows[0].lead ? ' cs-lead' : '');
        used[name] = Math.max(used[name], p.rows.length + (p.more ? 1 : 0));
        html += '<i class="cs-stem" style="left:' + pct(p.x) + '%"></i><div class="cs-ev' + cls + '" style="left:' + pct(p.left) + '%">' + p.rows.map(function (it) {
          var e = it.e;
          return '<div class="cs-r' + (it.past ? ' cs-past' : '') + (it.lead ? ' cs-lead' : '') + '"><b data-no-i18n>' + esc(e.title) + '</b><span><i style="--cs-c:' + esc(tone(e)) + '"></i>'
            + esc(clockOf(e.start) + (e.end && e.end > e.start ? ' – ' + clockOf(e.end) : '')) + '</span></div>';
        }).join('') + (p.more ? '<em class="cs-more">+' + Number(p.more) + '</em>' : '') + '</div>';
      });
      return '<div class="cs-lay cs-' + esc(name) + '">' + html + '</div>';
    };
    var wide = lay('wide'), tall = lay('tall');
    return '<div class="cs-in">' + head(ctx, title, sub, true)
      + '<div class="cs-body" style="--cs-nw:' + Number(used.wide) + ';--cs-nt:' + Number(used.tall) + '"><div class="cs-line"><u style="left:' + pct(m.now) + '%"></u></div>'
      + ticks + segs + wide + tall + '<div class="cs-now" style="left:' + pct(m.now) + '%"></div></div></div>';
  };
  // Seven days side by side: weather, appointments, waste. Today stands out.
  var TONES = ['#4E9E95', '#5B8FC9', '#6AAE78', '#DE8A4E', '#E8B04A'];
  var norm = function (s) { return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase(); };
  DRAW.woche = function (ctx) {
    var d0 = new Date(ctx.now); d0.setHours(0, 0, 0, 0);
    var ev = ctx.events || [], bins = ctx.bins || [], daily = ctx.daily || [];
    var nEv = 0, nBin = 0, cols = '';
    for (var i = 0; i < 7; i++) {
      // The i-th calendar day (24-hour steps showed the 25.10. twice).
      var day = +new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + i), items = [];
      // A waste integration gives a pickup twice, as a calendar event and as a sensor (#171): the pickup line wins.
      var binNames = bins.filter(function (b) { return b.days === i; }).map(function (b) { return norm(b.label); });
      ev.filter(function (e) { return sameDay(e.start, day) && (i || e.allDay || (e.end || e.start) >= +ctx.now) && binNames.indexOf(norm(e.title)) < 0; }).slice(0, 3).forEach(function (e, j) {
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
        // A free day: a quiet mark instead of seven times „Nichts geplant“ (read out for screen readers).
        + (items.length ? '<div class="cs-li">' + items.join('') + '</div>' : '<div class="cs-none" role="img" aria-label="' + esc(T('Nichts geplant')) + '"></div>') + '</div>';
    }
    var sub = [nEv === 1 ? T('1 Termin') : T('{n} Termine'.replace('{n}', nEv)), nBin === 1 ? T('1 Abholung') : T('{n} Abholungen'.replace('{n}', nBin))].join(' · ');
    return '<div class="cs-in">' + head(ctx, T('Diese Woche'), sub) + '<div class="cs-body"><div class="cs-cols">' + cols + '</div></div></div>';
  };
  // What is playing, big with its cover; the background is the cover out of focus.
  var mmss = function (sec) { var s2 = Math.max(0, Math.round(sec)); return Math.floor(s2 / 60) + ':' + String(s2 % 60).padStart(2, '0'); };
  var NOTE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 17.5V6.2a1 1 0 0 1 .8-1l8-1.7a1 1 0 0 1 1.2 1v10.9a2.9 2.9 0 1 1-2-2.7V8.1l-6 1.3v8.5a2.9 2.9 0 1 1-2-2.8z" fill="currentColor"/></svg>';
  DRAW.musik = function (ctx) {
    var m = ctx.media;
    if (!m) return DRAW.himmel(ctx);
    var pct = m.dur && m.pos != null ? Math.max(0, Math.min(100, m.pos / m.dur * 100)) : null;
    var pic = m.cover ? 'background-image:url(&quot;' + esc(cssUrl(m.cover)) + '&quot;)' : '';
    // Without a cover: a note on the cover's own colours.
    return (m.cover ? '<div class="cs-blur" style="' + pic + '"></div>' : '') + '<div class="cs-in"><div class="cs-cover"' + (pic ? ' style="' + pic + '"' : '') + '>' + (m.cover ? '' : NOTE) + '</div>'
      + '<div class="cs-corner"><div class="cs-time">' + esc(timeText(ctx.now)) + '</div><div class="cs-date">' + esc(dateText(ctx.now)) + '</div></div>'
      + '<div class="cs-meta"><div class="cs-cap" data-no-i18n>' + esc(m.where) + '</div><h2 data-no-i18n>' + esc(m.title) + '</h2>' + (m.artist ? '<h3 data-no-i18n>' + esc(m.artist) + '</h3>' : '')
      + (pct != null ? '<div class="cs-prog"><u style="width:' + pct.toFixed(1) + '%"></u></div><div class="cs-tt"><span>' + mmss(m.pos) + '</span><span>' + mmss(m.dur) + '</span></div>' : '')
      + '</div></div>';
  };
  // Where the power goes right now: sun, battery and grid around the house, running dots for every flow.
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
      return '<div class="cs-fn ' + cls + '" style="left:' + x + '%;top:' + y + '%;--cs-c:' + color + '"><i>' + GLYPH[glyph] + '</i><div><b>' + esc(value) + '</b><span>' + esc(label) + '</span></div></div>';
    };
    // Dots from rim to rim, drawn only while power flows, running the way it goes: cs-v sun–house (down), cs-l
    // battery–house (to the house while the battery gives), cs-r house–grid (to the grid while feeding in).
    var flow = function (cls, color, on, rev) { return on ? '<div class="cs-fl ' + cls + (rev ? ' cs-rev' : '') + '" style="--cs-c:' + color + '"></div>' : ''; };
    var out = '<div class="cs-in">' + head(ctx) + '<div class="cs-flow">';
    if (e.hasSolar) out += flow('cs-v', '#E8A93A', (e.solar || 0) > 20) + node('cs-sun', 50, 9, 'sun', '#E8A93A', kw(e.solar || 0), T('Sonne'));
    if (e.hasBattery) out += flow('cs-l', '#3FA79A', Math.abs(e.battery || 0) > 20, !(e.battery > 0))
      + node('cs-bat', 17, 62, 'battery', '#3FA79A', e.soc != null ? e.soc + ' %' : kw(e.battery || 0),
        Math.abs(e.battery || 0) <= 20 ? T('Akku') : (e.battery > 0 ? T('Akku gibt ab') : T('Akku lädt')) + (e.soc != null ? ' · ' + kw(e.battery) : ''));
    out += flow('cs-r', '#5B8FC9', Math.abs(e.grid) > 20, e.grid > 0)
      + node('cs-grid', 83, 62, 'grid', '#5B8FC9', kw(e.grid), Math.abs(e.grid) <= 20 ? T('Netz') : e.grid > 0 ? T('aus dem Netz') : T('ins Netz'))
      + node('cs-house', 50, 62, 'house', 'var(--ink)', kw(e.house), T('Haus verbraucht')) + '</div>';
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
    return '<div class="cs-in"><div class="cs-left"><div class="cs-time">' + esc(timeText(ctx.now)) + '</div><div class="cs-date">' + esc(dateText(ctx.now)) + '</div>'
      + '<div class="cs-say">' + esc(say) + '<small>' + esc(small) + '</small></div>'
      + (people.length ? '<div class="cs-ppl">' + people.map(function (p) {
        return '<div class="cs-p' + (p.home ? '' : ' cs-away') + '"><i data-no-i18n>' + esc(p.name.charAt(0).toUpperCase()) + '</i><span data-no-i18n>' + esc(p.name) + '</span></div>';
      }).join('') + '</div>' : '') + '</div>'
      + (rows.length ? '<div class="cs-right">' + rows.map(function (r) {
        return '<div class="cs-it" style="--cs-c:' + TONE_C[r.tone] + '"><i></i><div><b>' + esc(r.label) + '</b>' + (r.sub ? '<span data-no-i18n>' + esc(r.sub) + '</span>' : '') + '</div></div>';
      }).join('') + '</div>' : '') + '</div>';
  };
  // Every camera as a still picture, a fresh one every few seconds; the grid follows how many there are. A tap shows
  // the live picture big (on the tablet, see show below).
  DRAW.kameras = function (ctx) {
    var cams = ctx.cams || [], n = cams.length;
    if (!n) return DRAW.himmel(ctx);
    var cols = n <= 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : 4, pcols = n <= 2 ? 1 : n <= 8 ? 2 : 3;
    var grid = '--cs-cols:' + cols + ';--cs-rows:' + Math.ceil(n / cols) + ';--cs-pcols:' + pcols + ';--cs-prows:' + Math.ceil(n / pcols);
    return '<div class="cs-in">' + head(ctx, T('Kameras'), T('Tippen für das Livebild')) + '<div class="cs-body"><div class="cs-cams" style="' + esc(grid) + '">'
      + cams.map(function (c) {
        var pic = c.shot || c.url;
        return '<button type="button" class="cs-cam" data-sv-act="cam" data-cam="' + esc(c.id) + '"><i class="cs-camic"><ha-icon icon="mdi:cctv"></ha-icon></i><span class="cs-shot"' + (pic ? ' style="background-image:url(&quot;' + esc(cssUrl(pic)) + '&quot;)"' : '') + '></span>'
          + '<b data-no-i18n>' + esc(c.name) + '</b></button>';
      }).join('') + '</div></div></div>';
  };
  // The month like a calendar on the wall: today marked, the appointments of the picked calendars in their colour.
  var WEEKDAY = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7 };
  var firstDay = function (hass) {
    var f = hass && hass.locale && hass.locale.first_weekday;
    if (WEEKDAY[f]) return WEEKDAY[f];
    try {
      var L = new Intl.Locale(loc()), w = typeof L.getWeekInfo === 'function' ? L.getWeekInfo() : L.weekInfo;
      if (w && w.firstDay) return w.firstDay;
    } catch (e) { /* older browsers: Monday */ }
    return 1;
  };
  // The days the month view shows: from the week of the 1st to the week of the last day. { start, weeks, month }
  S.monthGrid = function (now, hass) {
    var d = new Date(+now), first = new Date(d.getFullYear(), d.getMonth(), 1);
    var off = (first.getDay() - firstDay(hass) % 7 + 7) % 7;
    var len = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return { start: new Date(d.getFullYear(), d.getMonth(), 1 - off), weeks: Math.ceil((off + len) / 7), month: d.getMonth() };
  };
  // Two calendar weeks (#231, casora_screensaver_calendar_range '2w'): this week and the next, from the locale's first
  // weekday. { start, weeks: 2, two: true }
  S.twoWeekGrid = function (now, hass) {
    var d = new Date(+now), off = (d.getDay() - firstDay(hass) % 7 + 7) % 7;
    return { start: new Date(d.getFullYear(), d.getMonth(), d.getDate() - off), weeks: 2, month: null, two: true };
  };
  // The days the calendar screensaver shows (and asks the calendars for): the month, or two weeks when picked.
  S.calGrid = function (now, hass, vars) {
    return vars && vars.casora_screensaver_calendar_range === '2w' ? S.twoWeekGrid(now, hass) : S.monthGrid(now, hass);
  };
  // First and last day of a span as the language writes it (Intl puts the month once where both share it: de
  // 16.–29. November, en 16–29 November); two months take their short names (30. Nov. – 13. Dez.).
  S.spanText = function (from, to) {
    var a = new Date(+from), b = new Date(+to);
    var f = new Intl.DateTimeFormat(loc(), { day: 'numeric', month: a.getMonth() === b.getMonth() ? 'long' : 'short' });
    // Across New Year Intl would add both years: the two days on their own then, the year stays out of the title.
    var text = typeof f.formatRange === 'function' && a.getFullYear() === b.getFullYear() ? f.formatRange(a, b) : f.format(a) + ' – ' + f.format(b);
    return text.charAt(0).toUpperCase() + text.slice(1);
  };
  DRAW.kalender = function (ctx) {
    var g = S.calGrid(ctx.now, ctx.hass, ctx.vars), ev = ctx.events || [], cals = ctx.cals || [];
    var y = g.start.getFullYear(), m = g.start.getMonth(), d = g.start.getDate();
    var tone = function (e) { var i = cals.indexOf(e.cal); return TONES[(i < 0 ? 0 : i) % TONES.length]; };
    var month = new Intl.DateTimeFormat(loc(), { month: 'long' }).format(ctx.now);
    // The big thing: the month and its year, or the two weeks' first and last day (--cs-n: its length, the
    // stylesheet fits the size to it).
    var span = g.two ? S.spanText(g.start, new Date(y, m, d + 13)) : '';
    var title = g.two ? '<div class="cs-km cs-kr" style="--cs-n:' + Math.max(8, span.length) + '">' + esc(span) + '</div>'
      : '<div class="cs-km">' + esc(month.charAt(0).toUpperCase() + month.slice(1)) + '</div><div class="cs-ky">' + ctx.now.getFullYear() + '</div>';
    // Titles a day has room for: two, one in a month of six weeks; three with their times at two weeks.
    var room = g.two ? 3 : g.weeks >= 6 ? 1 : 2;
    var html = '<div class="cs-in"><div class="cs-kh"><div class="cs-kt">' + title + '</div>'
      + '<div class="cs-kc"><div class="cs-time">' + esc(timeText(ctx.now)) + '</div><div class="cs-date">' + esc(dateText(ctx.now)) + '</div></div></div>'
      + '<div class="cs-kg' + (g.two ? ' cs-k2' : '') + '" style="--cs-weeks:' + Number(g.weeks) + ';--cs-wd:';
    // --cs-wd: the longest weekday name (pt: „segunda“); the portrait layout of the two weeks makes room for it.
    var names = [0, 1, 2, 3, 4, 5, 6].map(function (w) { return dayName(+new Date(y, m, d + w), true); });
    var wd = Math.max.apply(null, names.map(function (n) { return n.length; }));
    html += Number(wd) + '">';
    names.forEach(function (n) { html += '<div class="cs-kw">' + esc(n) + '</div>'; });
    for (var i = 0; i < g.weeks * 7; i++) {
      var day = new Date(y, m, d + i), a = +day, b = +new Date(y, m, d + i + 1);
      var list = ev.filter(function (e) { return e.start < b && (e.end && e.end > e.start ? e.end : e.start + 1) > a; });
      var cls = 'cs-kd' + (!g.two && day.getMonth() !== g.month ? ' cs-kout' : '') + (sameDay(a, ctx.now) ? ' cs-ktoday' : b <= +ctx.now ? ' cs-kpast' : '');
      // Never „+1“: a single one left over takes the line itself.
      var show = list.length === room + 1 ? room + 1 : room;
      if (show > room && room === 1) show = 1;
      // Two weeks: the weekday in the cell too (the portrait layout has no row of weekdays), and each title's time.
      html += '<div class="' + esc(cls) + '"><b>' + day.getDate() + '</b>' + (g.two ? '<small class="cs-kn">' + esc(names[i % 7]) + '</small>' : '')
        + (list.length ? '<div class="cs-kl">' + list.slice(0, show).map(function (e) {
          var when = g.two ? '<small>' + esc(e.allDay || e.start < a ? T('ganztägig') : clockOf(e.start)) + '</small>' : '';
          return '<span class="cs-ke' + (g.two ? ' cs-ke2' : '') + '" style="--cs-c:' + esc(tone(e)) + '"><i></i><em data-no-i18n>' + esc(e.title) + '</em>' + when + '</span>';
        }).join('') + (list.length > show ? '<span class="cs-kmore">+' + (list.length - show) + '</span>' : '') + '</div>' : '') + '</div>';
    }
    return html + '</div></div>';
  };
  // A soft wash in the colour of the playing cover over the screensavers that have a coloured ground (Studio switch).
  var TINT_KINDS = ['wort', 'wetter', 'linie', 'woche', 'energie', 'ruhe', 'kalender'];
  S.TINT_KINDS = TINT_KINDS;
  // The stylesheet (the rule test reads the sizes from it).
  S.CSS = CSS;
  // What a preview shows where the house has nothing to show right now (nothing playing, energy not set up, no
  // appointments, no forecast): an example, so every screensaver can be looked at before it is picked.
  S.sample = function (ctx) {
    var now = +ctx.now, d0 = new Date(now); d0.setHours(0, 0, 0, 0);
    var at = function (day, h, m) { return +d0 + day * 86400000 + h * 3600000 + (m || 0) * 60000; };
    if (!ctx.wx) ctx.wx = { temp: 11, text: T('Teilweise bewölkt'), icon: '/casora_assets/weather/partly-cloudy-day-fill.svg' };
    if (!ctx.hourly.length) ctx.hourly = Array.from({ length: 24 }, function (_, i) {
      return { datetime: new Date(now + i * 3600000).toISOString(), temperature: 7.5 + Math.cos((new Date(now + i * 3600000).getHours() - 15) / 24 * 2 * Math.PI) * 4, precipitation: [0, 0, 0.4, 1.3, 0.8, 0.2][i] || 0 };
    });
    if (!ctx.daily.length) ctx.daily = ['partlycloudy', 'rainy', 'cloudy', 'sunny', 'sunny', 'rainy', 'partlycloudy'].map(function (c, i) {
      return { datetime: new Date(at(i, 12)).toISOString(), condition: c, temperature: [11, 9, 8, 12, 13, 10, 9][i], templow: [4, 5, 3, 2, 4, 6, 5][i] };
    });
    if (!ctx.events.length) ctx.events = [[0, 8, 30, 45, 'Arzttermin'], [0, 12, 30, 60, 'Mittagessen'], [0, 18, 30, 90, 'Einkaufen'], [0, 20, 45, 75, 'Kino'], [1, 10, 0, 120, 'Einkaufen'], [4, 20, 15, 135, 'Kino'], [5, 10, 30, 150, 'Mittagessen']]
      .map(function (e) { return { title: T(e[4]), start: at(e[0], e[1], e[2]), end: at(e[0], e[1], e[2]) + e[3] * 60000, allDay: false }; })
      .filter(function (e) { return !window.casoraCalendarAllows || window.casoraCalendarAllows(e.title, ctx.settings); });
    if (!ctx.media) ctx.media = { title: 'Golden Hour', artist: 'Casora', where: T('Wohnzimmer'), cover: '', dur: 228, pos: 87 };
    if (!ctx.energy) ctx.energy = { solar: 3240, grid: -1180, battery: -640, soc: 72, hasSolar: true, hasBattery: true, house: 1420 };
    if (!ctx.cams || !ctx.cams.length) ctx.cams = ['Eingang', 'Garten', 'Garage', 'Terrasse'].map(function (n, i) { return { id: 'camera.sample_' + i, name: T(n), url: '', stream: false }; });
    // The cover colour switched on: the example's colour, as long as the real cover has given none.
    if (!ctx.tint && S.on((ctx.vars || {}).casora_screensaver_tint)) ctx.tint = 'rgb(176,104,72)';
    return ctx;
  };
  S.context = function (o) {
    o = o || {};
    var hass = o.hass || hassOf(), now = o.now || new Date(), vars = o.vars || {};
    var dark = !!(hass && hass.themes && hass.themes.darkMode);
    var kind = o.kind || '';
    var need = function (list) { return !kind || list.indexOf(kind) > -1; };
    var cals = need(['linie', 'woche', 'kalender']) ? S.calendars(hass, vars.casora_screensaver_calendars) : [];
    // The calendar asks for its whole grid (the month, or two weeks), the others for the coming eight days.
    var grid = kind === 'kalender' ? S.calGrid(now, hass, vars) : null;
    var events = (o.events !== undefined ? o.events : !cals.length ? [] : grid ? S.events(hass, cals, grid.weeks * 7, grid.start) : S.events(hass, cals, 8)).filter(function (e) {
      return !window.casoraCalendarAllows || window.casoraCalendarAllows(e.title, o.settings);
    });
    var media = o.media !== undefined ? o.media : need(['musik']) || (S.on(vars.casora_screensaver_tint) && TINT_KINDS.indexOf(kind) > -1) ? S.playing(hass) : null;
    var cams = o.cams !== undefined ? o.cams : need(['kameras']) ? S.cameras(hass, vars.casora_screensaver_cameras).map(function (c) { c.shot = S.shot(c, now); return c; }) : [];
    return { now: now, hass: hass, vars: vars, settings: o.settings, dark: dark, sun: o.sun !== undefined ? o.sun : S.sunTimes(hass, now), cals: o.cals || cals, cams: cams,
      tint: o.tint !== undefined ? o.tint : S.on(vars.casora_screensaver_tint) && media && media.cover ? S.coverColor(media.cover) : null,
      wx: o.wx !== undefined ? o.wx : S.weather(hass, vars.weather_entity), rooms: o.rooms || S.rooms(o.config, hass, dark, { url: o.photoUrl, only: vars.casora_screensaver_photos }),
      // Asked for only when the screensaver on show needs it.
      hourly: o.hourly !== undefined ? o.hourly : need(['wetter']) ? S.forecast(hass, vars.weather_entity, 'hourly') : [],
      daily: o.daily !== undefined ? o.daily : need(['wetter', 'woche']) ? S.forecast(hass, vars.weather_entity, 'daily') : [],
      events: events,
      bins: o.bins !== undefined ? o.bins : need(['woche']) ? S.waste(hass) : [],
      media: media,
      energy: o.energy !== undefined ? o.energy : need(['energie']) ? S.energy(hass) : null,
      bell: o.bell !== undefined ? o.bell : need(['ruhe']) ? S.bell() : [],
      people: o.people !== undefined ? o.people : need(['ruhe']) ? S.people(hass) : [] };
  };
  // „mix“ shows one after the other, five minutes each: the kinds of pool (S.pool: picked and with something to
  // show), all without a pool.
  S.kindAt = function (kind, now, pool) {
    var ids = S.KINDS.map(function (k) { return k.id; });
    if (kind === 'mix') {
      var list = Array.isArray(pool) && pool.length ? pool : ids;
      return list[Math.floor(+now / 300000) % list.length];
    }
    return ids.indexOf(kind) === -1 ? ids[0] : kind;
  };
  var LIGHT_KINDS = ['wort', 'linie', 'woche', 'energie', 'ruhe', 'kalender'], NIGHT_KINDS = LIGHT_KINDS.concat(['wetter']);
  // Night by the sun (by the clock without sun.sun).
  var isNight = function (ctx) { return ctx.sun ? S.dayShare(ctx.now, ctx.sun.rise, ctx.sun.set) == null : (ctx.now.getHours() < 7 || ctx.now.getHours() >= 20); };
  S.html = function (kind, ctx, pool) {
    var k = S.kindAt(kind, ctx.now, pool);
    h12 = use12(ctx.hass, ctx.vars);
    // Nothing to show (no weather entity, nothing playing, energy not set up, no camera): the sky, with its own look.
    if ((k === 'wetter' && !ctx.wx) || (k === 'musik' && !ctx.media) || (k === 'energie' && !ctx.energy) || (k === 'kameras' && !(ctx.cams && ctx.cams.length))) k = 'himmel';
    // The screensavers with a ground of their own are light by day and deep by night (and with a dark theme).
    var dark = ctx.dark || (NIGHT_KINDS.indexOf(k) > -1 && isNight(ctx));
    var cls = (dark ? ' cs-dark' : '') + (!dark && LIGHT_KINDS.indexOf(k) > -1 ? ' cs-light' : '');
    // Weather under clouds: a greyer sky. The house at rest: in the middle while nothing asks for anyone.
    if (k === 'wetter' && !dark && /rain|thunder|snow|fog|mixed|cloudy-fill|lightning/.test(String((ctx.wx || {}).icon || ''))) cls += ' cs-grey';
    if (k === 'ruhe') cls += !(ctx.bell || []).length ? ' cs-calm' : (ctx.bell || []).some(function (r) { return r.tone !== 'info'; }) ? ' cs-busy' : '';
    var tintHtml = ctx.tint && ctx.media && TINT_KINDS.indexOf(k) > -1 ? '<div class="cs-tint" style="--cs-t:' + esc(ctx.tint) + '"></div>' : '';
    return '<div class="cs-sv cs-' + k + cls + '" data-kind="' + k + '"' + (tintHtml ? ' data-tint="1"' : '') + '>' + tintHtml + DRAW[k](ctx) + '</div>';
  };
  // The wander against burn-in (#230). A step every twenty seconds, at :10, :30 and :50 of the minute: the glide of
  // four seconds is over before the minute ends, so the layout never moves while the clock's digits change.
  S.DRIFT_EVERY = 20000;
  S.DRIFT_AT = 10000;
  S.driftStep = function (ms) { return Math.floor((+ms - S.DRIFT_AT) / S.DRIFT_EVERY); };
  S.driftAt = function (n) { return [(Math.sin(n / 3) * 10).toFixed(1) + 'px', (Math.cos(n / 4) * 8).toFixed(1) + 'px']; };
  // The switch in the Studio: on unless it was turned off (stored only as false).
  S.wanders = function (vars) { var v = vars && vars.casora_screensaver_wander; return !(v === false || v === 'false' || v === 0 || v === '0'); };
  S.mount = function (host, kind, o) {
    o = o || {};
    var last = '', timer = 0, step = null, minute = null, moved = false;
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
    var api = { kind: '' }, shown = false, gone = false;
    var update = function () {
      // A box that was in the page and left it (the Studio draws its page again and never calls destroy): stop, or
      // every redraw would leave a timer and a repaint listener behind.
      if (gone) return;
      // A box not in the page yet (drawn before it is inserted) is drawn as before.
      if (host.isConnected === false && shown) { api.destroy(); return; }
      if (host.isConnected) shown = true;
      var want = typeof o.kind === 'function' ? o.kind() : kind;
      var base = (typeof o.context === 'function' ? o.context() : o.context) || {};
      var now = base.now || new Date();
      // The alternation: the kinds picked in the Studio; on the tablet only those the house has something for (the
      // preview shows examples, so every picked one takes its turn there).
      var pool = null;
      if (want === 'mix') {
        var vars = base.vars || {}, hass = base.hass || hassOf();
        var rooms = null;
        pool = S.pool(vars, o.sample ? null : function (id) {
          if (id === 'fotos' && !rooms) rooms = S.rooms(base.config, hass, !!(hass && hass.themes && hass.themes.darkMode), { url: base.photoUrl, only: vars.casora_screensaver_photos });
          return S.has(id, { hass: hass, vars: vars, rooms: rooms });
        });
      }
      var k = S.kindAt(want, now, pool);
      var ctx = S.context(Object.assign({}, base, { kind: k }));
      if (o.sample) ctx = S.sample(ctx);
      var html = S.html(k, ctx);
      api.kind = k;
      if (html !== last) { last = html; host.innerHTML = html; }
      // Wander a few pixels so nothing burns in (not in a preview). o.drift: true, or a function asked every time
      // (the Studio switch). A call that sees a new minute (the one that changes the digits) keeps the step it had,
      // also when a throttled timer skipped the step's own moment: the step then follows with the next call.
      var el = host.firstElementChild, t = +now, min = Math.floor(t / 60000);
      if (typeof o.drift === 'function' ? o.drift() : o.drift) {
        if (step == null || min === minute) step = S.driftStep(t);
        var d = S.driftAt(step);
        if (el) { el.style.setProperty('--cs-dx', d[0]); el.style.setProperty('--cs-dy', d[1]); moved = true; }
      } else if (moved) {
        if (el) { el.style.removeProperty('--cs-dx'); el.style.removeProperty('--cs-dy'); }
        moved = false; step = null;
      }
      minute = min;
    };
    update();
    timer = setInterval(update, o.every || 20000);
    // Data that arrives later (forecast, calendar) repaints at once.
    listeners.push(update);
    api.update = update;
    // Once only: a second call must not take another mount's listener (indexOf -1 would splice the last one).
    api.destroy = function () {
      if (gone) return;
      gone = true;
      clearInterval(timer);
      var i = listeners.indexOf(update);
      if (i > -1) listeners.splice(i, 1);
      host.innerHTML = '';
    };
    return api;
  };

  // ── Wake on presence (casora_screensaver_wake) ─────────────────────────────
  // A binary_sensor picked in the Studio (motion, occupancy, presence) ends the screensaver when it turns on, before
  // anyone touches the tablet. By day the dashboard comes back on its Home view; at night (22–5) only a dimmed clock
  // shows instead of a bright screen. Off while nothing is picked.
  S.wakeEntity = function (vars) {
    var v = vars && vars.casora_screensaver_wake;
    return typeof v === 'string' && /^binary_sensor\.[a-z0-9_]+$/.test(v) ? v : '';
  };
  // Turn a Fully Kiosk screen on as well (on unless the Studio switch stored false).
  S.wakeScreen = function (vars) { var v = vars && vars.casora_screensaver_wake_screen; return !(v === false || v === 'false' || v === 0 || v === '0'); };
  // The start that fits the hour: morning 5–11, day 11–17 and evening 17–22 go to Home; night 22–5 the dim clock.
  S.wakePhase = function (h) { h = Number(h); return h >= 22 || h < 5 ? 'night' : h < 11 ? 'morning' : h < 17 ? 'day' : 'evening'; };
  // One message of subscribe_entities (compressed states): the entity's new state, or null when it brings none.
  // a: added (the first message), c: changed ({ '+': { s } }), r: removed.
  S.wakeMsg = function (msg, id) {
    if (!msg || !id) return null;
    if (msg.a && msg.a[id]) return String(msg.a[id].s);
    var c = msg.c && msg.c[id];
    if (c && c['+'] && c['+'].s != null) return String(c['+'].s);
    if (Array.isArray(msg.r) && msg.r.indexOf(id) > -1) return 'unavailable';
    return null;
  };
  // Is this message a wake? Only a real off → on (not unavailable/unknown → on after a restart or a dropout), and
  // not again within WAKE_GAP of the last one (a flickering sensor).
  S.WAKE_GAP = 30000;
  S.wakeEdge = function (prev, s, lastAt, now) { return prev === 'off' && s === 'on' && !(now - (lastAt || 0) < S.WAKE_GAP); };
  // Fully Kiosk's „Screen“ switch (HA's fully_kiosk integration) of the tablet in the wake sensor's room: exactly one
  // in the sensor's area, never „the only one in the house“ (that may be a tablet elsewhere). Null = leave it alone.
  S.screenSwitch = function (hass, sensor) {
    var R = (hass && hass.entities) || {}, D = (hass && hass.devices) || {}, S0 = (hass && hass.states) || {};
    var areaOf = function (id) { var r = R[id]; return r ? (r.area_id || (D[r.device_id] || {}).area_id || null) : null; };
    var list = Object.keys(R).filter(function (id) {
      var r = R[id];
      return r && r.platform === 'fully_kiosk' && id.indexOf('switch.') === 0 && S0[id] && (r.translation_key === 'screen_on' || /_screen$/.test(id));
    }).sort();
    var a = areaOf(sensor);
    var here = a ? list.filter(function (id) { return areaOf(id) === a; }) : [];
    return here.length === 1 ? here[0] : null;
  };
  // The calm night clock: the time only, dim on black. Every ten minutes it stands somewhere else, together with a
  // change of the digits, so nothing burns in.
  S.nightSpot = function (now) {
    var n = Math.floor(+now / 600000);
    return [Math.round(Math.sin(n * 1.7) * 6), Math.round(Math.cos(n * 1.3) * 8)];
  };
  S.nightHtml = function (now, hass) {
    var p = S.nightSpot(now);
    return '<div class="cs-night" style="position:absolute;inset:0;display:grid;place-items:center;background:#000;">'
      + '<div class="cs-night-t" data-no-i18n style="transform:translate(' + Number(p[0]) + 'vw,' + Number(p[1]) + 'vh);font-family:var(--primary-font-family, var(--ha-font-family, system-ui, sans-serif));'
      + 'font-weight:200;font-size:min(22vw,34vh);line-height:1;letter-spacing:-.02em;font-variant-numeric:tabular-nums;color:#A89C8F;opacity:.3;">'
      + esc(timeText(now, hass)) + '</div></div>';
  };

  // The settings of the dashboard: the first value found on a view's hero card.
  S.vars = function (cfg) {
    var out = {}, keys = ['casora_screensaver', 'casora_screensaver_kind', 'casora_screensaver_calendar', 'casora_screensaver_photos', 'casora_screensaver_mix',
      'casora_screensaver_cameras', 'casora_screensaver_calendars', 'casora_screensaver_tint', 'casora_screensaver_wander', 'casora_screensaver_calendar_range', 'weather_entity', 'use_12h',
      'casora_screensaver_wake', 'casora_screensaver_wake_screen'];
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
  // byHand: started from the ⋯ menu; it stays without a start time until a touch.
  var lastAct = Date.now(), layer = null, live = null, rootEl = null, lookedAt = 0, byHand = false;
  var bump = function () { lastAct = Date.now(); };
  // The last real use (lastAct is also reset while no screensaver is set): a wake leaves a tablet in use alone.
  var lastUse = Date.now(), used = function () { lastUse = Date.now(); bump(); };
  ['pointerdown', 'touchstart', 'keydown', 'wheel', 'scroll'].forEach(function (t) { window.addEventListener(t, used, { capture: true, passive: true }); });
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
    if (layer._night) undim();
    if (layer._close) layer._close();
    if (live) { live.destroy(); live = null; }
    layer.remove();
    layer = null;
    byHand = false;
    bump();
  };
  S.hide = hide;
  // The brightness a night wake lowered on a Fully Kiosk screen comes back (screenOn below).
  var undim = function () {
    if (undimTo == null) return;
    var b = undimTo;
    undimTo = null;
    try { window.fully.setScreenBrightness(b); } catch (e) { /* left dim until Fully resets it */ }
  };
  var haptic = function (k) { if (typeof window.casoraHaptic === 'function') window.casoraHaptic(k); };
  // Over the screensaver: the live picture of a camera; a tap closes it.
  var LCSS = '.cs-sv-over{position:absolute;inset:0;z-index:2;color:#F6EFE6;font-family:var(--primary-font-family, var(--ha-font-family, system-ui, sans-serif));-webkit-user-select:none;user-select:none;}'
    + '.cs-sv-over *{box-sizing:border-box;}'
    + '.cs-sv-cam{background:#000;display:grid;place-items:center;cursor:pointer;}'
    + '.cs-sv-cam > *{width:100%;height:100%;object-fit:contain;display:block;}.cs-sv-cam ha-camera-stream{--video-max-height:100vh;}'
    + '.cs-sv-cam .cs-sv-cn{position:absolute;left:24px;top:20px;width:auto;height:auto;font-size:17px;font-weight:700;padding:8px 16px;border-radius:999px;background:rgba(0,0,0,.45);}';
  var openCam = function (id) {
    var hass = hassOf(), st = hass && hass.states && hass.states[id];
    if (!st || !layer) return;
    var box = document.createElement('div');
    box.className = 'cs-sv-over cs-sv-cam';
    box.setAttribute('data-sv-act', 'close');
    var stream = ((Number((st.attributes || {}).supported_features) || 0) & 2) && customElements.get('ha-camera-stream');
    var timer = 0;
    if (stream) {
      // Home Assistant's own player, as everywhere in Casora (bell, cameras): muted, no controls.
      var el = document.createElement('ha-camera-stream');
      el.controls = false; el.muted = true; el.allowExoPlayer = false;
      el.hass = hass; el.stateObj = st;
      box.appendChild(el);
    } else {
      // No stream: the still picture, every two seconds a new one.
      var img = document.createElement('img');
      var pic = function () { var a = (hassOf() || hass).states[id]; var u0 = String((a && a.attributes.entity_picture) || ''); if (u0) img.src = u0 + (u0.indexOf('?') < 0 ? '?' : '&') + '_cs=' + Date.now(); };
      pic(); timer = setInterval(pic, 2000);
      img.alt = '';
      box.appendChild(img);
    }
    var cn = document.createElement('div');
    cn.className = 'cs-sv-cn';
    cn.setAttribute('data-no-i18n', '');
    cn.textContent = String((st.attributes || {}).friendly_name || id);
    box.appendChild(cn);
    box._close = function () { clearInterval(timer); box.remove(); if (layer && layer._close === box._close) layer._close = null; };
    box.addEventListener('click', function () { haptic('light'); box._close(); });
    layer._close = box._close;
    layer.appendChild(box);
    haptic('light');
  };
  // night: the calm night clock instead of the screensaver (a wake at night, S.wakeNow).
  var show = function (cfg, night) {
    // A screensaver still fading out after a wake makes room for the new one at once.
    if (layer && layer._casoraFading) hide();
    if (layer) return;
    if (!document.getElementById('cs-sv-over-css')) {
      var st = document.createElement('style');
      st.id = 'cs-sv-over-css';
      st.textContent = LCSS;
      document.head.appendChild(st);
    }
    layer = document.createElement('div');
    layer.className = 'cs-sv-layer';
    layer.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#101010;cursor:pointer;touch-action:none;';
    var stage = document.createElement('div');
    stage.style.cssText = 'position:absolute;inset:0;';
    layer.appendChild(stage);
    // A touch only wakes the dashboard: it must not reach a tile underneath. A camera and its live picture are the
    // exception: they keep the screensaver. The layer fades at once but stays until the tap is over: removed on
    // pointerdown, the rest of the tap (pointerup, click) landed on the tile or badge underneath (Alltag round
    // 14.11.2026: waking expanded a badge, r731).
    var ending = null;
    var mine = layer, endSoon = function (ms) { clearTimeout(ending); ending = setTimeout(function () { if (layer === mine) hide(); }, ms); };
    var wake = function (ev) {
      var t = ev.composedPath ? ev.composedPath()[0] : ev.target;
      var act = t && t.closest ? t.closest('[data-sv-act]') : null;
      if (act) {
        ev.stopPropagation();
        if (ev.type === 'contextmenu') ev.preventDefault();
        if (ev.type !== 'click') return;
        var what = act.getAttribute('data-sv-act');
        if (what === 'cam') openCam(act.getAttribute('data-cam'));
        return;
      }
      ev.preventDefault(); ev.stopPropagation();
      var lyr = ev.currentTarget;
      if (lyr && lyr.style) { lyr.style.transition = 'opacity .18s ease'; lyr.style.opacity = '0'; }
      // Down: wait for the end of the tap (a finger left resting: at most 1.5 s); up or the click: gone shortly after.
      endSoon(/down|start/.test(ev.type) ? 1500 : 300);
    };
    ['pointerdown', 'touchstart', 'pointerup', 'touchend', 'mousedown', 'mouseup', 'click', 'contextmenu'].forEach(function (t) { layer.addEventListener(t, wake, { passive: false }); });
    layer.setAttribute('data-casora-window', ''); document.body.appendChild(layer);
    if (night) {
      layer._night = true;
      layer.style.background = '#000';
      var paint = function () { stage.innerHTML = S.nightHtml(new Date(), hassOf()); };
      paint();
      var nt = setInterval(paint, 20000);
      live = { destroy: function () { clearInterval(nt); stage.innerHTML = ''; } };
      return;
    }
    // Every five seconds: the cameras' pictures stay fresh (everything else only repaints when it changed).
    live = S.mount(stage, null, { drift: function () { return S.wanders(S.vars(config() || cfg)); }, every: 5000, kind: function () { return S.vars(config() || cfg).casora_screensaver_kind || 'mix'; },
      context: function () { var c = config() || cfg; return { config: c, vars: S.vars(c) }; } });
  };
  S.show = show;
  // A screensaver that is fading out after a wake no longer counts as shown.
  S.shown = function () { return !!layer && !layer._casoraFading; };
  // Woken from outside (presence, 46 here; a doorbell ring, 52-klingel-moment.js): the screensaver fades as after a
  // touch and the idle time starts again. reason: a short word for the log. True when one was showing.
  S.wake = function (reason) {
    bump();
    var was = !!layer;
    S._lastWake = { reason: String(reason || ''), at: Date.now(), was: was };
    if (!layer) return false;
    var l = layer, still = false;
    try { still = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { still = false; }
    if (still) { hide(); return true; }
    l._casoraFading = true;
    l.style.pointerEvents = 'none';
    l.style.transition = 'opacity .24s ease';
    l.style.opacity = '0';
    setTimeout(function () { if (layer === l) hide(); }, 260);
    return true;
  };
  // Started by hand from the dashboard's ⋯ menu: on a tablet, also without a start time (owner, 13.11.2026).
  S.canStart = function () {
    if (OFF || layer) return false;
    return !!(config() && (FORCE || isTablet()));
  };
  S.start = function () { var cfg = config(); if (cfg && S.canStart()) { show(cfg); byHand = !!layer; } };
  window.casoraScreensaver = window.casoraScreensaver || {};
  window.casoraScreensaver.wake = S.wake;
  var homeOf = function (cfg) {
    var views = (cfg && cfg.views) || [], home = null;
    for (var i = 0; i < views.length; i++) if (views[i].path === 'home') { home = views[i]; break; }
    home = home || views[0];
    var parts = String(location.pathname).split('/').filter(Boolean);
    return home && parts.length ? '/' + parts[0] + '/' + (home.path || '0') : null;
  };
  var norm = function (p) { return String(p || '').replace(/\/+$/, '') || '/'; };
  // A tablet at rest: the screensaver is on show (without a camera's live picture someone opened from it), or the
  // page is hidden (screen off), or nobody touched it for the screensaver time (10 minutes without one). Someone
  // reading a recipe or watching a camera without touching it is not at rest.
  var resting = function (vars) {
    if (layer) return !layer._close;
    if (document.hidden) return true;
    var mins = S.minutes(vars && vars.casora_screensaver) || 10;
    return Date.now() - lastUse >= mins * 60000;
  };
  // Someone came into the room (the wake sensor turned on). Only on a tablet at rest; a popup open: nothing changes.
  S.wakeNow = function (now) {
    var cfg = config();
    if (OFF || !cfg || (!FORCE && !isTablet())) return '';
    if (window.casoraPopup && window.casoraPopup.surface) return '';
    var vars = S.vars(cfg), hass = hassOf();
    if (!resting(vars)) return '';
    var phase = S.wakePhase((now || new Date()).getHours());
    if (S.wakeScreen(vars)) screenOn(hass, S.wakeEntity(vars), phase === 'night');
    if (phase === 'night') {
      if (layer && layer._night) return phase;
      if (layer) hide();
      show(cfg, true);
      byHand = !!layer;
      return phase;
    }
    S.wake('presence');
    var home = homeOf(cfg);
    if (home && norm(location.pathname) !== norm(home)) {
      history.pushState(null, '', home);
      window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }));
      bump();
    }
    return phase;
  };
  // The screen of a Fully Kiosk tablet: its own JavaScript interface when the page runs in it, else the integration's
  // „Screen“ switch in the sensor's room (only when it is off; S.screenSwitch). At night only dimmed: Fully's
  // interface lowers the brightness first (the old one comes back when the night clock ends); where it cannot
  // (the integration's switch, no brightness calls) the screen is left as it is, a dark screen stays dark.
  var undimTo = null;
  S.NIGHT_BRIGHTNESS = 8; // of 255
  var screenOn = function (hass, sensor, night) {
    var f = window.fully;
    try {
      if (f && typeof f.turnScreenOn === 'function') {
        if (night) {
          if (typeof f.setScreenBrightness !== 'function' || typeof f.getScreenBrightness !== 'function') return;
          var b = Number(f.getScreenBrightness());
          if (undimTo == null && isFinite(b) && b > S.NIGHT_BRIGHTNESS) undimTo = b;
          f.setScreenBrightness(S.NIGHT_BRIGHTNESS);
        }
        f.turnScreenOn();
        return;
      }
    } catch (e) { return; /* Fully refused: leave the screen */ }
    if (night) return;
    var sw = S.screenSwitch(hass, sensor), st = sw && hass.states[sw];
    if (st && st.state === 'off' && typeof hass.callService === 'function') {
      Promise.resolve(hass.callService('switch', 'turn_on', { entity_id: sw })).catch(function () { /* the screen stays as it is */ });
    }
  };
  // One subscription for the picked sensor (subscribe_entities, only that entity): no polling. A new pick, or none,
  // ends the old one. The first message is the current state and wakes nothing; only off → on does (S.wakeEdge).
  var wakeId = '', wakeUnsub = null, wakeLast = null, wakeGen = 0, wakeAt = 0;
  var wakeSync = function (cfg) {
    var hass = hassOf();
    var want = !OFF && cfg && (FORCE || isTablet()) ? S.wakeEntity(S.vars(cfg)) : '';
    if (want === wakeId) return;
    if (wakeUnsub) { try { wakeUnsub(); } catch (e) { /* closed */ } }
    wakeUnsub = null; wakeId = want; wakeLast = null;
    var gen = ++wakeGen;
    if (!want || !hass || !hass.connection || typeof hass.connection.subscribeMessage !== 'function') { if (!want) return; wakeId = ''; return; }
    Promise.resolve(hass.connection.subscribeMessage(function (msg) {
      var s = S.wakeMsg(msg, want);
      if (s == null || gen !== wakeGen) return;
      var prev = wakeLast;
      wakeLast = s;
      if (S.wakeEdge(prev, s, wakeAt, Date.now())) { wakeAt = Date.now(); S.wakeNow(); }
    }, { type: 'subscribe_entities', entity_ids: [want] })).then(function (u) {
      if (gen !== wakeGen) { try { u(); } catch (e) { /* closed */ } return; }
      wakeUnsub = u;
    }, function () { /* refused: no retry loop; a new pick tries again */ });
  };
  S._wakeSync = wakeSync;
  S._screenOn = screenOn;
  setInterval(function () {
    if (OFF) return;
    var cfg = config();
    if (cfg) wakeSync(cfg);
    if (!cfg) { if (layer) hide(); return; }
    var mins = S.minutes(S.vars(cfg).casora_screensaver);
    if ((!mins && !byHand) || (!FORCE && !isTablet())) { if (layer) hide(); bump(); return; }
    // Never over an open popup: someone is reading it.
    if (window.casoraPopup && window.casoraPopup.surface) { if (layer) hide(); bump(); return; }
    if (!layer && Date.now() - lastAct >= mins * 60000) show(cfg);
  }, 5000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden && !layer) bump(); });
})();
