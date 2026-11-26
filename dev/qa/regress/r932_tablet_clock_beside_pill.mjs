// @zustand: arbeit
// @parallel: ja
// @deckt: custom_components/casora/scripts/local/01-basis.js#_casoraPillLeft,_casoraClockRight,_casoraPillPlace,_casoraTimeGuard
// d05-09 (review 26.11.2026, owner: the clock beside the room pill, not under it): at 834 × 1194 and 1024 × 768 with a
// mouse the room pill lay over the clock and the clock was hidden. Now the clock is visible and the pill starts after it.
import { open, dashboard, casoraDashboards, check, need, finish, usePage } from './lib.mjs';

const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && d.url === 'qa-arbeit') || all.find((d) => !d.mobile);
await need('ein Casora-Dashboard', desk, all.map((d) => d.url));

for (const [w, h] of [[834, 1194], [800, 1100], [1280, 800]]) {
  const { page } = await open({ width: w, height: h, dark: true, theme: 'Casora' });
  usePage(page);
  await dashboard(page, desk.url);
  await page.waitForTimeout(2500);   // pill placement (400 ms) and clock guard (700 ms) settle
  const m = await page.evaluate(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none'; };
    const time = window.__pierce('#time').find(vis);
    const host = window.__pierce('casora-nav-bar').find((b) => b.isConnected);
    const bar = host && host.shadowRoot && host.shadowRoot.querySelector('.bar');
    const t = time && time.getBoundingClientRect(), b = bar && bar.getBoundingClientRect();
    return { time: t ? { l: Math.round(t.left), r: Math.round(t.right), y: Math.round(t.top) } : null,
      bar: b ? { l: Math.round(b.left), r: Math.round(b.right), y: Math.round(b.top) } : null };
  });
  await check(w + '×' + h + ': Uhr sichtbar', !!m.time, m);
  await check(w + '×' + h + ': Raumleiste beginnt rechts neben der Uhr', !!m.time && !!m.bar && m.bar.l >= m.time.r + 8, m);
  await page.context().close();
}
await finish();
