// @zustand: arbeit
// @parallel: ui
// Reported 02.11.2026 (README picture): in the Studio's popup preview next to the tile editor the plant popup
// showed dial and readings, but no history chart under the dial and no plant doctor, while the same popup on the
// dashboard has both. Cause: modules that hang content into the open popup only looked at the dashboard's popup
// (casoraPopup.element), never at the preview's own casora-popup. Expected: the preview shows the same sections as
// the dashboard popup (plant: chart + doctor; energy: its energy coach), closing the preview leaves no reference
// and does not touch the dashboard popup's state, and the dashboard popup still shows chart and doctor.
import { open, studio, studioDashboard, casoraDashboards, dashboard, check, need, finish, shot } from './lib.mjs';

const { page } = await open();
// The "what's new" sheet would cover the preview.
const dropWelcome = () => page.evaluate(() => { for (const h of document.body.children) if (h.shadowRoot && h.shadowRoot.querySelector('.cw-scrim')) h.remove(); });
// A Casora dashboard with a plant tile: the gate's qa-arbeit (made from the test house) has none, the imported
// copies in the state „arbeit“ have one. Without any, the first Casora dashboard (need() below then says so).
const hasPlant = (cfg) => { let hit = false; (function f(x) { if (hit || !x || typeof x !== 'object') return;
  if (Array.isArray(x)) { x.forEach(f); return; } if ([].concat(x.template || []).includes('casora_plant') && x.entity) { hit = true; return; }
  Object.values(x).forEach(f); })(cfg && cfg.views); return hit; };
const dash = ((await casoraDashboards()).find((d) => !d.mobile && hasPlant(d.config)) || {}).url || await studioDashboard();
await need('Casora-Dashboard', dash);
await studio(page, dash);

// Every element under a root, through shadow roots.
const WALK = `(r) => { const out = []; const w = (n) => { for (const e of n.querySelectorAll('*')) { out.push(e); if (e.shadowRoot) w(e.shadowRoot); } }; w(r); return out; }`;
const probe = () => page.evaluate((WALK) => {
  const walk = eval(WALK);
  const p = window.__panel();
  const pop = walk(p._cpLayer || p.shadowRoot).find((e) => e.localName === 'casora-popup');
  const inPop = pop ? walk(pop.shadowRoot || pop) : [];
  const text = inPop.filter((e) => !['style', 'script'].includes(e.localName)).map((e) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ')).join(' ');
  // A drawn chart: an svg path with a real line (more than a few points) inside the popup.
  const charts = inPop.filter((e) => e.localName === 'path' && (e.getAttribute('d') || '').split(/[LC]/).length > 8 && e.getBoundingClientRect().width > 100).length;
  const coach = inPop.filter((e) => e.classList && e.classList.contains('casora-coach'));
  return { layer: !!p._cpLayer, registered: !!pop && window.casoraPopup.preview === pop, charts,
    slots: inPop.filter((e) => e.classList && e.classList.contains('hp-chart-slot')).length,
    // The chart that 01-basis.js mounts into the slot (not one the popup's content draws itself).
    slotCharts: inPop.filter((e) => e.classList && e.classList.contains('hp-chart-slot') && e.querySelector('casora-chart')).length,
    doctor: /Pflanzen-?doktor|Plant doctor/i.test(text),
    coach: coach.length, coachFilled: coach.some((c) => /Energie-Coach|Energy coach/i.test(c.textContent || '')),
    sample: text.replace(/\s+/g, ' ').slice(0, 300) };
}, WALK);

// Select the first tile with this template in the Studio and open its popup preview; poll until done(r).
const preview = async (tpl, done) => {
  const picked = await page.evaluate((tpl) => {
    const p = window.__panel();
    if (p._cpLayer) p._cpClose();
    const rooms = p._state.compact.rooms;
    for (let i = 0; i < rooms.length; i++) {
      const tile = (rooms[i].tiles || []).find((t) => [].concat(t.template || []).includes(tpl));
      if (tile) { p._room = i; p._select({ group: 'tiles', key: p._tileKey(tile) }); return tile.entity || tile.name; }
    }
    return null;
  }, tpl);
  if (!picked) return null;
  await page.waitForTimeout(2500);
  await page.evaluate(async () => { const p = window.__panel(); p._cpDismissed = null; if (!p._cpLayer && p._cpTarget && p._cpTarget()) await p._cpOpen(p._cpTarget()); });
  let r = null;
  for (let i = 0; i < 24; i++) { await dropWelcome(); r = await probe(); if (done(r)) break; await page.waitForTimeout(500); }
  return { picked, ...r };
};

const plant = await preview('casora_plant', (r) => r.slotCharts && r.charts && r.doctor);
await need('Pflanzen-Kachel im Haus', plant);
console.log('  info   plant', JSON.stringify(plant));
await shot('vorschau');
await check('preview popup is open', plant.layer);
await check('preview popup is registered as casoraPopup.preview', plant.registered, plant);
await check('preview shows the history chart under the dial', plant.slotCharts > 0 && plant.charts > 0, plant);
await check('preview shows the plant doctor', plant.doctor, plant.sample);

// Other popups with a chart slot under the stage (_hpChartInit in 01-basis.js): the first one in the house is drawn.
let other = null;
for (const tpl of ['casora_network', 'casora_battery', 'casora_air_purifier', 'casora_weather']) {
  const r = await preview(tpl, (x) => x.slots && x.slotCharts);
  console.log('  info   ' + tpl, JSON.stringify(r && { slots: r.slots, slotCharts: r.slotCharts, charts: r.charts }));
  if (r && r.slots) { other = { tpl, ...r }; break; }
}
await need('zweites Popup mit Diagramm-Platz im Haus', other);
await check('preview mounts the chart into the slot of ' + other.tpl, other.slotCharts > 0, other);

// Closing the preview leaves nothing behind and never touched the dashboard popup's state.
const after = await page.evaluate(() => { const p = window.__panel(); p._cpClose(true); const P = window.casoraPopup;
  return { preview: P.preview, current: P.current, open: !!(P.element && P.element.hasAttribute('open')), shownIsDash: P.shown === P.element }; });
await check('closing the preview unregisters it, dashboard popup untouched',
  after.preview === null && after.current === null && !after.open && after.shownIsDash, after);

// Counter check: the plant popup on the dashboard still has chart and doctor.
const path = await page.evaluate(() => { const rm = window.__panel()._state.compact.rooms.find((r) => (r.tiles || []).some((t) => [].concat(t.template || []).includes('casora_plant'))); return rm && rm.path; });
await dashboard(page, dash + '/' + path, 3);
const at = await page.evaluate(() => {
  const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_plant') && x.getBoundingClientRect().width > 20);
  if (!b) return null;
  b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await need('Pflanzen-Kachel auf dem Dashboard', at);
await page.mouse.click(at.x, at.y);
let d = null;
for (let i = 0; i < 24; i++) {
  d = await page.evaluate((WALK) => {
    const walk = eval(WALK); const el = window.casoraPopup.element;
    if (!el || !el.hasAttribute('open')) return { open: false };
    const all = walk(el.shadowRoot);
    const text = all.filter((e) => !['style', 'script'].includes(e.localName)).map((e) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ')).join(' ');
    return { open: true, charts: all.filter((e) => e.localName === 'path' && (e.getAttribute('d') || '').split(/[LC]/).length > 8 && e.getBoundingClientRect().width > 100).length,
      doctor: /Pflanzen-?doktor|Plant doctor/i.test(text) };
  }, WALK);
  if (d.open && d.charts && d.doctor) break;
  await page.waitForTimeout(500);
}
await check('dashboard plant popup still shows chart and doctor', d.open && d.charts > 0 && d.doctor, d);
await finish();
