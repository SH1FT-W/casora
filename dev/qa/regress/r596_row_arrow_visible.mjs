// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/smart-row.js#_casoraFade
// User test 07.11.2026, desktop: the next-arrow of a room's tile row was barely visible. The row („fade“) masks its
// own host towards the edge and the arrow sits inside that host, right in the faded edge – it was drawn at about
// 12 %. Expected: the shown arrow keeps its contrast (chevron against its circle ≥ 3 : 1, design-regeln §11), light
// and dark.
import { open, casoraDashboard, dashboard, check, need, finish, usePage } from './lib.mjs';

const dash = await casoraDashboard((d) => !d.mobile);
await need('ein Casora-Desktop-Dashboard', dash);

for (const dark of [false, true]) {
  const mode = dark ? 'dunkel' : 'hell';
  const { page } = await open({ width: 1440, height: 900, dark });
  usePage(page);
  let box = null;
  for (const v of (dash.config.views || []).map((x, i) => x.path || String(i)).slice(1)) {
    await dashboard(page, dash.url + '/' + v, 3);
    box = await page.evaluate(() => {
      const row = window.__pierce('casora-smart-row').find((r) => r.hasAttribute('casora-more-r') && r.shadowRoot
        && r.shadowRoot.getElementById('arrows') && getComputedStyle(r.shadowRoot.getElementById('arrows')).display !== 'none');
      if (!row) return null;
      row.scrollIntoView({ block: 'center' });
      return true;
    });
    if (box) break;
  }
  await need(`Kachelreihe mit Pfeil rechts (${mode})`, box);
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => {
    const row = window.__pierce('casora-smart-row').find((x) => x.hasAttribute('casora-more-r'));
    const q = row.shadowRoot.querySelector('#arrows > .r').getBoundingClientRect();
    return { x: q.x, y: q.y, w: q.width, h: q.height };
  });
  const png = await page.screenshot({ clip: { x: r.x + 8, y: r.y + 8, width: r.w - 16, height: r.h - 16 } });
  const m = await page.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
    const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0);
    const d = cx.getImageData(0, 0, cv.width, cv.height).data;
    const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    const L = [];
    for (let i = 0; i < d.length; i += 4) L.push(0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]));
    L.sort((a, b) => a - b);
    const lo = L[0], hi = L[L.length - 1], med = L[L.length >> 1];
    // Ink = the pixel furthest from the circle's own colour (median).
    const ink = Math.abs(lo - med) > Math.abs(hi - med) ? lo : hi;
    return Math.round(((Math.max(ink, med) + 0.05) / (Math.min(ink, med) + 0.05)) * 100) / 100;
  }, png.toString('base64'));
  await check(`Pfeil der Kachelreihe hebt sich ≥ 3 : 1 ab (${mode})`, m >= 3, { ratio: m });
}
await finish();
