// @zustand: arbeit
// @parallel: ui
// Gemeldet (09.10.2026): „Aktuelle Wiedergabe in der Studio-UI klappt nicht richtig ein und aus. Und
// ist standardmäßig ausgeklappt? Sieht aus wie 2 Menüs.“ Ursache: Abschnitte mit Unterbereichen
// (grouped) setzen .subcard auf display:flow-root – gleich stark wie „.card.shut > :not(.chead)“,
// aber später im CSS. Zugeklappt blieben „Minimiert starten“ und die Player-Karte sichtbar.
// Erwartet (neues Studio, Raumansicht im Inspektor): zu = nichts außer der Kopfzeile sichtbar,
// auf = Unterkarten sichtbar, wieder zu = wieder verborgen. Es wird nichts gespeichert.
import { open, studio, casoraDashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora-Dashboard', dash);
const { page } = await open({ width: 1440, height: 900, dark: false, studio: 'b' });
await studio(page, dash.url);
const H = (fn, a) => page.evaluate(fn, a);
await H(() => { const p = window.__panel(); const rs = p._state.compact.rooms;
  let i = rs.findIndex((r) => r.variables && r.variables.show_now_playing && r.variables.show_media !== false);
  if (i < 0) { i = Math.min(1, rs.length - 1); rs[i].variables.show_now_playing = true; delete rs[i].variables.show_media; }
  p._room = i; p._renderTabs(); p._renderForm(); });
await page.waitForTimeout(1200);

// Sichtbare Kinder der Karte außer der Kopfzeile (Unterkarten, Untertitel …).
const state = () => H(() => { const c = window.__panel().shadowRoot.querySelector('#pane [data-k="Now Playing"]');
  if (!c) return null;
  c.scrollIntoView({ block: 'center' });
  const shown = [...c.children].filter((k) => !k.classList.contains('chead') && k.getClientRects().length && k.offsetHeight > 0);
  return { shut: c.classList.contains('shut'), subcards: c.querySelectorAll(':scope > .subcard').length,
    shown: shown.map((k) => k.className) }; });
const tap = async () => {
  const p = await H(() => { const h = window.__panel().shadowRoot.querySelector('#pane [data-k="Now Playing"] > .chead');
    const r = h.getBoundingClientRect(); return { x: r.x + 60, y: r.y + r.height / 2 }; });
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(900);
};

let s = await state();
await need('Abschnitt „Aktuelle Wiedergabe“ in der Raumansicht, mit Unterkarten', s && s.subcards > 0, s);
await check('Anfangs zugeklappt, nur die Kopfzeile sichtbar', s.shut && s.shown.length === 0, s);
await tap();
s = await state();
await check('Aufgeklappt: Unterkarten sichtbar', !s.shut && s.shown.some((c) => /subcard/.test(c)), s);
await tap();
s = await state();
await check('Wieder zugeklappt: nichts außer der Kopfzeile', s.shut && s.shown.length === 0, s);
await finish();
