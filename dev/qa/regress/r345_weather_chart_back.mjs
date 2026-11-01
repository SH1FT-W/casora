// @zustand: arbeit
// @parallel: allein
// @deckt: custom_components/casora/scripts/casora-chart.js custom_components/casora/scripts/local/00-finder.js custom_components/casora/scripts/casora-core.js
// Issues #67 and #68 (andreasgoetzke, 26.10.2026), weather popup with several curves in one chart (test station
// weather.testwetter, dev/casora_mock/wetter.py: Temperatur + Gefühlt).
//   #67: pointing at the chart showed only the first curve's value. Expected: every legend entry shows its own
//        curve's value at that time while pointing, and the values go away when the pointer leaves.
//   #68: tapping a value row (e.g. "Gefühlt") opened its own popup with ‹; back in the weather popup the chart area
//        stayed empty. Expected: after ‹ the chart is drawn again (curves and legend). v3 has no such rows; the sub
//        page is opened through casoraPopup.sub like every „… ›“ row.
// Desktop 1440 dark.
import { open, casoraDashboards, dashboard, check, need, finish, usePage } from './lib.mjs';

const WX = 'weather.testwetter';
const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && d.url === 'qa-arbeit') || all.find((d) => !d.mobile);
await need('ein Casora-Dashboard', desk, all.map((d) => d.url));

const { page } = await open({ width: 1440, height: 900, dark: true });
usePage(page);
const errs = [];
// Only Casora's own errors count (the test HA also runs other plugins, e.g. kiosk-mode).
page.on('pageerror', (e) => { const t = String(e && e.stack || e); if (/casora|button-card/i.test(t)) errs.push('pageerror: ' + t.slice(0, 300)); });
await dashboard(page, desk.url, 3);

// The chart of the open popup: number of drawn curves and the legend.
const chartState = () => page.evaluate(() => {
  const S = window.casoraPopup && window.casoraPopup.surface;
  const c = S && window.__pierce('casora-chart', S)[0];
  if (!c || !c.shadowRoot) return { chart: false };
  const lines = [...c.shadowRoot.querySelectorAll('path')].filter((p) => /fill:none/.test(p.getAttribute('style') || ''));
  const r = c.getBoundingClientRect();
  return { chart: true, lines: lines.length, legend: [...c.shadowRoot.querySelectorAll('.lg span')].map((x) => x.textContent), w: Math.round(r.width), h: Math.round(r.height) };
});
const waitChart = async () => {
  let s = null;
  for (let i = 0; i < 50; i++) { s = await chartState(); if (s.chart && s.lines >= 2) return s; await page.waitForTimeout(200); }
  return s;
};

const opened = await page.evaluate(async (entity) => {
  const ha = document.querySelector('home-assistant');
  if (!ha.hass.states[entity]) return 'missing ' + entity;
  const old = window.__pierce('button-card').find((b) => { const x = b.getBoundingClientRect(); return x.width > 60 && x.height > 40 && x.top > 60; });
  const el = document.createElement('button-card');
  el.setConfig({ type: 'custom:button-card', template: 'casora_weather', entity, variables: {} });
  el.hass = ha.hass; old.parentNode.insertBefore(el, old); window.__r345 = el;
  await new Promise((res) => setTimeout(res, 800));
  el.addEventListener('hass-action', (ev) => { const act = ev.detail && ev.detail.config && ev.detail.config.tap_action;
    if (act && act.casora_popup && window.casoraPopup) { ev.stopPropagation(); window.casoraPopup.open(Object.assign({}, act.casora_popup, { src: el })); } }, { capture: true, once: true });
  el._handleAction({ detail: { action: 'tap' } }, { isIcon: false });
  return 'ok';
}, WX);
await need('Wetter-Popup geöffnet', opened === 'ok', opened);
const before = await waitChart();
await need('Diagramm mit zwei Kurven', before && before.lines >= 2, before);

// #67: point at the middle of the chart.
const hover = async () => {
  // The frame puts a freshly drawn popup back to the top for a moment (casora-core: 0/120/400 ms after a render,
  // unless the user scrolled): scroll the chart in, wait, and scroll again so the pointer lands on it.
  for (let k = 0; k < 2; k++) {
    await page.evaluate(() => window.__pierce('casora-chart', window.casoraPopup.surface)[0].shadowRoot.querySelector('svg').scrollIntoView({ block: 'center', behavior: 'instant' }));
    await page.waitForTimeout(600);
  }
  const box = await page.evaluate(() => {
    const c = window.__pierce('casora-chart', window.casoraPopup.surface)[0];
    const svg = c.shadowRoot.querySelector('svg'); svg.scrollIntoView({ block: 'center', behavior: 'instant' });
    const r = svg.getBoundingClientRect(); return { x: r.left + r.width * 0.6, y: r.top + r.height / 2 };
  });
  await page.mouse.move(box.x, box.y, { steps: 4 });
  await page.waitForTimeout(250);
  return page.evaluate(() => [...window.__pierce('casora-chart', window.casoraPopup.surface)[0].shadowRoot.querySelectorAll('.lg .lv')].map((b) => b.textContent));
};
const vals = await hover();
await check('#67: beim Zeigen hat jede Kurve ihren Wert in der Legende', vals.length >= 2 && vals.every((v) => /\d/.test(v)), vals);
await page.mouse.move(5, 5);
await page.waitForTimeout(250);
const gone = await page.evaluate(() => [...window.__pierce('casora-chart', window.casoraPopup.surface)[0].shadowRoot.querySelectorAll('.lg .lv')].map((b) => b.textContent));
await check('#67: Werte verschwinden beim Verlassen', gone.every((v) => v === ''), gone);

// #68: a sub page of the weather popup, then ‹. Popup v3 has no value rows that open a page of their own any more
// (§8: details are rain, wind and UV only), so the sub page is opened the way every popup row does it
// (casoraPopup.sub, as „… ›“ rows call it); the chart must be drawn again after ‹.
const tapped = await page.evaluate(async () => {
  window.casoraPopup.sub({ title: 'Gefühlt', content: { type: 'custom:button-card', name: 'QA', show_icon: false } });
  for (let i = 0; i < 30; i++) {
    const el = window.casoraPopup.element, b = el && el._headerBack;
    if (b && !b.hidden && /Gefühlt/.test(el._headerTitle.textContent)) return 'ok';
    await new Promise((res) => setTimeout(res, 150));
  }
  return 'no sub page: ' + (window.casoraPopup.element && window.casoraPopup.element._headerTitle.textContent);
});
await need('Unterseite mit ‹ geöffnet', tapped === 'ok', tapped);
await page.waitForTimeout(600);
await page.evaluate(() => window.casoraPopup.element._headerBack.click());
await page.waitForTimeout(400);
const after = await waitChart();
await check('#68: nach ‹ ist das Diagramm wieder gezeichnet', after && after.lines >= 2 && after.h > 60, { before, after });
await check('#68: Legende wieder da', after && after.legend.join('|') === before.legend.join('|'), { before: before.legend, after: after && after.legend });
// v3: today's low and high are the ends of the wheel („T 5°“, „H 11°“) – from the forecast, there again after ‹.
const hilo = await page.evaluate(() => window.__pierce('.hui-stage', window.casoraPopup.surface).map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
await check('#68: Tief/Hoch am Rad auch nach ‹', hilo.length && hilo.some((t) => /T -?\d+°/.test(t) && /H -?\d+°/.test(t)), hilo);
const vals2 = await hover();
await check('#67/#68: Zeigen geht auch nach ‹', vals2.length >= 2 && vals2.every((v) => /\d/.test(v)), vals2);
await check('keine Seitenfehler', !errs.length, errs);
await page.evaluate(() => { if (window.casoraPopup) window.casoraPopup.close(); if (window.__r345) window.__r345.remove(); });
await finish();
