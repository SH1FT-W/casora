// @zustand: arbeit
// @parallel: ui
// Neues Studio (B): Sortieren direkt in der Vorschau. Erwartet: Badges lassen sich mit der Maus
// ziehen und per Alt+Pfeil verschieben (badge_order folgt, Fokus bleibt), Kacheln per Alt+Pfeil
// (ohne intelligente Sortierung); am Touchscreen nach langem Drücken ziehen, ohne langes Drücken
// passiert nichts (die Seite scrollt). Desktop in Chromium, Handy in Chromium und WebKit.
// Es wird nichts gespeichert.
import { open, studio, casoraDashboard, check, need, finish, usePage } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora-Dashboard', dash);

// Raum mit mindestens drei sichtbaren Badges wählen.
const pickRoom = (H) => H(async () => {
  const p = window.__panel();
  const rooms = p._state.compact.rooms;
  for (let i = 0; i < rooms.length; i++) {
    p._room = i; p._sel = null; p._bClose(); p._renderTabs(); p._syncPreview();
    await new Promise((r) => setTimeout(r, 900));
    const ids = p._bVisibleBadges().map((e) => String(e.dataset.mk).replace(/^b:/, '').split(':')[0]).filter((v, k, a) => a.indexOf(v) === k);
    if (ids.length >= 3) return { i, ids };
  }
  return null;
});
const order = (H) => H(() => { const p = window.__panel();
  return p._bVisibleBadges().map((e) => String(e.dataset.mk).replace(/^b:/, '').split(':')[0]).filter((v, k, a) => a.indexOf(v) === k); });

// ── Desktop ──
let o = await open({ width: 1440, height: 900, dark: false, studio: 'b' });
usePage(o.page);
await studio(o.page, dash.url);
let H = (fn, a) => o.page.evaluate(fn, a);
const room = await pickRoom(H);
await need('Raum mit drei Badges', room);

// Maus: erstes Badge auf das dritte ziehen
const box = await H(() => { const p = window.__panel(); const b = p._bVisibleBadges();
  const r = (e) => { const x = e.getBoundingClientRect(); return [x.left + x.width / 2, x.top + x.height / 2]; };
  const ids = b.map((e) => String(e.dataset.mk).replace(/^b:/, '').split(':')[0]);
  const third = b.findIndex((e, k) => ids.indexOf(ids[k]) === k && ids.filter((v, j) => j <= k && ids.indexOf(v) === j).length === 3);
  return { a: r(b[0]), c: r(b[third]) }; });
await o.page.mouse.move(box.a[0], box.a[1]);
await o.page.mouse.down();
await o.page.mouse.move(box.a[0] + 10, box.a[1], { steps: 3 });
await o.page.mouse.move(box.c[0] + 4, box.c[1], { steps: 8 });
await o.page.mouse.up();
await o.page.waitForTimeout(1200);
const m1 = await order(H);
await check('Maus: Badge in der Vorschau gezogen → neue Reihenfolge', m1[0] !== room.ids[0] && m1.indexOf(room.ids[0]) >= 1, { vorher: room.ids, nachher: m1 });
const bo = await H(() => { const p = window.__panel(); return (p._state.compact.rooms[p._room].variables || {}).badge_order; });
await check('badge_order folgt der Vorschau', Array.isArray(bo) && bo.filter((x) => m1.includes(x)).join() === m1.join(), { bo, m1 });
const clickedOpen = await H(() => window.__panel().classList.contains('binsp'));
await check('Ziehen öffnet keinen Inspektor', !clickedOpen);

// Tastatur: Alt+Pfeil rechts
await H(() => { const p = window.__panel(); p._bVisibleBadges()[0].focus(); });
const k0 = await order(H);
await o.page.keyboard.press('Alt+ArrowRight');
await o.page.waitForTimeout(1200);
const k1 = await order(H);
const foc = await H(() => { const a = window.__panel().shadowRoot.activeElement; return a && String(a.dataset.mk).replace(/^b:/, '').split(':')[0]; });
await check('Alt+Pfeil verschiebt das Badge um eine Stelle', k1[1] === k0[0] && k1[0] === k0[1], { vorher: k0, nachher: k1 });
await check('Fokus bleibt auf dem verschobenen Badge', foc === k0[0], foc);

// Kacheln per Tastatur (intelligente Sortierung aus)
const t0 = await H(async () => { const p = window.__panel(); const r = p._state.compact.rooms[p._room];
  r._row = { ...(r._row || {}), sort: false }; p._mapSig = null; p._renderForm();
  await new Promise((x) => setTimeout(x, 900));
  const t = [...p.shadowRoot.querySelectorAll('.card.map .mtile[data-mk^="t:"]:not(.ghost)')].find((x) => x.getClientRects().length);
  if (!t) return null; t.focus(); return { mk: t.dataset.mk, keys: r.tiles.map((x) => p._tileKey(x)) }; });
if (t0) {
  await o.page.keyboard.press('Alt+ArrowRight');
  await o.page.waitForTimeout(1200);
  const t1 = await H(() => { const p = window.__panel(); return p._state.compact.rooms[p._room].tiles.map((x) => p._tileKey(x)); });
  const k = t0.mk.slice(2);
  await check('Alt+Pfeil verschiebt die Kachel', t1.indexOf(k) === t0.keys.indexOf(k) + 1, { vorher: t0.keys.slice(0, 5), nachher: t1.slice(0, 5) });
}
await o.browser.close();

// ── Handy: Touch, Chromium und WebKit ──
for (const safari of [false, true]) {
  const tag = safari ? 'WebKit' : 'Chromium';
  o = await open({ width: 393, height: 852, mobile: true, scale: 3, dark: false, studio: 'b', safari });
  usePage(o.page);
  await studio(o.page, dash.url);
  H = (fn, a) => o.page.evaluate(fn, a);
  const r2 = await pickRoom(H);
  if (!r2) { await check(tag + ': Raum mit drei Badges', false); await o.browser.close(); continue; }
  // Synthetische Touch-Zeiger: kurz bewegt (Scrollen) ändert nichts, lang gedrückt zieht.
  const drag = (hold) => H(async (hold) => {
    const p = window.__panel(); const b = p._bVisibleBadges();
    const ids = b.map((e) => String(e.dataset.mk).replace(/^b:/, '').split(':')[0]);
    const firstOf = (id) => b[ids.indexOf(id)];
    const uniq = ids.filter((v, k, a) => a.indexOf(v) === k);
    const a = firstOf(uniq[0]), c = firstOf(uniq[2]);
    const ra = a.getBoundingClientRect(), rc = c.getBoundingClientRect();
    const ev = (t, x, y, el) => (el || window).dispatchEvent(new PointerEvent(t, { bubbles: true, composed: true,
      pointerType: 'touch', pointerId: 9, isPrimary: true, clientX: x, clientY: y, button: 0 }));
    const log = [p._miniSize, a.isConnected, Math.round(ra.x), Math.round(ra.y), Math.round(rc.x)];
    ev('pointerdown', ra.x + 5, ra.y + 5, a);
    await new Promise((r) => setTimeout(r, hold));
    log.push('hold=' + p._bHold);
    ev('pointermove', ra.x + 30, ra.y + 6);
    log.push('drag=' + a.classList.contains('mdrag'));
    ev('pointermove', rc.x + rc.width / 2 + 2, rc.y + rc.height / 2);
    ev('pointerup', rc.x + rc.width / 2, rc.y + rc.height / 2);
    await new Promise((r) => setTimeout(r, 900));
    return log;
  }, hold);
  const p0 = await order(H);
  await drag(60);
  const p1 = await order(H);
  await check(tag + ': Touch ohne langes Drücken sortiert nicht (Scrollen bleibt)', p1.join() === p0.join(), { p0, p1 });
  const lg = await drag(450);
  const p2 = await order(H);
  await check(tag + ': Touch nach langem Drücken zieht das Badge', p2[0] !== p0[0] && p2.indexOf(p0[0]) >= 1, { p0, p2, lg });
  await o.browser.close();
}
await finish();
