// @deckt: custom_components/casora/scripts/local/52-photo-weather.js#_casoraPhotoWx
// Living house photo (52-photo-weather.js): which weather draws what, the wind in every unit, the Studio switch, why
// nothing is drawn, how many particles a photo gets, that text over the layer keeps its contrast, and on a small fake
// page: a layer only for weather worth showing, none for clear weather, the switch, reduced motion or the performance
// mode, no frame loop without anything moving or while the page is hidden or the screensaver runs.
//   node dev/unit/photo_weather.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const SRC = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/52-photo-weather.js', import.meta.url), 'utf8');
const st = (state, attributes = {}) => ({ entity_id: 'weather.home', state, attributes });

// ── Pure parts, without a document ──
{
  const win = {};
  vm.runInNewContext(SRC, { window: win, Math, Date, parseFloat, isFinite, String, Number });
  const W = win._casoraPhotoWx;
  assert.ok(W && typeof W.mood === 'function', 'module loads without a document');
  assert.equal(W.attach({}, {}, {}), '0', 'attach is a no-op without a document');

  for (const s of ['sunny', 'clear-night', 'partlycloudy', 'cloudy', 'lightning', 'exceptional', 'unknown', 'unavailable']) {
    assert.equal(W.mood(st(s)), null, s + ' draws nothing');
  }
  assert.equal(W.mood(null), null, 'no entity → nothing');
  const rain = W.mood(st('rainy', { wind_speed: 10, wind_speed_unit: 'km/h', wind_bearing: 270 }));
  assert.ok(rain.rain > 0 && !rain.snow && !rain.fog && !rain.wind, 'rainy → rain only');
  assert.equal(rain.dir, 1, 'wind from the west pushes to the right');
  assert.equal(W.mood(st('rainy', { wind_bearing: 90 })).dir, -1, 'wind from the east pushes to the left');
  assert.ok(W.mood(st('pouring')).rain > rain.rain, 'pouring is heavier than rainy');
  assert.ok(W.mood(st('snowy')).snow > 0, 'snowy → snow');
  const mix = W.mood(st('snowy-rainy'));
  assert.ok(mix.snow > 0 && mix.rain > 0, 'sleet → snow and rain');
  assert.equal(W.mood(st('fog')).fog, 1, 'fog → veil');
  const windy = W.mood(st('windy', { wind_speed: 2, wind_speed_unit: 'km/h' }));
  assert.ok(windy.wind >= 0.35, 'windy always sways a little');
  assert.ok(W.mood(st('windy-variant')).wind > 0, 'windy-variant sways');

  // Wind units → km/h.
  const near = (a, b) => Math.abs(a - b) < 1e-6;
  assert.ok(near(W.windKmh(st('rainy', { wind_speed: 10, wind_speed_unit: 'm/s' })), 36), 'm/s');
  assert.ok(near(W.windKmh(st('rainy', { wind_speed: 10, wind_speed_unit: 'mph' })), 16.09344), 'mph');
  assert.ok(near(W.windKmh(st('rainy', { wind_speed: 10, wind_speed_unit: 'kn' })), 18.52), 'knots');
  assert.ok(near(W.windKmh(st('rainy', { wind_speed: 10 })), 10), 'no unit = km/h');
  assert.ok(Number.isNaN(W.windKmh(st('rainy', {}))), 'no speed → NaN');
  assert.ok(W.mood(st('rainy', { wind_speed: 60 })).sway === 1, 'storm caps the sway at 1');
  // The key only moves in steps: a wobbling reading does not rebuild the layer.
  assert.equal(W.mood(st('rainy', { wind_speed: 20 })).key, W.mood(st('rainy', { wind_speed: 21 })).key, 'small wind change keeps the key');
  assert.notEqual(W.mood(st('rainy')).key, W.mood(st('snowy')).key, 'another condition changes the key');

  // Studio switch: on unless stored as false.
  assert.equal(W.enabled({}), true, 'default on');
  assert.equal(W.enabled({ photo_weather: null }), true, 'template default on');
  assert.equal(W.enabled({ photo_weather: true }), true);
  assert.equal(W.enabled({ photo_weather: false }), false, 'off when false');
  assert.equal(W.enabled({ photo_weather: 'false' }), false);

  assert.equal(W.blocked({}), '', 'nothing blocks');
  assert.equal(W.blocked({ reduced: true }), 'reduced');
  assert.equal(W.blocked({ perf: true }), 'perf');
  assert.equal(W.blocked({ hidden: true }), 'hidden');
  assert.equal(W.blocked({ saver: true }), 'saver');
  assert.equal(W.blocked({ off: true, saver: true }), 'off', 'the switch wins');

  // Particles by area, capped.
  const p1 = W.plan(W.mood(st('rainy')), 1440, 900), p4k = W.plan(W.mood(st('pouring')), 3840, 2160);
  assert.ok(p1.drops > 40 && p1.drops <= 150, 'desktop rain ' + p1.drops);
  assert.equal(p4k.drops, 150, '4K is capped');
  assert.ok(W.plan(W.mood(st('snowy')), 3840, 2160).flakes <= 90, 'snow capped');
  assert.deepEqual({ ...W.plan(W.mood(st('fog')), 1440, 900) }, { drops: 0, flakes: 0, streaks: 0 }, 'fog needs no particles');
  assert.ok(W.plan(windy, 1440, 900).streaks >= 3, 'wind draws a few streaks');
  assert.equal(W.plan(W.mood(st('rainy', { wind_speed: 40 })), 1440, 900).streaks, 0, 'rain with wind slants, no extra streaks');
  assert.deepEqual({ ...W.plan(null, 100, 100) }, { drops: 0, flakes: 0, streaks: 0 });

  // Readability: where the title sits the layer is at most TEXT_ZONE × its strength. White text over a mid-grey photo
  // (85, a dark-enough photo under the hero tint) keeps 4.5 : 1 even if the layer covered it completely.
  const lum = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  for (const [k, a] of Object.entries(W.MAX)) {
    const eff = a * W.TEXT_ZONE;
    assert.ok(eff <= 0.26, k + ' in the text zone ' + eff);
    const bg = 85 + (255 - 85) * eff, L = lum(bg);
    const ratio = 1.05 / (L + 0.05);
    assert.ok(ratio >= 4.5, k + ': white text keeps ' + ratio.toFixed(2) + ' : 1');
  }
  assert.ok(W.FPS <= 24, 'frame rate capped');
  assert.ok(W.SCALE <= 0.5, 'drawn below CSS resolution');
}

// ── On a fake page ──
{
  const timers = new Map();
  let tid = 0, rafs = [];
  const listeners = {};
  const mq = { reduced: false };
  const mkEl = (tag) => {
    const el = { tag, children: [], style: { setProperty(k, v) { this[k] = v; } }, attrs: {}, parentNode: null, className: '',
      classList: { set: new Set(), toggle(c, on) { if (on) this.set.add(c); else this.set.delete(c); }, contains(c) { return this.set.has(c); } },
      setAttribute(k, v) { this.attrs[k] = v; },
      appendChild(c) { c.parentNode = el; el.children.push(c); return c; },
      insertBefore(c) { c.parentNode = el; el.children.unshift(c); return c; },
      remove() { if (el.parentNode) { el.parentNode.children = el.parentNode.children.filter((x) => x !== el); el.parentNode = null; } },
      getBoundingClientRect: () => ({ width: 1440, height: 900 }),
      get isConnected() { let n = el; while (n.parentNode) n = n.parentNode; return n.root === true; } };
    if (tag === 'canvas') {
      el.draws = 0;
      el.getContext = () => new Proxy({}, { get: (t, k) => (k === 'clearRect' ? () => { el.draws++; } : typeof k === 'string' ? (t[k] || (() => {})) : undefined), set: () => true });
    }
    return el;
  };
  const document = { nodeType: 9, hidden: false, createElement: mkEl,
    addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); } };
  const win = {
    document,
    matchMedia: (q) => ({ matches: /reduced-motion/.test(q) ? mq.reduced : false, addEventListener() {} }),
    requestAnimationFrame: (f) => { rafs.push(f); return rafs.length; },
  };
  const box = { window: win, document, Math, Date, parseFloat, isFinite, String, Number,
    setTimeout: (f) => { timers.set(++tid, f); return tid; }, clearTimeout: (i) => timers.delete(i) };
  vm.runInNewContext(SRC, box);
  const W = win._casoraPhotoWx;
  const run = (n = 1) => { for (let i = 0; i < n; i++) { const t = [...timers]; timers.clear(); t.forEach(([, f]) => f()); const r = rafs; rafs = []; r.forEach((f) => f()); } };

  const mkCard = () => {
    const root = mkEl('#root'); root.root = true;
    const ha = mkEl('ha-card'); root.appendChild(ha);
    root.querySelector = (q) => (q === 'ha-card' ? ha : null);
    root.getElementById = (id) => root.children.find((c) => c.id === id) || null;
    return { shadowRoot: root, ha };
  };
  const hassOf = (s, dark = false) => ({ states: { 'weather.home': s }, themes: { darkMode: dark } });
  const vars = { weather_entity: 'weather.home' };
  const layer = (c) => c.ha.children.find((x) => x.className === 'casora-pwx');

  const c = mkCard();
  W.attach(c, vars, hassOf(st('sunny')), 'room');
  assert.equal(layer(c), undefined, 'clear weather: no layer');
  assert.equal(timers.size, 0, 'clear weather: no timer');

  W.attach(c, vars, hassOf(st('rainy')), 'room');
  const L = layer(c);
  assert.ok(L, 'rain: layer in the hero card');
  assert.equal(L.attrs['aria-hidden'], 'true', 'layer is hidden from screen readers');
  assert.ok(c.shadowRoot.getElementById('casora-pwx-css'), 'style in the card');
  assert.match(c.shadowRoot.getElementById('casora-pwx-css').textContent, /z-index:-9/, 'between photo and content');
  assert.match(c.shadowRoot.getElementById('casora-pwx-css').textContent, /prefers-reduced-motion/, 'CSS guard for reduced motion');
  const cv = L.children.find((x) => x.tag === 'canvas');
  run(3);
  assert.ok(cv.draws >= 2, 'rain draws frames (' + cv.draws + ')');
  assert.ok(timers.size === 1, 'one timer for the next frame');

  // Same weather again (every hass update): no second layer, no second loop.
  W.attach(c, vars, hassOf(st('rainy')), 'room');
  assert.equal(c.ha.children.filter((x) => x.className === 'casora-pwx').length, 1, 'one layer');
  assert.ok(timers.size <= 1, 'one loop');

  // Page hidden: the loop stops; visible again: it goes on.
  document.hidden = true;
  listeners.visibilitychange.forEach((f) => f());
  assert.equal(timers.size, 0, 'hidden: no timer');
  document.hidden = false;
  listeners.visibilitychange.forEach((f) => f());
  const before = cv.draws; run(2);
  assert.ok(cv.draws > before, 'visible again: draws');

  // Screensaver: the layer hides and only a slow check remains.
  win._casoraSaver = { shown: () => true };
  const d0 = cv.draws; run(2);
  assert.equal(cv.draws, d0, 'screensaver: no frames');
  assert.equal(L.style.display, 'none', 'screensaver: layer hidden');
  assert.equal(timers.size, 1, 'screensaver: one slow check');
  win._casoraSaver = { shown: () => false };
  run(2);
  assert.ok(cv.draws > d0, 'screensaver gone: draws again');

  // Fog: a still veil, no frame loop.
  W.attach(c, vars, hassOf(st('fog')), 'room');
  run(1); run(1);
  assert.ok(layer(c).classList.contains('fog'), 'fog veil on');
  assert.equal(timers.size, 0, 'fog: no frame loop');

  // Back to clear: layer gone.
  W.attach(c, vars, hassOf(st('sunny')), 'room');
  assert.equal(layer(c), undefined, 'clear again: layer removed');

  // Switch off, performance mode, reduced motion: no layer.
  W.attach(c, { ...vars, photo_weather: false }, hassOf(st('snowy')), 'room');
  assert.equal(layer(c), undefined, 'switch off: no layer');
  win._casoraPerf = { on: () => true };
  W.attach(c, vars, hassOf(st('snowy')), 'room');
  assert.equal(layer(c), undefined, 'performance mode: no layer');
  win._casoraPerf = { on: () => false };
  mq.reduced = true;
  W.attach(c, vars, hassOf(st('snowy')), 'room');
  assert.equal(layer(c), undefined, 'reduced motion: no layer');
  mq.reduced = false;

  // Phone: same layer, marked for the phone's mask.
  const p = mkCard();
  W.attach(p, vars, hassOf(st('snowy'), true), 'phone');
  assert.equal(layer(p).attrs['data-where'], 'phone', 'phone layer');
  assert.match(p.shadowRoot.getElementById('casora-pwx-css').textContent, /data-where="phone"[^}]*mobile-hero-p-handoff/, 'phone layer fades with the dissolve');

  // Phone shell without a weather entity of its own: the header names it, drawn before or after.
  const p2 = mkCard();
  const phoneHass = { states: { 'weather.phone': st('rainy') }, themes: {} };
  W.attach(p2, {}, phoneHass, 'phone');
  assert.equal(layer(p2), undefined, 'phone shell alone: no weather, no layer');
  W.phoneWeather('weather.phone');
  assert.ok(layer(p2), 'header names the weather → the shell draws it');
  W.phoneWeather('sensor.not_weather');
  assert.equal(layer(p2), undefined, 'not a weather entity → no layer');

  // A removed card drops out of the loop.
  p.shadowRoot.root = false;
  run(2);
  assert.ok(!W._mounts.some((M) => M.card === p), 'disconnected card dropped');

  // HA only parks a view it leaves and hangs it back in on return: the same layer must draw again, also for new weather.
  const r = mkCard();
  W.attach(r, vars, hassOf(st('rainy')), 'room');
  const rcv = layer(r).children.find((x) => x.tag === 'canvas');
  run(2);
  r.shadowRoot.root = false;
  run(2);
  assert.ok(!W._mounts.some((M) => M.card === r), 'parked view leaves the loop');
  r.shadowRoot.root = true;
  W.attach(r, vars, hassOf(st('rainy')), 'room');
  assert.equal(r.ha.children.filter((x) => x.className === 'casora-pwx').length, 1, 'back again: still one layer');
  assert.ok(W._mounts.some((M) => M.card === r), 'back again: in the loop');
  const r0 = rcv.draws; run(2);
  assert.ok(rcv.draws > r0, 'back again: draws');
  r.shadowRoot.root = false; run(1); r.shadowRoot.root = true;
  W.attach(r, vars, hassOf(st('snowy')), 'room');
  const r1 = rcv.draws; run(3);
  assert.ok(rcv.draws > r1 + 1, 'back with new weather: draws the new weather');
}

// Wired up: loader, both hero templates, the Studio field and its block, the phone mirror.
{
  const rd = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
  assert.ok(rd('custom_components/casora/scripts/casora-local.js').includes("'52-photo-weather'"), 'module in MODULES');
  const T = JSON.parse(rd('dashboards/casora/button_card_templates.json'));
  for (const [tpl, where] of [['casora_room', 'room'], ['casora_mobile_bg', 'phone']]) {
    const hit = T[tpl].styles.card.find((x) => x['--casora-photo-wx']);
    assert.ok(hit && hit['--casora-photo-wx'].includes("attach(this, variables, hass, '" + where + "')"), tpl + ' attaches the layer');
    assert.ok('photo_weather' in T[tpl].variables, tpl + ' declares photo_weather');
  }
  const panel = rd('custom_components/casora/panel/casora-panel.js');
  assert.match(panel, /key: "photo_weather", sub: "chrome", label: "Weather effects on the dashboard", type: "bool", boolDefault: true/, 'Studio field, on by default');
  assert.match(panel, /\["image", "image_night", "photo_weather"\]/, 'phone shell gets the switch from Home');
  assert.match(rd('custom_components/casora/panel/casora-panel-settings.js'), /k: "photowx", sec: "General", sub: "chrome", keys: \["photo_weather"\]/, 'block under Look & feel');
}
console.log('photo_weather: ok');
