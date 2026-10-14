// @zustand: arbeit
// @deckt: custom_components/casora/scripts/local/19-befeuchter.js
// Luftbefeuchter-Kachel (1.5): Tippen öffnet das Casora-Popup statt HAs Dialog – Raum/Zustand, Verlauf der
// Luftfeuchte, Betrieb/Modus/Zielfeuchte, Status mit Wassertank. Zielfeuchte und Modus werden bedient und
// danach auf den Ausgangswert zurückgesetzt. Halten öffnet ebenfalls kein HA-Dialog. Test-Befeuchter aus dem Mock.
import { open, casoraDashboard, dashboard, check, need, finish, stable } from './lib.mjs';

const ID = 'humidifier.testbefeuchter';
const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);
const { page } = await open({ width: 1440, height: 1000, theme: 'Casora', dark: false });
await dashboard(page, dash.url, 3);
const st0 = await page.evaluate((id) => document.querySelector('home-assistant').hass.states[id], ID);
await need('Test-Befeuchter im Mock', st0);
const attr = (k) => page.evaluate(([id, k]) => (document.querySelector('home-assistant').hass.states[id].attributes || {})[k], [ID, k]);

await page.evaluate(async (id) => {
  const ha = document.querySelector('home-assistant'); const h = await window.loadCardHelpers();
  const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_humidifier', entity: id });
  el.id = 'qa-r267'; el.hass = ha.hass; el.style.cssText = 'position:fixed;left:400px;top:300px;width:220px;height:140px;z-index:99990;';
  ha.shadowRoot.appendChild(el);
}, ID);
await page.waitForTimeout(2000);
const POP = () => {
  const native = !!document.querySelector('home-assistant').shadowRoot.querySelector('ha-more-info-dialog');
  const p = window.casoraPopup && window.casoraPopup.element;
  if (!p || !p.hasAttribute('open')) return { open: false, native };
  const parts = [];
  const walk = (n) => n.childNodes.forEach((c) => { if (c.nodeType === 3) { if (c.parentNode.nodeName !== 'STYLE') parts.push(c.textContent); } else if (c.nodeType === 1 && c.nodeName !== 'STYLE') { if (c.shadowRoot) walk(c.shadowRoot); walk(c); } });
  walk(p.shadowRoot);
  return { open: true, native, title: p.shadowRoot.querySelector('.header-title').textContent.trim(), text: parts.join(' ').replace(/\s+/g, ' ').slice(0, 1500),
    chart: window.__pierce('casora-chart', p.shadowRoot).length };
};
const look = () => stable(page, POP, null, { max: 9000, quiet: 1200 });
const act = (a) => page.evaluate((a) => { const el = document.querySelector('home-assistant').shadowRoot.getElementById('qa-r267'); el._handleAction({ detail: { action: a } }, { isIcon: false }); }, a);
const press = (label) => page.evaluate((label) => {
  const b = window.__pierce('.hui-sg', window.casoraPopup.element.shadowRoot).find((x) => x.textContent.replace(/[\s\u202f\u00a0]+/g, ' ').trim() === label);
  if (b) b.click(); return !!b;
}, label);

await act('tap');
let s = await look();
await check('Tippen: Casora-Popup statt HA-Dialog', s.open && !s.native, { open: s.open, native: s.native });
await check('Betrieb, Modus, Zielfeuchte, Status mit Wassertank', ['Betrieb', 'Modus', 'Zielfeuchte', 'Wassertank', 'Luftfeuchte', 'Ziel 50 %'].every((w) => s.text.includes(w)), s.text.slice(0, 500));
await check('Verlauf der Luftfeuchte', s.chart >= 1, s.chart);

await check('Zielfeuchte 55 % antippen', await press('55 %'));
await page.waitForFunction(() => document.querySelector('home-assistant').hass.states['humidifier.testbefeuchter'].attributes.humidity === 55, null, { timeout: 8000 }).catch(() => {});
await check('Zielfeuchte steht auf 55 %', (await attr('humidity')) === 55, await attr('humidity'));
await page.waitForTimeout(1500); // Popup zeichnet nach der Änderung neu
await check('Modus Eco antippen', await press('Eco'));
await page.waitForFunction(() => document.querySelector('home-assistant').hass.states['humidifier.testbefeuchter'].attributes.mode === 'eco', null, { timeout: 8000 }).catch(() => {});
await check('Modus steht auf Eco', (await attr('mode')) === 'eco', await attr('mode'));
// Zurücksetzen
await page.evaluate((id) => {
  const h = document.querySelector('home-assistant').hass;
  h.callService('humidifier', 'set_humidity', { humidity: 50 }, { entity_id: id });
  h.callService('humidifier', 'set_mode', { mode: 'normal' }, { entity_id: id });
}, ID);
await page.evaluate(() => window.casoraPopup.close());
await page.waitForTimeout(900);

await act('hold');
s = await look();
await check('Halten: Casora-Popup statt HA-Dialog', s.open && !s.native, { open: s.open, native: s.native });
await page.evaluate(() => window.casoraPopup.close());
await finish();
