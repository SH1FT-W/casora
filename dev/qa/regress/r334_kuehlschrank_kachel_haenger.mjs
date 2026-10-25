// @zustand: stress
// @parallel: allein   (öffnet das Studio)
// @deckt: scripts/local/00-finder.js panel/casora-panel.js
// Gemeldet (25.10.2026, Haus mit einigen hundert Geräten, ohne Kühlschrank-Integration): „Kachel hinzufügen“ →
// Kühlschrank ließ das Studio hängen, Mähroboter lud spürbar. Die Suche fragte den Kühlschrank-Finder (alle Geräte,
// jedes über alle Entitäten) einmal je Entität. Erwartet: Kachel bzw. Rückfrage nach höchstens 2 s, die Suche für
// jede Kachelart unter 500 ms (Browser, großzügig).
import { open, studioDashboard, studio, check, need, finish } from './lib.mjs';

const dash = await studioDashboard();
await need('ein Dashboard fürs Studio', dash);
const { page } = await open({ width: 1440, height: 900 });
await studio(page, dash);

// 1) Search for every tile kind, in the overview and in a room with an area.
const times = await page.evaluate(() => {
  const p = window.__panel(), I = window.__casoraPanelInternals || {};
  const rooms = p._state.compact.rooms;
  const withArea = rooms.find((r) => p._roomArea(r)) || rooms[0];
  const out = [];
  (I.TILE_TYPES || []).filter((t) => !t.hidden).forEach((t) => [rooms[0], withArea].forEach((room) => {
    const s = performance.now();
    try { p._tileCandidates(t, room); } catch (e) { /* a broken finder is another test's business */ }
    out.push([t.id, Math.round(performance.now() - s)]);
  }));
  return { n: Object.keys(p._hass.entities || {}).length, d: Object.keys(p._hass.devices || {}).length, out };
});
await need('Stresshaus mit vielen Entitäten', times.n >= 1000, times.n + ' Entitäten, ' + times.d + ' Geräte');
const slow = times.out.filter((x) => x[1] > 500);
await check('Suche je Kachelart unter 500 ms', !slow.length, slow.map((x) => x.join(': ') + ' ms').join(', ')
  || 'langsamste: ' + times.out.sort((a, b) => b[1] - a[1]).slice(0, 3).map((x) => x.join(': ') + ' ms').join(', '));

// 2) Through the menu as the user does: "Add a tile" → the kind → tile added or the question shown.
const addVia = async (id) => page.evaluate(async (id) => {
  const p = window.__panel(), I = window.__casoraPanelInternals || {};
  const type = (I.TILE_TYPES || []).find((t) => t.id === id);
  const tr = (s) => (window.casoraI18n ? window.casoraI18n.t(s) : s);
  const label = type ? tr(type.label) : id;
  const room = p._state.compact.rooms[p._room];
  const before = (room.tiles || []).length;
  const btn = window.__pierce('.addbar.tileadd button.scadd').find((b) => b.getClientRects().length) || window.__pierce('.addbar.tileadd button.scadd')[0];
  if (!btn) return { err: 'no "Add a tile" button' };
  btn.scrollIntoView({ block: 'center' });
  btn.click();
  const wait = async (fn, max) => { const s = performance.now(); while (performance.now() - s < max) { const v = fn(); if (v) return v; await new Promise((r) => setTimeout(r, 25)); } return null; };
  const opt = await wait(() => window.__pierce('.combo-menu .combo-opt').find((o) => o.textContent.replace(/[✓\s]+/g, ' ').trim() === label), 3000);
  if (!opt) return { err: 'kind not in the menu: ' + label };
  const s = performance.now();
  if (typeof opt.pick === 'function') opt.pick(); else opt.click(); // the menu picks on mousedown
  const got = await wait(() => (window.__pierce('.askcard').length ? 'Rückfrage' : (room.tiles || []).length > before ? 'Kachel' : null), 10000);
  const ms = Math.round(performance.now() - s);
  // Leave nothing behind: close the question, drop the added tile (nothing is saved).
  const alt = window.__pierce('.askcard button').find((b) => /Ohne Gerät|Without device|Abbrechen|Cancel/.test(b.textContent));
  if (alt) alt.click();
  await wait(() => (room.tiles || []).length > before, 1000);
  if ((room.tiles || []).length > before) { room.tiles.splice(before); p._renderForm(); }
  return { ms, got, label };
}, id);
for (const id of ['casora_fridge', 'casora_lawn_mower']) {
  const r = await addVia(id);
  await need(`${id}: im Menü`, !r.err, r.err);
  await check(`${r.label}: ${r.got || 'nichts'} nach höchstens 2 s`, !!r.got && r.ms <= 2000, r.ms + ' ms');
}
await finish();
