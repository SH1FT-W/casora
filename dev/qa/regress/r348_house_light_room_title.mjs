// @zustand: arbeit
// @parallel: ui
// @deckt: dashboards/casora/button_card_templates.json custom_components/casora/scripts/local/03-popups.js
// House lights popup (tile "Beleuchtung" on Home): the header says "Beleuchtung"; #73 had put the chosen room's name
// there and it flipped back on every light change (reverted 26.10.2026). Popup v3 (§4.4): a room is a sub page with ‹,
// label „Beleuchtung“, title the room. Expected: "Beleuchtung" first, the room's page keeps its title when a light
// switches, ‹ brings "Beleuchtung" back.
import { open, casoraDashboards, dashboard, check, need, finish, usePage } from './lib.mjs';

const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && d.url === 'qa-arbeit') || all.find((d) => !d.mobile);
await need('ein Casora-Dashboard', desk, all.map((d) => d.url));
const { page } = await open({ width: 1440, height: 900, theme: 'Casora' });
usePage(page);
await dashboard(page, desk.url);
await page.waitForTimeout(1500);
const tile = await page.evaluate(() => {
  const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).some((t) => /^casora_light/.test(t))
    && x.getBoundingClientRect().width > 200 && /^light\./.test((x._config || {}).entity || ''));
  if (!b) return null;
  b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await need('Kachel Beleuchtung', tile);
await page.mouse.click(tile.x, tile.y);
// v3 (§4.4): the rooms are rows on the right; tapping one opens its sub page in the same popup (‹, label
// „Beleuchtung“ over the room's name). The header must stay put while lights change.
const rows = async () => page.evaluate(() => { const s = window.casoraPopup && window.casoraPopup.surface; if (!s) return [];
  return window.__pierce('.lps-row', s).filter((r) => /"a":"room"/.test(r.getAttribute('data-lps-tap') || '') && r.getBoundingClientRect().width > 20)
    .map((r) => { const t = r.querySelector('.lps-tx') || r, b = t.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, name: ((r.querySelector('.lps-tx b') || {}).textContent || '').trim() }; }); });
let C = [];
for (let i = 0; i < 30 && C.length < 2; i++) { await page.waitForTimeout(250); C = await rows(); }
await need('Raum-Zeilen im Popup', C.length >= 2, C);
const head = () => page.evaluate(() => { const e = window.casoraPopup.element; if (!e) return null;
  const eb = e.shadowRoot && e.shadowRoot.querySelector('.header-eyebrow');
  return { title: e._headerTitle ? e._headerTitle.textContent.trim() : null, back: !!(e._headerBack && !e._headerBack.hidden),
    eyebrow: eb && eb.getBoundingClientRect().height > 0 ? eb.textContent.trim() : '' }; });
let h = await head();
await check('zuerst „Beleuchtung“ ohne ‹', h && h.title === 'Beleuchtung' && !h.back, h);
const room = C[0];
await page.waitForTimeout(700);   // taps right after opening are swallowed (ghost taps)
await page.mouse.click(room.x, room.y);
for (let i = 0; i < 20 && !((h = await head()) && h.back); i++) await page.waitForTimeout(200);
await check('Raum gewählt → Unterseite „' + room.name + '“ mit ‹ und Etikett „Beleuchtung“', h && h.back && h.title === room.name && /^Beleuchtung$/i.test(h.eyebrow), { h, room: room.name });
// A light switched while the room's page is open re-draws the content: the header must stay (26.10.2026).
await page.evaluate(() => { const h = document.querySelector('home-assistant').hass; const g = Object.keys(h.states).find((e) => e.startsWith('light.') && Array.isArray(h.states[e].attributes.entity_id)); const id = g ? h.states[g].attributes.entity_id[0] : Object.keys(h.states).find((e) => e.startsWith('light.')); if (id) h.callService('light', 'toggle', { entity_id: id }); });
await page.waitForTimeout(1500);
const h1b = await head();
await check('nach Schalten eines Lichts weiter „' + room.name + '“', h1b && h1b.back && h1b.title === room.name, { h1b, room: room.name });
await page.evaluate(() => window.casoraPopup.element._headerBack.click());
for (let i = 0; i < 20 && (h = await head()) && h.back; i++) await page.waitForTimeout(200);
await check('‹ → wieder „Beleuchtung“', h && h.title === 'Beleuchtung' && !h.back, h);
await finish();
