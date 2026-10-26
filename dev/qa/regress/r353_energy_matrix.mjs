// @zustand: arbeit
// @parallel: ui
// Energy audit (b7, issues #34, #44, #62, #78, #79): one matrix over the energy setups users reported. HA's energy
// settings (energy/get_prefs) are answered in the browser, the sensors are faked in the browser and Home's (or a
// room's) energy fields are set in the dashboard config as the browser receives it; nothing is saved in HA.
// Expected per setup: the badge shows the house (grid import + solar + battery discharge − export − battery charge,
// HA's signs: grid > 0 import, battery > 0 discharge) in W/kW whatever unit the sensors report; the popup's header
// shows the same number; the energy flow (Casora look) shows grid/solar/battery with direction and the right
// values; HA's "individual devices" are listed by power with kW/Wh converted; a room lists every consumer (#79),
// also at 0 W, with the sum on top; Standard and Glass convert kW consumers like the Casora look.
//   CASORA_URL=http://localhost:<port> CASORA_LOCAL=1 node dev/qa/regress/r353_energy_matrix.mjs [setup …]
// Made-up ids only (sensor.qa_e_*); the test house's Anker Solix sensors are hidden in the browser so its
// auto-detected battery fields do not mix in.
import fs from 'node:fs';
import { open, casoraDashboard, dashboard, fakeStates, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard((d) => (d.config.views || []).length > 1);
await need('Casora-Dashboard mit Zuhause und Räumen', dash);
const ONLY = process.argv.slice(2);
const TPL = process.env.CASORA_LOCAL ? (() => {
  const all = JSON.parse(fs.readFileSync(new URL('../../../custom_components/casora/panel/casora-templates.json', import.meta.url), 'utf8'));
  const B = all.templates || all;
  return Object.fromEntries(['casora_popup_energy', 'casora_badge_energy_group', 'casora_badge_energy', 'casora_mobile_filter_badges'].filter((k) => B[k]).map((k) => [k, B[k]]));
})() : null;

const P = (v, u = 'W', name) => ({ state: String(v), attributes: { unit_of_measurement: u, device_class: 'power', state_class: 'measurement', friendly_name: name } });
const E = (v, u = 'kWh', name) => ({ state: String(v), attributes: { unit_of_measurement: u, device_class: 'energy', state_class: 'total_increasing', friendly_name: name } });
const SOC = (v) => ({ state: String(v), attributes: { unit_of_measurement: '%', device_class: 'battery', friendly_name: 'Hausakku Ladestand' } });
const grid = (rate) => ({ type: 'grid', stat_energy_from: 'sensor.qa_e_import', stat_energy_to: 'sensor.qa_e_export', stat_rate: rate });
const de = (w) => (Math.abs(w) >= 1000 ? (Math.round(w / 100) / 10).toLocaleString('de') + ' kW' : Math.round(w) + ' W');
const badge = (w) => (Math.abs(w) >= 1000 ? (w / 1000).toLocaleString('de', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' kW' : Math.round(w) + ' W');

// home: what the badge and the popup header must show; flow: E1 circle → text it must contain (null = no circle);
// rows: consumer rows in this order (label part, value), at the top of the list.
const SETUPS = {
  grid_only: {
    prefs: { energy_sources: [grid('sensor.qa_e_grid')] }, home: { energy_power_entity: 'sensor.qa_e_grid' },
    states: { 'sensor.qa_e_grid': P(850) }, want: { home: 850, flow: null },
  },
  grid_kw: {
    prefs: { energy_sources: [grid('sensor.qa_e_grid')] }, home: { energy_power_entity: 'sensor.qa_e_grid' },
    states: { 'sensor.qa_e_grid': P(1.85, 'kW') }, want: { home: 1850, flow: null },
  },
  solar_export: {
    prefs: { energy_sources: [grid('sensor.qa_e_grid'), { type: 'solar', stat_energy_from: 'sensor.qa_e_pv_total', stat_rate: 'sensor.qa_e_pv' }] },
    home: { energy_entities: ['sensor.qa_e_grid', 'sensor.qa_e_pv'] },
    states: { 'sensor.qa_e_grid': P(-1200), 'sensor.qa_e_pv': P(2.4, 'kW') },
    want: { home: 1200, flow: { grid: ['1,2 kW', 'Einspeisung'], solar: ['2,4 kW'], home: ['1,2 kW'], battery: null } },
  },
  battery_charging: {
    prefs: { energy_sources: [grid('sensor.qa_e_grid'), { type: 'solar', stat_rate: 'sensor.qa_e_pv' }, { type: 'battery', stat_rate: 'sensor.qa_e_bat' }],
      device_consumption: [
        { stat_consumption: 'sensor.qa_e_wm_energy', stat_rate: 'sensor.qa_e_wm', name: 'Waschmaschine' },
        { stat_consumption: 'sensor.qa_e_tv_energy', stat_rate: 'sensor.qa_e_tv' },
        { stat_consumption: 'sensor.qa_e_pump_energy' },
      ] },
    home: { energy_entities: ['sensor.qa_e_grid', 'sensor.qa_e_pv', 'sensor.qa_e_bat'] },
    states: { 'sensor.qa_e_grid': P(300), 'sensor.qa_e_pv': P(1500), 'sensor.qa_e_bat': P(-0.6, 'kW'), 'sensor.qa_e_bat_soc': SOC(64),
      'sensor.qa_e_wm': P(2100, 'W', 'Waschmaschine Leistung'), 'sensor.qa_e_tv': P(0.12, 'kW', 'Fernseher Leistung'),
      'sensor.qa_e_wm_energy': E(3.2), 'sensor.qa_e_tv_energy': E(800, 'Wh', 'Fernseher Energie'), 'sensor.qa_e_pump_energy': E(1500, 'Wh', 'Teichpumpe Energie heute') },
    want: { home: 1200, flow: { grid: ['300 W', 'Netz'], solar: ['1,5 kW'], battery: ['64 %', '600 W', 'Akku lädt'], home: ['1,2 kW'] },
      rows: [['Waschmaschine', ['2,1 kW', '2100 W']], ['Fernseher', '120 W'], ['Teichpumpe', '1,5 kWh']] },
  },
  battery_discharging_night: {
    // Night: the inverter is unavailable (asleep = 0 W), the battery discharges, two grid meters.
    prefs: { energy_sources: [grid('sensor.qa_e_grid'), grid('sensor.qa_e_grid2'), { type: 'solar', stat_rate: 'sensor.qa_e_pv' },
      { type: 'battery', stat_rate: 'sensor.qa_e_bat' }] },
    home: { energy_entities: ['sensor.qa_e_grid', 'sensor.qa_e_grid2', 'sensor.qa_e_pv', 'sensor.qa_e_bat'] },
    states: { 'sensor.qa_e_grid': P(150), 'sensor.qa_e_grid2': P(0.05, 'kW'), 'sensor.qa_e_pv': { state: 'unavailable', attributes: { unit_of_measurement: 'W', device_class: 'power', friendly_name: 'PV' } },
      'sensor.qa_e_bat': P(450), 'sensor.qa_e_bat_soc': SOC(41) },
    want: { home: 650, flow: { grid: ['200 W', 'Netz'], solar: ['0 W'], battery: ['41 %', '450 W', 'Akku entlädt'], home: ['650 W'] } },
  },
  no_prefs: {
    // Energy dashboard never set up: HA answers not_found. Home keeps its own sensor, no flow.
    prefs: 'none', home: { energy_power_entity: 'sensor.qa_e_house' },
    states: { 'sensor.qa_e_house': P(0.42, 'kW', 'Hausverbrauch') }, want: { home: 420, flow: null },
  },
};
// A grid meter as Home's own sensor (#44, Westerloer) while the plant feeds in: the badge in kW with its sign, the
// popup's headline as the amount with "Einspeisung".
SETUPS.meter_feed_in = {
  prefs: 'none', home: { energy_power_entity: 'sensor.qa_e_meter' },
  states: { 'sensor.qa_e_meter': P(-1500, 'W', 'Stromzähler Leistung') }, want: { home: -1500, head: '1,5 kW', flow: null },
};
const ROOMS = {
  room_zero: {
    // #79: a room whose devices draw nothing: every consumer listed, the badge says 0 W, no device vanishes.
    vars: { energy_entities: ['sensor.qa_e_light', 'sensor.qa_e_cover', 'sensor.qa_e_plug'] },
    states: { 'sensor.qa_e_light': P(0, 'W', 'Deckenlicht Leistung'), 'sensor.qa_e_cover': P(0, 'W', 'Rollladen Leistung'), 'sensor.qa_e_plug': P(0, 'W', 'Steckdose Leistung') },
    want: { home: 0, rows: [['Deckenlicht', '0 W'], ['Rollladen', '0 W'], ['Steckdose', '0 W']] },
  },
  room_mixed_units: {
    vars: { energy_entities: ['sensor.qa_e_light', 'sensor.qa_e_cover', 'sensor.qa_e_heater'] },
    states: { 'sensor.qa_e_light': P(12.5, 'W', 'Deckenlicht Leistung'), 'sensor.qa_e_cover': P(0, 'W', 'Rollladen Leistung'), 'sensor.qa_e_heater': P(1.2, 'kW', 'Heizlüfter Leistung') },
    want: { home: 1212.5, rows: [['Heizlüfter', ['1,2 kW', '1200 W']], ['Deckenlicht', ['13 W', '12,5 W']], ['Rollladen', '0 W']] },
  },
};

// Browser side: answer energy/get_prefs and set the energy fields of Home (or of the second view's room) in the
// dashboard config as it arrives, from localStorage (set before each load).
const INIT = () => {
  let cfg = null;
  try { cfg = JSON.parse(localStorage.getItem('qa_r353') || 'null'); } catch (e) { cfg = null; }
  if (!cfg) return;
  const WS = window.WebSocket, pend = new Map(), done = new WeakMap();
  const setVars = (V) => {
    Object.keys(V).forEach((k) => { if (/^energy_|^casora_energy_/.test(k) && k !== 'energy_title') delete V[k]; });
    Object.assign(V, cfg.vars, { show_energy: true });
  };
  const patch = (c, type) => {
    // The phone's start page reads the desktop Home's badge fields from the server (casoraPhoneRoom.home).
    if (type === 'phone') { if (cfg.view === 0 && c && c.home) setVars(c.home); return; }
    // CASORA_LOCAL: the energy templates of this checkout (the test HA refreshes them only when it starts).
    if (cfg.tpl && c && c.button_card_templates) Object.assign(c.button_card_templates, cfg.tpl);
    const views = (c && c.views) || [];
    const walk = (x, vi) => {
      if (!x || typeof x !== 'object') return;
      if (Array.isArray(x)) { x.forEach((y) => walk(y, vi)); return; }
      if ([].concat(x.template || []).includes('casora_room') && x.variables && vi === cfg.view) {
        setVars(x.variables);
      }
      Object.keys(x).forEach((k) => walk(x[k], vi));
    };
    views.forEach((v, i) => walk(v, i));
  };
  const fix = (m) => {
    if (m && m.type === 'result' && pend.has(m.id)) { const t = pend.get(m.id); pend.delete(m.id); if (m.success) patch(m.result, t); }
    return m;
  };
  window.WebSocket = class extends WS {
    addEventListener(t, fn, o) {
      if (t !== 'message') return super.addEventListener(t, fn, o);
      // Every listener gets the same event: rewrite it once (the first listener would use up the request id).
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

// Visible energy badge of the view, and the open popup's texts.
const READ_BADGE = () => {
  const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_badge_energy_group')
    && x.getBoundingClientRect().width > 0);
  if (!b) return null;
  // The phone's badge row scrolls sideways: bring the badge into view first.
  b.scrollIntoView({ block: 'nearest', inline: 'center' });
  const r = b.getBoundingClientRect();
  const t = b.shadowRoot && b.shadowRoot.querySelector('.badge-sub');
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, sub: t ? t.textContent.trim() : null };
};
const READ_POPUP = () => {
  const p = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
  if (!p) return null;
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const e1 = {};
  window.__pierce('[data-e1-node]').forEach((n) => { if (vis(n) && n.style.display !== 'none') e1[n.getAttribute('data-e1-node')] = n.innerText.replace(/\s+/g, ' ').trim(); });
  const rows = window.__pierce('.hui-row').filter(vis).map((r) => r.innerText.replace(/\s+/g, ' ').trim());
  const texts = [];
  const walk = (root) => { root.querySelectorAll('*').forEach((e) => { if (e.shadowRoot) walk(e.shadowRoot); if (!e.children.length && vis(e)) texts.push(e.textContent.trim()); }); };
  walk(p.shadowRoot || p); walk(p);
  return { e1, rows, texts: texts.filter(Boolean) };
};

const ctx = {};
async function run(name, S, theme, { view = 0, vars, size = [1440, 900], dark = true } = {}) {
  if (!ctx[theme + dark + size]) {
    if (ctx.browser) await ctx.browser.close().catch(() => {});
    const o = await open({ width: size[0], height: size[1], theme, dark });
    await o.context.addInitScript(INIT);
    Object.keys(ctx).forEach((k) => delete ctx[k]);
    ctx[theme + dark + size] = o; ctx.browser = o.browser;
  }
  const { page } = ctx[theme + dark + size];
  await page.goto(new URL('/' + dash.url + '/' + view, process.env.CASORA_URL || 'http://localhost:8124').href);
  // casoraPhoneRoom keeps the last answer in localStorage: start without it.
  await page.evaluate((c) => { Object.keys(localStorage).filter((k) => k.indexOf('casora.phoneRooms.') === 0).forEach((k) => localStorage.removeItem(k));
    localStorage.setItem('qa_r353', JSON.stringify(c)); }, { prefs: S.prefs || 'none', vars, view, tpl: TPL });
  await dashboard(page, dash.url + '/' + view + '?qa=' + Date.now(), 3);
  // Hide the test house's Anker Solix (auto-detected battery fields of the energy popup) and its energy meters.
  const hide = await page.evaluate(() => Object.keys(document.querySelector('home-assistant').hass.states)
    .filter((id) => /solarbank|system_home|iometer|smart_meter/.test(id)));
  const patch = Object.fromEntries(hide.map((id) => [id, null]));
  await fakeStates(page, { ...patch, ...S.states }, { sticky: true });
  await page.evaluate(async () => { const h = document.querySelector('home-assistant').hass; if (window.casoraEnergyPrefs) await window.casoraEnergyPrefs.load(h, true); });
  let b = null;
  for (let i = 0; i < 20; i++) { b = await page.evaluate(READ_BADGE); if (b && b.sub && b.sub !== '–') break; await page.waitForTimeout(400); }
  const tag = `${name} · ${theme}${dark ? '' : ' hell'}${size[0] < 600 ? ' Handy' : ''}`;
  if (!(await check(`${tag}: Energie-Badge sichtbar`, b, b))) return null;
  await check(`${tag}: Badge zeigt ${badge(S.want.home)}`, b.sub === badge(S.want.home), b.sub);
  const shotName = `${name}_${theme.replace(/\s+/g, '-')}_${dark ? 'dunkel' : 'hell'}${size[0] < 600 ? '_handy' : ''}`;
  if (process.env.R353_SHOTS) await page.screenshot({ path: `${process.env.R353_SHOTS}/${shotName}_badge.png`,
    clip: { x: Math.max(0, b.x - 150), y: Math.max(0, b.y - 45), width: 300, height: 90 } });
  await page.mouse.click(b.x, b.y);
  let pop = null;
  for (let i = 0; i < 25; i++) { pop = await page.evaluate(READ_POPUP); if (pop && pop.rows.length + Object.keys(pop.e1).length > 0) break; await page.waitForTimeout(400); }
  await page.waitForTimeout(800);
  pop = await page.evaluate(READ_POPUP);
  if (!(await check(`${tag}: Popup offen`, pop, pop))) return null;
  // R353_SHOTS=<dir>: keep a picture of each popup (before/after comparisons of the audit).
  if (process.env.R353_SHOTS) await page.screenshot({ path: `${process.env.R353_SHOTS}/${shotName}.png` });
  // Standard and Glass print the headline in whole watts ("1200 W"), the Casora look in kW from 1000 W.
  const heads = S.want.head ? [S.want.head] : [de(S.want.home), Math.round(S.want.home) + ' W'];
  await check(`${tag}: Popup zeigt oben ${heads[0]}`, pop.texts.slice(0, 40).some((t) => heads.includes(t)), pop.texts.slice(0, 40));
  if (theme === 'Casora' && S.want.flow !== undefined) {
    if (S.want.flow === null) await check(`${tag}: kein Energiefluss`, !Object.keys(pop.e1).length, pop.e1);
    else for (const [k, parts] of Object.entries(S.want.flow)) {
      if (parts === null) await check(`${tag}: Fluss ohne ${k}`, !pop.e1[k], pop.e1);
      else await check(`${tag}: Fluss ${k} = ${parts.join(' · ')}`, pop.e1[k] && parts.every((p) => pop.e1[k].includes(p)), pop.e1);
    }
  }
  if (S.want.rows) {
    const got = S.want.rows.map(([label]) => pop.rows.find((r) => r.startsWith(label)) || null);
    await check(`${tag}: Verbraucher in der Reihenfolge ${S.want.rows.map((r) => r[0]).join(', ')}`,
      got.every(Boolean) && got.every((r, i) => i === 0 || pop.rows.indexOf(r) > pop.rows.indexOf(got[i - 1])), pop.rows);
    // value: one text, or the ones the looks print (Standard keeps one decimal below 100 W: "12,5 W").
    for (const [i, [label, value]] of S.want.rows.entries()) {
      if (got[i]) await check(`${tag}: ${label} ${[].concat(value)[0]}`, [].concat(value).some((v) => got[i].endsWith(v)), got[i]);
    }
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  return pop;
}

for (const [name, S] of Object.entries(SETUPS)) {
  if (ONLY.length && !ONLY.includes(name)) continue;
  await run(name, S, 'Casora', { vars: S.home });
}
for (const [name, S] of Object.entries(ROOMS)) {
  if (ONLY.length && !ONLY.includes(name)) continue;
  for (const theme of ['Casora', 'Casora Glas', 'default']) await run(name, S, theme, { view: 1, vars: { ...S.vars, room_name: undefined } });
}
// Phone (light) and the Standard look for the full house; the phone with one house sensor (a meter feeding in).
const PHONE = { size: [393, 852], dark: false };
if (!ONLY.length || ONLY.includes('battery_charging')) {
  const S = SETUPS.battery_charging, std = { ...S, want: { ...S.want, flow: undefined } };
  await run('battery_charging', std, 'default', { vars: S.home });
  await run('battery_charging', S, 'Casora', { vars: S.home, ...PHONE });
  await run('battery_charging', std, 'default', { vars: S.home, ...PHONE });
}
if (!ONLY.length || ONLY.includes('meter_feed_in')) await run('meter_feed_in', SETUPS.meter_feed_in, 'Casora', { vars: SETUPS.meter_feed_in.home, ...PHONE });
await finish();
