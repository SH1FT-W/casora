// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/panel/casora-panel-settings.js custom_components/casora/panel/casora-panel-personal.js custom_components/casora/panel/casora-panel-b-ux.js
// Settings in the new structure (prototype, 01.11.2026, behind localStorage "casora.settings.neu"). Walks the map
// (window.casoraSettingsMap): the gear opens the new start with eight tiles; every tile opens at most one level deep and
// shows its frequent blocks (links to a dashboard section always), "Advanced" draws its blocks only when opened; a
// search hit in "Advanced" opens the tile there; a link opens the dashboard section and ‹ leads back to the tile; the
// switch back leads to the previous settings. Saving: a switch in a tile block saves through "Save settings" exactly
// as before (casora/settings) and is put back afterwards. Desktop 1440.
import { ws } from '../ws.mjs';
import { open, usePage, studio, studioDashboard, check, need, finish, atFinish } from './lib.mjs';

const dash = await studioDashboard();
await need('Dashboard fürs Studio', dash);
const o = await open({ width: 1440, height: 900, dark: true });
await o.context.addInitScript(() => localStorage.setItem('casora.settings.neu', '1'));
const page = o.page;
usePage(page);
await studio(page, dash);
const P = (src, a) => page.evaluate(([src, a]) => new Function('p', 'arg', 'return (async () => {' + src + '})()')(window.__panel(), a), [src, a]);
const wait = (ms) => page.waitForTimeout(ms);

await P('p._bOpenSettings(null);');
await wait(1500);
const start = await P(`return { page: p._csPage, tiles: [...p.shadowRoot.querySelectorAll('.cn-grid .cs-hubtile')].map((b) => b.dataset.tile) };`);
await check('Zahnrad öffnet die neue Startseite mit acht Kacheln', start.page === 'n-start' && start.tiles.length === 8, start);
const map = await P(`return window.casoraSettingsMap.tiles.map((t) => ({ id: t.id, blocks: t.blocks.map((b) => ({ k: b.k, adv: !!b.adv, link: !!(b.sec || b.updates) })) }));`);
for (const tile of map) {
  await P(`p._csShow('n-${tile.id}')`);
  await wait(1200);
  const seen = await P(`return [...p.shadowRoot.querySelectorAll('#pane .cn-block')].map((b) => b.dataset.pkey.slice(3));`);
  const often = tile.blocks.filter((b) => !b.adv);
  await check(`${tile.id}: nur häufige Blöcke, Verweise immer`, often.filter((b) => b.link).every((b) => seen.includes(b.k))
    && seen.every((k) => often.some((b) => b.k === k)), { seen, often: often.map((b) => b.k) });
  const adv = tile.blocks.filter((b) => b.adv);
  if (!adv.length) continue;
  const inAdv = await P(`const d = p.shadowRoot.querySelector('#pane .cn-adv'); const before = d.querySelectorAll('.cn-block').length;
    d.open = true; await new Promise((r) => setTimeout(r, 900));
    const after = [...d.querySelectorAll('.cn-block')].map((b) => b.dataset.pkey.slice(3)); d.open = false; return { before, after };`);
  await check(`${tile.id}: „Erweitert“ zeichnet erst beim Öffnen`, inAdv.before === 0 && adv.filter((b) => b.link).every((b) => inAdv.after.includes(b.k))
    && inAdv.after.every((k) => adv.some((b) => b.k === k)), inAdv);
}
const hit = await P(`const t = window.casoraSettingsMap.tiles.find((x) => x.id === 'house'); p._csNeuGo(t, t.blocks.find((b) => b.k === 'security'));
  await new Promise((r) => setTimeout(r, 1500)); const d = p.shadowRoot.querySelector('#pane .cn-adv');
  return { page: p._csPage, open: !!(d && d.open), block: !!p.shadowRoot.querySelector('#pane [data-pkey="nb-security"]') };`);
await check('Treffer in „Erweitert“ öffnet die Kachel dort', hit.page === 'n-house' && hit.open && hit.block, hit);
for (const [q, k] of [['müll', 'waste'], ['uhr', 'time'], ['rollladen', 'security'], ['lüften', 'vent'], ['tankstelle', 'fuel'], ['beta', 'updates']]) {
  const hits = await P('return p._csNeuFind(arg).map((h) => h.b.k);', q);
  await check(`Suche „${q}“ findet ${k}`, hits.includes(k), hits);
}
await P(`p._csShow('n-phone')`); await wait(900);
await P(`const t = window.casoraSettingsMap.tiles.find((x) => x.id === 'phone'); p._csNeuLink(t, t.blocks.find((b) => b.sec));`);
await wait(1800);
const sel = await P('return { sel: p._sel && p._sel.key, cs: !!p._csOpen };');
await check('Verweis öffnet den Dashboard-Abschnitt', sel.sel === 'General' && !sel.cs, sel);
await P(`const b = [...p.shadowRoot.querySelectorAll('.cs-hubback, .detailbar .back')].find((x) => x.getClientRects().length); if (b) b.click();`);
await wait(1200);
await check('‹ führt zurück zur Kachel', (await P('return p._csPage + "|" + !!p._csOpen;')) === 'n-phone|true');

// Saving: first switch of the waste block, saved through "Save settings", then put back.
const c = await ws();
const get = async () => JSON.stringify(((await c.cmd({ type: 'casora/settings/get' })).settings || {}).waste || null);
const before = await get();
atFinish(async () => { c.close(); });
await P(`p._csShow('n-house')`); await wait(1500);
const flip = `const sw = p.shadowRoot.querySelector('#pane [data-pkey="nb-waste"] .sw'); if (!sw) return false;
  (sw.querySelector('input') || sw).click(); await new Promise((r) => setTimeout(r, 300)); if (!p._csDirty()) return 'clean';
  await p._csSave(); await new Promise((r) => setTimeout(r, 800)); return true;`;
const r1 = await P(flip);
await need('Schalter im Block „Abfall“', r1 === true, r1);
const mid = await get();
await check('Gespeichert wie bisher (casora/settings)', mid !== before, { before, mid });
await P(flip);
await check('Zurückgestellt', (await get()) === before, { before, after: await get() });

await P(`const rows = [...p.shadowRoot.querySelectorAll('#pane .frow')]; p._csShow('n-start'); await new Promise((r) => setTimeout(r, 900));
  const back = [...p.shadowRoot.querySelectorAll('#pane .frow')].pop(); back.click();`);
await wait(1200);
const old = await P(`return { page: p._csPage, flag: localStorage.getItem('casora.settings.neu') };`);
await check('„Zurück zu den bisherigen Einstellungen“ zeigt die alte Startseite', old.page === 'start' && !old.flag, old);
await finish();
