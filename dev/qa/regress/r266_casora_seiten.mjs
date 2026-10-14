// @zustand: arbeit
// @deckt: custom_components/casora/scripts/local/18-ziele.js
// Casora-Seiten statt HAs Dialog (1.5): casoraRoute öffnet für Messwerte die Messwert-Seite (Zeitraum, Diagramm,
// Höchst/Tiefst/Ø, Verlauf), für Kontakte die Seite mit Offen-Band, für Geräte ihr Casora-Popup und sonst die
// Geräteseite (Gerätedaten, „Gehört dazu“, „In Home Assistant öffnen“). Halten auf Casora-Kacheln öffnet kein
// HA-Dialog und schaltet nichts. Es wird nichts gespeichert und nichts geschaltet.
import { open, casoraDashboard, dashboard, check, need, finish, stable } from './lib.mjs';

const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);
const { page } = await open({ width: 1440, height: 1000, theme: 'Casora', dark: false });
await dashboard(page, dash.url, 3);
const ids = await page.evaluate(() => {
  const h = document.querySelector('home-assistant').hass, S = h.states, R = h.entities;
  const k = Object.keys(S);
  return {
    num: k.find((x) => x.startsWith('sensor.') && (S[x].attributes || {}).device_class === 'temperature' && isFinite(parseFloat(S[x].state)) && R[x] && R[x].device_id),
    door: k.find((x) => x.startsWith('binary_sensor.') && /door|window|opening/.test((S[x].attributes || {}).device_class || '')),
    sw: k.find((x) => x.startsWith('switch.') && R[x] && R[x].device_id && !R[x].entity_category),
    clim: k.find((x) => x.startsWith('climate.') && !Array.isArray((S[x].attributes || {}).entity_id)),
  };
});
await need('Temperatur-, Kontakt- und Schalter-Entität im Testhaus', ids.num && ids.door && ids.sw, ids);
const POP = () => {
  const p = window.casoraPopup && window.casoraPopup.element;
  if (!p || !p.hasAttribute('open')) return { open: false, native: !!document.querySelector('home-assistant').shadowRoot.querySelector('ha-more-info-dialog') };
  const parts = [];
  const walk = (n) => n.childNodes.forEach((c) => { if (c.nodeType === 3) { if (c.parentNode.nodeName !== 'STYLE') parts.push(c.textContent); } else if (c.nodeType === 1 && c.nodeName !== 'STYLE') { if (c.shadowRoot) walk(c.shadowRoot); walk(c); } });
  walk(p.shadowRoot);
  const back = p.shadowRoot.querySelector('.header-back');
  return { open: true, title: p.shadowRoot.querySelector('.header-title').textContent, back: !!(back && !back.hidden), text: parts.join(' ').replace(/\s+/g, ' ').slice(0, 2000),
    chart: window.__pierce('casora-chart', p.shadowRoot).length, band: window.__pierce('.cz-band i', p.shadowRoot).length,
    native: !!document.querySelector('home-assistant').shadowRoot.querySelector('ha-more-info-dialog') };
};
const look = () => stable(page, POP, null, { max: 9000, quiet: 1200 });
const close = async () => { await page.evaluate(() => window.casoraPopup && window.casoraPopup.close()); await page.waitForTimeout(900); };

// 1. Messwert: aus einem offenen Popup (Rückweg), Diagramm, Kennzahlen, Zeitraum wechseln
await page.evaluate(() => window.casoraPopup.open({ title: 'Startpunkt', content: { type: 'markdown', content: 'x' } }));
await page.waitForTimeout(800);
await page.evaluate((id) => window.casoraRoute(id), ids.num);
let s = await look();
await check('Messwert-Seite statt HA-Dialog, mit ‹ zurück', s.open && !s.native && s.back, s);
await check('Diagramm und Höchster/Tiefster/Durchschnitt', s.chart >= 1 && /Höchster Wert/.test(s.text) && /Durchschnitt/.test(s.text), s.text && s.text.slice(0, 400));
await check('Zeitraum-Pillen 24 Std./7 Tage/30 Tage', /24 Std\./.test(s.text) && /7 Tage/.test(s.text) && /30 Tage/.test(s.text));
await page.evaluate(() => { const p = window.casoraPopup.element; window.__pierce('[data-casora-zspan$="|7d"]', p.shadowRoot)[0].click(); });
s = await look();
await check('7 Tage gewählt, ‹ führt weiter zum Startpunkt', /Letzte 7 Tage/.test(s.text) && s.back, s.text && s.text.slice(0, 300));
await page.evaluate(() => { const p = window.casoraPopup.element; const r = p.shadowRoot.querySelector('.header-back'); r.click(); });
s = await look();
await check('‹ zurück zum Ausgangs-Popup', s.title === 'Startpunkt', s.title);
await close();

// 2. Kontakt: Band und Zählwerte
await page.evaluate((id) => window.casoraRoute(id), ids.door);
s = await look();
await check('Kontakt-Seite mit Offen-Band und Zählwerten, kein HA-Dialog', s.open && !s.native && /Geöffnet|Geschlossen/.test(s.text) && /Insgesamt/.test(s.text), s.text && s.text.slice(0, 300));
await close();

// 3. Geräteseite mit bewusstem Ausweg
await page.evaluate((id) => window._casoraZiele.openDevice(id), ids.num);
s = await look();
await check('Geräteseite: Gerätedaten, „Gehört dazu“, „In Home Assistant öffnen“', s.open && /Gehört dazu/.test(s.text) && /In Home Assistant öffnen/.test(s.text), s.text && s.text.slice(0, 400));
await close();

// 3b. Geräte-Zeile (Thermostat) → Casora-Popup des Geräts mit ‹ zurück, kein HA-Dialog
if (ids.clim) {
  await page.evaluate(() => window.casoraPopup.open({ title: 'Startpunkt', content: { type: 'markdown', content: 'x' } }));
  await page.waitForTimeout(800);
  await page.evaluate((id) => window.casoraRoute(id), ids.clim);
  s = await look();
  await check('Thermostat-Zeile: Casora-Popup des Geräts mit ‹ zurück', s.open && !s.native && s.back && s.title !== 'Startpunkt', { title: s.title, back: s.back });
  await close();
}

// 4. Halten auf einer Casora-Kachel: kein HA-Dialog, Schalter bleibt, wie er ist
const before = await page.evaluate((id) => document.querySelector('home-assistant').hass.states[id].state, ids.sw);
await page.evaluate(async (id) => {
  const ha = document.querySelector('home-assistant'); const h = await window.loadCardHelpers();
  const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_switch', entity: id, name: 'QA Schalter' });
  el.id = 'qa-r266'; el.hass = ha.hass; el.style.cssText = 'position:fixed;left:400px;top:300px;width:220px;height:140px;z-index:99990;';
  ha.shadowRoot.appendChild(el);
}, ids.sw);
await page.waitForTimeout(2000);
await page.evaluate(() => { const el = document.querySelector('home-assistant').shadowRoot.getElementById('qa-r266'); el._handleAction({ detail: { action: 'hold' } }, { isIcon: false }); });
s = await look();
const after = await page.evaluate((id) => document.querySelector('home-assistant').hass.states[id].state, ids.sw);
await check('Halten: Casora-Popup statt HA-Dialog', s.open && !s.native, s);
await check('Halten schaltet nichts', before === after, { before, after });
await close();
await finish();
