// @zustand: arbeit
// @parallel: allein
// @deckt: custom_components/casora/scripts/filter-overlay.js#_ensureDashboardHeader,_headBFix,_headBFixPlace,_headBRow,_headBWanted,_headBRowFree,_headBScreen,_restoreBadgeRow,_discoverElements
// Fixed head on the phone's Home (1B): the badges wobbled on the owner's iPhone (HA app) while the page scrolled,
// worst when scrolling up; the head itself stayed put. Beta 26.11.28b5 removed the sticky card inside the sticky
// wrapper, which did not help on the device: iOS places a sticky layer it cannot hand to its scrolling thread one
// frame late. Now nothing in the row is sticky: while the row's place in the flow (its wrapper, the placeholder)
// is above the stick line, the card is position: fixed at the line, like the head; below the line it is back in
// the flow. Checked here: no sticky layer anywhere in the head or the row, the badges stand exactly still while
// held (1 px steps, both directions), no jump at the swap, the page keeps its length, no style writes and hardly
// any layout reads while held, the row is back in the flow at the top, sideways scrolling survives the swap,
// turning the phone and a re-render work.
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

// Finds head, card, wrapper and badges once (window.__hb) and says what holds the row. Rects are read through
// the saved original, so the counter of the page's own layout reads (see below) does not count the test.
const find = (pg) => pg.evaluate(() => {
  const G = window.__hbG || (window.__hbG = Element.prototype.getBoundingClientRect);
  const head = (window.__pierce('.casora-head-b') || [])[0];
  const card = window.__pierce('button-card').find((b) => [].concat((b._config || {}).template || []).includes('casora_mobile_filter_badges') && G.call(b).height > 0);
  let wrap = card;
  while (wrap && !(wrap.classList && wrap.classList.contains('card-wrapper'))) wrap = wrap.parentNode || wrap.host;
  if (!head || !card || !wrap) return { err: 'missing', head: !!head, card: !!card, wrap: !!wrap };
  const pills = [];
  const dig = (n, dd) => { if (!n || dd > 10) return; for (const k of n.children || []) { if (k.tagName === 'BUTTON-CARD') { const r = G.call(k); if (r.height >= 30 && r.height <= 60 && r.width > 0 && r.left < innerWidth - 20) { pills.push(k); continue; } } if (k.shadowRoot) dig(k.shadowRoot, dd + 1); dig(k, dd + 1); } };
  const scroller = card.shadowRoot && card.shadowRoot.querySelector('#badges');
  dig(scroller, 0);
  window.__hb = { G, head, card, wrap, pills, scroller };
  return { n: pills.length };
});
// Position of everything that could hold the row, and what would turn "fixed" into "fixed to an ancestor".
const layers = (pg) => pg.evaluate(() => {
  const { G, head, card, wrap, pills } = window.__hb;
  const name = (n) => n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (typeof n.className === 'string' && n.className ? '.' + n.className.split(' ')[0] : '');
  // Sticky anywhere from the badges up to the document, and in the head.
  const sticky = new Set();
  for (const start of [...pills, head]) {
    for (let n = start; n; n = n.parentNode || n.host) {
      if (n.nodeType === 1 && /sticky/.test(getComputedStyle(n).position)) sticky.add(name(n));
    }
  }
  // Ancestors of the card that would be the containing block of a fixed box.
  const blocks = [];
  for (let n = card.parentNode || card.host; n; n = n.parentNode || n.host) {
    if (n.nodeType !== 1) continue;
    const cs = getComputedStyle(n);
    const why = [];
    if (cs.transform && cs.transform !== 'none') why.push('transform');
    if (cs.translate && cs.translate !== 'none') why.push('translate');
    if (cs.scale && cs.scale !== 'none') why.push('scale');
    if (cs.rotate && cs.rotate !== 'none') why.push('rotate');
    if (cs.filter && cs.filter !== 'none') why.push('filter');
    if (cs.perspective && cs.perspective !== 'none') why.push('perspective');
    const bf = cs.backdropFilter || cs.webkitBackdropFilter;
    if (bf && bf !== 'none') why.push('backdrop-filter');
    if (/layout|paint|strict|content/.test(cs.contain || '')) why.push('contain:' + cs.contain);
    if (/transform|filter|perspective/.test(cs.willChange || '')) why.push('will-change:' + cs.willChange);
    if (cs.containerType && cs.containerType !== 'normal') why.push('container-type');
    if (cs.contentVisibility && cs.contentVisibility !== 'visible') why.push('content-visibility');
    if (why.length) blocks.push(name(n) + ' (' + why.join(', ') + ')');
  }
  const cr = G.call(card), wr = G.call(wrap), hr = G.call(head);
  return {
    sticky: [...sticky], blocks,
    card: { pos: getComputedStyle(card).position, t: cr.top, l: cr.left, w: cr.width, h: cr.height, left: card.style.left, width: card.style.width, v: card.style.getPropertyValue('--casora-badge-row-pos') },
    wrap: { pos: getComputedStyle(wrap).position, t: wr.top, l: wr.left, w: wr.width, h: wr.height, mh: wrap.style.minHeight, z: getComputedStyle(wrap).zIndex },
    head: { pos: getComputedStyle(head).position, t: hr.top, op: parseFloat(getComputedStyle(head).opacity) },
    y: scrollY, sh: document.scrollingElement.scrollHeight, sw: document.scrollingElement.scrollWidth, iw: innerWidth,
    sl: window.__hb.scroller ? window.__hb.scroller.scrollLeft : null,
  };
});
// Scrolls in steps (step < 0: upwards), one frame each. Per step: where the placeholder, the card and the badges
// are. Counts style writes to head, wrapper and card, text writes to the head and the page's own layout reads.
const sweep = (pg, from, to, step) => pg.evaluate(async ([from, to, step]) => {
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const { G, head, card, wrap, pills } = window.__hb;
  const writes = [], text = [];
  const mo = new MutationObserver((ms) => ms.forEach((m) => {
    if (m.type === 'attributes') writes.push(m.target.tagName.toLowerCase() + ':' + (m.target.getAttribute('style') || '').slice(0, 90));
    else text.push(m.type);
  }));
  for (const n of [wrap, card, head]) mo.observe(n, { attributes: true, attributeFilter: ['style'] });
  mo.observe(head, { childList: true, characterData: true, subtree: true });
  const reads = { wrap: 0, head: 0, other: 0, veil: 0 };
  const gcs = window.getComputedStyle;
  Element.prototype.getBoundingClientRect = function () { if (this === wrap) reads.wrap++; else if (this === head) reads.head++; else reads.other++; return G.call(this); };
  window.getComputedStyle = function (e, p) { if (p) reads.veil++; return gcs.call(window, e, p); };
  const out = [];
  const t0 = performance.now();
  try {
    const n = Math.round(Math.abs(to - from) / Math.abs(step));
    for (let i = 0; i <= n; i++) {
      window.scrollTo(0, from + i * step);
      await frame();
      const h = G.call(head), w = G.call(wrap);
      out.push({ y: scrollY, head: h.top, wrap: w.top, wrapH: w.height, card: G.call(card).top, pos: gcs.call(window, card).position,
        pills: pills.map((p) => G.call(p).top), sh: document.scrollingElement.scrollHeight });
    }
    await frame();
  } finally {
    mo.disconnect();
    Element.prototype.getBoundingClientRect = G;
    window.getComputedStyle = gcs;
  }
  return { out, writes: writes.slice(0, 8), nWrites: writes.length, nText: text.length, reads, steps: out.length, ms: performance.now() - t0 };
}, [from, to, step]);
const spread = (a) => Math.max(...a) - Math.min(...a);
const scrollTo = async (pg, y) => { await pg.evaluate((y) => { window.scrollTo(0, y); window.dispatchEvent(new Event('scroll')); }, y); await pg.waitForTimeout(600); };

const { page: pg } = await open({ width: 393, height: 852, mobile: true, scale: 3, dark: false, safari: true, theme: 'Casora' });
usePage(pg);
await dashboard(pg, HOME, 3);
await pg.waitForFunction(() => (window.__pierce('.casora-head-b') || []).length > 0, null, { timeout: 15000 }).catch(() => {});
await pg.waitForTimeout(800);
await scrollTo(pg, 0);
const f = await find(pg);
await need('head, badge row and wrapper found', !f.err, f);
await need('badges on screen', f.n >= 2, f.n);

// At the top: the row lies in the flow.
const top = await layers(pg);
const stick = top.head.t + 44;
const off = top.card.t - top.wrap.t;
await check('top: the row is in the flow (not fixed, not sticky)', top.card.pos === 'relative' && top.wrap.pos !== 'sticky' && !top.card.left && !top.card.width && !top.wrap.mh, [top.card, top.wrap]);
await check('top: no sticky layer in the head or the row', top.sticky.length === 0, top.sticky);
await check('no ancestor of the row would capture a fixed box (transform, filter, contain …)', top.blocks.length === 0, top.blocks);

// Held: fixed at the stick line, exactly where it was in the flow sideways.
await scrollTo(pg, 600);
const held = await layers(pg);
await check('held: the card is position fixed', held.card.pos === 'fixed', held.card);
await check('held: no sticky layer in the head or the row (iOS shakes sticky)', held.sticky.length === 0, held.sticky);
await check('held: the row sits at the stick line under the head (44 px)', Math.abs(held.card.t - (stick + off)) < 0.5 && held.head.op === 1, [held.card.t, stick, off, held.head]);
await check('held: same left edge and width as in the flow', Math.abs(held.card.l - top.card.l) < 0.5 && Math.abs(held.card.w - top.card.w) < 0.5 && Math.abs(held.card.h - top.card.h) < 0.5, [held.card, top.card]);
await check('held: the placeholder keeps the row\'s height in the flow', Math.abs(held.wrap.h - top.wrap.h) < 0.5 && held.wrap.t < stick, [held.wrap, top.wrap]);
await check('held: the page keeps its length', held.sh === top.sh, [held.sh, top.sh]);
await check('held: no sideways scrolling', held.sw <= held.iw, [held.sw, held.iw]);

// 1 px steps through the swap, down and up again. The swap is where the placeholder's top crosses the line.
const ySwap = Math.round(top.wrap.t - stick);
await need('the row reaches the line after some scrolling', ySwap > 20, ySwap);
for (const [dir, from, to] of [['down', Math.max(0, ySwap - 30), ySwap + 60], ['up', ySwap + 60, Math.max(0, ySwap - 30)]]) {
  await scrollTo(pg, from);
  const s = await sweep(pg, from, to, dir === 'down' ? 1 : -1);
  const o = s.out;
  const both = o.some((x) => x.wrap > stick + 1) && o.some((x) => x.wrap < stick - 1);
  await check(`${dir}: the sweep crosses the swap`, both && o.some((x) => x.pos === 'fixed') && o.some((x) => x.pos !== 'fixed'), [o[0], o[o.length - 1]]);
  await check(`${dir}: the head stays at the top`, spread(o.map((x) => x.head)) < 0.01, spread(o.map((x) => x.head)));
  // In the flow the badges follow the page, held they stand at the line: never off by half a pixel, so no jump.
  const pOff = o[dir === 'down' ? 0 : o.length - 1].pills.map((p, i) => p - o[dir === 'down' ? 0 : o.length - 1].wrap);
  const bad = [];
  o.forEach((x, k) => x.pills.forEach((p, i) => { const want = Math.max(x.wrap, stick) + pOff[i]; if (Math.abs(p - want) >= 0.5) bad.push({ k, y: x.y, i, p, want, pos: x.pos }); }));
  await check(`${dir}: badges where the flow or the line puts them at every step (no jump at the swap)`, bad.length === 0, bad.slice(0, 4));
  // Across the swap the badges never move more than the page did, and never against it.
  const jumps = [];
  for (let k = 1; k < o.length; k++) {
    const dy = o[k].y - o[k - 1].y;
    o[k].pills.forEach((p, i) => { const dp = p - o[k - 1].pills[i]; if (Math.abs(dp) > Math.abs(dy) + 0.01 || dp * dy > 0.0001) jumps.push({ k, dy, dp, i }); });
  }
  await check(`${dir}: no step moves the badges more than the page moved`, jumps.length === 0, jumps.slice(0, 4));
  const fixed = o.filter((x) => x.wrap <= stick);
  const still = [];
  for (let i = 0; i < f.n; i++) { const a = fixed.map((x) => x.pills[i]); if (spread(a) > 0.01) still.push({ i, min: Math.min(...a), max: Math.max(...a) }); }
  await check(`${dir}: held badges stand exactly still (${fixed.length} steps)`, fixed.length > 20 && still.length === 0 && fixed.every((x) => x.pos === 'fixed'), still);
  await check(`${dir}: in the flow below the line the card is not fixed`, o.filter((x) => x.wrap > stick).every((x) => x.pos === 'relative'), o.filter((x) => x.wrap > stick).map((x) => x.pos));
  await check(`${dir}: the swap changes neither the page's length nor the placeholder's height`, spread(o.map((x) => x.sh)) === 0 && spread(o.map((x) => x.wrapH)) < 0.01, [spread(o.map((x) => x.sh)), spread(o.map((x) => x.wrapH))]);
}

// While held: nothing is written and next to nothing is measured per scroll frame, in both directions.
await scrollTo(pg, 500);
for (const [dir, from, to] of [['down', 500, 800], ['up', 800, 500]]) {
  const s = await sweep(pg, from, to, dir === 'down' ? 1.5 : -1.5);
  const o = s.out;
  await check(`held ${dir}: card fixed all the way`, o.every((x) => x.pos === 'fixed'), o.find((x) => x.pos !== 'fixed'));
  const moved = [];
  for (let i = 0; i < f.n; i++) { const a = o.map((x) => x.pills[i]); if (spread(a) > 0.01) moved.push({ i, min: Math.min(...a), max: Math.max(...a) }); }
  await check(`held ${dir}: badges and head stand exactly still`, moved.length === 0 && spread(o.map((x) => x.head)) < 0.01, moved);
  await check(`held ${dir}: no style writes to the row or the head`, s.nWrites === 0, s.writes);
  await check(`held ${dir}: no text writes to the head`, s.nText === 0, s.nText);
  // One read of the row's place per frame; the head's own rect and the veil's picture (two computed pseudo
  // styles) only on the slow timer, about once a second, however many frames the page scrolled.
  const slow = s.ms / 900 + 3;
  await check(`held ${dir}: one layout read of the row per scroll frame at most`, s.reads.wrap <= s.steps * 2 + 4, [s.reads, s.steps]);
  await check(`held ${dir}: head rect and veil picture not read on every scroll frame`, s.reads.head <= slow && s.reads.veil <= 2 * slow && s.reads.head < s.steps / 2, [s.reads, s.steps, Math.round(s.ms)]);
}

// Sideways scrolling of the badges survives the swap in both directions and still works while held.
await scrollTo(pg, 0);
const canX = await pg.evaluate(() => { const s = window.__hb.scroller; return s ? s.scrollWidth - s.clientWidth : 0; });
await need('the badge row is wider than the phone', canX > 30, canX);
await pg.evaluate(() => { window.__hb.scroller.scrollLeft = 24; });
await scrollTo(pg, 600);
const x1 = await layers(pg);
await check('sideways position kept when the row is held', x1.card.pos === 'fixed' && Math.abs(x1.sl - 24) < 1, x1.sl);
await pg.evaluate(() => { window.__hb.scroller.scrollLeft = 30; });
await pg.waitForTimeout(300);
const x2 = await layers(pg);
await check('held row scrolls sideways', Math.abs(x2.sl - 30) < 1, x2.sl);
await scrollTo(pg, 0);
const x3 = await layers(pg);
await check('sideways position kept when the row returns to the flow', x3.card.pos === 'relative' && Math.abs(x3.sl - 30) < 1, x3.sl);
await pg.evaluate(() => { window.__hb.scroller.scrollLeft = 0; });

// Back at the top: as before, nothing of the hold left.
await check('top again: row in the flow where it was, no hold values left', x3.card.pos === 'relative' && !x3.card.left && !x3.card.width && !x3.wrap.mh
  && Math.abs(x3.wrap.t - top.wrap.t) < 0.5 && Math.abs(x3.card.t - top.card.t) < 0.5 && x3.sh === top.sh && x3.head.op === 0, [x3, top]);

// Turning the phone while held: landscape has no fixed head, the row returns to the flow; portrait holds again.
await scrollTo(pg, 600);
await pg.setViewportSize({ width: 852, height: 393 });
await pg.waitForTimeout(900);
const land = await layers(pg);
await check('landscape: row not fixed, no hold values, no sticky wrapper', land.card.pos !== 'fixed' && !land.card.left && !land.card.width && !land.wrap.mh && land.wrap.pos !== 'sticky' && !land.card.v && land.head.op === 0, [land.card, land.wrap, land.head]);
await pg.setViewportSize({ width: 360, height: 800 });
await pg.waitForTimeout(900);
await scrollTo(pg, 600);
const narrow = await layers(pg);
await check('portrait again (360 wide): held fixed, as wide as its place in the flow', narrow.card.pos === 'fixed' && Math.abs(narrow.card.w - narrow.wrap.w) < 0.5 + Math.abs(top.card.w - top.wrap.w) && Math.abs(narrow.card.l - narrow.wrap.l - (top.card.l - top.wrap.l)) < 0.5 && narrow.card.w <= 360.5
  && Math.abs(narrow.card.t - (narrow.head.t + 44 + off)) < 0.5, [narrow.card, narrow.wrap]);
await pg.setViewportSize({ width: 393, height: 852 });
await pg.waitForTimeout(900);
await scrollTo(pg, 600);
const wide = await layers(pg);
await check('393 wide again: the held row follows the width', wide.card.pos === 'fixed' && Math.abs(wide.card.w - top.card.w) < 0.5 && Math.abs(wide.card.l - top.card.l) < 0.5, [wide.card, top.card]);

// Re-render (HA rebuilds the cards): the head finds the row again and holds it the same way.
await pg.evaluate(() => {
  const o = window.__pierce('casora-filter-overlay').find((x) => x._badgeRowWrapper);
  if (o) { o._headerEl = null; o._discoverElements(); }
});
await scrollTo(pg, 650);
const found = await pg.evaluate(() => window.__pierce('casora-filter-overlay').some((x) => x._badgeRowWrapper && x._badgeRowEl && getComputedStyle(x._badgeRowEl).position === 'fixed'));
await check('badge row found again after a re-render and held fixed', found);
const again = await layers(pg);
await check('after the re-render: no sticky layer', again.sticky.length === 0, again.sticky);

await finish();
