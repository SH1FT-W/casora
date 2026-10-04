// @zustand: arbeit
// Gemeldet: Bei Jalousie, Medien, Saugroboter, Thermostat … hieß der Aufklapp-Bereich im
// Kachel-Editor „Erweitert“ statt „Popup“. Erwartet: jede Kachel, die ein Casora-Popup
// öffnet, hat im Editor den Bereich „Popup“ (je Kacheltyp einmal geprüft).
import { open, studio, casoraDashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora-Dashboard', dash);
const { page } = await open();
await studio(page, dash.url);

// Je Kacheltyp die erste Kachel mit Casora-Popup und vorhandener Entität.
const todo = await page.evaluate(() => {
  const p = window.__panel(), I = window.__casoraPanelInternals;
  const seen = new Set(), out = [];
  p._state.compact.rooms.forEach((r, ri) => (r.tiles || []).forEach((t) => {
    const ty = I.tileTypeAny(t);
    const id = ty ? ty.id : [].concat(t.template || []).join('+');
    if (seen.has(id) || !p._popupCardsFor(t)) return;
    if (t.entity && !p._hass.states[t.entity]) return; // ohne Entität kein Popup-Bereich (gewollt)
    seen.add(id);
    out.push({ ri, key: p._tileKey(t), type: id, name: t.name || '' });
  }));
  return out;
});
await need('Kacheln mit Casora-Popup im Dashboard', todo.length, todo);
console.log('  Kacheltypen mit Popup: ' + todo.map((x) => x.type).join(', '));

const bad = [];
for (const t of todo) {
  const labels = await page.evaluate(async (x) => {
    const p = window.__panel();
    p._room = x.ri;
    p._sel = null;
    p._select({ group: 'tiles', key: x.key });
    await new Promise((r) => setTimeout(r, 700));
    return [...p.shadowRoot.querySelectorAll('#pane .advsum')].map((b) => b.textContent.replace(/\s+/g, ' ').trim());
  }, t);
  if (!labels.some((l) => /^Popup/.test(l))) bad.push({ type: t.type, name: t.name, bereiche: labels });
}
await check(`alle ${todo.length} Kacheltypen mit Popup haben den Bereich „Popup“`, !bad.length, bad);
await finish();
