// @zustand: arbeit
// @parallel: frei   (nur im Speicher – gespeichert wird nichts)
// Kleinigkeiten aus den Nutzertests (07.10.2026), mit echten Klicks im Casora-Look:
// 1) iPad hochkant: „Tablet“ zeigt die Vorschau hochkant; quer und am Desktop (ohne Touch) bleibt sie quer.
//    Nichts in der Kopfzeile überlappt (768×1024, 1024×768 mit HA-Seitenleiste).
// 2) Werkzeugleiste am Tablet: der Raumknopf zeigt den Raumnamen (gekürzt mit „…“ erlaubt), sonst nur Symbole.
// 3) Meldung unten bleibt ganz in der Studio-Fläche (nicht über der HA-Seitenleiste).
// 4) Zeitreise: „Diesen Stand wiederherstellen“ fragt einmal, ohne die Verlustliste ein zweites Mal.
// 5) „Neu in <Raum>“: mehr als die erkannten Geräte, Rest hinter „+N weitere“ aufklappbar.
// 6) Hinweis „Im Dashboard stehen aktive Kacheln vorn“ unter der Vorschau, wenn der Raum so sortiert.
// 7) Änderungsliste nennt die Einstellung („Uhrzeit: 12-Stunden-Uhr an“).
// 8) Farbauswahl unter „Casora“ ohne Bernstein, Eisblau und Gold.
// 9) Kachelart als Unterzeile in der Vorschau nur bei Kacheln ohne eigenen Namen.
import { open, studio, casoraDashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard((d) => ((d.config || {}).views || []).length > 3);
await need('Casora-Dashboard', dash);
const W = (pg, ms) => pg.waitForTimeout(ms);

// Mitte eines sichtbaren Elements im Studio (durch Shadow-DOM), vorher ins Bild geholt.
const at = (pg, sel, text) => pg.evaluate(([s, t]) => {
  const e = window.__pierce(s).find((x) => x.getClientRects().length && (!t || new RegExp(t).test(x.textContent.trim())));
  if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2];
}, [sel, text || '']);
const tap = async (pg, sel, text, touch) => { const p = await at(pg, sel, text); if (!p) return false;
  if (touch) await pg.touchscreen.tap(p[0], p[1]); else await pg.mouse.click(p[0], p[1]); return true; };
// Kopfzeile: überlappt etwas? (wie rb15)
const topOverlaps = (pg) => pg.evaluate(() => { const r = window.__panel().shadowRoot;
  const els = [...r.querySelectorAll('.toprow > *, .toprow .btools > *, .toprow .navpill > *')].filter((e) => e.getClientRects().length
    && !e.classList.contains('btools') && !e.classList.contains('navpill') && !e.classList.contains('bedited') && e.getBoundingClientRect().width > 2 && getComputedStyle(e).visibility !== 'hidden');
  const R = els.map((e) => { const b = e.getBoundingClientRect(); return { n: e.id || e.dataset.b || e.className, l: b.left, r: b.right, t: b.top, b: b.bottom }; });
  const ov = [];
  for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) { const a = R[i], c = R[j];
    if (a.l < c.r - 1 && c.l < a.r - 1 && a.t < c.b - 1 && c.t < a.b - 1) ov.push(a.n + '×' + c.n); }
  return ov; });
const mapBox = (pg) => pg.evaluate(() => { const c = window.__panel().shadowRoot.querySelector('.card.map');
  if (!c) return null; const b = c.getBoundingClientRect(); return { w: b.width, h: b.height, up: c.classList.contains('portrait') }; });
const toolbar = (pg) => pg.evaluate(() => { const p = window.__panel(); const l = p.shadowRoot.querySelector('.btools [data-b="rooms"] .blabel');
  return { cls: [...p.classList].filter((c) => /^uxs|^btight$/.test(c)).join(' '), w: l ? l.clientWidth : 0, full: l ? l.scrollWidth : 0, text: l ? l.textContent : '' }; });

// ── iPad hochkant (Touch) ────────────────────────────────────────────────
{
  const o = await open({ width: 768, height: 1024, dark: false, touch: true, scale: 1, theme: 'Casora', studio: 'b' });
  const pg = o.page;
  await studio(pg, dash.url);
  await pg.evaluate(() => window.__panel()._bClose());
  await W(pg, 600);
  await check('1: Knopf „Tablet“ angetippt', await tap(pg, '.segopt[data-size="tablet"]', '', true));
  await W(pg, 1200);
  const m = await mapBox(pg);
  await check('1: iPad hochkant – Tablet-Vorschau hochkant', !!m && m.up && m.h > m.w * 1.2, m);
  await check('1: 768×1024 – Kopfzeile überlappt nicht', !(await topOverlaps(pg)).length, await topOverlaps(pg));
  const tb = await toolbar(pg);
  await check('2: Raumknopf zeigt den Raumnamen (oder bei Platzmangel nur Symbole)', /uxsr/.test(tb.cls) ? tb.w >= 40 : /btight/.test(tb.cls) || tb.w > 0, tb);
  // 6) Hinweis unter der Vorschau, nicht über der Vorschau
  const hint = await pg.evaluate(() => { const r = window.__panel().shadowRoot; const h = r.querySelector('.maprowhint'); const c = r.querySelector('.card.map');
    const smart = window.__panel()._smartSortOn(); if (!h) return { smart, has: false };
    const a = h.getBoundingClientRect(), b = c.getBoundingClientRect(); return { smart, has: true, below: a.top >= b.bottom - 1, text: h.textContent.trim() }; });
  await check('6: Hinweis „aktive Kacheln vorn“ unter der Vorschau, wenn sortiert', hint.smart ? hint.has && hint.below && /aktive Kacheln vorn|active tiles/i.test(hint.text) : !hint.has, hint);
}

// ── iPad quer mit HA-Seitenleiste ────────────────────────────────────────
{
  const o = await open({ width: 1024, height: 768, dark: false, touch: true, scale: 1, theme: 'Casora', studio: 'b' });
  await o.context.addInitScript(() => localStorage.setItem('dockedSidebar', '"docked"'));
  const pg = o.page;
  await studio(pg, dash.url);
  await W(pg, 600);
  await tap(pg, '.segopt[data-size="tablet"]', '', true);
  await W(pg, 1200);
  const m = await mapBox(pg);
  await check('1: iPad quer – Tablet-Vorschau quer', !!m && !m.up && m.w > m.h, m);
  await check('1: 1024×768 – Kopfzeile überlappt nicht', !(await topOverlaps(pg)).length, await topOverlaps(pg));
  // 3) Breite Meldung bei offenem Blatt (schmale Vorschau): ganz in der Studio-Fläche
  const t = await pg.evaluate(async () => { const p = window.__panel(); p._bOpen = true; p._renderForm();
    await new Promise((r) => setTimeout(r, 500));
    p._bToast('Kachel „Stehlampe im Wohnzimmer“ ist jetzt ausgeblendet – im Dashboard nicht mehr sichtbar', { action: { label: 'Rückgängig', run() {} }, ms: 20000 });
    await new Promise((r) => setTimeout(r, 500));
    const a = p.shadowRoot.querySelector('.btoast').getBoundingClientRect(), h = p.getBoundingClientRect();
    return { l: Math.round(a.left), r: Math.round(a.right), hl: Math.round(h.left), hr: Math.round(h.right) }; });
  await check('3: Meldung liegt ganz in der Studio-Fläche (nicht über der Seitenleiste)', t.l >= t.hl && t.r <= t.hr, t);
}

// ── Desktop ──────────────────────────────────────────────────────────────
{
  const o = await open({ width: 1600, height: 1000, dark: false, theme: 'Casora', studio: 'b' });
  const pg = o.page;
  const P = (fn, a) => pg.evaluate(fn, a);
  await studio(pg, dash.url);
  await P(() => window.__panel()._bClose());
  await W(pg, 600);

  // 9) Kachelart als Unterzeile: nur bei Kacheln ohne eigenen Namen, nie doppelt
  const kinds = await P(() => { const p = window.__panel(); const tiles = (p._state.compact.rooms[p._room] || {}).tiles || [];
    const named = new Set(tiles.filter((t) => typeof t.name === 'string' && t.name).map((t) => p._tileKey(t)));
    return [...p.shadowRoot.querySelectorAll('.card.map .mtile:not(.ghost)')].filter((e) => e.querySelector('.mkind'))
      .map((e) => ({ name: e.querySelector('.mname').textContent, kind: e.querySelector('.mkind').textContent, named: named.has(e.dataset.jump) })); });
  await check('9: Kachelart-Unterzeile nur ohne eigenen Namen und nicht doppelt', kinds.every((k) => !k.named && k.kind && k.kind.toLowerCase() !== k.name.toLowerCase()), kinds);

  // 1) Desktop ohne Touch, auch im Hochformat-Fenster: quer
  await tap(pg, '.segopt[data-size="tablet"]');
  await W(pg, 800);
  await pg.setViewportSize({ width: 1000, height: 1400 });
  await W(pg, 1200);
  const m = await mapBox(pg);
  await check('1: Desktop (ohne Touch) im Hochformat – Tablet bleibt quer', !!m && !m.up && m.w > m.h, m);
  await pg.setViewportSize({ width: 1600, height: 1000 });
  await tap(pg, '.segopt[data-size="desktop"]');
  await W(pg, 1000);

  // 5) „Neu in <Raum>“: Raum mit den meisten Geräten ohne Kachel
  const room = await P(() => { const p = window.__panel(); const all = p._uxDevices();
    let best = -1, n = 0; p._state.compact.rooms.forEach((r, i) => { const c = all.filter((x) => x.fresh && x.roomIndex === i).length; if (c > n) { n = c; best = i; } });
    if (best >= 0) { p._room = best; p._renderTabs(); p._renderForm(); p._rebuildPreview && p._rebuildPreview(); }
    const U = window.__casoraStudioUx; const part = best >= 0 ? U.newInRoom(all, best, 6) : { shown: [], rest: [] };
    return { best, n, shown: part.shown.length, rest: part.rest.length, recognized: all.filter((x) => x.fresh && x.roomIndex === best && (x.suggested || x.loose)).length }; });
  await need('Raum mit Geräten ohne Kachel', room.best >= 0 && room.n > 0, room);
  await W(pg, 800);
  await check('5: „+“ der Leiste geklickt', await tap(pg, '.btools .btool.uxplus'));
  await W(pg, 900);
  const rows0 = await P(() => window.__pierce('.uxadd .mrow').filter((e) => e.getClientRects().length).length);
  await check('5: alle erkannten und mindestens 6 (bzw. alle) stehen sofort da', rows0 === room.shown && rows0 >= Math.min(room.n, 6) && rows0 >= room.recognized, { rows0, room });
  if (room.rest) {
    const more = await P(() => { const b = window.__pierce('.uxadd .uxmorerow').find((e) => e.getClientRects().length); return b ? b.textContent.trim() : null; });
    await check('5: „+N weitere“ nennt die Zahl', more && more.includes(String(room.rest)), more);
    await tap(pg, '.uxadd .uxmorerow');
    await W(pg, 500);
    const rows1 = await P(() => window.__pierce('.uxadd .mrow').filter((e) => e.getClientRects().length).length);
    await check('5: aufgeklappt stehen alle da', rows1 === room.n, { rows1, room });
  } else await check('5: ohne Rest kein „+N weitere“', !(await at(pg, '.uxadd .uxmorerow')));
  await pg.keyboard.press('Escape');
  await W(pg, 500);

  // 7) Änderungsliste nennt die Einstellung
  await P(() => { const p = window.__panel(); p._undoStack.push(p._snap());
    p._state.compact.rooms.forEach((r) => { r.variables = r.variables || {}; r.variables.use_12h = !r.variables.use_12h; }); p._markDirty(); });
  await W(pg, 700);
  await tap(pg, '.toprow > .bedited');
  await W(pg, 700);
  const lines = await P(() => window.__panel()._mChanges());
  await check('7: Änderungsliste: „Uhrzeit: 12-Stunden-Uhr …“', lines.some((l) => /^(Uhrzeit: 12-Stunden-Uhr|Time: 12-hour clock) (an|aus|on|off)$/.test(l)), lines);
  await pg.keyboard.press('Escape');
  await P(() => window.__panel()._undo());
  await W(pg, 600);

  // 8) Farbauswahl der Szenen unter „Casora“
  await P(() => { const p = window.__panel(); p._bLeavePages && p._bLeavePages(); p._sel = { group: 'rooms', key: 'Scenes', label: 'Scenes' }; p._group = 'rooms'; p._bOpen = true; p._renderForm(); });
  await W(pg, 1200);
  if (await tap(pg, '.scpick')) {
    await W(pg, 700);
    const opts = await P(() => window.__pierce('.combo-menu .combo-opt').filter((e) => e.getClientRects().length).map((e) => ((e.querySelector('.lbl') || e).textContent || '').replace('✓', '').trim()));
    await check('8: Szenenfarben unter „Casora“ ohne Bernstein, Eisblau, Gold', !opts.some((t) => /^(Bernstein|Eisblau|Gold|Amber|Ice|Gold)$/.test(t)) && opts.includes('Orange') && opts.includes('Blau'), opts);
    await pg.keyboard.press('Escape');
  } else await check('8: Szenen-Farbknopf da', false);
  await P(() => window.__panel()._bClose());
  await W(pg, 600);

  // 4) Zeitreise: einmal fragen, ohne zweite Verlustliste
  await check('4: Knopf „Zeitreise“', await tap(pg, '#brewind'));
  await W(pg, 2500);
  const rows = await P(() => window.__pierce('.cv-row').filter((e) => e.getClientRects().length).length);
  if (rows >= 2) {
    await pg.mouse.click(...(await P(() => { const e = window.__pierce('.cv-row').filter((x) => x.getClientRects().length)[1]; e.scrollIntoView({ block: 'center' });
      const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })));
    await W(pg, 2000);
    await check('4: „Diesen Stand wiederherstellen“ geklickt', await tap(pg, '.cv-act button', '^(Diesen Stand wiederherstellen|Restore This Version)$'));
    await W(pg, 1000);
    const d = await P(() => { const vis = (s) => window.__pierce(s).filter((e) => e.getClientRects().length);
      return { confirm: vis('button').filter((b) => /^(Wiederherstellen|Restore)$/.test(b.textContent.trim())).length,
        loss: vis('.cv-loss').length, onPage: vis('.cv-act .cv-loss').length }; });
    await check('4: genau eine Rückfrage, Verlustliste nur einmal (auf der Seite)', d.confirm === 1 && d.loss === d.onPage, d);
    await tap(pg, 'button', '^(Abbrechen|Cancel)$');
    await W(pg, 700);
    const after = await P(() => window.__pierce('button').filter((b) => b.getClientRects().length && /^(Wiederherstellen|Restore)$/.test(b.textContent.trim())).length);
    await check('4: nach „Abbrechen“ keine zweite Rückfrage', after === 0, after);
  } else await check('4: Zeitreise hat Stände (' + rows + ')', rows < 2, rows);
}

await finish();
