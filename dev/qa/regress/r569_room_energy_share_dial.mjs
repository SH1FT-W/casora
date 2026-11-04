// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/05-weich-mehr.js#houseShare,houseIds,stage3,build
// Owner decision 04.11.2026 (variant B): in a ROOM's energy popup the stage is a dial whose ring is the room's share
// of the house's consumption now; the value stays („155 W“), under it „18 % vom Haus“. The house is HA's energy
// settings (grid + solar). Expected (desktop 1440, phone 393): room 155 W of a house of 860 W → dial, ring 18 %;
// room and house change → ring and line follow without redrawing the stage; the room above the house → 100 %, never
// more; no energy settings → the plate with „Jetzt“ as before; the house popup keeps its energy flow.
// HA's energy settings are answered in the browser, the sensors faked, the room's energy fields set in the dashboard
// config as the browser receives it (as r353); nothing is saved in HA. Made-up ids only (sensor.qa_er_*).
//   R569_SHOTS=<dir> R569_TAG=<name>: pictures of the room popup (desktop/phone, dark/light).
import { open, casoraDashboard, dashboard, fakeStates, check, need, finish } from './lib.mjs';
import { MEASURE_GEO } from '../popup-geo.mjs';

const dash = await casoraDashboard((d) => (d.config.views || []).length > 1);
await need('Casora dashboard with Home and rooms', dash);

const P = (v, u = 'W', name) => ({ state: String(v), attributes: { unit_of_measurement: u, device_class: 'power', state_class: 'measurement', friendly_name: name } });
const PREFS = { energy_sources: [{ type: 'grid', stat_energy_from: 'sensor.qa_er_import', stat_rate: 'sensor.qa_er_grid' },
  { type: 'solar', stat_energy_from: 'sensor.qa_er_pv_total', stat_rate: 'sensor.qa_er_pv' }] };
const ROOM = { energy_entities: ['sensor.qa_er_aquarium', 'sensor.qa_er_dishwasher'] };
const HOUSE = { energy_entities: ['sensor.qa_er_grid', 'sensor.qa_er_pv'] };
const STATES = { 'sensor.qa_er_grid': P(560, 'W', 'Netz Leistung'), 'sensor.qa_er_pv': P(300, 'W', 'PV Leistung'),
  'sensor.qa_er_aquarium': P(113, 'W', 'Aquarium Leistung'), 'sensor.qa_er_dishwasher': P(42, 'W', 'Geschirrspüler Leistung') };

// Browser side (as r353): answer energy/get_prefs and set the energy fields of the given view's casora_room.
const INIT = () => {
  let cfg = null;
  try { cfg = JSON.parse(localStorage.getItem('qa_r569') || 'null'); } catch (e) { cfg = null; }
  if (!cfg) return;
  const WS = window.WebSocket, pend = new Map(), done = new WeakMap();
  const setVars = (V) => {
    Object.keys(V).forEach((k) => { if (/^energy_|^casora_energy_/.test(k) && k !== 'energy_title') delete V[k]; });
    Object.assign(V, cfg.vars, { show_energy: true });
  };
  const patch = (c, type) => {
    if (type === 'phone') { if (cfg.view === 0 && c && c.home) setVars(c.home); return; }
    const walk = (x, vi) => {
      if (!x || typeof x !== 'object') return;
      if (Array.isArray(x)) { x.forEach((y) => walk(y, vi)); return; }
      if ([].concat(x.template || []).includes('casora_room') && x.variables && vi === cfg.view) setVars(x.variables);
      Object.keys(x).forEach((k) => walk(x[k], vi));
    };
    ((c && c.views) || []).forEach((v, i) => walk(v, i));
  };
  const fix = (m) => {
    if (m && m.type === 'result' && pend.has(m.id)) { const t = pend.get(m.id); pend.delete(m.id); if (m.success) patch(m.result, t); }
    return m;
  };
  window.WebSocket = class extends WS {
    addEventListener(t, fn, o) {
      if (t !== 'message') return super.addEventListener(t, fn, o);
      return super.addEventListener(t, (ev) => {
        if (!done.has(ev)) {
          let d = null; try { d = JSON.parse(ev.data); } catch (e) { d = null; }
          done.set(ev, d == null ? ev : new MessageEvent('message', { data: JSON.stringify(Array.isArray(d) ? d.map(fix) : fix(d)) }));
        }
        return fn.call(this, done.get(ev));
      }, o);
    }
    send(d) {
      if (typeof d === 'string' && d.indexOf('"energy/get_prefs"') > -1) {
        const m = JSON.parse(d);
        setTimeout(() => this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(cfg.prefs === 'none'
          ? { id: m.id, type: 'result', success: false, error: { code: 'not_found', message: 'No prefs' } }
          : { id: m.id, type: 'result', success: true, result: cfg.prefs }) })), 0);
        return;
      }
      if (typeof d === 'string' && d.indexOf('"lovelace/config"') > -1) { try { pend.set(JSON.parse(d).id, 'config'); } catch (e) { /* plain */ } }
      if (typeof d === 'string' && d.indexOf('"casora/phone_room_badges"') > -1) { try { pend.set(JSON.parse(d).id, 'phone'); } catch (e) { /* plain */ } }
      return super.send(d);
    }
  };
};

// The open popup's stage: kind, ring, value and line.
const READ = () => {
  const s = window.casoraPopup && window.casoraPopup.surface;
  if (!s) return null;
  const st = window.__pierce('[data-casora-stage]', s).find((n) => n.getBoundingClientRect().height > 0);
  if (!st) return { open: true };
  const dl = st.querySelector('.hui-dl'), tx = (q) => { const n = st.querySelector(q); return n ? n.textContent.replace(/\s+/g, ' ').trim() : null; };
  if (!st.__qa569) st.__qa569 = Date.now();
  return { open: true, code: st.getAttribute('data-casora-stage'), dial: st.getAttribute('data-casora-dial'), pct: dl ? parseFloat(dl.dataset.pct) : null,
    value: tx('.hui-st-n'), unit: tx('.hui-st-u'), line: dl ? tx('.hui-dl .hui-st-w') : tx('.hui-st-trend'), mark: st.__qa569,
    e1: !!window.__pierce('[data-casora-kind="e1"]', s).find((n) => n.getBoundingClientRect().height > 0) };
};
const BADGE = () => {
  const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).some((t) => t === 'casora_badge_energy_group' || t === 'casora_badge_energy')
    && x.getBoundingClientRect().width > 0 && (!x.checkVisibility || x.checkVisibility({ opacityProperty: true, visibilityProperty: true })));
  if (!b) return null;
  b.scrollIntoView({ block: 'nearest', inline: 'center' });
  const r = b.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
};

// The phone's room page (r44): the desktop room's key on the phone dashboard.
const phoneKey = () => {
  const name = (((dash.config.views[1] || {}).cards || [])[0] || {}).name;
  const kids = ((((dash.phone || {}).config || {}).views || [])[0] || { cards: [] }).cards[1];
  const ov = ((kids && kids.cards) || []).find((k) => k && k.type === 'custom:casora-filter-overlay' && k.room === name);
  return name ? (ov && ov.filter_category) || 'room_' + String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '') : null;
};

async function popup({ view, vars, prefs = PREFS, size = [1440, 900], dark = true, mobile = false }) {
  const o = await open({ width: size[0], height: size[1], theme: 'Casora', dark, mobile, safari: mobile });
  await o.context.addInitScript(INIT);
  const page = o.page;
  // Phone: the phone dashboard, the room chosen in its filter, the room's badge fields set in the browser (as r44).
  const url = mobile ? dash.phone.url + '/' + (dash.phone.config.views[0].path || '0') : dash.url + '/' + view;
  await page.goto(new URL('/' + url, process.env.CASORA_URL || 'http://localhost:8124').href);
  await page.evaluate((c) => { Object.keys(localStorage).filter((k) => k.indexOf('casora.phoneRooms.') === 0).forEach((k) => localStorage.removeItem(k));
    localStorage.setItem('qa_r569', JSON.stringify(c)); }, { prefs, vars, view: mobile ? -1 : view });
  await dashboard(page, url + '?qa=' + Date.now(), 3);
  // The test house's own energy meters and solar bank stay out (as r353).
  const hide = await page.evaluate(() => Object.keys(document.querySelector('home-assistant').hass.states).filter((id) => /solarbank|system_home|iometer|smart_meter/.test(id)));
  await fakeStates(page, { ...Object.fromEntries(hide.map((id) => [id, null])), ...STATES }, { sticky: true });
  await page.evaluate(async () => { const h = document.querySelector('home-assistant').hass; if (window.casoraEnergyPrefs) await window.casoraEnergyPrefs.load(h, true); });
  if (mobile) {
    await page.evaluate(async ([u, key, vars]) => {
      const server = await document.querySelector('home-assistant').hass.callWS({ type: 'casora/phone_room_badges', url_path: u });
      const R = server && server.rooms && server.rooms[key];
      if (!R) return 'no room ' + key + ' in ' + Object.keys((server && server.rooms) || {}).join(',');
      const V = R.vars || (R.vars = {});
      Object.keys(V).forEach((k) => { if (/^energy_|^casora_energy_/.test(k) && k !== 'energy_title') delete V[k]; });
      Object.assign(V, vars, { show_energy: true });
      window.casoraPhoneRoom.prime(server.rooms);
      window._casoraFilter.set(key);
      return null;
    }, [dash.phone.url, phoneKey(), vars]).then((e) => e && console.log('  info   phone: ' + e));
    await page.waitForTimeout(3000);
  }
  let b = null;
  for (let i = 0; i < 20 && !b; i++) { b = await page.evaluate(BADGE); if (!b) await page.waitForTimeout(400); }
  if (!b) { console.log('  info   no energy badge'); return { page, browser: o.browser, r: null }; }
  if (mobile) await page.touchscreen.tap(b.x, b.y); else await page.mouse.click(b.x, b.y);
  let r = null;
  for (let i = 0; i < 25; i++) { r = await page.evaluate(READ); if (r && r.code && r.value) break; await page.waitForTimeout(400); }
  await page.waitForTimeout(1200);
  return { page, browser: o.browser, r: await page.evaluate(READ) };
}
const near = (a, b) => a != null && Math.abs(a - b) <= 0.5;

// 1. Room with the house known: the dial, its share, live.
{
  const { page, browser, r } = await popup({ view: 1, vars: ROOM });
  if (await check('room popup open with an S6 stage', r && r.code === 'S6', r)) {
    await check('room: the stage is a dial (level ring)', r.dial === 'level', r);
    await check('room: value stays „155 W“', r.value === '155' && r.unit === 'W', r);
    await check('room: ring = 155 of 860 W (18 %)', near(r.pct, 155 / 860 * 100), r);
    await check('room: line „18 % vom Haus“', r.line === '18 % vom Haus', r);
    // The middle stays inside the ring (popup-geo „rad“).
    const geo = await page.evaluate(MEASURE_GEO).catch((e) => ({ finds: [], err: String(e) }));
    const rad = (geo.finds || []).filter((f) => f.kind === 'rad');
    await check('room: value and line inside the ring (popup-geo „rad“)', !geo.err && rad.length === 0, geo.err || rad.map((f) => f.msg));
    // Live: the room draws more.
    await fakeStates(page, { 'sensor.qa_er_aquarium': P(388, 'W', 'Aquarium Leistung') }, { sticky: true });
    let r2 = null;
    for (let i = 0; i < 10; i++) { r2 = await page.evaluate(READ); if (r2 && near(r2.pct, 50)) break; await page.waitForTimeout(300); }
    await check('live: the room draws 430 W → ring 50 %, „50 % vom Haus“', r2 && near(r2.pct, 50) && r2.line === '50 % vom Haus' && r2.value === '430', r2);
    await check('live: the stage is not redrawn', r2 && r2.mark === r.mark, { before: r.mark, after: r2 && r2.mark });
    // Live: the house draws more.
    await fakeStates(page, { 'sensor.qa_er_grid': P(1420, 'W', 'Netz Leistung') }, { sticky: true });
    let r3 = null;
    for (let i = 0; i < 10; i++) { r3 = await page.evaluate(READ); if (r3 && near(r3.pct, 25)) break; await page.waitForTimeout(300); }
    await check('live: the house draws 1720 W → ring 25 %', r3 && near(r3.pct, 25) && r3.line === '25 % vom Haus', r3);
    // The room above the house (readings a moment apart): 100 %, never more.
    await fakeStates(page, { 'sensor.qa_er_aquarium': P(2000, 'W', 'Aquarium Leistung') }, { sticky: true });
    let r4 = null;
    for (let i = 0; i < 10; i++) { r4 = await page.evaluate(READ); if (r4 && near(r4.pct, 100)) break; await page.waitForTimeout(300); }
    await check('room above the house: ring 100 %, „100 % vom Haus“', r4 && near(r4.pct, 100) && r4.line === '100 % vom Haus', r4);
  }
  await browser.close();
}
// 2. Without HA's energy settings: the plate with „Jetzt“, as before.
{
  const { browser, r } = await popup({ view: 1, vars: ROOM, prefs: 'none' });
  await check('no energy settings: S6 plate, no dial, „Jetzt“', r && r.code === 'S6' && !r.dial && r.line === 'Jetzt' && r.value === '155', r);
  await browser.close();
}
// 3. The house popup keeps its energy flow.
{
  const { browser, r } = await popup({ view: 0, vars: HOUSE });
  await check('house popup: the energy flow, no ring', r && r.e1 && !r.dial, r);
  await browser.close();
}
// 4. The phone's room page: the same dial.
if (dash.phone && phoneKey()) {
  const { browser, r } = await popup({ view: 1, vars: ROOM, size: [393, 852], mobile: true });
  await check('phone: room popup is the dial with „18 % vom Haus“', r && r.dial === 'level' && near(r.pct, 155 / 860 * 100) && r.line === '18 % vom Haus' && r.value === '155', r);
  await browser.close();
}
// 5. Pictures (optional).
if (process.env.R569_SHOTS) {
  const tag = process.env.R569_TAG || 'shot';
  for (const [name, o] of [['desktop-dunkel', { size: [1440, 900], dark: true }], ['desktop-hell', { size: [1440, 900], dark: false }],
    ['handy-dunkel', { size: [393, 852], dark: true, mobile: true }], ['handy-hell', { size: [393, 852], dark: false, mobile: true }]]) {
    if (o.mobile && !dash.phone) continue;
    const { page, browser, r } = await popup({ view: 1, vars: ROOM, ...o });
    if (r) await page.screenshot({ path: `${process.env.R569_SHOTS}/${tag}-${name}.png` });
    console.log('  info   ' + name + ' ' + JSON.stringify(r));
    await browser.close();
  }
}
await finish();
