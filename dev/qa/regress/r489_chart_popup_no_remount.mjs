// @zustand: arbeit
// @deckt: custom_components/casora/scripts/local/27-chart.js
// Chart tile popup (casora_popup_chart, v3 stage S6) on the made-up "Testserver" (processor temperature): a new value of the sensor must not
// mount the chart on the stage anew (same fault r303 covers for the reading page, fixed there in c34017a6). The stage
// drew its value into the HTML, so every value meant new HTML, a new empty slot and a new casora-chart (flicker).
// Checked: six new values → no new casora-chart/button-card in the popup, the chart keeps its lines, the stage number
// follows live; a range switch still draws the chart for the new range; "unavailable" still reaches the stage.
// Nothing is saved: the tile only exists in the browser, states are pushed only in the browser (fakeStates).
import { open, casoraDashboard, dashboard, check, need, finish, stable, fakeStates } from './lib.mjs';

// A reading with a plate stage (°C). A percentage draws the stage as a wheel whose ring shows the value; that stage
// still draws anew per value (open, see the commit).
const ID = 'sensor.testserver_processor_temperature';
const num = (v) => parseFloat(String(v || '').replace(',', '.'));
const dash = await casoraDashboard();
await need('a Casora dashboard', dash);
const { page } = await open({ width: 1440, height: 1000, theme: 'Casora' });
await dashboard(page, dash.url, 3);
await need('Testserver in the test house (mock)', await page.evaluate((id) => !!document.querySelector('home-assistant').hass.states[id], ID));

await page.evaluate(async (entity) => {
  const ha = document.querySelector('home-assistant');
  const h = await window.loadCardHelpers();
  const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_chart', entity, name: 'CPU' });
  el.classList.add('qa-r488');
  el.hass = ha.hass;
  el.style.cssText = 'position:fixed;left:400px;top:300px;width:220px;height:140px;z-index:99990;';
  ha.shadowRoot.appendChild(el);
  setInterval(() => { if (el.hass !== ha.hass) el.hass = ha.hass; }, 200);
}, ID);
await page.waitForFunction(() => { const el = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-r488');
  return el && el.shadowRoot && el.shadowRoot.querySelector('ha-card'); }, null, { timeout: 10000 });

const info = () => {
  const pop = window.__pierce('casora-popup').find((p) => p.hasAttribute('open'));
  if (!pop) return null;
  const ch = window.__pierce('casora-chart', pop.shadowRoot).filter((c) => c.getBoundingClientRect().width > 0);
  const n = window.__pierce('.hui-stage .hui-st-n', pop.shadowRoot).find((x) => x.getBoundingClientRect().height > 0);
  const txt = window.__pierce('.hui-stage', pop.shadowRoot).map((s) => s.textContent).join(' ').replace(/\s+/g, ' ');
  return { charts: ch.length, span: ch[0] && ch[0]._c ? ch[0]._c.span : null,
    paths: ch[0] && ch[0].shadowRoot ? ch[0].shadowRoot.querySelectorAll('svg path').length : 0,
    value: n ? n.textContent.trim() : '', txt: txt.slice(0, 300), neu: window.__r488 ? window.__r488.neu.slice() : null };
};

const at = await page.evaluate(() => { const r = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-r488').getBoundingClientRect();
  return { x: r.x + r.width * 0.7, y: r.y + r.height * 0.75 }; });
await page.mouse.click(at.x, at.y);
let p = await stable(page, info, null, { max: 15000, quiet: 2000, until: (v) => v && v.paths > 0 && v.value });
await check('Popup open with a drawn chart on the stage', p && p.charts === 1 && p.paths > 0, p);

// Mark every button-card/casora-chart in the popup, then note each one hung in afterwards (also in shadow roots).
await page.evaluate(() => {
  const pop = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
  window.__r488 = { neu: [] };
  const tag = (r) => r.querySelectorAll('*').forEach((e) => { if (/^(BUTTON-CARD|CASORA-CHART)$/.test(e.nodeName)) e.__r488 = 1; if (e.shadowRoot) tag(e.shadowRoot); });
  tag(pop.shadowRoot);
  const seen = new WeakSet();
  const obs = (root) => {
    if (seen.has(root)) return; seen.add(root);
    new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => {
      if (/^(BUTTON-CARD|CASORA-CHART)$/.test(n.nodeName) && !n.__r488) window.__r488.neu.push(n.nodeName);
    }))).observe(root, { childList: true, subtree: true });
  };
  const walk = (n) => { if (n.shadowRoot) { obs(n.shadowRoot); walk(n.shadowRoot); } (n.childNodes || []).forEach(walk); };
  walk(pop.shadowRoot);
  window.__r488.t = setInterval(() => walk(pop.shadowRoot), 100);
});
for (let i = 1; i <= 6; i++) await fakeStates(page, { [ID]: { state: String(40 + i) } }, { sticky: true });
// The number follows through data-hp-live (once a second).
p = await stable(page, info, null, { max: 5000, quiet: 1200, until: (v) => v && num(v.value) === 46 });
await page.evaluate(() => clearInterval(window.__r488.t));
await check('Six new values: no chart (or card) mounted anew on the stage', p && p.neu && p.neu.length === 0, p && p.neu);
await check('Six new values: the chart keeps its lines', p && p.charts === 1 && p.paths > 0, p);
await check('Six new values: the stage number follows live (46)', p && num(p.value) === 46, p);

// Range switch: the stage draws anew and mounts the chart for the new range.
await page.evaluate(() => { const s = window.__pierce('[data-casora-cspan]').find((x) => /\|7d$/.test(x.getAttribute('data-casora-cspan'))); s.click(); });
p = await stable(page, info, null, { max: 15000, quiet: 2000, until: (v) => v && v.span === '7d' && v.paths > 0 });
await check('Range "7 Tage": chart drawn for 7 days', p && p.charts === 1 && p.span === '7d' && p.paths > 0, p);

// A change of the state kind still reaches the stage.
await fakeStates(page, { [ID]: { state: 'unavailable' } }, { sticky: true });
p = await stable(page, info, null, { max: 6000, quiet: 1200, until: (v) => v && /Nicht verfügbar/.test(v.txt) });
await check('Unavailable: the stage says so', p && /Nicht verfügbar/.test(p.txt), p);
await fakeStates(page, { [ID]: { state: '47' } }, { sticky: true });
p = await stable(page, info, null, { max: 6000, quiet: 1200, until: (v) => v && num(v.value) === 47 && !/Nicht verfügbar/.test(v.txt) });
await check('Back to a number: value on the stage, chart still there', p && num(p.value) === 47 && p.charts === 1 && p.paths > 0, p);
await finish();
