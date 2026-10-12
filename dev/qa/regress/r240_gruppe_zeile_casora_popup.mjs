// @zustand: arbeit
// @parallel: ui
// 12.10.2026: Im Gruppen-Popup (Beleuchtung, Jalousien) öffnete das Antippen einer einzelnen Lampe
// bzw. Jalousie HAs eigenen Dialog statt Casoras Popup. Bei Jalousien fand die Kachelsuche zudem
// die Gruppenkarte selbst (Gerät steht in ihrer Liste). Erwartet: Casoras Popup des Geräts,
// kein HA-Dialog.
import { open, casoraDashboards, dashboard, check, need, finish, usePage } from './lib.mjs';

const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && d.url === 'qa-arbeit') || all.find((d) => !d.mobile);
await need('ein Casora-Dashboard', desk, all.map((d) => d.url));
const { page } = await open({ width: 1440, height: 900, theme: 'Casora' });
usePage(page);

const state = () => page.evaluate(() => {
  const mi = document.querySelector('home-assistant').shadowRoot.querySelector('ha-more-info-dialog');
  return {
    haDialog: !!(mi && mi.shadowRoot && mi.shadowRoot.querySelector('[open], ha-dialog, ha-adaptive-dialog')),
    casora: !!(window.casoraPopup && window.casoraPopup.surface),
  };
});

for (const dom of ['light', 'cover']) {
  await dashboard(page, desk.url);
  await page.waitForTimeout(1500);
  // Gruppenkachel (keine Badge): Entität mit Mitgliederliste (attributes.entity_id).
  const tile = await page.evaluate((dom) => {
    const S = document.querySelector('home-assistant').hass.states;
    const b = window.__pierce('button-card').find((x) => { const e = (x._config || {}).entity || '';
      return e.indexOf(dom + '.') === 0 && Array.isArray(((S[e] || {}).attributes || {}).entity_id)
        && x._config.tap_action && x._config.tap_action.casora_popup && x.getBoundingClientRect().width > 100
        && ![].concat(x._config.template || []).some((t) => /badge|chip/.test(t)); });
    if (!b) return null;
    b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, id: b._config.entity };
  }, dom);
  await need(`Gruppenkachel ${dom}`, tile);
  await page.mouse.click(tile.x, tile.y);
  await page.waitForTimeout(2500);
  // Beleuchtung: Räume zuerst aufklappen, bis eine Lampenzeile („mi“) sichtbar ist.
  if (dom === 'light') {
    const room = await page.evaluate(() => { const s = window.casoraPopup && window.casoraPopup.surface; if (!s) return null;
      const rows = window.__pierce('.lps-row', s);
      if (rows.some((e) => /"a":"mi"/.test(e.dataset.lpsTap || '') && e.getBoundingClientRect().width > 100)) return null;
      const x = rows.find((e) => /"a":"room"/.test(e.dataset.lpsTap || '')); if (!x) return null;
      const r = x.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    if (room) { await page.mouse.click(room.x, room.y); await page.waitForTimeout(1500); }
  }
  const row = await page.evaluate((dom) => { const s = window.casoraPopup && window.casoraPopup.surface; if (!s) return null;
    const r0 = window.__pierce('.lps-row, [data-casora-mi]', s).find((x) => {
      const v = x.dataset.casoraMi || x.dataset.lpsTap || '';
      return (dom === 'light' ? /"a":"mi"/.test(v) : v.indexOf('cover.') === 0) && x.getBoundingClientRect().width > 100; });
    if (!r0) return null;
    r0.scrollIntoView({ block: 'center' }); const r = r0.getBoundingClientRect();
    // Mitte der Zeile, nicht Symbol/Schalter (die schalten).
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, dom);
  await need(`Gerätezeile im Gruppen-Popup (${dom})`, row);
  await page.mouse.click(row.x, row.y);
  await page.waitForTimeout(2500);
  const st = await state();
  await check(`${dom}: Zeile öffnet Casoras Popup, keinen HA-Dialog`, st.casora && !st.haDialog, st);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
}
await finish();
