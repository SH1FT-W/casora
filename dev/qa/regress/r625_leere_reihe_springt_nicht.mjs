// @zustand: demo
// @deckt: custom_components/casora/scripts/smart-row.js#_updateWrapperVisibility,casora-smart-row
// Known from Hemma #87 (Casora forked the row from Hemma 2.1.2): on the phone a row without visible tiles (empty
// favorites) was shown again on every state change and hidden by the sweep 500 ms later. In Casora the row itself
// has no height there, but its wrapper in the outer home row came back with the 8 px grid gap, so everything
// below jumped down and up on every sensor update. Expected: with empty favorites, 4 state changes (only in this
// browser) cause no layout shift and the outer wrapper of the empty row stays hidden. Writes the phone dashboard
// of the test HA (favorites row emptied) and restores it.
import { open, dashboard, check, need, finish, usePage, atFinish } from './lib.mjs';
import { ws } from '../ws.mjs';

const URL_PATH = 'home-dashboard-mobile';
const cfgOf = async () => { const c = await ws(); try { return await c.cmd({ type: 'lovelace/config', url_path: URL_PATH }); } finally { c.close(); } };
const saveCfg = async (cfg) => { const c = await ws(); try { await c.cmd({ type: 'lovelace/config/save', url_path: URL_PATH, config: cfg }); } finally { c.close(); } };
let saved = null;
try { saved = await cfgOf(); } catch (e) { /* need below */ }
await need('Phone dashboard ' + URL_PATH, saved);
const cfg = JSON.parse(JSON.stringify(saved));
const outer = (cfg.views[0].cards || []).find((x) => x.type === 'custom:casora-smart-row');
const fav = outer && (outer.cards || []).find((x) => x.type === 'custom:casora-smart-row');
await need('Home row with a favorites row', fav);
fav.cards = [];
atFinish(() => saveCfg(saved));
await saveCfg(cfg);

try {
  const o = await open({ width: 393, height: 852, mobile: true, scale: 1 });
  usePage(o.page);
  const pg = o.page;
  await dashboard(pg, URL_PATH, 3);
  const res = await pg.evaluate(() => new Promise((resolve) => {
    const outerRow = window.__pierce('casora-smart-row').find((r) => r._sortEnabled === false);
    const empty = window.__pierce('casora-smart-row').find((r) => r._sortEnabled !== false && !(r._config.cards || []).length);
    if (!outerRow || !empty) { resolve(null); return; }
    const wrap = Array.from(outerRow.shadowRoot.querySelectorAll('#container > .card-wrapper')).find((w) => w.firstElementChild === empty);
    let shifts = 0, shown = 0;
    try { new PerformanceObserver((l) => { shifts += l.getEntries().length; }).observe({ type: 'layout-shift' }); } catch (e) { /* no API */ }
    const t0 = performance.now();
    const loop = () => {
      if (wrap.style.display !== 'none' || empty.style.display !== 'none') shown++;
      if (performance.now() - t0 < 6500) requestAnimationFrame(loop);
      else resolve({ shifts, shownFrames: shown });
    };
    requestAnimationFrame(loop);
    const ha = document.querySelector('home-assistant');
    let n = 0;
    const tick = setInterval(() => {
      n++;
      const now = new Date().toISOString();
      ha._updateHass({ states: { ...ha.hass.states, 'sensor.qa_row_probe': { entity_id: 'sensor.qa_row_probe', state: String(n),
        attributes: {}, context: { id: 'qa' + n }, last_changed: now, last_updated: now } } });
      if (n >= 4) clearInterval(tick);
    }, 1500);
  }));
  await need('Empty favorites row found on the phone home', res);
  await check('Empty row never comes back during state changes', res.shownFrames === 0, res);
  await check('No layout shift during state changes', res.shifts === 0, res);
} catch (e) {
  await check('Run without abort', false, String(e && e.message || e).split('\n')[0]);
}
await finish();
