// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/smart-row.js
// Prüfung 2 fam-04/E19 (31.10.2026): Favorites on the phone (lock unlocked, lights, blinds) – lock it, the lock tile
// moved to the back and the next tap hit the wrong tile; on the desktop the heating jumped to the front after
// switching it on. Expected: after the load phase a tile row keeps its order for the session, a state change only
// changes colours (phone WebKit 393 and desktop 1440). Nothing is saved: states are faked in the browser.
import { open, usePage, casoraDashboard, dashboard, fakeStates, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora-Dashboard', dash);
const ACTIVE = { light: 'on', switch: 'on', fan: 'on', input_boolean: 'on', cover: 'open', lock: 'unlocked', climate: 'heat', media_player: 'playing' };
const IDLE = { light: 'off', switch: 'off', fan: 'off', input_boolean: 'off', cover: 'closed', lock: 'locked', climate: 'off', media_player: 'off' };

for (const phone of [true, false]) {
  const tag = phone ? 'Handy' : 'Desktop';
  const url = phone && dash.phone ? dash.phone.url : dash.url;
  const cfg = phone && dash.phone ? dash.phone.config : dash.config;
  const { page } = await open(phone ? { width: 393, height: 852, mobile: true, safari: true, dark: false } : { width: 1440, height: 900, dark: false });
  usePage(page);
  await dashboard(page, url + '/' + ((cfg.views[0] || {}).path || '0'), 3);
  // A sorting row with at least three switchable tiles, visible on screen.
  const rows = () => page.evaluate((doms) => window.__pierce('casora-smart-row').filter((r) => r._sortEnabled && r._wrappers && r._wrappers.length >= 3
    && r.getBoundingClientRect().height > 0).map((r) => (r._config.cards || []).map((c, i) => ({ i, e: c && c.entity, o: Number(r._wrappers[i] && r._wrappers[i].style.order || i) }))
    .filter((x) => typeof x.e === 'string' && doms.includes(x.e.split('.')[0]))), Object.keys(ACTIVE));
  await page.waitForTimeout(11000);  // past the load phase (10 s)
  const before = (await rows()).find((r) => r.length >= 2);
  await need(tag + ': Kachelreihe mit schaltbaren Kacheln', before, await rows());
  const order = (r) => [...r].sort((a, b) => a.o - b.o).map((x) => x.e);
  // Flip every switchable tile of that row: active ones off, idle ones on – the strongest reason to re-sort.
  const st = await page.evaluate((ids) => Object.fromEntries(ids.map((e) => [e, document.querySelector('home-assistant').hass.states[e]?.state])), before.map((x) => x.e));
  const patch = {};
  for (const x of before) { const d = x.e.split('.')[0]; patch[x.e] = { state: st[x.e] === ACTIVE[d] ? IDLE[d] : ACTIVE[d] }; }
  await fakeStates(page, patch, { sticky: true });
  await page.waitForTimeout(7000);  // SORT_DELAY + quiet time would have re-sorted by now
  const after = (await rows()).find((r) => r.length === before.length && r.every((x, k) => x.e === before[k].e)) || [];
  await check(`${tag}: Reihenfolge bleibt nach dem Umschalten`, JSON.stringify(order(after)) === JSON.stringify(order(before)), { before: order(before), after: order(after), patch });
  await page.close();
}
await finish();
