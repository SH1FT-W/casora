// @zustand: arbeit
// @parallel: ui
// Owner (03.11.2026): the Pulse status page's history looked cheap – a step chart whose bar height grew with the
// severity, hard blocks, a single-state day one flat block. Option A (handbook §7.6 state ribbon): one even height
// for every state, rounded segments, the legend only from two states up. Made-up Pulse entity and history, only in
// the browser; desktop and phone.
import { open, dashboard, casoraDashboard, fakeStates, check, need, finish, usePage } from './lib.mjs';

const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);
const id = 'sensor.qa_pulse_status', H = 3600e3;
const CASES = {
  viele: { state: 'check', rows: [['ok', -24 * H], ['watch', -20 * H], ['check', -15 * H], ['failed', -7 * H], ['watch', -2 * H], ['check', -0.3 * H]] },
  zwei: { state: 'ok', rows: [['watch', -24 * H], ['ok', -5 * H]] },
  eins: { state: 'failed', rows: [['failed', -24 * H]] },
};
for (const [label, size] of [['Desktop', { width: 1440, height: 1000 }], ['Handy', { width: 393, height: 852, mobile: true }]]) {
  const { page } = await open({ ...size, dark: false, theme: 'Casora' });
  usePage(page);
  await dashboard(page, dash.url);
  for (const [name, c] of Object.entries(CASES)) {
    await fakeStates(page, { [id]: { state: c.state, attributes: { friendly_name: 'Pulse-Status', device_class: 'enum' } } }, { sticky: true });
    const r = await page.evaluate(async ({ id, c }) => {
      const ha = document.querySelector('home-assistant');
      const ents = { ...ha.hass.entities }; ents[id] = { ...(ents[id] || {}), entity_id: id, platform: 'pulse' };
      ha._updateHass({ entities: ents });
      const Z = window._casoraZiele;
      if (!Z || !window._casoraPulse) return { err: 'no Pulse module' };
      if (!Z.__qaOrig) Z.__qaOrig = Z.history;
      Z.history = function (h, eid) { return eid === id ? c.rows.map(([s, t]) => ({ s, t: Date.now() + t })) : Z.__qaOrig.apply(this, arguments); };
      if (!Z.openMeasure(id, '24h', null)) return { err: 'open failed' };
      await new Promise((res) => setTimeout(res, 2500));
      const band = window.__pierce('.cz-band', window.casoraPopup.surface)[0];
      if (!band) return { err: 'no band' };
      const segs = [...band.querySelectorAll('i')].map((i) => { const b = i.getBoundingClientRect(), cs = getComputedStyle(i);
        return { h: Math.round(b.height), w: b.width, r: parseFloat(cs.borderTopLeftRadius) }; });
      const bb = band.getBoundingClientRect();
      return { ribbon: band.classList.contains('st'), bandW: bb.width, segs, legend: window.__pierce('.cz-leg', window.casoraPopup.surface).length };
    }, { id, c });
    await need(`${label} ${name}: Pulse-Seite mit Band`, r && !r.err && r.segs.length, r);
    const hs = [...new Set(r.segs.map((x) => x.h))];
    await check(`${label} ${name}: alle Abschnitte gleich hoch (14 px)`, r.ribbon && hs.length === 1 && hs[0] === 14, { hs, ribbon: r.ribbon });
    await check(`${label} ${name}: Abschnitte gerundet`, r.segs.every((x) => x.r >= 6), r.segs.map((x) => x.r));
    if (name === 'eins') {
      await check(`${label}: ein Zustand = ein Abschnitt über die ganze Breite, keine Legende`, r.segs.length === 1 && r.segs[0].w >= r.bandW - 1 && !r.legend, r);
    } else {
      await check(`${label} ${name}: Legende ab zwei Zuständen`, r.legend === 1, r.legend);
    }
    await page.keyboard.press('Escape'); await page.waitForTimeout(700);
  }
  await page.context().close();
}
await finish();
