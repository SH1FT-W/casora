// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/filter-overlay.js
// Gemeldet (Abdeckung 1.3, AB-14, Handy Casora-Look): Raumseite gescrollt (Mini-Kopf „Büro · 23° · Licht aus“)
// – die Kapsel Glocke/Assist/⋯ lag darüber, „Licht aus“ lief unter die Glocke.
// Ursache: Der Startseiten-Kopf wird beim Laden teils zweimal gebaut (WebKit). _pinChromePill hängte die
// Kapsel in den neuen Halter, merkte sich aber den alten; die Raumseite blendete den alten (abgehängten)
// Halter aus, der sichtbare blieb stehen.
// Erwartet: Raumseite offen → Kapsel unsichtbar und nicht antippbar (kein Überlappen mit dem Mini-Kopf);
// Raumseite zu → Kapsel wieder da.
// 1.3 (Handy-Leiste B, Casora-Look): die Kapsel sitzt unten in der Navigationsleiste (.hmn-dock) – dort
// bleibt sie auf der Raumseite sichtbar und bedienbar, überlappt den Mini-Kopf oben aber nie.
process.env.CASORA_THEME = process.env.CASORA_THEME || 'Casora';
import { open, casoraDashboard, dashboard, check, need, finish } from './lib.mjs';

// qa-arbeit (viele Räume mit Inhalt, Kopf wird dort zweimal gebaut) bevorzugt, sonst das erste Paar.
const d = (await casoraDashboard((x) => x.url === 'qa-arbeit')) || (await casoraDashboard());
await need('Casora-Dashboard mit Handy-Gegenstück', d && d.phone, d && d.url);
const { page } = await open({ width: 393, height: 852, mobile: true, touch: true, safari: true, scale: 2, dark: false, theme: 'Casora' });
await dashboard(page, d.phone.url, 3);
await page.waitForFunction(() => !!window._casoraFilter, null, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(2500);
const keys = await page.evaluate(() => { const n = window.__pierce('*').find((e) => e._rooms && typeof e._set === 'function' && e._bar);
  return n ? n._rooms.map((r) => r.key).filter((k) => /^room_/.test(k) && k !== 'room_scenes') : []; });
await need('Raum in der Raumleiste', keys.length, keys);
// Kapsel = fester Halter mit der casora_mobile_chrome-Karte; Mini-Kopf = .casora-head-pill.
const probe = () => page.evaluate(() => {
  const host = window.__pierce('button-card').map((b) => b.parentNode).find((p) => p && p.style && p.style.position === 'fixed' && p.style.zIndex === '113');
  const pill = window.__pierce('.casora-head-pill').find((p) => p.isConnected && getComputedStyle(p).opacity > 0.5);
  const r = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom }; };
  return { host: host ? { op: Number(getComputedStyle(host).opacity), pe: getComputedStyle(host).pointerEvents,
    docked: !!(host.parentNode && host.parentNode.classList && host.parentNode.classList.contains('hmn-dock')), vh: innerHeight, ...r(host) } : null,
    pill: pill ? { text: pill.textContent.trim(), ...r(pill) } : null };
});
const before = await probe();
await need('Kapsel auf der Startseite sichtbar', before.host && before.host.op > 0.9, before);
// Ersten Raum mit genug Inhalt zum Scrollen nehmen (Mini-Kopf erscheint erst gescrollt).
let room = null;
for (const key of keys.slice(0, 8)) {
  await page.evaluate((k) => window._casoraFilter.set(k), key);
  await page.waitForTimeout(3000);
  const can = await page.evaluate((k) => { const o = window.__pierce('casora-filter-overlay').find((x) => x._config && x._config.filter_category === k && x._showing);
    if (!o || !o._overlayEl) return false; o._overlayEl.scrollTop = 900; return o._overlayEl.scrollTop > 150; }, key);
  await page.waitForTimeout(1500);
  room = { key, ...(await probe()) };
  if (can && room.pill) break;
}
await need('Raumseite offen', room, keys);
if (room.pill) {
  const over = room.host && room.host.op > 0.05 && room.host.l < room.pill.r && room.pill.l < room.host.r && room.host.t < room.pill.b && room.pill.t < room.host.b;
  await check('Kapsel liegt nicht sichtbar über dem Mini-Kopf', !over, room);
}
if (room.host && room.host.docked) {
  await check('Kapsel in der unteren Leiste: auf der Raumseite sichtbar und bedienbar', room.host.op > 0.9 && room.host.pe !== 'none' && room.host.t > room.host.vh / 2, room.host);
} else {
  await check('Kapsel auf der Raumseite nicht antippbar', !room.host || room.host.pe === 'none' || room.host.op < 0.05, room.host);
}
await page.evaluate(() => window._casoraFilter.set('all'));
await page.waitForTimeout(2500);
const back = await probe();
await check('Kapsel nach dem Schließen der Raumseite wieder da', back.host && back.host.op > 0.9 && back.host.pe !== 'none', back.host);
await finish();
