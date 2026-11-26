// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/panel/casora-panel-b.js custom_components/casora/panel/casora-panel-b-mehr.js custom_components/casora/panel/casora-panel.js#card.shut
// Prüfrunde 26.11.2026, three Studio layout findings. Nothing is saved.
// d05-05: Studio (B) at tablet width (1024×768): the inspector showed only the ✕ and ~80 px of empty space, the room
//   name and its line were hidden ("the toolbar names the room", but B's toolbar names the dashboard). Expected: the
//   room list's header is visible with the room name, no empty band above it.
// d05-08: Studio on the phone with unsaved changes: the pill "Bearbeitet · N Änderungen" lay over the round search
//   button and almost on the Desktop/Tablet/Phone switch. Expected: no overlap with either.
// d05-10: a folded row whose description wraps (phone: "Popups – Das Fenster, wenn man eine Kachel antippt") had no
//   space above the title and below the text. Expected: at least 4 px inside top and bottom; one-line rows keep 52 px.
import { open, studio, casoraDashboard, check, need, finish, usePage } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora-Dashboard', dash);

// ── d05-05: tablet width ──
{
  const o = await open({ width: 1024, height: 768, dark: false, studio: 'b' });
  usePage(o.page);
  await studio(o.page, dash.url);
  await o.page.waitForTimeout(800);
  const s = await o.page.evaluate(() => { const p = window.__panel(), r = p.shadowRoot;
    const head = r.querySelector('.inspector > .insphead');
    const bar = head && head.querySelector('.navrow > .detailbar.listbar');
    const hb = head ? head.getBoundingClientRect() : null;
    const ins = r.querySelector('.inspector');
    return { b: p.classList.contains('bmode'), narrow: p.classList.contains('narrow'), bar: !!bar,
      shown: !!(head && getComputedStyle(head).display !== 'none' && hb.height > 20), text: head ? head.textContent.trim().slice(0, 80) : '',
      pad: ins ? parseFloat(getComputedStyle(ins).paddingTop) : -1 }; });
  await need('1024: Studio B, schmale Ansicht mit Raumliste', s.b && s.narrow && s.bar, s);
  await check('1024: Kopf der Raumliste sichtbar (Raumname)', s.shown && s.text.length > 0, s);
  await check('1024: keine leere Fläche über dem Kopf', s.pad < 20, s);
  await o.browser.close();
}

// ── d05-08 and d05-10: phone ──
{
  const o = await open({ width: 393, height: 852, mobile: true, scale: 3, dark: true, studio: 'b' });
  usePage(o.page);
  await studio(o.page, dash.url);
  const H = (fn, a) => o.page.evaluate(fn, a);
  await H(() => { const p = window.__panel(); const rs = p._state.compact.rooms; const r = rs[rs.length - 1];
    p._undoStack.push(p._snap()); r.name = r.name + ' QA'; p._markDirty(); p._renderTabs(); });
  await o.page.waitForTimeout(900);
  const g = await H(() => { const r = window.__panel().shadowRoot;
    const box = (q) => { const e = r.querySelector(q); if (!e || !e.getClientRects().length) return null; const b = e.getBoundingClientRect(); return { t: b.top, b: b.bottom, l: b.left, r: b.right }; };
    const seg = [...r.querySelectorAll('[data-size]')].filter((e) => e.getClientRects().length).map((e) => e.getBoundingClientRect());
    return { pill: box('.toprow > .bedited'), search: box('#msearch'), segTop: seg.length ? Math.min(...seg.map((x) => x.top)) : null }; });
  await need('Handy: Pille und Suchknopf da', g.pill && g.search, g);
  const apart = (a, b) => a.b <= b.t + 0.5 || b.b <= a.t + 0.5 || a.r <= b.l + 0.5 || b.r <= a.l + 0.5;
  await check('Handy: Pille liegt nicht über dem Suchknopf', apart(g.pill, g.search), g);
  await check('Handy: Pille stößt nicht an den Umschalter Desktop/Tablet/Handy', g.segTop == null || g.pill.b <= g.segTop - 2, g);
  await H(() => window.__panel()._undo());

  // The room's rows in the sheet ("Inhalt").
  await H(() => { const p = window.__panel(); p._bOpen = true; p._renderForm(); });
  await o.page.waitForTimeout(1300);
  const rows = await H(() => [...window.__panel().shadowRoot.querySelectorAll('.card.shut > .chead')]
    .filter((h) => h.getClientRects().length && h.getBoundingClientRect().height > 0).map((h) => {
      const b = h.getBoundingClientRect();
      const kids = [...h.querySelectorAll('h2, h3, .uxwhat, small')].filter((k) => k.getClientRects().length).map((k) => k.getBoundingClientRect());
      const top = kids.length ? Math.min(...kids.map((k) => k.top)) : b.top, bot = kids.length ? Math.max(...kids.map((k) => k.bottom)) : b.bottom;
      return { text: h.textContent.trim().slice(0, 40), h: Math.round(b.height), above: Math.round(top - b.top), below: Math.round(b.bottom - bot), content: Math.round(bot - top) };
    }));
  await need('Handy: eingeklappte Zeilen im Blatt', rows.length >= 3, rows);
  const tall = rows.filter((x) => x.content > 40);
  await check('Handy: jede Zeile hat oben und unten Luft (≥ 4 px)', rows.every((x) => x.above >= 4 && x.below >= 4), rows);
  await check('Handy: einzeilige Zeilen bleiben 52 px hoch', rows.filter((x) => x.content <= 40).every((x) => Math.abs(x.h - 52) <= 1), rows);
  console.log('  info   umbrechende Zeilen: ' + tall.map((x) => x.text + ' ' + x.h + 'px').join(' · '));
  await o.browser.close();
}
await finish();
