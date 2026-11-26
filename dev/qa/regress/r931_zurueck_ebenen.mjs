// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/casora-core.js#casoraBack,_backSync,_histPopup,_backBound
// u06-01 (check round 26.11.2026, phone 393×852): the phone's back (Android button, iOS swipe, browser back) left the
// dashboard at once – an open popup, its sub page and an open room had no history entry of their own.
// Expected: back closes the sub page first (as its ‹), then the popup, then the room goes Home, and only then the
// dashboard is left. A popup closed by its X leaves no entry behind (the next back leaves at once). The address stays.
process.env.CASORA_THEME = process.env.CASORA_THEME || 'Casora';
import { open, usePage, casoraDashboard, dashboard, check, need, finish } from './lib.mjs';

const d = (await casoraDashboard((x) => x.url === 'qa-arbeit')) || (await casoraDashboard());
await need('Casora dashboard with a phone twin', d && d.phone, d && d.url);

const { page, browser } = await open({ width: 393, height: 852, mobile: true, touch: true, scale: 2, theme: 'Casora' });
usePage(page);
const go = (u) => page.evaluate((u) => { history.pushState(null, '', u);
  window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } })); }, u);
const back = async () => { await page.evaluate(() => history.back()); await page.waitForTimeout(1500); };
const read = () => page.evaluate(() => {
  const pop = window.__pierce('casora-popup').find((p) => p.hasAttribute('open'));
  return { path: location.pathname, open: !!pop, sub: !!(pop && pop.hasAttribute('has-back')),
    title: pop ? String(pop._headerTitle && pop._headerTitle.textContent || '') : '',
    filter: window._casoraFilter && window._casoraFilter.get(), layers: window.casoraBack ? window.casoraBack.layers() : null };
});
const popup = (title) => page.evaluate((t) => window.casoraPopup.open({ title: t, content: { type: 'markdown', content: 'u06-01' } }), title);
const sub = (title) => page.evaluate((t) => window.casoraPopup.sub({ title: t, content: { type: 'markdown', content: 'sub' } }), title);

// Come from another HA page, as in the finding (Settings › Areas → phone dashboard).
await dashboard(page, d.phone.url, 3);
const home = await page.evaluate(() => location.pathname);
await go('/config/areas/dashboard');
await page.waitForTimeout(1500);
await go(home);
await page.waitForFunction(() => !!window._hmnOwner, null, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(2500);

// 1. Popup → sub page → back → back.
await popup('Klima');
await page.waitForTimeout(1200);
await sub('Türen');
await page.waitForTimeout(1200);
const a = await read();
await need('popup with a sub page open', a.open && a.sub && a.path === home, a);
await back();
const b = await read();
await check('back on the sub page: the page before, popup still open, same address', b.open && !b.sub && b.title === 'Klima' && b.path === home, b);
await back();
const c = await read();
await check('back on the popup: closed, still on the dashboard', !c.open && c.path === home, c);

// 2. A room: back goes Home, not out.
const room = await page.evaluate(() => { const o = window._hmnOwner; const r = o && o._rooms && o._rooms[0]; if (r) o._set(r.key); return r && r.key; });
await need('a room to open', !!room, room);
await page.waitForTimeout(2000);
const e0 = await read();
await check('room open', e0.filter === room && e0.path === home, e0);
await popup('Licht');
await page.waitForTimeout(1200);
await back();
const e1 = await read();
await check('back in a room with a popup: the popup closes, the room stays', !e1.open && e1.filter === room && e1.path === home, e1);
await back();
const e2 = await read();
await check('back in a room: Home, still on the dashboard', e2.filter === 'all' && e2.path === home, e2);

// 2b. Review 26.11.: HA's own more-info (its dialog manager adds entries and flags the one below). Opened and closed
// on the dashboard before a popup: back still closes the popup. Opened over a popup: back closes only HA's dialog,
// and the popup's X afterwards takes its entry back (step 3's last back proves no entry is left behind).
const moreInfo = () => page.evaluate(() => {
  const id = Object.keys(document.querySelector('home-assistant').hass.states)[0];
  document.querySelector('home-assistant').dispatchEvent(new CustomEvent('hass-more-info',
    { detail: { entityId: id, casoraNative: true }, bubbles: true, composed: true }));
});
const haDialog = () => page.evaluate(() => !!(history.state && history.state.dialog));
await moreInfo();
await page.waitForTimeout(1500);
await need('HA more-info open on the dashboard', await haDialog(), null);
await back();
await check('back closes HA more-info, still on the dashboard', !(await haDialog()) && (await read()).path === home, await read());
await popup('Nach more-info');
await page.waitForTimeout(1200);
await back();
const g0 = await read();
await check('after a more-info on the dashboard, back still closes the popup', !g0.open && g0.path === home && !(g0.layers && g0.layers.length), g0);
await popup('Mit more-info');
await page.waitForTimeout(1200);
await moreInfo();
await page.waitForTimeout(1500);
await need('HA more-info open over the popup', await haDialog(), null);
await back();
const g1 = await read();
await check('back over the popup closes only HA more-info', !(await haDialog()) && g1.open && g1.path === home, g1);
await page.evaluate(() => {
  const pop = window.__pierce('casora-popup').find((p) => p.hasAttribute('open'));
  pop.shadowRoot.querySelector('.header-close').click();
});
await page.waitForTimeout(1500);
const g2 = await page.evaluate(() => ({ mark: !!(history.state && history.state.casoraBack), layers: window.casoraBack.layers() }));
await check('X after a more-info takes the popup entry back', !g2.mark && !g2.layers.length, g2);

// 3. Closed by its X: no entry left behind – the next back leaves the dashboard at once.
await popup('X');
await page.waitForTimeout(1200);
await page.evaluate(() => {
  const pop = window.__pierce('casora-popup').find((p) => p.hasAttribute('open'));
  pop.shadowRoot.querySelector('.header-close').click();
});
await page.waitForTimeout(1500);
const f0 = await read();
await check('X closed the popup, the address stays', !f0.open && f0.path === home && !(f0.layers && f0.layers.length), f0);
// Room left by the bar's Home button: its entry goes as well.
await page.evaluate((r) => window._hmnOwner._set(r), room);
await page.waitForTimeout(1500);
await page.evaluate(() => window._hmnOwner._tap('home'));
await page.waitForTimeout(1500);
await back();
const f1 = await read();
await check('then back leaves the dashboard (no double back)', f1.path === '/config/areas/dashboard', f1);
await browser.close();
await finish();
