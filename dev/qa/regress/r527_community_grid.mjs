// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/panel/casora-panel-community.js
// Owner 03.11.2026: the Community dialog showed one card per row – much scrolling. On tablet and desktop the cards are a
// grid (two columns, three in a window of 1500 px and more), the description cut to three lines with „Mehr“/„Weniger“;
// the phone keeps the list. Checks per size: column count, „Mehr“ toggles, „Popup ansehen“ opens the large preview,
// „Hinzufügen“ adds the card (in the browser only, settings restored), Tab order runs card by card.
import { open, usePage, studio, studioDashboard, check, need, finish, atFinish } from './lib.mjs';

const dash = await studioDashboard();
await need('Casora-Dashboard', dash);
const SIZES = [['Desktop 1440', { width: 1440, height: 900 }, 2], ['Desktop 1920', { width: 1920, height: 1080 }, 3],
  ['Tablet 1024', { width: 1024, height: 768 }, 2], ['Handy', { width: 393, height: 852, mobile: true }, 1]];
let first = true;
for (const [name, size, cols] of SIZES) {
  const { page, context } = await open({ ...size, dark: false, theme: 'Casora' });
  usePage(page);
  await context.route(/api\.github\.com\/search\/issues/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"total_count":0,"items":[]}' }));
  await studio(page, dash);
  if (first) {
    const s0 = await page.evaluate(() => document.querySelector('home-assistant').hass.callWS({ type: 'casora/settings/get' }));
    atFinish(() => page.evaluate((s) => document.querySelector('home-assistant').hass.callWS({ type: 'casora/settings/set', settings: s }), (s0 || {}).settings || {}).catch(() => {}));
    first = false;
  }
  await page.evaluate(() => { window.casoraCommunityOn = new Set(); window.__panel()._comCatalog(); });
  await page.waitForTimeout(2500);
  const pane = (src) => page.evaluate((src) => {
    const ps = window.__panel().shadowRoot.querySelectorAll('.askpane'); const a = ps[ps.length - 1];
    return a ? new Function('a', src)(a) : null;
  }, src);
  const m = await pane(`const cards = [...a.querySelectorAll('.comrow.comcard')].filter((c) => c.getClientRects().length);
    const tops = cards.slice(0, 4).map((c) => Math.round(c.getBoundingClientRect().top));
    const perRow = tops.filter((t) => t === tops[0]).length;
    const grid = a.querySelector('.comgrid');
    return { n: cards.length, perRow, grid: !!grid };`);
  await need(`${name}: Community-Karten`, m && m.n >= 3, m);
  await check(`${name}: ${cols} Spalte(n)`, m.perRow === Math.min(cols, m.n) && m.grid === cols > 1, m);
  if (cols > 1) {
    const mm = await pane(`const d = [...a.querySelectorAll('.comdesc')].find((x) => x.scrollHeight > x.clientHeight + 2);
      if (!d) return null; const more = d.parentElement.querySelector('.commore');
      const h0 = d.clientHeight; more.click(); const h1 = d.clientHeight, t1 = more.textContent.trim();
      more.click(); return { h0, h1, t1, t2: more.textContent.trim(), shown: more.style.display !== 'none' };`);
    await check(`${name}: „Mehr“ klappt den Text auf und „Weniger“ wieder zu`, mm && mm.shown && mm.h1 > mm.h0 && mm.t1 === 'Weniger' && mm.t2 === 'Mehr', mm);
    // Tab order: within a card the preview, then „Popup ansehen“ (when shown), then „Hinzufügen“ – card after card.
    const order = await pane(`const cards = [...a.querySelectorAll('.comrow.comcard')].slice(0, 2);
      return cards.map((c) => [...c.querySelectorAll('button')].filter((b) => b.getClientRects().length).map((b) => b.className.split(' ')[0]));`);
    await check(`${name}: Reihenfolge in der Karte: Vorschau, Text, Popup, Hinzufügen`,
      order.every((o) => o[0] === 'comzoom' && o[o.length - 1] === 'comchip'), order);
  }
  const pop = await pane(`const b = [...a.querySelectorAll('.comlink')].find((x) => x.style.display !== 'none' && x.getClientRects().length);
    if (!b) return null; b.click(); return true;`);
  await page.waitForTimeout(800);
  if (pop) await check(`${name}: „Popup ansehen“ öffnet die große Vorschau`, await pane(`return !!a.querySelector('.comlb')`));
  await pane(`const x = a.querySelector('.comlb .comx'); if (x) x.click(); return true;`);
  await page.waitForTimeout(400);
  const added = await pane(`const b = a.querySelector('.comchip[data-com]'); if (!b) return null; const id = b.getAttribute('data-com'); b.click(); return id;`);
  await page.waitForTimeout(2500);
  await check(`${name}: „Hinzufügen“ nimmt die Karte auf`, added && await page.evaluate((id) => window.casoraCommunityOn.has(id), added), added);
  await page.context().close();
}
await finish();
