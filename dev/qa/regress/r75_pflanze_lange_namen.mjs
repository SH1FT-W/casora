// @zustand: demo
// @parallel: ui
// Gemeldet (07.10.2026): Pflanzen-Popup am Handy (von der Startseite, Theme „Casora“ hell) war breiter
// als der Bildschirm – Diagramm und Messwerte rechts abgeschnitten, Werte halb sichtbar. Ursache: ein
// langer Zeilenname („<Pflanze ohne Umlaut> Temperatur 2“) schob die Spalte des Popups breiter, und der
// Pflanzenname wurde vorn nicht weggelassen, weil er einmal mit, einmal ohne Umlaut geschrieben war.
// Erwartet bei 375 und 390 px (hell, 390 auch dunkel) mit erfundenen langen Namen: Popup-Inhalt nicht
// breiter als das Popup, jede Messwert-Zeile samt Wert ganz im Popup, Pflanzenname vorn und der
// HA-Zusatz „ 2“ hinten weggelassen, ein überlanger Rest endet mit „…“.
import { open, casoraDashboards, dashboard, fakeStates, check, need, finish } from './lib.mjs';

const all = await casoraDashboards();
const phone = all.find((d) => d.mobile && JSON.stringify(d.config).includes('casora_plant'))
  || all.find((d) => d.mobile);
await need('Handy-Dashboard', phone);

// Sichtbare Pflanzen-Kachel suchen: erst die Startseite, sonst Raum für Raum.
const findPlant = (pg) => pg.evaluate(() => {
  const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_plant')
    && x.getBoundingClientRect().width > 20 && /^plant\./.test((x._config || {}).entity || ''));
  return b ? b._config.entity : null;
});

for (const [w, dark] of [[390, false], [375, false], [390, true]]) {
  const tag = w + ' px ' + (dark ? 'dunkel' : 'hell');
  const { page } = await open({ width: w, height: 844, mobile: true, safari: true, scale: 2, dark, theme: 'Casora' });
  await dashboard(page, phone.url, 3);
  let plant = await findPlant(page);
  if (!plant) {
    const keys = await page.evaluate(() => { const n = window.__pierce('*').find((e) => e._rooms && typeof e._set === 'function' && e._bar);
      return n ? n._rooms.map((r) => r.key).filter((k) => /^room_/.test(k)) : []; }).catch(() => []);
    for (const k of keys) {
      await page.evaluate((x) => window._casoraFilter && window._casoraFilter.set(x), k);
      await page.waitForTimeout(2500);
      if ((plant = await findPlant(page))) break;
    }
  }
  await need(tag + ': Pflanzen-Kachel gefunden', plant);
  // Erfundene Namen: Pflanze mit Umlaut, Messwerte teils ohne Umlaut und mit HA-Zusatz „ 2“.
  const sensors = await page.evaluate((p) => { const h = document.querySelector('home-assistant').hass; const reg = h.entities || {};
    const dev = reg[p] && reg[p].device_id;
    return Object.keys(reg).filter((id) => id.startsWith('sensor.') && reg[id].device_id === dev && h.states[id]
      && ['moisture', 'temperature', 'illuminance', 'humidity'].includes(h.states[id].attributes.device_class)); }, plant);
  const P = 'Grüne Lilie am Südfenster', PA = 'Grune Lilie am Sudfenster';
  const patch = { [plant]: { state: 'problem', attributes: { friendly_name: P } } };
  sensors.forEach((id, i) => {
    patch[id] = { state: i % 2 ? '146' : '21', attributes: { friendly_name: i === 0 ? PA + ' Temperaturfühler 2'
      : i === 1 ? PA + ' Luftfeuchtigkeit 2' : P + ' Beleuchtungsstärke mit einem außergewöhnlich langen Zusatz ' + i } };
  });
  await fakeStates(page, patch, { sticky: true });
  const at = await page.evaluate((p) => { const b = window.__pierce('button-card').find((x) => (x._config || {}).entity === p
    && [].concat(x._config.template || []).includes('casora_plant') && x.getBoundingClientRect().width > 20);
    b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, plant);
  await page.touchscreen.tap(at.x, at.y);
  await page.waitForFunction(() => window.casoraPopup && window.casoraPopup.surface
    && window.__pierce('.hui-srow').some((r) => r.getBoundingClientRect().width > 0), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const m = await page.evaluate(() => {
    const s = window.casoraPopup.surface; const c = s.querySelector('.content'); const SR = s.getBoundingClientRect();
    const rows = window.__pierce('.hui-srow').filter((r) => r.getBoundingClientRect().width > 0).map((r) => {
      const b = r.getBoundingClientRect(); const lab = r.querySelector('.hui-inner > div:nth-child(2) > div');
      const kids = [...r.querySelectorAll('.hui-inner > div')]; const v = kids[kids.length - 1].getBoundingClientRect();
      return { label: lab ? lab.textContent : '', ell: lab ? lab.scrollWidth > lab.clientWidth : false, right: Math.round(b.right), vRight: Math.round(v.right) };
    });
    return { sr: Math.round(SR.right), cw: c.clientWidth, sw: c.scrollWidth, rows };
  });
  await check(tag + ': Popup-Inhalt nicht breiter als das Popup', m.sw <= m.cw + 1, m);
  await check(tag + ': Messwert-Zeilen da', m.rows.length >= Math.min(2, sensors.length), m.rows);
  await check(tag + ': jede Zeile samt Wert im Popup', m.rows.every((r) => r.right <= m.sr + 1 && r.vRight <= r.right), m.rows);
  await check(tag + ': Pflanzenname (mit/ohne Umlaut) und „ 2“ weggelassen',
    m.rows.every((r) => !/lilie|sudfenster|südfenster/i.test(r.label) && !/\s2$/.test(r.label)), m.rows.map((r) => r.label));
}
await finish();
