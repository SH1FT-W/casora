// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/panel/casora-panel-b-ux.js custom_components/casora/panel/casora-panel-types.js custom_components/casora/panel/casora-panel.js custom_components/casora/panel/casora-panel-b-plus.js
// E03/E05/E06 (test 2): "Add a tile" found nothing for "Abfall"/"Müll"; a new waste tile opened a "Device" list full of
// power and air sensors; its preview said "Automatic". Expected: typing "Müll" lists the waste tile type, picking it adds
// the tile without a device question, the editor shows "Waste calendar" with no device list open, the preview tile is in
// view and does not say "Automatic". Nothing is saved.
import { open, usePage, studio, studioDashboard, check, need, finish } from './lib.mjs';

const dash = await studioDashboard();
await need('Casora-Dashboard fürs Studio', dash);
const { page } = await open({ width: 1440, height: 900, dark: false });
usePage(page);
await studio(page, dash);
const P = (src, a) => page.evaluate(([src, a]) => new Function('p', 'arg', 'return (async () => {' + src + '})()')(window.__panel(), a), [src, a]);
const wait = (ms) => page.waitForTimeout(ms);

const n0 = await P('return (p._state.compact.rooms[p._room].tiles || []).length;');
await P('p._bAddTile();');
await wait(900);
await need('add dialog open', await P('return !!p.shadowRoot.querySelector(".uxadd input");'));
await page.keyboard.type('Müll');
await wait(500);
const rows = await P('return [...p.shadowRoot.querySelectorAll(".uxadd .mrow")].map((b) => b.textContent);');
await check('E03 "Müll" finds the waste collection', rows.some((t) => /Abfall/.test(t)), rows);
const hit = await P(`const b = [...p.shadowRoot.querySelectorAll(".uxadd .mrow")].find((b) => /Abfall/.test(b.textContent)); if (b) b.click(); return !!b;`);
await need('picked', hit);
await wait(2500);
const st = await P(`const room = p._state.compact.rooms[p._room]; const t = room.tiles[room.tiles.length - 1];
  const asks = [...p.shadowRoot.querySelectorAll('.askpane')].filter((n) => n.getClientRects().length).length;
  const labels = [...p.shadowRoot.querySelectorAll('.inspector label, .inspector .lab')].filter((l) => l.getClientRects().length).map((l) => l.textContent.trim());
  const openMenu = [...p.shadowRoot.querySelectorAll('.combo-menu')].filter((n) => n.getClientRects().length).length;
  const tiles = [...p.shadowRoot.querySelectorAll('.mtile[data-mk]')]; const el = tiles.find((e) => e.dataset.mk === 't:' + p._tileKey(t));
  let row = el && el.parentElement; while (row && !(row.scrollWidth > row.clientWidth + 1 && /(auto|scroll|hidden)/.test(getComputedStyle(row).overflowX))) row = row.parentElement;
  const r = el && el.getBoundingClientRect(), rr = (row || document.documentElement).getBoundingClientRect();
  return { n: room.tiles.length, tpl: t.template, entity: t.entity || '', asks, labels, openMenu,
    state: el ? (el.querySelector('.mstate') || {}).textContent : null,
    inView: !!(r && rr && r.left >= rr.left - 2 && r.right <= rr.right + 2) };`);
await check('E03 waste tile added', st.n === n0 + 1 && [].concat(st.tpl).includes('casora_trash'), st);
await check('E05 no device question', st.asks === 0, st);
await check('E05 "Abfallkalender" field shown, no device list open', st.labels.includes('Abfallkalender') && st.openMenu === 0, st);
await check('E06 preview does not say "Automatisch"', st.state && !/Automatisch/.test(st.state), st);
await check('T12 the new tile is in view in the preview', st.inView, st);
await finish();
