// @zustand: arbeit
// @parallel: ui
// Neues Studio – Rückmeldung (Nutzertest 06.10.2026: „gesagt hat es mir nichts“). Erwartet:
// Kachel entfernen zeigt unten „Kachel entfernt: …“ mit „Rückgängig“, der Bereich heißt danach
// wieder „Kacheln“ (F-01), „Rückgängig“ in der Meldung holt die Kachel zurück; eine neue Kachel
// meldet „Kachel hinzugefügt“ und öffnet ihren Editor; Badge-Liste › „Szenen“ öffnet die
// Szenen-Seite mit „Name auf dem Badge“ (F-02); die Zeitreise steht als Knopf neben Rückgängig,
// nicht mehr im Titelmenü; Esc schließt das Blatt „Desktop und Handy angleichen“.
// Die Einführung erscheint beim ersten Öffnen einmal. Es wird nichts gespeichert.
import { open, studio, casoraDashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora-Dashboard', dash);
const { page, context } = await open({ width: 1440, height: 900, dark: false, studio: 'b' });
// Einführung: der Test-Rahmen schaltet sie ab – hier einmal wie beim ersten Öffnen.
await context.addInitScript(() => { if (!sessionStorage.getItem('qa-intro')) { sessionStorage.setItem('qa-intro', '1'); localStorage.removeItem('casora.studio.intro'); } });
await studio(page, dash.url);
const H = (fn, a) => page.evaluate(fn, a);
await page.waitForTimeout(2600);
const intro = await H(() => !!window.__panel().shadowRoot.querySelector('.bintro'));
await check('Einführung erscheint beim ersten Öffnen', intro);
if (intro) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
}
const introGone = await H(() => ({ gone: !window.__panel().shadowRoot.querySelector('.bintro'), ls: localStorage.getItem('casora.studio.intro') }));
await check('Esc beendet die Einführung, sie kommt nicht wieder', introGone.gone && introGone.ls === '1', introGone);

const toast = () => H(() => { const t = window.__panel().shadowRoot.querySelector('.btoast'); return t && t.classList.contains('on') ? t.innerText : ''; });

// Kachel entfernen
await H(() => { const p = window.__panel(); p._bClose();
  const t = [...p.shadowRoot.querySelectorAll('.card.map .mtile[data-mk^="t:"]:not(.ghost)')].find((x) => x.getClientRects().length);
  t.setAttribute('data-qa', 'kachel'); });
const n0 = await H(() => { const p = window.__panel(); return p._state.compact.rooms[p._room].tiles.length; });
await page.locator('[data-qa=kachel]').click();
await page.waitForTimeout(900);
await page.locator('.bremove').click();
await page.waitForTimeout(1100);
const s1 = await H(() => { const p = window.__panel(); const r = p.shadowRoot;
  const h = r.querySelector('#band-tiles .grouphead h3');
  return { n: p._state.compact.rooms[p._room].tiles.length, head: h && h.textContent }; });
const t1 = await toast();
await check('Entfernen meldet „Kachel entfernt“ mit „Rückgängig“', /Kachel entfernt/.test(t1) && /Rückgängig/.test(t1), t1);
await check('Bereich heißt danach wieder „Kacheln“', s1.n === n0 - 1 && s1.head === 'Kacheln', s1);
await page.locator('.btoast .btact').click();
await page.waitForTimeout(900);
const n2 = await H(() => { const p = window.__panel(); return p._state.compact.rooms[p._room].tiles.length; });
await check('„Rückgängig“ in der Meldung holt die Kachel zurück', n2 === n0, { vorher: n0, nachher: n2 });

// Kachel hinzufügen (Platz in der Vorschau, Typ per Tastatur)
await H(() => { const p = window.__panel(); p._bClose();
  const el = [...p.shadowRoot.querySelectorAll('.card.map .mtile')].find((e) => /hinzuf/i.test(e.textContent) && e.getClientRects().length);
  if (el) el.setAttribute('data-qa', 'add'); });
await page.locator('[data-qa=add]').click();
await page.waitForTimeout(900);
await page.keyboard.type('Gerät mit');
await page.waitForTimeout(400);
await page.keyboard.press('Enter');
await page.waitForTimeout(1400);
const s3 = await H(() => { const p = window.__panel(); return { sel: p._sel, n: p._state.compact.rooms[p._room].tiles.length }; });
const t3 = await toast();
await check('Neue Kachel: Meldung „Kachel hinzugefügt“ und ihr Editor ist offen',
  /Kachel hinzugefügt/.test(t3) && s3.n === n0 + 1 && s3.sel && s3.sel.group === 'tiles', { t3, s3 });
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await H(() => { const p = window.__panel(); while ((p._undoStack || []).length) p._undo(); p._bClose(); });
await page.waitForTimeout(600);

// Badge-Liste › Szenen
await H(() => { const p = window.__panel(); p._room = 0; p._renderTabs(); p._bShowList(); });
await page.waitForTimeout(700);
const hasScenes = await H(() => { const p = window.__panel(); const g = p.shadowRoot.querySelector('#band-badges .grouphead'); if (g) g.click();
  return !!(p._state.compact.rooms[0].variables || {}).show_scenes; });
await page.waitForTimeout(700);
if (hasScenes) {
  await H(() => window.__panel().shadowRoot.querySelector('#pane [data-bid="scenes"] .chead').setAttribute('data-qa', 'sz'));
  await page.locator('[data-qa=sz]').click();
  await page.waitForTimeout(900);
  const s4 = await H(() => { const p = window.__panel();
    return { sel: p._sel, name: [...p.shadowRoot.querySelectorAll('#pane .row')].some((r) => /Name auf dem Badge/.test(r.textContent)) }; });
  await check('Badge-Liste › „Szenen“ öffnet die Szenen-Seite mit „Name auf dem Badge“',
    s4.sel && s4.sel.key === 'Scenes' && s4.name, s4);
} else await check('Startseite zeigt Szenen als Badge (Testhaus)', false);

// Zeitreise
await H(() => window.__panel()._bClose());
await page.waitForTimeout(400);
const rw = await H(() => { const b = window.__panel().shadowRoot.getElementById('brewind'); return !!(b && b.getClientRects().length); });
await check('Zeitreise-Knopf neben Rückgängig', rw);
await page.locator('#roomtitle').click();
await page.waitForTimeout(600);
const menu = await H(() => [...window.__panel().shadowRoot.querySelectorAll('[role=menu], .menu')].filter((e) => e.getClientRects().length).map((e) => e.innerText).join(' '));
// V-09 (07.10.2026): Das Titelmenü führt alles über das Dashboard – die Zeitreise wieder mit.
await check('Titelmenü führt die Zeitreise (alles zum Dashboard)', menu && /Zeitreise/.test(menu), menu.slice(0, 200));
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

// Esc schließt das Blatt „Desktop und Handy angleichen“
await H(() => window.__panel()._reviewDifferences());
await page.waitForTimeout(900);
const f0 = await H(() => window.__panel()._flowMode);
await page.keyboard.press('Escape');
await page.waitForTimeout(900);
const f1 = await H(() => window.__panel()._flowMode || null);
await check('Esc schließt das Blatt „Desktop und Handy angleichen“', f0 === 'sheet' && !f1, { f0, f1 });
await finish();
