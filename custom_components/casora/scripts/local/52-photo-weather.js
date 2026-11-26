// ── Living house photo: the weather outside, lightly over the room photo (stage 1) ───────────────────────────────────
// Over the hero photo of Home and the rooms (casora_room on desktop and tablet, casora_mobile_bg behind the phone's
// header) a light layer follows the weather entity of the dashboard: rain streaks, snow, a fog veil and a soft sway in
// the wind. Clear, cloudy or unknown weather draws nothing at all. The condition is read the way the screensaver reads
// it (46-screensaver.js, _casoraSaver.weather: unavailable or unknown = no weather).
// Cost: one canvas per photo, drawn at half resolution with at most FPS frames a second (rain, snow, wind; the fog is a
// still CSS gradient without a frame loop). Nothing runs while the page is hidden, the screensaver covers the dashboard,
// prefers-reduced-motion is set, the performance mode is on or the Studio switch „Weather on the photo“ is off
// (variable photo_weather, stored only as false; the phone's shell gets it from Home on save).
// The layer sits between the photo and everything on it (z-index -9 inside the hero card), so text and tiles stay on
// top; its strength is capped (MAX) and it fades out where the title sits (desktop: left edge, phone: the dissolve).
//   window._casoraPhotoWx.mood(st)          → null | { rain, snow, fog, wind: 0…1, dir: ±1, key } (pure)
//   window._casoraPhotoWx.windKmh(st)       → wind speed of a weather state in km/h (NaN without one)
//   window._casoraPhotoWx.enabled(vars)     → the Studio switch (on unless stored as false)
//   window._casoraPhotoWx.blocked(env)      → why nothing is drawn ('' = draw): { reduced, perf, hidden, saver }
//   window._casoraPhotoWx.plan(mood, w, h)  → { drops, flakes, streaks } particle counts for a canvas of w × h
//   window._casoraPhotoWx.attach(card, vars, hass, where) → '0'; called from the card's styles on every render
//   window._casoraPhotoWx.phoneWeather(id)  → '0'; the phone's header names its weather entity for the shell
(function () {
  if (window._casoraPhotoWx) return;
  var W = window._casoraPhotoWx = {};
  W.FPS = 20;
  // Strongest alpha per layer; in the text zone it is multiplied by TEXT_ZONE (dev/unit/photo_weather.mjs checks the
  // contrast of white text over a mid-grey photo stays at least 4.5 : 1).
  W.MAX = { rain: 0.34, snow: 0.54, fog: 0.18, wind: 0.16 };
  W.TEXT_ZONE = 0.35;
  // Resolution of the canvas against its CSS size: soft streaks and flakes do not need retina pixels.
  W.SCALE = 0.5;

  var clamp = function (x) { return x < 0 ? 0 : x > 1 ? 1 : x; };
  var KMH = { 'km/h': 1, 'm/s': 3.6, mph: 1.609344, kn: 1.852, kt: 1.852, 'ft/s': 1.09728, 'mm/s': 0.0036, 'cm/s': 0.036 };
  W.windKmh = function (st) {
    var a = (st && st.attributes) || {};
    var v = parseFloat(a.wind_speed);
    if (!isFinite(v) || v < 0) return NaN;
    var u = String(a.wind_speed_unit || 'km/h').trim().toLowerCase();
    return v * (KMH[u] || 1);
  };
  // What the photo shows for a weather state. Strength 0…1 per layer; wind 0…1 from 0 to 50 km/h (a windy condition
  // without a speed counts as a fresh breeze). dir: +1 = the wind pushes to the right (from the west), −1 = to the left.
  var BASE = {
    rainy: { rain: 0.55 }, pouring: { rain: 1 }, 'lightning-rainy': { rain: 0.8 }, hail: { rain: 0.75 },
    snowy: { snow: 0.7 }, 'snowy-rainy': { snow: 0.45, rain: 0.35 },
    fog: { fog: 1 },
    windy: { wind: 1 }, 'windy-variant': { wind: 1 },
  };
  W.mood = function (st) {
    if (!st || st.state === 'unavailable' || st.state === 'unknown') return null;
    var b = BASE[st.state];
    if (!b) return null;
    var kmh = W.windKmh(st);
    var windy = !!b.wind;
    var wind = isFinite(kmh) ? clamp(kmh / 50) : (windy ? 0.5 : 0.15);
    // A windy condition always sways a little, even when the entity reports a light breeze.
    if (windy) wind = Math.max(wind, 0.35);
    var bearing = parseFloat(((st.attributes || {}).wind_bearing));
    // Bearing = where the wind comes from: from the west half (180…360°) it blows to the right.
    var dir = isFinite(bearing) ? (((bearing % 360) + 360) % 360 >= 180 ? 1 : -1) : 1;
    var m = { rain: clamp(b.rain || 0), snow: clamp(b.snow || 0), fog: clamp(b.fog || 0), wind: windy ? wind : 0, sway: wind, dir: dir };
    // The key changes only in steps people would notice, so a wind reading that wobbles does not rebuild the layer.
    m.key = [st.state, Math.round(wind * 4), dir].join('|');
    return m;
  };
  W.enabled = function (vars) {
    var v = vars && vars.photo_weather;
    return !(v === false || v === 'false' || v === 0 || v === '0');
  };
  W.blocked = function (env) {
    var e = env || {};
    return e.off ? 'off' : e.reduced ? 'reduced' : e.perf ? 'perf' : e.hidden ? 'hidden' : e.saver ? 'saver' : '';
  };
  // Particle counts by area (CSS px of the photo), capped so a 4K wall screen costs what a laptop costs.
  W.plan = function (m, w, h) {
    var area = Math.max(0, w) * Math.max(0, h);
    if (!m || !area) return { drops: 0, flakes: 0, streaks: 0 };
    return {
      drops: m.rain ? Math.min(150, Math.round(area / 9000 * m.rain)) : 0,
      flakes: m.snow ? Math.min(90, Math.round(area / 16000 * m.snow)) : 0,
      streaks: m.wind && !m.rain && !m.snow ? Math.min(9, Math.max(3, Math.round(area / 160000))) : 0,
    };
  };

  // ── On the dashboard ───────────────────────────────────────────────────────
  if (!window.document || window.document.nodeType !== 9) { W.attach = W.phoneWeather = function () { return '0'; }; return; }
  var mm = function (q) { try { return !!(window.matchMedia && window.matchMedia(q).matches); } catch (e) { return false; } };
  var mounts = [];
  var timer = null, gen = 0;
  var env = function (vars) {
    return {
      off: !W.enabled(vars),
      reduced: mm('(prefers-reduced-motion: reduce)'),
      perf: !!(window._casoraPerf && window._casoraPerf.on && window._casoraPerf.on()),
      hidden: !!document.hidden,
      saver: !!(window._casoraSaver && window._casoraSaver.shown && window._casoraSaver.shown()),
    };
  };
  var CSS = '.casora-pwx{position:absolute;inset:0;z-index:-9;pointer-events:none;overflow:hidden;border-radius:inherit;'
    // Desktop and tablet: weaker where the title, the weather and the badges sit (left).
    + '-webkit-mask-image:linear-gradient(to right,rgba(0,0,0,' + W.TEXT_ZONE + ') 0%,#000 48%);mask-image:linear-gradient(to right,rgba(0,0,0,' + W.TEXT_ZONE + ') 0%,#000 48%);}'
    // Phone: only over the photo; fades out with the photo's dissolve, weaker under the title.
    + '.casora-pwx[data-where="phone"]{-webkit-mask-image:linear-gradient(to bottom,rgba(0,0,0,' + W.TEXT_ZONE + ') 0%,#000 calc(var(--casora-mobile-hero-fade-start, 12%) + var(--casora-safe-top, 0px)),transparent calc(var(--casora-mobile-hero-p-handoff, 30%) + var(--casora-safe-top, 0px)));'
    + 'mask-image:linear-gradient(to bottom,rgba(0,0,0,' + W.TEXT_ZONE + ') 0%,#000 calc(var(--casora-mobile-hero-fade-start, 12%) + var(--casora-safe-top, 0px)),transparent calc(var(--casora-mobile-hero-p-handoff, 30%) + var(--casora-safe-top, 0px)));}'
    + '.casora-pwx canvas{position:absolute;inset:0;width:100%;height:100%;display:block;}'
    + '.casora-pwx .pwx-fog{position:absolute;inset:0;opacity:0;transition:opacity 1.2s ease;'
    + 'background:linear-gradient(to bottom,rgba(var(--pwx-fog),calc(var(--pwx-a) * .45)) 0%,rgba(var(--pwx-fog),var(--pwx-a)) 58%,rgba(var(--pwx-fog),calc(var(--pwx-a) * .7)) 100%);}'
    + '.casora-pwx.fog .pwx-fog{opacity:1;}'
    + '@media (prefers-reduced-motion: reduce){.casora-pwx{display:none !important;}}';

  var rnd = Math.random;
  var seed = function (M) {
    var p = W.plan(M.mood, M.cw, M.ch), s = W.SCALE, w = M.w, h = M.h, i;
    M.drops = []; M.flakes = []; M.streaks = [];
    for (i = 0; i < p.drops; i++) M.drops.push({ x: rnd() * w, y: rnd() * h, l: (9 + rnd() * 9) * s, v: (620 + rnd() * 380) * s, a: 0.55 + rnd() * 0.45 });
    for (i = 0; i < p.flakes; i++) M.flakes.push({ x: rnd() * w, y: rnd() * h, r: (1 + rnd() * 1.8) * s * 1.6, v: (26 + rnd() * 36) * s, ph: rnd() * 6.283, f: 0.5 + rnd() });
    for (i = 0; i < p.streaks; i++) M.streaks.push({ x: rnd() * w, y: rnd() * h * 0.8, l: (90 + rnd() * 90) * s, t: rnd(), d: 2.6 + rnd() * 2 });
  };
  var size = function (M) {
    var r = M.wrap.getBoundingClientRect();
    var cw = Math.round(r.width), ch = Math.round(r.height);
    if (cw === M.cw && ch === M.ch) return false;
    M.cw = cw; M.ch = ch;
    M.w = M.cv.width = Math.max(1, Math.round(cw * W.SCALE));
    M.h = M.cv.height = Math.max(1, Math.round(ch * W.SCALE));
    return true;
  };
  var moving = function (M) { return !!(M.mood && (M.mood.rain || M.mood.snow || M.mood.wind)); };

  var draw = function (M, dt, now) {
    var c = M.ctx, m = M.mood, w = M.w, h = M.h, i, p;
    if (!c) return;
    c.clearRect(0, 0, w, h);
    var ink = M.dark ? '226,232,240' : '255,255,255', soft = M.dark ? 0.82 : 1;
    // Wind slants the rain and carries the snow; the sway is a slow breath on top.
    var gust = 0.7 + 0.3 * Math.sin(now / 2300);
    var slant = m.dir * (0.06 + 0.5 * m.sway) * gust;
    if (M.drops.length) {
      c.strokeStyle = 'rgba(' + ink + ',' + (W.MAX.rain * soft * (0.55 + 0.45 * m.rain)).toFixed(3) + ')';
      c.lineWidth = Math.max(0.6, 1.1 * W.SCALE);
      c.lineCap = 'round';
      c.beginPath();
      for (i = 0; i < M.drops.length; i++) {
        p = M.drops[i];
        p.y += p.v * dt; p.x += p.v * slant * dt;
        if (p.y - p.l > h) { p.y = -p.l - rnd() * h * 0.2; p.x = rnd() * w; }
        if (p.x < -20) p.x += w + 40; else if (p.x > w + 20) p.x -= w + 40;
        c.moveTo(p.x, p.y);
        c.lineTo(p.x - p.l * slant, p.y - p.l);
      }
      c.stroke();
    }
    if (M.flakes.length) {
      c.fillStyle = 'rgba(' + ink + ',' + (W.MAX.snow * soft).toFixed(3) + ')';
      c.beginPath();
      for (i = 0; i < M.flakes.length; i++) {
        p = M.flakes[i];
        p.ph += dt * p.f;
        p.y += p.v * dt;
        p.x += (p.v * slant * 1.6 + Math.sin(p.ph) * 9 * W.SCALE) * dt;
        if (p.y - p.r > h) { p.y = -p.r * 2; p.x = rnd() * w; }
        if (p.x < -10) p.x += w + 20; else if (p.x > w + 10) p.x -= w + 20;
        c.moveTo(p.x + p.r, p.y);
        c.arc(p.x, p.y, p.r, 0, 6.283);
      }
      c.fill();
    }
    if (M.streaks.length) {
      c.lineWidth = Math.max(0.6, 1.2 * W.SCALE);
      c.lineCap = 'round';
      for (i = 0; i < M.streaks.length; i++) {
        p = M.streaks[i];
        p.t += dt / p.d;
        if (p.t >= 1) { p.t = 0; p.x = m.dir > 0 ? -p.l : w; p.y = rnd() * h * 0.8; }
        var x = p.x + m.dir * p.t * w * (0.45 + 0.4 * m.sway);
        var y = p.y + Math.sin(p.t * 3.1416 * 2) * 6 * W.SCALE;
        c.strokeStyle = 'rgba(' + ink + ',' + (W.MAX.wind * soft * Math.sin(p.t * 3.1416)).toFixed(3) + ')';
        c.beginPath();
        c.moveTo(x, y);
        c.quadraticCurveTo(x + m.dir * p.l * 0.5, y - 5 * W.SCALE, x + m.dir * p.l, y);
        c.stroke();
      }
    }
  };

  var last = 0;
  var frame = function (g) {
    if (g !== gen) return;
    timer = null;
    var now = Date.now(), dt = Math.min(0.1, last ? (now - last) / 1000 : 0);
    last = now;
    var any = false, waiting = false;
    for (var i = mounts.length - 1; i >= 0; i--) {
      var M = mounts[i];
      if (!M.wrap.isConnected) { mounts.splice(i, 1); continue; }
      var why = W.blocked(env(M.vars));
      M.wrap.style.display = why ? 'none' : '';
      if (why) { if (why === 'saver') waiting = true; continue; }
      if (!moving(M)) continue;
      if (size(M)) seed(M);
      if (!M.cw || !M.ch) continue;
      any = true;
      draw(M, dt, now);
    }
    // The screensaver hides the photo: look again every few seconds, no frames meanwhile.
    if (any) schedule(1000 / W.FPS);
    else if (waiting) schedule(3000);
    else last = 0;
  };
  var schedule = function (ms) {
    if (timer || document.hidden) return;
    var g = gen;
    timer = setTimeout(function () {
      // requestAnimationFrame stops by itself in a hidden tab; the frame is drawn in step with the screen.
      if (window.requestAnimationFrame) window.requestAnimationFrame(function () { frame(g); });
      else frame(g);
    }, ms);
  };
  var kick = function () { gen++; if (timer) { clearTimeout(timer); timer = null; } last = 0; schedule(0); };
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { gen++; if (timer) { clearTimeout(timer); timer = null; } return; }
    kick();
  });
  try {
    var rq = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
    if (rq && rq.addEventListener) rq.addEventListener('change', kick);
  } catch (e) { /* older browsers: read on every render */ }

  // Puts a layer (back) into the frame loop; true if it was not in it.
  var track = function (M) {
    if (mounts.indexOf(M) > -1 || M.card._casoraPwx !== M) return false;
    mounts.push(M);
    return true;
  };
  var mount = function (card, where) {
    var root = card && card.shadowRoot, ha = root && root.querySelector('ha-card');
    if (!ha) return null;
    var M = card._casoraPwx;
    // HA parks a view it leaves and hangs it back in on return: the loop dropped the layer meanwhile, take it back.
    if (M && M.wrap.isConnected && M.wrap.parentNode === ha) { track(M); return M; }
    // button-card drew a new ha-card: the old layer goes with its observer.
    if (M) unmount(card);
    if (!root.getElementById('casora-pwx-css')) {
      var st = document.createElement('style');
      st.id = 'casora-pwx-css';
      st.textContent = CSS;
      root.appendChild(st);
    }
    var wrap = document.createElement('div');
    wrap.className = 'casora-pwx';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.setAttribute('data-where', where === 'phone' ? 'phone' : 'room');
    var fog = document.createElement('div');
    fog.className = 'pwx-fog';
    var cv = document.createElement('canvas');
    wrap.appendChild(fog);
    wrap.appendChild(cv);
    ha.insertBefore(wrap, ha.firstChild);
    M = { card: card, wrap: wrap, fog: fog, cv: cv, ctx: cv.getContext ? cv.getContext('2d') : null, cw: 0, ch: 0, w: 1, h: 1, mood: null, key: '', drops: [], flakes: [], streaks: [] };
    if (typeof ResizeObserver === 'function') {
      M.ro = new ResizeObserver(function () {
        if (!M.wrap.isConnected) return;
        var back = track(M);
        if (size(M)) { seed(M); back = true; }
        if (back) kick();
      });
      M.ro.observe(wrap);
    }
    card._casoraPwx = M;
    track(M);
    return M;
  };
  var unmount = function (card) {
    var M = card && card._casoraPwx;
    if (!M) return;
    if (M.ro) M.ro.disconnect();
    M.wrap.remove();
    card._casoraPwx = null;
    var i = mounts.indexOf(M);
    if (i > -1) mounts.splice(i, 1);
  };

  // Called while the card renders (every hass update): cheap unless the weather or the setting changed.
  W.attach = function (card, vars, hass, where) {
    try {
      var v = vars || {};
      // The phone's shell has no weather of its own: the header (casora_mobile_weather) names it (W.phoneWeather).
      if (where === 'phone') phoneCards.set(card, [v, hass]);
      var id = (where === 'phone' && W._phoneWx) || (window.casoraWx ? window.casoraWx(v, 'entity') : (v.weather_entity || ''));
      var st = id && hass && hass.states ? hass.states[id] : null;
      var m = W.mood(st);
      var why = W.blocked(env(v));
      // Off for good (switch, reduced motion, performance) or nothing to show: no layer in the card at all.
      if (!m || why === 'off' || why === 'reduced' || why === 'perf') { unmount(card); return '0'; }
      var M = mount(card, where);
      if (!M) return '0';
      M.vars = v;
      var dark = !!(hass && hass.themes && hass.themes.darkMode);
      M.dark = dark;
      M.wrap.classList.toggle('fog', !!m.fog);
      M.fog.style.setProperty('--pwx-fog', dark ? '150,158,170' : '238,236,232');
      M.fog.style.setProperty('--pwx-a', String((W.MAX.fog * m.fog).toFixed(3)));
      if (m.key !== M.key) {
        M.key = m.key; M.mood = m;
        if (M.ctx) M.ctx.clearRect(0, 0, M.w, M.h);
        M.cw = 0;
        if (moving(M)) kick();
      } else M.mood = m;
      if (moving(M) && !timer) schedule(0);
    } catch (e) { /* the photo stays as it is */ }
    return '0';
  };
  // Called from the phone's header with its weather entity; a shell drawn before it takes it over right away.
  var phoneCards = typeof Map === 'function' ? new Map() : { set: function () {}, forEach: function () {} };
  W.phoneWeather = function (id) {
    var next = typeof id === 'string' && /^weather\./.test(id) ? id : '';
    if (next === (W._phoneWx || '')) return '0';
    W._phoneWx = next;
    phoneCards.forEach(function (a, card) { if (card.isConnected === false) phoneCards.delete(card); else W.attach(card, a[0], a[1], 'phone'); });
    return '0';
  };
  W._mounts = mounts;
})();
