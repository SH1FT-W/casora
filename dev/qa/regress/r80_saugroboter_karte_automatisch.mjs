// @zustand: arbeit
// @parallel: ui
// Gewünscht (07.10.2026, 1.1.0): Ist im Saugroboter-Popup das Feld „Karte“ leer (oder die eingetragene
// Entität gelöscht), sucht Casora die Karte selbst am Roboter (Roborock: image.* je Stockwerk, sonst
// camera.*_map). Im Testhaus hat die Saugroboter-Kachel keine Karte eingetragen; am Gerät hängt ein
// Kartenbild (Mock: durchsichtiger Rand, 4:3).
// Erwartet am Handy (390, hell + dunkel), Tablet quer und Desktop: Popup zeigt die gefundene Karte, das
// Bild ist geladen, das Seitenverhältnis bleibt, der Karteninhalt liegt ganz in der Fläche, die Fläche
// ganz im Popup, das Popup ist nicht breiter als das Fenster.
import { open, casoraDashboards, dashboard, check, need, finish } from './lib.mjs';

const all = await casoraDashboards();
const has = (d) => JSON.stringify(d.config).includes('casora_vacuum');
const desk = all.find((d) => !d.mobile && has(d) && !/entity_map/.test(JSON.stringify(d.config)));
const phone = all.find((d) => d.mobile && has(d) && !/entity_map/.test(JSON.stringify(d.config)));
await need('Dashboards mit Saugroboter-Kachel ohne Karte', desk && phone, all.map((d) => d.url));

const findVac = (pg) => pg.evaluate(() => {
  const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_vacuum')
    && x.getBoundingClientRect().width > 20);
  if (!b) return null;
  b.scrollIntoView({ block: 'center' });
  const r = b.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, entity: b._config.entity };
});

// Ging das Popup trotz allem nicht auf (09.10.2026 im Gate: Seite stand danach wieder auf „Zuhause“,
// unter Last lädt das Dashboard nach einem Verbindungsabbruch neu), den ganzen Weg einmal wiederholen.
async function openVac(page, d, mobile) {
  const at = await openVacOnce(page, d, mobile);
  if (at && !(await page.evaluate(() => !!(window.casoraPopup && window.casoraPopup.surface)).catch(() => false))) return openVacOnce(page, d, mobile);
  return at;
}
async function openVacOnce(page, d, mobile) {
  const view = (d.config.views || []).findIndex((v) => JSON.stringify(v).includes('casora_vacuum'));
  const path = (d.config.views[view] || {}).path || view;
  await dashboard(page, d.url + '/' + path, 3);
  let at = await findVac(page);
  if (!at && mobile) {
    const keys = await page.evaluate(() => { const n = window.__pierce('*').find((e) => e._rooms && typeof e._set === 'function' && e._bar);
      return n ? n._rooms.map((r) => r.key).filter((k) => /^room_/.test(k)) : []; }).catch(() => []);
    for (const k of keys) {
      await page.evaluate((x) => window._casoraFilter && window._casoraFilter.set(x), k);
      for (const t0 = Date.now(); !at && Date.now() - t0 < 6000;) { await page.waitForTimeout(500); at = await findVac(page); }
      if (at) break;
    }
  }
  if (!at) return null;
  // Unter Last kann der Tipp ins Leere gehen (Kachel rutscht noch, Seite noch nicht bedienbar): bis
  // zu 4 Mal tippen, jeweils mit neu gemessener Lage, und erst nochmal, wenn kein Popup aufging.
  const offen = () => page.evaluate(() => !!(window.casoraPopup && window.casoraPopup.surface)).catch(() => false);
  for (let t = 0; t < 4 && !(await offen()); t++) {
    at = (await findVac(page)) || at;
    if (mobile) await page.touchscreen.tap(at.x, at.y); else await page.mouse.click(at.x, at.y);
    for (let w = 0; w < 24 && !(await offen()); w++) await page.waitForTimeout(250);
  }
  await page.waitForFunction(() => window.__pierce('img[data-map]').some((i) => i.complete && i.naturalWidth > 0
    && i.getBoundingClientRect().width > 0 && getComputedStyle(i).opacity === '1'), null, { timeout: 45000 }).catch(() => {});   // Kamera-Bild unter Last (09.10.2026: 20 s zu kurz)
  await page.waitForTimeout(1200);
  return at;
}

const VIEWS = [
  ['Handy hell', { width: 390, height: 844, mobile: true, safari: true, scale: 2 }, phone, true],
  ['Handy dunkel', { width: 390, height: 844, mobile: true, safari: true, scale: 2, dark: true }, phone, true],
  ['Tablet quer', { width: 1180, height: 820, scale: 1 }, desk, false],
  ['Desktop', { width: 1600, height: 1000, scale: 1 }, desk, false],
];
for (const [tag, o, d, mobile] of VIEWS) {
  const { page } = await open({ ...o, theme: 'Casora' });
  const at = await openVac(page, d, mobile);
  await need(tag + ': Saugroboter-Kachel gefunden', at);
  const m = await page.evaluate((vac) => {
    const h = document.querySelector('home-assistant').hass;
    const want = window.casoraDevice && window.casoraDevice.vacuumMap(h, vac);
    const i = window.__pierce('img[data-map]').find((x) => x.getBoundingClientRect().width > 0);
    if (!i) return { want, img: null };
    const box = i.parentNode.getBoundingClientRect(), r = i.getBoundingClientRect();
    // Inhalt (nicht durchsichtige Pixel) des Bildes auf den Bildschirm umrechnen.
    const n = i.naturalWidth, nh = i.naturalHeight, cv = document.createElement('canvas');
    cv.width = n; cv.height = nh; const g = cv.getContext('2d'); g.drawImage(i, 0, 0);
    const px = g.getImageData(0, 0, n, nh).data; let x0 = n, y0 = nh, x1 = -1, y1 = -1;
    for (let y = 0; y < nh; y++) for (let x = 0; x < n; x++) if (px[(y * n + x) * 4 + 3] > 8) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const sx = r.width / n, sy = r.height / nh;
    const c = { l: r.left + x0 * sx, t: r.top + y0 * sy, r: r.left + (x1 + 1) * sx, b: r.top + (y1 + 1) * sy };
    const s = window.casoraPopup && window.casoraPopup.surface;
    const S = s ? s.getBoundingClientRect() : { left: 0, right: innerWidth };
    return { want, img: i.getAttribute('data-map'), ratioImg: r.width / r.height, ratioNat: n / nh,
      box: { l: box.left, t: box.top, r: box.right, b: box.bottom }, c, surf: { l: S.left, r: S.right }, vw: innerWidth,
      radius: getComputedStyle(i.parentNode).borderTopLeftRadius, bg: getComputedStyle(i.parentNode).backgroundColor };
  }, at.entity);
  await check(tag + ': gefundene Karte wird gezeigt', m.img && m.want && m.img === m.want, m);
  if (!m.img) continue;
  await check(tag + ': Seitenverhältnis erhalten', Math.abs(m.ratioImg / m.ratioNat - 1) < 0.02, m);
  await check(tag + ': Karteninhalt ganz in der Fläche', m.c.l >= m.box.l - 1 && m.c.r <= m.box.r + 1 && m.c.t >= m.box.t - 1 && m.c.b <= m.box.b + 1, m);
  await check(tag + ': Karte füllt die Fläche (nicht winzig)', Math.max((m.c.r - m.c.l) / (m.box.r - m.box.l), (m.c.b - m.c.t) / (m.box.b - m.box.t)) > 0.8, m);
  await check(tag + ': Fläche im Popup und Fenster', m.box.l >= m.surf.l - 1 && m.box.r <= m.surf.r + 1 && m.box.r <= m.vw, m);
  await check(tag + ': runde Ecken', parseFloat(m.radius) >= 8, m.radius);
}
await finish();
