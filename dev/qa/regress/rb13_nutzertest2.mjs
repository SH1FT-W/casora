// @zustand: arbeit
// @parallel: ui
// Nutzertest 2 (07.10.2026). Erwartet: Änderungsliste zählt 3 für 3 Änderungen (Umbenennen mit
// Nebenwerten = 1), nimmt die Umbenennung einzeln zurück (Rest bleibt), ⌘Z holt sie wieder, von Hand
// zurückbenannt bleibt kein Geistereintrag; „Bearbeitet · …“ verschiebt die Kopfzeile nicht und der
// Hinweis „Handy weicht … ab“ überdeckt bei 1600 px nichts; ⌘K „12-Stunden“ findet die Uhrzeit;
// Studio folgt dem Dunkelmodus. Handy: „Bearbeitet · N Änderungen“ sichtbar und öffnet die Liste,
// die Vorschau springt zum gewählten Raum, im Inhalt-Blatt gilt „Einstellungen“ für alle Dashboards.
// Tablet: Kachel-Editor scrollt bis „Wer sieht das?“. Es wird nichts gespeichert.
import { open, studio, casoraDashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard((d) => ((d.config || {}).views || []).length > 3);
await need('Casora-Dashboard', dash);
const R0 = (H, s) => H((x) => { const e = window.__panel().shadowRoot.querySelector(x); return e ? e.innerText : null; }, s);
// Zwei Räume mit Kacheln: einer zum Umbenennen, einer für Kachel/Badge.
const pick = (H) => H(() => { const rs = window.__panel()._state.compact.rooms;
  const a = rs.findIndex((r, i) => i > 0 && r.path); const b = rs.findIndex((r, i) => i > 0 && i !== a && (r.tiles || []).length);
  return { a, b }; });

// ── Desktop 1600 ────────────────────────────────────────────────────────────────
{
  const { page, browser, context } = await open({ width: 1600, height: 1000, dark: false });
  await context.addInitScript(() => localStorage.setItem('selectedTheme', JSON.stringify({ theme: 'Hemma 2' })));
  await studio(page, dash.url);
  const H = (fn, a) => page.evaluate(fn, a);
  await H(() => window.__panel()._bClose && window.__panel()._bClose());
  await page.waitForTimeout(600);
  const { a, b } = await pick(H);
  const tools = () => H(() => Math.round(window.__panel().shadowRoot.querySelector('.btools').getBoundingClientRect().left));
  const x0 = await tools();
  // Umbenennen über das echte Namensfeld (setzt nebenbei room_name/area)
  const rename = async (to) => {
    await H((i) => { const p = window.__panel(); p._room = i; p._renderTabs(); p._renderForm(); p._bOpen = true; p._select({ group: 'rooms', key: 'Appearance', label: 'Appearance' }); }, a);
    await page.waitForTimeout(800);
    return H(([i, to]) => { const p = window.__panel(); const r = p._state.compact.rooms[i];
      const inp = [...p.shadowRoot.querySelectorAll('#pane input')].find((x) => x.value === p._roomLabel(r) || x.value === r.name);
      if (!inp) return false; inp.value = to; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); return true; }, [a, to]);
  };
  const was = await H((i) => window.__panel()._state.compact.rooms[i].name, a);
  await need('Namensfeld', await rename(was + ' QA'));
  await H((i) => { const p = window.__panel(); const r = p._state.compact.rooms[i]; r.tiles[0].enabled = false; p._markDirty(); r.variables = r.variables || {}; r.variables.climate_title = 'Luft'; p._markDirty(); }, b);
  await page.waitForTimeout(900);
  const ed = await R0(H, '.toprow > .bedited');
  await check('„Bearbeitet · 3 Änderungen“ für drei Änderungen', /3 Änderungen/.test(ed || ''), ed);
  await check('Kopfzeile springt nicht', (await tools()) === x0, [x0, await tools()]);
  await H(() => window.__panel().shadowRoot.querySelector('.toprow > .bedited').click());
  await page.waitForTimeout(500);
  const pop = await R0(H, '.mpop');
  await check('Liste nennt Umbenennung, Kachel aus und Badge wortgenau', /Raum umbenannt/.test(pop) && /Kachel ausgeschaltet/.test(pop) && /Badge umbenannt: Klima → Luft/.test(pop), pop);
  const i = await H(() => [...window.__panel().shadowRoot.querySelectorAll('.mpop li.mline')].findIndex((li) => /Raum umbenannt/.test(li.innerText)));
  await H((k) => window.__panel().shadowRoot.querySelectorAll('.mpop li.mline .mback')[k].click(), i);
  await page.waitForTimeout(700);
  const st = await H(([a, b]) => { const rs = window.__panel()._state.compact.rooms; return [rs[a].name, rs[b].variables.climate_title, rs[b].tiles[0].enabled]; }, [a, b]);
  await check('„Zurücknehmen“ nimmt nur die Umbenennung zurück', st[0] === was && st[1] === 'Luft' && st[2] === false, st);
  await check('Liste zeigt danach 2 Änderungen', /2 Änderungen/.test(await R0(H, '.mpop h4') || ''), await R0(H, '.mpop h4'));
  await page.keyboard.press('Escape');
  await H(() => window.__panel()._undo());
  await page.waitForTimeout(400);
  await check('⌘Z holt die Umbenennung zurück', (await H((i) => window.__panel()._state.compact.rooms[i].name, a)) === was + ' QA');
  await rename(was);
  await page.waitForTimeout(400);
  const lines = await H(() => window.__panel()._mChanges());
  await check('Von Hand zurückbenannt: kein Geistereintrag', lines.length === 2 && !lines.some((l) => /Raum/.test(l)), lines);
  // Hinweis „Handy weicht … ab“ überdeckt nichts
  await H(() => { const p = window.__panel(); if (p._pair) { p._pair.conflicts = [{}, {}]; p._renderReconcile(); } });
  await page.waitForTimeout(900);
  const ov = await H(() => { const r = window.__panel().shadowRoot; const t = r.querySelector('.btools'), d = r.getElementById('diffs');
    if (!d || d.hidden) return 'kein Hinweis'; return t.scrollWidth <= t.clientWidth + 1 && d.getBoundingClientRect().left >= t.getBoundingClientRect().right; });
  await check('1600 px: Hinweis „Handy weicht ab“ ohne Überlappung', ov === true || ov === 'kein Hinweis', ov);
  // ⌘K
  await page.keyboard.press('Meta+k');
  await page.waitForTimeout(300);
  await page.keyboard.type('12-Stunden');
  await page.waitForTimeout(300);
  await check('⌘K „12-Stunden“ findet die Uhrzeit', /Uhrzeit/.test(await R0(H, '.msearch .mrow') || ''), await R0(H, '.msearch .mrow'));
  await page.keyboard.press('Escape');
  // Dunkelmodus
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(1200);
  await check('Studio folgt dem Dunkelmodus', !(await H(() => window.__panel().classList.contains('is-light'))));
  await H(() => { const p = window.__panel(); p._undoStack = []; p._resetUndo && p._resetUndo(); });
  await browser.close();
}

// ── Handy ───────────────────────────────────────────────────────────────────────
{
  const { page, browser } = await open({ width: 390, height: 844, mobile: true, dark: false });
  await studio(page, dash.url);
  const H = (fn, a) => page.evaluate(fn, a);
  const { a } = await pick(H);
  await H((i) => { const p = window.__panel(); const r = p._state.compact.rooms[i]; r.name = r.name + ' QA'; p._markDirty(); p._renderTabs(); }, a);
  await page.waitForTimeout(800);
  const pill = await H(() => { const e = window.__panel().shadowRoot.querySelector('.toprow > .bedited'); return e && e.getClientRects().length ? e.innerText : null; });
  await check('Handy: „Bearbeitet · 1 Änderung“ sichtbar', /1 Änderung/.test(pill || ''), pill);
  await H(() => window.__panel().shadowRoot.querySelector('.toprow > .bedited').click());
  await page.waitForTimeout(500);
  await check('Handy: antippen öffnet die Liste mit „Zurücknehmen“', /Zurücknehmen/.test(await R0(H, '.mpop') || ''));
  await H(() => window.__panel()._mPopClose());
  await H(() => window.__panel()._undo());
  // Vorschau folgt dem Raum
  await H(() => { const seg = [...window.__panel().shadowRoot.querySelectorAll('[data-size]')].find((b) => b.dataset.size === 'phone'); if (seg) seg.click(); });
  await page.waitForTimeout(800);
  await H(() => window.__panel()._bRoomsOpen());
  await page.waitForTimeout(600);
  const target = await H((i) => { const p = window.__panel(); const r = p.shadowRoot.querySelector('#pane .brow[data-i="' + i + '"]'); if (r) r.click(); return p._roomLabel(p._state.compact.rooms[i]); }, a);
  await page.waitForTimeout(1500);
  const pv = await H(() => { const m = window.__panel().shadowRoot.getElementById('mapmount'); return m ? m.innerText.replace(/\s+/g, ' ').slice(0, 60) : ''; });
  await check('Handy: Vorschau springt zum gewählten Raum', pv.indexOf(target) === 0 || pv.indexOf(target) < 20 && pv.indexOf(target) >= 0, [target, pv]);
  // Inhalt-Blatt: Einstellungen gilt für alle Dashboards
  await H(() => { const p = window.__panel(); p._bRooms = false; p._sel = null; p._bOpen = true; p._renderForm(); });
  await page.waitForTimeout(900);
  const heads = await H(() => [...window.__panel().shadowRoot.querySelectorAll('.sidehead.phonehead')].map((h) => h.innerText.replace(/\s+/g, ' ')));
  const sett = heads.find((h) => /^Einstellungen/.test(h));
  await check('Inhalt-Blatt: „Einstellungen“ gilt für alle Dashboards', !!sett && /alle Dashboards/.test(sett), heads);
  await browser.close();
}

// ── Tablet quer ─────────────────────────────────────────────────────────────────
{
  const { page, browser } = await open({ width: 1024, height: 768, touch: true, dark: false });
  await studio(page, dash.url);
  const H = (fn, a) => page.evaluate(fn, a);
  await H(() => { const p = window.__panel(); const rs = p._state.compact.rooms;
    for (let i = 0; i < rs.length; i++) for (const t of rs[i].tiles || []) if (/^(lock|cover|switch|light)\./.test(t.entity || (t.card && t.card.entity) || '')) {
      p._room = i; p._renderTabs(); p._renderForm(); p._bOpen = true; p._select({ group: 'tiles', key: p._tileKey(t), label: t.name || '' }); return; } });
  await page.waitForTimeout(1200);
  await H(() => { const a = window.__panel().shadowRoot.querySelector('#pane .tile.sel .adv.uxvis'); const b = a && (a.querySelector('summary, .advhead, button') || a); if (b) b.click(); });
  await page.waitForTimeout(700);
  const box = await H(() => { const e = window.__panel().shadowRoot.getElementById('pane'); const b = e.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; });
  await page.mouse.move(box[0], box[1]);
  await page.mouse.wheel(0, 4000);
  await page.waitForTimeout(700);
  const vis = await H(() => { const p = window.__panel().shadowRoot; const w = p.querySelector('#pane .tile.sel .mwho'); const i = p.querySelector('.inspector');
    if (!w) return 'fehlt'; const b = w.getBoundingClientRect(), c = i.getBoundingClientRect(); return b.top >= c.top && b.bottom <= c.bottom + 1; });
  await check('Tablet: „Wer sieht das?“ per Scrollen erreichbar', vis === true, vis);
  await browser.close();
}
await finish();
