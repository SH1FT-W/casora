// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/panel/casora-panel-settings.js custom_components/casora/panel/casora-panel-personal.js custom_components/casora/panel/casora-panel-live.js
// Settings tiles share one grid (owner, 04.11.2026: "the menus are inconsistent … wider, narrower, overlapping … looks
// cheap"). For every tile, "Advanced" open, at 1440, 1180, 820 and 393 px:
//   - every block's heading, its sentence, every plate (flow list, dashboard section, part of a grouped section) and
//     every hint under a plate have the block's left and right edge (±1 px);
//   - nothing visible inside a block reaches past the block's edges;
//   - no card in a card: "Advanced" has no fill of its own, and no plate sits inside another plate;
//   - no sentence is cut off with "…";
//   - one heading level: a block's first group has no heading of its own (the block title is it), so no block shows
//     two headings on top of each other;
//   - "Nur dieses Dashboard" sits on the title line, vertically centred on it (±2 px), or, where the title leaves no
//     room (phone), on a line of its own at the block's left edge.
// Every inner fold is opened first (a dashboard section's "Erweitert", "More options" in waste and others), and the
// page "Updates" (from the tile "Updates & setup") gets the same checks: its heading and plates on one edge. The page
// title, its intro, "‹ Einstellungen" and "Erweitert" sit on the blocks' edge as well.
import { open, studio, studioDashboard, check, need, finish, usePage } from './lib.mjs';

const dash = await studioDashboard();
await need('ein Dashboard für das Studio', dash, dash);

const GEO = `const R = p.shadowRoot;
  const vis = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden' && e.getBoundingClientRect().width > 0;
  const fill = (e) => { const c = getComputedStyle(e).backgroundColor; return !!c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent'; };
  const PLATE = '.flist, section.cn-card:not(.grouped), section.cn-card.grouped > .subcard';
  const EDGE = ':scope > .cn-bhead, :scope > .fgroup > .fhead, :scope > .fgroup > .ffoot, ' + PLATE.split(', ').map((x) => ':scope ' + x).join(', ')
    + ', :scope section.cn-card.grouped > .hint, :scope section.cn-card.grouped > .subtitle';
  const out = { adv: null, blocks: [] };
  const adv = R.querySelector('#pane .cn-adv, .cs-wrap .cn-adv');
  if (adv) out.adv = { fill: fill(adv), pad: getComputedStyle(adv).paddingLeft };
  [...R.querySelectorAll('.cn-block')].filter(vis).forEach((b) => {
    const br = b.getBoundingClientRect();
    const mine = (e) => e.closest('.cn-block') === b;
    const edges = [...b.querySelectorAll(EDGE)].filter((e) => vis(e) && mine(e)).map((e) => { const r = e.getBoundingClientRect();
      return { n: e.className.split(' ')[0] || e.tagName, l: Math.round(r.left - br.left), r: Math.round(br.right - r.right), t: (e.textContent || '').trim().slice(0, 24) }; });
    // Hidden by opacity or clipped to nothing (a scene's drag handle outside edit mode) is not seen, so not checked.
    const seen = (e) => { for (let x = e; x && x !== b; x = x.parentElement) { const cs = getComputedStyle(x); if (cs.opacity === '0') return false;
      if (x !== e && /hidden|clip/.test(cs.overflow) && (x.getBoundingClientRect().width < 1 || x.getBoundingClientRect().height < 1)) return false; } return true; };
    const wide = [...b.querySelectorAll('*')].filter((e) => vis(e) && mine(e) && seen(e) && getComputedStyle(e).position !== 'fixed' && !e.closest('.combo-menu, .mrow, [popover]'))
      .map((e) => ({ e, r: e.getBoundingClientRect() })).filter(({ r }) => r.left < br.left - 1 || r.right > br.right + 1)
      .map(({ e, r }) => (e.className || e.tagName).toString().slice(0, 40) + ' ' + Math.round(r.left - br.left) + '/' + Math.round(br.right - r.right));
    const plates = [...b.querySelectorAll(PLATE)].filter((e) => vis(e) && mine(e));
    const nested = plates.filter((x) => plates.some((y) => y !== x && y.contains(x))).length;
    const first = b.querySelector('.fgroup');
    // Only a group right under the block title would repeat it; a later part of a block (Scenes) keeps its own heading.
    const doubleHead = !!(first && first.previousElementSibling === b.querySelector(':scope > .cn-bhead') && first.querySelector(':scope > .fhead') && vis(first.querySelector(':scope > .fhead')));
    const pill = b.querySelector('.cn-bhead .cn-only'); let pillOff = null;
    if (pill) { const tb = b.querySelector('.cn-bhead b'); const range = document.createRange(); range.selectNodeContents(tb.firstChild || tb);
      const tr = range.getBoundingClientRect(); const pr = pill.getBoundingClientRect(); pillOff = Math.round((pr.top + pr.height / 2) - (tr.top + tr.height / 2));
      if (pr.top >= tr.bottom - 1 && Math.abs(pr.left - br.left) <= 1) pillOff = 0; }
    // A sentence that is cut off ("…") hides what a setting does.
    const cut = [...b.querySelectorAll('.cn-bhead span, .rtext b, .rtext span, .hint, .ffoot, label')].filter((e) => vis(e) && mine(e) && seen(e) && e.scrollWidth > e.clientWidth + 1
      && getComputedStyle(e).textOverflow === 'ellipsis').map((e) => (e.textContent || '').trim().slice(0, 30));
    out.blocks.push({ k: b.dataset.pkey, w: Math.round(br.width), edges, wide: wide.slice(0, 4), nested, doubleHead, pillOff, cut });
  });
  return out;`;

const SIZES = [['1440', { width: 1440, height: 900 }], ['1180', { width: 1180, height: 820, touch: true }],
  ['820', { width: 820, height: 1180, touch: true }], ['393', { width: 393, height: 852, mobile: true }]];
for (const [tag, opts] of SIZES) {
  const { page, browser } = await open({ ...opts, dark: tag !== '1180' });
  usePage(page);
  await studio(page, dash);
  const P = (src, a) => page.evaluate(([src, a]) => new Function('p', 'arg', 'return (async () => {' + src + '})()')(window.__panel(), a), [src, a]);
  const tiles = await P('return window.casoraSettingsMap.tiles.map((t) => t.id);');
  await need(tag + ': acht Kacheln', tiles.length === 8, tiles);
  for (const t of tiles) {
    await P(`p._bOpen = true; await p._csShow('n-${t}');`);
    await page.waitForTimeout(1300);
    await P(`p.shadowRoot.querySelectorAll('.cn-fold:not(.open) > .cn-bhead').forEach((h) => h.click());
      const d = p.shadowRoot.querySelector('.cn-adv'); if (d && !d.open) d.open = true; await new Promise((r) => setTimeout(r, 1100));
      for (const x of [...p.shadowRoot.querySelectorAll('.cn-block .adv:not(.open) > .advsum, .cn-block .frow.casora-pmore:not(.open)')]) { x.click(); await new Promise((r) => setTimeout(r, 250)); }
      await new Promise((r) => setTimeout(r, 600));`);
    const g = await P(GEO);
    const lead = await P(`const R = p.shadowRoot; const vis = (e) => e.getClientRects().length && e.getBoundingClientRect().width > 0;
      const b = [...R.querySelectorAll('.cn-block')].find(vis); if (!b) return null; const L = b.getBoundingClientRect().left;
      const tile = window.casoraSettingsMap.tiles.find((x) => x.id === arg);
      const lab = window.casoraI18n && window.casoraI18n.t ? window.casoraI18n.t(tile.label) : tile.label;
      const title = [...R.querySelectorAll('h1, h2, h3')].filter(vis).find((h) => h.textContent.trim() === lab);
      const tx = (e) => { const g = document.createRange(); g.selectNodeContents(e); return g.getBoundingClientRect().left; };
      return [...R.querySelectorAll('.cs-lede, .cs-hubback, .cn-adv > summary')].filter(vis).map((e) => Math.round(e.getBoundingClientRect().left - L))
        .concat(title ? [Math.round(tx(title) - L)] : ['kein Titel']); `, t);
    await check(`${tag} ${t}: Seitentitel, Einleitung, „‹ Einstellungen“ und „Erweitert“ auf der Kante der Blöcke`, !!lead && lead.every((x) => typeof x === 'number' && Math.abs(x) <= 1), lead);
    const off = g.blocks.flatMap((b) => b.edges.filter((e) => Math.abs(e.l) > 1 || Math.abs(e.r) > 1).map((e) => b.k + ' ' + e.n + ' L' + e.l + ' R' + e.r + ' „' + e.t + '“'));
    await check(`${tag} ${t}: Überschrift, Satz, Platten und Hinweise fluchten mit dem Block (±1 px)`, g.blocks.length > 0 && !off.length, off.slice(0, 6));
    const wide = g.blocks.filter((b) => b.wide.length).map((b) => b.k + ': ' + b.wide.join(' | '));
    await check(`${tag} ${t}: nichts ragt über den Block hinaus`, !wide.length, wide.slice(0, 4));
    await check(`${tag} ${t}: keine Karte in der Karte`, (!g.adv || !g.adv.fill) && g.blocks.every((b) => !b.nested), { adv: g.adv, nested: g.blocks.filter((b) => b.nested).map((b) => b.k) });
    await check(`${tag} ${t}: eine Überschriftenebene je Block`, g.blocks.every((b) => !b.doubleHead), g.blocks.filter((b) => b.doubleHead).map((b) => b.k));
    const cut = g.blocks.filter((b) => b.cut.length).map((b) => b.k + ': ' + b.cut.join(' | '));
    await check(`${tag} ${t}: kein Satz abgeschnitten`, !cut.length, cut.slice(0, 4));
    const pills = g.blocks.filter((b) => b.pillOff !== null && Math.abs(b.pillOff) > 2).map((b) => b.k + ' ' + b.pillOff);
    await check(`${tag} ${t}: „Nur dieses Dashboard“ mittig zur Überschrift`, !pills.length, pills);
  }
  // The page "Updates", opened from "Updates & setup": its groups share one edge, nothing reaches past the page.
  await P(`await p._csShow('n-system'); await new Promise((r) => setTimeout(r, 1200)); const r = p.shadowRoot.querySelector('[data-pkey="nb-updates"] .frow'); if (r) r.click();`);
  await page.waitForTimeout(2500);
  const u = await P(`const R = p.shadowRoot; const vis = (e) => e.getClientRects().length && e.getBoundingClientRect().width > 0;
    const w = [...R.querySelectorAll('.cu-wrap')].find(vis); if (!w) return { open: false };
    const wr = w.getBoundingClientRect();
    const lefts = [...w.querySelectorAll(':scope > .cu-box, :scope > .cu-h')].filter(vis).map((e) => Math.round(e.getBoundingClientRect().left - wr.left));
    const rights = [...w.querySelectorAll(':scope > .cu-box')].filter(vis).map((e) => Math.round(wr.right - e.getBoundingClientRect().right));
    const wide = [...w.querySelectorAll('*')].filter((e) => vis(e) && getComputedStyle(e).opacity !== '0').filter((e) => e.getBoundingClientRect().right > wr.right + 1 || e.getBoundingClientRect().left < wr.left - 1).length;
    return { open: true, lefts: [...new Set(lefts)], rights: [...new Set(rights)], wide };`);
  await check(`${tag} Updates: Überschrift und Platten auf einer Kante, nichts ragt hinaus`, u.open && u.lefts.length === 1 && u.rights.length === 1 && !u.wide, u);
  await browser.close();
}
await finish();
