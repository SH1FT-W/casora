// @zustand: arbeit
// @parallel: ui
// Gemeldet (07.10.2026, Nutzertest Handy): Im Raum öffnete „Beleuchtung“ das Licht-Popup; nach
// „Alles aus“ und Schließen stand eine zweite Badge-Reihe da und der ganze Inhalt war ~110 px nach
// unten gerutscht. Ursache: derselbe Tipp klappte zusätzlich die Unter-Reihe auf (casora_phone_row),
// unsichtbar hinter dem Popup. Erwartet (Handy 390×844, WebKit): Tipp öffnet das Popup, die
// Unter-Reihe bleibt zu, nach dem Schließen steht der Inhalt wie vorher. Sammel-Badges ohne Popup
// (z. B. Sicherheit) klappen ihre Unter-Reihe weiter auf (r44).
import { open, usePage, dashboard, casoraDashboards, check, need, finish } from './lib.mjs';

const phone = (await casoraDashboards()).find((d) => d.mobile && /casora_mobile_sensor_chips/.test(JSON.stringify(d.config)));
await need('Handy-Dashboard mit Raumseite', phone);
const { page } = await open({ width: 390, height: 844, mobile: true, safari: true });
usePage(page);
await dashboard(page, phone.url + '/' + (phone.config.views[0].path || '0'), 3);
const rooms = await page.evaluate(() => (document.querySelector('home-assistant').hass.states['input_select.casora_mobile_filter']?.attributes?.options || []).filter((o) => /^room_/.test(o)));
// room_scenes/room_home sind keine Räume: ohne Szenen zeigt room_scenes die Startseite mit ihrer
// Licht-Badge (öffnet die Seite „Beleuchtung“, kein Popup) – z. B. im Prüf-Dashboard qa-arbeit.
rooms.splice(0, rooms.length, ...rooms.filter((o) => !/^room_(scenes|home)$/.test(o)));
// Lage der Licht-Sammel-Badge (sichtbare, oberste) und der ersten Kachel-Überschrift.
const probe = () => page.evaluate(() => {
  const vis = (b) => { const r = b.getBoundingClientRect(); return r.width > 10 && r.x >= 0 && r.x < innerWidth && (!b.checkVisibility || b.checkVisibility({ opacityProperty: true, visibilityProperty: true })); };
  const g = window.__pierce('button-card').find((b) => [].concat((b._config || {}).template || []).includes('casora_badge_light_group') && vis(b));
  const tiles = window.__pierce('button-card').filter((b) => vis(b) && b.getBoundingClientRect().height > 60 && b.getBoundingClientRect().width > 120)
    .map((b) => b.getBoundingClientRect().top).filter((y) => y > 150).sort((a, b) => a - b);
  if (!g) return null;
  g.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const r = g.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, top: tiles[0] == null ? null : Math.round(tiles[0]) };
});
let hit = null;
for (const room of rooms) {
  await page.evaluate((f) => window.dispatchEvent(new CustomEvent('ll-custom', { detail: { casora_filter: f } })), room);
  await page.waitForTimeout(2500);
  const p = await probe();
  if (p) { hit = { room, ...p }; break; }
}
await need('Raum mit Licht-Sammel-Badge am Handy', hit, rooms);
await page.waitForTimeout(800);
const before = await probe();
await page.touchscreen.tap(before.x, before.y);
await page.waitForTimeout(2000);
const st = await page.evaluate(() => ({ popup: !!(window.casoraPopup && window.casoraPopup.surface), row: window._casoraFilter.row() }));
await check('Tipp auf „Beleuchtung“ öffnet das Licht-Popup', st.popup, st);
await check('Unter-Reihe bleibt dabei zu', !st.row, st);
await page.evaluate(() => window.casoraPopup && window.casoraPopup.close && window.casoraPopup.close());
await page.waitForTimeout(1500);
const after = await probe();
await check('nach dem Schließen steht der Inhalt wie vorher', after && before.top != null && Math.abs(after.top - before.top) <= 2, { vorher: before.top, nachher: after && after.top });
await finish();
