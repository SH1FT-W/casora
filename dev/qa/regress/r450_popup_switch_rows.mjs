// @zustand: arbeit
// @parallel: allein
// @deckt: custom_components/casora/scripts/casora-core.js custom_components/casora/scripts/local/30-fridge.js
// Issue #105: in the fridge/freezer popup the modes (SuperFrost …) showed their state as the word „An“/„Aus“.
// Every row of an on/off entity in a popup is now a switch (UI.row.toggle in casora-core.js, as the light popup's lamp
// rows): tapping it switches the entity, the switch flips at once and follows the real state.
// Uses the made-up fridge-freezer of the test house ("Testfrost", dev/casora_mock/fridge.py) on a copied dashboard.
// Expected:
//   - popup „Modi“: SuperFrost, SuperCool, Nachtmodus, Partymodus each with a switch (role=switch), no „An“/„Aus“ text
//   - tap on the SuperFrost row switches the entity on, the switch shows on (aria-checked=true); tap again → off
//   Everything changed is put back at the end.
// Pictures: CASORA_I105_BILDER=<folder> stores the popup per view.
import fs from 'node:fs';
import { open, casoraDashboards, dashboard, check, need, finish, atFinish, stable, usePage } from './lib.mjs';
import { ws } from '../ws.mjs';

const BILDER = process.env.CASORA_I105_BILDER || '';
if (BILDER) fs.mkdirSync(BILDER, { recursive: true });
const TOP = 'sensor.testfrost_top_zone';
const FROST = 'switch.testfrost_bottom_zone_superfrost';

const c = await ws();
const st0 = (await c.cmd({ type: 'get_states' })).find((s) => s.entity_id === FROST);
await need('test fridge in the house', st0, FROST);
const before = st0.state;
const put = async (cc, v) => cc.cmd({ type: 'call_service', domain: 'switch', service: v === 'on' ? 'turn_on' : 'turn_off', target: { entity_id: FROST } });
await put(c, 'off');
atFinish(async () => { const c2 = await ws(); await put(c2, before); c2.close(); });
const stateOf = async () => (await c.cmd({ type: 'get_states' })).find((s) => s.entity_id === FROST).state;

// Dashboard copies with the fridge tile right behind a home-page tile both layouts show (as r324).
const all = await casoraDashboards();
const anchored = (d) => /"template":(?:\[[^\]]*)?"casora_(?:recipe|battery)"/.test(JSON.stringify((d.config.views || [])[0] || {}));
const desk = all.find((d) => !d.mobile && (d.config.views || []).length > 1 && anchored(d));
const phone = all.find((d) => d.mobile && anchored(d));
await need('Casora dashboards', desk && phone, all.map((d) => d.url));
const TILE = { type: 'custom:button-card', template: 'casora_fridge', entity: TOP, name: 'Gefrierschrank', variables: { icon: 'fridge', size: 'auto' } };
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
await save('qa-i105', D, 'QA Schalterzeilen');
await save('qa-i105-mobile', M, 'QA Schalterzeilen Handy');
atFinish(async () => {
  const c2 = await ws();
  const list = await c2.cmd({ type: 'lovelace/dashboards/list' });
  for (const u of made) { const d = list.find((x) => x.url_path === u); if (d) await c2.cmd({ type: 'lovelace/dashboards/delete', dashboard_id: d.id }); }
  c2.close();
});

const TILES = () => window.__pierce('button-card').filter((b) => [].concat((b._config || {}).template || []).includes('casora_fridge')
  && b.getBoundingClientRect().width > 20).map((b) => {
  b.scrollIntoView({ block: 'center', inline: 'center' });
  const r = b.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
// The mode rows: label, the switch (role=switch) and the words on the right.
const MODES = () => window.__pierce('.hui-srow').filter((n) => n.getBoundingClientRect().height > 0)
  .filter((n) => /^(SuperFrost|SuperCool|Nachtmodus|Partymodus)/.test(n.textContent.replace(/\s+/g, ' ').trim()))
  .map((n) => {
    const sw = n.querySelector('[role="switch"]');
    const b = n.getBoundingClientRect();
    return { text: n.textContent.replace(/\s+/g, ' ').trim(), sw: sw ? sw.getAttribute('aria-checked') : null,
      x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
const VIEWS = [
  ['Desktop hell', { width: 1440, height: 1000, scale: 1, dark: false }, 'qa-i105', false, true],
  ['Handy dunkel', { width: 390, height: 844, mobile: true, safari: true, scale: 2, dark: true }, 'qa-i105-mobile', true, false],
];
for (const [tag, o, url, mobile, act] of VIEWS) {
  const { page } = await open({ ...o, theme: 'Casora' });
  usePage(page);
  await dashboard(page, url, 3);
  const offen = () => page.evaluate(() => !!(window.casoraPopup && window.casoraPopup.surface)).catch(() => false);
  const tiles = await stable(page, TILES, null, { until: (v) => v && v.length });
  await need(tag + ': fridge tile on the page', tiles && tiles.length, tiles);
  for (let t = 0; t < 4 && !(await offen()); t++) {
    if (mobile) await page.touchscreen.tap(tiles[0].x, tiles[0].y); else await page.mouse.click(tiles[0].x, tiles[0].y);
    for (let w = 0; w < 24 && !(await offen()); w++) await page.waitForTimeout(250);
  }
  await need(tag + ': popup opens', await offen());
  let m = await stable(page, MODES, null, { until: (v) => v && v.length >= 4 });
  await page.waitForTimeout(800);
  m = (await page.evaluate(MODES)) || m;
  await check(tag + ': every mode row has a switch', m.length >= 4 && m.every((r) => r.sw === 'true' || r.sw === 'false'), m);
  await check(tag + ': no „An“/„Aus“ word on the mode rows', m.every((r) => !/(An|Aus)$/.test(r.text)), m.map((r) => r.text));
  if (BILDER) await page.screenshot({ path: BILDER + '/' + tag.toLowerCase().replace(/\s+/g, '-') + '.png' });

  if (act) {
    const row = m.find((r) => /^SuperFrost/.test(r.text));
    await need(tag + ': SuperFrost row', row);
    await check(tag + ': SuperFrost switch off at first', row.sw === 'false', row);
    // Taps within 600 ms of the popup opening are swallowed on purpose (02-devices.js OPEN_LOCK, ghost taps).
    await page.waitForTimeout(700);
    await page.mouse.click(row.x, row.y);
    // The switch flips at once (pending), before Home Assistant answers.
    const now = await page.evaluate(MODES);
    const r1 = now.find((r) => /^SuperFrost/.test(r.text));
    let s1 = 'off';
    for (let i = 0; i < 20 && s1 !== 'on'; i++) { await page.waitForTimeout(300); s1 = await stateOf(); }
    await check(tag + ': tapping the SuperFrost row switches it on', s1 === 'on', s1);
    await check(tag + ': the switch flips at once', r1 && r1.sw === 'true', r1);
    const m2 = await stable(page, MODES, null, { until: (v) => v && v.some((r) => /^SuperFrost/.test(r.text) && r.sw === 'true'), max: 8000 });
    await check(tag + ': popup shows SuperFrost on', m2.some((r) => /^SuperFrost/.test(r.text) && r.sw === 'true'), m2);
    if (BILDER) await page.screenshot({ path: BILDER + '/' + tag.toLowerCase().replace(/\s+/g, '-') + '-an.png' });
    // Tap again: off.
    await page.waitForTimeout(700);
    const row2 = m2.find((r) => /^SuperFrost/.test(r.text));
    await page.mouse.click(row2.x, row2.y);
    let s2 = 'on';
    for (let i = 0; i < 20 && s2 !== 'off'; i++) { await page.waitForTimeout(300); s2 = await stateOf(); }
    await check(tag + ': tapping again switches it off', s2 === 'off', s2);
  }
  for (let t = 0; t < 4 && (await offen()); t++) { await page.keyboard.press('Escape'); await page.waitForTimeout(400); }
}
c.close();
await finish();
