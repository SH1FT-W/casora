// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/casora-core.js
// Prüfung 2 fam-06/07/23, DH-15, E14 (31.10.2026): a family account (no admin) saw Casora's English maintenance notice
// with file names in the bell, "Dashboard bearbeiten" in the ⋯ menu (it did nothing), and "Löschen" on an HA notification
// removed it for everyone. Expected on the phone (WebKit 393):
//  - non-admin: no Casora/HA maintenance notice in the bell, a normal HA notification is there; its popup offers
//    "Für mich ausblenden" and that leaves it in HA; the ⋯ menu has no "Dashboard bearbeiten" but "Home Assistant";
//  - admin: the Casora notice is there under a German line ("Casora hat aufgeräumt"), the ⋯ menu has both entries.
// Without the account "Kind" (dev/qa/wegwerf-ha.sh konten) only the admin part runs.
import { open, casoraDashboard, check, need, finish, atFinish, dashboard, BASE } from './lib.mjs';
import { ws } from '../ws.mjs';

const KIND = { username: 'kind', password: 'kind-nur-test' };
const dash = await casoraDashboard();
await need('Casora-Dashboard mit Handy-Gegenstück', dash && dash.phone);
const svc = async (service, data) => { const c = await ws(); try { await c.cmd({ type: 'call_service', domain: 'persistent_notification', service, service_data: data }); } finally { c.close(); } };
const haList = async () => { const c = await ws(); try { return await c.cmd({ type: 'persistent_notification/get' }).catch(() => null); } finally { c.close(); } };
const OWN = 'casora_legacy_cleanup', NEWS = 'qa_r377';
atFinish(async () => { for (const id of [OWN, NEWS]) await svc('dismiss', { notification_id: id }).catch(() => {}); });
await svc('create', { notification_id: OWN, title: 'Casora cleaned up', message: 'Casora removed old entries: the file `themes/very/long/path/casora-old-theme.yaml`.\n\n- `script.casora_restart_toggle`' });
await svc('create', { notification_id: NEWS, title: 'Waschmaschine', message: 'Die Wäsche ist fertig.' });

const c = await ws();
const kind = (await c.cmd({ type: 'config/auth/list' })).find((u) => u.username === KIND.username);
c.close();
const kindTok = kind ? await (async () => {
  const cid = BASE + '/';
  const j = async (r) => r.json();
  const flow = await j(await fetch(BASE + '/auth/login_flow', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: cid, handler: ['homeassistant', null], redirect_uri: cid }) }));
  const step = await j(await fetch(BASE + '/auth/login_flow/' + flow.flow_id, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: cid, username: KIND.username, password: KIND.password }) }));
  return j(await fetch(BASE + '/auth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: step.result, client_id: cid }) }));
})() : null;

const rowsOf = (pg) => pg.evaluate(() => (window._casoraNotify && window._casoraNotify.rows || []).map((r) => ({ id: r.id, label: r.label })));
const menuOf = async (pg) => {
  await pg.evaluate(() => { const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_settings_button')
    && x.getBoundingClientRect().width > 0); if (b) (b.shadowRoot.querySelector('ha-card') || b).click(); });
  await pg.waitForTimeout(1200);
  const items = await pg.evaluate(() => { const m = document.querySelector('.casora-settings-menu'); return m ? [...m.querySelectorAll('[role=menuitem]')].map((i) => i.textContent.trim()) : null; });
  await pg.evaluate(() => { const m = document.querySelector('.casora-settings-menu'); if (m && m._close) m._close(); });
  return items;
};

for (const who of kind ? ['admin', 'kind'] : ['admin']) {
  const o = await open({ width: 393, height: 852, mobile: true, safari: true, dark: false });
  if (who === 'kind') {
    await o.context.addInitScript(([t, base]) => {
      localStorage.setItem('hassTokens', JSON.stringify({ access_token: t.access_token, token_type: 'Bearer', expires_in: t.expires_in,
        refresh_token: t.refresh_token, hassUrl: base, clientId: base + '/', expires: Date.now() + t.expires_in * 1000 }));
    }, [kindTok, BASE]);
  }
  const page = o.page;
  await dashboard(page, dash.phone.url + '/' + ((dash.phone.config.views[0] || {}).path || '0'), 3);
  await page.waitForFunction(() => window._casoraLocalLoaded && window._casoraNotify, null, { timeout: 30000 }).catch(() => {});
  let rows = [];
  for (let i = 0; i < 20; i++) { rows = await rowsOf(page); if (rows.some((r) => r.id === 'ha:pn:' + NEWS)) break; await page.waitForTimeout(500); }
  await check(`${who}: normale HA-Meldung in der Glocke`, rows.some((r) => r.id === 'ha:pn:' + NEWS), rows);
  const own = rows.find((r) => r.id === 'ha:pn:' + OWN);
  if (who === 'admin') await check('admin: Casora-Wartungsmeldung mit deutscher Zeile', !!own && own.label === 'Casora hat aufgeräumt', rows);
  else await check('kind: keine Casora-Wartungsmeldung', !own, rows);
  const items = await menuOf(page);
  await check(`${who}: ⋯-Menü hat „Home Assistant“`, !!items && items.includes('Home Assistant'), items);
  await check(`${who}: „Dashboard bearbeiten“ nur für Admins`, !!items && items.includes('Dashboard bearbeiten') === (who === 'admin'), items);
  if (who === 'kind') {
    // The popup of the HA notification: "Für mich ausblenden" – it stays in HA.
    // Bell open, then tap the notification's row (as r349).
    await page.evaluate(() => window._casoraNotify.open(window.__pierce('.casora-bell').find((e) => e.getBoundingClientRect().width > 0) || null));
    await page.waitForTimeout(1500);
    const at = await page.evaluate((id) => { const r = window.__pierce('*').find((e) => e._casoraRow && e._casoraRow.id === 'ha:pn:' + id);
      if (!r) return null; r.scrollIntoView({ block: 'center' }); const q = r.getBoundingClientRect(); return { x: q.left + Math.min(80, q.width / 3), y: q.top + q.height / 2 }; }, NEWS);
    await need('kind: Zeile der HA-Meldung in der Glocke', at, at);
    await page.mouse.click(at.x, at.y);
    await page.waitForTimeout(1500);
    const btn = await page.evaluate(() => { const b = window.__pierce('[data-casora-pn-del]')[0]; return b ? b.textContent.replace(/\s+/g, ' ').trim() : null; });
    await check('kind: Meldungs-Popup bietet „Für mich ausblenden“', !!btn && /Für mich ausblenden/.test(btn), btn);
    await page.evaluate(() => { const b = window.__pierce('[data-casora-pn-del]')[0]; if (b) b.click(); });
    await page.waitForTimeout(1500);
    const L = await haList();
    await check('kind: Meldung bleibt in HA (nur für Kind ausgeblendet)', Array.isArray(L) && L.some((n) => n.notification_id === NEWS), L && L.map((n) => n.notification_id));
    const after = await rowsOf(page);
    await check('kind: Meldung ist aus der eigenen Glocke weg', !after.some((r) => r.id === 'ha:pn:' + NEWS), after);
  }
  await o.page.close();
}
await finish();
