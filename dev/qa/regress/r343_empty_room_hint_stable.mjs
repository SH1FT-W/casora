// @zustand: arbeit
// @parallel: allein
// @deckt: custom_components/casora/scripts/smart-row.js
// Owner report (26.10.60): a new room without devices (no HA area of that name) showed the pill
// "+ Noch keine Geräte – im Studio hinzufügen" at the bottom of the room view on the desktop, and the pill flickered.
// Cause: casora-smart-row showed the row on every state change (_updateWrapperVisibility › show) and its sweep
// 500 ms later hid the whole row again, because a row without tiles has no visible wrapper.
// Steps through the Studio: add the room "Kinderzimmer" (no HA area), save, open the room on the desktop (light),
// then 20 s with a state change every 700 ms. Expected: the hint stays visible the whole time and is never
// re-created or hidden. Writes the desktop dashboard (test HA only) and restores it.
import { open, studio, casoraDashboard, dashboard, check, need, finish, usePage, atFinish } from './lib.mjs';
import { ws } from '../ws.mjs';

const ROOM = 'Kinderzimmer';
const dash = await casoraDashboard((d) => (d.config.views || []).length > 1);
await need('Casora dashboard', dash);
const cfgOf = async (u) => { const c = await ws(); try { return await c.cmd({ type: 'lovelace/config', url_path: u }); } finally { c.close(); } };
const saveCfg = async (u, cfg) => { const c = await ws(); try { await c.cmd({ type: 'lovelace/config/save', url_path: u, config: cfg }); } finally { c.close(); } };
const urls = [dash.url].concat(dash.phone ? [dash.phone.url] : []);
const saved0 = {};
for (const u of urls) saved0[u] = await cfgOf(u);
atFinish(async () => { for (const u of urls) await saveCfg(u, saved0[u]); });
const shotDir = process.env.CASORA_OUT || '/tmp/casora-qa';

const c = await ws();
const areas = await c.cmd({ type: 'config/area_registry/list' });
c.close();
await need(`Test house has no HA area "${ROOM}" and no room of that name`,
  !areas.some((a) => (a.name || '').toLowerCase() === ROOM.toLowerCase())
  && !saved0[dash.url].views.some((v) => ((v.cards || [])[0] || {}).name === ROOM));

try {
  const o = await open({ width: 1600, height: 1000, dark: false });
  usePage(o.page);
  const pg = o.page;
  const H = (fn, a) => pg.evaluate(fn, a);
  await studio(pg, dash.url);
  await H(() => { const p = window.__panel(); p._sel = null; p._bClose(); });
  await pg.locator('button.broom').click();
  await pg.waitForTimeout(800);
  const opt = await H(() => { const e = window.__pierce('.combo-opt').find((x) => x.getClientRects().length
    && /^(Raum hinzufügen …|Add Room…)$/.test(x.textContent.replace('✓', '').trim()));
    if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
  await need('Menu item "Add Room…"', opt);
  await pg.mouse.click(opt.x, opt.y);
  await pg.waitForTimeout(1200);
  await pg.locator('input:visible').first().fill(ROOM);
  await pg.getByRole('button', { name: /^(Hinzufügen|Add)$/ }).last().click();
  await pg.waitForTimeout(1500);
  const path = await H(() => { const p = window.__panel(); return p._state.compact.rooms[p._room].path; });
  await H(() => { const p = window.__panel(); p._bClose(); document.activeElement && document.activeElement.blur(); });
  await pg.keyboard.press('Meta+s');
  const saved = await pg.waitForFunction(() => !window.__panel()._isDirty() && !window.__panel()._saving, null, { timeout: 30000 }).then(() => true).catch(() => false);
  await need('Room added and saved', saved && !!path, path);

  await dashboard(pg, dash.url + '/' + path, 2);
  // Wait for the hint, then watch it: identity, visibility of hint and row, DOM replacements.
  const found = await pg.waitForFunction(() => window.__pierce('casora-smart-row').some((r) => {
    const h = r.shadowRoot && r.shadowRoot.querySelector('.empty-hint');
    return h && h.getClientRects().length && h.getBoundingClientRect().width > 0;
  }), null, { timeout: 20000 }).then(() => true).catch(() => false);
  await pg.screenshot({ path: shotDir + '/r343_empty_room.png' });
  await need('Desktop: the empty room shows the hint', found);

  const res = await H(() => new Promise((resolve) => {
    const row = window.__pierce('casora-smart-row').find((r) => r.shadowRoot && r.shadowRoot.querySelector('.empty-hint'));
    const first = row.shadowRoot.querySelector('.empty-hint');
    const box = first.parentNode;
    let removed = 0, hostStyle = 0, hidden = 0, replaced = 0, samples = 0;
    const mo = new MutationObserver((list) => list.forEach((m) => {
      if (m.type === 'childList') m.removedNodes.forEach((n) => { if (n === first || (n.querySelector && n.querySelector('.empty-hint'))) removed++; });
      if (m.type === 'attributes' && m.target === row && row.style.display === 'none') hostStyle++;
    }));
    mo.observe(row.shadowRoot, { childList: true, subtree: true });
    mo.observe(row, { attributes: true, attributeFilter: ['style'] });
    void box;
    const sample = setInterval(() => {
      samples++;
      const h = row.shadowRoot.querySelector('.empty-hint');
      if (h !== first) replaced++;
      const r = h && h.getBoundingClientRect();
      if (!row.isConnected || !h || !r.width || !r.height || getComputedStyle(row).display === 'none') hidden++;
    }, 100);
    // State changes as from HA: a sensor value changes every 700 ms (this browser only).
    const ha = document.querySelector('home-assistant');
    let n = 0;
    const tick = setInterval(() => {
      n++;
      const states = { ...ha.hass.states, 'sensor.qa_flicker_probe': { entity_id: 'sensor.qa_flicker_probe', state: String(n),
        attributes: {}, context: { id: 'qa' }, last_changed: new Date().toISOString(), last_updated: new Date().toISOString() } };
      ha._updateHass({ states });
    }, 700);
    setTimeout(() => {
      clearInterval(sample); clearInterval(tick); mo.disconnect();
      resolve({ samples, hidden, replaced, removed, hostStyle, updates: n });
    }, 20000);
  }));
  await check('Hint stays visible for 20 s with state changes', res.samples > 100 && res.hidden === 0, res);
  await check('Hint is not re-created or removed', res.replaced === 0 && res.removed === 0, res);
  await check('Row is never hidden', res.hostStyle === 0, res);
} catch (e) {
  await check('Run without abort', false, String(e && e.message || e).split('\n')[0]);
}
await finish();
