// Column balance of a two-column popup (dev/qa/popup-galerie.mjs pruefen --spalten): runs in the browser at the open
// popup (window.casoraPopup.surface), through all shadow roots. Finds the main column pair – two side-by-side
// elements, each 30–62 % of the popup width, starting on the same line – and measures how far each column's content
// reaches down (the lowest visible descendant, so a stretched grid cell does not count as content).
// Returns null without a column pair (one column, phone) or
//   { top, left, right, gap, colW, frameW }: left/right = content height in px from the shared top, gap = |left − right|
//   = the empty block at the end of the shorter column.
export const MEASURE_COLS = () => {
  let frame = window.casoraPopup && window.casoraPopup.surface;
  // Popups opened from header badges may live in another surface: the widest open dialog-like host with a header title.
  if (!frame && window.__pierce) frame = window.__pierce('*').filter((e) => e.shadowRoot && e.shadowRoot.querySelector('.header-title'))
    .map((e) => [e, e.getBoundingClientRect()]).filter(([, r]) => r.width > 300 && r.height > 200).sort((x, y) => y[1].width - x[1].width).map(([e]) => e)[0];
  if (!frame) return null;
  const parentOf = (e) => { const p = e.assignedSlot || e.parentNode; return p && p.nodeType === 11 ? p.host : p; };
  const all = [];
  const walk = (n) => { for (const ch of (n.children || [])) { all.push(ch); if (ch.shadowRoot) walk(ch.shadowRoot); walk(ch); } };
  if (frame.shadowRoot) walk(frame.shadowRoot); walk(frame);
  const FR = frame.getBoundingClientRect();
  const vis = (e) => { const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return null;
    if (e.checkVisibility && !e.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true })) return null; return r; };
  const R = new Map(); for (const e of all) { const r = vis(e); if (r) R.set(e, r); }
  const cand = [...R].filter(([, r]) => r.width >= FR.width * 0.3 && r.width <= FR.width * 0.62 && r.height > 40);
  const inside = (e, anc) => { for (let n = e, k = 0; n && k < 80; k++) { n = parentOf(n); if (n === anc) return true; } return false; };
  // Every left/right pair on one line, neither inside the other; the largest pair is the column pair.
  let best = null;
  for (const [a, ra] of cand) for (const [b, rb] of cand) {
    if (a === b || Math.abs(ra.top - rb.top) > 8 || ra.right > rb.left + 2) continue;
    const area = ra.width * ra.height + rb.width * rb.height;
    if (best && area <= best.area) continue;
    if (inside(a, b) || inside(b, a)) continue;
    best = { a, b, ra, rb, area };
  }
  if (!best) return null;
  const contentBottom = (col) => {
    let bottom = null;
    for (const [e, r] of R) {
      if (e === col) continue;
      let n = e, inside = false;
      for (let k = 0; n && k < 60; k++) { n = parentOf(n); if (n === col) { inside = true; break; } }
      if (!inside) continue;
      // Leaves and plates only: a container stretched by the grid row would count the empty block as content.
      if ([...(e.children || [])].some((c) => R.has(c)) && !(e.shadowRoot)) continue;
      if (bottom === null || r.bottom > bottom) bottom = r.bottom;
    }
    return bottom;
  };
  const top = Math.min(best.ra.top, best.rb.top);
  const lb = contentBottom(best.a), rb = contentBottom(best.b);
  if (lb === null || rb === null) return null;
  const left = Math.round(lb - top), right = Math.round(rb - top);
  return { top: Math.round(top - FR.top), left, right, gap: Math.abs(left - right), colW: Math.round(best.ra.width), frameW: Math.round(FR.width) };
};

// Weather popup order (owner 01.11.2026): left under the dial the Verlauf (chart slot), right „Nächste Stunden“ under
// „7 Tage“. Returns null without the weather columns.
export const WEATHER_ORDER = () => {
  const s = window.casoraPopup && window.casoraPopup.surface;
  const hw = s && window.__pierce('.hw3').find((e) => e.getBoundingClientRect().width > 300);
  if (!hw) return null;
  const cols = [...hw.children].filter((c) => c.tagName !== 'STYLE');
  if (cols.length < 2) return null;
  const mid = (cols[0].getBoundingClientRect().right + cols[1].getBoundingClientRect().left) / 2;
  const box = (sel) => { const e = hw.querySelector(sel); return e ? e.getBoundingClientRect() : null; };
  const chart = box('.hp-chart-slot'), hourly = box('[class^="hw-slot-hourly-"]'), daily = box('[class^="hw-slot-daily-"]');
  return { chartLeft: !!chart && chart.right <= mid, hourlyRight: !!hourly && hourly.left >= mid,
    hourlyBelowDaily: !!hourly && !!daily && hourly.top > daily.bottom };
};
