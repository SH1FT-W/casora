// @zustand: arbeit
// @parallel: ui   (legt kurz eine Szene und ggf. einen Benutzer „QA Zweitkonto“ an und löscht beide wieder; das Dashboard wird nicht gespeichert)
// Nutzertest 7 (07.10.2026), mit echten Klicks im Casora-Look:
// 1) Szene aus dem jetzigen Zustand mit Farbe: Meldung hat „Jetzt speichern“ und steht nach 10 s noch.
// 2) Langes Drücken auf ein Badge öffnet das echte Popup (nicht den Editor).
// 3) Tablet-Kopfleiste: Knöpfe bleiben beim Raumwechsel an ihrem Platz; mit „Speichern“ überlappt
//    nichts (768×1024 hochkant, 1024×768 mit Seitenleiste); nach dem Drehen bleibt die Vorschau „Tablet“.
// 4) „Wer sieht das?“: Satz an der Kachel und Zähler „N ausgeblendet“ sofort aktuell.
// 5) Badge-Editor: „Wer sieht das?“ oben unter dem Namen.
// 6) Zeitreise am Handy: „…“ am Stand bietet „Diesen Stand wiederherstellen“.
import { open, studio, casoraDashboard, check, need, finish, atFinish, BASE } from './lib.mjs';
import { ws } from '../ws.mjs';

const dash = await casoraDashboard((d) => ((d.config || {}).views || []).length > 3);
await need('Casora-Dashboard', dash);
// 4) braucht einen zweiten Benutzer zum Ausschalten. Im Zustand „arbeit“ gibt es nur den Admin
// („Kind“ legt erst dev/qa/wegwerf-ha.sh konten an, das Gate nicht) – dann kurz einen ohne Anmeldung
// anlegen und am Ende wieder löschen.
{
  const c = await ws();
  const users = await c.cmd({ type: 'config/auth/list' });
  if (users.filter((u) => !u.system_generated && u.is_active).length < 2) {
    const { user } = await c.cmd({ type: 'config/auth/create', name: 'QA Zweitkonto', group_ids: ['system-users'], local_only: true });
    atFinish(async () => { const d = await ws(); try { await d.cmd({ type: 'config/auth/delete', user_id: user.id }); } finally { d.close(); } });
  }
  c.close();
}
const W = (pg, ms) => pg.waitForTimeout(ms);
const at = (pg, sel, text, nth = 0) => pg.evaluate(([s, t, n]) => {
  const e = window.__pierce(s).filter((x) => x.getClientRects().length && (!t || new RegExp(t).test(x.textContent.trim())))[n];
  if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2];
}, [sel, text || '', nth]);
const tap = async (pg, sel, text, nth) => { const p = await at(pg, sel, text, nth); if (!p) return false; await pg.mouse.click(p[0], p[1]); return true; };
const topOverlaps = (pg) => pg.evaluate(() => { const r = window.__panel().shadowRoot;
  const els = [...r.querySelectorAll('.toprow > *, .toprow .btools > *, .toprow .navpill > *')].filter((e) => e.getClientRects().length
    && !e.classList.contains('btools') && !e.classList.contains('navpill') && !e.classList.contains('bedited') && e.getBoundingClientRect().width > 2 && getComputedStyle(e).visibility !== 'hidden');
  const R = els.map((e) => { const b = e.getBoundingClientRect(); return { n: e.id || e.dataset.b || e.className, l: b.left, r: b.right, t: b.top, b: b.bottom }; });
  const ov = [];
  for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) { const a = R[i], c = R[j];
    if (a.l < c.r - 1 && c.l < a.r - 1 && a.t < c.b - 1 && c.t < a.b - 1) ov.push(a.n + '×' + c.n); }
  return ov; });
const toolPos = (pg) => pg.evaluate(() => [...window.__panel().shadowRoot.querySelectorAll('.btools .btool')].filter((e) => e.getClientRects().length && e.dataset.b !== 'rooms')
  .map((e) => e.dataset.b + '@' + Math.round(e.getBoundingClientRect().left)).join(' '));
// Kürzester und längster Raumname des Dashboards.
const roomPair = (pg) => pg.evaluate(() => { const p = window.__panel(); const rs = p._state.compact.rooms.map((r, i) => ({ i, n: p._roomLabel(r) }));
  rs.sort((a, b) => a.n.length - b.n.length); return [rs[0].i, rs[rs.length - 1].i]; });
const goRoom = (pg, i) => pg.evaluate((i) => { const p = window.__panel(); p._room = i; p._renderTabs(); p._renderForm(); p._rebuildPreview && p._rebuildPreview(); }, i);
const makeDirty = (pg) => pg.evaluate(() => { const p = window.__panel(); p._undoStack.push(p._snap());
  p._state.compact.rooms.forEach((r) => { r.variables = r.variables || {}; r.variables.use_12h = !r.variables.use_12h; }); p._markDirty(); });

// ── Tablet (3) ───────────────────────────────────────────────────────────
for (const [w, h, dock] of [[768, 1024, false], [1024, 768, true]]) {
  const o = await open({ width: w, height: h, dark: false, touch: true, scale: 1, theme: 'Casora', studio: 'b' });
  await o.context.addInitScript((d) => localStorage.setItem('dockedSidebar', d ? '"docked"' : '"always_hidden"'), dock);
  const pg = o.page;
  await studio(pg, dash.url);
  await pg.evaluate(() => window.__panel()._bClose && window.__panel()._bClose());
  await W(pg, 800);
  const [a, b] = await roomPair(pg);
  await goRoom(pg, a); await W(pg, 900);
  const p1 = await toolPos(pg);
  await goRoom(pg, b); await W(pg, 900);
  const p2 = await toolPos(pg);
  const tag = w + '×' + h + (dock ? ' mit Seitenleiste' : '');
  await check('3: ' + tag + ' – Knöpfe bleiben beim Raumwechsel am Platz', p1 === p2, { p1, p2 });
  await makeDirty(pg); await W(pg, 1200);
  const ov = await topOverlaps(pg);
  await check('3: ' + tag + ' – mit „Speichern“ überlappt nichts', !ov.length, ov);
  await goRoom(pg, a); await W(pg, 900);
  await check('3: ' + tag + ' – mit „Speichern“, anderer Raum, überlappt nichts', !(await topOverlaps(pg)).length, await topOverlaps(pg));
  if (!dock) {
    // Drehen: quer → Tablet wählen → hochkant → quer
    await pg.setViewportSize({ width: 1024, height: 768 }); await W(pg, 1200);
    await tap(pg, '.segopt[data-size="tablet"]'); await W(pg, 900);
    await pg.setViewportSize({ width: 768, height: 1024 }); await W(pg, 1500);
    const size = await pg.evaluate(() => window.__panel()._miniSize);
    await check('3: iPad gedreht – Vorschau bleibt „Tablet“', size === 'tablet', size);
  }
  await pg.evaluate(() => window.__panel()._undo());
  await o.browser.close();
}

// ── Desktop (1, 2, 4, 5) ───────────────────────────────────────────────────
{
  const o = await open({ width: 1600, height: 1000, dark: false, theme: 'Casora', studio: 'b' });
  const pg = o.page;
  const P = (fn, a) => pg.evaluate(fn, a);
  await studio(pg, dash.url);
  await P(() => window.__panel()._bClose());
  await W(pg, 600);

  // 2) Badge „Beleuchtung“ lange drücken
  const li = await P(() => { const p = window.__panel(); return p._state.compact.rooms.findIndex((r) => (r.variables || {}).light_entity_1 && (r.variables || {}).show_lights !== false); });
  await need('Raum mit Licht-Badge', li >= 0);
  await goRoom(pg, li); await W(pg, 1500);
  const bp = await at(pg, '.card.map .pbadge[data-mk^="b:lights"]');
  await need('Licht-Badge in der Vorschau', bp);
  await pg.mouse.move(bp[0], bp[1]); await pg.mouse.down(); await W(pg, 800); await pg.mouse.up();
  await pg.waitForFunction(() => !!(window.casoraPopup && window.casoraPopup.surface), null, { timeout: 15000 }).catch(() => {});
  await W(pg, 600);
  const lp = await P(() => ({ pop: !!(window.casoraPopup && window.casoraPopup.surface), sel: window.__panel()._sel }));
  await check('2: langes Drücken auf das Badge öffnet das echte Popup', lp.pop, lp);
  await check('2: … und nicht den Editor', !lp.sel, lp);
  await pg.keyboard.press('Escape'); await W(pg, 1000);
  if (await P(() => !!(window.casoraPopup && window.casoraPopup.surface))) { await P(() => window.casoraPopup.close && window.casoraPopup.close()); await W(pg, 800); }

  // 1) Szene mit Farbe: „Jetzt speichern“ in der Meldung, nach 10 s noch da
  await P(() => window.__panel()._bSceneFromState());
  await W(pg, 900);
  const name = 'QA Szene rb22 ' + Date.now().toString(36);
  await P((n) => { const i = window.__pierce('.bsin')[0]; i.value = n; i.oninput();
    const c = window.__pierce('.bscol')[0]; const v = [...c.options].find((x) => /violet/.test(x.value)) || c.options[1]; c.value = v.value; c.onchange(); }, name);
  atFinish(async () => {
    const c = await ws(); const st = await c.cmd({ type: 'get_states' }); c.close();
    const sc = st.find((s) => s.entity_id.startsWith('scene.') && s.attributes.friendly_name === name);
    const tok = JSON.parse(process.env.CASORA_TOKENS || '{}').access_token;
    if (sc && tok) await fetch(BASE + '/api/config/scene/config/' + sc.attributes.id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + tok } }).catch(() => {});
  });
  await tap(pg, '.bsgo');
  let t0 = null;
  for (let i = 0; i < 40 && !t0; i++) {
    await W(pg, 500);
    if (await P(() => { const s = window.__panel().shadowRoot.querySelector('.btoast.on .btsave'); return !!(s && !s.hidden); })) t0 = Date.now();
  }
  await check('1: Szenen-Meldung hat „Jetzt speichern“', !!t0);
  if (t0) {
    await W(pg, Math.max(0, 10500 - (Date.now() - t0)));
    await check('1: Meldung mit Knopf steht nach 10 s noch', await P(() => !!window.__panel().shadowRoot.querySelector('.btoast.on .btsave:not([hidden])')));
  }
  await P(() => { const p = window.__panel(); while (p._isDirty() && p._undoStack.length) p._undo(); });
  await P(() => window.__panel()._bClose());
  await W(pg, 800);

  // 4) Satz an der Kachel nach „Wer sieht das?“
  const ti = await P(() => { const p = window.__panel(); const i = p._state.compact.rooms.findIndex((r) => (r.tiles || []).some((t) => t.entity && !t.visibility)); return i; });
  await goRoom(pg, ti); await W(pg, 800);
  await P(() => { const p = window.__panel(); const t = p._state.compact.rooms[p._room].tiles.find((x) => x.entity && !x.visibility); p._bOpen = true; p._select({ group: 'tiles', key: p._tileKey(t) }); });
  await W(pg, 1500);
  const sent = () => P(() => { const e = window.__pierce('.uxvissent')[0]; return e ? e.textContent : null; });
  // Gruppe „Sichtbarkeit & Rückfrage“ aufklappen
  await P(() => { const d = window.__pierce('.adv.uxvis').find((x) => x.getClientRects().length); if (d && !d.open && !d.classList.contains('open')) { const s = d.querySelector('summary, .advsum'); if (s) s.click(); } });
  await W(pg, 600);
  const s0 = await sent();
  await tap(pg, '.adv.uxvis .mwho .mval'); await W(pg, 1000);
  const off = await P(() => { const r = window.__pierce('.mwhosheet .mu').find((x) => !/Administrator/.test(x.textContent)) || window.__pierce('.mwhosheet .mu')[1];
    if (!r) return false; r.querySelector('.sw').click(); return true; });
  await tap(pg, '.mwhosheet button', '^(Fertig|Done)$'); await W(pg, 1000);
  const s1 = await sent();
  await check('4: Satz „Alle sehen diese Kachel“ ändert sich sofort', off && s0 && s1 && s0 !== s1, { s0, s1, off });
  await P(() => { const p = window.__panel(); while (p._isDirty() && p._undoStack.length) p._undo(); });

  // 4) Zähler „N ausgeblendet“ nach Aus- und Einblenden eines Raums
  const ri = await P(() => { const p = window.__panel(); return p._state.compact.rooms.findIndex((r, i) => i > 0 && !(r.variables || {}).casora_hidden); });
  const chip = () => P(() => { const c = window.__panel().shadowRoot.querySelector('.canvas .bhid'); const m = c && /(\d+)/.exec(c.textContent); return m ? +m[1] : 0; });
  await P(() => window.__panel()._bClose()); await goRoom(pg, 0); await W(pg, 1200);
  const n0 = await chip();
  await P((i) => window.__panel()._mHideRoom(i, true), ri); await W(pg, 1200);
  const n1 = await chip();
  await P((i) => window.__panel()._mHideRoom(i, false), ri); await W(pg, 1200);
  const n2 = await chip();
  await check('4: Zähler „N ausgeblendet“ zählt beim Aus- und Einblenden mit', n1 === n0 + 1 && n2 === n0, { n0, n1, n2 });
  await P(() => { const p = window.__panel(); while (p._isDirty() && p._undoStack.length) p._undo(); });

  // 5) Badge-Editor: „Wer sieht das?“ oben
  await P((i) => { const p = window.__panel(); p._room = i; p._renderTabs(); p._bOpen = true; p._select({ group: 'badges', key: 'Lights' }); }, li);
  await W(pg, 1500);
  const pos = await P(() => { const c = window.__pierce('#pane [data-bid]').find((x) => x.getClientRects().length && x.querySelector(':scope > .mwho'));
    if (!c) return null; const k = [...c.children]; return { at: k.findIndex((e) => e.classList.contains('mwho')), of: k.length }; });
  await check('5: Badge-Editor: „Wer sieht das?“ unter dem Namen (oben)', pos && pos.at >= 1 && pos.at <= 3 && pos.of > 4, pos);
  await o.browser.close();
}

// ── Handy (6) ────────────────────────────────────────────────────────────
{
  const o = await open({ width: 390, height: 844, mobile: true, dark: false, theme: 'Casora', scale: 2, studio: 'b' });
  const pg = o.page;
  await studio(pg, dash.url);
  await W(pg, 600);
  if (!(await tap(pg, '#brewind'))) await pg.evaluate(() => window.__panel()._cvSheet());
  await W(pg, 2500);
  const rows = await pg.evaluate(() => window.__pierce('.cv-row').filter((e) => e.getClientRects().length).length);
  if (rows >= 2) {
    await tap(pg, '.cv-more', '', 1); await W(pg, 700);
    const menu = await pg.evaluate(() => window.__pierce('.combo-menu .combo-opt, [role="menuitem"]').filter((e) => e.getClientRects().length).map((e) => e.textContent.replace('✓', '').trim()));
    await check('6: „…“ am Stand bietet „Diesen Stand wiederherstellen“', menu.some((x) => /^(Diesen Stand wiederherstellen|Restore This Version)$/.test(x)), menu);
  } else await check('6: Zeitreise hat Stände (' + rows + ')', rows < 2, rows);
}

await finish();
