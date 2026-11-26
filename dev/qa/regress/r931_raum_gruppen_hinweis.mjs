// @zustand: arbeit
// @deckt: custom_components/casora/panel/casora-panel.js#_phoneMap, custom_components/casora/scripts/filter-overlay.js#_roomGroupSplit
// #245: "Group rooms by category on the phone" was on, but a room kept one heading, and nothing said why (the rule:
// at least four tiles of two or more kinds). Expected in the Studio's phone preview with the switch on: every room
// either shows its category headings or a note why not ("few": under four tiles, "one-kind": a single kind), never
// both and never neither. With the switch off no room shows the note. Draft only: nothing is saved.
import { open, usePage, casoraDashboard, studio, studioRetry, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora dashboard with a phone layout', dash && dash.phone);
const sp = await open({ width: 1440, height: 1000, dark: true, studio: 'b' });
usePage(sp.page);
await studio(sp.page, dash.url);
await sp.page.evaluate(() => { const p = window.__panel(); if (p._bClose) p._bClose(); p._miniSize = 'phone'; p._rebuildPreview(); });
await sp.page.waitForTimeout(1500);

const survey = (on) => studioRetry(sp.page, dash.url, () => sp.page.evaluate(async (on) => {
  const P = window.__panel();
  const wide = (((P._pair || {}).desktop || {}).compact || {}).rooms || [];
  const home = wide.find((r) => r.path === 'home') || wide[0];
  if (!home) return { err: 'no home' };
  home.variables = home.variables || {};
  if (on) home.variables.room_groups = true; else delete home.variables.room_groups;
  const st = P._phoneState();
  const names = ((st && st.compact.rooms) || []).filter((r) => r.name && (r.tiles || []).length).map((r) => r.name);
  const out = [];
  for (const name of names) {
    P._phoneFilter = 'room:' + name;
    P._rebuildPreview();
    let screen = null;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 100));
      screen = P.shadowRoot.querySelector('.card.map .miniphone');
      if (screen && (!on || window.casoraRoomGroups)) break;
    }
    if (!screen) return { err: 'no preview' };
    // Favorites are no room: the preview drops the filter and shows Home.
    if (P._phoneFilter !== 'room:' + name) continue;
    const note = screen.querySelector('.mp-rgnote');
    out.push({ name, heads: screen.querySelectorAll('.mp-head.mp-group').length, note: note ? note.dataset.rgnote : null,
      text: note ? note.textContent : '' });
  }
  P._phoneFilter = null;
  delete home.variables.room_groups;
  P._rebuildPreview();
  return { rooms: out };
}, on)).catch((e) => ({ err: String(e) }));

const onR = await survey(true);
console.log('    on', JSON.stringify(onR));
await need('phone rooms in the preview', onR && onR.rooms && onR.rooms.length >= 2, onR);
await check('switch on: every room has headings or a note, never both', onR.rooms.every((r) => (r.heads > 0) !== !!r.note), onR.rooms);
await check('switch on: at least one room stays flat and says why', onR.rooms.some((r) => r.note), onR.rooms);
await check('switch on: at least one room is grouped', onR.rooms.some((r) => r.heads > 0), onR.rooms);
await check('switch on: the note names the reason', onR.rooms.filter((r) => r.note).every((r) => ['few', 'one-kind'].includes(r.note) && r.text.length > 20), onR.rooms);
const offR = await survey(false);
await check('switch off: no room shows the note', offR && offR.rooms && offR.rooms.every((r) => !r.note && !r.heads), offR);
await check('nothing left unsaved', !(await sp.page.evaluate(() => { const P = window.__panel(); return P._isDirty && P._isDirty(); })));
await sp.browser.close();
await finish();
