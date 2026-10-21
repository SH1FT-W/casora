// @zustand: arbeit
// @deckt: custom_components/casora/scripts/local/05-weich-mehr.js custom_components/casora/scripts/local/02-devices.js
// Popups bauen ihre Bereiche bei Attributänderungen nicht neu auf (17.10.2026: Pulse → Gerät → „Verlauf“ flackerte).
// Ursache war, dass die äußere Layout-Karte (K.layout/H.layout) die Vorlagen ihrer inneren button-cards mit auswertete,
// so alle Entitäten beobachtete und bei jeder Änderung die Kinder neu anlegte. Jetzt werten die Kinder selbst aus
// (do_not_eval). Geprüft: Messwert-Seite (Zustand wie Pulse, Zahl), Pulse-artiges Attribut ändert sich jede 0,7 s –
// keine neue button-card/casora-chart im Popup; Zustandswechsel kommt trotzdem live an. Dazu ein Geräte-Popup (Schalter).
// Legt zwei Test-Sensoren per REST an (nur Zustände, nichts gespeichert), schaltet nichts.
import { open, casoraDashboard, dashboard, check, need, finish } from './lib.mjs';
import { tokens } from '../ws.mjs';

const BASE = process.env.CASORA_URL || 'http://localhost:8124';
const { access_token } = await tokens();
const put = (id, state, attrs) => fetch(BASE + '/api/states/' + id, { method: 'POST',
  headers: { Authorization: 'Bearer ' + access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ state, attributes: attrs }) });
const RUN = Date.now().toString(36);
const ENUM = 'sensor.qa_r303_' + RUN + '_pulse_status', NUM = 'sensor.qa_r303_' + RUN + '_temperatur';
const enumA = (i) => ({ options: ['ok', 'learning', 'watch', 'check', 'failed'], device_class: 'enum', friendly_name: 'QA Neuaufbau Status',
  silent_since: new Date(Date.now() - i * 1000).toISOString() });
const numA = (i) => ({ unit_of_measurement: '°C', device_class: 'temperature', state_class: 'measurement', friendly_name: 'QA Neuaufbau Temperatur', zaehler: i });
await put(ENUM, 'ok', enumA(0));
await put(NUM, '21.5', numA(0));

const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);
const { page } = await open({ width: 1440, height: 1000, theme: 'Casora' });
await dashboard(page, dash.url, 3);

// Zählt neu eingehängte button-card/casora-chart im offenen Popup (auch in Schatten-Bäumen) und den Popup-Text.
const arm = () => page.evaluate(() => {
  const p = window.casoraPopup.element;
  window.__r303 = { neu: [] };
  const tag = (r) => r.querySelectorAll('*').forEach((e) => { if (/^(BUTTON-CARD|CASORA-CHART)$/.test(e.nodeName)) e.__r303 = 1; if (e.shadowRoot) tag(e.shadowRoot); });
  tag(p.shadowRoot);
  const seen = new WeakSet();
  const obs = (root) => {
    if (seen.has(root)) return; seen.add(root);
    new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => {
      if (/^(BUTTON-CARD|CASORA-CHART)$/.test(n.nodeName) && !n.__r303) window.__r303.neu.push(n.nodeName);
    }))).observe(root, { childList: true, subtree: true });
  };
  const walk = (n) => { if (n.shadowRoot) { obs(n.shadowRoot); walk(n.shadowRoot); } (n.childNodes || []).forEach(walk); };
  walk(p.shadowRoot);
  window.__r303.t = setInterval(() => walk(p.shadowRoot), 100);
});
const text = () => page.evaluate(() => {
  const parts = [];
  const walk = (n) => n.childNodes.forEach((c) => { if (c.nodeType === 3) { if (c.parentNode.nodeName !== 'STYLE') parts.push(c.textContent); } else if (c.nodeType === 1 && c.nodeName !== 'STYLE') { if (c.shadowRoot) walk(c.shadowRoot); walk(c); } });
  walk(window.casoraPopup.element.shadowRoot);
  return parts.join(' ').replace(/\s+/g, ' ');
});
const neu = () => page.evaluate(() => { clearInterval(window.__r303.t); return window.__r303.neu; });
const close = async () => { await page.evaluate(() => window.casoraPopup.close()); await page.waitForTimeout(900); };

// 1. Zustand wie Pulse-Status: Attribut ändert sich laufend
await page.evaluate((id) => window.casoraRoute(id), ENUM);
await page.waitForTimeout(3500);
await arm();
for (let i = 1; i <= 8; i++) { await put(ENUM, i === 4 ? 'watch' : 'ok', enumA(i)); await page.waitForTimeout(700); }
let n = await neu();
await check('Messwert-Seite (Zustand): kein Neuaufbau bei Attribut- und Zustandsänderungen', n.length === 0, n);
const changes = (x) => { const m = /Änderungen (\d+)/.exec(x); return m ? Number(m[1]) : -1; };
let t = await text();
const c0 = changes(t);
await put(ENUM, 'check', enumA(9));
// Der Recorder schreibt mit kurzer Verzögerung; „Änderungen“ zählt aus dem Verlauf.
for (let k = 0; k < 20 && changes(t) <= c0; k++) { await page.waitForTimeout(500); t = await text(); }
await check('Messwert-Seite (Zustand): Zustandswechsel kommt live an (Kopf und Änderungen)',
  /check|Prüfen/i.test(t.slice(0, 200)) && c0 >= 0 && changes(t) > c0, { c0, t: t.slice(0, 300) });
await close();

// 2. Zahl mit Diagramm
await page.evaluate((id) => window.casoraRoute(id), NUM);
await page.waitForTimeout(3500);
await arm();
for (let i = 1; i <= 8; i++) { await put(NUM, i % 2 ? '21.5' : '21.7', numA(i)); await page.waitForTimeout(700); }
n = await neu();
await check('Messwert-Seite (Zahl): Diagramm und Bereiche bleiben bei Wert- und Attributänderungen stehen', n.length === 0, n);
await put(NUM, '23.0', numA(9));
await page.waitForTimeout(1500);
t = await text();
await check('Messwert-Seite (Zahl): neuer Wert kommt live an', /23[,.]0/.test(t.slice(0, 200)), t.slice(0, 200));
await close();

// 3. Geräte-Popup (H.layout): Schalter aus dem Testhaus, Attribut ändern ohne zu schalten
const sw = await page.evaluate(() => {
  const h = document.querySelector('home-assistant').hass, R = h.entities;
  return Object.keys(h.states).find((x) => x.startsWith('switch.') && R[x] && R[x].device_id && !R[x].entity_category);
});
if (sw) {
  const st0 = await page.evaluate((id) => { const s = document.querySelector('home-assistant').hass.states[id]; return { state: s.state, a: s.attributes }; }, sw);
  await page.evaluate((id) => window.casoraRoute(id), sw);
  await page.waitForTimeout(3500);
  const isOpen = await page.evaluate(() => !!(window.casoraPopup.element && window.casoraPopup.element.hasAttribute('open')));
  if (isOpen) {
    await arm();
    for (let i = 1; i <= 6; i++) { await put(sw, st0.state, Object.assign({}, st0.a, { qa_r303: i })); await page.waitForTimeout(700); }
    n = await neu();
    await check('Geräte-Popup: kein Neuaufbau bei Attributänderungen', n.length === 0, n);
    await close();
  }
  await put(sw, st0.state, st0.a);
}
await finish();
