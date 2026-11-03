// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/casora-core.js#CasoraPopup,navDirection,_navBegin
// Owner 03.11.2026: opening and closing a popup is animated, but a page change inside it (light popup: a room, a lamp;
// blinds: one blind; climate, house and sensor sub pages) swapped the content abruptly. Expected, everywhere through
// the popup frame: a sub page slides in (forward), ‹ slides back (back), the old page leaves and only one page is
// left afterwards; a ‹ during the transition ends on the right page with the right head; with reduced motion there
// is no slide. Scroll memory (owner, weather popup on the phone): scrolled down, a sub page, ‹ → the same place again;
// closed and opened again → the top. Phone 393×852 and desktop 1440×900. Nothing is switched or saved.
import { open, casoraDashboard, dashboard, check, need, finish, usePage } from './lib.mjs';

const multi = (d) => (d.config.views || []).length > 1;
const dash = await casoraDashboard((d) => d.url === 'test-neu' && multi(d)) || await casoraDashboard(multi);
await need('Casora dashboard with a phone layout', dash && dash.phone, dash && dash.url);

// State of the popup frame: head, page transition, number of pages in the scroller.
const state = (pg) => pg.evaluate(() => {
  const e = window.casoraPopup && window.casoraPopup.element; if (!e || !e.hasAttribute('open')) return null;
  const b = e._headerBack && !e._headerBack.hidden ? e._headerBack.getBoundingClientRect() : null;
  return { title: (e._headerTitle.textContent || '').replace(/​/g, '').trim(), eyebrow: (e._headerEyebrow.textContent || '').trim(),
    back: b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null, nav: e.getAttribute('data-casora-nav'),
    navigating: e.hasAttribute('navigating'), pages: e.shadowRoot.querySelectorAll('.content > .container').length,
    last: window._casoraNavLast || null };
});
// A visible row of the open popup that opens a page of its own: a light row („room“/„mi“), a device row of a group
// popup (data-casora-mi) or any row marked as opening a sub page.
const subRow = (pg, kinds) => pg.evaluate((kinds) => {
  const e = window.casoraPopup.element; const vis = (x) => x && x.getBoundingClientRect().width > 60;
  const lps = window.__pierce('.lps-row[data-lps-tap]', e.shadowRoot).filter(vis).filter((r) => {
    let d = null; try { d = JSON.parse(r.getAttribute('data-lps-tap')); } catch (err) { d = null; } return d && kinds.includes(d.a);
  });
  const mi = window.__pierce('[data-casora-mi]', e.shadowRoot).filter(vis);
  const r = lps[0] || mi[0]; if (!r) return null;
  r.scrollIntoView({ block: 'center' });
  const tx = r.querySelector('.lps-tx') || r; const b = tx.getBoundingClientRect();
  return { x: b.x + Math.min(30, b.width / 3), y: b.y + b.height / 2 };
}, kinds);
const until = async (pg, fn, n = 24) => { let s = null; for (let i = 0; i < n; i++) { await pg.waitForTimeout(150); s = await state(pg); if (s && fn(s)) return s; } return s; };
const settled = (s) => s && !s.navigating && s.pages === 1;

// Tiles to open: one per popup kind the test house has (group light, blinds, climate, a sensor page); the house
// light badge as in r503.
const tileOf = (pg, pred) => pg.evaluate((pred) => {
  const S = document.querySelector('home-assistant').hass.states;
  const ok = new Function('b', 'S', 'return ' + pred);
  const b = window.__pierce('button-card').find((x) => x.getBoundingClientRect().width > 60 && x._config && x._config.tap_action
    && x._config.tap_action.casora_popup && ok(x, S));
  if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, id: b._config.entity };
}, pred);
const KINDS = [
  ['Licht-Gruppe', "/^light\\./.test(b._config.entity||'') && Array.isArray(((S[b._config.entity]||{}).attributes||{}).entity_id)", ['room', 'mi']],
  ['Jalousien', "/^cover\\./.test(b._config.entity||'') && Array.isArray(((S[b._config.entity]||{}).attributes||{}).entity_id)", ['mi']],
  ['Klima', "/^climate\\./.test(b._config.entity||'')", ['mi']],
];

for (const [label, size, url] of [
  ['Handy', { width: 393, height: 852, mobile: true, safari: true }, dash.phone && dash.phone.url + '/home'],
  ['Desktop', { width: 1440, height: 900 }, dash.url],
]) {
  const ph = await open({ ...size, dark: false, theme: 'Casora' });
  const pg = ph.page; usePage(pg);
  const tap = async (p) => { if (size.mobile) await pg.touchscreen.tap(p.x, p.y); else await pg.mouse.click(p.x, p.y); };
  await dashboard(pg, label === 'Desktop' ? url : url, 2);
  await pg.evaluate(() => window._casoraFilter && window._casoraFilter.set('all'));
  await pg.waitForTimeout(1200);

  let walked = 0;
  for (const [kind, pred, kinds] of KINDS) {
    await pg.evaluate(async () => { if (window.casoraPopup && window.casoraPopup.close) window.casoraPopup.close(); await new Promise((r) => setTimeout(r, 600)); });
    const t = await tileOf(pg, pred);
    if (!t) { console.log(`  info   ${label}: keine Kachel „${kind}“ im Test-Haus – übersprungen`); continue; }
    await tap(t);
    const top = await until(pg, (s) => !!s.title);
    if (!top) { console.log(`  info   ${label}: „${kind}“ öffnet kein Casora-Popup – übersprungen`); continue; }
    const r = await subRow(pg, kinds);
    if (!r) { console.log(`  info   ${label}: „${kind}“ hat keine Zeile mit Unterseite – übersprungen`); continue; }
    await pg.waitForTimeout(400);
    await tap(r);
    const fw = await until(pg, (s) => s.last && s.last.dir === 'forward' && Date.now() - s.last.at < 5000);
    await check(`${label} · ${kind}: Unterseite kommt mit Übergang (vorwärts)`, fw && fw.nav === 'forward' && !!fw.back, fw);
    const fw2 = await until(pg, settled);
    await check(`${label} · ${kind}: danach genau eine Seite, kein Übergang mehr`, settled(fw2), fw2);
    if (fw2 && fw2.back) {
      await tap(fw2.back);
      const bk = await until(pg, (s) => s.nav === 'back');
      await check(`${label} · ${kind}: ‹ geht mit Übergang zurück`, bk && bk.nav === 'back', bk);
      const bk2 = await until(pg, settled);
      await check(`${label} · ${kind}: zurück auf der Seite davor („${top.title}“)`, settled(bk2) && bk2.title === top.title, { top, bk2 });
    }
    walked++;
  }
  await need(`${label}: mindestens zwei Popup-Arten mit Unterseite gefunden`, walked >= 2, walked);

  // ‹ during the transition: tap a sub page and go back at once – ends on the page before, one page, its head.
  await pg.evaluate(async () => { window.casoraPopup.close(); await new Promise((r) => setTimeout(r, 600)); });
  const t0 = await tileOf(pg, KINDS[0][1]);
  if (t0) {
    await tap(t0);
    const top = await until(pg, (s) => !!s.title);
    const r = await subRow(pg, KINDS[0][2]);
    if (top && r) {
      await tap(r);
      await until(pg, (s) => !!s.back, 30);
      await pg.evaluate(() => { const e = window.casoraPopup.element; e._headerBack.click(); });
      const end = await until(pg, (s) => settled(s) && s.title === top.title, 30);
      await check(`${label}: ‹ mitten im Übergang endet auf der Seite davor mit ihrem Kopf`, settled(end) && end.title === top.title && end.eyebrow === top.eyebrow, { top, end });
    }
  }

  // Scroll memory: a long popup with a sub page row below the fold (weather details and the like).
  await pg.evaluate(async () => { window.casoraPopup.close(); await new Promise((r) => setTimeout(r, 600)); });
  const longs = await pg.evaluate(() => window.__pierce('button-card').filter((x) => x.getBoundingClientRect().width > 60 && x._config
    && x._config.tap_action && x._config.tap_action.casora_popup).map((x, i) => i).slice(0, 40));
  let memo = null;
  for (const i of longs) {
    await pg.evaluate(async () => { if (window.casoraPopup.element.hasAttribute('open')) { window.casoraPopup.close(); await new Promise((r) => setTimeout(r, 600)); } });
    const p = await pg.evaluate((i) => {
      const b = window.__pierce('button-card').filter((x) => x.getBoundingClientRect().width > 60 && x._config
        && x._config.tap_action && x._config.tap_action.casora_popup)[i];
      if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, i);
    if (!p) continue;
    await tap(p);
    const s0 = await until(pg, (s) => !!s.title);
    if (!s0) continue;
    await pg.waitForTimeout(900);
    // A row with a sub page at least 150 px down a scroller that can scroll.
    const row = await pg.evaluate(() => {
      const e = window.casoraPopup.element, sc = e.content;
      if (!sc || sc.scrollHeight - sc.clientHeight < 150) return null;
      const top = sc.getBoundingClientRect().top;
      const rows = window.__pierce('[data-casora-mi]', e.shadowRoot).filter((r) => r.getBoundingClientRect().width > 60);
      const r = rows.find((x) => x.getBoundingClientRect().top - top + sc.scrollTop > 150);
      if (!r) return null;
      sc.scrollTop = Math.min(sc.scrollHeight - sc.clientHeight, r.getBoundingClientRect().top - top + sc.scrollTop - 120);
      return true;
    });
    if (!row) continue;
    await pg.waitForTimeout(400);
    const before = await pg.evaluate(() => window.casoraPopup.element.content.scrollTop);
    const at = await pg.evaluate(() => {
      const e = window.casoraPopup.element, sc = e.content, b0 = sc.getBoundingClientRect();
      const r = window.__pierce('[data-casora-mi]', e.shadowRoot).find((x) => { const b = x.getBoundingClientRect(); return b.width > 60 && b.top > b0.top + 40 && b.bottom < b0.bottom - 10; });
      if (!r) return null; const b = r.getBoundingClientRect(); return { x: b.x + Math.min(40, b.width / 3), y: b.y + b.height / 2 };
    });
    if (!at || before < 100) continue;
    await tap(at);
    const sub = await until(pg, (s) => settled(s) && !!s.back && s.last && s.last.dir === 'forward', 30);
    if (!sub || !sub.back) continue;
    const subTop = await pg.evaluate(() => window.casoraPopup.element.content.scrollTop);
    await check(`${label}: Unterseite beginnt oben`, subTop < 4, { subTop });
    await tap(sub.back);
    await until(pg, (s) => settled(s) && s.title === s0.title, 30);
    await pg.waitForTimeout(1800);
    const after = await pg.evaluate(() => window.casoraPopup.element.content.scrollTop);
    memo = { title: s0.title, before, after };
    await check(`${label}: ‹ zurück an dieselbe Stelle („${s0.title}“)`, Math.abs(after - before) <= 6, memo);
    await pg.evaluate(async () => { window.casoraPopup.close(); await new Promise((r) => setTimeout(r, 700)); });
    await tap(p);
    await until(pg, (s) => !!s.title);
    await pg.waitForTimeout(900);
    const re = await pg.evaluate(() => window.casoraPopup.element.content.scrollTop);
    await check(`${label}: geschlossen und neu geöffnet beginnt oben`, re < 4, { re });
    break;
  }
  await need(`${label}: ein langes Popup mit Unterseite unten gefunden`, memo, null);

  // Reduced motion: no slide, the page just stands.
  await pg.emulateMedia({ reducedMotion: 'reduce' });
  await pg.evaluate(async () => { window.casoraPopup.close(); await new Promise((r) => setTimeout(r, 600)); });
  const t1 = await tileOf(pg, KINDS[0][1]);
  if (t1) {
    await tap(t1);
    await until(pg, (s) => !!s.title);
    const r = await subRow(pg, KINDS[0][2]);
    if (r) {
      await tap(r);
      const s = await until(pg, (x) => x.last && x.last.reduced && Date.now() - x.last.at < 5000);
      await check(`${label}: weniger Bewegung – kein Übergang, sofort eine Seite`, s && s.last.reduced && !s.navigating && s.pages === 1, s);
    }
  }
  await pg.emulateMedia({ reducedMotion: null });
  await pg.evaluate(() => window.casoraPopup && window.casoraPopup.close && window.casoraPopup.close());
  await pg.context().close();
}
await finish();
