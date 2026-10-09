// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/panel/casora-panel-personal.js
// Nutzertest 5 (H-T4, 07.10.2026). „Ansehen als: Kind“ im Studio zeigt genau das, was das echte Konto
// „Kind“ im Dashboard sieht: Ist das Sicherheits-Badge eines Raums nur für den Admin, fehlen bei beiden
// Badge, Zusammenfassung und aufgeklappte Unter-Badges (Schloss, Tür). Unter „Wer sieht das?“ steht,
// wo es für Kind weiter zu sehen ist. Ohne Konto „Kind“ (dev/qa/wegwerf-ha.sh konten) übersprungen; der
// Dashboard-Stand wird am Ende zurückgeschrieben.
import { open, studio, casoraDashboard, check, need, finish, atFinish, dashboard, BASE } from './lib.mjs';
import { ws } from '../ws.mjs';
// Wie dev/qa/wegwerf-testkonten.mjs (nicht importieren: das Skript legt beim Laden an).
const KIND = { username: 'kind', password: 'kind-nur-test' };

const dash = await casoraDashboard((d) => ((d.config || {}).views || []).some((v) => JSON.stringify(v.cards && v.cards[0] && v.cards[0].variables || {}).includes('security_')));
await need('Casora-Dashboard mit Sicherheits-Badge', dash);
const c = await ws();
const users = (await c.cmd({ type: 'config/auth/list' })).filter((u) => !u.system_generated);
const kind = users.find((u) => u.username === KIND.username);
const admin = users.find((u) => u.is_owner) || users.find((u) => (u.group_ids || []).includes('system-admin'));
// Ohne Konto „Kind“ (Gate legt es bewusst nicht an, siehe note3) nur überspringen.
if (!kind || !admin) { c.close(); await check('übersprungen: kein Konto „Kind“ (dev/qa/wegwerf-ha.sh konten)', true); await finish(); }

// Raum mit Sicherheits-Badge (nicht „Zuhause“): Badge nur für den Admin, gespeichert
const cfg = await c.cmd({ type: 'lovelace/config', url_path: dash.url });
const orig = JSON.parse(JSON.stringify(cfg));
atFinish(async () => { const c2 = await ws(); await c2.cmd({ type: 'lovelace/config/save', url_path: dash.url, config: orig }); c2.close(); });
const vi = cfg.views.findIndex((v, i) => i > 0 && v.path && ((v.cards || [])[0] || {}).variables
  && Object.keys(v.cards[0].variables).some((k) => /^security_(locks|lock_entity|entity_1)$/.test(k) && v.cards[0].variables[k]));
await need('Raum mit Schloss im Sicherheits-Badge', vi > 0);
const view = cfg.views[vi];
view.cards[0].variables.casora_badge_users = { ...(view.cards[0].variables.casora_badge_users || {}), security: [admin.id] };
await c.cmd({ type: 'lovelace/config/save', url_path: dash.url, config: cfg });
c.close();
const SEC = /Schloss|Sicherheit|Gesichert|entriegelt/;

// Studio: Badge aufgeklappt, dann „Ansehen als: Kind“
const { page } = await open({ width: 1600, height: 1000, dark: false });
await studio(page, dash.url);
const seen = (as, path) => page.evaluate(async ({ as, path }) => {
  const p = window.__panel(); p._bClose && p._bClose();
  p._room = p._state.compact.rooms.findIndex((r) => r.path === path); p._renderTabs(); p._renderForm();
  p._miniOpen = 'security'; p._uxAs = as; p._rebuildPreview();
  await new Promise((r) => setTimeout(r, 1500));
  p._uxMarkPreview && p._uxMarkPreview();
  const vis = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  return [...p.shadowRoot.querySelectorAll('.card.map .mini-badges .pbadge:not(.ghost), .card.map .mini-subs .pbadge')]
    .filter(vis).map((e) => e.innerText.replace(/\s+/g, ' ').trim());
}, { as, path });
const asAdmin = await seen(null, view.path);
await check('Studio (Admin): Sicherheits-Badge da', asAdmin.some((t) => SEC.test(t)), asAdmin);
const asKind = await seen(kind.id, view.path);
await check('Studio „Ansehen als: Kind“: kein Sicherheits-Badge, keine Unter-Badges', !asKind.some((t) => SEC.test(t)), asKind);

// Hinweis „weiter sichtbar“ unter „Wer sieht das?“ des Badges (nur wenn es woanders vorkommt)
const also = await page.evaluate(async () => {
  const p = window.__panel(); p._uxAs = null; p._bOpen = true; p._select({ group: 'badges', key: 'Security', label: 'Security' });
  await new Promise((r) => setTimeout(r, 1500));
  const ns = [...p.shadowRoot.querySelectorAll('#pane .mwhoalso')];
  return { has: ns.length > 0, text: ns.filter((n) => !n.hidden).map((n) => n.textContent).join(' | '), other: p._state.compact.rooms.some((r, i) => i !== p._room && JSON.stringify(r.variables || {}).includes('security_')) };
});
await check('„Wer sieht das?“ hat die Hinweiszeile', also.has, also);
if (also.other) await check('… nennt, wo Kind es weiter sieht', /Kind/.test(also.text), also);

// Echtes Konto „Kind“ im Dashboard
const tok = await (async () => {
  const cid = BASE + '/';
  const j = async (r) => r.json();
  const flow = await j(await fetch(BASE + '/auth/login_flow', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: cid, handler: ['homeassistant', null], redirect_uri: cid }) }));
  const step = await j(await fetch(BASE + '/auth/login_flow/' + flow.flow_id, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: cid, username: KIND.username, password: KIND.password }) }));
  return j(await fetch(BASE + '/auth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: step.result, client_id: cid }) }));
})();
const k = await open({ width: 1600, height: 1000, dark: false });
await k.context.addInitScript(([t, base]) => {
  localStorage.setItem('hassTokens', JSON.stringify({ access_token: t.access_token, token_type: 'Bearer', expires_in: t.expires_in,
    refresh_token: t.refresh_token, hassUrl: base, clientId: base + '/', expires: Date.now() + t.expires_in * 1000 }));
}, [tok, BASE]);
await dashboard(k.page, dash.url + '/' + view.path, 3);
const real = await k.page.evaluate(() => window.__pierce('button-card').filter((b) => b.getClientRects().length && b.getBoundingClientRect().width > 0)
  .map((b) => (b.shadowRoot && b.shadowRoot.querySelector('ha-card') ? b.shadowRoot.querySelector('ha-card').innerText : '').replace(/\s+/g, ' ').trim())
  .filter((t) => t && t.length < 60));
await check('Echtes Konto „Kind“: kein Sicherheits-Badge im Raum', !real.some((t) => SEC.test(t)), real);
await check('Studio und echtes Konto zeigen dasselbe (beide ohne Sicherheit)', !asKind.some((t) => SEC.test(t)) === !real.some((t) => SEC.test(t)));

// Nutzertest 6 (H-T4): Kacheln auf „Zuhause“, deren Gerät die Vorlage selbst wählt (Alarm → Alarmo),
// standen im Studio als „Alarm · Gerät fehlt“, im Dashboard als „Alarmo · Zuhause“ – niemand fand sie.
// Jede benannte Dashboard-Kachel muss in der Vorschau unter demselben Namen stehen, für Admin und Kind.
const homeIdx = cfg.views.findIndex((v) => v.path === 'home');
const rowOf = (v) => (v.cards || []).find((x) => x && x.type === 'custom:casora-smart-row');
const homeRow = homeIdx >= 0 ? rowOf(cfg.views[homeIdx]) : null;
const alarmAt = homeRow ? homeRow.cards.findIndex((x) => [].concat(x.template || []).includes('casora_alarm') && !x.entity) : -1;
if (alarmAt >= 0) {
  const studioNames = (as) => page.evaluate(async (as) => {
    const p = window.__panel(); p._bClose && p._bClose();
    p._room = p._state.compact.rooms.findIndex((r) => r.path === 'home'); p._uxAs = as; p._renderTabs(); p._renderForm(); p._rebuildPreview();
    await new Promise((r) => setTimeout(r, 1800));
    p._uxMarkPreview && p._uxMarkPreview();
    return [...p.shadowRoot.querySelectorAll('.card.map .mtile:not(.ghost)')]
      .filter((e) => e.style.display !== 'none' && getComputedStyle(e).display !== 'none' && !e.classList.contains('uxashide'))
      .map((e) => ((e.querySelector('.mname') || {}).textContent || '').trim() + ' | ' + ((e.querySelector('.mstate') || {}).textContent || '').trim());
  }, as);
  // Kacheln der Kachelreihe im Dashboard: button-cards mit einer Vorlage aus der Reihe, sichtbar, mit Namen.
  const rowTpls = [...new Set(homeRow.cards.flatMap((x) => [].concat(x.template || (x.card && x.card.template) || [])))];
  const realAll = (pg) => pg.evaluate((tpls) => window.__pierce('button-card').filter((b) => {
    const t = [].concat((b._config || {}).template || []);
    const r = b.getBoundingClientRect();
    return r.width > 40 && r.height > 40 && t.some((x) => tpls.includes(x));
  }).map((b) => (b.shadowRoot && b.shadowRoot.querySelector('#name') ? b.shadowRoot.querySelector('#name').textContent : '').trim()), rowTpls);
  const admPrev = await studioNames(null);
  const alarmName = (admPrev.find((t) => /Alarm/.test(t)) || '').split(' | ');
  await check('Studio (Admin): Alarm-Kachel ohne eigene Entität zeigt die Alarmanlage, nicht „Gerät fehlt“',
    alarmName[0] && !/Gerät fehlt|Device missing/.test(alarmName[1] || ''), admPrev);
  const adm = await open({ width: 1600, height: 1000, dark: false });
  await dashboard(adm.page, dash.url + '/home', 3);
  const admReal = (await realAll(adm.page)).filter(Boolean);
  const missing = admReal.filter((n) => !admPrev.some((t) => t.split(' | ')[0] === n));
  await check('Admin: jede benannte Kachel auf Zuhause steht so auch in der Vorschau', !missing.length, { missing, admReal, admPrev });

  // „Wer sieht das?“ an der Alarm-Kachel: nur Admin → bei Kind weder in der Vorschau noch im Dashboard.
  const c3 = await ws();
  const cfg2 = await c3.cmd({ type: 'lovelace/config', url_path: dash.url });
  const row2 = rowOf(cfg2.views[homeIdx]);
  row2.cards[alarmAt].visibility = [{ condition: 'user', users: [admin.id] }];
  await c3.cmd({ type: 'lovelace/config/save', url_path: dash.url, config: cfg2 });
  c3.close();
  await studio(page, dash.url);
  const kindPrev = await studioNames(kind.id);
  const alarmLabel = alarmName[0];
  await check('Studio „Ansehen als: Kind“: ausgeblendete Alarm-Kachel fehlt', !kindPrev.some((t) => t.split(' | ')[0] === alarmLabel), kindPrev);
  await dashboard(k.page, dash.url + '/home', 3);
  const kindReal = (await realAll(k.page)).filter(Boolean);
  await check('Echtes Konto „Kind“: ausgeblendete Alarm-Kachel fehlt', !kindReal.includes(alarmLabel), kindReal);
  const kMissing = kindReal.filter((n) => !kindPrev.some((t) => t.split(' | ')[0] === n));
  await check('Kind: jede benannte Kachel auf Zuhause steht so auch in der Vorschau', !kMissing.length, { kMissing, kindReal, kindPrev });
}

await finish();
