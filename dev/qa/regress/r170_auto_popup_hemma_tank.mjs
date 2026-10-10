// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/casora-kompat.js custom_components/casora/scripts/local/12-tanken.js custom_components/casora/scripts/local/03-popups.js
// Issues #14/#15/#17 im echten Browser (bisher nur Unit-Tests): Ein altes Nutzer-Modul aus der
// Hemma-Zeit setzt window._hemmaTank, bevor Casora lädt. Erwartet (Desktop Chromium + Handy WebKit):
// Casoras Tanken-Modul gewinnt (_casoraTank ist Casoras, das alte bleibt unter _hemmaTank), das
// Auto-Popup des VW-Connect-Autos ist nicht leer (Tankbalken, Zeilen, Tanken-Zeile mit Preis),
// der Titel ist der Gerätename (#17), kein km-Wert wird als Datum gezeigt (#15, „01.01.26800“),
// die Tanken-Liste zeigt die geschlossene Station (zu, letzter Preis) (#18 Frontend-Seite).
// Der Tanken-Sensor wird nur im Browser untergeschoben, nichts wird in HA gespeichert.
import { open, casoraDashboards, dashboard, check, need, finish, fakeStates, usePage } from './lib.mjs';

const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && d.url === 'qa-arbeit') || all.find((d) => !d.mobile);
await need('ein Casora-Dashboard', desk, all.map((d) => d.url));
const DEV_NAME = 'Tiguan R-Line 2,0 l TDI SCR 4MOTION';
const SID = 'sensor.casora_tanken_qa_r170_e10';
const stations = [
  { n: 'Tankstelle Markt', b: 'ARAL', p: 1.669, o: true, d: 1.1, lat: 50.11, lng: 8.68 },
  { n: 'Tankstelle Ost', b: 'JET', p: 1.689, o: true, d: 2.3, lat: 50.12, lng: 8.69 },
  { n: 'Tankhof Lindenallee', b: 'Tankhof', p: 1.649, o: false, d: 3.4, lat: 50.10, lng: 8.67 },
];

const mount = (pg) => pg.evaluate(async () => {
  const ha = document.querySelector('home-assistant');
  const anchor = Object.keys(ha.hass.states).find((k) => /^sensor\.tiguan_.*_tankfullstand$/.test(k));
  if (!anchor) return null;
  if (window.__qaTile) window.__qaTile.remove();
  const old = window.__pierce('button-card').find((b) => { const r = b.getBoundingClientRect(); return r.width > 120 && r.width < 420 && r.height > 60 && r.top > 100; });
  const el = document.createElement('button-card');
  el.setConfig({ type: 'custom:button-card', template: 'casora_car', entity: anchor });
  el.hass = ha.hass;
  if (old) old.parentNode.insertBefore(el, old); else document.body.appendChild(el);
  window.__qaTile = el;
  await new Promise((r) => setTimeout(r, 1000));
  return { anchor, dev: (ha.hass.entities[anchor] || {}).device_id || null };
});
const openPopup = async (pg) => {
  await pg.evaluate(() => { if (window._casoraTank && window._casoraTank.leave) window._casoraTank.leave(true); if (window.casoraPopup) window.casoraPopup.close(); });
  await pg.waitForTimeout(600);
  await pg.evaluate(() => {
    const el = window.__qaTile;
    el.hass = document.querySelector('home-assistant').hass;
    el.addEventListener('hass-action', (ev) => { const act = ev.detail && ev.detail.config && (ev.detail.config.icon_tap_action || ev.detail.config.tap_action);
      if (act && act.casora_popup && window.casoraPopup) { ev.stopPropagation(); window.casoraPopup.open(act.casora_popup); } }, { capture: true, once: true });
    el._handleAction({ detail: { action: 'tap' } }, { isIcon: true });
  });
  for (let i = 0; i < 30; i++) {
    if (await pg.evaluate(() => !!(window.casoraPopup && window.casoraPopup.surface) && window.__pierce('.hui-srow', window.casoraPopup.surface).length > 0)) break;
    await pg.waitForTimeout(250);
  }
  await pg.waitForTimeout(900);
};
const popup = (pg) => pg.evaluate(() => {
  const s = window.casoraPopup && window.casoraPopup.surface;
  if (!s) return null;
  const P = (q) => window.__pierce(q, s).filter((e) => e.getBoundingClientRect().height > 0);
  const txt = (e) => e.textContent.replace(/\s+/g, ' ').trim();
  const deep = (n) => { let t = ''; for (const c of n.childNodes) t += c.nodeType === 3 ? c.data + ' ' : c.nodeType === 1 && c.tagName !== 'STYLE' ? deep(c) : '';
    if (n.shadowRoot) t += deep(n.shadowRoot); return t; };
  const row = P('.casora-tank-row')[0];
  return {
    title: window.casoraPopup.element.shadowRoot.querySelector('.header-title').textContent.trim(),
    rows: P('.hui-srow').length,
    tankRow: row ? txt(row) : null,
    list: P('.ct-list .hui-srow').map(txt),
    errors: window.__pierce('hui-error-card, .hui-error-card', s).length,
    text: deep(s).replace(/\s+/g, ' ').trim(),
  };
});
const tap = (pg, sel) => pg.evaluate((sel) => {
  const s = window.casoraPopup && window.casoraPopup.surface;
  const el = window.__pierce(sel, s).find((e) => e.getBoundingClientRect().height > 0);
  if (!el) return false;
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
  return true;
}, sel);

for (const vp of [{ name: 'Desktop', width: 1440, height: 900 }, { name: 'Handy', width: 393, height: 852, mobile: true, safari: true }]) {
  const { page, context } = await open({ width: vp.width, height: vp.height, mobile: !!vp.mobile, safari: !!vp.safari, theme: 'Casora' });
  usePage(page);
  // Altes Nutzer-Modul aus der Hemma-Zeit (eigene API), geladen vor Casora.
  await context.addInitScript(() => { window._hemmaTank = { qaLegacy: true, watch(c) { return c; }, popup() { return {}; } }; });
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + String(e && e.message || e)));
  page.on('console', (m) => { if (m.type() === 'error' && /casora|button-card|_casoraCar|_casoraTank|TypeError/i.test(m.text())) errs.push(m.text()); });
  await dashboard(page, vp.mobile ? (all.find((d) => d.mobile && d.url === desk.url + '-mobile') || desk).url : desk.url);
  await page.waitForFunction(() => window._casoraTank && window._casoraCar, null, { timeout: 40000 }).catch(() => {});
  const k = await page.evaluate(() => ({ legacy: !!(window._hemmaTank && window._hemmaTank.qaLegacy),
    casora: !!(window._casoraTank && !window._casoraTank.qaLegacy && window._casoraTank.casora) }));
  await check(vp.name + ': altes _hemmaTank bleibt erreichbar', k.legacy, k);
  await check(vp.name + ': _casoraTank ist Casoras Modul (nicht der Zwilling)', k.casora, k);
  const m = await mount(page);
  await need(vp.name + ': Auto im arbeit-Haus', m && m.dev, m);
  await fakeStates(page, { [SID]: { state: '1.669', attributes: { car_device_id: m.dev, car_name: 'Testauto', fuel: 'e10',
    friendly_name: 'Testauto günstigster Preis Super E10', unit_of_measurement: '€/L', source: 'key', origin: 'home',
    radius_km: 5, updated: new Date().toISOString(), count: stations.length, stations, error: null } } }, { sticky: true });
  await openPopup(page);
  const p = await popup(page);
  if (process.env.CASORA_OUT) await page.screenshot({ path: process.env.CASORA_OUT + '/r170_' + vp.name + '.png' });
  await check(vp.name + ': Popup nicht leer (Zeilen)', p && p.rows >= 3 && !/Noch kein Gerät|No device/.test(p.text), p && { rows: p.rows, text: p.text.slice(0, 200) });
  await check(vp.name + ': Titel = Gerätename (#17)', p && p.title === DEV_NAME, p && p.title);
  await check(vp.name + ': kein km-Wert als Datum (#15)', p && !/\d{1,2}\.\d{1,2}\.\d{5}|\b(2[1-9]|[3-9]\d)\d{3}\b(?! ?km)/.test(p.text), p && p.text.slice(0, 600));
  await check(vp.name + ': Tanken-Zeile mit Preis', p && /Tanken.*1,6[4-9]/.test(p.tankRow || ''), p && p.tankRow);
  await check(vp.name + ': kein Fehler-Kärtchen', p && p.errors === 0, p && p.errors);
  await tap(page, '.casora-tank-row .hui-srow');
  await page.waitForTimeout(1200);
  await tap(page, '.ct-seg .hui-sg:nth-child(3)').catch(() => {});
  await page.waitForTimeout(400);
  // Liste: Umschalter „Günstigste“ zeigt offene und (unten) die geschlossene Station.
  await page.evaluate(() => { const s = window.casoraPopup.surface; const b = window.__pierce('.ct-seg .hui-sg', s)[0]; if (b) b.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true })); });
  await page.waitForTimeout(500);
  const q = await popup(page);
  if (process.env.CASORA_OUT) await page.screenshot({ path: process.env.CASORA_OUT + '/r170_' + vp.name + '_tanken.png', fullPage: false });
  const closed = q && q.list.find((t) => /Lindenallee/.test(t));
  await check(vp.name + ': Tanken-Liste zeigt geschlossene Station', !!closed, q && q.list);
  await check(vp.name + ': geschlossene Station als zu markiert', !!closed && /zu|geschlossen/i.test(closed), closed);
  await check(vp.name + ': keine Fehler in der Konsole', errs.length === 0, errs.slice(0, 3));
  await page.evaluate(() => { if (window.casoraPopup) window.casoraPopup.close(); if (window.__qaTile) window.__qaTile.remove(); });
}
await finish();
