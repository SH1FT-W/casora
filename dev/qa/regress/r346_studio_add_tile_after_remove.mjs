// @zustand: arbeit
// @parallel: allein
// @deckt: custom_components/casora/panel/casora-panel.js custom_components/casora/panel/casora-panel-b.js
// Issue #71 (stalakerob, 26.10.2026): after removing a tile in the Studio, "Add a tile" was gone until a reload or
// saving and editing again. Cause: the removed tile stayed selected, and the tile list leaves out "Add a tile" while a
// tile is open in the editor. Expected: Tiles › open a tile › "Remove tile" → the tile list shows "Add a tile"
// again and nothing is selected. Nothing is saved (the Studio only changes its copy).
import { open, studio, studioDashboard, check, need, finish, usePage } from './lib.mjs';

const dash = await studioDashboard();
await need('ein Dashboard für das Studio', dash, dash);
const { page } = await open({ width: 1440, height: 900, dark: true });
usePage(page);
await studio(page, dash);

const vis = (e) => !!(e && e.getClientRects().length && getComputedStyle(e).display !== 'none');
const bars = () => page.evaluate((vs) => { const vis = eval(vs); const r = window.__panel().shadowRoot;
  return { bars: [...r.querySelectorAll('#pane .addbar.tileadd')].filter(vis).length, tiles: r.querySelectorAll('#pane #band-tiles .tile').length }; }, vis.toString());
// Click a visible element of the inspector by its text (right side of the Studio).
const clickText = (text) => page.evaluate((t) => {
  const el = [...window.__panel().shadowRoot.querySelectorAll('*')].find((e) => !e.children.length && e.textContent.trim() === t
    && e.getClientRects().length && e.getBoundingClientRect().left > 900);
  if (!el) return false; el.click(); return true;
}, text);

const pick = await page.evaluate(async () => {
  const p = window.__panel();
  const rooms = p._state.compact.rooms;
  const ri = rooms.findIndex((r, i) => i > 0 && (r.tiles || []).length >= 2);
  if (ri < 0) return null;
  p._room = ri; p._renderTabs && p._renderTabs(); p._renderForm();
  await new Promise((res) => setTimeout(res, 600));
  const t = rooms[ri].tiles[rooms[ri].tiles.length - 1];
  return { ri, n: rooms[ri].tiles.length, name: p._tileLabelFor(p._tileKey(t)) };
});
await need('Raum mit mindestens zwei Kacheln', pick, pick);
await need('Abschnitt „Kacheln“ aufgeklappt', await clickText('Kacheln'), null);
await page.waitForTimeout(800);
const before = await bars();
await check('Liste: „Kachel hinzufügen“ da', before.bars === 1, before);
await need('Kachel ' + pick.name + ' geöffnet', await clickText(pick.name), pick);
await page.waitForTimeout(900);
const removed = await page.evaluate(() => { const b = window.__panel().shadowRoot.querySelector('.bremove'); if (!b) return false; b.click(); return true; });
await need('„Kachel entfernen“ im Editor', removed, null);
await page.waitForTimeout(1200);
const after = await page.evaluate((ri) => { const p = window.__panel(); return { n: p._state.compact.rooms[ri].tiles.length, sel: p._sel }; }, pick.ri);
await check('Kachel entfernt', after.n === pick.n - 1, after);
await check('nichts mehr ausgewählt', !after.sel, after);
const now = await bars();
await check('#71: „Kachel hinzufügen“ in der Liste wieder da', now.bars === 1, { before, now });
await finish();
