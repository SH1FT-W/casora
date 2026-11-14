// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/46-screensaver.js#_casoraSaver
// Alltag round (14.11.2026), wall tablet: the tap that wakes the dashboard from the screensaver went on to the tile
// or badge underneath (the screensaver closed on pointerdown, the rest of the tap – pointerup, the click – landed on
// the dashboard): waking expanded the Klima badge, on a light icon it would switch the light. Expected: the waking tap
// only wakes; nothing underneath gets a click or an action. Tablet with touch, started by hand (no start time, nothing
// saved), tapped right on a badge.
import { open, ready, check, need, finish, BASE } from './lib.mjs';

const DASH = process.env.CASORA_QA_DASH || 'qa-arbeit';
const { page } = await open({ width: 1180, height: 820, touch: true, scale: 1.5, dark: false,
  userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1' });
await ready(page, '/' + DASH + '/home?casora_saver=1', () => window.__pierce && window.__pierce('button-card').length > 3 && !!window._casoraSaver);
await page.waitForTimeout(2500);

// A visible badge with an action of its own (Klima, else any header badge) – the spot the finger lands on.
const at = await page.evaluate(() => {
  const vis = (x) => { const r = x.getBoundingClientRect(); return r.width > 40 && r.height > 20 && r.top > 0 && r.bottom < innerHeight && r.left > 0 && r.right < innerWidth; };
  const tpl = (x) => [].concat((x._config || {}).template || []);
  const cards = window.__pierce('button-card').filter(vis);
  const b = cards.find((x) => tpl(x).includes('casora_badge_climate_group')) || cards.find((x) => tpl(x).some((t) => /^casora_badge_/.test(t)));
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, tpl: tpl(b).join(',') };
});
await need('a badge on Home', at);

// Everything the dashboard would act on: clicks outside the screensaver and button-card actions.
await page.evaluate(() => {
  window.__r731 = [];
  const inLayer = (e) => (e.composedPath ? e.composedPath() : []).some((n) => n && n.classList && n.classList.contains('cs-sv-layer'));
  document.addEventListener('click', (e) => { if (!inLayer(e)) window.__r731.push('click'); }, true);
  window.addEventListener('hass-action', (e) => window.__r731.push('hass-action ' + JSON.stringify((e.detail || {}).action || '')), true);
  const h = document.querySelector('home-assistant');
  const orig = h.hass.callService.bind(h.hass);
  h.hass.callService = (d, s, ...a) => { window.__r731.push('callService ' + d + '.' + s); return orig(d, s, ...a); };
});
await page.evaluate(() => window._casoraSaver.start());
await page.waitForFunction(() => !!document.querySelector('.cs-sv-layer'), null, { timeout: 10000 }).catch(() => {});
await need('screensaver shown (started by hand)', await page.evaluate(() => !!document.querySelector('.cs-sv-layer')));
await page.waitForTimeout(1200);

await page.touchscreen.tap(at.x, at.y);
await page.waitForFunction(() => !document.querySelector('.cs-sv-layer'), null, { timeout: 5000 }).catch(() => {});
await page.waitForTimeout(1500);
const after = await page.evaluate(() => ({ layer: !!document.querySelector('.cs-sv-layer'), got: window.__r731.slice() }));
await check('a tap wakes the dashboard', !after.layer, after);
await check('the waking tap does not reach the badge underneath (' + at.tpl + ')', after.got.length === 0, after.got);

// Afterwards a tap works as usual again.
await page.touchscreen.tap(at.x, at.y);
await page.waitForTimeout(1500);
await check('the next tap reaches the badge again', await page.evaluate(() => window.__r731.length > 0), await page.evaluate(() => window.__r731));
await finish();
