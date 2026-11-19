// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/48-energie-verlauf.js#sources,flows,flowRows,load,sec custom_components/casora/scripts/local/05-weich-mehr.js#build
// Issue #210: the house's energy popup showed the power now and the day's flow, but kWh over a day, a week or a month
// only per device („Verbrauch je Gerät“). Expected: a section „Energie · <range>“ in the house popup with
// Hausverbrauch, Netzbezug, Einspeisung and Solarerzeugung in kWh, switched with „Tag / Woche / Monat“ like the device
// page (opens on the week); only rows the energy settings have; no section without statistics.
// A throwaway HA has no long-term statistics yet: HA's energy settings and the statistics answer
// (recorder/statistics_during_period) are given in the browser for made-up meters (sensor.qa_ef_*), as r353/r569 do
// with the settings; nothing is saved in HA. What is checked: the request carries the settings' meters, and the
// popup shows their sums for the chosen range.
//   R923_SHOTS=<dir>: pictures of the house popup (desktop dark and light).
import { open, casoraDashboard, dashboard, fakeStates, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard((d) => (d.config.views || []).length > 0);
await need('Casora dashboard with Home', dash);

const P = (v, name) => ({ state: String(v), attributes: { unit_of_measurement: 'W', device_class: 'power', state_class: 'measurement', friendly_name: name } });
const FULL = { energy_sources: [
  { type: 'grid', stat_energy_from: 'sensor.qa_ef_import', stat_energy_to: 'sensor.qa_ef_export', stat_rate: 'sensor.qa_ef_grid' },
  { type: 'solar', stat_energy_from: 'sensor.qa_ef_pv_total', stat_rate: 'sensor.qa_ef_pv' }], device_consumption: [] };
const GRID_ONLY = { energy_sources: [{ type: 'grid', stat_energy_from: 'sensor.qa_ef_import', stat_rate: 'sensor.qa_ef_grid' }], device_consumption: [] };
// Home's energy fields: the settings' power sensors, so the popup is the house's (#44).
const HOUSE = { energy_entities: ['sensor.qa_ef_grid', 'sensor.qa_ef_pv'] }, HOUSE_GRID = { energy_entities: ['sensor.qa_ef_grid'] };
const STATES = { 'sensor.qa_ef_grid': P(420, 'Netz Leistung'), 'sensor.qa_ef_pv': P(310, 'PV Leistung') };
// kWh per bucket the answer gives (hour for the day, day for week and month).
const PER = { 'sensor.qa_ef_import': [0.4, 4], 'sensor.qa_ef_export': [0.1, 1.5], 'sensor.qa_ef_pv_total': [0.25, 3] };

// Browser side: answer energy/get_prefs and the statistics for the made-up meters, set Home's energy fields.
const INIT = () => {
  let cfg = null;
  try { cfg = JSON.parse(localStorage.getItem('qa_r923') || 'null'); } catch (e) { cfg = null; }
  if (!cfg) return;
  window.__qa923 = { asked: [], sums: {} };
  const WS = window.WebSocket, pend = new Map(), done = new WeakMap();
  const setVars = (V) => {
    Object.keys(V).forEach((k) => { if (/^energy_|^casora_energy_/.test(k) && k !== 'energy_title') delete V[k]; });
    Object.assign(V, cfg.vars, { show_energy: true });
  };
  const patch = (c, type) => {
    if (type === 'phone') { if (c && c.home) setVars(c.home); return; }
    const walk = (x, vi) => {
      if (!x || typeof x !== 'object') return;
      if (Array.isArray(x)) { x.forEach((y) => walk(y, vi)); return; }
      if ([].concat(x.template || []).includes('casora_room') && x.variables && vi === 0) setVars(x.variables);
      Object.keys(x).forEach((k) => walk(x[k], vi));
    };
    ((c && c.views) || []).forEach((v, i) => walk(v, i));
  };
  const fix = (m) => {
    if (m && m.type === 'result' && pend.has(m.id)) { const t = pend.get(m.id); pend.delete(m.id); if (m.success) patch(m.result, t); }
    return m;
  };
  // One row per bucket from the start up to now; what was answered is kept for the check.
  const stats = (m) => {
    const out = {}, start = Date.parse(m.start_time), end = Math.min(Date.parse(m.end_time), Date.now());
    const hour = m.period === 'hour', key = (hour ? 'day' : 'long') + ':' + new Date(start).getDate() + ':' + new Date(Date.parse(m.end_time) - 1).getDate();
    const sums = {};
    (m.statistic_ids || []).forEach((id) => {
      const per = cfg.per[id];
      if (!per || cfg.noStats) return;
      out[id] = [];
      for (let t = start; t < end;) {
        out[id].push({ start: t, end: t + 1, change: per[hour ? 0 : 1] });
        sums[id] = (sums[id] || 0) + per[hour ? 0 : 1];
        if (hour) t += 3600e3; else { const d = new Date(t); t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime(); }
      }
    });
    window.__qa923.asked.push({ ids: m.statistic_ids, period: m.period });
    window.__qa923.sums[key] = sums;
    return out;
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
      const answer = (m, result) => setTimeout(() => this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ id: m.id, type: 'result', success: true, result }) })), 0);
      if (typeof d === 'string' && d.indexOf('"energy/get_prefs"') > -1) { answer(JSON.parse(d), cfg.prefs); return; }
      if (typeof d === 'string' && d.indexOf('"recorder/statistics_during_period"') > -1 && /qa_ef_(import|export|pv_total)/.test(d)) {
        const m = JSON.parse(d); answer(m, stats(m)); return;
      }
      if (typeof d === 'string' && d.indexOf('"lovelace/config"') > -1) { try { pend.set(JSON.parse(d).id, 'config'); } catch (e) { /* plain */ } }
      if (typeof d === 'string' && d.indexOf('"casora/phone_room_badges"') > -1) { try { pend.set(JSON.parse(d).id, 'phone'); } catch (e) { /* plain */ } }
      return super.send(d);
    }
  };
};

// The section: the card holding the range segment of the energy history; its heading, rows and segments.
const READ = () => {
  const s = window.casoraPopup && window.casoraPopup.surface;
  if (!s) return null;
  const vis = (n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const seg = window.__pierce('[data-casora-evr]', s).filter(vis);
  if (!seg.length) return { open: true, section: false };
  const root = seg[0].getRootNode();
  const rows = [...root.querySelectorAll('.hui-row')].filter(vis).map((r) => r.innerText.replace(/\s+/g, ' ').trim());
  const texts = [];
  root.querySelectorAll('*').forEach((e) => { if (!e.children.length && vis(e)) texts.push(e.textContent.replace(/\s+/g, ' ').trim()); });
  const at = (r) => { const n = seg.find((x) => x.getAttribute('data-casora-evr') === r); if (!n) return null; const b = n.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, h: n.offsetHeight }; };
  return { open: true, section: true, head: texts.find((t) => /^Energie · /.test(t)) || null, rows,
    on: seg.filter((n) => n.classList.contains('on')).map((n) => n.getAttribute('data-casora-evr')).join(','),
    day: at('day'), week: at('week'), month: at('month'), qa: window.__qa923 };
};
const BADGE = () => {
  const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).some((t) => t === 'casora_badge_energy_group' || t === 'casora_badge_energy')
    && x.getBoundingClientRect().width > 0 && (!x.checkVisibility || x.checkVisibility({ opacityProperty: true, visibilityProperty: true })));
  if (!b) return null;
  b.scrollIntoView({ block: 'nearest', inline: 'center' });
  const r = b.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
};

async function popup({ prefs = FULL, vars = HOUSE, noStats = false, size = [1440, 900], dark = true, touch = false }) {
  const o = await open({ width: size[0], height: size[1], theme: 'Casora', dark, touch });
  await o.context.addInitScript(INIT);
  const page = o.page;
  await page.goto(new URL('/' + dash.url + '/0', process.env.CASORA_URL || 'http://localhost:8124').href);
  await page.evaluate((c) => localStorage.setItem('qa_r923', JSON.stringify(c)), { prefs, vars, per: PER, noStats });
  await dashboard(page, dash.url + '/0?qa=' + Date.now(), 3);
  // The test house's own energy meters stay out (as r353).
  const hide = await page.evaluate(() => Object.keys(document.querySelector('home-assistant').hass.states).filter((id) => /solarbank|system_home|iometer|smart_meter|stromzaehler/.test(id)));
  await fakeStates(page, { ...Object.fromEntries(hide.map((id) => [id, null])), ...STATES }, { sticky: true });
  await page.evaluate(async () => { const h = document.querySelector('home-assistant').hass; if (window.casoraEnergyPrefs) await window.casoraEnergyPrefs.load(h, true); });
  let b = null;
  for (let i = 0; i < 20 && !b; i++) { b = await page.evaluate(BADGE); if (!b) await page.waitForTimeout(400); }
  if (!b) return { page, browser: o.browser, r: null };
  if (touch) await page.touchscreen.tap(b.x, b.y); else await page.mouse.click(b.x, b.y);
  const r = await until(page, (x) => x && x.section && x.rows.length && !x.rows.some((t) => /…$/.test(t)), 30);
  return { page, browser: o.browser, r };
}
async function until(page, ok, n = 25) {
  let r = null;
  for (let i = 0; i < n; i++) { r = await page.evaluate(READ); if (ok(r)) break; await page.waitForTimeout(400); }
  return r;
}
// „12,5 kWh“ / „400 Wh“ → kWh.
const kwh = (row) => { const m = /([\d.,]+)\s*(k?Wh)\s*$/.exec(row || ''); return m ? parseFloat(m[1].replace(/\./g, '').replace(',', '.')) / (m[2] === 'Wh' ? 1000 : 1) : null; };
const rowOf = (r, label) => (r.rows || []).find((t) => t.indexOf(label) === 0) || null;
// From 100 kWh without decimals (EV.fmt).
const near = (a, b) => a != null && b != null && Math.abs(a - b) <= (b >= 100 ? 0.5 : 0.051);
const sumsOf = (r, per) => { const k = Object.keys((r.qa && r.qa.sums) || {}).filter((x) => x.indexOf(per) === 0).pop(); return k ? r.qa.sums[k] : null; };
const expect = async (tag, r, per) => {
  const s = sumsOf(r, per) || {};
  const imp = s['sensor.qa_ef_import'] || 0, exp = s['sensor.qa_ef_export'] || 0, pv = s['sensor.qa_ef_pv_total'] || 0;
  await check(tag + ': Netzbezug = the import meter\'s sum', near(kwh(rowOf(r, 'Netzbezug')), imp), { row: rowOf(r, 'Netzbezug'), imp });
  await check(tag + ': Einspeisung = the export meter\'s sum', near(kwh(rowOf(r, 'Einspeisung')), exp), { row: rowOf(r, 'Einspeisung'), exp });
  await check(tag + ': Solarerzeugung = the solar meter\'s sum', near(kwh(rowOf(r, 'Solarerzeugung')), pv), { row: rowOf(r, 'Solarerzeugung'), pv });
  await check(tag + ': Hausverbrauch = import − export + solar', near(kwh(rowOf(r, 'Hausverbrauch')), imp - exp + pv), { row: rowOf(r, 'Hausverbrauch'), want: imp - exp + pv });
};

// 1. Desktop: the section on the week, then day and month by the segment.
{
  const { page, browser, r } = await popup({});
  await need('house energy popup with the section „Energie“', r && r.section, r);
  await check('opens on the week: „Energie · Diese Woche“, segment „Woche“', r.head === 'Energie · Diese Woche' && r.on === 'week', r);
  await check('rows: Hausverbrauch, Netzbezug, Einspeisung, Solarerzeugung',
    ['Hausverbrauch', 'Netzbezug', 'Einspeisung', 'Solarerzeugung'].every((l) => rowOf(r, l)) && r.rows.length === 4, r.rows);
  const q = r.qa.asked.find((a) => a.ids.includes('sensor.qa_ef_import'));
  await check('one statistics request with every meter of the settings', q && ['sensor.qa_ef_import', 'sensor.qa_ef_export', 'sensor.qa_ef_pv_total'].every((id) => q.ids.includes(id)), r.qa.asked);
  await expect('week', r, 'long');
  // Layout height: the popup may be scaled down as a whole to fit the window.
  await check('segments at least 44 high', r.week && r.week.h >= 44, r.week);
  await page.mouse.click(r.day.x, r.day.y);
  let d = await until(page, (x) => x && x.on === 'day' && /^Energie · Heute/.test(x.head || '') && x.rows.length && !x.rows.some((t) => /…$/.test(t)));
  await check('„Tag“: the popup stays open, heading „Energie · Heute bis …“', d && d.open && d.on === 'day' && /^Energie · Heute/.test(d.head || ''), d);
  if (d) await expect('day', d, 'day');
  await page.mouse.click(d.month.x, d.month.y);
  let m = await until(page, (x) => x && x.on === 'month' && x.head && !/Woche|Heute/.test(x.head) && x.rows.length && !x.rows.some((t) => /…$/.test(t)));
  await check('„Monat“: heading names the month', m && m.on === 'month' && /^Energie · \S+/.test(m.head || '') && !/Woche|Heute/.test(m.head || ''), m);
  if (m) await expect('month', m, 'long');
  // The choice is the one of „Verbrauch je Gerät“: back on the week for the next tests.
  await page.mouse.click(m.week.x, m.week.y);
  await until(page, (x) => x && x.on === 'week');
  await browser.close();
}
// 2. Only a grid import meter: house and import, no export or solar rows.
{
  const { browser, r } = await popup({ prefs: GRID_ONLY, vars: HOUSE_GRID });
  await check('grid import only: Hausverbrauch and Netzbezug, nothing else',
    r && r.section && rowOf(r, 'Hausverbrauch') && rowOf(r, 'Netzbezug') && r.rows.length === 2, r && r.rows);
  if (r && r.section) await check('grid only: house = import', near(kwh(rowOf(r, 'Hausverbrauch')), kwh(rowOf(r, 'Netzbezug'))), r.rows);
  await browser.close();
}
// 3. No statistics for the meters: no section (no rows of „—“).
{
  const { page, browser } = await popup({ noStats: true });
  await page.waitForTimeout(2500);
  const r = await page.evaluate(READ);
  await check('no statistics: no section „Energie“', r && r.open && !r.section, r);
  await browser.close();
}
// 4. Tablet (finger): the segment switches on touchend.
{
  const { page, browser, r } = await popup({ size: [1180, 820], touch: true });
  if (await check('tablet: section on the week', r && r.section && r.on === 'week', r)) {
    await page.touchscreen.tap(r.month.x, r.month.y);
    const m = await until(page, (x) => x && x.on === 'month');
    await check('tablet: tapping „Monat“ switches, the popup stays open', m && m.open && m.on === 'month', m);
    await page.touchscreen.tap(m.week.x, m.week.y);
    await until(page, (x) => x && x.on === 'week');
  }
  await browser.close();
}
// 5. Pictures (optional).
if (process.env.R923_SHOTS) {
  for (const [name, o] of [['desktop-dunkel', { size: [1440, 900], dark: true }], ['desktop-hell', { size: [1440, 900], dark: false }],
  ]) {
    const { page, browser, r } = await popup(o);
    if (r && r.section) {
      await page.evaluate(() => { const s = window.casoraPopup.surface; const n = window.__pierce('[data-casora-evr]', s)[0]; if (n) n.scrollIntoView({ block: 'center' }); });
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${process.env.R923_SHOTS}/r923-${name}.png` });
    }
    console.log('  info   ' + name + ' ' + JSON.stringify(r && { head: r.head, rows: r.rows }));
    await browser.close();
  }
}
await finish();
