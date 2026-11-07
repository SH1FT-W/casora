// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/casora-chart.js#_bind,_draw,setConfig
// Owner, 06.11.2026: the charts „stutter a bit“ while the pointer reads a value. Measured: every new value of the charted
// sensor (history stream) redrew the chart from scratch, and the redraw dropped the reading – hair line gone, the
// popup's number back to „Jetzt“ – until the pointer moved again; a pointer held still lost its reading for good.
// Expected: a new value redraws the curve and the reading stays where the pointer is.
// The chart tile only exists in the browser; the test house's made-up CPU temperature gets two values over REST
// (throwaway HA only, as the mock does every few seconds anyway).
import { open, casoraDashboard, dashboard, check, need, finish, stable } from './lib.mjs';

const ID = 'sensor.testserver_processor_temperature';
const dash = await casoraDashboard();
await need('a Casora dashboard', dash);
const { page } = await open({ width: 1440, height: 1000, theme: 'Casora' });
await page.addInitScript(() => {
  window.__r594 = { draws: 0 };
  customElements.whenDefined('casora-chart').then(() => {
    const P = customElements.get('casora-chart').prototype, d = P._draw;
    P._draw = function () { window.__r594.draws++; return d.apply(this, arguments); };
  });
});
await dashboard(page, dash.url, 3);
await need('Testserver in the test house (mock)', await page.evaluate((id) => !!document.querySelector('home-assistant').hass.states[id], ID));
await page.evaluate(async (entity) => {
  const ha = document.querySelector('home-assistant');
  const h = await window.loadCardHelpers();
  const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_chart', entity, name: 'CPU' });
  el.classList.add('qa-r594');
  el.hass = ha.hass;
  el.style.cssText = 'position:fixed;left:400px;top:300px;width:220px;height:140px;z-index:99990;';
  ha.shadowRoot.appendChild(el);
  setInterval(() => { if (el.hass !== ha.hass) el.hass = ha.hass; }, 200);
}, ID);
await page.waitForFunction(() => { const el = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-r594');
  return el && el.shadowRoot && el.shadowRoot.querySelector('ha-card'); }, null, { timeout: 10000 });
const at = await page.evaluate(() => { const r = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-r594').getBoundingClientRect();
  return { x: r.x + r.width * 0.7, y: r.y + r.height * 0.75 }; });
await page.mouse.click(at.x, at.y);

const state = () => {
  const pop = window.__pierce('casora-popup').find((p) => p.hasAttribute('open'));
  const c = pop && window.__pierce('casora-chart', pop.shadowRoot).find((x) => x.getBoundingClientRect().height > 80);
  if (!c || !c.shadowRoot.querySelector('svg path')) return null;
  const r = c.shadowRoot.querySelector('svg').getBoundingClientRect(), g = c.shadowRoot.querySelector('svg g');
  const own = c.shadowRoot.querySelector('.ro:not(.fb)'), fb = c.shadowRoot.querySelector('.fb.on');
  const reads = window.__pierce('[data-casora-reading]', pop.shadowRoot).map((n) => n.textContent.trim()).join(' ');
  return { x: r.x, y: r.y, w: r.width, h: r.height, hair: g ? g.style.opacity : null, draws: window.__r594.draws,
    reading: (own ? own.textContent : '') + (fb ? fb.textContent : '') + reads };
};
const s0 = await stable(page, state, null, { max: 15000, quiet: 1500 });
await need('popup with the drawn Verlauf', s0, s0);
await page.mouse.move(s0.x + s0.w * 0.3, s0.y + s0.h * 0.6);
await page.mouse.move(s0.x + s0.w * 0.3 + 2, s0.y + s0.h * 0.6);
await page.waitForTimeout(300);
const a = await page.evaluate(state);
await need('pointing reads an earlier time', a && a.hair === '1' && /Uhr|AM|PM|\d:\d\d/.test(a.reading) && !/Jetzt/.test(a.reading), a);

// Two new values while the pointer stays where it is.
for (let i = 0; i < 2; i++) {
  await page.evaluate((id) => { const h = document.querySelector('home-assistant').hass, st = h.states[id];
    return h.callApi('POST', 'states/' + id, { state: String(Math.round(((parseFloat(st.state) || 40) + 0.7) * 10) / 10), attributes: st.attributes }); }, ID);
  await page.waitForTimeout(900);
}
const b = await page.evaluate(state);
await need('the new values redrew the chart', b && b.draws > a.draws, { a, b });
// (Buckets follow „now“, so the time read may move by a minute between two drawings: an earlier time is enough.)
const early = (s) => s.hair === '1' && /Uhr|AM|PM|\d:\d\d/.test(s.reading) && !/Jetzt/.test(s.reading);
await check('After a redraw the reading stays: hair line shown, an earlier time read', early(b), { a, b });
await page.mouse.move(5, 5);
await page.waitForTimeout(300);
const c = await page.evaluate(state);
await check('Letting go still ends the reading', c && !early(c), c);
await finish();
