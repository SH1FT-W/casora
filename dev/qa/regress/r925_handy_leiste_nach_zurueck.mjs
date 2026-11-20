// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/filter-overlay.js#_dashExtrasFrame,_ensureDashboardHeader,_hideChromePill, custom_components/casora/scripts/local/04-navigation.js#_syncDock
// Issue #221 (Android, Companion app): in a room, switching to another HA page and coming back with "back" left the
// phone bar without its tools: the room name showed in the bar, bell, chat and the dots menu were gone.
// Expected: after leaving the dashboard from a room and coming back, the capsule (bell etc.) sits in the phone bar again.
process.env.CASORA_THEME = process.env.CASORA_THEME || 'Casora';
import { open, usePage, casoraDashboard, dashboard, check, need, finish } from './lib.mjs';

const d = (await casoraDashboard((x) => x.url === 'qa-arbeit')) || (await casoraDashboard());
await need('Casora dashboard with a phone twin', d && d.phone, d && d.url);

const read = (page) => page.evaluate(() => {
  const bar = document.querySelector('.hmn-bar');
  const bell = window.__pierce('button-card').find((x) => [].concat(x._config?.template || []).includes('casora_notifications_button'));
  let docked = false;
  for (let u = bell; u; u = u.parentNode || u.host) if (u.classList && u.classList.contains('hmn-dock')) docked = true;
  return { bars: document.querySelectorAll('.hmn-bar').length, act: !!(bar && bar.classList.contains('hmn-act')),
    dockCard: !!(bar && bar.querySelector('.hmn-dock button-card')), bellDocked: docked,
    filter: window._casoraFilter && window._casoraFilter.get(), path: location.pathname };
});
const go = (page, u) => page.evaluate((u) => { history.pushState(null, '', u);
  window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } })); }, u);

const { page, browser } = await open({ width: 393, height: 852, mobile: true, touch: true, scale: 2, theme: 'Casora' });
usePage(page);
await dashboard(page, d.phone.url, 3);
await page.waitForFunction(() => !!document.querySelector('.hmn-bar.hmn-act .hmn-dock button-card'), null, { timeout: 30000 }).catch(() => {});
const a = await read(page);
await need('home: bell docked in the phone bar', a.act && a.bellDocked, a);

// Open a room the way the bar does (Rooms menu → room).
const room = await page.evaluate(() => { const o = window._hmnOwner; const r = o && o._rooms && o._rooms[0]; if (r) o._set(r.key); return r && r.key; });
await need('a room to open', !!room, room);
await page.waitForTimeout(2500);
const b = await read(page);
await check('room: bell docked in the phone bar', b.act && b.bellDocked && b.filter === room, b);

// Another HA page, then Android's back.
await go(page, '/config/dashboard');
await page.waitForTimeout(2500);
await page.evaluate(() => history.back());
await page.waitForFunction((p) => location.pathname.startsWith(p), '/' + d.phone.url, { timeout: 10000 }).catch(() => {});
await page.waitForTimeout(6000);
const c = await read(page);
await check('after back: bell docked in the phone bar again', c.act && c.dockCard && c.bellDocked, c);
await check('after back: still in the room', c.filter === room, c);
// Back to Home: the bell stays in the bar, not on top of the page.
await page.evaluate(() => window._hmnOwner && window._hmnOwner._set('all'));
await page.waitForTimeout(2500);
const e = await read(page);
await check('home again: bell docked in the phone bar', e.act && e.bellDocked && e.filter === 'all', e);
await browser.close();
await finish();
