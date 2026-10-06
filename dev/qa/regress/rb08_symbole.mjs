// @zustand: arbeit
// @parallel: ui
// Neues Studio (B): keine fehlenden Symbole (04.10.2026, „Icons fehlen“). Erwartet in jeder
// Ansicht – Start, Räume-, Dashboard-, Zuhause- und „…“-Menü, Elemente, jeder Dashboard-Abschnitt,
// jede Einstellungsseite, Zeitreise, Updates, Liste „ausgeblendet“, Kachel- und Badge-Editoren –,
// am Desktop (Chromium) und am Handy (WebKit):
//  - jedes sichtbare ha-icon/ha-state-icon hat eine Grafik (Pfad mit Inhalt),
//  - jede sichtbare Maske (mask-image) zeigt auf eine Grafik, die es gibt (keine leere URL,
//    kein 404) und nicht auf das Ersatzsymbol für unbekannte Namen,
//  - keine leeren Symbol-Platzhalter (.menuicon/.menuglyph/.sicon/.pglyph/.mglyph ohne Grafik),
//  - jeder Eintrag in den Menüs des neuen Studios hat ein Symbol (wie die Seitenleiste des
//    bisherigen Studios, wo jede Zeile eins hat).
// Es wird nichts gespeichert.
import { open, studio, casoraDashboard, check, need, finish, usePage } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora-Dashboard', dash);

// In der Seite: Symbole der sichtbaren Studio-Oberfläche prüfen. menus = Menüs müssen Symbole haben.
const AUDIT = async (menus) => {
  const p = window.__panel(); const R = p.shadowRoot;
  const I = window.__casoraPanelInternals || {};
  const fallback = I.iconUrl ? I.iconUrl('default') : null;
  const vis = (e) => { const r = e.getBoundingClientRect(); if (!(r.width > 1 && r.height > 1)) return false;
    if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return false;
    for (let x = e; x && x.nodeType === 1; x = x.parentElement || (x.getRootNode() && x.getRootNode().host)) {
      const cs = getComputedStyle(x); if (cs.visibility === 'hidden' || cs.opacity === '0' || cs.display === 'none') return false; }
    return true; };
  const where = (e) => { const n = e.closest('[aria-label], [title], .combo-opt, .pbadge, .mtile, .chead, .frow');
    const t = n ? (n.getAttribute('aria-label') || n.title || n.textContent || '') : '';
    return e.tagName.toLowerCase() + '.' + String(e.className || '').split(' ')[0] + ' «' + t.trim().replace(/\s+/g, ' ').slice(0, 40) + '»'; };
  const bad = [];
  for (const e of window.__pierce('ha-icon, ha-state-icon', R)) {
    if (!vis(e) || (e.parentElement && e.parentElement.closest && e.parentElement.closest('ha-state-icon'))) continue;
    const paths = e.shadowRoot ? window.__pierce('path', e.shadowRoot) : [];
    if (!paths.some((x) => (x.getAttribute('d') || '').length > 4)) bad.push('ha-icon ohne Grafik (' + (e.getAttribute('icon') || e.icon || '?') + ') ' + where(e));
  }
  const urls = new Map();
  for (const e of window.__pierce('*', R)) {
    const cs = getComputedStyle(e);
    const maskOf = (c) => { const m = c.webkitMaskImage || c.maskImage || ''; return m && m !== 'none' ? /url\("?(.*?)"?\)/.exec(m) : null; };
    const glyphy = /(^|\s)(menuicon|menuglyph|sicon|pglyph|mglyph)(\s|$)/.test(typeof e.className === 'string' ? e.className : '');
    // Manche Symbole zeichnet ein Pseudo-Element (.sicon::after).
    const mm = maskOf(cs) || (glyphy ? maskOf(getComputedStyle(e, '::after')) || maskOf(getComputedStyle(e, '::before')) : null);
    if (!mm) {
      const bg = (c) => c.backgroundImage && c.backgroundImage !== 'none';
      if (glyphy && vis(e) && !e.querySelector('svg, img, ha-icon') && !bg(cs)
        && !bg(getComputedStyle(e, '::after')) && !bg(getComputedStyle(e, '::before'))
        && !(e.textContent || '').trim()) bad.push('leeres Symbol ' + where(e));
      continue;
    }
    if (!vis(e)) continue;
    const u = mm[1];
    if (!u || u === location.href || /undefined|null|\/$/.test(u) || u === 'data:,') bad.push('Maske ohne Bild ' + where(e));
    else if (fallback && u === fallback && glyphy && e.closest('.combo-menu')) bad.push('Ersatzsymbol (unbekannter Name) ' + where(e));
    else if (!u.startsWith('data:')) { if (!urls.has(u)) urls.set(u, e); }
  }
  for (const [u, e] of urls) {
    try { const res = await fetch(u); const t = await res.text(); if (!res.ok || t.length < 30) bad.push('Maske 404 ' + u.slice(0, 80) + ' ' + where(e)); }
    catch (x) { bad.push('Maske nicht ladbar ' + u.slice(0, 80)); }
  }
  for (const e of window.__pierce('img', R)) if (vis(e) && e.complete && !e.naturalWidth) bad.push('Bild kaputt ' + where(e));
  if (menus) {
    for (const o of R.querySelectorAll('.combo-menu .combo-opt')) {
      if (!vis(o)) continue;
      if (!o.querySelector('.menuicon, .menuglyph, img.avatar, .swatch')) bad.push('Menüeintrag ohne Symbol «' + (o.textContent || '').replace('✓', '').trim().slice(0, 40) + '»');
    }
  }
  return bad;
};

async function run(o, tag, phone) {
  const { page } = o;
  usePage(page);
  await studio(page, dash.url);
  const H = (fn, a) => page.evaluate(fn, a);
  // Menüauswahl ohne Klick auf Text (Übersetzung): den letzten Auswahl-Rückruf merken.
  await H(() => { const p = window.__panel(); const m = p._menuAt;
    p._menuAt = function (a, items, onPick, mo) { this.__qaPick = (id) => { if (this._openCombo) this._openCombo(); onPick(id); }; return m.call(this, a, items, onPick, mo); }; });
  // Zeitreise/Updates laufen am Handy als eigenes Blatt (Ablauf) – das schließt sein eigener Knopf.
  const close = async () => { await H(() => { const p = window.__panel(); if (p._openCombo) p._openCombo();
    if (p._flowMode && p._exitFlow) p._exitFlow(false); p._bClose(); }); await page.waitForTimeout(600); };
  const tool = (id) => H((k) => { const p = window.__panel(); const b = [...p.shadowRoot.querySelectorAll('.btool[data-b="' + k + '"], .bbar [data-b="' + k + '"]')].find((x) => x.getClientRects().length); b.click(); }, id);
  const pick = (id) => H((k) => window.__panel().__qaPick(k), id);
  const seen = {};
  const look = async (name, fn, menus) => {
    let r;
    try { r = await fn(); } catch (e) { seen[name] = ['Ansicht nicht erreichbar: ' + String(e).slice(0, 120)]; await close(); return; }
    if (r === 'skip') { console.log('  info   ' + tag + ' ' + name + ': hier nicht vorhanden'); return; }
    await page.waitForTimeout(1300);
    seen[name] = await H(AUDIT, !!menus);
    await close();
  };
  await close();
  await look('Start', async () => {});
  await look('Räume-Menü', () => tool('rooms'), true);
  await look('Elemente', () => tool('list'));
  await look('Dashboard-Menü', () => tool('dash'), true);
  for (const k of ['General', 'Weather', 'Time', 'Notifications', 'Scenes']) {
    await look('Abschnitt ' + k, async () => { await tool('dash'); await page.waitForTimeout(400); await pick('sec:' + k); });
  }
  // Zeitreise steht seit UX-03 im Titelmenü (Dashboard-Name oben links).
  const title = () => H(() => { const r = window.__panel().shadowRoot;
    [...r.querySelectorAll('#roomtitle, #navtitle')].find((x) => x.getClientRects().length).click(); });
  await look('Titelmenü', () => title(), true);
  await look('Zeitreise', async () => { await title(); await page.waitForTimeout(400); await pick('doc:versions'); });
  await look('Zuhause-Menü', () => tool('home'), true);
  for (const k of ['home', 'alerts', 'dashboards', 'ai', 'outdoor', 'vent']) {
    await look('Seite ' + k, async () => { await tool('home'); await page.waitForTimeout(400); await pick('page:' + k); });
  }
  await look('Updates', async () => { await tool('home'); await page.waitForTimeout(400); await pick('updates'); });
  // Am Desktop gibt es im Testhaus immer Ausgeblendetes; am Handy hängt es vom gerade gezeigten Raum ab.
  await look('Ausgeblendet', () => H((ph) => { const c = window.__panel().shadowRoot.querySelector('.bhid:not(.bphint)');
    if (!c) { if (ph) return 'skip'; throw new Error('keine Liste'); } c.click(); return 1; }, phone), true);
  await look('Mehr-Menü', () => H(() => window.__panel().shadowRoot.getElementById('more').click()), true);
  const tiles = await H(() => [...window.__panel().shadowRoot.querySelectorAll('.card.map .mtile[data-mk^="t:"]:not(.ghost)')]
    .filter((x) => x.getClientRects().length).map((x) => x.dataset.mk).slice(0, 6));
  for (const mk of tiles) await look('Kachel ' + mk, () => H((k) => window.__panel().shadowRoot.querySelector('.card.map [data-mk="' + CSS.escape(k) + '"]').click(), mk));
  const badges = await H(() => [...window.__panel().shadowRoot.querySelectorAll('.card.map .pbadge[data-mk^="b:"]:not(.ghost)')]
    .filter((x) => x.getClientRects().length).map((x) => x.dataset.mk).slice(0, 4));
  for (const mk of badges) await look('Badge ' + mk, () => H((k) => window.__panel().shadowRoot.querySelector('.card.map [data-mk="' + CSS.escape(k) + '"]').click(), mk));
  await check(tag + ': ' + Object.keys(seen).length + ' Ansichten geprüft', Object.keys(seen).length >= 20 + (tiles.length ? 1 : 0), Object.keys(seen));
  for (const [name, bad] of Object.entries(seen)) {
    await check(tag + ' ' + name + ': alle Symbole da', !bad.length, bad.slice(0, 6));
  }
}

const d = await open({ width: 1440, height: 900, dark: false, studio: 'b', theme: 'Casora Weich' });
await run(d, 'Desktop', false);
await d.browser.close();
const m = await open({ width: 390, height: 844, mobile: true, scale: 2, dark: true, studio: 'b', theme: 'Casora Weich', safari: true });
await run(m, 'Handy WebKit', true);
await finish();
