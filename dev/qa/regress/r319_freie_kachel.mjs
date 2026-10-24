// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/28-free-tile.js custom_components/casora/panel/casora-panel-types.js
// Reported (issue #52, forum): an own YAML tile for a switch did nothing on tap because no popup could be assigned.
// New: the flexible tile (casora_free) – any entity, popup assembled in the Studio from values, 24 h history,
// the entity's own controls and own cards. On copies of the Casora dashboards (qa-frei, qa-frei-mobile) two tiles
// stand on the home page: one for a switch of the house with four value rows, a chart and controls, one without
// an entity. Entities are picked from the house at run time (nothing hard-coded), nothing is switched.
// Expected on desktop and phone (light + dark, theme Casora):
//   - tile: subline "An"/"Aus" like the other tiles, the entity-less tile shows its name with no state
//   - tap: popup opens with the state line, a casora-chart, "Schalten" segments (Aus/An), "Werte" with 4 rows
//     and "Weitere Einstellungen"; desktop two columns (controls left of values), phone one column
//   - the entity-less tile opens a popup that says "Kein Gerät gewählt" – never an empty popup
// Pictures: CASORA_FREI_BILDER=<folder> stores tile, dashboard and popup pictures per view.
import fs from 'node:fs';
import { open, casoraDashboards, dashboard, check, need, finish, atFinish, stable } from './lib.mjs';
import { ws } from '../ws.mjs';

const BILDER = process.env.CASORA_FREI_BILDER || '';
if (BILDER) fs.mkdirSync(BILDER, { recursive: true });

// ── Entities of the house: a switch, a temperature and a humidity sensor, a door/window contact, a power sensor ──
const c = await ws();
const S = await c.cmd({ type: 'get_states' });
const live = (s) => s && !['unavailable', 'unknown', ''].includes(String(s.state));
const name = (s) => String((s.attributes || {}).friendly_name || s.entity_id);
const sw = S.filter((s) => s.entity_id.startsWith('switch.') && ['on', 'off'].includes(s.state) && !/kindersicherung|childlock|display|indicator|protect|led/i.test(name(s) + s.entity_id))
  .sort((a, b) => (a.state === 'on' ? 0 : 1) - (b.state === 'on' ? 0 : 1))[0];
const pick = (f) => S.filter((s) => live(s) && f(s)).sort((a, b) => name(a).localeCompare(name(b)))[0];
const temp = pick((s) => s.entity_id.startsWith('sensor.') && s.attributes.device_class === 'temperature' && isFinite(parseFloat(s.state)));
const hum = pick((s) => s.entity_id.startsWith('sensor.') && s.attributes.device_class === 'humidity' && isFinite(parseFloat(s.state)));
const door = pick((s) => s.entity_id.startsWith('binary_sensor.') && ['door', 'window'].includes(s.attributes.device_class) && ['on', 'off'].includes(s.state));
const power = pick((s) => s.entity_id.startsWith('sensor.') && s.attributes.device_class === 'power' && isFinite(parseFloat(s.state)));
await need('switch, temperature, humidity, contact and power sensor in the house', sw && temp && hum && door && power,
  { sw: !!sw, temp: !!temp, hum: !!hum, door: !!door, power: !!power });
const WANT = sw.state === 'on' ? 'An' : 'Aus';

// ── Dashboards: copies with both tiles right behind a home-page tile (recipe, else batteries) ──
const ANCHOR = ['casora_recipe', 'casora_battery'];
const tplOf = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? [].concat(x.template || []) : []);
const has = (d) => (d.config.views || []).some((v) => ANCHOR.some((a) => JSON.stringify(v).includes('"' + a + '"')));
const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && has(d));
const phone = all.find((d) => d.mobile && has(d));
await need('dashboards with a recipe or batteries tile', desk && phone, all.map((d) => d.url));

const TILE_A = { type: 'custom:button-card', template: 'casora_free', entity: sw.entity_id, name: name(sw),
  variables: { icon: 'default', size: 'auto', free_values: [temp.entity_id, hum.entity_id, door.entity_id, power.entity_id],
    free_value_labels: { [temp.entity_id]: 'Innen' }, free_chart: true, free_chart_entity: temp.entity_id, free_controls: true } };
const TILE_B = { type: 'custom:button-card', template: 'casora_free', entity: '', name: 'Universal-Kachel', variables: { icon: 'default', size: 'auto' } };
const withTiles = (cfg) => {
  const o = JSON.parse(JSON.stringify(cfg));
  let done = false, view = null;
  (function walk(x, vi) {
    if (done || !x || typeof x !== 'object') return;
    if (Array.isArray(x)) {
      for (let i = 0; i < x.length && !done; i++) {
        if (tplOf(x[i]).some((t) => ANCHOR.includes(t))) {
          x.splice(i + 1, 0, JSON.parse(JSON.stringify(TILE_A)), JSON.parse(JSON.stringify(TILE_B)));
          done = true; view = vi;
          return;
        }
        walk(x[i], vi);
      }
      return;
    }
    Object.keys(x).forEach((k) => walk(x[k], vi));
  })(o.views, null);
  o.views.forEach((v, i) => { if (view === null && JSON.stringify(v).includes('casora_free')) view = v.path || i; });
  return { config: o, view };
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
const D = withTiles(desk.config), M = withTiles(phone.config);
await need('tiles inserted', D.view !== null && M.view !== null);
await save('qa-frei', D.config, 'QA Universal-Kachel');
await save('qa-frei-mobile', M.config, 'QA Universal-Kachel Handy');
atFinish(async () => {
  const c2 = await ws();
  const list = await c2.cmd({ type: 'lovelace/dashboards/list' });
  for (const u of made) { const d = list.find((x) => x.url_path === u); if (d) await c2.cmd({ type: 'lovelace/dashboards/delete', dashboard_id: d.id }); }
  c2.close();
});
c.close();

// ── In the browser ──
// which: entity id to bring into view before measuring ('' = the tile without one); nothing scrolls otherwise.
const TILES = (which) => window.__pierce('button-card').filter((b) => [].concat((b._config || {}).template || []).includes('casora_free')
  && b.getBoundingClientRect().width > 20).map((b) => {
  if (which !== undefined && which !== null && ((b._config || {}).entity || '') === which) b.scrollIntoView({ block: 'center', inline: 'center' });
  const sr = b.shadowRoot, r = b.getBoundingClientRect();
  const st = sr && sr.querySelector('#state'), nm = sr && sr.querySelector('#name');
  return { entity: (b._config || {}).entity || '', x: r.x + r.width / 2, y: r.y + r.height / 2,
    box: { l: r.left, t: r.top, w: r.width, h: r.height }, state: st ? st.textContent.trim() : '', name: nm ? nm.textContent.trim() : '',
    active: sr ? getComputedStyle(sr.querySelector('ha-card')).getPropertyValue('--casora-active-overlay-opacity').trim() === '1' : null };
});
const POPUP = () => {
  const txt = (sel) => window.__pierce(sel).filter((n) => n.getBoundingClientRect().height > 0).map((n) => n.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const box = (sel, re) => { const n = window.__pierce(sel).find((x) => re.test(x.textContent.trim()) && x.getBoundingClientRect().height > 0); return n ? n.getBoundingClientRect() : null; };
  const line = (window.__pierce('.hui-line')[0] || {}).textContent || '';
  const segs = txt('.hui-sg');
  const rows = window.__pierce('.hui-srow').filter((r) => r.getBoundingClientRect().height > 0);
  const vals = box('.hui-slbl', /^Werte$/), ctl = box('.hui-slbl', /^Schalten$/);
  const surface = window.casoraPopup && window.casoraPopup.surface;
  return { line: line.replace(/\s+/g, ' ').trim(), labels: txt('.hui-slbl'), segs, rows: rows.length,
    chart: window.__pierce('casora-chart').some((n) => n.getBoundingClientRect().height > 0),
    rowText: rows.map((r) => r.textContent.replace(/\s+/g, ' ').trim()),
    vals: vals ? { x: vals.left, y: vals.top } : null, ctl: ctl ? { x: ctl.left, y: ctl.top } : null,
    notes: window.__pierce('div').filter((n) => /^(Wähle im Studio ein Gerät|Im Studio kannst du)/.test(n.textContent.trim()) && n.getBoundingClientRect().height > 0).length,
    width: surface ? surface.getBoundingClientRect().width : null };
};

const VIEWS = [
  ['Desktop hell', { width: 1440, height: 1000, scale: 1, dark: false }, 'qa-frei', D.view, false],
  ['Desktop dunkel', { width: 1440, height: 1000, scale: 1, dark: true }, 'qa-frei', D.view, false],
  ['Handy hell', { width: 390, height: 844, mobile: true, safari: true, scale: 2, dark: false }, 'qa-frei-mobile', M.view, true],
  ['Handy dunkel', { width: 390, height: 844, mobile: true, safari: true, scale: 2, dark: true }, 'qa-frei-mobile', M.view, true],
];
for (const [tag, o, url, view, mobile] of VIEWS) {
  const { page } = await open({ ...o, theme: 'Casora' });
  await dashboard(page, url + '/' + view, 3);
  const file = (n) => BILDER + '/' + tag.toLowerCase().replace(/\s+/g, '-') + '-' + n + '.png';
  const offen = () => page.evaluate(() => !!(window.casoraPopup && window.casoraPopup.surface)).catch(() => false);
  const tap = async (at) => {
    for (let t = 0; t < 4 && !(await offen()); t++) {
      if (mobile) await page.touchscreen.tap(at.x, at.y); else await page.mouse.click(at.x, at.y);
      for (let w = 0; w < 24 && !(await offen()); w++) await page.waitForTimeout(250);
    }
  };
  const close = async () => {
    for (let t = 0; t < 4 && (await offen()); t++) { await page.keyboard.press('Escape'); await page.waitForTimeout(400); }
    await page.evaluate(() => { try { window.casoraPopup.close(); } catch (e) { /* closed */ } });
    await page.waitForTimeout(600);
  };

  const tiles = await stable(page, TILES, null, { until: (v) => v && v.length === 2 && v.every((t) => t.name) });
  await need(tag + ': both tiles on the page', tiles && tiles.length === 2, tiles);
  const A = tiles.find((t) => t.entity === sw.entity_id), B = tiles.find((t) => !t.entity);
  await need(tag + ': tile with entity and tile without', A && B, tiles);
  await check(tag + ': subline is the state word („' + WANT + '“)', A.state === WANT, A.state);
  await check(tag + ': highlighted exactly when on', A.active === (sw.state === 'on'), A.active);
  await check(tag + ': tile without entity shows its name and no state', B.name === 'Universal-Kachel' && B.state === '', B);
  // Picture of one tile with its neighbours (scrolled into view first – the desktop row is paged).
  const tileShot = async (which, n) => {
    if (!BILDER) return;
    await page.evaluate(() => window.__pierce('ha-toast').forEach((t) => t.remove()));
    const t = (await page.evaluate(TILES, which)).find((x) => x.entity === which);
    await page.waitForTimeout(400);
    const u = (await page.evaluate(TILES)).find((x) => x.entity === which) || t;
    if (u) await page.screenshot({ path: file(n), clip: { x: Math.max(0, u.box.l - 16), y: Math.max(0, u.box.t - 16), width: u.box.w + 32, height: u.box.h + 32 } });
  };
  if (BILDER) {
    // The test house greets with a toast ("Hemma 2 gibt es nicht mehr …") that would cover the tiles in the pictures.
    await page.evaluate(() => { window.scrollTo(0, 0); window.__pierce('ha-toast').forEach((t) => t.remove()); });
    await page.screenshot({ path: file('dashboard') });
    await tileShot(sw.entity_id, 'kachel');
    await tileShot('', 'kachel-leer');
  }

  // Popup of the switch tile (tile scrolled into view first: the row may run past the right edge).
  const at = async (which) => { const t = (await page.evaluate(TILES, which)).find((x) => x.entity === which); await page.waitForTimeout(300); return t || (await page.evaluate(TILES, which)).find((x) => x.entity === which); };
  await tap(await at(sw.entity_id));
  await need(tag + ': popup opens', await offen());
  const p = await stable(page, POPUP, null, { until: (v) => v && v.chart && v.rows >= 5 });
  await check(tag + ': state line „' + WANT + '“', new RegExp('^' + WANT + '\\b').test(p.line), p.line);
  await check(tag + ': history chart', p.chart, p.chart);
  await check(tag + ': „Schalten“ with Aus/An segments', p.ctl && p.segs.includes('Aus') && p.segs.includes('An'), p.segs);
  await check(tag + ': „Werte“ with 4 rows and „Weitere Einstellungen“', p.vals && p.rows === 5 && p.rowText.some((t) => /Weitere Einstellungen/.test(t)), p.rowText);
  await check(tag + ': own label „Innen“ with the temperature', p.rowText.some((t) => /^Innen/.test(t) && /°C/.test(t)), p.rowText);
  await check(tag + ': contact row in words (Geöffnet/Geschlossen), not on/off', p.rowText.some((t) => /Geöffnet|Geschlossen/.test(t)) && !p.rowText.some((t) => /\b(on|off)$/.test(t)), p.rowText);
  if (mobile) await check(tag + ': phone one column – controls above values', p.ctl && p.vals && Math.abs(p.ctl.x - p.vals.x) < 4 && p.vals.y > p.ctl.y, { ctl: p.ctl, vals: p.vals });
  // Headings level: the segment label and the group label differ by their box padding (8 px), the text sits on one line.
  else await check(tag + ': desktop two columns – controls left of values', p.ctl && p.vals && p.vals.x > p.ctl.x + 200 && Math.abs(p.vals.y - p.ctl.y) < 12, { ctl: p.ctl, vals: p.vals, width: p.width });
  if (BILDER) { await page.waitForTimeout(600); await page.screenshot({ path: file('popup') }); }
  await close();

  // Popup of the tile without an entity: never empty.
  await tap((await at('')) || B);
  await need(tag + ': popup of the empty tile opens', await offen());
  const q = await stable(page, POPUP, null, { until: (v) => v && /Kein Gerät gewählt/.test(v.line) });
  await check(tag + ': empty tile says „Kein Gerät gewählt“ with a hint', /Kein Gerät gewählt/.test(q.line) && q.notes >= 1, q);
  if (BILDER) { await page.waitForTimeout(600); await page.screenshot({ path: file('popup-leer') }); }
  await close();
}
await finish();
