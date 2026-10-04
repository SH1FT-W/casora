// @zustand: arbeit
// Gemeldet: Beim Umbenennen eines Raums im Namensfeld ging der erste Buchstabe verloren
// (schnelles Tippen direkt nach dem Klick), und der Raum verlor sein Symbol (Haus statt
// Küche …). Erwartet: Name exakt wie getippt, Symbol bleibt. Es wird nichts gespeichert.
import { open, studio, casoraDashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora-Dashboard', dash);
const { page } = await open();
await studio(page, dash.url);

const room = await page.evaluate(async () => {
  const p = window.__panel(), I = window.__casoraPanelInternals;
  const rooms = p._state.compact.rooms;
  const ri = rooms.findIndex((r) => !I.isHomeRoom(r) && I.roomGlyph(r.name, r) !== 'home');
  if (ri < 0) return null;
  p._room = ri; p._sel = null;
  p._renderTabs && p._renderTabs();
  p._renderForm();
  await new Promise((r) => setTimeout(r, 900));
  // Namensfeld im Abschnitt „Darstellung“ markieren (Label „Raumname“/„Room name“).
  const row = [...p.shadowRoot.querySelectorAll('#pane .row, #pane label')].find((e) => /^(Raumname|Room name)$/i.test((e.querySelector ? (e.querySelector('label') || e) : e).textContent.trim()));
  const inp = row && (row.querySelector('input') || row.parentElement.querySelector('input'));
  if (inp) inp.setAttribute('data-qa', 'raumname');
  return { ri, name: rooms[ri].name, glyph: I.roomGlyph(rooms[ri].name, rooms[ri]), field: !!inp };
});
await need('Raum mit eigenem Symbol (nicht Zuhause)', room);
await need('Namensfeld „Raumname“', room.field);

const NEU = 'Qa Werkraum';
await page.click('[data-qa=raumname]');
await page.keyboard.type(NEU, { delay: 0 }); // sofort nach dem Klick, ohne Pause
await page.keyboard.press('Tab');
await page.waitForTimeout(900);
const after = await page.evaluate((ri) => {
  const p = window.__panel(), I = window.__casoraPanelInternals;
  const r = p._state.compact.rooms[ri];
  return { name: r.name, label: p._roomLabel(r), glyph: I.roomGlyph(r.name, r) };
}, room.ri);
await check('Name exakt wie getippt (erster Buchstabe da)', after.name === NEU || after.label === NEU, { vorher: room.name, nachher: after });
await check('Raumsymbol bleibt beim Umbenennen', after.glyph === room.glyph, { vorher: room.glyph, nachher: after.glyph });
await finish();
