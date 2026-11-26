// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/smart-row.js#_casoraEdges,_casoraFade,_casoraPaging
// Test round 26.11.2026 (d02-08): tablet 1024×768 landscape with touch (WebKit), Home of qa-arbeit. The tile row showed
// two page dots and a white veil over the right half of its last tile, although all tiles fit (last tile's right edge
// at 987 of 1024) and swiping moved nothing. Expected: a row whose tiles all fit has no dots and no edge fade.
// Home's tile row is cut to its first three tiles for the test (as in the report) and written back afterwards.
import { open, casoraDashboard, dashboard, check, need, finish, usePage, atFinish } from './lib.mjs';
import { ws } from '../ws.mjs';

const dash = await casoraDashboard((d) => d.url === (process.env.CASORA_QA_DASH || 'qa-arbeit')) || await casoraDashboard((d) => (d.config.views || []).length > 1);
await need('Casora dashboard with rooms', dash);
const c0 = await ws();
const saved = await c0.cmd({ type: 'lovelace/config', url_path: dash.url });
c0.close();
const save = async (config) => { const c = await ws(); try { await c.cmd({ type: 'lovelace/config/save', url_path: dash.url, config }); } finally { c.close(); } };
const cfg = JSON.parse(JSON.stringify(saved));
const rowOf = (x, d = 0) => {
  if (!x || typeof x !== 'object' || d > 8) return null;
  if (Array.isArray(x)) { for (const y of x) { const r = rowOf(y, d + 1); if (r) return r; } return null; }
  if (/smart-row/.test(String(x.type || '')) && Array.isArray(x.cards) && x.cards.length > 3) return x;
  return rowOf(x.cards, d + 1);
};
const row = rowOf(cfg.views[0].cards);
await need('Home tile row with more than three tiles', row);
row.cards = row.cards.slice(0, 3);
atFinish(() => save(saved));
await save(cfg);
const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const o = await open({ width: 1024, height: 768, safari: true, mobile: true, touch: true, userAgent: IPAD_UA, dark: false });
const pg = o.page; usePage(pg);
await dashboard(pg, dash.url + '/' + (dash.config.views[0].path || '0'), 3);
await pg.waitForTimeout(2500);
const rows = await pg.evaluate(() => window.__pierce('casora-smart-row').filter((r) => r.getBoundingClientRect().width > 100).map((r) => {
  const box = r.getBoundingClientRect();
  const kids = (r._wrappers || []).filter((w) => w.style.display !== 'none' && w.getBoundingClientRect().width > 0);
  const last = kids.length ? Math.max(...kids.map((w) => w.getBoundingClientRect().right)) : null;
  const first = kids.length ? Math.min(...kids.map((w) => w.getBoundingClientRect().left)) : null;
  const dots = r.shadowRoot && r.shadowRoot.getElementById('dots');
  const nDots = dots ? [...dots.children].filter((d) => d.getBoundingClientRect().width > 0).length : 0;
  const cs = getComputedStyle(r);
  return { mode: r.getAttribute('casora-row-mode'), n: kids.length, left: box.left, right: box.right, first, last,
    sw: r.scrollWidth, cw: r.clientWidth, sl: r.scrollLeft, ox: cs.overflowX, moreR: r.hasAttribute('casora-more-r'),
    mask: r.style.getPropertyValue('mask-image') || r.style.getPropertyValue('-webkit-mask-image') || '', dots: nDots };
}));
console.log(JSON.stringify(rows, null, 1));
await need('tile rows on Home', rows.length, rows);
for (const r of rows) {
  if (r.first == null || r.first < r.left - 1 || r.last > r.right + 1) continue;
  await check('a row whose tiles all fit has no page dots', r.dots < 2, r);
  await check('a row whose tiles all fit has no edge fade', !r.mask && !r.moreR, r);
}
await finish();
