// @zustand: arbeit
// @parallel: ui
// Neues Studio (B, ab 1.1.0): Die Vorschau ist der Editor. Erwartet: Ein Klick auf eine Kachel,
// ein Badge oder den Raumtitel öffnet den passenden Editor im Inspektor rechts, die Vorschau
// rückt zur Seite; Schließen und Esc machen ihn zu. Tastatur: Tab erreicht die Vorschau,
// Enter öffnet (Fokus im Inspektor), Esc schließt und setzt den Fokus zurück auf das Element.
// Es wird nichts gespeichert.
import { open, studio, casoraDashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora-Dashboard', dash);
const { page } = await open({ width: 1440, height: 900, dark: false, studio: 'b' });
await studio(page, dash.url);
const H = (fn, a) => page.evaluate(fn, a);
const reset = () => H(() => { const p = window.__panel(); p._bClose(); });
await reset();
await page.waitForTimeout(600);

const s0 = await H(() => { const p = window.__panel(); const r = p.shadowRoot;
  const vis = (s) => { const e = r.querySelector(s); return !!(e && e.getClientRects().length); };
  return { b: p.classList.contains('bmode'), side: vis('.sidelist'), tools: vis('.btools'), insp: vis('.inspector'), map: vis('.card.map') }; });
await check('B an: Werkzeugleiste, keine Seitenleiste', s0.b && s0.tools && !s0.side, s0);
await check('Start: Vorschau sichtbar, Inspektor zu', s0.map && !s0.insp, s0);

// Kachel anklicken
const tile = await H(() => { const p = window.__panel();
  const t = [...p.shadowRoot.querySelectorAll('.card.map .mtile[data-mk^="t:"]:not(.ghost)')].find((x) => x.getClientRects().length);
  if (!t) return null; t.setAttribute('data-qa', 'kachel'); return t.dataset.mk; });
await need('Kachel in der Vorschau', tile);
const mapW0 = await H(() => window.__panel().shadowRoot.querySelector('.card.map').getBoundingClientRect().right);
await page.locator('[data-qa=kachel]').click();
await page.waitForTimeout(1200);
const s1 = await H(() => { const p = window.__panel(); const r = p.shadowRoot; const i = r.querySelector('.inspector');
  return { insp: !!(i && i.getClientRects().length), sel: p._sel, editor: !!r.querySelector('#pane .tile, #pane .card'),
    right: r.querySelector('.card.map').getBoundingClientRect().right, ix: i ? i.getBoundingClientRect().left : 0 }; });
await check('Klick auf Kachel öffnet ihren Editor im Inspektor', s1.insp && s1.sel && s1.sel.group === 'tiles' && s1.editor, s1);
await check('Vorschau weicht dem Inspektor (keine Überdeckung)', s1.right <= s1.ix + 2 && s1.right < mapW0, { vorher: mapW0, nachher: s1.right, inspektor: s1.ix });

// Schließen-Knopf
await page.locator('.bclose').click();
await page.waitForTimeout(800);
await check('Schließen-Knopf macht den Inspektor zu', !(await H(() => window.__panel().classList.contains('binsp'))));

// Badge und Raumtitel
await H(() => { const p = window.__panel(); const b = p.shadowRoot.querySelector('.card.map .pbadge[data-mk^="b:"]:not(.ghost)'); b.setAttribute('data-qa', 'badge'); });
await page.locator('[data-qa=badge]').click();
await page.waitForTimeout(1000);
const s2 = await H(() => { const p = window.__panel(); return { open: p.classList.contains('binsp'), sel: p._sel }; });
await check('Klick auf Badge öffnet den Badge-Editor', s2.open && s2.sel && s2.sel.group === 'badges', s2);
await page.keyboard.press('Escape');
await page.waitForTimeout(800);
await check('Esc schließt den Inspektor', !(await H(() => window.__panel().classList.contains('binsp'))));

// Tastatur
await H((mk) => { const p = window.__panel(); const el = p.shadowRoot.querySelector('.card.map [data-mk="' + mk + '"]'); el.focus(); }, tile);
const f0 = await H(() => { const a = window.__panel().shadowRoot.activeElement; return a && a.dataset.mk; });
await check('Kachel ist per Tastatur fokussierbar', f0 === tile, f0);
await page.keyboard.press('Enter');
await page.waitForTimeout(1200);
const f1 = await H(() => { const p = window.__panel(); const a = p.shadowRoot.activeElement;
  return { open: p.classList.contains('binsp'), inInsp: !!(a && a.closest && a.closest('.inspector')) }; });
await check('Enter öffnet, Fokus steht im Inspektor', f1.open && f1.inInsp, f1);
await page.keyboard.press('Escape');
await page.waitForTimeout(1000);
const f2 = await H(() => { const p = window.__panel(); const a = p.shadowRoot.activeElement;
  return { open: p.classList.contains('binsp'), mk: a && a.dataset && a.dataset.mk }; });
await check('Esc schließt, Fokus zurück auf der Kachel', !f2.open && f2.mk === tile, f2);
await finish();
