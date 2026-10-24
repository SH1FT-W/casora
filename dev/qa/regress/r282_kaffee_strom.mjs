// @zustand: arbeit
// @deckt: custom_components/casora/scripts/local/25-coffee.js dev/casora_mock/coffee.py custom_components/casora/panel/casora-panel-b-ux.js
// Kaffeevollautomat am erfundenen „Bohnenwerk“ (wie die Strom-Integrationen delonghi/krups: Getränke am
// Stromverlauf erkannt, Wartung mit Attribut „due“, dev/casora_mock/coffee.py):
//   1. Kachel „Bereit“ – erkannt nur an den Schlüsseln (learning + last_program).
//   2. Popup: „Zuletzt“ mit dem letzten Getränk und Hinweis statt Getränke-Raster, Pflege mit Liter/Tagen
//      (Entkalken, Wasserfilter, Brühgruppe), Statistik mit „Heute“ aus dem Sensor der Integration.
//   3. Vorgang (casora_mock.kaffee_beziehen bohnenwerk) → Kachel „Läuft“, Popup „Abbrechen geht nur an der Maschine“;
//      danach „Zuletzt“ = Espresso, Statistik zählt hoch.
//   4. Warnung (Trester voll) → Kachel „Satz voll“, Popup „Satzbehälter leeren“ unter Hinweise.
// Die Kachel entsteht nur im Browser (nicht gespeichert); Dienste wirken nur auf das Testgerät.
import { open, casoraDashboard, dashboard, check, need, finish, stable, atFinish, BASE } from './lib.mjs';
import { tokens } from '../ws.mjs';

const SW = 'sensor.bohnenwerk_status';
const tok = await tokens();
const svc = (s, data) => fetch(BASE + '/api/services/casora_mock/' + s,
  { method: 'POST', headers: { Authorization: 'Bearer ' + tok.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify(data || {}) });
atFinish(async () => { await svc('kaffee_warnung', { art: 'aus', geraet: 'bohnenwerk' }); });

const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);
const { page } = await open({ width: 1440, height: 1000, theme: 'Casora' });
await dashboard(page, dash.url, 3);
await need('Bohnenwerk im Testhaus (Mock)', await page.evaluate((id) => !!document.querySelector('home-assistant').hass.states[id], SW));
await svc('kaffee_warnung', { art: 'aus', geraet: 'bohnenwerk' });
await page.waitForFunction((id) => document.querySelector('home-assistant').hass.states[id].state === 'ready', SW, { timeout: 40000 }).catch(() => {});
await page.evaluate(async (id) => {
  const ha = document.querySelector('home-assistant');
  const h = await window.loadCardHelpers();
  const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_coffee', entity: id, name: 'Kaffee' });
  el.classList.add('qa-r282');
  el.hass = ha.hass;
  el.style.cssText = 'position:fixed;left:400px;top:300px;width:290px;height:200px;z-index:99990;';
  ha.shadowRoot.appendChild(el);
  setInterval(() => { if (el.hass !== ha.hass) el.hass = ha.hass; }, 200);
}, SW);
const tile = () => stable(page, () => {
  const el = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-r282');
  const st = el && el.shadowRoot && el.shadowRoot.querySelector('#state');
  const full = st && st.querySelector('.sf-f');
  return st ? String((full || st).textContent || '').replace(/\s+/g, ' ').trim() : null;
}, null, { max: 10000, quiet: 800 });
const popText = () => stable(page, () => {
  const pop = window.__pierce('casora-popup').find((p) => p.hasAttribute('open'));
  if (!pop) return null;
  const parts = [];
  const walk = (n) => n.childNodes.forEach((c) => {
    if (c.nodeType === 3) { if (c.parentNode && c.parentNode.nodeName !== 'STYLE') parts.push(c.textContent); return; }
    if (c.nodeType !== 1 || c.nodeName === 'STYLE') return;
    if (c.shadowRoot) walk(c.shadowRoot);
    walk(c);
  });
  walk(pop.shadowRoot);
  return { txt: parts.join(' ').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').slice(0, 2500), drinks: window.__pierce('.cof-d', pop.shadowRoot).length };
}, null, { max: 12000, quiet: 1200 });
const center = () => page.evaluate(() => { const r = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-r282').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
const closePop = async () => { await page.evaluate(() => window.__pierce('casora-popup').forEach((p) => p.hasAttribute('open') && p.close())); await page.waitForTimeout(600); };
const openPop = async () => { const at = await center(); await page.mouse.click(at.x + 40, at.y + 40); return popText(); };

await check('Kachel Bohnenwerk (Strom-Erkennung, nur Schlüssel): „Bereit“', (await tile()) === 'Bereit', await tile());
let p = await openPop();
await check('Popup: „Zuletzt“ + Hinweis statt Raster', p && p.drinks === 0 && /Zuletzt/.test(p.txt) && /Cappuccino/.test(p.txt) && /Stromverlauf/.test(p.txt), p && p.txt);
await check('Popup: Pflege mit Liter und Tagen', p && /Pflege/.test(p.txt) && /In 42,5 l/.test(p.txt) && /In 12 Tagen/.test(p.txt) && /Brühgruppe/.test(p.txt)
  && /In 3 Tagen/.test(p.txt), p && p.txt);
await check('Popup: Statistik gesamt + heute', p && /Getränke gesamt/.test(p.txt) && /86/.test(p.txt) && /Heute 2/.test(p.txt), p && p.txt);
await closePop();
await svc('kaffee_beziehen', { geraet: 'bohnenwerk', getraenk: 'espresso', dauer: 12 });
await page.waitForFunction((id) => document.querySelector('home-assistant').hass.states[id].state === 'running', SW, { timeout: 8000 }).catch(() => {});
await check('Vorgang: Kachel „Läuft“', (await tile()) === 'Läuft', await tile());
p = await openPop();
await check('Vorgang: Abbrechen nur an der Maschine, Leistung im Kopf', p && /Abbrechen geht nur an der Maschine/.test(p.txt) && /1[.,]?420 W/.test(p.txt), p && p.txt);
await page.waitForFunction((id) => document.querySelector('home-assistant').hass.states[id].state === 'ready', SW, { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1500);
p = await popText();
await check('Nach dem Vorgang: Zuletzt Espresso, Heute 3', p && /Zuletzt Espresso/.test(p.txt) && /Heute 3/.test(p.txt), p && p.txt);
await closePop();
await svc('kaffee_warnung', { art: 'satz', geraet: 'bohnenwerk' });
await page.waitForTimeout(1500);
await check('Warnung: Kachel „Satz voll“', (await tile()) === 'Satz voll', await tile());
p = await openPop();
await check('Warnung: Hinweise „Satzbehälter leeren“', p && /Hinweise/.test(p.txt) && /Satzbehälter leeren/.test(p.txt), p && p.txt);
await closePop();
await finish();
