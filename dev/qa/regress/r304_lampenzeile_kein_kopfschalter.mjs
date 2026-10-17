// @zustand: arbeit
// @parallel: ui
// Gemeldet (17.10.2026, Nutzertest Mac, Casora 26.10.34): Aus dem Licht-Popup eines Raums die Zeile einer Lampe
// antippen öffnet das Einzellampen-Popup (casora_light) – oben rechts stand weiter der Kopfschalter des Raums und
// schaltete alle Leuchten des Raums. Erwartet (Casora-Look, Tablet 1024×768, hell): das Einzellampen-Popup trägt
// den Namen der Lampe und keinen Kopfschalter (es hat seinen eigenen Ein/Aus-Knopf); das Raum-Popup davor behält ihn.
// Dazu (Wunsch 17.10.2026) ‹ zurück im Kopf des Lampen-Popups: führt ins Raum-Popup zurück.
import { open, dashboard, casoraDashboards as _cd, check, need, finish } from './lib.mjs';

const desks = (await _cd()).filter((d) => !d.mobile && (d.config.views || []).length > 1);
await need('Casora-Dashboard mit Räumen', desks.length);
const { page } = await open({ width: 1024, height: 768, dark: false, theme: 'Casora' });
const readPopup = () => page.evaluate(() => {
  const P = window.casoraPopup; const el = P && P.element; if (!el || !P.surface) return null;
  const sw = el.shadowRoot.querySelector('.header-switch'); const bk = el.shadowRoot.querySelector('.header-back');
  return { back: !!(bk && !bk.hidden), title: (el.shadowRoot.querySelector('.header-title') || {}).textContent || '', ids: sw && !sw.hidden ? (el._hsIds || []) : [],
    rows: window.__pierce('.lps-row', P.surface).map((r) => r.getAttribute('data-lps-tap') || '') };
});
let done = false;
outer: for (const dash of desks) for (const [i, v] of dash.config.views.entries()) {
  if (!i || !/casora_light\b/.test(JSON.stringify(v))) continue;
  await dashboard(page, dash.url + '/' + (v.path || String(i)), 3);
  await page.waitForTimeout(1500);
  // Sichtbare Licht-Kachel (casora_light) einer Raumgruppe mit ≥ 2 vorhandenen Leuchten, davon eine keine Gruppe.
  const pick = await page.evaluate(() => {
    const h = document.querySelector('home-assistant').hass;
    for (const b of window.__pierce('button-card')) {
      const e = b._config && b._config.entity;
      if (!e || !/^light\./.test(e) || !([].concat(b._config.template || []).includes('casora_light')) || !b.getBoundingClientRect().width) continue;
      const m = h.states[e]?.attributes?.entity_id;
      if (!Array.isArray(m)) continue;
      const ex = m.filter((x) => h.states[x]);
      const lamp = ex.find((x) => !Array.isArray(h.states[x].attributes?.entity_id));
      if (ex.length < 2 || !lamp) continue;
      b.scrollIntoView({ block: 'center', inline: 'center' }); const r = b.getBoundingClientRect();
      return { room: e, lamp, name: h.states[lamp].attributes.friendly_name || lamp, x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }
    return null;
  });
  if (!pick) continue;
  await page.waitForTimeout(600);
  await page.mouse.click(pick.x, pick.y);
  await page.waitForTimeout(2500);
  const room = await readPopup();
  const rowAt = await page.evaluate((id) => { const P = window.casoraPopup; const r = window.__pierce('.lps-row', P.surface).find((x) => (x.getAttribute('data-lps-tap') || '').indexOf('"id":"' + id + '"') >= 0);
    if (!r) return null; r.scrollIntoView({ block: 'center' }); const b = r.getBoundingClientRect(); return { x: b.x + b.width * 0.5, y: b.y + b.height / 2 }; }, pick.lamp);
  await check('Raum-Popup zeigt die Lampenzeile', !!rowAt, { room, lamp: pick.lamp });
  if (!rowAt) continue;
  await check('Raum-Popup hat den Kopfschalter', room && room.ids.length > 0, room);
  await page.mouse.click(rowAt.x, rowAt.y);
  await page.waitForTimeout(3000);
  const lamp = await readPopup();
  await check('Lampenzeile öffnet das Popup der Lampe', lamp && lamp.title && lamp.title !== room.title, { lamp, name: pick.name });
  await check('kein Kopfschalter im Einzellampen-Popup (schaltete den ganzen Raum)', lamp && !lamp.ids.length, lamp && lamp.ids);
  await check('‹ zurück im Einzellampen-Popup', lamp && lamp.back, lamp);
  await check('Raum-Popup hat kein ‹ zurück', room && !room.back, room);
  const bk = await page.evaluate(() => { const el = window.casoraPopup.element; const b = el.shadowRoot.querySelector('.header-back'); if (!b || b.hidden) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  if (bk) { await page.mouse.click(bk.x, bk.y); await page.waitForTimeout(2500); }
  const again = await readPopup();
  await check('‹ zurück führt ins Raum-Popup (Zeilen und Kopfschalter wie vorher)', again && !again.back && again.rows.join() === room.rows.join() && again.ids.length === room.ids.length, { again, room });
  done = true;
  break outer;
}
await check('Raum-Licht-Kachel mit ≥ 2 Leuchten gefunden', done);
await finish();
