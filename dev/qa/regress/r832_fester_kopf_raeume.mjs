// @zustand: arbeit
// @parallel: allein
// @deckt: custom_components/casora/scripts/filter-overlay.js#_overlayHeadB,_headBFix,_headBFixPlace,_engageScrollHeader,_restoreMovedWrappers,_restoreBadgeRow,_dismiss,_animOut,disconnectedCallback
// Fixed head on the phone's room and badge pages (1B, owner 15.11.2026): Home's head stayed at the top while
// scrolling (r830), a room page's head (back, name, the room's badges) scrolled away. Now the room page and a badge
// page (here "Beleuchtung") hold it the same way: portrait phone only, once the badge row reaches the top a slim
// row (back, name) and the badge row stay on the bar's material. The row is held without a sticky layer (iOS
// shakes sticky, see r831): its wrapper stays in the page's flow as the placeholder, the card is position: fixed
// at the line while that is above it. The badges stand exactly still while held (1 px steps, both directions,
// WebKit), no jump at the swap, the page keeps its length, no style writes while held, a tap on the row scrolls
// to the top. Landscape, tablet and desktop stay as before.
import { open, usePage, casoraDashboard, dashboard, check, need, finish } from './lib.mjs';

const d = await casoraDashboard((x) => x.url === 'qa-arbeit');
await need('dashboard with a phone twin', d && d.phone, d && d.url);
const HOME = d.phone.url + '/' + (d.phone.config.views[0].path || '0');
const room = (d.phone.config.views[0].cards[1].cards || []).find((k) => k.type === 'custom:casora-filter-overlay' && k.room && k.room !== 'Scenes');
await need('a room page', room, null);
const ROOM = 'room_' + String(room.room).trim().toLowerCase().replace(/[^a-z0-9]+/g, '');

const ov = 'window.__pierce("casora-filter-overlay").find((x) => x._showing)';
// Opens a page; a room in the test house is shorter than a phone screen, a spacer at the end makes it scroll.
const openPage = async (pg, key, spacer) => {
  await pg.evaluate((k) => window._casoraFilter.set(k), key);
  await pg.waitForFunction(new Function(`const o = ${ov}; return !!(o && o._scrollHandler);`), null, { timeout: 15000 }).catch(() => {});
  await pg.waitForTimeout(400);
  if (spacer) {
    await pg.evaluate(new Function(`const o = ${ov}; if (!o) return; const sp = document.createElement('div'); sp.style.height = '1600px'; o._contentEl.appendChild(sp);`));
  }
};
const closePage = async (pg) => { await pg.evaluate(() => window._casoraFilter.set('all')); await pg.waitForTimeout(1600); };
const scrollPage = async (pg, y) => {
  await pg.evaluate(new Function('y', `const o = ${ov}; o._overlayEl.scrollTo(0, y); o._overlayEl.dispatchEvent(new Event('scroll'));`), y);
  await pg.waitForTimeout(500);
};
// Head row, held wrapper, badges, material, compact header and back button of the open page.
const measure = (pg) => pg.evaluate(new Function(`
  const o = ${ov};
  if (!o) return null;
  const box = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; };
  const head = o._headBO && o._headBO.el;
  const room = !!o._config.room;
  const wrap = room ? o._subBadgesWrapper : o._badgeRowWrapper;
  const card = wrap && (room ? o._getBC(wrap) : o._badgeRowEl);
  const pills = [];
  const dig = (n, d) => { if (!n || d > 12) return; for (const k of n.children || []) { if (k.tagName === 'BUTTON-CARD') { const r = k.getBoundingClientRect(); if (r.height >= 30 && r.height <= 60 && r.width > 0 && r.left < innerWidth - 20) { pills.push(k); continue; } } if (k.shadowRoot) dig(k.shadowRoot, d + 1); dig(k, d + 1); } };
  dig(card && card.shadowRoot, 0);
  // Sticky anywhere from the badges up to the page's scroller (the wrapper included), and in the head.
  const nested = [];
  for (const p of [...pills, head]) for (let n = p; n && n !== o._overlayEl; n = n.parentNode || n.host) {
    if (n.nodeType === 1 && /sticky/.test(getComputedStyle(n).position)) nested.push(n.tagName.toLowerCase() + (n.id ? '#' + n.id : ''));
  }
  // Ancestors of the card that would be the containing block of a fixed box.
  const blocks = [];
  for (let n = card && (card.parentNode || card.host); n; n = n.parentNode || n.host) {
    if (n.nodeType !== 1) continue;
    const cs = getComputedStyle(n), why = [];
    for (const k of ['transform', 'translate', 'scale', 'rotate', 'filter', 'perspective']) if (cs[k] && cs[k] !== 'none') why.push(k);
    const bf = cs.backdropFilter || cs.webkitBackdropFilter;
    if (bf && bf !== 'none') why.push('backdrop-filter');
    if (/layout|paint|strict|content/.test(cs.contain || '')) why.push('contain');
    if (/transform|filter|perspective/.test(cs.willChange || '')) why.push('will-change');
    if (cs.containerType && cs.containerType !== 'normal') why.push('container-type');
    if (cs.contentVisibility && cs.contentVisibility !== 'visible') why.push('content-visibility');
    if (why.length) blocks.push(n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + ' (' + why.join(', ') + ')');
  }
  const grad = o._gradientBlurEl && o._gradientBlurEl.firstChild;
  return {
    st: o._overlayEl.scrollTop, sh: o._overlayEl.scrollHeight, ih: innerHeight,
    head: head && { op: parseFloat(getComputedStyle(head).opacity), pe: getComputedStyle(head).pointerEvents, box: box(head), name: head.firstChild.textContent, rest: head.lastChild === head.firstChild ? '' : head.lastChild.textContent, inPage: head.isConnected },
    wrap: wrap && { box: box(wrap), pos: getComputedStyle(wrap).position, cardPos: getComputedStyle(card).position, card: box(card), mb: wrap.style.marginBottom, mh: wrap.style.minHeight,
      vars: card.style.getPropertyValue('--casora-badge-row-pos'), left: card.style.left, width: card.style.width },
    pills: pills.map(box), nested: [...new Set(nested)], blocks,
    grad: grad ? { op: parseFloat(getComputedStyle(grad).opacity), mask: grad.style.maskImage || grad.style.webkitMaskImage } : null,
    hdr: o._compactHeaderEl ? parseFloat(getComputedStyle(o._compactHeaderEl).opacity) : null,
    back: box(o._backBtn), title: o._titleEl && o._titleEl.textContent.trim(),
  };
`));
const spread = (a) => Math.max(...a) - Math.min(...a);
// Whether the deepest element at a point belongs to the page's badge row (a finger there reaches a badge).
const hitsRow = (pg, x, y) => pg.evaluate(new Function('a', `
  const o = ${ov}, [x, y] = a;
  let e = document.elementFromPoint(x, y);
  for (let i = 0; e && e.shadowRoot && i < 40; i++) { const k = e.shadowRoot.elementFromPoint(x, y); if (!k || k === e) break; e = k; }
  const room = !!o._config.room, w = room ? o._subBadgesWrapper : o._badgeRowWrapper, card = room ? o._getBC(w) : o._badgeRowEl;
  for (let n = e; n; n = n.parentNode || n.host) if (n === card) return true;
  return false;
`), [x, y]);

// Scrolls the page in steps (step < 0: upwards), one frame each: head, placeholder, card and badges; style writes.
const sweep = (pg, from, to, step) => pg.evaluate(new Function('a', `
  const [from, to, step] = a;
  const o = ${ov};
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const head = o._headBO.el, room = !!o._config.room;
  const wrap = room ? o._subBadgesWrapper : o._badgeRowWrapper, card = room ? o._getBC(wrap) : o._badgeRowEl;
  const pills = [];
  const dig = (n, d) => { if (!n || d > 12) return; for (const k of n.children || []) { if (k.tagName === 'BUTTON-CARD') { const r = k.getBoundingClientRect(); if (r.height >= 30 && r.height <= 60 && r.width > 0 && r.left < innerWidth - 20) { pills.push(k); continue; } } if (k.shadowRoot) dig(k.shadowRoot, d + 1); dig(k, d + 1); } };
  dig(card.shadowRoot, 0);
  const writes = [];
  const mo = new MutationObserver((ms) => ms.forEach((m) => writes.push(m.target.tagName.toLowerCase() + ':' + (m.target.getAttribute('style') || '').slice(0, 80))));
  for (const n of [wrap, card]) mo.observe(n, { attributes: true, attributeFilter: ['style'] });
  return (async () => {
    const out = [];
    const n = Math.round(Math.abs(to - from) / Math.abs(step));
    for (let i = 0; i <= n; i++) {
      o._overlayEl.scrollTop = from + i * step;
      await frame();
      const h = head.getBoundingClientRect(), w = wrap.getBoundingClientRect();
      out.push({ y: o._overlayEl.scrollTop, head: h.top, wrap: w.top, wrapH: w.height, card: card.getBoundingClientRect().top, pos: getComputedStyle(card).position,
        pills: pills.map((p) => p.getBoundingClientRect().top), sh: o._overlayEl.scrollHeight });
    }
    await frame();
    mo.disconnect();
    return { out, n: pills.length, nWrites: writes.length, writes: writes.slice(0, 6) };
  })();
`), [from, to, step]);

// Clicks the head row's middle (the row, not the back button) and waits for the page to reach the top.
const tapHead = async (pg, width) => {
  await pg.mouse.click(width / 2, 22);
  await pg.waitForFunction(new Function(`const o = ${ov}; return o && o._overlayEl.scrollTop < 1;`), null, { timeout: 4000 }).catch(() => {});
  await pg.waitForTimeout(500);
};

const { page: pg, browser } = await open({ width: 393, height: 852, mobile: true, scale: 3, dark: false, safari: true, theme: 'Casora' });
usePage(pg);
await dashboard(pg, HOME, 3);
await pg.waitForTimeout(800);
const SHOT = process.env.CASORA_SHOT_DIR;

for (const [key, spacer, label] of [[ROOM, true, `room page "${room.room}"`], ['lights', false, 'badge page "lights"']]) {
  await openPage(pg, key, spacer);
  const top = await measure(pg);
  await need(`${label}: open`, top && top.wrap, top);
  await check(`${label}: scrolls more than 500 px`, top.sh - top.ih > 500, [top.sh, top.ih]);
  await check(`${label}: top: slim head hidden`, top.head && top.head.op === 0 && top.head.pe === 'none' && top.head.inPage, top.head);
  await check(`${label}: top: no material`, top.grad && top.grad.op === 0, top.grad);
  const badgeTop0 = top.wrap.box.t;

  await scrollPage(pg, 400);
  const m = await measure(pg);
  await check(`${label} scrolled: slim head shown`, m.head && m.head.op === 1 && m.head.pe === 'auto', m.head);
  await check(`${label} scrolled: head row 44 px at the top`, m.head && Math.abs(m.head.box.t) < 1 && Math.abs(m.head.box.h - 44) < 1, m.head && m.head.box);
  await check(`${label} scrolled: name "${m.title}" in the head`, m.head && m.head.name === m.title && m.title.length > 0, m.head);
  await check(`${label} scrolled: name only, no room status on the right (the badges say it)`, m.head && !m.head.rest, m.head);
  await check(`${label} scrolled: badge row held under the head, position fixed`, m.wrap.cardPos === 'fixed' && m.wrap.card.t >= 44 - 0.5 && m.wrap.card.t < 50, m.wrap);
  await check(`${label} scrolled: same left edge and width as at the top`, Math.abs(m.wrap.card.l - top.wrap.card.l) < 0.5 && Math.abs(m.wrap.card.w - top.wrap.card.w) < 0.5, [m.wrap.card, top.wrap.card]);
  await check(`${label} scrolled: the placeholder keeps the row's height, the page its length`, Math.abs(m.wrap.box.h - top.wrap.box.h) < 0.5 && m.wrap.box.t < 44 && m.sh === top.sh, [m.wrap.box, top.wrap.box, m.sh, top.sh]);
  await check(`${label}: no ancestor of the row would capture a fixed box (transform, filter, contain …)`, m.blocks.length === 0, m.blocks);
  await check(`${label} scrolled: badges inside the 98 px band`, m.pills.length >= 1 && m.pills.every((p) => p.t >= 40 && p.b <= 98 + 0.5), m.pills);
  const p0 = m.pills[0];
  await check(`${label} scrolled: a held badge takes the tap, not the tile scrolling under it`, p0 && await hitsRow(pg, Math.max(p0.l, 0) + Math.min(p0.w, 393 - p0.l) / 2, (p0.t + p0.b) / 2), p0);
  await check(`${label} scrolled: no sticky layer in the head, the row or its wrapper`, m.wrap.pos !== 'sticky' && m.nested.length === 0, [m.wrap, m.nested]);
  await check(`${label} scrolled: material shown up to 98 px`, m.grad && m.grad.op === 1 && /98px/.test(m.grad.mask), m.grad);
  await check(`${label} scrolled: old compact header hidden`, m.hdr === 0, m.hdr);
  await check(`${label} scrolled: back button on the row's centre line`, m.back && Math.abs((m.back.t + m.back.b) / 2 - 22) < 1.5, m.back);
  if (SHOT && key === ROOM) await pg.screenshot({ path: `${SHOT}/raum_400.png` });

  await need(`${label}: the page has a fixed head`, m.head, null);
  for (const [dir, from, to] of [['down', 300, 600], ['up', 600, 300]]) {
    const s = await sweep(pg, from, to, dir === 'down' ? 1.5 : -1.5);
    await check(`${label} held ${dir}: badges found for the sweep`, s.n >= 1, s.n);
    await check(`${label} held ${dir}: head stays at the top while scrolling`, spread(s.out.map((o) => o.head)) < 0.01, s.out.map((o) => o.head));
    await check(`${label} held ${dir}: card fixed all the way, exactly still`, s.out.every((o) => o.pos === 'fixed') && spread(s.out.map((o) => o.card)) < 0.01, s.out.filter((o) => o.pos !== 'fixed').length);
    const moved = [];
    for (let i = 0; i < s.n; i++) { const a = s.out.map((o) => o.pills[i]); if (spread(a) > 0.01) moved.push({ i, min: Math.min(...a), max: Math.max(...a) }); }
    await check(`${label} held ${dir}: badges stand exactly still while scrolling`, moved.length === 0, moved);
    await check(`${label} held ${dir}: no style writes to the badge row while scrolling`, s.nWrites === 0, s.writes);
  }
  // 1 px steps through the swap, down and up: the swap is where the placeholder's top crosses the stick line.
  const line = m.wrap.card.t;
  const ySwap = Math.round(top.wrap.box.t - line);
  await need(`${label}: the row reaches the line after some scrolling`, ySwap > 10, [ySwap, top.wrap.box.t, line]);
  for (const [dir, from, to] of [['down', Math.max(0, ySwap - 30), ySwap + 60], ['up', ySwap + 60, Math.max(0, ySwap - 30)]]) {
    await scrollPage(pg, from);
    const s = await sweep(pg, from, to, dir === 'down' ? 1 : -1);
    const o = s.out, ref = o[dir === 'down' ? 0 : o.length - 1];
    await check(`${label} ${dir}: the sweep crosses the swap`, o.some((x) => x.pos === 'fixed') && o.some((x) => x.pos !== 'fixed') && ref.pos !== 'fixed', [o[0], o[o.length - 1]]);
    const pOff = ref.pills.map((p) => p - ref.wrap), cOff = ref.card - ref.wrap;
    const bad = [];
    o.forEach((x, k) => x.pills.forEach((p, i) => { const want = Math.max(x.wrap, line - cOff) + pOff[i]; if (Math.abs(p - want) >= 0.5) bad.push({ k, y: x.y, i, p, want, pos: x.pos }); }));
    await check(`${label} ${dir}: badges where the flow or the line puts them at every step (no jump at the swap)`, bad.length === 0, bad.slice(0, 4));
    const jumps = [];
    for (let k = 1; k < o.length; k++) { const dy = o[k].y - o[k - 1].y; o[k].pills.forEach((p, i) => { const dp = p - o[k - 1].pills[i]; if (Math.abs(dp) > Math.abs(dy) + 0.01 || dp * dy > 0.0001) jumps.push({ k, dy, dp, i }); }); }
    await check(`${label} ${dir}: no step moves the badges more than the page moved`, jumps.length === 0, jumps.slice(0, 4));
    await check(`${label} ${dir}: in the flow below the line the card is not fixed`, o.filter((x) => x.wrap > line - cOff + 0.01).every((x) => x.pos === 'relative'), o.filter((x) => x.wrap > line - cOff + 0.01).map((x) => x.pos).slice(0, 5));
    await check(`${label} ${dir}: the swap changes neither the page's length nor the placeholder's height`, spread(o.map((x) => x.sh)) === 0 && spread(o.map((x) => x.wrapH)) < 0.01, [spread(o.map((x) => x.sh)), spread(o.map((x) => x.wrapH))]);
  }

  // Tap on the head: back to the top, the page looks as before.
  await scrollPage(pg, 500);
  await tapHead(pg, 393);
  const back = await measure(pg);
  await check(`${label}: tap on the head scrolls to the top`, back.st < 1, back.st);
  await check(`${label}: at the top again: head hidden, badges where they were, in the flow`, back.head.op === 0 && Math.abs(back.wrap.box.t - badgeTop0) < 1 && Math.abs(back.wrap.card.t - top.wrap.card.t) < 1
    && back.wrap.cardPos === 'relative' && !back.wrap.left && !back.wrap.width && !back.wrap.mh, [back.head, back.wrap, badgeTop0]);
  await closePage(pg);
}

// Closed: the room's badge row is back as it was (nothing left from the head).
const after = await pg.evaluate(() => {
  const sub = window.__pierce('button-card').filter((b) => [].concat((b._config || {}).template || []).includes('casora_mobile_sensor_chips'));
  return { rows: sub.map((b) => ({ v: b.style.getPropertyValue('--casora-badge-row-pos'), g: b.style.getPropertyValue('--casora-room-badges-gap-mobile'), pos: getComputedStyle(b).position })),
    wraps: sub.map((b) => { let w = b; while (w && !(w.classList && w.classList.contains('card-wrapper'))) w = w.parentNode || w.host; return w ? [w.style.position, w.style.top, w.style.marginBottom, w.style.minHeight, b.style.left, b.style.width] : null; }) };
});
await check('closed: the room badge row has no head values left', after.rows.every((r) => !r.v && !r.g && r.pos === 'sticky') && after.wraps.every((w) => !w || w.every((x) => !x)), after);
await browser.close();

// Landscape phone, tablet and desktop: no slim head, the row is not held, the compact header works as before.
for (const [w, h, mobile] of [[852, 393, true], [820, 1180, true], [1440, 900, false]]) {
  const tag = `${w}x${h}`;
  const { page: p2, browser: b2 } = await open({ width: w, height: h, mobile, scale: 2, dark: false, safari: true, theme: 'Casora' });
  usePage(p2);
  await dashboard(p2, HOME, 3);
  await p2.waitForTimeout(800);
  await openPage(p2, ROOM, true);
  const m = await measure(p2);
  if (!m) {
    // Tablet and desktop show rooms without the phone's room page: nothing of the head may show there.
    const heads = await p2.evaluate(() => (window.__pierce('.casora-head-b') || []).filter((e) => parseFloat(getComputedStyle(e).opacity) > 0).length);
    await check(`${tag}: no room page and no slim head`, heads === 0, heads);
    await b2.close();
    continue;
  }
  await scrollPage(p2, 400);
  Object.assign(m, await measure(p2));
  await need(`${tag}: room page open`, m && m.wrap, m);
  await check(`${tag}: no slim head`, !m.head || m.head.op === 0, m.head);
  await check(`${tag}: room badges not held`, m.wrap.pos !== 'sticky' && m.wrap.cardPos !== 'fixed' && !m.wrap.vars && !m.wrap.mb && !m.wrap.mh && !m.wrap.left, m.wrap);
  await check(`${tag}: compact header shown as before`, m.hdr === 1, m.hdr);
  await b2.close();
}
await finish();
