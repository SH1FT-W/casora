// @zustand: arbeit
// @parallel: ui
// Neu (Casora 1.2): Tanken im Auto-Popup. Erwartet: Mit eingerichtetem Tankerkönig steht direkt unter
// dem Tankbalken die Zeile „Tanken · ab X,XXX €“; Antippen zeigt im selben Popup die Ansicht „Tanken“
// (Zurück-Knopf, Empfehlung bzw. in der Lernphase der Hinweis „Die Empfehlung kommt, sobald genug Preise
// gesammelt sind, in etwa N Tagen“, Typischer Tag, Am günstigsten, Punktkarte, Umschalter
// Günstigste/Nächste/Offen, Liste, „Daten: Tankerkönig, CC BY 4.0“). Ohne Einrichtung (kein Sensor)
// fehlt die Zeile ganz. Studio › Einstellungen › „Tanken“ mit Link zur Registrierung, maskiertem
// Schlüsselfeld, Test-Abruf, Umkreis und Kraftstoff je Auto.
// Der Tank-Sensor wird nur im Browser untergeschoben (erfundene Stationen), nichts wird in HA gespeichert.
import { open, casoraDashboards, dashboard, studioDashboard, studio, check, need, finish, fakeStates, usePage } from './lib.mjs';

const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && d.url === 'qa-arbeit') || all.find((d) => !d.mobile);
await need('ein Casora-Dashboard', desk, all.map((d) => d.url));

const SID = 'sensor.casora_tanken_qa_testauto_e10';
const stations = [
  { n: 'Freie Tankstelle Mühlweg', b: 'Freie', p: 1.689, o: true, d: 2.8, x: 1.9, y: 2.0 },
  { n: 'Autohof Nord', b: 'JET', p: 1.699, o: true, d: 4.6, x: 2.4, y: 3.9 },
  { n: 'Tankpunkt Südring', b: 'Tankpunkt', p: 1.719, o: true, d: 1.2, x: -0.4, y: -1.1 },
  { n: 'Stadttankstelle Gartenstraße', b: 'ARAL', p: 1.739, o: true, d: 0.9, x: -0.7, y: 0.5 },
  { n: 'Tankhof Lindenallee', b: 'Tankhof', p: 1.749, o: false, d: 3.4, x: -3.0, y: -1.6 },
];
const typical = Array.from({ length: 24 }, (_, h) => (h >= 19 && h <= 22 ? 1.649 : h < 6 ? 1.70 : 1.749));
const sensor = (dev, extra) => ({ state: '1.689', attributes: { car_device_id: dev, car_name: 'Testauto', fuel: 'e10',
  friendly_name: 'Testauto günstigster Preis Super E10', unit_of_measurement: '€/L', source: 'key', origin: 'home',
  radius_km: 5, updated: new Date().toISOString(), count: stations.length, stations, error: null, ...extra } });

// Kachel im Browser anlegen (Auto über seine Reichweite), Dienstaufrufe abfangen.
const mount = (pg) => pg.evaluate(async () => {
  const ha = document.querySelector('home-assistant');
  const conn = ha.hass.connection;
  if (!conn.__qaSend) {
    conn.__qaSend = conn.sendMessagePromise.bind(conn);
    conn.sendMessagePromise = (m) => (m && m.type === 'call_service' ? Promise.resolve({}) : conn.__qaSend(m));
  }
  const C = window._casoraCar;
  const anchor = C && C.id(null, 'reichweite_kombiniert', 'sensor');
  if (!anchor) return null;
  if (window.__qaTile) window.__qaTile.remove();
  const old = window.__pierce('button-card').find((b) => { const r = b.getBoundingClientRect(); return r.width > 120 && r.width < 420 && r.height > 60 && r.top > 100; });
  const el = document.createElement('button-card');
  el.setConfig({ type: 'custom:button-card', template: 'casora_car', entity: anchor, name: 'Auto' });
  el.hass = ha.hass;
  if (old) old.parentNode.insertBefore(el, old); else document.body.appendChild(el);
  window.__qaTile = el;
  await new Promise((r) => setTimeout(r, 1000));
  return { anchor, dev: (ha.hass.entities[anchor] || {}).device_id || null };
});
const openPopup = async (pg) => {
  await pg.evaluate(() => { if (window._casoraTank) window._casoraTank.leave(true); if (window.casoraPopup) window.casoraPopup.close(); });
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
  const row = P('.casora-tank-row')[0];
  const bar = P('.hui-sl, [data-casora-axis]')[0];
  const sr = window.casoraPopup.element.shadowRoot;
  return {
    row: row ? txt(row.querySelector('.hui-srow') || row) : null,
    rowTop: row ? row.getBoundingClientRect().top : null,
    barBottom: bar ? bar.getBoundingClientRect().bottom : null,
    firstRowTop: (P('.hui-srow').filter((e) => !e.closest('.casora-tank-row'))[0] || { getBoundingClientRect: () => ({ top: null }) }).getBoundingClientRect().top,
    view: P('.casora-tank-view').length ? txt(P('.casora-tank-view')[0]) : null,
    title: sr.querySelector('.header-title').textContent,
    back: !!sr.querySelector('.casora-tank-back'),
    seg: P('.ct-seg .hui-sg').map(txt),
    segOn: P('.ct-seg .hui-sg.on').map(txt),
    list: P('.ct-list .hui-srow').map(txt),
    map: P('.ct-map').length, top: P('.ct-top > div').length, day: P('.ct-day').length, scale: P('.ct-scale').length,
  };
});
const tap = (pg, sel) => pg.evaluate((sel) => {
  const s = window.casoraPopup && window.casoraPopup.surface;
  const el = window.__pierce(sel, s).find((e) => e.getBoundingClientRect().height > 0);
  if (!el) return false;
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
  return true;
}, sel);

for (const vp of [{ name: 'Desktop', width: 1440, height: 900 }, { name: 'Handy', width: 393, height: 852, mobile: true }]) {
  const { page } = await open({ width: vp.width, height: vp.height, mobile: !!vp.mobile, dark: false, theme: 'Casora' });
  usePage(page);
  await dashboard(page, vp.mobile ? (all.find((d) => d.mobile && d.url === desk.url + '-mobile') || desk).url : desk.url);
  const car = await mount(page);
  await need(vp.name + ': Auto im Testhaus', car && car.dev, car);

  // Ohne Einrichtung: keine Zeile (auch echte Tank-Sensoren des Test-HA ausblenden).
  const real = await page.evaluate(() => Object.keys(document.querySelector('home-assistant').hass.states).filter((k) => k.startsWith('sensor.casora_tanken_')));
  const none = Object.fromEntries(real.concat([SID]).map((k) => [k, null]));
  await fakeStates(page, none, { sticky: true });
  await openPopup(page);
  let p = await popup(page);
  await check(vp.name + ': ohne Einrichtung keine Zeile „Tanken“', p && p.row === null && p.firstRowTop != null, p);

  // Lernphase: Zeile mit Preis, Ansicht mit Hinweis statt Empfehlung.
  await fakeStates(page, { ...none, [SID]: sensor(car.dev, { typical: null, low: null, high: null, days: 2, learn_days_left: 5 }) }, { sticky: true });
  await openPopup(page);
  p = await popup(page);
  await check(vp.name + ': Zeile „Tanken · ab 1,689 €“', p && /^Tanken/.test(p.row || '') && /ab 1,689 €/.test(p.row) && /Super E10 · Preise werden gesammelt/.test(p.row), p && p.row);
  await check(vp.name + ': Zeile direkt unter dem Tankbalken, vor Zustand/Wartung',
    p && p.rowTop != null && (p.barBottom == null || (p.rowTop > p.barBottom && p.rowTop - p.barBottom < 24)) && p.rowTop < p.firstRowTop, p);
  await tap(page, '.casora-tank-row');
  await page.waitForTimeout(800);
  p = await popup(page);
  await check(vp.name + ': Ansicht „Tanken“ mit Zurück-Knopf', p && p.title === 'Tanken' && p.back && p.view, p && { title: p.title, back: p.back });
  await check(vp.name + ': Lernphase zeigt den Hinweis statt einer Empfehlung',
    p && /Die Empfehlung kommt, sobald genug Preise gesammelt sind, in etwa 5 Tagen\./.test(p.view) && !p.day && !p.scale, p && p.view);
  await check(vp.name + ': Am günstigsten (3 Kacheln), Punktkarte, Umschalter, Liste, Quelle',
    p && p.top === 3 && p.map === 1 && p.seg.join('|') === 'Günstigste|Nächste|Offen' && p.list.length === 5
    && /Daten: Tankerkönig, CC BY 4\.0/.test(p.view) && !/Lindenallee.*Mühlweg/.test(p.list.join('|')), p);
  // Markenlogos (1.2): JET und ARAL bekommen ihr Logo (Adresse aus 12-tanken.js), freie Tankstellen das Kürzel.
  const logos = await page.evaluate(() => window.__pierce('img').map((i) => i.getAttribute('src') || '').filter((u) => /s2\/favicons|Aral_Logo/.test(u)));
  await check(vp.name + ': Markenlogos für JET und ARAL', logos.some((u) => /jet-tankstellen/.test(u)) && logos.some((u) => /Aral_Logo/.test(u)), logos.slice(0, 4));
  if (process.env.R89_BILD) await page.screenshot({ path: `${process.env.CASORA_OUT}/r89_${vp.name.replace(/\W+/g, '_')}_logos.png` });
  await tap(page, '.ct-seg .hui-sg:nth-child(3)');
  await page.waitForTimeout(400);
  p = await popup(page);
  await check(vp.name + ': „Offen“ blendet geschlossene aus', p && p.segOn[0] === 'Offen' && p.list.length === 4 && !p.list.some((t) => /Lindenallee/.test(t)), p && p.list);
  await tap(page, '.ct-seg .hui-sg:nth-child(2)');
  await page.waitForTimeout(400);
  p = await popup(page);
  await check(vp.name + ': „Nächste“ sortiert nach Entfernung', p && /Gartenstraße/.test(p.list[0] || ''), p && p.list);
  await tap(page, '.casora-tank-back');
  await page.waitForTimeout(600);
  p = await popup(page);
  await check(vp.name + ': Zurück führt ins Auto-Popup', p && p.view === null && p.title !== 'Tanken' && !p.back && /Tanken/.test(p.row || ''), p && { title: p.title, view: !!p.view });

  // Genug Preise: Empfehlung mit Skala und Typischem Tag.
  await fakeStates(page, { ...none, [SID]: sensor(car.dev, { typical, low: 1.649, high: 1.749, days: 14, learn_days_left: 0 }) }, { sticky: true });
  await openPopup(page);
  await tap(page, '.casora-tank-row');
  await page.waitForTimeout(800);
  p = await popup(page);
  await check(vp.name + ': Empfehlung mit Preis-Skala und Typischem Tag', p && p.scale === 1 && p.day === 1 && /Empfehlung/.test(p.view)
    && /Tief/.test(p.view) && /jetzt 1,689 €/.test(p.view) && /Hoch/.test(p.view) && !/Die Empfehlung kommt/.test(p.view), p && p.view);
  await page.evaluate(() => { if (window._casoraTank) window._casoraTank.leave(true); if (window.casoraPopup) window.casoraPopup.close(); });
  await page.context().browser().close();
}

// Studio › Einstellungen › Tanken
const sd = await studioDashboard();
await need('ein Dashboard fürs Studio', sd);
const { page } = await open({ width: 1600, height: 1000, theme: 'Casora', dark: false });
usePage(page);
await studio(page, sd);
await page.evaluate(() => window.__panel()._csOpenPage('fuel'));
await page.waitForTimeout(2500);
const st = await page.evaluate(() => {
  const P = (q) => window.__pierce(q).filter((e) => e.offsetParent);
  const wrap = P('.cs-wrap')[0];
  const key = P('.cs-tk-key')[0];
  const link = P('.cs-tk-link')[0];
  return { text: wrap ? wrap.textContent.replace(/\s+/g, ' ') : '', keyType: key && key.type, keyValue: key && key.value,
    link: link && link.href, test: P('.cs-tk-test button').length, radius: !!P('.cs-tk-radius')[0],
    side: P('.sidelist .siderow, #sidesections .siderow').map((e) => e.textContent.trim()) };
});
await check('Studio: Abschnitt „Tanken“ unter Einstellungen', /Tanken/.test(st.side.join('|')) || /Tankstellen in der Nähe/.test(st.text), st.side);
// 08.10.2026: Das neue Studio hat eigene Listen (Einstellungs-Menü, Suche) – dort fehlte „Tanken“.
{
  const fs = await import('node:fs');
  const b = fs.readFileSync(new URL('../../../custom_components/casora/panel/casora-panel-b.js', import.meta.url), 'utf8');
  const m = fs.readFileSync(new URL('../../../custom_components/casora/panel/casora-panel-b-mehr.js', import.meta.url), 'utf8');
  await check('Studio: „Tanken“ im Einstellungs-Menü und in der Suche des neuen Studios', /\["fuel", "Fuel prices"/.test(b) && /\["fuel", "Fuel prices"/.test(m));
}
await check('Studio: Link zur Registrierung', st.link === 'https://onboarding.tankerkoenig.de/', st.link);
await check('Studio: Schlüsselfeld maskiert und leer', st.keyType === 'password' && !st.keyValue, st);
await check('Studio: Test-Abruf, Umkreis, Kraftstoff je Auto, Quelle', st.test === 1 && st.radius && /Kraftstoff je Auto/.test(st.text) && /Daten: Tankerkönig, CC BY 4\.0/.test(st.text), st.text.slice(0, 400));
await finish();
