// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/casora-chart.js#_say,_hero,_release
// Owner, 07.11.2026 (network popup, phone): the Verlauf with Download and Upload read only one value while scrubbing –
// the head showed „2,0 Mbit/s Fr, 20:26“, the two legend pills under the plot kept the latest values. The v3 chart reads
// in its own head (readout 'own'), and only a hero readout wrote into the popup's numbers ([data-casora-read]).
// Expected: pointing at an earlier time sets each pill to its series' value there; letting go brings the latest back.
// The tile only exists in the browser, nothing is saved.
import { open, casoraDashboard, dashboard, check, need, finish, stable } from './lib.mjs';

const dash = await casoraDashboard();
await need('a Casora dashboard', dash);
const { page } = await open({ width: 1440, height: 900 });
await dashboard(page, dash.url, 3);
const ids = await page.evaluate(() => {
  const S = document.querySelector('home-assistant').hass.states;
  const all = Object.keys(S).filter((e) => e.startsWith('sensor.') && S[e].attributes.device_class === 'data_rate' && isFinite(parseFloat(S[e].state)));
  return { dl: all.find((e) => /download/.test(e)), ul: all.find((e) => /upload/.test(e)) };
});
await need('download and upload sensors in the test house', ids.dl && ids.ul, ids);

await page.evaluate(async (ids) => {
  const ha = document.querySelector('home-assistant');
  const h = await window.loadCardHelpers();
  const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_network', entity: ids.dl, variables: { entity_download: ids.dl, entity_upload: ids.ul } });
  el.classList.add('qa-r593');
  el.hass = ha.hass;
  el.style.cssText = 'position:fixed;left:400px;top:300px;width:220px;height:140px;z-index:99999;';
  ha.shadowRoot.appendChild(el);
}, ids);
await page.waitForTimeout(1500);
const at = await page.evaluate(() => { const el = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-r593');
  const r = (el.shadowRoot && el.shadowRoot.querySelector('ha-card') || el).getBoundingClientRect();
  return { x: r.x + Math.min(r.width, 200) / 2, y: r.y + Math.min(r.height, 120) / 2 }; });
await page.mouse.click(at.x, at.y);

// The pills: the popup's numbers that read one series each (not the chart's own head).
const state = (ids) => {
  const pop = window.__pierce('casora-popup').find((p) => p.hasAttribute('open'));
  if (!pop) return null;
  const c = window.__pierce('casora-chart', pop.shadowRoot).find((x) => x.getBoundingClientRect().width > 50 && x.shadowRoot && x.shadowRoot.querySelector('svg path[d^="M"]'));
  const pill = (id) => { const n = window.__pierce('[data-casora-read="' + id + '"]', pop.shadowRoot).find((x) => x.getBoundingClientRect().width > 0); return n ? n.textContent.trim() : null; };
  if (!c) return null;
  const r = c.shadowRoot.querySelector('svg').getBoundingClientRect();
  const ro = c.shadowRoot.querySelector('.ro:not(.fb)');
  return { x: r.x, y: r.y, w: r.width, h: r.height, dl: pill(ids.dl), ul: pill(ids.ul), head: ro ? ro.textContent : null, n: c._c.series.length,
    reading: window.__pierce('[data-casora-reading]', pop.shadowRoot).length };
};
const s0 = await stable(page, state, ids, { max: 12000, quiet: 1200 });
await need('network popup with the two-series Verlauf and both pills', s0 && s0.n === 2 && s0.dl != null && s0.ul != null, s0);

// Expected values at the pointed time, from the chart's own readout data (the same code path as its legend).
const read = async (fx) => {
  await page.mouse.move(s0.x + s0.w * fx, s0.y + s0.h * 0.5);
  await page.mouse.move(s0.x + s0.w * fx + 1, s0.y + s0.h * 0.5);
  await page.waitForTimeout(250);
  return page.evaluate(state, ids);
};
let a = await read(0.1), b = await read(0.45);
// The test house's data rates wander; two points far apart differ in at least one series.
const moved = (s) => s.dl !== s0.dl || s.ul !== s0.ul;
await check('Pointing at an earlier time: the head reads a time, not „Jetzt“', a && !/Jetzt$/.test(a.head || ''), a);
await check('Pointing: both pills follow the pointed time (not the latest values)', a && b && (moved(a) || moved(b)) && (a.dl !== b.dl || a.ul !== b.ul), { s0, a, b });
await page.mouse.move(5, 5);
const back = await stable(page, state, ids, { max: 3000, quiet: 400 });
// (The pills keep following live values, so a new reading may have come in meanwhile.)
await check('Letting go: the pills show the latest values again', back && back.reading === 0 && (back.dl === s0.dl && back.ul === s0.ul || back.dl !== b.dl || back.ul !== b.ul), { s0, b, back });
await finish();
