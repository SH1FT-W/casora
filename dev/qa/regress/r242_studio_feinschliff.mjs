// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/panel/casora-panel-b.js custom_components/casora/panel/casora-panel.js custom_components/casora/panel/casora-panel-settings.js custom_components/casora/panel/casora-panel-versions.js custom_components/casora/panel/casora-panel-b-mehr.js custom_components/casora/scripts/casora-core.js
// Studio-Feinschliff 1.3 (Wahl nach dem Studio-Audit und den Persona-Tests):
//   P-V4  Studio startet im zuletzt angesehenen Casora-Dashboard (casora-core merkt es beim Ansehen).
//   P-V3  Raumaktionen als eigenes ⋯ neben dem Raumnamen; das Raummenü zeigt nur noch die Räume.
//   ds-13 Einstellungsseiten fluchten: Kopf, Hinweis, Abschnittsköpfe und Karteninhalt auf einer Linie.
//   ds-15 Handy-Leiste: vier gleich breite Spalten um das „+“ in der Mitte.
//   ds-14 Handy-Titel im Hellen dunkel (lesbar auf heller Unschärfe).
//   ds-16 Tablet (Touch): Trefferflächen ≥ 40 px (unsichtbarer Rand) für Suche, Rückgängig/Zeitreise, Umschalter.
//   ds-17 ⌘K-Hinweis in Text 2 (keine halbe Deckkraft).
import { open, ready, check, need, finish, studioDashboard } from './lib.mjs';

const dash = await studioDashboard();
await need('Casora-Dashboard fürs Studio', dash);
const isPanel = () => { const p = window.__panel && window.__panel(); return !!(p && p._hass && p._state && p._state.compact); };

// ── Desktop ────────────────────────────────────────────────────────────────
{
  const { page, context } = await open({ width: 1440, height: 900, theme: 'Casora', dark: false, studio: 'b' });
  // Zuletzt im Studio bearbeitet: ein anderes Dashboard – angesehen wird danach `dash`.
  await context.addInitScript(() => { if (!sessionStorage.getItem('qa-r232')) { sessionStorage.setItem('qa-r232', '1'); localStorage.setItem('casora_panel_last_dashboard', 'gibt-es-nicht'); } });
  await ready(page, '/' + dash, () => window.__pierce && window.__pierce('button-card').length > 3);
  await page.waitForTimeout(2500);
  const seen = await page.evaluate(() => localStorage.getItem('casora_last_viewed_dashboard'));
  await check('P-V4 Dashboard merkt sich als zuletzt angesehen', seen === dash, seen);
  await page.evaluate(() => localStorage.setItem('casora_panel_last_dashboard', 'gibt-es-nicht'));
  await ready(page, '/casora-studio', isPanel);
  const open1 = await page.evaluate(() => window.__panel()._dashUrl);
  await check('P-V4 Studio öffnet das zuletzt angesehene Dashboard', open1 === dash, open1);

  // P-V3: ⋯ neben dem Raumnamen
  const act = await page.evaluate(() => { const p = window.__panel(); const r = p.shadowRoot.querySelector('.btool.broom'); const a = p.shadowRoot.querySelector('.btool.broomact');
    if (!r || !a) return null; return { nach: r.nextElementSibling === a, label: a.getAttribute('aria-label') }; });
  await check('P-V3 eigener ⋯-Knopf direkt hinter dem Raumnamen', act && act.nach, act);
  const menu = async (sel) => {
    await page.evaluate((s) => window.__panel().shadowRoot.querySelector(s).click(), sel);
    await page.waitForTimeout(700);
    const t = await page.evaluate(() => [...window.__panel().shadowRoot.querySelectorAll('.combo-menu')].filter((m) => m.getBoundingClientRect().height > 0).map((m) => m.textContent).join('|'));
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    return t;
  };
  const tActs = await menu('.btool.broomact');
  await check('P-V3 ⋯ zeigt Umbenennen/Symbol/Löschen', /Umbenennen/.test(tActs) && /Symbol/.test(tActs) && /löschen/i.test(tActs), tActs.slice(0, 200));
  const tRooms = await menu('.btool.broom');
  await check('P-V3 Raummenü ohne Raumaktionen', !/Umbenennen/.test(tRooms) && /Raum hinzufügen/.test(tRooms), tRooms.slice(0, 200));

  // ds-17
  const kb = await page.evaluate(() => { const k = window.__panel().shadowRoot.querySelector('#msearch .mkb'); if (!k) return null; const s = getComputedStyle(k); return { op: s.opacity, c: s.color }; });
  await check('ds-17 ⌘K ohne halbe Deckkraft', kb && +kb.op === 1, kb);

  // ds-13
  await page.evaluate(async () => { const p = window.__panel(); p._bOpen = true; await p._csOpenPage('home'); });
  await page.waitForTimeout(2500);
  const xs = await page.evaluate(() => { const p = window.__panel(); const r = p.shadowRoot; const x = (s) => { const e = [...r.querySelectorAll(s)].find((y) => y.getBoundingClientRect().width > 0); if (!e) return null; const g = document.createRange(); g.selectNodeContents(e); return Math.round(g.getBoundingClientRect().left); };
    return { kopf: x('.detailbar h3'), hinweis: x('.cs-lede'), abschnitt: x('.fhead'), fussnote: x('.ffoot') }; });
  const vals = Object.values(xs).filter((v) => v != null);
  await check('ds-13 Einstellungsseite fluchtet (±1 px)', vals.length >= 3 && Math.max(...vals) - Math.min(...vals) <= 1, xs);
}

// ── Handy ──────────────────────────────────────────────────────────────────
{
  const { page } = await open({ width: 393, height: 852, mobile: true, safari: true, theme: 'Casora', dark: false, studio: 'b' });
  await ready(page, '/casora-studio', isPanel);
  await page.evaluate((d) => { const p = window.__panel(); p._setDash(d); p._remember(d); return p._load(); }, dash);
  await page.waitForTimeout(3000);
  const bar = await page.evaluate(() => { const p = window.__panel(); const b = p.shadowRoot.querySelector('.bbar'); if (!b) return null; const q = b.getBoundingClientRect();
    const plus = b.querySelector('.bplus').getBoundingClientRect();
    const cols = [...b.children].map((c) => c.getBoundingClientRect()).map((r) => Math.round(r.left + r.width / 2));
    return { mitte: (q.left + q.right) / 2, plus: plus.left + plus.width / 2, cols }; });
  await need('Handy-Leiste', bar);
  await check('ds-15 „+“ in der Mitte der Leiste (±2 px)', Math.abs(bar.mitte - bar.plus) <= 2, bar);
  const d = bar.cols.slice(1).map((c, i) => c - bar.cols[i]);
  await check('ds-15 Spalten symmetrisch um das „+“ (±2 px)', d.length === 4 && Math.abs(d[0] - d[3]) <= 2 && Math.abs(d[1] - d[2]) <= 2, d);
  const col = await page.evaluate(() => getComputedStyle(window.__panel().shadowRoot.getElementById('navtitle')).color);
  await check('ds-14 Handy-Titel im Hellen dunkel', !/255, 255, 255/.test(col), col);
}

// ── Tablet (Touch) ─────────────────────────────────────────────────────────
{
  const { page } = await open({ width: 1024, height: 768, touch: true, theme: 'Casora', dark: false, studio: 'b' });
  await ready(page, '/casora-studio', isPanel);
  await page.evaluate((d) => { const p = window.__panel(); p._setDash(d); p._remember(d); return p._load(); }, dash);
  await page.waitForTimeout(3000);
  const small = await page.evaluate(() => { const r = window.__panel().shadowRoot; const out = [];
    for (const e of r.querySelectorAll('.toprow .ghost, .segopt, #msearch, .msearchbtn, .roomtitle, .uxas')) {
      const q = e.getBoundingClientRect(); if (!q.width) continue;
      const b = getComputedStyle(e, '::before'); const h = b.content !== 'none' ? Math.max(q.height, parseFloat(b.height) || 0) : q.height;
      const w = b.content !== 'none' ? Math.max(q.width, parseFloat(b.width) || 0) : q.width;
      if (w < 40 || h < 40) out.push((e.getAttribute('aria-label') || e.textContent).trim().slice(0, 20) + ' ' + Math.round(w) + '×' + Math.round(h)); }
    return out; });
  await check('ds-16 Trefferflächen am Tablet ≥ 40 px', !small.length, small);
}
await finish();
