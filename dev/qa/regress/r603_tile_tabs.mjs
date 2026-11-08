// @zustand: arbeit
// Settings rework: a tile's side panel has tabs. Popup fields are one click away without a fold, a kind with shared
// settings has a third tab with them, and that tab is a draft like every setting: nothing is stored before "Save settings".
import { open, studioDashboard, studio, check, need, finish } from './lib.mjs';

const dash = await studioDashboard();
await need('Casora dashboard', dash);
const m = await open({ width: 1440, height: 900 });
await studio(m.page, dash);
const P = (src, arg) => m.page.evaluate(([src, arg]) => new Function('p', 'arg', 'return (async () => {' + src + '})()')(window.__panel(), arg), [src, arg]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const find = (template) => P(`const rooms = p._state.compact.rooms;
  for (let r = 0; r < rooms.length; r++) for (const t of rooms[r].tiles || []) if ([].concat(t.template || []).includes(arg)) return { room: r, key: p._tileKey(t) };
  return null;`, template);
const select = async (at) => { await P(`p._room = arg.room; p._renderTabs(); p._select({ group: 'tiles', key: arg.key });`, at); await wait(900); };
const tabs = () => P(`return [...p.shadowRoot.querySelectorAll('.tiletabs button')].filter((x) => x.getClientRects().length).map((b) => ({ id: b.dataset.tab, text: b.textContent, on: b.getAttribute('aria-selected') === 'true' }));`);
const click = async (id) => { await P(`[...p.shadowRoot.querySelectorAll('.tiletabs [data-tab="' + arg + '"]')].find((x) => x.getClientRects().length).click();`, id); await wait(1300); };

const cover = await find('casora_cover');
await need('a blinds tile', cover);
await select(cover);
const t1 = await tabs();
await check('blinds: three tabs', t1.map((x) => x.id).join() === 'tile,popup,all' && /Alle Jalousien/.test(t1[2].text), t1);
await click('popup');
const pop = await P(`const V = (q) => [...p.shadowRoot.querySelectorAll(q)].filter((x) => x.getClientRects().length); const f = V('.tilepane .adv .advbody')[0];
  return { shown: !!f && /Beschatten/.test(f.textContent), foldHidden: !V('.tilepane .advsum').length };`);
await check('Popup tab: the fields show without opening a fold', pop.shown && pop.foldHidden, pop);
await click('all');
const before = await P(`const r = await p._hass.callWS({ type: 'casora/settings/get' }); return JSON.stringify(((r.settings || {}).security || {}).closed_up_to ?? null);`);
const all = await P(`const V = (q) => [...p.shadowRoot.querySelectorAll(q)].filter((x) => x.getClientRects().length); const b = V('.tilepane [data-pkey="nb-security"]')[0]; const pane = b && b.closest('.tilepane'); const bar = pane && pane.querySelector('.cs-bar');
  return { block: !!b, link: !!(pane && pane.querySelector('.tilelink')), clean: !!bar && bar.classList.contains('cs-clean') };`);
await check('shared tab: the blinds settings in place, no save bar yet', all.block && all.link && all.clean, all);
const flip = await P(`const V = (q) => [...p.shadowRoot.querySelectorAll(q)].filter((x) => x.getClientRects().length); const sw = V('.tilepane [data-pkey="nb-security"] button.sw, .tilepane [data-pkey="nb-security"] [role=switch]')[0]; if (!sw) return false; const pane = sw.closest('.tilepane'); sw.click(); await new Promise((r) => setTimeout(r, 500));
  const bar = pane.querySelector('.cs-bar'); return { bar: bar && !bar.classList.contains('cs-clean'), dirty: p._csDirty() };`);
await check('shared tab: a change waits as a draft with the save bar', flip && flip.bar && flip.dirty, flip);
const after = await P(`const r = await p._hass.callWS({ type: 'casora/settings/get' }); return JSON.stringify(((r.settings || {}).security || {}).closed_up_to ?? null);`);
await check('shared tab: nothing stored before saving', after === before, { before, after });
await P(`p._csDiscardAll && p._csDiscardAll();`);
await wait(500);

const light = await find('casora_light');
if (light) {
  await select(light);
  const t2 = await tabs();
  await check('light: Tile and Popup only, no empty third tab', t2.every((x) => x.id !== 'all'), t2);
}
await finish();
