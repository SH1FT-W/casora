// @zustand: arbeit
// @parallel: allein
// Neues Studio (B, ab 1.1.0 Standard): Änderungen in der Vorschau landen wirklich im Dashboard.
// Erwartet: Ohne eigene Wahl im Browser startet das neue Studio. Desktop (Chromium): Badge per
// Alt+Pfeil verschieben und eine Kachel über ihren Zeilen-Schalter ausschalten, ⌘S sichert; nach
// neuem Laden stehen Reihenfolge und Platzhalter wieder so da. Handy (WebKit): Kachel unter
// „Inhalt“ ausschalten, „Fertig“ sichert ins Dashboard (Konfiguration in HA geprüft).
// Schreibt ins Prüf-Dashboard (qa-arbeit bzw. das erste Casora-Dashboard) – nur im Test-HA; am Ende
// wird der vorherige Stand beider Dashboards zurückgeschrieben.
import { open, studio, casoraDashboard, check, need, finish, usePage } from './lib.mjs';
import { ws } from '../ws.mjs';

const dash = await casoraDashboard();
await need('Casora-Dashboard', dash);

const offCount = async () => {
  // Desktop- und Handy-Dashboard zusammen: das Handy-Studio kann beide schreiben.
  const c = await ws();
  let n = 0;
  for (const url of [dash.url, dash.phone && dash.phone.url].filter(Boolean)) {
    const cfg = await c.cmd({ type: 'lovelace/config', url_path: url });
    n += (JSON.stringify(cfg).match(/"enabled":\s*false/g) || []).length;
  }
  c.close();
  return n;
};
// Vorher-Stand merken und am Ende (auch bei Fehlern) zurückschreiben.
const URLS = [dash.url, dash.phone && dash.phone.url].filter(Boolean);
const saved0 = {};
{ const c = await ws(); for (const u of URLS) saved0[u] = await c.cmd({ type: 'lovelace/config', url_path: u }); c.close(); }
const restore = async () => { const c = await ws();
  for (const u of URLS) await c.cmd({ type: 'lovelace/config/save', url_path: u, config: saved0[u] }); c.close(); };
const needR = async (label, ok, info) => { if (!ok) await restore(); return need(label, ok, info); };

const order = (H) => H(() => { const p = window.__panel();
  return p._bVisibleBadges().map((e) => String(e.dataset.mk).replace(/^b:/, '').split(':')[0]).filter((v, k, a) => a.indexOf(v) === k); });

// ── Desktop, Chromium ──
let o = await open({ width: 1440, height: 900, dark: false });
usePage(o.page);
await studio(o.page, dash.url);
let H = (fn, a) => o.page.evaluate(fn, a);
const std = await H(() => ({ key: localStorage.getItem('casora.studio.b'), b: window.__panel().classList.contains('bmode') }));
await check('Standard: neues Studio ohne eigene Wahl im Browser', std.key === null && std.b, std);

// Raum mit drei Badges und zwei sichtbaren Kacheln
const room = await H(async () => {
  const p = window.__panel(), I = window.__casoraPanelInternals;
  const rooms = p._state.compact.rooms;
  for (let i = 0; i < rooms.length; i++) {
    if (I.isHomeRoom(rooms[i], rooms)) continue;
    if ((rooms[i].tiles || []).filter((t) => (t.variables || {}).enabled !== false).length < 2) continue;
    p._room = i; p._sel = null; p._bClose(); p._renderTabs(); p._syncPreview();
    await new Promise((r) => setTimeout(r, 900));
    const ids = p._bVisibleBadges().map((e) => String(e.dataset.mk).replace(/^b:/, '').split(':')[0]).filter((v, k, a) => a.indexOf(v) === k);
    if (ids.length >= 3) return { i, path: rooms[i].path, ids };
  }
  return null;
});
await needR('Raum mit drei Badges und zwei Kacheln', room);

await H(() => window.__panel()._bVisibleBadges()[0].focus());
await o.page.keyboard.press('Alt+ArrowRight');
await o.page.waitForTimeout(1200);
const moved = await order(H);
await check('Alt+Pfeil verschiebt das Badge', moved.join() !== room.ids.join(), { vorher: room.ids, nachher: moved });

// Kachel über den Zeilen-Schalter in „Inhalt“ ausschalten
await H(async () => { const p = window.__panel(); p._sel = null; p._bOpen = true; p._stackOpenReq = 'tiles'; p._renderForm();
  await new Promise((r) => setTimeout(r, 1200));
  const t = [...p.shadowRoot.querySelectorAll('#pane #band-tiles .tile > .thead .sw')]
    .filter((x) => x.getClientRects().length && x.getAttribute('aria-checked') === 'true');
  if (t[0]) t[0].setAttribute('data-qa', 'kschalter'); });
// Kachel-Schlüssel entstehen beim Laden neu – verglichen wird über den Namen.
const hid0 = await H(() => window.__panel()._bHidden().tiles.filter((x) => x.why === 'Hidden').map((x) => x.label));
await o.page.locator('[data-qa=kschalter]').click();
await o.page.waitForTimeout(1200);
const hid1 = await H(() => window.__panel()._bHidden().tiles.filter((x) => x.why === 'Hidden').map((x) => x.label));
const offKey = hid1.find((k) => !hid0.includes(k));
await check('Schalter blendet die Kachel aus', !!offKey, { hid0, hid1 });

const dirty = await H(() => window.__panel()._isDirty());
await check('Änderungen sind ungespeichert markiert', dirty);
await H(() => { const p = window.__panel(); p._bClose(); document.body.focus(); });
await o.page.keyboard.press('Meta+s');
const saved = await o.page.waitForFunction(() => !window.__panel()._isDirty() && !window.__panel()._saving, null, { timeout: 30000 })
  .then(() => true).catch(() => false);
await check('⌘S sichert (nichts mehr ungespeichert)', saved);
await o.browser.close();

// Neu laden: alles noch da?
o = await open({ width: 1440, height: 900, dark: false });
usePage(o.page);
await studio(o.page, dash.url);
H = (fn, a) => o.page.evaluate(fn, a);
const back = await H(async (path) => { const p = window.__panel(); const rooms = p._state.compact.rooms;
  p._room = rooms.findIndex((r) => r.path === path); p._sel = null; p._bClose(); p._renderTabs(); p._syncPreview();
  await new Promise((r) => setTimeout(r, 1200));
  return { room: p._room, hidden: p._bHidden().tiles.filter((x) => x.why === 'Hidden').map((x) => x.label),
    ghosts: p.shadowRoot.querySelectorAll('.card.map .mtile.bghost').length }; }, room.path);
const after = await order(H);
await check('Nach neuem Laden: Badge-Reihenfolge gespeichert', after.join() === moved.join(), { moved, after });
await check('Nach neuem Laden: Kachel bleibt aus, Platzhalter in der Vorschau', back.hidden.includes(offKey) && back.ghosts >= 1, { back, offKey });
await o.browser.close();

// ── Handy, WebKit: Kachel ausschalten, „Fertig“ ──
const n0 = await offCount();
o = await open({ width: 393, height: 852, mobile: true, scale: 3, dark: false, safari: true });
usePage(o.page);
await studio(o.page, dash.url);
H = (fn, a) => o.page.evaluate(fn, a);
await H(() => window.__panel()._bClose());
await o.page.waitForTimeout(1500);
const ph = await H(async (path) => { const p = window.__panel(); const rooms = p._state.compact.rooms;
  p._room = rooms.findIndex((r) => r.path === path); p._renderTabs(); p._syncPreview();
  await new Promise((r) => setTimeout(r, 900));
  return { phone: p.classList.contains('phone'), b: p.classList.contains('bmode') }; }, room.path);
await check('WebKit Handy: neues Studio als Standard', ph.phone && ph.b, ph);
await o.page.locator('.bbar [data-b=list]').tap();
await o.page.waitForTimeout(1300);
// Am Handy ist „Inhalt“ eine Liste zum Hineintippen: „Kacheln“ öffnen.
const row = await H(() => { const p = window.__panel();
  const e = [...p.shadowRoot.querySelectorAll('.inspector *')].find((x) => x.getClientRects().length && x.children.length === 0
    && /^(Kacheln|Tiles)$/.test(x.textContent.trim()) && !x.closest('.segopt'));
  if (e) e.setAttribute('data-qa', 'kacheln'); return !!e; });
await needR('WebKit Handy: Zeile „Kacheln“ in Inhalt', row);
await o.page.locator('[data-qa=kacheln]').tap();
await o.page.waitForTimeout(1300);
const sw2 = await H(() => { const p = window.__panel();
  const t = [...p.shadowRoot.querySelectorAll('#pane .sw[role=switch]')]
    .filter((x) => x.getClientRects().length && x.getAttribute('aria-checked') === 'true' && x.closest('.thead'));
  if (t[0]) { t[0].scrollIntoView({ block: 'center' }); t[0].setAttribute('data-qa', 'kschalter2'); }
  return { n: t.length, all: [...p.shadowRoot.querySelectorAll('#pane .sw')].filter((x) => x.getClientRects().length).length }; });
await needR('WebKit Handy: Kachel-Schalter im Blatt', sw2.n > 0, sw2);
const hp0 = await H(() => window.__panel()._bHidden().tiles.filter((x) => x.why === 'Hidden').length);
await o.page.locator('[data-qa=kschalter2]').tap();
await o.page.waitForTimeout(1200);
const hp1 = await H(() => window.__panel()._bHidden().tiles.filter((x) => x.why === 'Hidden').length);
await check('WebKit Handy: Schalter im Blatt blendet eine Kachel aus', hp1 === hp0 + 1, { hp0, hp1 });
await o.page.locator('.bclose').tap();
await o.page.waitForTimeout(900);
const done = o.page.locator('#donebtn');
await needR('„Fertig“ sichtbar', await done.isVisible().catch(() => false));
await done.tap();
await o.page.waitForFunction(() => { const p = window.__panel && window.__panel(); return !p || !p._isDirty || !p._isDirty(); }, null, { timeout: 30000 }).catch(() => {});
await o.page.waitForTimeout(3000);
const n1 = await offCount();
// Handy-Ansicht und Desktop teilen den Schalter: je Dashboard eine ausgeschaltete Kachel mehr.
await check('WebKit Handy: „Fertig“ sichert die ausgeschaltete Kachel ins Dashboard', n1 > n0, { n0, n1 });
await restore();
const back0 = await offCount();
await check('Vorher-Stand wiederhergestellt', back0 === n0 || back0 < n1, { n0, back0 });
await finish();
