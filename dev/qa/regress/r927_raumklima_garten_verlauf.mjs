// @zustand: arbeit
// @deckt: custom_components/casora/scripts/local/05-standard-medien.js#_casoraVent,V.outSeries,V.sec,V.chartCfg,V.popup,V.pick custom_components/casora/scripts/local/27-chart.js#_casoraChartCard custom_components/casora/scripts/casora-chart.js
// #235: the Raumklima popup on an outdoor room's page (a garden) showed the stage only – outdoor temperature and
// humidity, no Verlauf, no lowest and highest. Expected on a copy of qa-arbeit with a view „Garten“ (deleted at the
// end; the backend's outdoor readings faked in this browser only, pointing at two real sensors with a history):
// the stage „Außenluft“, a Verlauf with temperature and humidity and the range switch, and „Höchster Wert“ /
// „Tiefster Wert“ of the temperature for the chosen range. Screenshots with R927_SHOT=<folder>.
import { open, casoraDashboard, dashboard, stable, check, need, finish, usePage, fakeStates, atFinish } from './lib.mjs';
import { ws } from '../ws.mjs';

const SHOT = process.env.R927_SHOT || '';
const dash = await casoraDashboard((d) => d.url === 'qa-arbeit' || (d.config.views || []).some((v) => v.path === 'schlafzimmer'));
await need('Casora dashboard with a Schlafzimmer', dash && dash.config.views.some((v) => v.path === 'schlafzimmer'), dash && dash.url);
const URL = 'qa-raumklima-r927';
const D = JSON.parse(JSON.stringify(dash.config));
// The garden: the test house's own view, else the bedroom's under that name; the room climate tile first in its row.
let G = D.views.find((v) => v.path === 'garten');
if (!G) {
  G = JSON.parse(JSON.stringify(D.views.find((v) => v.path === 'schlafzimmer')));
  G.path = 'garten'; G.title = 'Garten';
  D.views.push(G);
}
const head = G.cards.find((x) => [].concat(x.template || []).includes('casora_room'));
await need('room view with a casora_room header', head);
head.name = 'Garten';
const sr = G.cards.find((x) => x.type === 'custom:casora-smart-row');
await need('room view with a tile row', sr);
const c = await ws();
// A second tile with a sensor picked by hand (Studio „More outdoor sensors“): a temperature sensor outside the bedroom.
const all0 = await c.cmd({ type: 'get_states' });
const hand = (all0.find((x) => /^sensor\./.test(x.entity_id) && x.attributes.device_class === 'temperature' && x.attributes.state_class === 'measurement'
  && isFinite(parseFloat(x.state)) && !/schlafzimmer/.test(x.entity_id)) || {}).entity_id;
await need('test house: a second temperature sensor', hand, hand);
sr.cards.unshift({ type: 'custom:button-card', template: 'casora_vent', name: 'Raumklima' },
  { type: 'custom:button-card', template: 'casora_vent', name: 'Raumklima Hand', variables: { outdoor_sensors: [hand] } });
const list = await c.cmd({ type: 'lovelace/dashboards/list' });
if (!list.some((d) => d.url_path === URL)) await c.cmd({ type: 'lovelace/dashboards/create', url_path: URL, title: 'QA Garten', mode: 'storage', show_in_sidebar: false, require_admin: false });
await c.cmd({ type: 'lovelace/config/save', url_path: URL, config: D });
c.close();
atFinish(async () => {
  const c2 = await ws();
  const l2 = await c2.cmd({ type: 'lovelace/dashboards/list' });
  const d = l2.find((x) => x.url_path === URL);
  if (d) await c2.cmd({ type: 'lovelace/dashboards/delete', dashboard_id: d.id });
  c2.close();
});

const popup = () => {
  const p = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
  if (!p) return null;
  const all = [];
  (function walk(root) { root.querySelectorAll('*').forEach((n) => { all.push(n); if (n.shadowRoot) walk(n.shadowRoot); }); })(p.shadowRoot || p);
  const stage = all.find((n) => n.classList && (n.classList.contains('hui-dl-t') || n.classList.contains('hui-st-text')));
  const ch = all.find((n) => n.localName === 'casora-chart');
  const slot = all.find((n) => n.classList && n.classList.contains('hp-chart-slot'));
  const title = slot && slot.previousElementSibling;
  const segs = all.filter((n) => n.hasAttribute && n.hasAttribute('data-casora-vspan')).map((n) => ({ sp: n.getAttribute('data-casora-vspan'), on: n.classList.contains('on') }));
  const rows = all.filter((n) => n.classList && n.classList.contains('hui-srow')).map((r) => r.innerText.replace(/\s+/g, ' ').trim());
  const cc = ch && ch._c;
  return { stage: stage ? stage.innerText.replace(/\s+/g, ' ').trim() : '', title: title ? title.textContent.trim() : '', span: cc && cc.span,
    series: cc ? cc.series.map((x) => [x.entity, x.name]) : [], sw: cc ? cc.switch : undefined,
    // The legend stays inside the chart (long sensor names wrap).
    lgFit: (() => { const lg = ch && ch.shadowRoot && ch.shadowRoot.querySelector('.lg'); if (!lg) return null;
      const box = ch.getBoundingClientRect(); return [...lg.children].every((x) => x.getBoundingClientRect().right <= box.right + 1); })(), lines: ch && ch.shadowRoot ? ch.shadowRoot.querySelectorAll('path').length : 0, segs, rows,
    text: (p.shadowRoot || p).textContent ? '' : '', all: all.filter((n) => n.classList && n.classList.contains('hui-plate')).map((n) => n.innerText.replace(/\s+/g, ' ').trim().slice(0, 60)) };
};
const tile = () => window.__pierce('button-card').filter((b) => [].concat((b._config || {}).template || []).includes('casora_vent'))
  .map((b) => { const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width }; }).filter((b) => b.w > 0);
const tapSpan = async (pg, sp, mobile) => {
  const at = await pg.evaluate((s) => {
    const p = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
    const all = [];
    (function walk(root) { root.querySelectorAll('*').forEach((n) => { all.push(n); if (n.shadowRoot) walk(n.shadowRoot); }); })(p.shadowRoot || p);
    const n = all.find((x) => x.getAttribute && x.getAttribute('data-casora-vspan') === s);
    if (!n) return null;
    n.scrollIntoView({ block: 'center' });
    return true;
  }, sp);
  if (!at) return false;
  await pg.waitForTimeout(500);
  const xy = await pg.evaluate((s) => {
    const p = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
    const all = [];
    (function walk(root) { root.querySelectorAll('*').forEach((n) => { all.push(n); if (n.shadowRoot) walk(n.shadowRoot); }); })(p.shadowRoot || p);
    const r = all.find((x) => x.getAttribute && x.getAttribute('data-casora-vspan') === s).getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, sp);
  if (mobile) await pg.touchscreen.tap(xy.x, xy.y); else await pg.mouse.click(xy.x, xy.y);
  await pg.waitForTimeout(1500);
  return true;
};

const run = async (pg, mobile, path, nth) => {
  usePage(pg);
  await dashboard(pg, URL + '/' + path, 1);
  // Two real sensors with a history stand in for the house's outdoor sensors.
  const ids = await pg.evaluate(() => window._casoraVent.sensorsOf(document.querySelector('home-assistant').hass, 'schlafzimmer'));
  await need('test house: a temperature and a humidity sensor with a history', ids.t.length && ids.rh.length, ids);
  await fakeStates(pg, { 'sensor.casora_lueften': { state: 'ok', attributes: { rooms: [],
    aussen: { t: 1.9, rh: 94, ah: 5.2, pm25: null, t_id: ids.t[0], rh_id: ids.rh[0] } } } }, { sticky: true });
  const t = await stable(pg, tile);
  await need('room climate tile on the garden page', t.length, t);
  const tt = t[nth || 0] || t[0];
  if (mobile) await pg.touchscreen.tap(tt.x, tt.y); else await pg.mouse.click(tt.x, tt.y);
  const p = await stable(pg, popup, undefined, { max: 12000, quiet: 1500, until: (v) => v && v.lines >= 1 && v.rows.some((r) => /^Höchster Wert/.test(r)) });
  return { p, ids };
};

const { page } = await open({ width: 1440, height: 900, dark: true, theme: 'Casora' });
let { p, ids } = await run(page, false, 'garten');
console.log('    popup', JSON.stringify(p));
await need('popup of the garden', p, p);
await check(`stage: „Außenluft“ (${p.stage})`, /^Außenluft/.test(p.stage), p.stage);
await check(`a Verlauf (${p.title})`, p.title === 'Verlauf', p.title);
// The house's outdoor temperature first; with it the humidity, or (a garden area with sensors of its own) further temperatures.
await check('Verlauf: the outdoor temperature sensor first, a second line with it', p.series.length >= 2 && p.series[0][0] === ids.t[0]
  && (p.series[0][1] === 'Temperatur' ? p.series[1][0] === ids.rh[0] && p.series[1][1] === 'Luftfeuchtigkeit' : true), p.series);
await check('Verlauf: a line is drawn', p.lines >= 1, p.lines);
await check('Verlauf: the range switch 24 Std. / 7 Tage / 30 Tage, 24 h on', p.segs.map((x) => x.sp).join(',') === '24h,7d,30d' && p.segs[0].on, p.segs);
await check('highest and lowest temperature of the range', p.rows.some((r) => /^Höchster Wert .*\d/.test(r)) && p.rows.some((r) => /^Tiefster Wert .*\d/.test(r)), p.rows);
if (SHOT) await page.screenshot({ path: SHOT + '/' + (process.env.R927_TAG || 'after') + '-desktop.png' });
await tapSpan(page, '7d');
p = await stable(page, popup, undefined, { max: 12000, quiet: 1500, until: (v) => v && v.span === '7d' && v.lines >= 1 && v.rows.some((r) => /^Höchster Wert/.test(r)) });
await check(`7 Tage: chart and statistics follow (${p && p.span})`, p && p.span === '7d' && p.segs[1].on && p.rows.some((r) => /^Höchster Wert/.test(r)), p);
await page.keyboard.press('Escape');

// The tile with a sensor picked by hand: it joins the outdoor temperature in one chart with a legend, with its own highest/lowest.
({ p } = await run(page, false, 'garten', 1));
console.log('    by hand', JSON.stringify(p && { series: p.series, sw: p.sw, rows: p.rows, lgFit: p.lgFit }));
await check('by hand: the picked sensor in the chart after the outdoor temperature', p && p.series.length >= 2 && p.series[0][0] === ids.t[0] && p.series[1][0] === hand, p && p.series);
await check('by hand: one chart with a legend (no switch)', p && p.sw === false, p && p.sw);
await check('by hand: the legend fits the chart, long names wrap', p && p.lgFit === true, p && p.lgFit);
await check('by hand: highest and lowest per sensor', p && p.rows.filter((r) => /^Höchster Wert/.test(r)).length >= 2, p && p.rows);
if (SHOT) await page.screenshot({ path: SHOT + '/after-hand-desktop.png' });
await page.keyboard.press('Escape');

// Phone: the same on the garden's room page (stage → Verlauf → statistics), the range by finger.
const ph = await open({ width: 393, height: 852, mobile: true, dark: true, theme: 'Casora' });
usePage(ph.page);
await dashboard(ph.page, URL + '/garten', 1);
const idp = await ph.page.evaluate(() => window._casoraVent.sensorsOf(document.querySelector('home-assistant').hass, 'schlafzimmer'));
await fakeStates(ph.page, { 'sensor.casora_lueften': { state: 'ok', attributes: { rooms: [],
  aussen: { t: 1.9, rh: 94, ah: 5.2, pm25: null, t_id: idp.t[0], rh_id: idp.rh[0] } } } }, { sticky: true });
const tp = await stable(ph.page, tile);
if (tp.length) {
  await ph.page.touchscreen.tap(tp[0].x, tp[0].y);
  let pp = await stable(ph.page, popup, undefined, { max: 12000, quiet: 1500, until: (v) => v && v.lines >= 1 });
  await check('phone: the Verlauf of the garden', pp && pp.title === 'Verlauf' && pp.lines >= 1, pp);
  await tapSpan(ph.page, '30d', true);
  pp = await stable(ph.page, popup, undefined, { max: 12000, quiet: 1500, until: (v) => v && v.span === '30d' });
  await check(`phone: a finger tap picks 30 Tage (${pp && pp.span})`, pp && pp.span === '30d', pp);
  if (SHOT) await ph.page.screenshot({ path: SHOT + '/after-phone.png' });
} else {
  await check('phone: room climate tile on the garden page', false, tp);
}
await finish();
