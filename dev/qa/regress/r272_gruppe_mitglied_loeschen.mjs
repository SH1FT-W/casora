// @zustand: arbeit
// @deckt: custom_components/casora/panel/casora-panel.js
// Issue #21 (14.10.2026): In Sammelkacheln (Jalousien, Schlösser, Batterien) tat „Löschen“ nach „−“ an einer
// Mitglied-Zeile nichts. Die Regel `.tile:not(.armed) .delbtn { pointer-events:none }` für den Kachel-Löschknopf
// traf auch den Zeilen-Knopf im Kachel-Editor; der Mausklick ging an die Zeile darunter.
// Prüft per echtem Mausklick: „−“ → „Löschen“ entfernt das Mitglied.
import { open, usePage, studio, casoraDashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);
const { page } = await open({ width: 1440, height: 1000, theme: 'Casora', dark: false });
usePage(page);
await studio(page, dash.url);
const COVERS = await page.evaluate(() => Object.keys(document.querySelector('home-assistant').hass.states)
  .filter((e) => e.startsWith('cover.')).slice(0, 4));
await need('vier Jalousien in der Test-HA', COVERS.length === 4, COVERS);
await page.evaluate((covers) => {
  const p = window.__panel();
  const home = p._state.compact.rooms[0];
  home.tiles.unshift({ type: 'custom:button-card', template: ['casora_cover', 'casora_popup_cover'], entity: covers[0],
    name: 'QA r272 Jalousien', variables: { room_name: 'Zuhause', covers } });
  p._markDirty(); p._renderForm();
  p._select({ group: 'tiles', key: p._tileKey(home.tiles[0]) });
}, COVERS);
await page.waitForTimeout(1200);
// Zeile per „−“ scharf stellen und per Mausklick auf „Löschen“ entfernen; which: 'last' | 'first'.
const removeRow = async (which) => {
  const drop = await page.evaluate((w) => {
    const all = window.__pierce('button.drop').filter((x) => x.offsetParent);
    const b = w === 'first' ? all[0] : all[all.length - 1];
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, which);
  await need('„−“ an der Zeile (' + which + ')', drop);
  await page.mouse.click(drop.x, drop.y);
  await page.waitForTimeout(700);
  const del = await page.evaluate(() => {
    const b = window.__pierce('.row.armed > .delbtn')[0];
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, pe: getComputedStyle(b).pointerEvents };
  });
  await need('„Löschen“ an der Zeile sichtbar (' + which + ')', del);
  await check('„Löschen“ nimmt Klicks an (' + which + ')', del.pe !== 'none', del);
  await page.mouse.click(del.x, del.y);
  await page.waitForTimeout(1200);
  return page.evaluate(() => {
    const t = window.__panel()._state.compact.rooms[0].tiles[0];
    return { name: t.name, entity: t.entity, covers: (t.variables || {}).covers };
  });
};
const a = await removeRow('last');
await check('letzte Zeile entfernt (4 → 3)', a.name === 'QA r272 Jalousien' && a.covers.length === 3
  && a.covers.join() === COVERS.slice(0, 3).join(), a);
// Fall aus dem Issue-Bild: die erste Zeile (Kachel-Entität) löschen.
const b = await removeRow('first');
await check('erste Zeile entfernt (3 → 2), Kachel zeigt auf die nächste', b.covers.length === 2
  && b.covers.join() === COVERS.slice(1, 3).join() && b.entity === COVERS[1], b);
await finish();
