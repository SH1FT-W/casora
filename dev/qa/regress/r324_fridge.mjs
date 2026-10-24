// @zustand: arbeit
// @parallel: allein
// @deckt: custom_components/casora/scripts/local/30-fridge.js custom_components/casora/scripts/local/00-finder.js dev/casora_mock/fridge.py
// New (24.10.2026): the fridge card (casora_fridge) for Liebherr, Home Connect and generically named fridges.
// The test house has a made-up Liebherr-like fridge-freezer ("Testfrost", dev/casora_mock/fridge.py).
// Expected:
//   - Studio: "Kachel hinzufügen" → "Kühlschrank" suggests the fridge as the matching device without any choice
//     ("Passendes Gerät gefunden"), the new tile takes its zone sensor and shows "7 °C · −18 °C" (nothing saved)
//   - dashboard (copies qa-fridge / qa-fridge-mobile with the tile on the home page): tile "7 °C · −18 °C";
//     tap → popup with status line, 24 h chart, "Temperaturen" (both zones), setpoint pills, "Modi"
//     (SuperCool, SuperFrost, Nachtmodus, Partymodus); toggling SuperFrost switches it and the tile says
//     "SuperFrost · …"; a setpoint pill sets the number. Desktop two columns, phone one column.
//   Everything changed is put back at the end.
// Pictures: CASORA_FRIDGE_BILDER=<folder> stores Studio, tile and popup pictures per view.
import fs from 'node:fs';
import { open, studio, casoraDashboards, dashboard, check, need, finish, atFinish, stable, usePage } from './lib.mjs';
import { ws } from '../ws.mjs';

const BILDER = process.env.CASORA_FRIDGE_BILDER || '';
if (BILDER) fs.mkdirSync(BILDER, { recursive: true });
const TOP = 'sensor.testfrost_top_zone';
const FROST = 'switch.testfrost_bottom_zone_superfrost';
const SET_TOP = 'number.testfrost_top_zone_setpoint';

const c = await ws();
const S0 = await c.cmd({ type: 'get_states' });
const st0 = (id) => S0.find((s) => s.entity_id === id);
await need('test fridge in the house', st0(TOP) && st0(FROST) && st0(SET_TOP), [TOP, FROST, SET_TOP].map((x) => !!st0(x)));
const before = { frost: st0(FROST).state, set: st0(SET_TOP).state };
atFinish(async () => {
  const c2 = await ws();
  await c2.cmd({ type: 'call_service', domain: 'switch', service: before.frost === 'on' ? 'turn_on' : 'turn_off', target: { entity_id: FROST } });
  await c2.cmd({ type: 'call_service', domain: 'number', service: 'set_value', service_data: { value: parseFloat(before.set) }, target: { entity_id: SET_TOP } });
  c2.close();
});

// ── Studio: add the tile without choosing anything ──
const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && (d.config.views || []).length > 1);
const phone = all.find((d) => d.mobile);
await need('Casora dashboards', desk && phone, all.map((d) => d.url));
{
  const o = await open({ width: 1600, height: 1000, dark: true });
  usePage(o.page);
  const H = (fn, a) => o.page.evaluate(fn, a);
  await studio(o.page, desk.url);
  await H(async () => { const p = window.__panel(); p._room = 0; p._sel = null; p._renderTabs(); p._syncPreview();
    await new Promise((r) => setTimeout(r, 800)); });
  const n0 = await H(() => { const p = window.__panel(); return p._state.compact.rooms[0].tiles.length; });
  // The add flow of the type list (as rf01): the dialog asks with the suggested device.
  const asked = H(async () => {
    const p = window.__panel(), I = window.__casoraPanelInternals;
    const type = I.TILE_TYPES.find((t) => t.id === 'casora_fridge');
    const room = p._state.compact.rooms[0];
    window.__qaFridgeDone = await p._addTileAsk(room, type);
    p._renderForm && p._renderForm(); p._syncPreview && p._syncPreview();
  });
  // The dialog says "Passendes Gerät gefunden" exactly when the first candidate is sure (casora-panel.js _addTileAsk).
  const cand = await H(() => { const p = window.__panel(), I = window.__casoraPanelInternals;
    const c = p._tileCandidates(I.TILE_TYPES.find((t) => t.id === 'casora_fridge'), p._state.compact.rooms[0]);
    return c.map((x) => ({ id: x.id, sure: x.sure })); });
  await check('Studio: the fridge is the sure first match', cand[0] && cand[0].id === TOP && cand[0].sure, cand);
  const pick = await H(() => window.__pierce('*').filter((n) => n.getClientRects().length && /Testfrost/.test(n.textContent || '') && n.children.length === 0)
    .map((n) => n.textContent.trim()));
  await check('Studio: suggests the test fridge', pick.some((t) => /Testfrost/.test(t)), pick);
  if (BILDER) await o.page.screenshot({ path: BILDER + '/studio-vorschlag.png' });
  const take = o.page.getByRole('button', { name: /^(Übernehmen|Use)$/ });
  if (await take.count()) await take.last().click();
  await asked;
  await o.page.waitForTimeout(1500);
  const t = await H(() => { const p = window.__panel(); const ts = p._state.compact.rooms[0].tiles; return { n: ts.length, last: ts[ts.length - 1] }; });
  await check('Studio: tile added with the fridge\'s zone sensor', t.n === n0 + 1 && t.last.template === 'casora_fridge' && t.last.entity === TOP, t);
  const shown = await stable(o.page, () => window.__pierce('.mstate').map((n) => n.textContent.trim()).filter((x) => /°C/.test(x)), null,
    { until: (v) => v && v.some((x) => /7 °C · −18 °C/.test(x)), max: 10000 });
  await check('Studio: preview shows "7 °C · −18 °C"', (shown || []).some((x) => /7 °C · −18 °C/.test(x)), shown);
  if (BILDER) {
    await H(() => { const p = window.__panel(); const ts = p._state.compact.rooms[0].tiles; p._sel = { tile: ts.length - 1 }; p._renderForm && p._renderForm(); });
    await o.page.waitForTimeout(900);
    await o.page.screenshot({ path: BILDER + '/studio.png' });
  }
  await o.browser.close().catch(() => {});
}

// ── Dashboards: copies with the tile on the home page (first tile list) ──
const TILE = { type: 'custom:button-card', template: 'casora_fridge', entity: TOP, name: 'Kühlschrank', variables: { icon: 'fridge', size: 'auto' } };
const withTile = (cfg) => {
  const o = JSON.parse(JSON.stringify(cfg));
  let done = false;
  (function walk(x) {
    if (done || !x || typeof x !== 'object') return;
    if (Array.isArray(x)) {
      // Right behind a home-page tile both layouts show (recipe, else batteries), as r319.
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
await save('qa-fridge', D, 'QA Kühlschrank');
await save('qa-fridge-mobile', M, 'QA Kühlschrank Handy');
atFinish(async () => {
  const c2 = await ws();
  const list = await c2.cmd({ type: 'lovelace/dashboards/list' });
  for (const u of made) { const d = list.find((x) => x.url_path === u); if (d) await c2.cmd({ type: 'lovelace/dashboards/delete', dashboard_id: d.id }); }
  c2.close();
});
const stateOf = async (id) => (await c.cmd({ type: 'get_states' })).find((s) => s.entity_id === id).state;

const TILES = () => window.__pierce('button-card').filter((b) => [].concat((b._config || {}).template || []).includes('casora_fridge')
  && b.getBoundingClientRect().width > 20).map((b) => {
  b.scrollIntoView({ block: 'center', inline: 'center' });
  const sr = b.shadowRoot, r = b.getBoundingClientRect(), stt = sr && sr.querySelector('#state');
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, box: { l: r.left, t: r.top, w: r.width, h: r.height }, state: stt ? stt.textContent.trim() : '' };
});
const POPUP = () => {
  const vis = (n) => n.getBoundingClientRect().height > 0;
  const labels = window.__pierce('.hui-slbl').filter(vis).map((n) => ({ t: n.textContent.trim(), x: n.getBoundingClientRect().left, y: n.getBoundingClientRect().top }));
  return { line: ((window.__pierce('.hui-line')[0] || {}).textContent || '').replace(/\s+/g, ' ').trim(), labels,
    rows: window.__pierce('.hui-srow').filter(vis).map((r) => r.textContent.replace(/\s+/g, ' ').trim()),
    segs: window.__pierce('.hui-sg').filter(vis).map((n) => n.textContent.trim()),
    chart: window.__pierce('casora-chart').some(vis) };
};
const VIEWS = [
  ['Desktop dunkel', { width: 1440, height: 1000, scale: 1, dark: true }, 'qa-fridge', false, true],
  ['Handy dunkel', { width: 390, height: 844, mobile: true, safari: true, scale: 2, dark: true }, 'qa-fridge-mobile', true, false],
];
for (const [tag, o, url, mobile, act] of VIEWS) {
  const { page } = await open({ ...o, theme: 'Casora' });
  usePage(page);
  await dashboard(page, url, 3);
  const file = (n) => BILDER + '/' + tag.toLowerCase().replace(/\s+/g, '-') + '-' + n + '.png';
  const offen = () => page.evaluate(() => !!(window.casoraPopup && window.casoraPopup.surface)).catch(() => false);
  const tiles = await stable(page, TILES, null, { until: (v) => v && v.length && /°C/.test(v[0].state) });
  await need(tag + ': fridge tile on the page', tiles && tiles.length, tiles);
  await check(tag + ': tile "7 °C · −18 °C"', /7 °C · −18 °C/.test(tiles[0].state) || /7° · −18°/.test(tiles[0].state), tiles[0].state);
  await page.evaluate(() => window.__pierce('ha-toast').forEach((t) => t.remove()));
  if (BILDER) {
    const u = (await page.evaluate(TILES))[0];
    await page.waitForTimeout(400);
    await page.screenshot({ path: file('kachel'), clip: { x: Math.max(0, u.box.l - 16), y: Math.max(0, u.box.t - 16), width: u.box.w + 32, height: u.box.h + 32 } });
  }
  const at = (await page.evaluate(TILES))[0];
  for (let t = 0; t < 4 && !(await offen()); t++) {
    if (mobile) await page.touchscreen.tap(at.x, at.y); else await page.mouse.click(at.x, at.y);
    for (let w = 0; w < 24 && !(await offen()); w++) await page.waitForTimeout(250);
  }
  await need(tag + ': popup opens', await offen());
  const p = await stable(page, POPUP, null, { until: (v) => v && v.chart && v.rows.length >= 6 && v.segs.length >= 10 });
  await check(tag + ': status line with both zones', /7 °C · −18 °C/.test(p.line), p.line);
  await check(tag + ': 24 h chart', p.chart);
  await check(tag + ': "Temperaturen" with both zones', p.rows.some((r) => /^Obere Zone/.test(r) && /7 °C/.test(r)) && p.rows.some((r) => /^Untere Zone/.test(r) && /−18 °C/.test(r)), p.rows);
  await check(tag + ': modes as rows', ['SuperCool', 'SuperFrost', 'Nachtmodus', 'Partymodus'].every((m) => p.rows.some((r) => r.startsWith(m))), p.rows);
  await check(tag + ': setpoint pills', p.segs.includes('5°') && p.segs.includes('−18°'), p.segs);
  const lab = (t) => p.labels.find((l) => l.t === t);
  if (mobile) await check(tag + ': one column (Temperaturen above Modi)', lab('Temperaturen') && lab('Modi') && Math.abs(lab('Temperaturen').x - lab('Modi').x) < 4 && lab('Modi').y > lab('Temperaturen').y, p.labels);
  else await check(tag + ': two columns (zones left, modes right)', lab('Temperaturen') && lab('Modi') && lab('Modi').x > lab('Temperaturen').x + 200, p.labels);
  if (BILDER) { await page.waitForTimeout(800); await page.screenshot({ path: file('popup') }); }

  if (act) {
    // Toggle SuperFrost: tap its row.
    const row = await page.evaluate(() => { const r = window.__pierce('.hui-srow').find((n) => /^SuperFrost/.test(n.textContent.replace(/\s+/g, ' ').trim()) && n.getBoundingClientRect().height > 0);
      if (!r) return null; r.scrollIntoView({ block: 'center' }); const b = r.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
    await need(tag + ': SuperFrost row', row);
    await page.mouse.click(row.x, row.y);
    let fs1 = before.frost;
    for (let i = 0; i < 20 && fs1 === before.frost; i++) { await page.waitForTimeout(300); fs1 = await stateOf(FROST); }
    await check(tag + ': tapping SuperFrost switches it', fs1 !== before.frost, fs1);
    const p2 = await stable(page, POPUP, null, { until: (v) => v && v.rows.some((r) => /^SuperFrost.*An/.test(r)), max: 8000 });
    await check(tag + ': popup shows SuperFrost on', p2.rows.some((r) => /^SuperFrost.*An/.test(r)), p2.rows);
    // Setpoint: the "4°" pill of the top zone.
    const pill = await page.evaluate(() => { const n = window.__pierce('.hui-sg').find((x) => x.textContent.trim() === '4°' && x.getBoundingClientRect().height > 0);
      if (!n) return null; n.scrollIntoView({ block: 'center' }); const b = n.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
    await need(tag + ': setpoint pill 4°', pill);
    // The popup ignores a second tap within 400 ms of the last one: wait, then tap (again, if the first was swallowed).
    let sv = before.set;
    for (let t = 0; t < 3 && parseFloat(sv) !== 4; t++) {
      await page.waitForTimeout(700);
      await page.mouse.click(pill.x, pill.y);
      for (let i = 0; i < 10 && parseFloat(sv) !== 4; i++) { await page.waitForTimeout(300); sv = await stateOf(SET_TOP); }
    }
    await check(tag + ': setpoint pill sets the top zone to 4 °C', parseFloat(sv) === 4, sv);
    if (BILDER) { await page.waitForTimeout(800); await page.screenshot({ path: file('popup-superfrost') }); }
    for (let t = 0; t < 4 && (await offen()); t++) { await page.keyboard.press('Escape'); await page.waitForTimeout(400); }
    const t2 = await stable(page, TILES, null, { until: (v) => v && v.length && /SuperFrost/.test(v[0].state), max: 8000 });
    await check(tag + ': tile says SuperFrost', t2 && /SuperFrost/.test(t2[0].state), t2 && t2[0].state);
    if (BILDER) {
      const u = (await page.evaluate(TILES))[0];
      await page.waitForTimeout(400);
      await page.screenshot({ path: file('kachel-superfrost'), clip: { x: Math.max(0, u.box.l - 16), y: Math.max(0, u.box.t - 16), width: u.box.w + 32, height: u.box.h + 32 } });
    }
    await c.cmd({ type: 'call_service', domain: 'switch', service: before.frost === 'on' ? 'turn_on' : 'turn_off', target: { entity_id: FROST } });
    await c.cmd({ type: 'call_service', domain: 'number', service: 'set_value', service_data: { value: parseFloat(before.set) }, target: { entity_id: SET_TOP } });
  }
}
c.close();
await finish();
