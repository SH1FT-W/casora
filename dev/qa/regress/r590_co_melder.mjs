// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/42-co.js#_casoraCo
// CO detector (community card #124, follow-up): the popup v3 on the made-up "Testmelder" (casora_mock/co.py).
// At 60 ppm the head says the level („Warnung“), the stage is a dial whose ring carries the level's colour
// (orange) and the reading, under it the Verlauf with the 24 Std. · 7 Tage switch; pointing at the chart reads
// value and time into the dial's number. And the fault of r303/r488 for this popup: the stage drew the ppm into
// its HTML, so every whole-ppm change meant new HTML, a fresh slot and the chart mounted anew (12 remounts for
// 12 ppm steps). Fixed: frozen stage HTML, the number follows live (data-hp-live), the ring is painted in place.
// Nothing is saved: the tile only exists in the browser, states are pushed only in the browser (fakeStates).
import { open, casoraDashboard, dashboard, check, need, finish, stable, fakeStates } from './lib.mjs';

const ID = 'sensor.testmelder_kohlenmonoxid';
const num = (v) => parseFloat(String(v || '').replace(',', '.'));
const dash = await casoraDashboard();
await need('a Casora dashboard', dash);
const { page } = await open({ width: 1440, height: 1000 });
await dashboard(page, dash.url, 3);
await need('Testmelder in the test house (mock)', await page.evaluate((id) => !!document.querySelector('home-assistant').hass.states[id], ID));

// 60 ppm = „Warnung“ (50 … 99), pushed only in this browser.
await fakeStates(page, { [ID]: { state: '60' } }, { sticky: true });

// The tile as the Studio builds it (template + entity), hung into the page like r488.
await page.evaluate(async (entity) => {
  const ha = document.querySelector('home-assistant');
  const h = await window.loadCardHelpers();
  const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_co', entity, name: 'CO-Melder' });
  el.classList.add('qa-r590');
  el.hass = ha.hass;
  el.style.cssText = 'position:fixed;left:400px;top:300px;width:220px;height:140px;z-index:99990;';
  ha.shadowRoot.appendChild(el);
  setInterval(() => { if (el.hass !== ha.hass) el.hass = ha.hass; }, 200);
}, ID);
await page.waitForFunction(() => { const el = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-r590');
  return el && el.shadowRoot && el.shadowRoot.querySelector('ha-card'); }, null, { timeout: 10000 });

const info = () => {
  const pop = window.__pierce('casora-popup').find((p) => p.hasAttribute('open'));
  if (!pop) return null;
  const ch = window.__pierce('casora-chart', pop.shadowRoot).filter((c) => c.getBoundingClientRect().width > 0);
  const dl = window.__pierce('.hui-stage.dial .hui-dl', pop.shadowRoot).find((x) => x.getBoundingClientRect().width > 0);
  const n = window.__pierce('.hui-stage .hui-st-n', pop.shadowRoot).find((x) => x.getBoundingClientRect().height > 0);
  const when = window.__pierce('[data-casora-read-when]', pop.shadowRoot)[0];
  const fl = dl && dl.querySelector('.fl.ln');
  const segs = window.__pierce('[data-hp-metric]', pop.shadowRoot).map((s) => s.textContent.trim());
  const txt = pop.shadowRoot.textContent.replace(/\s+/g, ' ');
  return { charts: ch.length, paths: ch[0] && ch[0].shadowRoot ? ch[0].shadowRoot.querySelectorAll('svg path').length : 0,
    chart: ch[0] ? ch[0].getBoundingClientRect() : null,
    value: n ? n.textContent.trim() : '', when: when ? when.textContent.trim() : '',
    ring: fl ? (fl.getAttribute('style') || '') + '|' + fl.style.stroke : '', pct: dl ? dl.dataset.pct : null,
    warn: txt.includes('Warnung'), segs, neu: window.__r590 ? window.__r590.neu.slice() : null };
};

const at = await page.evaluate(() => { const r = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-r590').getBoundingClientRect();
  return { x: r.x + r.width * 0.7, y: r.y + r.height * 0.75 }; });
await page.mouse.click(at.x, at.y);
let p = await stable(page, info, null, { max: 20000, quiet: 2000, until: (v) => v && v.paths > 0 && v.value });
await need('popup open with the dial and a drawn chart', p && p.charts === 1 && p.paths > 0, p);

await check('60 ppm: the dial reads 60', num(p.value) === 60, p && p.value);
await check('60 ppm: the head says the level „Warnung“', p && p.warn, p);
await check('60 ppm: the ring carries the level colour (orange)', /casora-color-orange/.test(p.ring), p && p.ring);
await check('Verlauf with the 24 Std. · 7 Tage switch', p.segs.includes('24 Std.') && p.segs.includes('7 Tage'), p && p.segs);

// Pointing at the chart reads value and time into the dial's number (readout: 'hero').
await page.mouse.move(p.chart.x + p.chart.width * 0.1, p.chart.y + p.chart.height * 0.6);
const read = await stable(page, info, null, { max: 5000, quiet: 800, until: (v) => v && v.when && !/Jetzt$/.test(v.when) });
await check('Pointing at the chart reads value and time', read && read.value !== '' && !!read.when && !/Jetzt$/.test(read.when),
  read && { value: read.value, when: read.when });
await page.mouse.move(40, 900);
await page.waitForTimeout(800);

// Twelve whole-ppm changes inside „Warnung“: the content must not rebuild – no new chart, no new stage,
// the number follows live, the ring moves in place (r303/r488 for this popup).
await page.evaluate(() => {
  const pop = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
  window.__r590 = { neu: [] };
  const tag = (r) => r.querySelectorAll('*').forEach((e) => { if (/^(BUTTON-CARD|CASORA-CHART)$/.test(e.nodeName)) e.__r590 = 1; if (e.shadowRoot) tag(e.shadowRoot); });
  tag(pop.shadowRoot);
  const seen = new WeakSet();
  const obs = (root) => {
    if (seen.has(root)) return; seen.add(root);
    new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((nd) => {
      if (nd.nodeType !== 1 || nd.__r590) return;
      if (/^(BUTTON-CARD|CASORA-CHART)$/.test(nd.nodeName)) window.__r590.neu.push(nd.nodeName);
      else if ((nd.classList && nd.classList.contains('hui-stage')) || (nd.querySelector && nd.querySelector('.hui-stage'))) window.__r590.neu.push('STAGE');
    }))).observe(root, { childList: true, subtree: true });
  };
  const walk = (n) => { if (n.shadowRoot) { obs(n.shadowRoot); walk(n.shadowRoot); } (n.childNodes || []).forEach(walk); };
  obs(pop.shadowRoot); walk(pop.shadowRoot);
  window.__r590.t = setInterval(() => walk(pop.shadowRoot), 100);
});
for (let v = 61; v <= 72; v++) await fakeStates(page, { [ID]: { state: String(v) } }, { sticky: true });
p = await stable(page, info, null, { max: 6000, quiet: 1200, until: (v) => v && num(v.value) === 72 });
await page.evaluate(() => clearInterval(window.__r590.t));
await check('Twelve new ppm: no chart or stage mounted anew', p && p.neu && p.neu.length === 0, p && p.neu);
await check('Twelve new ppm: the chart keeps its lines', p && p.charts === 1 && p.paths > 0, p);
await check('Twelve new ppm: the number follows live (72)', p && num(p.value) === 72, p && p.value);
await check('Twelve new ppm: the ring moved in place (48 %)', p && Math.round(num(p.pct)) === 48, p && p.pct);

await finish();
