// @zustand: arbeit
// @parallel: allein   (öffnet das Studio)
// @deckt: casora-panel.js#_phoneState
// #149: Split a carousel in the Studio with the phone preview showing, then Ctrl+Z: the carousel did not
// come back, the tiles stayed separate. Expected: Ctrl+Z restores the carousel, a second one undoes
// "Combine into carousel". Nothing is saved.
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
const phone = await page.evaluate(() => { const b = window.__pierce('[data-size="phone"]').find((x) => x.getBoundingClientRect().width > 0); if (!b) return false; b.click(); return true; });
await need('Vorschau „Handy“ wählbar', phone);
await page.waitForTimeout(2000);
const menuItem = async (re) => {
  await page.evaluate(() => { const d = window.__pierce('.rowmenu').find((b) => b.getBoundingClientRect().width > 0); d && d.click(); });
  await page.waitForTimeout(600);
  const it = await page.evaluate((src) => { const re = new RegExp(src); const x = window.__pierce('*').find((e) => e.children.length === 0 && re.test(e.textContent || '') && e.getBoundingClientRect().width > 0);
    if (!x) return null; const r = x.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, re);
  if (it) await page.mouse.click(it.x, it.y);
  return it;
};
const now = () => page.evaluate(() => { const p = window.__panel(), I = window.__casoraPanelInternals, r = p._state.compact.rooms[p._room];
  const c = r.tiles.find(I.isCarouselCard);
  return { n: r.tiles.length, carousels: r.tiles.filter(I.isCarouselCard).length, pages: c ? c.cards.length : 0,
    preview: window.__pierce('.card.map [data-mk]').length }; });
const until = async (fn, ms = 4000) => { const end = Date.now() + ms; let v; do { v = await now(); if (fn(v)) return v; await page.waitForTimeout(200); } while (Date.now() < end); return v; };

// Combine two tiles into a carousel.
await check('Menüeintrag „Zu Karussell zusammenfassen …“', await menuItem('Karussell zusammenfassen|Combine into carousel'));
await page.waitForTimeout(900);
await page.evaluate(async () => { const rows = window.__pierce('.askpicks .askpick'); rows.slice(0, 1).forEach((r) => r.click());
  await new Promise((q) => setTimeout(q, 200)); const ok = window.__pierce('.askacts button').find((b) => /Zusammenfassen|Combine/.test(b.textContent)); ok && ok.click(); });
const joined = await until((v) => v.carousels === 1);
await check('Zwei Kacheln → ein Karussell', joined.carousels === 1 && joined.pages === 2, joined);
await page.waitForTimeout(1200);

// Split it, then Ctrl+Z (keyboard, focus on the page body like a user after the menu).
await check('Menüeintrag „Karussell auflösen“', await menuItem('Karussell auflösen|Split carousel'));
const split = await until((v) => v.carousels === 0);
await check('Aufgelöst: kein Karussell', split.carousels === 0 && split.n === room.n, split);
await page.waitForTimeout(1200);
await page.keyboard.press('Control+z');
const undone = await until((v) => v.carousels === 1);
await check('Strg+Z nach „Karussell auflösen“: Karussell wieder da', undone.carousels === 1 && undone.pages === 2 && undone.n === joined.n, undone);
await page.waitForTimeout(1200);
// One more Ctrl+Z: back to the three separate tiles from before "Combine".
await page.keyboard.press('Control+z');
const undone2 = await until((v) => v.carousels === 0);
await check('Strg+Z nach „Zusammenfassen“: Kacheln wieder einzeln', undone2.carousels === 0 && undone2.n === room.n, undone2);
await check('keine Fehler in der Konsole', !errs.length, errs);
await finish();
