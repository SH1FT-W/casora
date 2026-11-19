// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/50-smart-meter.js#_casoraSmartMeter custom_components/casora/scripts/local/00-finder.js#casoraSmartMeterFind
// Smart meter (community card, card request 208) on the made-up "Testsmartmeter" (casora_mock/smartmeter.py: Glow-like
// daily counters with 30 days of imported statistics that fall back to 0 at midnight). The tile shows today's cost of
// electricity and gas; the popup v3 shows the week's cost over stacked bars (electricity, gas, standing charge) with
// Tag · Woche · Monat, right usage and cost of electricity and gas and the total. Week and month come from the
// statistics: more than today as soon as the range has days before today; tapping „Verbrauch“ switches the chart to
// kWh. Nothing is saved: the tile only exists in the browser.
// R924_SHOTS=<folder>: also saves pictures of tile and popup there.
import { open, casoraDashboard, dashboard, check, need, finish, stable } from './lib.mjs';

const ID = 'sensor.testsmartmeter_total_daily_energy_cost';
const SHOTS = process.env.R924_SHOTS || '';
const num = (v) => parseFloat(String(v || '').replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
const dash = await casoraDashboard();
await need('a Casora dashboard', dash);
const { page } = await open({ width: 1440, height: 1000 });
await dashboard(page, dash.url, 3);
await need('Testsmartmeter in the test house (mock)', await page.evaluate((id) => !!document.querySelector('home-assistant').hass.states[id], ID));
await need('module and finder loaded', await page.evaluate(() => !!(window._casoraSmartMeter && window.casoraSmartMeterFind)));

const found = await page.evaluate(() => window.casoraSmartMeterFind.all(document.querySelector('home-assistant').hass)
  .find((m) => m.platform === 'hildebrandglow_dcc'));
await check('finder: the meter with all six daily counters, not the supplier cost or the rate', found && found.ids.length === 6
  && /electricity_daily_cost$/.test(found.elecCost) && !found.ids.some((x) => /cost_api|unit_rate/.test(x)), found);

// The tile as the Studio builds it (template + entity), hung into the page like r590.
await page.evaluate(async (entity) => {
  const ha = document.querySelector('home-assistant');
  const h = await window.loadCardHelpers();
  const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_smart_meter', entity, name: 'Smart Meter' });
  el.classList.add('qa-r924');
  el.hass = ha.hass;
  el.style.cssText = 'position:fixed;left:400px;top:300px;width:260px;height:170px;z-index:99990;';
  ha.shadowRoot.appendChild(el);
  setInterval(() => { if (el.hass !== ha.hass) el.hass = ha.hass; }, 200);
}, ID);
await page.waitForFunction(() => { const el = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-r924');
  return el && el.shadowRoot && el.shadowRoot.querySelector('#state'); }, null, { timeout: 10000 });
const tile = await page.evaluate(() => document.querySelector('home-assistant').shadowRoot.querySelector('.qa-r924').shadowRoot.querySelector('#state').textContent.replace(/\s+/g, ' ').trim());
await check('tile: electricity and gas cost of today', /(Strom|Electricity)/.test(tile) && /Gas/.test(tile) && /£/.test(tile), tile);
if (SHOTS) {
  await page.waitForTimeout(1500); // the tile's fade-in
  const r = await page.evaluate(() => { const b = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-r924').getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; });
  await page.screenshot({ path: SHOTS + '/tile.png', clip: { x: r.x - 12, y: r.y - 12, width: r.width + 24, height: r.height + 24 } });
}

const info = () => {
  const pop = window.__pierce('casora-popup').find((p) => p.hasAttribute('open'));
  if (!pop) return null;
  const ch = window.__pierce('casora-chart', pop.shadowRoot).filter((c) => c.getBoundingClientRect().width > 0);
  const n = window.__pierce('.hui-stage .hui-st-n', pop.shadowRoot).find((x) => x.getBoundingClientRect().height > 0);
  const u = window.__pierce('.hui-stage .hui-st-u', pop.shadowRoot).find((x) => x.getBoundingClientRect().height > 0);
  const segs = window.__pierce('[data-casora-smr]', pop.shadowRoot).map((s) => s.getAttribute('data-casora-smr') + (s.className.includes('on') || s.getAttribute('aria-selected') === 'true' ? '*' : ''));
  const picks = window.__pierce('[data-casora-smm]', pop.shadowRoot).map((s) => s.getAttribute('data-casora-smm') + ':' + s.getAttribute('aria-pressed'));
  // The parts are button-cards with shadow roots of their own: read the rows and stage through them.
  const txt = window.__pierce('.hui-row, .hui-stage, .hui-empty', pop.shadowRoot).map((x) => x.textContent).join(' ').replace(/\s+/g, ' ');
  const cols = ch[0] && ch[0].shadowRoot ? ch[0].shadowRoot.querySelectorAll('svg g path').length : 0;
  return { charts: ch.length, cols, value: n ? n.textContent.trim() : '', unit: u ? u.textContent.trim() : '', segs, picks,
    rows: /Verbrauch|Consumption/.test(txt) && /Kosten|Cost/.test(txt), standing: /Grundgebühr|Standing charge/.test(txt),
    empty: /Noch keine Werte|No values yet|Statistik nicht abrufbar|Statistics unavailable/.test(txt), loading: /Wird geladen|Loading/.test(txt) };
};

const at = await page.evaluate(() => { const r = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-r924').getBoundingClientRect();
  return { x: r.x + r.width * 0.7, y: r.y + r.height * 0.75 }; });
await page.mouse.click(at.x, at.y);
let p = await stable(page, info, null, { max: 25000, quiet: 2000, until: (v) => v && v.cols > 0 && v.value && !v.loading });
await need('popup open with a drawn chart', p && p.charts === 1 && p.cols > 0, p);
await check('stage: the week (segment Tag · Woche · Monat)', p.segs.length === 3, p.segs);
await check('stage: cost in £ with a value', p.unit === '£' && Number.isFinite(num(p.value)), p);
await check('right: usage and cost rows, standing charge', p.rows && p.standing && p.picks.length >= 2, p);
await check('statistics there (no empty chart)', !p.empty, p);
if (SHOTS) {
  const r = await page.evaluate(() => { const pop = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
    const d = window.__pierce('.dialog, ha-dialog, wa-dialog, .container, .sheet', pop.shadowRoot).map((x) => x.getBoundingClientRect()).filter((b) => b.width > 500)[0];
    return d ? { x: d.x, y: d.y, width: d.width, height: d.height } : null; });
  await page.screenshot({ path: SHOTS + '/popup-woche.png', ...(r ? { clip: { x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.min(1440, r.width), height: Math.min(1000, r.height) } } : {}) });
}

// Range: the day's cost is today's sensors; week and month add the days before today from the statistics.
const tapAttr = async (sel) => {
  const pt = await page.evaluate((s) => { const pop = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
    const el = window.__pierce(s, pop.shadowRoot).find((x) => x.getBoundingClientRect().width > 0);
    if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, sel);
  if (pt) await page.mouse.click(pt.x, pt.y);
  return !!pt;
};
const week = num(p.value);
await need('Tag segment found', await tapAttr('[data-casora-smr="day"]'));
const d = await stable(page, info, null, { max: 15000, quiet: 1500, until: (v) => v && Number.isFinite(num(v.value)) && num(v.value) !== week });
const today = await page.evaluate(() => { const h = document.querySelector('home-assistant').hass, S = h.states;
  const v = (id) => parseFloat(S[id].state);
  return v('sensor.testsmartmeter_electricity_daily_cost') + v('sensor.testsmartmeter_gas_daily_cost') + v('sensor.testsmartmeter_daily_standing_charges'); });
await check('Tag: today\'s cost = electricity + gas + standing charge of the sensors', d && Math.abs(num(d.value) - today) < 0.011, { value: d && d.value, today });
const beforeToday = await page.evaluate(() => { const E = window._casoraEnergyHistory; const h = document.querySelector('home-assistant').hass;
  return { week: E.plan('week', Date.now(), E.firstDay(h)).cur, month: E.plan('month', Date.now(), E.firstDay(h)).cur }; });
await check('Woche: more than today when the week has days before today', beforeToday.week === 0 ? week >= today - 0.011 : week > today + 0.5,
  { week, today, daysBefore: beforeToday.week });
await need('Monat segment found', await tapAttr('[data-casora-smr="month"]'));
const mo = await stable(page, info, null, { max: 15000, quiet: 1500, until: (v) => v && !v.loading && Number.isFinite(num(v.value)) && num(v.value) !== num(d.value) && v.cols > 20 });
await check('Monat: at least the week (when the week lies in this month)', mo && (beforeToday.month < beforeToday.week || num(mo.value) >= week - 0.011),
  { month: mo && mo.value, week });
await check('Monat: a column per day of the month', mo && mo.cols > 20, mo && mo.cols);

// Usage: tapping „Verbrauch“ switches the stage to kWh.
await need('usage row found', await tapAttr('[data-casora-smm="use"]'));
const use = await stable(page, info, null, { max: 10000, quiet: 1200, until: (v) => v && v.unit === 'kWh' });
await check('Verbrauch tapped: the stage in kWh, the row pressed', use && use.unit === 'kWh' && use.picks.includes('use:true'), use);
if (SHOTS) await page.screenshot({ path: SHOTS + '/popup-monat-verbrauch.png' });

await finish();
