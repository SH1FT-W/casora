// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/casora-core.js#showPn,_casoraPnDel,pnDel
// Owner, 16.11.2026 (iPhone, HA app, 26.11.28b11): in the bell, the detail popup of Home Assistant's "Login attempt
// failed" notification (notification_id "http-login") opened, but tapping „Löschen“ did nothing. The popup content is a
// button-card whose action handler cancels touchend, so no click follows a finger tap, and the delete listener only
// listened to click. r349 taps with the mouse and stayed green. Expected: a finger tap on „Löschen“ dismisses the
// notification in HA (Chromium phone and WebKit phone).
import { open, casoraDashboard, check, need, finish, usePage, ready, atFinish } from './lib.mjs';
import { ws } from '../ws.mjs';

const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);
const svc = async (service, data) => { const c = await ws(); try { await c.cmd({ type: 'call_service', domain: 'persistent_notification', service, service_data: data }); } finally { c.close(); } };
const haList = async () => { const c = await ws(); try { return await c.cmd({ type: 'persistent_notification/get' }).catch(() => null); } finally { c.close(); } };
// The id and text Home Assistant's http integration uses for a failed login.
const ID = 'http-login';
atFinish(async () => { await svc('dismiss', { notification_id: ID }).catch(() => {}); });
const pierceAll = () => { const all = []; const walk = (n) => n.querySelectorAll('*').forEach((e) => { all.push(e); if (e.shadowRoot) walk(e.shadowRoot); }); walk(document); return all; };

for (const safari of [false, true]) {
  const tag = safari ? 'WebKit-Handy' : 'Chromium-Handy';
  await svc('create', { notification_id: ID, title: 'Login attempt failed',
    message: 'Login attempt or request with invalid authentication from 192.0.2.10 (192.0.2.10). See the log for details.' });
  const { page } = await open({ width: 393, height: 852, mobile: true, scale: 3, dark: false, safari });
  usePage(page);
  await ready(page, '/' + dash.url + '/' + (dash.config.views[0].path || '0'), () => !!window._casoraNotify && !!window._casoraLocalLoaded, 60000);
  for (const t0 = Date.now(); Date.now() - t0 < 8000;) {
    if (await page.evaluate((id) => window._casoraNotify.rows.some((r) => r.id === 'ha:pn:' + id), ID)) break;
    await page.waitForTimeout(300);
  }
  const bellAt = await page.evaluate(() => { const q = window.__pierce('.casora-bell').map((e) => e.getBoundingClientRect()).find((r) => r.width > 0 && r.top >= 0 && r.bottom <= innerHeight);
    return q && { x: q.x + q.width / 2, y: q.y + q.height / 2 }; });
  await need(tag + ': Glocke', bellAt, bellAt);
  await page.touchscreen.tap(bellAt.x, bellAt.y);
  await page.waitForTimeout(1500);
  const at = await page.evaluate(new Function('id', 'const all = (' + pierceAll + ')();'
    + 'const row = all.find((e) => e._casoraRow && e._casoraRow.id === "ha:pn:" + id);'
    + 'if (!row) return null; row.scrollIntoView({ block: "center" }); const q = row.getBoundingClientRect(); return { x: q.left + Math.min(80, q.width / 3), y: q.top + q.height / 2 };'), ID);
  await need(tag + ': Zeile in der Glocke', at, at);
  await page.touchscreen.tap(at.x, at.y);
  await page.waitForTimeout(1600);
  const btn = await page.evaluate(new Function('const all = (' + pierceAll + ')();'
    + 'const box = all.find((e) => e.classList && e.classList.contains("cpn") && e.getClientRects().length);'
    + 'const b = box && box.querySelector("[data-casora-pn-del]"); if (!b) return null; const q = b.getBoundingClientRect();'
    + 'return { x: q.left + q.width / 2, y: q.top + q.height / 2, vis: q.width > 0 && q.bottom <= innerHeight, text: b.textContent.replace(/\\s+/g, " ").trim() };'));
  await need(tag + ': „Löschen“ im Popup sichtbar', btn && btn.vis, btn);
  await page.touchscreen.tap(btn.x, btn.y);
  let L = null;
  for (const t0 = Date.now(); Date.now() - t0 < 4000;) {
    L = await haList();
    if (Array.isArray(L) && !L.some((n) => n.notification_id === ID)) break;
    await page.waitForTimeout(300);
  }
  await check(tag + ': Fingertipp auf „Löschen“ entfernt die Meldung in HA', Array.isArray(L) && !L.some((n) => n.notification_id === ID), L && L.map((n) => n.notification_id));
  let shut = false;
  for (const t0 = Date.now(); Date.now() - t0 < 3000 && !shut;) {
    shut = await page.evaluate(() => !(window.casoraPopup.element && window.casoraPopup.element.hasAttribute('open')));
    if (!shut) await page.waitForTimeout(200);
  }
  await check(tag + ': Popup ist danach zu', shut, shut);
  await page.close();
}
await finish();
