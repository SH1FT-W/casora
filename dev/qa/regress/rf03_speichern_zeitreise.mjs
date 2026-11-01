// @zustand: arbeit
// @parallel: allein
// @deckt: custom_components/casora/panel/casora-panel-versions.js custom_components/casora/versions.py
// Speichern, Rückgängig, ungespeicherte Änderungen und Zeitreise im neuen Studio (Desktop, Chromium).
// Erwartet: (1) Badge per Alt+Pfeil verschieben, „Rückgängig“ in der Werkzeugleiste stellt die
// Reihenfolge wieder her und nichts ist mehr ungespeichert. (2) Wieder verschieben, Studio ohne
// Speichern verlassen und zurückkehren: Das Studio bietet „Wiederherstellen“ an, danach ist die
// Änderung wieder da (ungespeichert). (3) ⌘S sichert sie in HA. (4) Zeitreise (Uhr neben Rückgängig):
// den Stand davor wählen, „Diesen Stand wiederherstellen“ + bestätigen – HA hat wieder die
// alte Reihenfolge. Schreibt ins Prüf-Dashboard – am Ende wird der vorherige Stand zurückgeschrieben.
import { open, studio, ready, casoraDashboard, check, need, finish, usePage, atFinish, BASE } from './lib.mjs';
import { ws } from '../ws.mjs';

const dash = await casoraDashboard();
await need('Casora-Dashboard', dash);
const URLS = [dash.url, dash.phone && dash.phone.url].filter(Boolean);
const saved0 = {};
{ const c = await ws(); for (const u of URLS) saved0[u] = await c.cmd({ type: 'lovelace/config', url_path: u }); c.close(); }
atFinish(async () => { const c = await ws();
  for (const u of URLS) await c.cmd({ type: 'lovelace/config/save', url_path: u, config: saved0[u] }); c.close(); });
// The time travel groups plain saves within 2 minutes into one entry (casora-panel-versions.js, GROUP_MS): a Studio
// test just before (r42 in the gate for 26.11.2) put its saves in the same group as ours, and „the state before“ was
// the state before that test (energy_subs_auto missing). The starting state is recorded and named here – a named
// entry stays on its own – and the name is removed at the end.
let startVid = null;
{ const c = await ws();
  try {
    await c.cmd({ type: 'casora/versions/snap', url_path: dash.url, mobile_url: (dash.phone && dash.phone.url) || null, kind: 'initial' });
    const L = await c.cmd({ type: 'casora/versions/list', url_path: dash.url });
    startVid = L && L.versions && L.versions[0] && L.versions[0].id;
    if (startVid) await c.cmd({ type: 'casora/versions/label', url_path: dash.url, version: startVid, name: 'QA rf03 Start' });
  } finally { c.close(); } }
atFinish(async () => { if (!startVid) return; const c = await ws();
  try { await c.cmd({ type: 'casora/versions/label', url_path: dash.url, version: startVid, name: '' }); } catch (e) { /* gone */ } finally { c.close(); } });
const cfgOf = async (u) => { const c = await ws(); try { return await c.cmd({ type: 'lovelace/config', url_path: u }); } finally { c.close(); } };

const o = await open({ width: 1600, height: 1000, dark: false });
usePage(o.page);
const pg = o.page;
const H = (fn, a) => pg.evaluate(fn, a);
// Abbruch zählt als Fehler; atFinish stellt trotzdem zurück.
try {
  // Mit der Maus auf die Mitte des Knopfs (Playwrights Stabilitätsprüfung wartet sonst auf das Blatt).
  const tapBtn = async (loc) => { const b = await loc.boundingBox(); if (!b) return false; await pg.mouse.click(b.x + b.width / 2, b.y + b.height / 2); return true; };
  await studio(pg, dash.url);
  // Raum mit mindestens drei sichtbaren Badges wählen (wie rb06).
  const room = await H(async () => {
    const p = window.__panel(), rooms = p._state.compact.rooms;
    for (let i = 0; i < rooms.length; i++) {
      p._room = i; p._sel = null; p._bClose(); p._renderTabs(); p._syncPreview();
      await new Promise((r) => setTimeout(r, 900));
      const ids = p._bVisibleBadges().map((e) => String(e.dataset.mk).replace(/^b:/, '').split(':')[0]).filter((v, k, a) => a.indexOf(v) === k);
      if (ids.length >= 3) return { i, path: rooms[i].path, ids };
    }
    return null;
  });
  await need('Raum mit drei Badges', room);
  const order = () => H(() => window.__panel()._bVisibleBadges().map((e) => String(e.dataset.mk).replace(/^b:/, '').split(':')[0]).filter((v, k, a) => a.indexOf(v) === k));
  const dirty = () => H(() => window.__panel()._isDirty());
  const move = async () => { await H(() => window.__panel()._bVisibleBadges()[1].focus()); await pg.keyboard.press('Alt+ArrowRight'); await pg.waitForTimeout(1200); };
  const pickRoom = async () => { await H((path) => { const p = window.__panel(); p._room = p._state.compact.rooms.findIndex((r) => r.path === path);
    p._sel = null; p._bClose(); p._renderTabs(); p._syncPreview(); }, room.path); await pg.waitForTimeout(1200); };

  // (1) Rückgängig
  await move();
  const o1 = await order();
  await check('Alt+Pfeil verschiebt ein Badge (ungespeichert)', o1.join() !== room.ids.join() && (await dirty()), { vorher: room.ids, nachher: o1 });
  await pg.locator('.top button[aria-label="Rückgängig"], .top button[aria-label="Undo"]').first().click();
  await pg.waitForTimeout(1300);
  await check('„Rückgängig“ stellt die Reihenfolge wieder her', (await order()).join() === room.ids.join() && !(await dirty()));

  // (2) Ohne Speichern verlassen, zurückkehren, wiederherstellen
  await move();
  const moved = await order();
  await pg.goto(BASE + '/' + dash.url + '/0');
  await pg.waitForTimeout(3000);
  // Studio wie ein Nutzer öffnen (lädt das zuletzt bearbeitete Dashboard selbst) – studio() lädt
  // zusätzlich von Hand, dann käme die Rückfrage doppelt.
  await ready(pg, '/casora-studio', () => { const p = window.__panel && window.__panel(); return !!(p && p._state && p._state.compact); });
  const offer = pg.locator('button:visible').filter({ hasText: /^(Wiederherstellen|Restore)$/ });
  await offer.first().waitFor({ timeout: 15000 }).catch(() => {});
  await check('Rückkehr: „Wiederherstellen“ wird angeboten', (await offer.count()) > 0);
  if (await offer.count()) { await tapBtn(offer.first()); await pg.waitForTimeout(2000); }
  await pickRoom();
  await check('Ungespeicherte Änderung wiederhergestellt', (await order()).join() === moved.join() && (await dirty()), await order());

  // (3) Sichern
  await H(() => { const p = window.__panel(); p._bClose(); document.activeElement && document.activeElement.blur(); });
  await pg.keyboard.press('Meta+s');
  const ok = await pg.waitForFunction(() => !window.__panel()._isDirty() && !window.__panel()._saving, null, { timeout: 30000 }).then(() => true).catch(() => false);
  await check('⌘S sichert', ok);
  const viewOf = (cfg) => JSON.stringify((cfg.views || []).find((v) => v.path === room.path) || {});
  const before = viewOf(saved0[dash.url]);
  await check('HA: neue Badge-Reihenfolge gespeichert', viewOf(await cfgOf(dash.url)) !== before);

  // (4) Zeitreise zum Stand davor – Knopf mit der Uhr neben Rückgängig (vorher im Titelmenü).
  // Under load the save's own version arrives a moment after the save (gate 26.11.2, machine busy): wait until the
  // newest version is no longer the named start before opening the time travel list.
  for (let i = 0; i < 40; i++) {
    const c = await ws();
    let top = null;
    try { const L = await c.cmd({ type: 'casora/versions/list', url_path: dash.url }); top = L && L.versions && L.versions[0] && L.versions[0].id; } finally { c.close(); }
    if (top && top !== startVid) break;
    await pg.waitForTimeout(500);
  }
  const zr = await H(() => { const e = window.__pierce('#brewind').find((x) => x.getClientRects().length);
    if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
  await need('Knopf „Zeitreise“ neben Rückgängig', zr);
  await pg.mouse.click(zr.x, zr.y);
  await pg.waitForTimeout(2500);
  // Einträge der Liste: „hh:mm …“ mit Beschreibung; der erste ist „Jetzt“, der zweite der Stand davor.
  const entries = await H(() => window.__pierce('button, [role=button], li, .zitem, .vrow').filter((b) => b.getClientRects().length
    && /^(\d\d:\d\d|QA rf03 Start)\s*\S/.test(b.textContent.trim()) && b.textContent.trim().length > 8)
    .filter((b, i, all) => !all.some((o) => o !== b && o.contains(b)))
    .map((b) => { const r = b.getBoundingClientRect(); return { t: b.textContent.trim().slice(0, 60), x: r.x + r.width / 2, y: r.y + r.height / 2 }; }));
  await need('Zeitreise mit mindestens zwei Ständen', entries.length >= 2, entries);
  // The starting state named above (it stands right under „Jetzt“), else the second entry.
  const pick = entries.find((e) => e.t.startsWith('QA rf03 Start')) || entries[1];
  await check('Zeitreise: der Stand davor ist der benannte Start', pick === entries[1], entries.slice(0, 3).map((e) => e.t));
  await pg.mouse.click(pick.x, pick.y);
  await pg.waitForTimeout(2000);
  await tapBtn(pg.locator('button:visible').filter({ hasText: /^(Diesen Stand wiederherstellen|Restore this version)$/ }).first());
  await pg.waitForTimeout(1200);
  await tapBtn(pg.locator('button:visible').filter({ hasText: /^(Wiederherstellen|Restore)$/ }).last());
  // The restore writes both dashboards and records two versions – under load that takes longer than a few seconds.
  let back = false;
  for (let i = 0; i < 30 && !back; i++) { await pg.waitForTimeout(1000); back = viewOf(await cfgOf(dash.url)) === before; }
  await check('Zeitreise: HA hat wieder die alte Reihenfolge', back);
} catch (e) {
  await check('Ablauf ohne Abbruch', false, String(e && e.message || e).split('\n')[0]);
}
await finish();
