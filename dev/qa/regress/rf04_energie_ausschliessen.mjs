// @zustand: arbeit
// @parallel: allein
// Energie-Badge: Gerät ausschließen (Desktop, Chromium). Im Raum mit mindestens zwei Energie-
// Geräten das Energie-Badge in der Vorschau anklicken und unter „Geräte (zusammengezählt)“ ein
// Gerät über sein × entfernen, sichern. Erwartet: In HA fehlt es in energy_entities und steht in
// energy_exclude; nach neuem Laden des Studios trägt die Automatik es nicht wieder ein (nichts
// ungespeichert). Schreibt ins Prüf-Dashboard – am Ende wird der vorherige Stand zurückgeschrieben.
import { open, studio, casoraDashboard, check, need, finish, usePage, atFinish } from './lib.mjs';
import { ws } from '../ws.mjs';

const dash = await casoraDashboard();
await need('Casora-Dashboard', dash);
const URLS = [dash.url, dash.phone && dash.phone.url].filter(Boolean);
const saved0 = {};
{ const c = await ws(); for (const u of URLS) saved0[u] = await c.cmd({ type: 'lovelace/config', url_path: u }); c.close(); }
atFinish(async () => { const c = await ws();
  for (const u of URLS) await c.cmd({ type: 'lovelace/config/save', url_path: u, config: saved0[u] }); c.close(); });
const cfgOf = async (u) => { const c = await ws(); try { return await c.cmd({ type: 'lovelace/config', url_path: u }); } finally { c.close(); } };

let o = await open({ width: 1600, height: 1000, dark: false });
usePage(o.page);
let H = (fn, a) => o.page.evaluate(fn, a);
// Abbruch zählt als Fehler; atFinish stellt trotzdem zurück.
try {
  await studio(o.page, dash.url);
  const room = await H(async () => {
    const p = window.__panel(), I = window.__casoraPanelInternals, rooms = p._state.compact.rooms;
    for (let i = 0; i < rooms.length; i++) {
      const ents = (rooms[i].variables || {}).energy_entities;
      if (I.isHomeRoom(rooms[i], rooms) || !Array.isArray(ents) || ents.length < 2) continue;
      p._room = i; p._sel = null; p._bClose(); p._renderTabs(); p._syncPreview();
      await new Promise((r) => setTimeout(r, 1200));
      const e = p._bVisibleBadges().find((x) => /^b:energy/.test(String(x.dataset.mk)));
      if (!e) continue;
      const r = e.getBoundingClientRect();
      return { path: rooms[i].path, ents, x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }
    return null;
  });
  await need('Raum mit Energie-Badge und zwei Energie-Geräten', room);
  await o.page.mouse.click(room.x, room.y);
  await o.page.waitForTimeout(1500);
  // × am letzten Gerät der Liste (Chips tragen den Gerätenamen und ein ×).
  const x = await H(() => { const p = window.__panel();
    const chips = [...p.shadowRoot.querySelectorAll('#pane .chip')].filter((c) => c.getClientRects().length && /×\s*$/.test(c.textContent));
    const c = chips[chips.length - 1]; if (!c) return null;
    const b = [...c.querySelectorAll('*')].reverse().find((e) => e.textContent.trim() === '×') || c;
    const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, n: chips.length }; });
  await need('Geräte-Chips im Energie-Badge', x && x.n >= 2, x);
  await o.page.mouse.click(x.x, x.y);
  await o.page.waitForTimeout(1200);
  const v1 = await H(() => { const p = window.__panel(); const v = p._state.compact.rooms[p._room].variables; return { ents: v.energy_entities || [], ex: v.energy_exclude || [] }; });
  const gone = room.ents.filter((id) => !v1.ents.includes(id));
  await check('× entfernt genau ein Gerät und schließt es aus', gone.length === 1 && v1.ex.includes(gone[0]), { gone, v1 });

  await H(() => { const p = window.__panel(); p._bClose(); document.activeElement && document.activeElement.blur(); });
  await o.page.keyboard.press('Meta+s');
  const ok = await o.page.waitForFunction(() => !window.__panel()._isDirty() && !window.__panel()._saving, null, { timeout: 30000 }).then(() => true).catch(() => false);
  await check('⌘S sichert', ok);
  const card = ((await cfgOf(dash.url)).views.find((v) => v.path === room.path).cards || []).find((c) => [].concat(c.template || []).includes('casora_room'));
  const vs = (card && card.variables) || {};
  await check('HA: Gerät fehlt in energy_entities, steht in energy_exclude',
    !(vs.energy_entities || []).includes(gone[0]) && (vs.energy_exclude || []).includes(gone[0]), { ents: vs.energy_entities, ex: vs.energy_exclude });
  await o.browser.close();

  // Neu laden: Automatik trägt das Gerät nicht wieder ein.
  o = await open({ width: 1600, height: 1000, dark: false });
  usePage(o.page);
  H = (fn, a) => o.page.evaluate(fn, a);
  await studio(o.page, dash.url);
  const back = await H((path) => { const p = window.__panel(); const r = p._state.compact.rooms.find((x) => x.path === path);
    return { ents: r.variables.energy_entities || [], dirty: p._isDirty() }; }, room.path);
  await check('Nach neuem Laden: ausgeschlossenes Gerät bleibt draußen, nichts ungespeichert', !back.ents.includes(gone[0]) && !back.dirty, back);
} catch (e) {
  await check('Ablauf ohne Abbruch', false, String(e && e.message || e).split('\n')[0]);
}
await finish();
