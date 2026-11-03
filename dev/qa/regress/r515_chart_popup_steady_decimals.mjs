// @zustand: arbeit
// @deckt: custom_components/casora/scripts/local/27-chart.js#dotted,M.precision
// Chart tile popup (casora_popup_chart, v3 stage S6) on the made-up "Testserver" sensors without a display precision:
// the decimals must not follow the raw state string. Opened at "44.38 %" the wheel read "44,38 %" and the average
// "47,15 %", after the next value ("47.4") "47,4 %" and "47,2 %"; the maximum read "54,0 %" beside them.
// Checked for a percentage (wheel) and a temperature (plate): stage value, highest/lowest value and average carry the
// same number of decimals, before and after a new value with fewer decimals in its state.
// Nothing is saved: the tiles only exist in the browser, states are pushed only in the browser (fakeStates).
// R515_BILDER=<folder>: store pictures after opening and after the new value.
import { open, casoraDashboard, dashboard, check, need, finish, stable, fakeStates } from './lib.mjs';

const CASES = [
  { tag: 'Percentage (wheel)', id: 'sensor.testserver_memory_use_percent', first: '44.38', next: '47.4', unit: '%' },
  { tag: 'Temperature (plate)', id: 'sensor.testserver_processor_temperature', first: '48.25', next: '48.5', unit: '°C' },
];
const num = (v) => parseFloat(String(v || '').replace(/\./g, '').replace(',', '.'));
const dash = await casoraDashboard();
await need('a Casora dashboard', dash);
const { page } = await open({ width: 1440, height: 1000, theme: 'Casora' });
await dashboard(page, dash.url, 3);
await need('Testserver in the test house (mock)', await page.evaluate((ids) => ids.every((id) => !!document.querySelector('home-assistant').hass.states[id]),
  CASES.map((c) => c.id)));
// The mock writes its hourly statistics shortly after HA starts (as r372): wait up to 60 s for a day of hours.
let statsOk = false;
for (let i = 0; i < 30 && !statsOk; i++) {
  statsOk = await page.evaluate(async (ids) => {
    const r = await document.querySelector('home-assistant').hass.callWS({ type: 'recorder/statistics_during_period',
      start_time: new Date(Date.now() - 2 * 864e5).toISOString(), statistic_ids: ids, period: 'hour', types: ['mean'] });
    return ids.every((id) => (r[id] || []).length >= 12);
  }, CASES.map((c) => c.id)).catch(() => false);
  if (!statsOk) await page.waitForTimeout(2000);
}
await need('hourly statistics of the test server (mock)', statsOk, CASES.map((c) => c.id));
await need('Testserver sensors without a display precision (the case of the fault)', await page.evaluate((ids) => {
  const ents = document.querySelector('home-assistant').hass.entities || {};
  return ids.every((id) => !ents[id] || ents[id].display_precision == null);
}, CASES.map((c) => c.id)));

// Stage number and the values of the statistics list (Höchster/Tiefster Wert, Durchschnitt), each with its decimals.
const info = () => {
  const pop = window.__pierce('casora-popup').find((p) => p.hasAttribute('open'));
  if (!pop) return null;
  const n = window.__pierce('.hui-stage .hui-st-n', pop.shadowRoot).find((x) => x.getBoundingClientRect().height > 0);
  const parts = [];
  const walk = (x) => x.childNodes.forEach((c) => {
    if (c.nodeType === 3) { if (c.parentNode && c.parentNode.nodeName !== 'STYLE') parts.push(c.textContent); return; }
    if (c.nodeType !== 1 || c.nodeName === 'STYLE') return;
    if (c.shadowRoot) walk(c.shadowRoot);
    walk(c);
  });
  walk(pop.shadowRoot);
  const txt = parts.join(' ').replace(/\s+/g, ' ');
  const stat = (label) => { const m = new RegExp(label + ' (?:[^0-9-]*?\\d{1,2}:\\d{2} )?(-?[\\d.]+(?:,\\d+)?)\\s?(%|°C)').exec(txt); return m ? m[1] : null; };
  const ch = window.__pierce('casora-chart', pop.shadowRoot).filter((c) => c.getBoundingClientRect().width > 0)[0];
  return { value: n ? n.textContent.trim() : '', max: stat('Höchster Wert'), min: stat('Tiefster Wert'), mean: stat('Durchschnitt'),
    paths: ch && ch.shadowRoot ? ch.shadowRoot.querySelectorAll('svg path').length : 0, txt: txt.slice(0, 400) };
};
const OUT = process.env.R515_BILDER;
const shot = (n) => OUT && page.screenshot({ path: OUT + '/' + n + '.png' });
const dec = (s) => { const m = /,(\d+)$/.exec(String(s || '')); return m ? m[1].length : 0; };
const digits = (p) => p ? [p.value, p.max, p.min, p.mean].map(dec) : null;

let col = 0;
for (const c of CASES) {
  await fakeStates(page, { [c.id]: { state: c.first } }, { sticky: true });
  const cls = 'qa-r515-' + col;
  await page.evaluate(async ([entity, cls, col]) => {
    const ha = document.querySelector('home-assistant');
    const h = await window.loadCardHelpers();
    const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_chart', entity, name: 'Test' });
    el.classList.add(cls);
    el.hass = ha.hass;
    el.style.cssText = 'position:fixed;left:' + (400 + col * 260) + 'px;top:300px;width:220px;height:140px;z-index:99990;';
    ha.shadowRoot.appendChild(el);
    setInterval(() => { if (el.hass !== ha.hass) el.hass = ha.hass; }, 200);
  }, [c.id, cls, col++]);
  await page.waitForFunction((cls) => { const el = document.querySelector('home-assistant').shadowRoot.querySelector('.' + cls);
    return el && el.shadowRoot && el.shadowRoot.querySelector('ha-card'); }, cls, { timeout: 10000 });
  const at = await page.evaluate((cls) => { const r = document.querySelector('home-assistant').shadowRoot.querySelector('.' + cls).getBoundingClientRect();
    return { x: r.x + r.width * 0.7, y: r.y + r.height * 0.75 }; }, cls);
  await page.mouse.click(at.x, at.y);
  let p = await stable(page, info, null, { max: 15000, quiet: 2000, until: (v) => v && v.paths > 0 && v.value && v.mean && v.max && v.min });
  await need(c.tag + ': popup open with statistics', p && p.mean && p.max && p.min, p);
  const d0 = digits(p);
  await shot((col - 1) + '-open');
  await check(c.tag + ': opened at ' + c.first + ' – stage and statistics carry the same decimals',
    d0 && d0.every((d) => d === d0[0]) && Math.abs(num(p.value) - parseFloat(c.first)) < 0.1, { p, d0 });

  await fakeStates(page, { [c.id]: { state: c.next } }, { sticky: true });
  // The number follows through data-hp-live (once a second); the statistics card is drawn anew with the state.
  p = await stable(page, info, null, { max: 6000, quiet: 2000, until: (v) => v && Math.abs(num(v.value) - parseFloat(c.next)) < 0.01 });
  const d1 = digits(p);
  await shot((col - 1) + '-next');
  await check(c.tag + ': new value ' + c.next + ' – the stage follows', p && Math.abs(num(p.value) - parseFloat(c.next)) < 0.01, p);
  await check(c.tag + ': new value – the decimals stay as they were drawn on opening (' + (d0 && d0.join('/')) + ')',
    d0 && d1 && d1.join('/') === d0.join('/'), { p, d0, d1 });

  await page.evaluate(() => window.__pierce('casora-popup').forEach((x) => x.hasAttribute('open') && x.close()));
  await page.waitForTimeout(800);
}
await finish();
