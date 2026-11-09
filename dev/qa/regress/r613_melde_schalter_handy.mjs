// @zustand: arbeit
// @parallel: allein
// @deckt: custom_components/casora/phone_badges.py custom_components/casora/scripts/casora-core.js#_casoraNotify
// #156: a notification switch turned off in the Studio also holds on the phone dashboard. Only the desktop's room card read it.
import { open, usePage, studio, casoraDashboard, dashboard, check, need, finish, atFinish } from './lib.mjs';
import { ws } from '../ws.mjs';

const d = await casoraDashboard((x) => x.url === 'qa-arbeit');
await need('dashboard with a phone twin', d && d.phone, d && d.url);
const c = await ws();
const before = await c.cmd({ type: 'lovelace/config', url_path: d.url });
atFinish(async () => { const c2 = await ws(); await c2.cmd({ type: 'lovelace/config/save', url_path: d.url, config: before }); c2.close(); });
const cfg = JSON.parse(JSON.stringify(before));
const walk = (o) => { if (!o || typeof o !== 'object') return; if (Array.isArray(o)) return o.forEach(walk); if ([].concat(o.template || []).includes('casora_room')) { o.variables = o.variables || {}; o.variables.notify_battery = false; } Object.values(o).forEach(walk); };
walk(cfg.views);
await c.cmd({ type: 'lovelace/config/save', url_path: d.url, config: cfg });
c.close();

const { page } = await open({ width: 393, height: 852, mobile: true, safari: true, dark: false, theme: 'Casora' });
usePage(page);
await dashboard(page, d.phone.url + '/' + (d.phone.config.views[0].path || '0'), 3);
await page.waitForFunction(() => !!window._casoraNotify, null, { timeout: 30000 });
await page.waitForTimeout(3500);
const t = await page.evaluate(() => window.CASORA_NOTIFY_TYPES || null);
await check('the phone knows the switch is off', !!t && t.battery === false, t);
await finish();
