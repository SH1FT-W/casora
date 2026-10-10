// @zustand: arbeit
// @parallel: allein   (legt ein Dashboard an und löscht es wieder)
// @deckt: custom_components/casora/panel/casora-panel-umzug.js
// U-1 (1.3): Browser kurz nach „Umziehen“ geschlossen – ein halb fertiges Casora-Dashboard blieb stehen,
// beim nächsten Öffnen sagte das Studio nichts. Jetzt merkt sich der Umzug den Lauf (localStorage
// casora.umzug.pending) bis zum Fertig-Bildschirm; steht der Merker beim nächsten Öffnen noch da, bietet
// das Studio „Aufräumen“ oder „Umzug fortsetzen“ an. Aufräumen entfernt nur das angelegte Dashboard
// (Adresse und Titel aus dem Merker), fremde Dashboards bleiben.
import { open, ready, check, finish, atFinish } from './lib.mjs';
import { ws } from '../ws.mjs';

const c = await ws();
const URL_PATH = 'qa-halb-umzug';
const list0 = await c.cmd({ type: 'lovelace/dashboards/list' });
for (const d of list0) if (d.url_path === URL_PATH) await c.cmd({ type: 'lovelace/dashboards/delete', dashboard_id: d.id });
await c.cmd({ type: 'lovelace/dashboards/create', url_path: URL_PATH, title: 'QA Halb', mode: 'storage', show_in_sidebar: true, require_admin: false });
atFinish(async () => {
  for (const d of await c.cmd({ type: 'lovelace/dashboards/list' })) if (d.url_path === URL_PATH) await c.cmd({ type: 'lovelace/dashboards/delete', dashboard_id: d.id });
  c.close();
});
const anyOther = list0.find((d) => d.mode === 'storage' && d.url_path !== URL_PATH);

const { page, context } = await open({ width: 1440, height: 900, umzug: true, theme: 'Casora', dark: false });
await context.addInitScript(([u]) => {
  if (sessionStorage.getItem('qa-pending-set')) return;
  sessionStorage.setItem('qa-pending-set', '1');
  localStorage.setItem('casora.umzug.pending', JSON.stringify({ src: 'hemma-zwei', srcTitle: 'Hemma 2 (Test)', target: u, title: 'QA Halb', t: Date.now() - 120000 }));
}, [URL_PATH]);
await ready(page, '/casora-studio', () => { const p = window.__panel && window.__panel(); return p && p._hass && p._casoraUmzugRun; });
const title = () => page.evaluate(() => { const fx = window.__panel()._fx; return fx && fx.scroll && fx.scroll.isConnected ? (fx.scroll.querySelector('.ftitle') || {}).textContent || '' : ''; });
let t = '';
for (let i = 0; i < 40 && !/unterbrochen|Interrupted/i.test(t); i++) { await page.waitForTimeout(500); t = await title(); }
await check('U-1 Studio bietet den unterbrochenen Umzug an', /Umzug unterbrochen|Move Interrupted/.test(t), t);
if (process.env.QA_BILD) await page.screenshot({ path: process.env.QA_BILD });
const knoepfe = await page.evaluate(() => [...window.__panel()._fx.foot.querySelectorAll('button')].map((b) => b.textContent.trim()));
await check('U-1 Knöpfe Später / Aufräumen / Umzug fortsetzen', ['Später', 'Aufräumen', 'Umzug fortsetzen'].every((k) => knoepfe.includes(k)), knoepfe);
const lede = await page.evaluate(() => (window.__panel()._fx.scroll.querySelector('.flede') || {}).textContent || '');
await check('U-1 Text nennt die Quelle und das halb fertige Dashboard', /Hemma 2 \(Test\)/.test(lede) && /halb fertig/i.test(lede), lede);
await page.evaluate(() => [...window.__panel()._fx.foot.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Aufräumen').click());
let gone = false;
for (let i = 0; i < 20 && !gone; i++) { await page.waitForTimeout(500); gone = !(await c.cmd({ type: 'lovelace/dashboards/list' })).some((d) => d.url_path === URL_PATH); }
await check('U-1 Aufräumen entfernt das halb fertige Dashboard', gone);
const rest = await c.cmd({ type: 'lovelace/dashboards/list' });
await check('U-1 andere Dashboards bleiben', !anyOther || rest.some((d) => d.url_path === anyOther.url_path), anyOther && anyOther.url_path);
await check('U-1 Merker danach gelöscht', !(await page.evaluate(() => localStorage.getItem('casora.umzug.pending'))));
// Zweites Öffnen: kein Angebot mehr.
await ready(page, '/casora-studio', () => { const p = window.__panel && window.__panel(); return p && p._hass && p._casoraUmzugRun; });
await page.waitForTimeout(5000);
const t2 = await title().catch(() => '');
await check('U-1 nach dem Aufräumen kein erneutes Angebot', !/unterbrochen|Interrupted/i.test(t2), t2);
await finish();
