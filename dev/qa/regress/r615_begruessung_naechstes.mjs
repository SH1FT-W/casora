// @zustand: arbeit
// @parallel: allein
// @deckt: custom_components/casora/scripts/local/00-finder.js#casoraHomeNext dashboards/casora/button_card_templates.json#casora_room,casora_mobile_weather custom_components/casora/panel/casora-panel.js
// #157: the Studio switch puts the next event under the Home greeting on desktop and phone; without it the greeting stands alone.
import { open, usePage, studio, casoraDashboard, dashboard, check, need, finish, atFinish, BASE } from './lib.mjs';
import { ws, tokens } from '../ws.mjs';

const d = await casoraDashboard((x) => x.url === 'qa-arbeit');
await need('dashboard with a phone twin', d && d.phone, d && d.url);
const SHOT = process.env.CASORA_SHOT_DIR;
const CAL = 'calendar.qa_naechstes';
const { access_token: TK } = await tokens();
const start = new Date(Date.now() + 3 * 3600e3), p2 = (n) => String(n).padStart(2, '0');
const stamp = `${start.getFullYear()}-${p2(start.getMonth() + 1)}-${p2(start.getDate())} ${p2(start.getHours())}:${p2(start.getMinutes())}:00`;
const rest = (method, body) => fetch(BASE + '/api/states/' + CAL, { method, headers: { Authorization: 'Bearer ' + TK, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
await rest('POST', { state: 'off', attributes: { friendly_name: 'QA', message: 'QA Zahnarzt', start_time: stamp, end_time: stamp, all_day: false } });
const c = await ws();
const [desk0, phone0] = [await c.cmd({ type: 'lovelace/config', url_path: d.url }), await c.cmd({ type: 'lovelace/config', url_path: d.phone.url })];
c.close();
atFinish(async () => { const c2 = await ws(); await c2.cmd({ type: 'lovelace/config/save', url_path: d.url, config: desk0 }); await c2.cmd({ type: 'lovelace/config/save', url_path: d.phone.url, config: phone0 }); c2.close(); await rest('DELETE'); });

const { page } = await open({ width: 1440, height: 900, dark: false, theme: 'Casora' });
usePage(page);
await studio(page, d.url);
const setNext = (on) => page.evaluate(async (on) => {
  const p = window.__panel(), V = p._state.compact.rooms[0].variables;
  V.casora_greeting = 'time';
  if (on) V.casora_greeting_next = true; else delete V.casora_greeting_next;
  p._mirrorToPair('casora_greeting_next', on ? true : undefined, [p._state.compact.rooms[0]]);
  return p._save();
}, on);
const line = (pg) => pg.evaluate(() => window.__pierce('div[data-no-i18n]').filter((e) => /QA Zahnarzt/.test(e.textContent)).map((e) => { const r = e.getBoundingClientRect(); return { t: e.textContent, x: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) }; }));
const views = async (tag, want) => {
  for (const [n, o, url] of [['Desktop', { width: 1440, height: 900, dark: false, theme: 'Casora' }, d.url + '/' + (d.config.views[0].path || '0')], ['Phone', { width: 393, height: 852, mobile: true, safari: true, scale: 2, dark: false, theme: 'Casora' }, d.phone.url + '/' + (d.phone.config.views[0].path || '0')]]) {
    const { page: pp, browser } = await open(o); usePage(pp);
    await dashboard(pp, url, 3); await pp.waitForTimeout(3500);
    const l = await line(pp);
    await check(`${tag} ${n}: ${want ? 'the line is there' : 'no line'}`, want ? l.some((x) => x.h > 8 && x.w > 40) : !l.length, l);
    if (SHOT && want) await pp.screenshot({ path: `${SHOT}/${n}.png` });
    await browser.close();
  }
};
await need('saved', await setNext(false));
await page.waitForTimeout(1000);
await views('off', false);
usePage(page);
await need('saved', await setNext(true));
await page.waitForTimeout(1000);
await views('on', true);
await finish();
