// @zustand: arbeit
// @parallel: ui
// Neues Studio (B): Was die Vorschau nicht zeigt, darf nicht unerreichbar werden. Erwartet:
// Eine ausgeschaltete Kachel steht als gestrichelter Platzhalter in der Reihe und in der Liste
// „N ausgeblendet“ unter der Vorschau; ein Klick darauf öffnet ihren Editor. In der Liste
// „Elemente“ haben Badges und Kacheln ihren Schalter in der Zeile. Es wird nichts gespeichert.
import { open, studio, casoraDashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora-Dashboard', dash);
const { page } = await open({ width: 1440, height: 900, dark: false, studio: 'b' });
await studio(page, dash.url);
const H = (fn, a) => page.evaluate(fn, a);

// Raum mit mindestens zwei sichtbaren Kacheln, Liste „Elemente“ offen, Kacheln aufgeklappt.
const pick = await H(async () => {
  const p = window.__panel(), I = window.__casoraPanelInternals;
  const rooms = p._state.compact.rooms;
  const ri = rooms.findIndex((r) => !I.isHomeRoom(r, rooms) && (r.tiles || []).filter((t) => (t.variables || {}).enabled !== false).length >= 2);
  if (ri < 0) return null;
  p._room = ri; p._sel = null; p._group = 'rooms'; p._bOpen = true;
  p._renderTabs(); p._stackOpenReq = 'tiles'; p._renderForm();
  await new Promise((r) => setTimeout(r, 1200));
  return { ri, n: p._bHidden().tiles.length };
});
await need('Raum mit Kacheln', pick);

const sw = await H(() => { const p = window.__panel();
  const b = [...p.shadowRoot.querySelectorAll('#pane #band-badges .card > .chead .sw')].filter((x) => x.getClientRects().length).length;
  const t = [...p.shadowRoot.querySelectorAll('#pane #band-tiles .tile > .thead .sw')].filter((x) => x.getClientRects().length);
  if (t[0]) t[0].setAttribute('data-qa', 'kschalter');
  return { badges: b, tiles: t.length }; });
await check('Kacheln haben ihren Schalter in der Zeile', sw.tiles >= 2, sw);

const before = await H(() => window.__panel()._bHidden().tiles.filter((x) => x.why === 'Hidden').length);
await page.locator('[data-qa=kschalter]').click();
await page.waitForTimeout(1500);
const after = await H(() => { const p = window.__panel(); const r = p.shadowRoot;
  const g = r.querySelectorAll('.card.map .mtile.bghost');
  const chip = r.querySelector('.bhid:not(.bphint)');
  return { hidden: p._bHidden().tiles.filter((x) => x.why === 'Hidden').length, ghosts: g.length,
    chip: chip ? chip.textContent.trim() : null, mk: g[g.length - 1] && g[g.length - 1].dataset.mk }; });
await check('Ausgeschaltete Kachel: gestrichelter Platzhalter in der Vorschau', after.hidden === before + 1 && after.ghosts === after.hidden, { before, after });
await check('Liste „ausgeblendet“ unter der Vorschau zählt sie', !!after.chip && /\d/.test(after.chip), after.chip);

await page.locator('.bhid:not(.bphint)').click();
await page.waitForTimeout(700);
const items = await H(() => window.__pierce('.combo-menu .combo-opt').filter((e) => e.getClientRects().length).map((e) => e.textContent.trim()));
await check('Liste nennt die Kachel mit Grund', items.some((t) => /Ausgeblendet|Hidden/.test(t)), items);
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

await H((mk) => { const p = window.__panel(); p.shadowRoot.querySelector('.card.map [data-mk="' + mk + '"].bghost').setAttribute('data-qa', 'geist'); }, after.mk);
await page.locator('[data-qa=geist]').click();
await page.waitForTimeout(1100);
const sel = await H(() => { const p = window.__panel(); return { open: p.classList.contains('binsp'), sel: p._sel }; });
await check('Klick auf den Platzhalter öffnet den Editor der Kachel', sel.open && sel.sel && sel.sel.group === 'tiles'
  && 't:' + sel.sel.key === after.mk, { sel, mk: after.mk });
await finish();
