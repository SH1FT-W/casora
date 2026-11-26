// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/panel/casora-panel-community.js#_comCatalog,studioArea, custom_components/casora/panel/casora-panel-b-mehr.js#_mPaintRedo, custom_components/casora/panel/casora-panel.js#_popRow,_focusPreview
// Studio, Prüfrunde 26.11.2026 – what only a browser shows (nothing is saved):
//   u02-02  1440 px with HA's sidebar: the Community window starts right of the sidebar, inside the Studio.
//   u02-04  1440 px: redo sits next to undo before and after an undo – undo does not move.
//   u02-12  1440 px: a tile selected, back arrow → no veil over the preview.
//   d04-13  820 px tablet, Settings › Weather: the field with ✕ ends where the fields below it end.
//   d04-02  393 px phone, light: segment tracks on the settings plates have a surface of their own.
import { open, studio, studioDashboard, check, need, finish, usePage } from './lib.mjs';

const dash = await studioDashboard();
await need('ein Dashboard für das Studio', dash, dash);
const runner = (page) => (src, a) => page.evaluate(([src, a]) => new Function('p', 'arg', 'return (async () => {' + src + '})()')(window.__panel(), a), [src, a]);
const sleep = 'await new Promise((r) => setTimeout(r, 900));';

// ── Desktop 1440, light ─────────────────────────────────────────────────────
{
  const { page, browser } = await open({ width: 1440, height: 900, dark: false });
  usePage(page);
  await studio(page, dash);
  const P = runner(page);
  // u02-04
  const undo0 = await P(`const R = p.shadowRoot; const u = R.getElementById('undo'), r = R.getElementById('mredo');
    p._mRedo = []; p._mPaintRedo(); ${sleep}
    return { u: Math.round(u.getBoundingClientRect().left), r: r && getComputedStyle(r).display, dis: r && r.disabled };`);
  const undo1 = await P(`const R = p.shadowRoot; p._mRedo = [{}]; p._mPaintRedo(); ${sleep}
    const u = R.getElementById('undo'), r = R.getElementById('mredo'); const x = { u: Math.round(u.getBoundingClientRect().left), r: getComputedStyle(r).display };
    p._mRedo = []; p._mPaintRedo(); return x;`);
  await check('u02-04 Wiederholen steht neben Rückgängig (ausgegraut), Rückgängig bleibt an seiner Stelle',
    undo0.r === 'grid' && undo0.dis === true && undo1.r === 'grid' && Math.abs(undo0.u - undo1.u) <= 1, { undo0, undo1 });
  // u02-12
  const veil = await P(`const room = p._state.compact.rooms.findIndex((r) => (r.tiles || []).length > 1);
    p._room = room < 0 ? 0 : room; p._renderTabs(); p._group = 'rooms'; p._sel = null; p._renderForm(); p._rebuildPreview(); ${sleep}
    const R = p._state.compact.rooms[p._room]; const t = R.tiles[0];
    p._group = 'tiles'; p._select({ group: 'tiles', key: p._tileKey(t), label: 'x' }); ${sleep}
    const before = !!p._focusOn;
    p._popRow(); ${sleep}
    const mr = p.shadowRoot.querySelector('.miniroom');
    return { before, on: !!p._focusOn, focusing: !!(mr && mr.classList.contains('focusing')), group: p._group };`);
  await check('u02-12 Zurück aus der Kachel: kein Schleier über der Vorschau', !veil.on && !veil.focusing, veil);
  // u02-02
  const com = await P(`p._comCatalog(); await new Promise((r) => setTimeout(r, 2500));
    const st = p.shadowRoot.querySelector('.askstack'); if (!st) return null;
    const r = st.getBoundingClientRect(), h = p.getBoundingClientRect();
    const x = { box: [Math.round(r.left), Math.round(r.right)], studio: [Math.round(h.left), Math.round(h.right)] };
    const c = p.shadowRoot.querySelector('.askacts button'); if (c) c.click(); return x;`);
  await check('u02-02 Community-Fenster liegt ganz im Studio-Bereich', !!com && com.box[0] >= com.studio[0] && com.box[1] <= com.studio[1], com);
  await browser.close();
}

// ── Tablet 820 ─────────────────────────────────────────────────────────────
{
  const { page, browser } = await open({ width: 820, height: 1180, touch: true, dark: false });
  usePage(page);
  await studio(page, dash);
  const P = runner(page);
  await P(`p._bOpen = true; await p._csShow('n-wx'); await new Promise((r) => setTimeout(r, 1500));`);
  const g = await P(`const R = p.shadowRoot; const vis = (e) => e.getClientRects().length && e.getBoundingClientRect().width > 0;
    const rows = [...R.querySelectorAll('.cn-block .row')].filter(vis).filter((r) => r.querySelector(':scope > .combo, :scope > input'));
    const withX = rows.find((r) => { const d = r.querySelector(':scope > .drop:not(.blank)'); return d && vis(d); });
    const plain = rows.find((r) => r !== withX && !r.querySelector(':scope > .drop:not(.blank)') && r.closest('.cn-block') === (withX && withX.closest('.cn-block')));
    if (!withX || !plain) return { found: false, rows: rows.length };
    const f = (r) => r.querySelector(':scope > .combo, :scope > input').getBoundingClientRect();
    const d = withX.querySelector(':scope > .drop').getBoundingClientRect(), a = f(withX), b = f(plain);
    return { found: true, right: [Math.round(a.right), Math.round(b.right)], xInside: d.left >= a.left && d.right <= a.right + 1 };`);
  await check('d04-13 Tablet: Feld mit ✕ endet bündig mit den Feldern darunter, ✕ im Feld', g.found && Math.abs(g.right[0] - g.right[1]) <= 1 && g.xInside, g);
  await browser.close();
}

// ── Phone 393, light ───────────────────────────────────────────────────────
{
  const { page, browser } = await open({ width: 393, height: 852, mobile: true, dark: false });
  usePage(page);
  await studio(page, dash);
  const P = runner(page);
  await P(`p._bOpen = true; await p._csShow('n-look'); await new Promise((r) => setTimeout(r, 1500));`);
  const s = await P(`const R = p.shadowRoot; const vis = (e) => e.getClientRects().length && e.getBoundingClientRect().width > 0;
    const bg = (e) => getComputedStyle(e).backgroundColor;
    // The plate a track sits on: the nearest painted ancestor inside the settings block.
    const plateOf = (e) => { for (let x = e.parentElement; x && !x.classList.contains('cn-block'); x = x.parentElement)
      if (!/rgba\\(0, 0, 0, 0\\)|transparent/.test(getComputedStyle(x).backgroundColor)) return x; return null; };
    // Brightness of the track as seen on its plate (alpha blended), against the plate's.
    const rgba = (c) => { const m = (c.match(/[\\d.]+/g) || []).map(Number); return { r: m[0] || 0, g: m[1] || 0, b: m[2] || 0, a: m.length > 3 ? m[3] : 1 }; };
    const lum = (o) => (0.2126 * o.r + 0.7152 * o.g + 0.0722 * o.b) / 255;
    return [...R.querySelectorAll('.cn-block .seg')].filter(vis).filter(plateOf).map((e) => {
      const s = rgba(bg(e)), p = rgba(bg(plateOf(e)));
      const seen = { r: s.r * s.a + p.r * (1 - s.a), g: s.g * s.a + p.g * (1 - s.a), b: s.b * s.a + p.b * (1 - s.a) };
      return { seg: bg(e), plate: bg(plateOf(e)), diff: Math.round(Math.abs(lum(seen) - lum(p)) * 1000) / 1000 };
    });`);
  await check('d04-02 Handy hell: Umschalter auf den Platten heben sich sichtbar ab (Helligkeit ≥ 0,03)', s.length > 0 && s.every((x) => x.diff >= 0.03), s);
  await browser.close();
}
await finish();
