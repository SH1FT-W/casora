// @zustand: arbeit
// @parallel: allein
// @deckt: custom_components/casora/scripts/casora-core.js#hideAll,undoAll,undoHtml,bindUndo,undoTick,openMenu,_casoraNotify
// Variant 3A (owner, 14.11.2026): after „Alle entfernen“ the phone showed HA's dark toast „Alle Meldungen entfernt ·
// Rückgängig · ×“ at the bottom edge, over the bell and the bar. Expected: the undo sits in the bell itself – title
// „Alle Meldungen entfernt“, „Nichts Neues“ below, a „Rückgängig“ pill (44 px to a finger) and a thin bar that runs
// down in 10 s; no HA toast. „Rückgängig“ brings every message back; after 10 s the undo is gone, the bell shows
// „Nichts Neues“ and the messages stay removed (also after a reload). Phone (bell in the bar) and desktop, light/dark.
// Runs alone: „Alle entfernen“ writes the user's removed list, which every other bell of this user reads.
import { open, usePage, casoraDashboards, check, need, finish, ready, atFinish } from './lib.mjs';
import { ws } from '../ws.mjs';

const all = await casoraDashboards();
const phone = all.find((d) => d.mobile);
const desk = all.find((d) => !d.mobile);
await need('Handy- und Desktop-Dashboard', phone && desk);

const cmd = async (m) => { const c = await ws(); try { return await c.cmd(m); } finally { c.close(); } };
const KEY = 'casora_notify_hidden';
const before = await cmd({ type: 'frontend/get_user_data', key: KEY }).then((r) => r && r.value, () => null);
const ids = [];
atFinish(async () => {
  for (const id of ids) await cmd({ type: 'call_service', domain: 'persistent_notification', service: 'dismiss', service_data: { notification_id: id } }).catch(() => {});
  await cmd({ type: 'frontend/set_user_data', key: KEY, value: before || { all: 0, rows: {} } }).catch(() => {});
});
const SHOT = process.env.CASORA_SHOT_DIR;

const bellAt = (page, onPhone) => page.evaluate((onPhone) => {
  const q = window.__pierce('.casora-bell').map((e) => e.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.top >= 0 && r.bottom <= innerHeight)
    .sort((a, b) => (onPhone ? b.top - a.top : a.top - b.top))[0];
  return q && { x: q.x + q.width / 2, y: q.y + q.height / 2 };
}, onPhone);

const menuState = (page) => page.evaluate(() => {
  const m = [...document.querySelectorAll('.casora-notify-menu')].find((e) => e.getBoundingClientRect().height > 0);
  if (!m) return { open: false };
  const u = m.querySelector('.casora-notify-undo');
  const b = m.querySelector('.casora-notify-undo-btn');
  const bar = m.querySelector('.casora-notify-undo-bar');
  const br = b && b.getBoundingClientRect(), mr = m.getBoundingClientRect();
  let scale = null;
  if (bar) { const t = getComputedStyle(bar).transform; const mm = t && t.match(/matrix\(([^,]+)/); scale = mm ? +(+mm[1]).toFixed(2) : (t === 'none' ? 1 : null); }
  return {
    open: true, text: m.textContent.replace(/\s+/g, ' ').trim(), undo: !!u,
    live: !!(u && u.querySelector('[aria-live="polite"]')),
    btn: br ? { h: Math.round(br.height), w: Math.round(br.width), inMenu: br.top >= mr.top && br.bottom <= mr.bottom, x: br.x + br.width / 2, y: br.y + br.height / 2 } : null,
    scale, rows: window._casoraNotify.rows.length,
  };
});

for (const onPhone of [true, false]) {
  for (const dark of [false, true]) {
    const tag = (onPhone ? 'Handy' : 'Desktop') + (dark ? ' dunkel' : ' hell');
    const dash = onPhone ? phone : desk;
    // A fresh message for this round; nothing removed before.
    await cmd({ type: 'frontend/set_user_data', key: KEY, value: { all: 0, rows: {} } });
    const ID = 'qa_r840_' + (onPhone ? 'p' : 'd') + (dark ? 'd' : 'l');
    ids.push(ID);
    await cmd({ type: 'call_service', domain: 'persistent_notification', service: 'create', service_data: { notification_id: ID, title: 'QA Glocke', message: 'Meldung für r840' } });
    const { page } = await open(onPhone ? { width: 393, height: 852, mobile: true, dark } : { width: 1440, height: 900, dark });
    usePage(page);
    await page.addInitScript(() => {
      window.__r840Toasts = [];
      window.addEventListener('hass-notification', (e) => { window.__r840Toasts.push(String((e.detail && e.detail.message) || '')); }, true);
    });
    await ready(page, '/' + dash.url + '/' + (dash.config.views[0].path || '0'), () => !!window._casoraNotify && !!window._casoraLocalLoaded, 60000);
    for (const t0 = Date.now(); Date.now() - t0 < 10000;) {
      if (await page.evaluate((id) => window._casoraNotify.rows.some((r) => r.id === 'ha:pn:' + id), ID)) break;
      await page.waitForTimeout(300);
    }
    const n0 = await page.evaluate(() => window._casoraNotify.rows.length);
    await need(tag + ': Meldungen in der Glocke', n0 > 0, n0);
    const at = await bellAt(page, onPhone);
    await need(tag + ': Glocke', at, at);
    await page.mouse.click(at.x, at.y);
    await page.waitForTimeout(1200);
    const wipeAt = await page.evaluate(() => {
      const m = [...document.querySelectorAll('.casora-notify-menu')].find((e) => e.getBoundingClientRect().height > 0);
      const b = m && [...m.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Alle entfernen' && x.getBoundingClientRect().width > 0);
      if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await need(tag + ': „Alle entfernen“ in der Glocke', wipeAt, wipeAt);
    if (SHOT) await page.screenshot({ path: `${SHOT}/${onPhone ? 'handy' : 'desktop'}-${dark ? 'dunkel' : 'hell'}-0-liste.png` });
    await page.mouse.click(wipeAt.x, wipeAt.y);
    await page.waitForTimeout(700);
    const yes = await page.evaluate(() => {
      const b = window.__pierce('.yes').find((x) => x.getBoundingClientRect().width > 0);
      if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await need(tag + ': Rückfrage', yes, yes);
    await page.mouse.click(yes.x, yes.y);
    await page.waitForTimeout(900);

    let s = await menuState(page);
    await check(tag + ': Glocke bleibt offen und zeigt das Rückgängig', s.open && s.undo && /Alle Meldungen entfernt/.test(s.text) && /Nichts Neues/.test(s.text) && /Rückgängig/.test(s.text), s);
    await check(tag + ': Meldung über aria-live', s.live, s);
    await check(tag + ': „Rückgängig“ in der Glocke, mindestens 44 hoch', !!s.btn && s.btn.inMenu && s.btn.h >= 44, s.btn);
    await check(tag + ': Glocke leer', s.rows === 0, s.rows);
    await page.waitForTimeout(4000);
    s = await menuState(page);
    await check(tag + ': Balken läuft ab (nach ~5 s etwa halb)', s.scale != null && s.scale > 0.3 && s.scale < 0.7, s.scale);
    if (SHOT) await page.screenshot({ path: `${SHOT}/${onPhone ? 'handy' : 'desktop'}-${dark ? 'dunkel' : 'hell'}-1-rueckgaengig.png` });
    const toasts = await page.evaluate(() => window.__r840Toasts.filter((m) => /entfernt|removed/i.test(m)));
    await check(tag + ': kein HA-Hinweis', toasts.length === 0, toasts);

    await page.mouse.click(s.btn.x, s.btn.y);
    await page.waitForTimeout(900);
    s = await menuState(page);
    const back = await page.evaluate((id) => window._casoraNotify.rows.some((r) => r.id === 'ha:pn:' + id), ID);
    await check(tag + ': „Rückgängig“ holt alle Meldungen zurück', back && s.rows === n0 && s.open && !s.undo, { back, rows: s.rows, n0, undo: s.undo });
    await check(tag + ': „Alle entfernen“ wieder da', /Alle entfernen/.test(s.text || ''), s.text);

    // Again, and let the 10 s run out.
    const wipe2 = await page.evaluate(() => {
      const m = [...document.querySelectorAll('.casora-notify-menu')].find((e) => e.getBoundingClientRect().height > 0);
      const b = m && [...m.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Alle entfernen' && x.getBoundingClientRect().width > 0);
      if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await need(tag + ': „Alle entfernen“ nach Rückgängig', wipe2, wipe2);
    await page.mouse.click(wipe2.x, wipe2.y);
    await page.waitForTimeout(700);
    const yes2 = await page.evaluate(() => {
      const b = window.__pierce('.yes').find((x) => x.getBoundingClientRect().width > 0);
      if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await need(tag + ': Rückfrage 2', yes2, yes2);
    await page.mouse.click(yes2.x, yes2.y);
    await page.waitForTimeout(10800);
    s = await menuState(page);
    await check(tag + ': nach 10 s kein Rückgängig mehr, „Nichts Neues“', !s.open || (!s.undo && /Nichts Neues/.test(s.text)), s);
    await check(tag + ': Meldungen bleiben entfernt', s.rows === undefined || s.rows === 0, s.rows);
    await page.reload();
    await ready(page, '/' + dash.url + '/' + (dash.config.views[0].path || '0'), () => !!window._casoraNotify && !!window._casoraLocalLoaded, 60000);
    await page.waitForTimeout(2500);
    const still = await page.evaluate((id) => window._casoraNotify.rows.some((r) => r.id === 'ha:pn:' + id), ID);
    await check(tag + ': nach Neuladen weiter entfernt', !still, still);
    const toasts2 = await page.evaluate(() => (window.__r840Toasts || []).filter((m) => /entfernt|removed/i.test(m)));
    await check(tag + ': auch beim zweiten Mal kein HA-Hinweis', toasts2.length === 0, toasts2);
    await page.close();
  }
}
await finish();
