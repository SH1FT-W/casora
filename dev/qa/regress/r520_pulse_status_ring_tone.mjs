// @zustand: arbeit
// @parallel: ui
// Owner (03.11.2026, prod): the Pulse status page (sensor sub page, S7 dial) drew its ring green for every state,
// „Prüfen“ and „Ausgefallen“ too. Handbook §4.8 ring (c): „S7 ohne Liste: ein Ring in der Ampelfarbe“. Expected: the
// ring follows the state's traffic light – failed red, check orange, watch yellow, ok green, learning grey. Made-up Pulse entity and history, only
// in the browser; desktop and phone.
import { open, dashboard, casoraDashboard, fakeStates, check, need, finish, usePage } from './lib.mjs';

const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);
const id = 'sensor.qa_pulse_status';
const WANT = { failed: '--casora-color-red', check: '--casora-color-orange', watch: '--casora-color-yellow', ok: '--casora-color-green', learning: '--casora-soft-icon-off' };
for (const [label, size] of [['Desktop', { width: 1440, height: 1000 }], ['Handy', { width: 393, height: 852, mobile: true }]]) {
  const { page } = await open({ ...size, dark: false, theme: 'Casora' });
  usePage(page);
  await dashboard(page, dash.url);
  for (const [s, colour] of Object.entries(WANT)) {
    await fakeStates(page, { [id]: { state: s, attributes: { friendly_name: 'Pulse-Status', device_class: 'enum' } } }, { sticky: true });
    const ring = await page.evaluate(async ({ id, s }) => {
      const ha = document.querySelector('home-assistant');
      const ents = { ...ha.hass.entities }; ents[id] = { ...(ents[id] || {}), entity_id: id, platform: 'pulse' };
      ha._updateHass({ entities: ents });
      const Z = window._casoraZiele;
      if (!Z || !window._casoraPulse) return { err: 'no Pulse module' };
      if (!Z.__qaOrig) Z.__qaOrig = Z.history;
      Z.history = function (h, eid) { return eid === id ? [{ s, t: Date.now() - 6 * 3600e3 }] : Z.__qaOrig.apply(this, arguments); };
      if (!Z.openMeasure(id, '24h', null)) return { err: 'open failed' };
      await new Promise((r) => setTimeout(r, 2500));
      const paths = window.__pierce('svg path', window.casoraPopup.surface).filter((p) => p.getAttribute('stroke-width') === '26');
      return { strokes: paths.map((p) => p.getAttribute('style') || '') };
    }, { id, s });
    await need(`${label}: Pulse-Seite offen (${s})`, ring && !ring.err && ring.strokes.length, ring);
    await check(`${label}: Ring bei „${s}“ in ${colour}`, ring.strokes.every((x) => x.includes(colour)), ring.strokes);
    await page.keyboard.press('Escape'); await page.waitForTimeout(700);
  }
  await page.context().close();
}
await finish();
