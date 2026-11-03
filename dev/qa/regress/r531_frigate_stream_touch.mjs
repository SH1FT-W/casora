// @zustand: arbeit
// @deckt: custom_components/casora/scripts/local/23-frigate.js#LP._build,casora-frigate-live
// #120 (26.11.8, Android phone): touching a stream field ("Standard · Unterstream") in the Frigate popup was ignored.
// Real taps on the switch below the picture must switch the stream both ways and keep the popup open, on: Android
// (Chromium, touch, Android user agent, 393×852, page.touchscreen.tap), iPhone (WebKit, touch, 393×852) and desktop
// (Chromium, mouse click).
// Made-up Frigate camera camera.testhof (dev/casora_mock/frigate.py). Tiles only in the browser, nothing saved.
import { open, casoraDashboard, dashboard, check, need, finish, stable, BASE } from './lib.mjs';
import { tokens } from '../ws.mjs';

const ID = 'camera.testhof';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const tok = await tokens();
const svc = (name, data) => fetch(BASE + '/api/services/casora_mock/' + name,
  { method: 'POST', headers: { Authorization: 'Bearer ' + tok.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify(data || {}) });
await svc('frigate_proxy', { notifications: true, vod: true, reviews: true, stream: false, clips: true, streams: true, zuruecksetzen: true });
const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);

const addTile = (page, left, top) => page.evaluate(async ([id, left, top]) => {
  const ha = document.querySelector('home-assistant');
  const h = await window.loadCardHelpers();
  const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_frigate', entity: id, name: 'Hofkamera', variables: {} });
  el.classList.add('qa-r531');
  el.hass = ha.hass;
  el.style.cssText = 'position:fixed;left:' + left + 'px;top:' + top + 'px;width:290px;height:200px;z-index:99990;';
  ha.shadowRoot.appendChild(el);
  el._qaT = setInterval(() => { if (el.hass !== ha.hass) el.hass = ha.hass; }, 200);
}, [ID, left, top]);
const tileAt = (page) => page.evaluate(() => {
  const r = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-r531').getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
const state = (page) => page.evaluate(() => {
  const pop = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
  if (!pop) return { open: false };
  const el = window.__pierce('casora-frigate-live', pop.shadowRoot)[0];
  if (!el || !el.shadowRoot) return { open: true, card: false };
  const segs = [...el.shadowRoot.querySelectorAll('.hui-sg')];
  return { open: true, card: true, src: el._src, segs: segs.map((s) => (s.classList.contains('on') ? '*' : '') + s.textContent.trim()) };
});
const segAt = (page, label) => page.evaluate((l) => {
  const pop = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
  const el = pop && window.__pierce('casora-frigate-live', pop.shadowRoot)[0];
  const s = el && [...el.shadowRoot.querySelectorAll('.hui-sg')].find((x) => x.textContent.trim() === l);
  if (!s) return null;
  s.scrollIntoView({ block: 'center' });
  const r = s.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}, label);
const waitSegs = (page, n) => stable(page, () => {
  const pop = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
  const el = pop && window.__pierce('casora-frigate-live', pop.shadowRoot)[0];
  return el && el.shadowRoot ? el.shadowRoot.querySelectorAll('.hui-sg').length : 0;
}, null, { max: 20000, quiet: 900, until: (v) => v >= n });

for (const [label, opts, tap] of [
  ['Android', { width: 393, height: 852, mobile: true, touch: true, userAgent: ANDROID, theme: 'Casora' }, (p, at) => p.touchscreen.tap(at.x, at.y)],
  ['iPhone', { width: 393, height: 852, mobile: true, safari: true, theme: 'Casora' }, (p, at) => p.touchscreen.tap(at.x, at.y)],
  ['Desktop', { width: 1440, height: 1000, theme: 'Casora' }, (p, at) => p.mouse.click(at.x, at.y)],
]) {
  const { page } = await open(opts);
  await dashboard(page, dash.url + (opts.mobile ? '-mobile' : ''), 3);
  await need(label + ': Frigate-Testkamera (Mock)', await page.evaluate((id) => !!document.querySelector('home-assistant').hass.states[id], ID));
  await page.evaluate(() => { try { sessionStorage.clear(); } catch (e) { /* none */ } });
  await addTile(page, opts.mobile ? 50 : 400, 300);
  await page.waitForTimeout(1500);
  await tap(page, await tileAt(page));
  await waitSegs(page, 2);
  const before = await state(page);
  await need(label + ': Popup mit Umschalter Standard · Unterstream', before.card && before.segs.length === 2, before);
  // The phone starts on the sub stream: tap the other field, then back.
  const first = before.src ? 'Standard' : 'Unterstream';
  const second = first === 'Standard' ? 'Unterstream' : 'Standard';
  // The phone sheet slides in: tap once the field stands still.
  let at = null;
  for (let i = 0; i < 20; i++) {
    const a = await segAt(page, first);
    if (a && at && Math.abs(a.x - at.x) < 1 && Math.abs(a.y - at.y) < 1) break;
    at = a; await page.waitForTimeout(250);
  }
  await tap(page, at);
  await page.waitForTimeout(1500);
  let s = await state(page);
  await check(label + ': Tipp auf „' + first + '“ schaltet um, Popup bleibt offen',
    s.open && s.segs && s.segs.includes('*' + first), { before, after: s });
  at = await segAt(page, second);
  if (at) { await tap(page, at); await page.waitForTimeout(1500); }
  s = await state(page);
  await check(label + ': Tipp auf „' + second + '“ schaltet zurück', s.open && s.segs && s.segs.includes('*' + second), s);
  await page.context().close();
}
await finish();
