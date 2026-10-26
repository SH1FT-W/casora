// @zustand: arbeit
// @parallel: allein
// @deckt: custom_components/casora/scripts/casora-core.js custom_components/casora/panel/casora-panel.js
// Issue #70 (stalakerob, 26.10.2026): own notifications from scripts and automations in the bell. Expected:
//   1. persistent_notification.create (title + markdown message) shows in the bell right away: title as the label,
//      the message as one plain line below (link text kept, no markdown marks).
//   2. Without a title the message is the label.
//   3. Removing the row in the bell (× with the mouse) dismisses the notification in Home Assistant too.
//   4. A notification dismissed in Home Assistant leaves the bell by itself.
//   5. Dashboard setting notify_ha false (Studio: Notifications › Home Assistant notifications): none in the bell.
// Desktop 1440. Cleans up its notifications.
import { open, casoraDashboard, check, need, finish, usePage, ready, atFinish } from './lib.mjs';
import { ws } from '../ws.mjs';

const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);
const svc = async (service, data) => { const c = await ws(); try { await c.cmd({ type: 'call_service', domain: 'persistent_notification', service, service_data: data }); } finally { c.close(); } };
const haList = async () => { const c = await ws(); try { return await c.cmd({ type: 'persistent_notification/get' }).catch(() => null); } finally { c.close(); } };
atFinish(async () => { for (const id of ['qa_r347_a', 'qa_r347_b', 'qa_r347_c']) await svc('dismiss', { notification_id: id }).catch(() => {}); });

const { page } = await open({ width: 1440, height: 900, dark: true });
usePage(page);
await ready(page, '/' + dash.url + '/' + (dash.config.views[0].path || '0'), '() => !!window._casoraNotify && !!window._casoraLocalLoaded', 60000);
const rows = () => page.evaluate(() => window._casoraNotify.rows.filter((r) => /^ha:pn:qa_r347/.test(r.id)).map((r) => ({ id: r.id, label: r.label, sub: r.sub })));
const until = async (want) => { let r = await rows(); for (const t0 = Date.now(); !want(r) && Date.now() - t0 < 8000;) { await page.waitForTimeout(300); r = await rows(); } return r; };

await svc('create', { notification_id: 'qa_r347_a', title: 'Waschmaschine', message: 'Die **Wäsche** ist fertig. [Details](https://example.org)' });
await svc('create', { notification_id: 'qa_r347_b', message: 'Nur Text ohne Titel' });
let r = await until((x) => x.length === 2);
const a = r.find((x) => x.id === 'ha:pn:qa_r347_a'), b = r.find((x) => x.id === 'ha:pn:qa_r347_b');
await check('1. Titel als Zeile, Text darunter ohne Markdown', a && a.label === 'Waschmaschine' && a.sub === 'Die Wäsche ist fertig. Details', r);
await check('2. ohne Titel: Text als Zeile', b && b.label === 'Nur Text ohne Titel' && !b.sub, r);

// 3. Remove the row in the bell with the mouse (× next to the row).
// Open the bell the way a user does: the bell button in the top bar.
const bellAt = await page.evaluate(() => { const q = window.__pierce('.casora-bell').map((e) => e.getBoundingClientRect()).find((r) => r.width > 0 && r.top >= 0 && r.bottom <= innerHeight);
  return q && { x: q.x + q.width / 2, y: q.y + q.height / 2 }; });
await need('Glocke in der Kopfleiste', bellAt, bellAt);
await page.mouse.click(bellAt.x, bellAt.y);
await page.waitForTimeout(1500);
const at = await page.evaluate(() => {
  const all = []; const walk = (n) => n.querySelectorAll('*').forEach((e) => { all.push(e); if (e.shadowRoot) walk(e.shadowRoot); }); walk(document);
  const row = all.find((e) => e._casoraRow && e._casoraRow.id === 'ha:pn:qa_r347_a');
  if (!row) return null; row.scrollIntoView({ block: 'center' }); const q = row.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 };
});
await need('Zeile in der offenen Glocke', at, at);
await page.mouse.move(at.x, at.y, { steps: 3 });
await page.waitForTimeout(400);
const x = await page.evaluate(() => {
  const all = []; const walk = (n) => n.querySelectorAll('*').forEach((e) => { all.push(e); if (e.shadowRoot) walk(e.shadowRoot); }); walk(document);
  const b = all.find((e) => e.dataset && e.dataset.mode === 'x' && getComputedStyle(e).opacity === '1');
  if (!b) return null; const q = b.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 };
});
await need('× zum Entfernen', x, x);
await page.mouse.click(x.x, x.y);
await page.waitForTimeout(1500);
let L = await haList();
await check('3. Entfernen in der Glocke entfernt sie auch in HA', Array.isArray(L) && !L.some((n) => n.notification_id === 'qa_r347_a') && L.some((n) => n.notification_id === 'qa_r347_b'), L && L.map((n) => n.notification_id));
r = await until((y) => !y.some((z) => z.id === 'ha:pn:qa_r347_a'));
await check('3. und ist aus der Glocke weg', !r.some((z) => z.id === 'ha:pn:qa_r347_a'), r);

// 4. Dismissed in HA → leaves the bell.
await svc('dismiss', { notification_id: 'qa_r347_b' });
r = await until((y) => !y.length);
await check('4. in HA entfernt → aus der Glocke weg', !r.length, r);

// 5. Switched off for this dashboard.
await page.evaluate(() => { window._casoraNotify.close(); window.CASORA_NOTIFY_TYPES = Object.assign({}, window.CASORA_NOTIFY_TYPES || {}, { ha: false }); });
await svc('create', { notification_id: 'qa_r347_c', title: 'Aus', message: 'soll nicht erscheinen' });
await page.waitForTimeout(2500);
await page.evaluate(() => window._casoraNotify.refresh());
await page.waitForTimeout(1000);
r = await rows();
await check('5. Schalter aus: keine HA-Benachrichtigung in der Glocke', !r.length, r);
await page.evaluate(() => { const t = window.CASORA_NOTIFY_TYPES; if (t) delete t.ha; });
await finish();
