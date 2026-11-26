// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/52-photo-weather.js#_casoraPhotoWx custom_components/casora/panel/casora-panel-settings.js#photowx dashboards/casora/button_card_templates.json#casora_mobile_weather,casora_mobile_bg,casora_room
// New (living house photo, stage 1): the weather of the dashboard lightly over the room photo.
// Expected:
//   - desktop 1440 (light) and tablet 1024 (dark): rain gives the hero card of the open view a layer between the photo
//     and its content (first child of ha-card, z-index -9, no pointer events, aria-hidden) whose canvas draws streaks;
//     the room title stays on top (elementFromPoint finds it, not the layer); at most FPS + a little frames a second
//   - away to another view and back (HA hangs the parked view back in): the layer draws again, also new weather
//   - fog: a still veil, no frames; clear weather: no layer at all
//   - while the screensaver shows, the layer is hidden and draws nothing
//   - prefers-reduced-motion: no layer
//   - phone 393 (WebKit): snow gives the phone's photo shell (casora_mobile_bg) the layer, masked to the photo
//   - Studio: Settings › Look & feel has the block "Weather on the photo" with one switch, on by default, in English
//     and German
// Nothing is stored in HA: the weather is put under the page with fakeStates.
import { open, usePage, casoraDashboard, dashboard, studio, fakeStates, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard((d) => /"casora_room"/.test(JSON.stringify(d.config)));
await need('Casora dashboard with room card', dash);

// The weather entity the dashboard uses (casoraWx remembers it for this dashboard once the hero has drawn).
const wxOf = (pg) => pg.evaluate(() => (window.casoraWx ? window.casoraWx({}, 'entity') : '') || '');
const RAIN = { state: 'rainy', attributes: { wind_speed: 30, wind_speed_unit: 'km/h', wind_bearing: 270 } };

// The layer of the visible hero card (casora_room or casora_mobile_bg).
const layer = (pg, tpl) => pg.evaluate((tpl) => {
  const card = window.__pierce('button-card').find((b) => [].concat((b._config || {}).template || []).includes(tpl)
    && b.getBoundingClientRect().width > 0);
  if (!card) return { card: false };
  const ha = card.shadowRoot && card.shadowRoot.querySelector('ha-card');
  const w = ha && ha.querySelector(':scope > .casora-pwx');
  if (!w) return { card: true, layer: false };
  const cs = getComputedStyle(w), cv = w.querySelector('canvas');
  let ink = 0;
  try {
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    for (let i = 3; i < d.length; i += 16) if (d[i] > 0) ink++;
  } catch (e) { ink = -1; }
  return { card: true, layer: true, first: ha.firstElementChild === w, z: cs.zIndex, pe: cs.pointerEvents, hidden: w.getAttribute('aria-hidden'),
    shown: cs.display !== 'none', fog: w.classList.contains('fog'), where: w.getAttribute('data-where'), cw: cv.width, ch: cv.height, ink,
    mask: cs.webkitMaskImage || cs.maskImage || '' };
}, tpl);
// Frames drawn in one second (each frame clears the canvas once).
const fps = (pg) => pg.evaluate(() => new Promise((res) => {
  const P = CanvasRenderingContext2D.prototype, orig = P.clearRect;
  let n = 0;
  P.clearRect = function () { if (this.canvas && this.canvas.parentNode && this.canvas.parentNode.classList.contains('casora-pwx')) n++; return orig.apply(this, arguments); };
  setTimeout(() => { P.clearRect = orig; res(n); }, 1000);
}));
const titleOnTop = (pg) => pg.evaluate(() => {
  const card = window.__pierce('button-card').find((b) => [].concat((b._config || {}).template || []).includes('casora_room') && b.getBoundingClientRect().width > 0);
  const t = card && ['#name', '#n'].map((s) => card.shadowRoot.querySelector(s)).find((e) => e && e.getBoundingClientRect().width > 0);
  if (!t) return null;
  const r = t.getBoundingClientRect();
  let hit = card.shadowRoot.elementFromPoint(r.left + Math.min(20, r.width / 2), r.top + r.height / 2);
  return !!hit && !(hit.closest && hit.closest('.casora-pwx'));
});

for (const v of [{ name: 'desktop', width: 1440, height: 900, dark: false }, { name: 'tablet', width: 1024, height: 768, dark: true, touch: true }]) {
  const o = await open({ width: v.width, height: v.height, dark: v.dark, touch: v.touch });
  usePage(o.page);
  const pg = o.page;
  await dashboard(pg, dash.url);
  const wx = await wxOf(pg);
  await need(v.name + ': dashboard has a weather entity', /^weather\./.test(wx), wx);

  await fakeStates(pg, { [wx]: { state: 'sunny', attributes: {} } }, { sticky: true });
  let L = await layer(pg, 'casora_room');
  await check(v.name + ': clear weather draws no layer', L.card && !L.layer, L);

  await fakeStates(pg, { [wx]: RAIN }, { sticky: true });
  await pg.waitForTimeout(800);
  L = await layer(pg, 'casora_room');
  await check(v.name + ': rain → layer as first child of the hero card, z-index -9, no pointer events, hidden from readers',
    L.layer && L.first && L.z === '-9' && L.pe === 'none' && L.hidden === 'true' && L.shown, L);
  await check(v.name + ': canvas at half resolution draws streaks', L.cw > 100 && L.cw <= Math.ceil(v.width / 2) + 1 && L.ink > 0, L);
  await check(v.name + ': weaker in the text zone (mask on the left)', /gradient/.test(L.mask), L.mask);
  await check(v.name + ': room title stays above the layer', await titleOnTop(pg) !== false);
  const n = await fps(pg);
  await check(v.name + ': frame rate capped (' + n + ' frames in 1 s)', n >= 5 && n <= 24, n);

  // Away to another view and back: HA hangs the parked view back in, its layer must draw again, also new weather.
  const views = (dash.config.views || []).map((x, i) => '/' + dash.url + '/' + (x.path || i));
  const here = await pg.evaluate(() => location.pathname);
  const other = views.find((u) => u !== here);
  if (other) {
    const go = (u) => pg.evaluate((u) => { history.pushState(null, '', u);
      window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } })); }, u);
    await go(other); await pg.waitForTimeout(1200);
    await go(here); await pg.waitForTimeout(1200);
    const nBack = await fps(pg);
    await check(v.name + ': back on the view → rain draws again (' + nBack + ' frames in 1 s)', nBack >= 5, nBack);
    await go(other); await pg.waitForTimeout(800);
    await fakeStates(pg, { [wx]: { state: 'snowy', attributes: {} } }, { sticky: true });
    await go(here); await pg.waitForTimeout(1200);
    const nSnow = await fps(pg);
    L = await layer(pg, 'casora_room');
    await check(v.name + ': back with new weather → snow draws', L.layer && L.shown && nSnow >= 5 && L.ink > 0, { L, nSnow });
    await fakeStates(pg, { [wx]: RAIN }, { sticky: true });
    await pg.waitForTimeout(600);
  } else console.log('  info   ' + v.name + ': only one view – away-and-back skipped');

  // Screensaver showing: hidden, no frames.
  await pg.evaluate(() => { window.__qaShown = window._casoraSaver && window._casoraSaver.shown; if (window._casoraSaver) window._casoraSaver.shown = () => true; });
  await pg.waitForTimeout(400);
  const nSaver = await fps(pg);
  L = await layer(pg, 'casora_room');
  await check(v.name + ': screensaver → layer hidden, no frames', !L.shown && nSaver === 0, { L, nSaver });
  await pg.evaluate(() => { if (window._casoraSaver && window.__qaShown) window._casoraSaver.shown = window.__qaShown; });

  await fakeStates(pg, { [wx]: { state: 'fog', attributes: {} } }, { sticky: true });
  await pg.waitForTimeout(600);
  L = await layer(pg, 'casora_room');
  const nFog = await fps(pg);
  await check(v.name + ': fog → still veil, no frames', L.layer && L.fog && nFog === 0, { L, nFog });

  await fakeStates(pg, { [wx]: { state: 'partlycloudy', attributes: {} } }, { sticky: true });
  L = await layer(pg, 'casora_room');
  await check(v.name + ': back to clear → layer gone', L.card && !L.layer, L);

  await pg.emulateMedia({ reducedMotion: 'reduce' });
  await fakeStates(pg, { [wx]: RAIN }, { sticky: true });
  L = await layer(pg, 'casora_room');
  await check(v.name + ': reduced motion → no layer', L.card && !L.layer, L);
  await o.browser.close().catch(() => {});
}

// ── Phone ──
if (dash.phone) {
  const o = await open({ width: 393, height: 852, mobile: true, safari: true, dark: true });
  usePage(o.page);
  const pg = o.page;
  await dashboard(pg, dash.phone.url);
  // The phone's header names its weather entity for the photo shell (casora_mobile_weather → phoneWeather).
  const wx = await pg.evaluate(() => (window._casoraPhotoWx && window._casoraPhotoWx._phoneWx) || '');
  await need('phone: weather entity', /^weather\./.test(wx), wx);
  await fakeStates(pg, { [wx]: { state: 'snowy', attributes: { wind_speed: 12, wind_speed_unit: 'km/h' } } }, { sticky: true });
  await pg.waitForTimeout(800);
  const L = await layer(pg, 'casora_mobile_bg');
  await check('phone: snow → layer in the photo shell, masked to the photo', L.layer && L.first && L.where === 'phone' && L.z === '-9' && /gradient/.test(L.mask), L);
  await check('phone: canvas draws flakes', L.ink > 0 || L.ink === -1, L);
  await o.browser.close().catch(() => {});
} else console.log('  info   no phone dashboard – phone part skipped');

// ── Studio: the block under Look & feel ──
for (const lang of ['en', 'de']) {
  const o = await open({ width: 1440, height: 900, dark: true, lang });
  usePage(o.page);
  await studio(o.page, dash.url);
  await o.page.evaluate(() => window.__panel()._csShow('n-look'));
  await o.page.waitForTimeout(1500);
  const B = await o.page.evaluate(() => {
    const blk = window.__panel().shadowRoot.querySelector('#pane .cn-block[data-pkey="nb-photowx"]');
    if (!blk) return null;
    const sw = [...blk.querySelectorAll('[role="switch"]')];
    return { title: (blk.querySelector('.cn-bhead b') || {}).textContent || '', n: sw.length, on: sw[0] && sw[0].getAttribute('aria-checked') };
  });
  const want = lang === 'de' ? /Wetter auf dem Foto/ : /Weather on the photo/;
  await check('Studio ' + lang + ': block "Weather on the photo" with one switch, on', B && want.test(B.title) && B.n === 1 && B.on === 'true', B);
  await o.browser.close().catch(() => {});
}

await finish();
