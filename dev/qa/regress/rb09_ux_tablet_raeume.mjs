// @zustand: arbeit
// @parallel: ui
// Neues Studio (B), UX-Runde 06.10.2026:
// UX-01 Tablet hochkant mit HA-Seitenleiste: Mit offenem Inspektor schrumpfte die Vorschau auf ein
//   Drittel, der Umschalter Desktop/Tablet/Mobil rutschte unter die Seitenleiste. Erwartet: Inspektor
//   unten, Vorschau mindestens 600 px breit, Umschalter ganz sichtbar.
// UX-02 Der Titel ist auch am Tablet der Dashboard-Name (nicht noch einmal der Raum).
// UX-05 Räume → „Räume ordnen …“: Liste im Inspektor, Alt+↑ verschiebt, „Alphabetisch sortieren“
//   sortiert (Zuhause bleibt vorn). Es wird nichts gespeichert.
import { open, studio, casoraDashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora-Dashboard', dash);
const o = await open({ width: 1024, height: 1366, dark: false, studio: 'b', touch: true,
  userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15' });
await o.context.addInitScript(() => localStorage.setItem('dockedSidebar', '"docked"'));
const { page } = o;
await studio(page, dash.url);
const H = (fn, a) => page.evaluate(fn, a);
await H(() => window.__panel()._bClose());
await page.waitForTimeout(600);

const title = await H(() => { const p = window.__panel(); const d = (p._dashList || []).find((x) => x.url_path === p._dashUrl);
  return { t: p.shadowRoot.querySelector('#roomtitle .rt-label').textContent.trim(), want: (d && d.title) || p._dashUrl }; });
await check('Titel am Tablet = Dashboard-Name', title.t === title.want, title);

await page.locator('.card.map .mtile[data-mk^="t:"]:not(.ghost)').first().click();
await page.waitForTimeout(1500);
const g = await H(() => { const p = window.__panel(); const r = p.shadowRoot; const b = (s) => r.querySelector(s).getBoundingClientRect();
  return { stack: p.classList.contains('bstack'), open: p.classList.contains('binsp'), map: b('.card.map').width,
    seg: b('#sizeseg').left, main: b('.main').left, insp: b('.inspector').top, mapBottom: b('.card.map').bottom }; });
await check('Tablet hochkant: Inspektor unten', g.stack && g.open && g.insp >= g.mapBottom - 1, g);
await check('Tablet hochkant: Vorschau mindestens 600 px breit', g.map >= 600, g);
await check('Tablet hochkant: Umschalter ganz sichtbar', g.seg >= g.main, g);

await H(() => { const p = window.__panel(); p._room = 0; p._renderTabs(); p._renderForm(); p._bRoomsOpen(); });
await page.waitForTimeout(900);
const before = await H(() => window.__panel()._state.compact.rooms.map((r) => r.name));
await need('mindestens 3 Räume', before.length >= 3, before);
const n = before.length;
await page.locator('#pane .brow').nth(n - 1).focus();
await page.keyboard.press('Alt+ArrowUp');
await page.waitForTimeout(500);
const after = await H(() => window.__panel()._state.compact.rooms.map((r) => r.name));
await check('Alt+↑ verschiebt den Raum um eins nach vorn', after[n - 2] === before[n - 1] && after[n - 1] === before[n - 2], { before, after });
await page.locator('#pane .broomacts button').first().click();
await page.waitForTimeout(500);
const az = await H(() => { const p = window.__panel(); return p._state.compact.rooms.map((r) => p._roomLabel(r)); });
const rest = az.slice(1);
await check('Alphabetisch: Zuhause vorn, Rest sortiert', az[0] === (await H(() => { const p = window.__panel(); return p._roomLabel(p._state.compact.rooms[0]); }))
  && rest.every((x, i) => i === 0 || rest[i - 1].localeCompare(x, 'de', { sensitivity: 'base' }) <= 0), az);
const dirty = await H(() => window.__panel().classList.contains('bdirty'));
await check('Ungesichert: „— Bearbeitet“ am Titel', dirty);
await finish();
