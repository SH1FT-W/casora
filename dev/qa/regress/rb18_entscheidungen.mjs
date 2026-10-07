// @zustand: arbeit
// @parallel: allein   (speichert das Prüf-Dashboard einmal; der vorherige Stand wird zurückgeschrieben)
// Freigegebene Entscheidungen aus den Nutzertests (07.10.2026), mit echten Klicks im Casora-Look:
// 1) Neben „Fertig“ steht bei Änderungen „Speichern“; ein Klick sichert, das Studio bleibt offen und
//    der Knopf verschwindet. Am Handy nur als Symbol, nichts überlappt.
// 2) Antippen einer Kachel öffnet den Editor (einmal mit Hinweis „Zum Ausprobieren lange drücken“);
//    langes Drücken öffnet das echte Popup, ohne Editor; mit „Vor dem Schalten fragen“ fragt das Popup
//    und schaltet ohne Bestätigen nicht. Rechtsklick öffnet es ebenso. Am Handy per Finger.
// 3) „Design“ steht im Menü „Einstellungen“; im Dashboard-Menü „Bedienung“ und ein Verweis aufs Design.
// 4) Szenenfarben unter „Casora“: „Lila“ und „Dunkelrot“; unter „Hemma 2“ genau einmal „Lila“.
// 5) „Wer sieht das?“: Hinweis auf neue Benutzer, sobald jemand ausgeschaltet ist.
import { open, studio, casoraDashboard, check, need, finish, atFinish } from './lib.mjs';
import { ws } from '../ws.mjs';

const dash = await casoraDashboard((d) => ((d.config || {}).views || []).length > 3);
await need('Casora-Dashboard', dash);
const URLS = [dash.url, dash.phone && dash.phone.url].filter(Boolean);
const orig = {};
{ const c = await ws(); for (const u of URLS) orig[u] = await c.cmd({ type: 'lovelace/config', url_path: u }); c.close(); }
atFinish(async () => { const c = await ws(); for (const u of URLS) await c.cmd({ type: 'lovelace/config/save', url_path: u, config: orig[u] }); c.close(); });
// Ein Theme in den Benutzerdaten (Server, z. B. von einem früheren settheme) ginge vor das Theme des Browsers –
// dann sähe „Hemma 2“ unten die Casora-Palette. Vor jedem Browser und am Ende leeren (wie r20/r39).
const noUserTheme = async () => { try { const c = await ws(); await c.cmd({ type: 'frontend/set_user_data', key: 'theme', value: null }); c.close(); } catch (e) { /* ohne Zugang */ } };
atFinish(noUserTheme);

const W = (pg, ms) => pg.waitForTimeout(ms);
const center = (pg, sel) => pg.evaluate((s) => { const e = window.__pierce(s).find((x) => x.getClientRects().length);
  if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);
const menu = (pg) => pg.evaluate(() => window.__pierce('.combo-menu .combo-opt').filter((e) => e.getClientRects().length)
  .map((e) => ((e.querySelector('.lbl') || e).textContent || '').trim()));
// Raum mit einer schaltenden Kachel (Licht/Schalter) zeigen; Kachel bekommt „Vor dem Schalten fragen“ (ungespeichert).
const pickTile = (pg, ask) => pg.evaluate((ask) => { const p = window.__panel(); p._bClose(); const rs = p._state.compact.rooms;
  for (let i = 1; i < rs.length; i++) { const t = (rs[i].tiles || []).find((x) => /^(light|switch)\./.test(String(x.entity || '')));
    if (t) { if (ask) { t.variables = { ...(t.variables || {}), confirm_toggle: true }; p._markDirty(); }
      p._room = i; p._renderTabs(); p._renderForm(); p._rebuildPreview && p._rebuildPreview(); return { i, key: p._tileKey(t), entity: t.entity }; } }
  return null; }, ask);
const tileXY = (pg, key) => pg.evaluate((k) => { const p = window.__panel();
  const el = [...p.shadowRoot.querySelectorAll('.card.map .mtile[data-mk^="t:"]')].find((e) => (e.dataset.jump === k || e.dataset.mk === 't:' + k) && e.getClientRects().length);
  if (!el) return null; el.scrollIntoView({ block: 'center', inline: 'center' }); const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, key);
const popupOpen = (pg) => pg.evaluate(() => !!(window.casoraPopup && window.casoraPopup.surface));
const closePopup = async (pg) => { await pg.evaluate(() => window.casoraPopup && window.casoraPopup.close()); await W(pg, 600); };

// ── Desktop ──────────────────────────────────────────────────────────────
{
  await noUserTheme();
  const { page } = await open({ width: 1600, height: 1000, dark: false, theme: 'Casora', studio: 'b' });
  await studio(page, dash.url);
  const P = (fn, a) => page.evaluate(fn, a);
  await P(() => window.__panel()._bClose());

  // 1) Speichern ohne Verlassen
  await check('1: ohne Änderungen kein „Speichern“', await P(() => window.__panel().$('savenow').hidden));
  await P(() => { const p = window.__panel(); const t = p._state.compact.rooms[0].tiles[0]; p._undoStack.push(p._snap()); t.name = (t.name || 'Kachel') + ' QA'; p._markDirty(); });
  await W(page, 500);
  const sv = await center(page, '#savenow');
  await check('1: bei Änderungen steht „Speichern“ neben „Fertig“', !!sv && await P(() => { const r = window.__panel().shadowRoot;
    const a = r.getElementById('savenow').getBoundingClientRect(), b = r.getElementById('donebtn').getBoundingClientRect(); return a.right <= b.left + 1 && b.left - a.right < 40; }));
  if (sv) await page.mouse.click(sv[0], sv[1]);
  await page.waitForFunction(() => !window.__panel()._isDirty(), null, { timeout: 15000 }).catch(() => {});
  const after = await P(() => { const p = window.__panel(); return { dirty: p._isDirty(), hidden: p.$('savenow').hidden, path: location.pathname, conn: p.isConnected }; });
  await check('1: Klick speichert, Knopf verschwindet', !after.dirty && after.hidden, after);
  await check('1: Studio bleibt offen', /casora-studio/.test(after.path) && after.conn, after);
  const saved = await (async () => { const c = await ws(); const cfg = await c.cmd({ type: 'lovelace/config', url_path: dash.url }); c.close(); return JSON.stringify(cfg).includes(' QA"'); })();
  await check('1: im Dashboard gespeichert', saved);

  // 2) Ausprobieren
  const tl = await pickTile(page, true);
  await need('2: schaltende Kachel', tl);
  await W(page, 1500);
  await P(() => localStorage.removeItem('casora.studio.tryHint'));
  let at = await tileXY(page, tl.key);
  await page.mouse.click(at[0], at[1]);
  await W(page, 1200);
  const tap = await P(() => { const p = window.__panel(); const t = p.shadowRoot.querySelector('.btoast.on'); return { sel: p._sel && p._sel.group, toast: t ? t.innerText : '' }; });
  await check('2: Antippen öffnet den Editor', tap.sel === 'tiles', tap);
  await check('2: einmaliger Hinweis „Zum Ausprobieren lange drücken“', /lange drücken/.test(tap.toast), tap);
  await P(() => window.__panel()._bClose());
  await W(page, 800);
  at = await tileXY(page, tl.key);
  await page.mouse.move(at[0], at[1]);
  await page.mouse.down();
  await W(page, 800);
  await page.mouse.up();
  await page.waitForFunction(() => !!(window.casoraPopup && window.casoraPopup.surface), null, { timeout: 15000 }).catch(() => {});
  await W(page, 800);
  const lp = await P(() => ({ pop: !!(window.casoraPopup && window.casoraPopup.surface), sel: window.__panel()._sel }));
  await check('2: langes Drücken öffnet das echte Popup', lp.pop, lp);
  await check('2: … und nicht den Editor', !lp.sel, lp);
  // Popup bedienen: Schalt-Knopf fragt nach, ohne Bestätigen wird nichts geschaltet
  const ask = await P(async (ent) => {
    const ha = document.querySelector('home-assistant');
    const calls = []; const orig = ha.hass.callService;
    ha.hass.callService = function (d, s) { calls.push(d + '.' + s); return Promise.resolve(); };
    // Schalt-Knopf: data-casora-svc (ältere Popups) oder die Zeile im Licht-Popup (data-lps-tap,
    // „Leuchten im Raum“) – welches Popup kommt, hängt vom Licht ab (dimmbar, Gruppe …).
    const lps = (e) => { try { const d = JSON.parse(e.getAttribute('data-lps-tap')); return d && d.a === 'toggle' && d.id === ent; } catch (x) { return false; } };
    const find = (root, out) => { root.querySelectorAll('*').forEach((e) => { if (e.dataset && ((e.dataset.casoraSvc && e.dataset.casoraSvc.includes(ent)) || (e.hasAttribute('data-lps-tap') && lps(e)))) out.push(e); if (e.shadowRoot) find(e.shadowRoot, out); }); return out; };
    const btn = find(window.casoraPopup.element.shadowRoot, [])[0];
    if (!btn) { ha.hass.callService = orig; return { btn: false }; }
    window._casoraUILastTap = 0; window._casoraPopupOpenedAt = 0;
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    await new Promise((r) => setTimeout(r, 500));
    const box = document.querySelector('.casora-askfirst');
    if (box) box.shadowRoot.querySelector('.no').click();
    await new Promise((r) => setTimeout(r, 300));
    ha.hass.callService = orig;
    return { btn: true, asked: !!box, calls };
  }, tl.entity);
  await check('2: Popup schaltet mit Rückfrage', ask.btn && ask.asked, ask);
  await check('2: … ohne Bestätigen wird nichts geschaltet', ask.btn && !(ask.calls || []).length, ask);
  await closePopup(page);
  at = await tileXY(page, tl.key);
  await page.mouse.click(at[0], at[1], { button: 'right' });
  await page.waitForFunction(() => !!(window.casoraPopup && window.casoraPopup.surface), null, { timeout: 15000 }).catch(() => {});
  await check('2: Rechtsklick öffnet das Popup', await popupOpen(page));
  await closePopup(page);
  // Ziehen bleibt Ziehen: Maus drücken, lange halten, bewegen → kein Popup
  at = await tileXY(page, tl.key);
  await page.mouse.move(at[0], at[1]); await page.mouse.down(); await W(page, 700);
  await page.mouse.move(at[0] + 60, at[1], { steps: 5 }); await page.mouse.up();
  await W(page, 1500);
  await check('2: gehalten und gezogen öffnet kein Popup', !(await popupOpen(page)));
  await closePopup(page);

  // 3) Design unter Einstellungen
  await P(() => window.__panel()._bClose());
  await page.locator('.btool[data-b=dash]').click(); await W(page, 600);
  const dm = await menu(page);
  await check('3: Dashboard-Menü: „Bedienung“ und Verweis „Design (für alle Dashboards)“',
    dm.some((t) => /^Bedienung/.test(t)) && dm.some((t) => /^Design \(für alle Dashboards\)/.test(t)) && !dm.some((t) => /Design & Bedienung/.test(t)), dm);
  await page.locator('.combo-opt', { hasText: 'Design (für alle Dashboards)' }).first().click();
  await W(page, 1500);
  await check('3: Verweis öffnet „Einstellungen › Design“', await P(() => { const p = window.__panel(); return p._csOpen && p._csPage === 'design' && !!p.shadowRoot.querySelector('#pane .casora-looks'); }));
  await P(() => { const p = window.__panel(); p._csClose && p._csClose(); p._bClose(); });
  await W(page, 600);
  const setBtn = page.locator('.btools .btool', { hasText: 'Einstellungen' }).first();
  await setBtn.click(); await W(page, 600);
  const hm = await menu(page);
  await check('3: Menü „Einstellungen“ beginnt mit „Design“', /^Design/.test(hm[0] || ''), hm);
  await page.keyboard.press('Escape'); await W(page, 400);

  // 4) Lila unter Casora
  await P(() => { const p = window.__panel(); p._room = 0; p._renderTabs(); p._bOpen = true; p._select({ group: 'rooms', key: 'Scenes', label: 'Scenes' }); });
  await W(page, 1500);
  const sp = await center(page, '#pane .scpick');
  if (sp) { await page.mouse.click(sp[0], sp[1]); await W(page, 600); }
  const cm = await menu(page);
  await check('4: Szenenfarben unter „Casora“: „Lila“ und „Dunkelrot“', cm.filter((t) => /^Lila$/.test(t)).length === 1 && cm.includes('Dunkelrot'), cm);
  await page.keyboard.press('Escape');

  // 5) Wer sieht das?
  const who = await P(async () => { const p = window.__panel(); p._bClose(); const users = await p._mUsers(); const me = users.find((u) => u.admin) || users[0];
    const rs = p._state.compact.rooms; const i = rs.findIndex((r, k) => k > 0 && (r.tiles || []).length); const t = rs[i].tiles[0];
    p._room = i; p._renderTabs(); p._renderForm(); p._bOpen = true; p._select({ group: 'tiles', key: p._tileKey(t), label: t.name || '' });
    await new Promise((r) => setTimeout(r, 1200));
    const vis = () => { const n = p.shadowRoot.querySelector('#pane .tile.sel .mwhonew'); return n ? !n.hidden : null; };
    const off = vis();
    t.visibility = [{ condition: 'user', users: [me.id] }]; p._renderForm();
    await new Promise((r) => setTimeout(r, 1200));
    const on = vis();
    const txt = (p.shadowRoot.querySelector('#pane .tile.sel .mwhonew') || {}).textContent;
    delete t.visibility;
    return { off, on, txt };
  });
  await check('5: ohne Einschränkung kein Hinweis', who.off === false, who);
  await check('5: Person ausgeschaltet → „Neue Benutzer sehen das erst …“', who.on === true && /Neue Benutzer/.test(who.txt || ''), who);
}

// ── Handy ────────────────────────────────────────────────────────────────
{
  await noUserTheme();
  const { page } = await open({ width: 390, height: 844, mobile: true, dark: false, scale: 2, theme: 'Casora', studio: 'b' });
  await studio(page, dash.url);
  const P = (fn, a) => page.evaluate(fn, a);
  await P(() => window.__panel()._bClose());
  await P(() => { const p = window.__panel(); const t = p._state.compact.rooms[0].tiles[0]; p._undoStack.push(p._snap()); t.name = (t.name || 'Kachel') + ' H'; p._markDirty(); });
  await W(page, 600);
  const bar = await P(() => { const r = window.__panel().shadowRoot; const row = r.querySelector('.toprow');
    const els = [...row.querySelectorAll('button, h1, .navpill > *')].filter((e) => e.getClientRects().length && e.getBoundingClientRect().width > 2 && !e.classList.contains('navflash'))
      .map((e) => ({ id: e.id || e.className, r: e.getBoundingClientRect().toJSON() }));
    const ov = [];
    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
      const a = els[i].r, b = els[j].r;
      // Rückgängig rückt absichtlich 6 px an den Nachbarn (margin-right:-6px) – erst mehr zählt.
      if (a.left < b.right - 8 && b.left < a.right - 8 && a.top < b.bottom - 1 && b.top < a.bottom - 1 && !(a.left <= b.left && a.right >= b.right) && !(b.left <= a.left && b.right >= a.right)) ov.push(els[i].id + '×' + els[j].id);
    }
    const s = r.getElementById('savenow');
    return { shown: s.getClientRects().length > 0, w: Math.round(s.getBoundingClientRect().width), right: Math.round(r.getElementById('more').getBoundingClientRect().right), ov };
  });
  await check('1 Handy: „Speichern“ als Symbol sichtbar', bar.shown && bar.w <= 44, bar);
  await check('1 Handy: Kopfzeile ohne Überlappung, im Bild', !bar.ov.length && bar.right <= 390, bar);
  await P(() => { const p = window.__panel(); p._undo(); });

  const tl = await pickTile(page, false);
  await need('2 Handy: schaltende Kachel', tl);
  await W(page, 1500);
  const at = await tileXY(page, tl.key);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: at[0], y: at[1] }] });
  await W(page, 800);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForFunction(() => !!(window.casoraPopup && window.casoraPopup.surface), null, { timeout: 15000 }).catch(() => {});
  const lp = await P(() => ({ pop: !!(window.casoraPopup && window.casoraPopup.surface), sel: window.__panel()._sel }));
  await check('2 Handy: langes Drücken öffnet das echte Popup über dem Studio', lp.pop && !lp.sel, lp);
  await closePopup(page);
}

// ── Hemma 2: kein zweites Lila ───────────────────────────────────────────
{
  await noUserTheme();
  const { page } = await open({ width: 1600, height: 1000, dark: false, theme: 'Hemma 2', studio: 'b' });
  await studio(page, dash.url);
  await page.evaluate(() => { const p = window.__panel(); p._bClose(); p._room = 0; p._renderTabs(); p._bOpen = true; p._select({ group: 'rooms', key: 'Scenes', label: 'Scenes' }); });
  await W(page, 1500);
  const sp = await center(page, '#pane .scpick');
  if (sp) { await page.mouse.click(sp[0], sp[1]); await W(page, 600); }
  const cm = await menu(page);
  await check('4: unter „Hemma 2“ genau ein „Lila“, kein „Dunkelrot“', cm.filter((t) => t === 'Lila').length === 1 && !cm.includes('Dunkelrot'), cm);
}

await finish();
