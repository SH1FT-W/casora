// @zustand: arbeit
// @parallel: allein
// @deckt: custom_components/casora/scripts/local/00-finder.js#casoraOvenFind custom_components/casora/scripts/local/02-devices.js#_casoraOven dev/casora_mock/oven.py
// Owner 04.11.2026: an oven reached a tile only via „Geschirrspüler“ or „Gerät mit Ablauf“ and showed a dishwasher
// symbol. New tile type „Backofen“ (casora_oven). With the test ovens (dev/casora_mock/oven.py: „Testofen“ as Home
// Connect Local, „Testbackofen“ as Home Connect in HA core):
//   - Studio: „Kachel hinzufügen“ → „Backofen“ suggests the ovens as sure matches (nothing else), the new tile takes one
//     of them and the preview says its state („Bereit“/„Aus“), not the raw „ready“.
//   - dashboard (copies qa-oven / qa-oven-mobile with the Testofen tile on the home page), desktop 1440 and phone 393,
//     light and dark: oven symbol; off „Aus“; running „Heizt auf 180 °C“ well below the target, at temperature
//     „178 °C“, the time left only in the popup (rule 23.09.2026); tap opens the oven popup (one S4 stage with the cavity, the device plate); phone: nothing wider than 393.
// Pictures: CASORA_OVEN_BILDER=<folder> stores tile pictures (off/running per view) and the Studio.
import fs from 'node:fs';
import { open, studio, casoraDashboards, dashboard, check, need, finish, atFinish, stable, usePage, fakeStates } from './lib.mjs';
import { ws } from '../ws.mjs';

const BILDER = process.env.CASORA_OVEN_BILDER || '';
if (BILDER) fs.mkdirSync(BILDER, { recursive: true });
const WS = 'sensor.testofen_betriebszustand';
const HC = 'sensor.testbackofen_betriebszustand';

const c = await ws();
const S0 = await c.cmd({ type: 'get_states' });
await need('test ovens in the house', [WS, HC].every((id) => S0.some((s) => s.entity_id === id)));

// ── Studio: add the tile ──
const all = await casoraDashboards();
const anchored = (d) => /"template":(?:\[[^\]]*)?"casora_(?:recipe|battery)"/.test(JSON.stringify((d.config.views || [])[0] || {}));
const desk = all.find((d) => !d.mobile && (d.config.views || []).length > 1 && anchored(d));
const phone = all.find((d) => d.mobile && anchored(d));
await need('Casora dashboards', desk && phone, all.map((d) => d.url));
{
  const o = await open({ width: 1600, height: 1000, dark: true });
  usePage(o.page);
  const H = (fn, a) => o.page.evaluate(fn, a);
  await studio(o.page, desk.url);
  await H(async () => { const p = window.__panel(); p._room = 0; p._sel = null; p._renderTabs(); p._syncPreview();
    await new Promise((r) => setTimeout(r, 800)); });
  const n0 = await H(() => window.__panel()._state.compact.rooms[0].tiles.length);
  const types = await H(() => window.__casoraPanelInternals.TILE_TYPES.filter((t) => t.id === 'casora_oven').map((t) => t.label));
  await check('Studio: tile type „Backofen“ (casora_oven)', types.length === 1, types);
  const cand = await H(() => { const p = window.__panel(), I = window.__casoraPanelInternals;
    return p._tileCandidates(I.TILE_TYPES.find((t) => t.id === 'casora_oven'), p._state.compact.rooms[0]).map((x) => ({ id: x.id, sure: x.sure })); });
  await check('Studio: the two ovens as sure matches, nothing else', cand.length === 2 && cand.every((x) => x.sure)
    && cand.map((x) => x.id).sort().join() === [HC, WS].sort().join(), cand);
  const asked = H(async () => {
    const p = window.__panel(), I = window.__casoraPanelInternals;
    window.__qaOvenDone = await p._addTileAsk(p._state.compact.rooms[0], I.TILE_TYPES.find((t) => t.id === 'casora_oven'));
    p._renderForm && p._renderForm(); p._syncPreview && p._syncPreview();
  });
  const pick = await stable(o.page, () => window.__pierce('*').filter((n) => n.getClientRects().length && n.children.length === 0
    && /Test(back)?ofen/.test(n.textContent || '')).map((n) => n.textContent.trim()), null,
    { until: (v) => v && v.some((x) => /Testofen/.test(x)) && v.some((x) => /Testbackofen/.test(x)), max: 8000 });
  await check('Studio: the dialog offers both test ovens', ['Testofen', 'Testbackofen'].every((n) => (pick || []).some((x) => x.includes(n))), pick);
  if (BILDER) await o.page.screenshot({ path: BILDER + '/studio-vorschlag.png' });
  const take = o.page.getByRole('button', { name: /^(Übernehmen|Use)$/ });
  if (await take.count()) await take.last().click();
  await asked;
  await o.page.waitForTimeout(1500);
  const t = await H(() => { const ts = window.__panel()._state.compact.rooms[0].tiles; return { n: ts.length, last: ts[ts.length - 1] }; });
  await check('Studio: oven tile added with an oven', t.n === n0 + 1 && t.last.template === 'casora_oven' && [HC, WS].includes(t.last.entity), t);
  const want = t.last && t.last.entity === WS ? /^Aus$/ : /^Bereit$/;
  const shown = await stable(o.page, () => window.__pierce('.mstate').map((n) => n.textContent.trim()), null,
    { until: (v) => v && v.some((x) => /^(Aus|Bereit)$/.test(x)), max: 10000 });
  await check('Studio: preview says the oven\'s state in words', (shown || []).some((x) => want.test(x)) && !(shown || []).some((x) => /^(ready|inactive)$/.test(x)), shown);
  if (BILDER) {
    await H(() => { const p = window.__panel(); const ts = p._state.compact.rooms[0].tiles; p._sel = { tile: ts.length - 1 }; p._renderForm && p._renderForm(); });
    await o.page.waitForTimeout(900);
    await o.page.screenshot({ path: BILDER + '/studio.png' });
  }
  await o.browser.close().catch(() => {});
}

// ── Dashboards: copies with the Testofen tile on the home page ──
const TILE = { type: 'custom:button-card', template: 'casora_oven', entity: WS, name: 'Backofen', variables: { icon: 'stove' } };
const withTile = (cfg) => {
  const o = JSON.parse(JSON.stringify(cfg));
  let done = false;
  (function walk(x) {
    if (done || !x || typeof x !== 'object') return;
    if (Array.isArray(x)) {
      const i = x.findIndex((y) => y && typeof y === 'object' && [].concat(y.template || []).some((n) => n === 'casora_recipe' || n === 'casora_battery'));
      if (i >= 0) { x.splice(i + 1, 0, JSON.parse(JSON.stringify(TILE))); done = true; return; }
      x.forEach(walk);
      return;
    }
    Object.keys(x).forEach((k) => walk(x[k]));
  })(o.views[0]);
  return done ? o : null;
};
const made = [];
const save = async (url, cfg, title) => {
  const list = await c.cmd({ type: 'lovelace/dashboards/list' });
  if (!list.some((d) => d.url_path === url)) {
    await c.cmd({ type: 'lovelace/dashboards/create', url_path: url, title, mode: 'storage', show_in_sidebar: false, require_admin: false });
  }
  await c.cmd({ type: 'lovelace/config/save', url_path: url, config: cfg });
  made.push(url);
};
const D = withTile(desk.config), M = withTile(phone.config);
await need('tile inserted', D && M);
await save('qa-oven', D, 'QA Backofen');
await save('qa-oven-mobile', M, 'QA Backofen Handy');
atFinish(async () => {
  const c2 = await ws();
  const list = await c2.cmd({ type: 'lovelace/dashboards/list' });
  for (const u of made) { const d = list.find((x) => x.url_path === u); if (d) await c2.cmd({ type: 'lovelace/dashboards/delete', dashboard_id: d.id }); }
  c2.close();
});

// The oven tiles on the page (the smart row also lays out a spare copy without an entity), the one in view first.
const TILES = () => window.__pierce('button-card').filter((b) => [].concat((b._config || {}).template || []).includes('casora_oven')
  && (b._config || {}).entity && b.getBoundingClientRect().width > 20).map((b) => {
  const r0 = b.getBoundingClientRect();
  const inView = r0.left >= -1 && r0.right <= window.innerWidth + 1 && r0.top >= -1 && r0.bottom <= window.innerHeight + 1;
  if (!inView) b.scrollIntoView({ block: 'center', inline: 'nearest' });
  const sr = b.shadowRoot, r = b.getBoundingClientRect(), stt = sr && sr.querySelector('#state');
  const img = sr && sr.querySelector('img');
  const card = sr && sr.querySelector('ha-card');
  const mask = card ? getComputedStyle(card).getPropertyValue('--casora-icon-mask-image') : '';
  const stove = window.casoraIconUrl ? window.casoraIconUrl('stove') : 'stove';
  const dish = window.casoraIconUrl ? window.casoraIconUrl('dishwasher') : 'dishwasher';
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, box: { l: r.left, t: r.top, w: r.width, h: r.height }, state: stt ? stt.textContent.trim() : '',
    stove: (img && img.getAttribute('src') === stove) || mask.includes(stove), dish: (img && img.getAttribute('src') === dish) || mask.includes(dish),
    right: r.right, vw: window.innerWidth, inView };
}).sort((a, b) => b.inView - a.inView);
const POPUP = () => {
  const s = window.casoraPopup && window.casoraPopup.surface;
  if (!s) return null;
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const txt = (e) => (e ? e.textContent.replace(/\s+/g, ' ').trim() : '');
  const stages = window.__pierce('[data-casora-stage]', s).filter(vis).map((e) => ({ code: e.getAttribute('data-casora-stage'), t: txt(e) }));
  const rows = window.__pierce('.hui-row', s).filter(vis).map(txt);
  const vw = window.innerWidth;
  const wide = window.__pierce('*', s).filter((e) => { if (!vis(e)) return false; const r = e.getBoundingClientRect(); return r.right > vw + 1 || r.left < -1; })
    .slice(0, 3).map((e) => (e.className && String(e.className).slice(0, 40)) || e.tagName);
  return { stages, rows, wide };
};
const RUN = { [WS]: { state: 'run' }, 'select.testofen_betriebszustand': { state: 'on' }, 'sensor.testofen_aktuelle_temperatur': { state: '152' },
  'sensor.testofen_aktives_programm': { state: 'cooking_oven_program_heatingmode_hotair' },
  // 24 minutes left: in the popup and the hold menu, never on the tile (rule 23.09.2026 for every appliance).
  'sensor.testofen_verbleibende_programmlaufzeit': { state: '0.4' } };
const VIEWS = [
  ['Desktop hell', { width: 1440, height: 1000, scale: 1, dark: false }, 'qa-oven', false],
  ['Desktop dunkel', { width: 1440, height: 1000, scale: 1, dark: true }, 'qa-oven', false],
  ['Handy hell', { width: 393, height: 852, mobile: true, safari: true, scale: 2, dark: false }, 'qa-oven-mobile', true],
  ['Handy dunkel', { width: 393, height: 852, mobile: true, safari: true, scale: 2, dark: true }, 'qa-oven-mobile', true],
];
for (const [tag, o, url, mobile] of VIEWS) {
  const { page } = await open({ ...o, theme: 'Casora' });
  usePage(page);
  await dashboard(page, url, 3);
  const file = (n) => BILDER + '/' + tag.toLowerCase().replace(/\s+/g, '-') + '-' + n + '.png';
  const pic = async (n) => {
    if (!BILDER) return;
    const u = (await page.evaluate(TILES))[0];
    await page.waitForTimeout(500);
    await page.screenshot({ path: file(n), clip: { x: Math.max(0, u.box.l - 16), y: Math.max(0, u.box.t - 16), width: u.box.w + 32, height: u.box.h + 32 } });
  };
  const offen = () => page.evaluate(() => !!(window.casoraPopup && window.casoraPopup.surface)).catch(() => false);
  let tiles = await stable(page, TILES, null, { until: (v) => v && v.length && v[0].state === 'Aus' });
  await need(tag + ': oven tile on the page', tiles && tiles.length, tiles);
  await page.evaluate(() => window.__pierce('ha-toast').forEach((x) => x.remove()));
  await check(tag + ': oven symbol, not the dishwasher', tiles[0].stove && !tiles[0].dish, tiles[0]);
  await check(tag + ': off → „Aus“', tiles[0].state === 'Aus', tiles.map((x) => [x.state, x.inView, Math.round(x.box.l), Math.round(x.box.t)]));
  if (mobile) await check(tag + ': tile inside 393', tiles[0].right <= tiles[0].vw + 1, tiles[0]);
  await pic('aus');

  await fakeStates(page, RUN, { sticky: true });
  tiles = await stable(page, TILES, null, { until: (v) => v && v.length && /Heizt auf/.test(v[0].state), max: 8000 });
  await check(tag + ': running, well below the target → „Heizt auf 180 °C“', tiles && tiles[0].state === 'Heizt auf 180 °C', tiles && tiles[0].state);
  await pic('heizt');
  await fakeStates(page, { 'sensor.testofen_aktuelle_temperatur': { state: '178' } }, { sticky: true });
  tiles = await stable(page, TILES, null, { until: (v) => v && v.length && /^178/.test(v[0].state), max: 8000 });
  await check(tag + ': at temperature → „178 °C“, no time left on the tile', tiles && tiles[0].state === '178 °C', tiles && tiles[0].state);
  await pic('laeuft');

  const at = (await page.evaluate(TILES))[0];
  for (let t = 0; t < 4 && !(await offen()); t++) {
    if (mobile) await page.touchscreen.tap(at.x, at.y); else await page.mouse.click(at.x, at.y);
    for (let w = 0; w < 24 && !(await offen()); w++) await page.waitForTimeout(250);
  }
  await need(tag + ': tap opens a popup', await offen());
  const p = await stable(page, POPUP, null, { until: (v) => v && v.stages.length && v.rows.length >= 3, max: 10000 });
  await check(tag + ': the oven popup (one S4 stage with the cavity 178)', p && p.stages.length === 1 && p.stages[0].code === 'S4' && /178/.test(p.stages[0].t), p && p.stages);
  await check(tag + ': its device plate („Tür“, „Kindersicherung“)', p && p.rows.some((r) => /^Tür/.test(r)) && p.rows.some((r) => /^Kindersicherung/.test(r)), p && p.rows);
  if (mobile) await check(tag + ': popup: nothing wider than 393', p && !p.wide.length, p && p.wide);
  if (BILDER) await page.screenshot({ path: file('popup') });
  await page.context().browser().close().catch(() => {});
}
c.close();
await finish();
