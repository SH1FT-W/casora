// @zustand: arbeit
// @parallel: allein
// @deckt: custom_components/casora/scripts/local/28-free-tile.js#F.sec,F.popup,F.plan custom_components/casora/panel/casora-panel.js
// GitHub issue 128 (Universal tile, casora_free): (1) the popup said "Wähle im Studio ein Gerät oder ergänze …" in the
// live dashboard when no device was chosen, although the device is optional; (2) once a device was chosen in the
// Studio it could not be removed again – the tile had to be deleted and made anew.
// Expected (desktop 1440):
//   - Studio: a Universal tile with a switch and one value row; its device field has the "×" of the optional pickers,
//     a click empties it, the tile keeps its value row; saved, the dashboard's tile has no device (entity "")
//   - live dashboard: the saved tile's popup opens with "Werte" and the value row, no "Wähle im Studio …",
//     no "Kein Gerät gewählt", never empty
// Entities are picked from the house at run time; the dashboard is restored at the end.
import { open, studio, casoraDashboards, dashboard, check, need, finish, atFinish, usePage } from './lib.mjs';
import { ws } from '../ws.mjs';

const c = await ws();
const S = await c.cmd({ type: 'get_states' });
const live = (s) => s && !['unavailable', 'unknown', ''].includes(String(s.state));
const sw = S.filter((s) => s.entity_id.startsWith('switch.') && ['on', 'off'].includes(s.state)).sort((a, b) => a.entity_id.localeCompare(b.entity_id))[0];
const temp = S.filter((s) => live(s) && s.entity_id.startsWith('sensor.') && s.attributes.device_class === 'temperature' && isFinite(parseFloat(s.state)))
  .sort((a, b) => a.entity_id.localeCompare(b.entity_id))[0];
await need('a switch and a temperature sensor in the house', sw && temp, { sw: !!sw, temp: !!temp });
const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && d.url === 'qa-arbeit') || all.find((d) => !d.mobile);
await need('a Casora dashboard', desk, all.map((d) => d.url));
const URLS = [desk.url].concat(all.filter((d) => d.url === desk.url + '-mobile').map((d) => d.url));
const saved0 = {};
for (const u of URLS) saved0[u] = await c.cmd({ type: 'lovelace/config', url_path: u });
c.close();
atFinish(async () => {
  const c2 = await ws();
  for (const u of URLS) await c2.cmd({ type: 'lovelace/config/save', url_path: u, config: saved0[u] });
  c2.close();
});

// ── Studio: tile with a device, clear it with ×, save ──
{
  const o = await open({ width: 1440, height: 900, dark: false });
  usePage(o.page);
  const H = (fn, a) => o.page.evaluate(fn, a);
  await studio(o.page, desk.url);
  await H(async ([sw, temp]) => {
    const p = window.__panel(), room = p._state.compact.rooms[0];
    const tile = { type: 'custom:button-card', template: 'casora_free', entity: sw, name: 'Universal-Kachel',
      variables: { qa_r577: true, size: 'auto', free_values: [temp] } };
    room.tiles.push(tile);
    p._room = 0; p._sel = null; p._renderTabs(); p._syncPreview();
    await new Promise((r) => setTimeout(r, 600));
    p._select({ group: 'tiles', key: p._tileKey(tile) });
    p._renderForm();
  }, [sw.entity_id, temp.entity_id]);
  await o.page.waitForTimeout(1500);
  // The tile's device field: the combo that shows the switch (its title ends in "(<id>)").
  const x = await H((id) => {
    const w = window.__pierce('.combo.hasent').find((e) => e.getClientRects().length && (e.querySelector('input') || {}).title
      && e.querySelector('input').title.endsWith('(' + id + ')'));
    if (!w) return { field: false };
    const b = w.querySelector('.combo-x');
    if (!b || !b.getClientRects().length) return { field: true, x: false, cls: w.className };
    b.scrollIntoView({ block: 'center' });
    const r = b.getBoundingClientRect();
    return { field: true, x: true, at: { x: r.x + r.width / 2, y: r.y + r.height / 2 } };
  }, sw.entity_id);
  await need('Studio: device field of the Universal tile shows the switch', x.field, x);
  await check('Studio: the device field has a × to remove the device', x.x, x);
  if (x.x) {
    await o.page.mouse.click(x.at.x, x.at.y);
    await o.page.waitForTimeout(900);
  }
  const t = await H(() => { const p = window.__panel(); const tile = p._state.compact.rooms[0].tiles.find((z) => (z.variables || {}).qa_r577);
    return tile ? { entity: tile.entity, values: (tile.variables || {}).free_values } : null; });
  await check('Studio: × leaves the tile without device, its value row stays', t && !t.entity && Array.isArray(t.values) && t.values.length === 1, t);
  const ok = await H(async () => { const p = window.__panel(); await p._saveNow(); return !p._isDirty(); });
  await check('Studio: saved', ok);
  await o.browser.close().catch(() => {});
}

const c3 = await ws();
const cfg = await c3.cmd({ type: 'lovelace/config', url_path: desk.url });
c3.close();
let saved = null;
(function walk(n) { if (saved || !n || typeof n !== 'object') return;
  if (!Array.isArray(n) && n.variables && n.variables.qa_r577) { saved = n; return; }
  Object.values(n).forEach(walk); })(cfg);
await need('saved dashboard holds the tile', saved, null);
await check('saved tile has no device', !saved.entity, saved.entity);

// ── Live dashboard: the popup of the saved tile ──
{
  const o = await open({ width: 1440, height: 1000, dark: false });
  usePage(o.page);
  await dashboard(o.page, desk.url, 3);
  const r = await o.page.evaluate(async (conf) => {
    const ha = document.querySelector('home-assistant');
    const old = window.__pierce('button-card').find((b) => { const x = b.getBoundingClientRect(); return x.width > 60 && x.height > 40 && x.top > 60; });
    const el = document.createElement('button-card');
    el.setConfig(conf);
    el.hass = ha.hass; old.parentNode.insertBefore(el, old);
    await new Promise((res) => setTimeout(res, 800));
    el.addEventListener('hass-action', (ev) => { const act = ev.detail && ev.detail.config && ev.detail.config.tap_action;
      if (act && act.casora_popup && window.casoraPopup) { ev.stopPropagation(); window.casoraPopup.open(Object.assign({}, act.casora_popup, { src: el })); } }, { capture: true, once: true });
    el._handleAction({ detail: { action: 'tap' } }, { isIcon: false });
    const Sf = () => window.casoraPopup && window.casoraPopup.surface;
    for (let i = 0; i < 40 && !(Sf() && window.__pierce('.hui-srow', Sf()).length); i++) await new Promise((res) => setTimeout(res, 200));
    await new Promise((res) => setTimeout(res, 800));
    const s = Sf();
    if (!s) return null;
    const vis = (n) => n.getBoundingClientRect().height > 0;
    return { text: window.__pierce('*', s).filter((n) => vis(n) && !n.children.length).map((n) => n.textContent.trim()).filter(Boolean).join(' | '),
      labels: window.__pierce('.hui-slbl', s).filter(vis).map((n) => n.textContent.trim()),
      rows: window.__pierce('.hui-srow', s).filter(vis).length };
  }, saved);
  await need('live: popup of the tile without device opens', r, r);
  await check('live: no "Wähle im Studio …" and no "Kein Gerät gewählt"', !/Wähle im Studio|Kein Gerät gewählt|Noch nicht verfügbar/.test(r.text), r.text.slice(0, 300));
  await check('live: "Werte" with the value row', r.labels.includes('Werte') && r.rows >= 1, r);
  await o.browser.close().catch(() => {});
}
await finish();
