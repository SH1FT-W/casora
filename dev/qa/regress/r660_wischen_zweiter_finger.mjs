// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/40-swipe-rooms.js
// Swipe between rooms (40-swipe-rooms.js): a second finger that lands while the open room follows the first one
// started a new touch and dropped the gesture without putting the page back, so the room stayed shifted and faded
// until the next swipe. Expected: the page goes back to its place, the room does not change.
// Phone 393 with real touch input (CDP, two touch points), setting only in the browser.
import { open, usePage, casoraDashboard, dashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora-Dashboard mit Handy-Gegenstück', dash && dash.phone);

const { page, context } = await open({ width: 393, height: 852, mobile: true, dark: false, theme: 'Casora' });
usePage(page);
await dashboard(page, dash.phone.url);
await page.waitForFunction(() => !!(window._hmnOwner && window._hmnOwner._rooms && window._hmnOwner._rooms.length >= 3), null, { timeout: 20000 }).catch(() => {});
const keys = await page.evaluate(() => (window._hmnOwner._rooms || []).filter(window.casoraSeesRoute || (() => true)).map((r) => r.key));
await need('Handy: mindestens drei Räume im Raummenü', keys.length >= 3, keys);
const cdp = await context.newCDPSession(page);
const cur = () => page.evaluate(() => window._casoraFilter.get());
await page.evaluate(() => { window._hmnOwner._cfg = Object.assign({}, window._hmnOwner._cfg, { swipe_rooms: true }); });
await page.evaluate((k) => { window._casoraFilter.set(k); }, keys[1]);
await page.waitForTimeout(1800);
// The open room's page (the element the module moves).
const look = () => page.evaluate((k) => { let o = null;
  Array.from(window._casoraSmartRows || []).forEach((r) => r.shadowRoot && r.shadowRoot.querySelectorAll('casora-filter-overlay')
    .forEach((fo) => { if (fo._config && fo._config.filter_category === k && fo._overlayEl) o = fo._overlayEl; }));
  return o ? { transform: o.style.transform, opacity: o.style.opacity } : null; }, keys[1]);

const y = 520;
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y, id: 1 }] });
for (let i = 1; i <= 5; i++) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 300 - i * 16, y, id: 1 }] });
  await page.waitForTimeout(16);
}
const moved = await look();
await check('der offene Raum folgt dem ersten Finger', !!moved && /translate3d\(-/.test(moved.transform), moved);
// The second finger lands, then both leave.
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 220, y, id: 1 }, { x: 120, y: y + 80, id: 2 }] });
await page.waitForTimeout(30);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await page.waitForTimeout(900);
const after = await look();
await check('zweiter Finger: die Seite steht wieder an ihrem Platz', !!after && !/translate3d/.test(after.transform) && (after.opacity === '' || after.opacity === '1'), after);
await check('zweiter Finger: kein Raumwechsel', (await cur()) === keys[1], { cur: await cur(), want: keys[1] });

await page.evaluate(() => { window._hmnOwner._cfg = Object.assign({}, window._hmnOwner._cfg, { swipe_rooms: false }); });
await finish();
