// @zustand: arbeit
// @parallel: allein   (öffnet das Studio)
// 1.4 (Wunsch 12.10.2026): Karussell im Studio – als Kachelart anlegen, Kacheln zusammenfassen, Seiten
// bearbeiten, auflösen. Erwartet: „Karussell …“ im Hinzufügen-Dialog, „Zu Karussell zusammenfassen …“ im
// Kachel-Menü, Editor mit Seitenliste, Auflösen gibt die Kacheln zurück. Nichts wird gespeichert.
import { open, studioDashboard, studio, check, need, finish } from './lib.mjs';

const dash = await studioDashboard();
await need('ein Dashboard fürs Studio', dash);
const { page } = await open({ width: 1440, height: 900, theme: 'Casora', dark: false });
const errs = []; page.on('pageerror', (e) => errs.push(String(e.message)));
await studio(page, dash);
await page.waitForTimeout(1200);
const room = await page.evaluate(() => { const p = window.__panel(), I = window.__casoraPanelInternals, rooms = p._state.compact.rooms;
  const i = rooms.findIndex((r, k) => k > 0 && (r.tiles || []).filter(I.isPageTile).length >= 3); if (i < 0) return null;
  p._room = i; p._renderForm(); const t = rooms[i].tiles.find(I.isPageTile); p._select({ group: 'tiles', key: p._tileKey(t) });
  return { i, n: rooms[i].tiles.length }; });
await need('Raum mit drei einfachen Kacheln', room);
await page.waitForTimeout(1000);
// Kachel-Menü → „Zu Karussell zusammenfassen …“
await page.evaluate(() => { const d = window.__pierce('.rowmenu').find((b) => b.getBoundingClientRect().width > 0); d && d.click(); });
await page.waitForTimeout(600);
const item = await page.evaluate(() => { let it = window.__pierce('*').find((x) => x.children.length === 0 && /Karussell zusammenfassen|Combine into carousel/.test(x.textContent || '') && x.getBoundingClientRect().width > 0);
  if (!it) return null; const r = it.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await check('Menüeintrag „Zu Karussell zusammenfassen …“', item);
if (item) {
  await page.mouse.click(item.x, item.y); await page.waitForTimeout(900);
  await page.evaluate(async () => { const rows = window.__pierce('.askpicks .askpick'); rows.slice(0, 2).forEach((r) => r.click());
    await new Promise((q) => setTimeout(q, 200)); const ok = window.__pierce('.askacts button').find((b) => /Zusammenfassen|Combine/.test(b.textContent)); ok && ok.click(); });
  await page.waitForTimeout(1500);
}
const joined = await page.evaluate(() => { const p = window.__panel(), I = window.__casoraPanelInternals, r = p._state.compact.rooms[p._room];
  const c = r.tiles.find(I.isCarouselCard); return { n: r.tiles.length, pages: c ? c.cards.length : 0, id: c ? I.carouselId(c) : '',
    rows: window.__pierce('.carpages .carrow').length, title: (window.__pierce('.binsp h2, .bhead .btitle, .insphead b')[0] || {}).textContent || '' }; });
await check('Drei Kacheln → ein Karussell mit 3 Seiten (mit Kennung)', joined.pages === 3 && joined.n === room.n - 2 && /^n/.test(joined.id), joined);
await check('Editor zeigt die Seitenliste', joined.rows === 3, joined);
// Auflösen über das Menü
await page.evaluate(() => { const d = window.__pierce('.rowmenu').find((b) => b.getBoundingClientRect().width > 0); d && d.click(); });
await page.waitForTimeout(600);
const split = await page.evaluate(() => { const it = window.__pierce('*').find((x) => x.children.length === 0 && /Karussell auflösen|Split carousel/.test(x.textContent || '') && x.getBoundingClientRect().width > 0);
  if (!it) return null; const r = it.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await check('Menüeintrag „Karussell auflösen“', split);
if (split) { await page.mouse.click(split.x, split.y); await page.waitForTimeout(1200); }
const back = await page.evaluate(() => { const p = window.__panel(), I = window.__casoraPanelInternals, r = p._state.compact.rooms[p._room];
  return { n: r.tiles.length, carousels: r.tiles.filter(I.isCarouselCard).length }; });
await check('Aufgelöst: wieder drei Kacheln, kein Karussell', back.n === room.n && back.carousels === 0, back);
// Kachelart „Karussell“ im Hinzufügen-Dialog
await page.evaluate(() => window.__panel()._uxAdd());
await page.waitForTimeout(700);
const links = await page.evaluate(() => window.__pierce('.uxadd .uxlink').map((b) => b.textContent));
await check('„Karussell …“ im Hinzufügen-Dialog', links.some((l) => /Karussell|Carousel/.test(l)), links);
await page.keyboard.press('Escape');
await check('keine Fehler in der Konsole', !errs.length, errs);
await finish();
