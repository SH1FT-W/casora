// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/casora-core.js
// Issue #70 (stalakerob, 26.10.2026): HA's own list opens a notification on tap with its whole text; the bell only showed
// the shortened line. Expected: tapping an HA notification in the bell opens a popup with its title, the whole message
// (Markdown: bold, list, link) and "Löschen", which dismisses it in HA. Desktop and phone.
import { open, casoraDashboard, check, need, finish, usePage, ready, atFinish } from './lib.mjs';
import { ws } from '../ws.mjs';

const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);
const svc = async (service, data) => { const c = await ws(); try { await c.cmd({ type: 'call_service', domain: 'persistent_notification', service, service_data: data }); } finally { c.close(); } };
const haList = async () => { const c = await ws(); try { return await c.cmd({ type: 'persistent_notification/get' }).catch(() => null); } finally { c.close(); } };
const ID = 'qa_r349';
atFinish(async () => { await svc('dismiss', { notification_id: ID }).catch(() => {}); });
const SHOT = process.env.CASORA_SHOT_DIR;

for (const phone of [false, true]) {
  const tag = phone ? 'Handy' : 'Desktop';
  await svc('create', { notification_id: ID, title: 'Waschmaschine', message: 'Die **Wäsche** ist fertig.\n\n- Programm: Baumwolle 60°\n- Dauer: 2:14 h\n\n[Bedienungsanleitung](https://example.org)' });
  const { page } = await open(phone ? { width: 393, height: 852, mobile: true, scale: 3, dark: false } : { width: 1440, height: 900, dark: false });
  usePage(page);
  await ready(page, '/' + dash.url + '/' + (dash.config.views[0].path || '0'), '() => !!window._casoraNotify && !!window._casoraLocalLoaded', 60000);
  for (const t0 = Date.now(); Date.now() - t0 < 8000;) {
    if (await page.evaluate((id) => window._casoraNotify.rows.some((r) => r.id === 'ha:pn:' + id), ID)) break;
    await page.waitForTimeout(300);
  }
  const bellAt = await page.evaluate(() => { const q = window.__pierce('.casora-bell').map((e) => e.getBoundingClientRect()).find((r) => r.width > 0 && r.top >= 0 && r.bottom <= innerHeight);
    return q && { x: q.x + q.width / 2, y: q.y + q.height / 2 }; });
  await need(tag + ': Glocke', bellAt, bellAt);
  await page.mouse.click(bellAt.x, bellAt.y);
  await page.waitForTimeout(1500);
  const at = await page.evaluate((id) => {
    const all = []; const walk = (n) => n.querySelectorAll('*').forEach((e) => { all.push(e); if (e.shadowRoot) walk(e.shadowRoot); }); walk(document);
    const row = all.find((e) => e._casoraRow && e._casoraRow.id === 'ha:pn:' + id);
    if (!row) return null; row.scrollIntoView({ block: 'center' }); const q = row.getBoundingClientRect(); return { x: q.left + Math.min(80, q.width / 3), y: q.top + q.height / 2, open: row.dataset.casoraOpen };
  }, ID);
  await need(tag + ': Zeile in der Glocke', at, at);
  if (SHOT) await page.screenshot({ path: SHOT + '/pn-' + (phone ? 'p' : 'd') + '-1.png' });
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(1600);
  const pop = await page.evaluate(() => {
    const all = []; const walk = (n) => n.querySelectorAll('*').forEach((e) => { all.push(e); if (e.shadowRoot) walk(e.shadowRoot); }); walk(document);
    const box = all.find((e) => e.classList && e.classList.contains('cpn') && e.getClientRects().length);
    if (!box) return null;
    const btn = box.querySelector('button'); const q = btn.getBoundingClientRect();
    return { text: box.textContent.replace(/\s+/g, ' ').trim(), b: box.querySelectorAll('b').length, li: box.querySelectorAll('li').length,
      href: (box.querySelector('a') || {}).href || null, title: window.casoraPopup.element && window.casoraPopup.element._headerTitle ? window.casoraPopup.element._headerTitle.textContent.trim() : null,
      btn: { x: q.left + q.width / 2, y: q.top + q.height / 2, vis: q.width > 0 && q.bottom <= innerHeight } };
  });
  await check(tag + ': Tippen öffnet das Popup mit dem ganzen Text', !!pop && /Wäsche ist fertig/.test(pop.text) && /Baumwolle 60°/.test(pop.text), pop);
  await check(tag + ': Markdown – fett, Liste, Link', !!pop && pop.b >= 1 && pop.li === 2 && pop.href === 'https://example.org/', pop);
  await check(tag + ': Titel im Kopf', !!pop && pop.title === 'Waschmaschine', pop && pop.title);
  if (SHOT) await page.screenshot({ path: SHOT + '/pn-' + (phone ? 'p' : 'd') + '-2.png' });
  await need(tag + ': „Löschen“ sichtbar', pop && pop.btn.vis, pop && pop.btn);
  await page.mouse.click(pop.btn.x, pop.btn.y);
  await page.waitForTimeout(1500);
  const L = await haList();
  await check(tag + ': „Löschen“ entfernt sie in HA', Array.isArray(L) && !L.some((n) => n.notification_id === ID), L && L.map((n) => n.notification_id));
  await page.close();
}
await finish();
