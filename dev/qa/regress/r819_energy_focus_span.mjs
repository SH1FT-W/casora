// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/20-energie-fokus.js#build,sec,stage3,span,setSpan,chartCfg,spanHtml,pickSpan
// Issue #195: the energy sub-pages showed fixed ranges (solar/house 4 h, grid/battery 24 h), so grid and solar could not be
// compared over the same time. Under the stage's chart a switch „4 Std. / 24 Std.“: each page opens on its old range
// until it is tapped, then the choice holds for all energy pages for the session. Desktop (click) and tablet (finger,
// touchend). The Home badge gets the mock house's solar and grid sensors as sub-badges only in the browser (setConfig).
import { open, casoraDashboard, dashboard, check, need, finish, usePage } from './lib.mjs';

const SOLAR = 'sensor.testsolarbank_solarleistung', GRID = 'sensor.teststromzaehler_leistung';
const dash = await casoraDashboard((d) => (d.config.views || []).length > 1);
await need('Casora dashboard', dash);
for (const [tag, o] of [['Desktop', { width: 1440, height: 900, theme: 'Casora' }], ['Tablet', { width: 1180, height: 820, touch: true, theme: 'Casora' }]]) {
  const { page, browser } = await open(o);
  usePage(page);
  await dashboard(page, dash.url + '/home', 3);
  const set = await page.evaluate(([solar, grid]) => {
    const h = document.querySelector('home-assistant').hass;
    if (!h.states[solar] || !h.states[grid]) return 'no mock solar/grid sensors';
    const el = window.__pierce('button-card').find((b) => [].concat(b._config?.template || []).includes('casora_room') && b.getBoundingClientRect().width > 0)
      || window.__pierce('button-card').find((b) => [].concat(b._config?.template || []).includes('casora_room'));
    if (!el) return 'no room card';
    const cfg = JSON.parse(JSON.stringify(el._config));
    Object.keys(cfg.variables || {}).forEach((k) => { if (/^energy_(entity|popup_focus|label)_\d+$/.test(k)) delete cfg.variables[k]; });
    Object.assign(cfg.variables, { energy_entity_1: solar, energy_popup_focus_1: 'solar', energy_entity_2: grid, energy_popup_focus_2: 'grid' });
    el.setConfig(cfg); el.hass = h; return true;
  }, [SOLAR, GRID]);
  await need(tag + ': solar and grid as energy sub-badges', set === true, set);
  await page.waitForTimeout(2000);
  const tapAt = async (q, wait = 2800) => { if (o.touch) await page.touchscreen.tap(q.x, q.y); else await page.mouse.click(q.x, q.y); await page.waitForTimeout(wait); };
  const at = (t) => page.evaluate((t) => { const b = window.__pierce('button-card').find((x) => [].concat(x._config?.template || []).includes(t) && x.getBoundingClientRect().width > 20);
    if (!b) return null; b.scrollIntoView({ block: 'center', inline: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, t);
  const g = await at('casora_badge_energy_group');
  await need(tag + ': energy badge', g);
  await tapAt(g);
  if (await page.evaluate(() => !!(window.casoraPopup && window.casoraPopup.surface))) { await page.evaluate(() => window.casoraPopup.close()); await page.waitForTimeout(900); }
  const sub = (i) => page.evaluate((i) => { const b = window.__pierce('button-card').filter((x) => [].concat(x._config?.template || []).includes('casora_badge_energy') && x.getBoundingClientRect().width > 20)[i];
    if (!b) return null; b.scrollIntoView({ block: 'center', inline: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, i);
  // What the open page shows: the chosen segment, the range of the mounted chart and whether it drew a line.
  const read = () => page.evaluate(() => {
    const s = window.casoraPopup && window.casoraPopup.surface;
    const st = s ? window.__pierce('[data-casora-stage="S6"]', s).find((n) => n.getBoundingClientRect().height > 0) : null;
    const segs = st ? window.__pierce('[data-casora-efspan]', st).filter((n) => n.getBoundingClientRect().width > 0) : [];
    const on = segs.filter((n) => n.classList.contains('on')).map((n) => n.getAttribute('data-casora-efspan'));
    const c = st ? window.__pierce('casora-chart', st)[0] : null;
    const lines = c && c.shadowRoot ? [...c.shadowRoot.querySelectorAll('path')].filter((x) => (x.getAttribute('d') || '').length > 20).length : 0;
    const r = (sp) => { const n = segs.find((x) => x.getAttribute('data-casora-efspan') === sp); if (!n) return null; const b = n.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, h: b.height }; };
    return { open: !!s, segs: segs.length, on: on.join(','), chart: c && c._c ? c._c.span : null, lines, at4: r('4h'), at24: r('24h') };
  });
  const until = async (ok) => { let r = null; for (let k = 0; k < 25; k++) { r = await read(); if (ok(r)) break; await page.waitForTimeout(300); } return r; };
  const openSub = async (i) => { const q = await sub(i); await need(tag + ': sub-badge ' + (i + 1), q); await tapAt(q); };
  const close = async () => { await page.evaluate(() => window.casoraPopup.close()); await page.waitForTimeout(900); };

  // Solar opens on 4 h (as before), grid on 24 h.
  await openSub(0);
  let r = await until((x) => x.segs === 2 && x.chart && x.lines);
  await check(tag + ': solar page: switch „4 Std. / 24 Std.“ under the chart, 4 h chosen and drawn', r.segs === 2 && r.on === '4h' && r.chart === '4h' && r.lines > 0, r);
  await check(tag + ': the segments are at least 44 high', r.at4 && r.at4.h >= 44, r.at4);
  await close();
  await openSub(1);
  r = await until((x) => x.segs === 2 && x.chart && x.lines);
  await check(tag + ': grid page opens on 24 h', r.on === '24h' && r.chart === '24h' && r.lines > 0, r);
  await close();
  // Solar to 24 h: the chart follows, the popup stays open.
  await openSub(0);
  r = await until((x) => x.segs === 2 && x.chart && x.lines);
  await tapAt(r.at24, 600);
  r = await until((x) => x.on === '24h' && x.chart === '24h' && x.lines);
  await check(tag + ': tapping „24 Std.“ switches the solar chart to 24 h, popup stays open', r.open && r.on === '24h' && r.chart === '24h' && r.lines > 0, r);
  await close();
  // Grid to 4 h; then solar shows 4 h as well: one choice for all pages, not one per page.
  await openSub(1);
  r = await until((x) => x.segs === 2 && x.chart && x.lines);
  await tapAt(r.at4, 600);
  r = await until((x) => x.on === '4h' && x.chart === '4h' && x.lines);
  await check(tag + ': tapping „4 Std.“ switches the grid chart to 4 h', r.open && r.on === '4h' && r.chart === '4h' && r.lines > 0, r);
  await close();
  await openSub(0);
  r = await until((x) => x.segs === 2 && x.chart && x.lines);
  await check(tag + ': solar page now opens on the 4 h chosen on the grid page', r.on === '4h' && r.chart === '4h' && r.lines > 0, r);
  await close();
  await openSub(1);
  r = await until((x) => x.segs === 2 && x.chart && x.lines);
  await check(tag + ': grid page keeps 4 h for the session', r.on === '4h' && r.chart === '4h' && r.lines > 0, r);
  await close();
  await browser.close();
}
await finish();
