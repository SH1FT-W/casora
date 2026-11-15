// @zustand: arbeit
// @parallel: allein
// @deckt: custom_components/casora/scripts/filter-overlay.js#_ensureDashboardHeader,_headBSticky,_restoreBadgeRow,_discoverElements
// Fixed head on the phone's Home (1B): the badges wobbled on the owner's iPhone while the page scrolled (beta
// 26.11.28b4); the head itself stayed put. Cause: the badge row's button-card is position: sticky (top -200px) in
// its own stylesheet, and the 1B head made the wrapper around it sticky too. Sticky inside sticky is positioned by
// iOS's scrolling thread one layer at a time and shakes there. While the fixed head holds the row, nothing between
// the wrapper and the badges may be sticky; the badges keep their place under the head while the page scrolls in
// small steps; no style writes to the row while scrolling; the row is still found again after a re-render.
import { open, usePage, studio, casoraDashboard, dashboard, check, need, finish, atFinish } from './lib.mjs';
import { ws } from '../ws.mjs';

const d = await casoraDashboard((x) => x.url === 'qa-arbeit');
await need('dashboard with a phone twin', d && d.phone, d && d.url);
let c = await ws();
const [desk0, phone0] = [await c.cmd({ type: 'lovelace/config', url_path: d.url }), await c.cmd({ type: 'lovelace/config', url_path: d.phone.url })];
c.close();
atFinish(async () => { const c2 = await ws(); await c2.cmd({ type: 'lovelace/config/save', url_path: d.url, config: desk0 }); await c2.cmd({ type: 'lovelace/config/save', url_path: d.phone.url, config: phone0 }); c2.close(); });

{
  const { page, browser } = await open({ width: 1440, height: 900, dark: false, theme: 'Casora' });
  usePage(page);
  await studio(page, d.url);
  const ok = await page.evaluate(async () => {
    const p = window.__panel(), V = p._state.compact.rooms[0].variables;
    V.casora_greeting = 'time';
    delete V.casora_greeting_next;
    return p._save();
  });
  await need('greeting saved', ok);
  await page.waitForTimeout(1000);
  await browser.close();
}
// Long enough to scroll well past the greeting (as r830).
c = await ws();
const phone = await c.cmd({ type: 'lovelace/config', url_path: d.phone.url });
const rows = [];
const walk = (o) => { if (!o || typeof o !== 'object') return; if (o.type === 'custom:casora-smart-row') rows.push(o); (o.cards || []).forEach(walk); };
(phone.views[0].cards || []).forEach(walk);
const fav = rows.find((r) => (r.cards || []).some((k) => [].concat(k.template || []).includes('casora_light')));
await need('favourites row with a light', fav, rows.length);
const light = fav.cards.find((k) => [].concat(k.template || []).includes('casora_light'));
for (let i = 0; i < 40; i++) fav.cards.push(JSON.parse(JSON.stringify(light)));
await c.cmd({ type: 'lovelace/config/save', url_path: d.phone.url, config: phone });
c.close();

const HOME = d.phone.url + '/' + (d.phone.config.views[0].path || '0');

// Scrolls in small steps (whole and fractional pixels), one frame each, and measures head, wrapper and badges.
const sweep = (pg, from, to, step) => pg.evaluate(async ([from, to, step]) => {
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const head = (window.__pierce('.casora-head-b') || [])[0];
  const badge = window.__pierce('button-card').find((b) => [].concat((b._config || {}).template || []).includes('casora_mobile_filter_badges') && b.getBoundingClientRect().height > 0);
  let wrap = badge;
  while (wrap && !(wrap.classList && wrap.classList.contains('card-wrapper'))) wrap = wrap.parentNode || wrap.host;
  if (!head || !badge || !wrap) return { err: 'missing', head: !!head, badge: !!badge, wrap: !!wrap };
  const pills = [];
  const dig = (n, dd) => { if (!n || dd > 10) return; for (const k of n.children || []) { if (k.tagName === 'BUTTON-CARD') { const r = k.getBoundingClientRect(); if (r.height >= 30 && r.height <= 60 && r.width > 0 && r.left < innerWidth - 20) { pills.push(k); continue; } } if (k.shadowRoot) dig(k.shadowRoot, dd + 1); dig(k, dd + 1); } };
  dig(badge.shadowRoot && badge.shadowRoot.querySelector('#badges'), 0);
  // Sticky layers between the badges and the wrapper (the wrapper itself excluded).
  const nested = new Set();
  for (const p of pills) {
    for (let n = p; n && n !== wrap; n = n.parentNode || n.host) {
      if (n.nodeType === 1 && /sticky/.test(getComputedStyle(n).position)) nested.add(n.tagName.toLowerCase() + (n.id ? '#' + n.id : ''));
    }
  }
  // Style writes to the row while scrolling.
  const writes = [];
  const mo = new MutationObserver((ms) => ms.forEach((m) => writes.push(m.target.tagName.toLowerCase() + ':' + (m.target.getAttribute('style') || '').slice(0, 80))));
  for (const n of [wrap, badge]) mo.observe(n, { attributes: true, attributeFilter: ['style'] });
  const out = [];
  for (let y = from; y <= to; y += step) {
    window.scrollTo(0, y);
    await frame();
    const h = head.getBoundingClientRect(), w = wrap.getBoundingClientRect();
    out.push({ y: scrollY, head: h.top, wrap: w.top - h.top, pills: pills.map((p) => p.getBoundingClientRect().top - h.top) });
  }
  await frame();
  mo.disconnect();
  return { out, nested: [...nested], writes: writes.slice(0, 8), nWrites: writes.length, n: pills.length, pos: getComputedStyle(wrap).position };
}, [from, to, step]);
const spread = (a) => Math.max(...a) - Math.min(...a);

const { page: pg } = await open({ width: 393, height: 852, mobile: true, scale: 3, dark: false, safari: true, theme: 'Casora' });
usePage(pg);
await dashboard(pg, HOME, 3);
await pg.waitForFunction(() => (window.__pierce('.casora-head-b') || []).length > 0, null, { timeout: 15000 }).catch(() => {});
await pg.waitForTimeout(800);
await pg.evaluate(() => { window.scrollTo(0, 500); window.dispatchEvent(new Event('scroll')); });
await pg.waitForTimeout(700);

const s = await sweep(pg, 500, 800, 1.5);
await need('head, badge row and wrapper found', !s.err, s);
await need('badges on screen', s.n >= 2, s.n);
await check('row held by the fixed head (wrapper sticky)', s.pos === 'sticky', s.pos);
await check('no sticky layer inside the sticky wrapper (iOS shakes nested sticky)', s.nested.length === 0, s.nested);
await check('head stays at the top while scrolling', spread(s.out.map((o) => o.head)) < 0.5, s.out.map((o) => o.head));
await check('wrapper stays under the head while scrolling', spread(s.out.map((o) => o.wrap)) < 0.5, s.out.map((o) => o.wrap));
const moved = [];
for (let i = 0; i < s.n; i++) { const a = s.out.map((o) => o.pills[i]); if (spread(a) >= 0.5) moved.push({ i, min: Math.min(...a), max: Math.max(...a) }); }
await check('badges keep their place under the head while scrolling', moved.length === 0, moved);
await check('no style writes to the badge row while scrolling', s.nWrites === 0, s.writes);

// Re-render (HA rebuilds the cards): the head finds the row again and holds it the same way.
await pg.evaluate(() => {
  const o = window.__pierce('casora-filter-overlay').find((x) => x._badgeRowWrapper);
  if (o) { o._headerEl = null; o._discoverElements(); }
});
await pg.evaluate(() => { window.scrollTo(0, 650); window.dispatchEvent(new Event('scroll')); });
await pg.waitForTimeout(600);
const found = await pg.evaluate(() => window.__pierce('casora-filter-overlay').some((x) => x._badgeRowWrapper && x._badgeRowWrapper.style.position === 'sticky'));
await check('badge row found again after a re-render', found);
const s2 = await sweep(pg, 650, 750, 2);
await check('after the re-render: no sticky layer inside the wrapper', !s2.err && s2.nested.length === 0, s2.nested || s2);

await finish();
