// @zustand: arbeit
// @parallel: allein
// @deckt: custom_components/casora/scripts/local/02-devices.js
// Wish 02.11.2026 (26.11.5, iPhone + desktop): in the robot vacuum popup the map is small (16:10 plate) and its rooms
// and paths are hard to read; tapping it should make it big like the camera picture (S5 big view of the core).
// Expected (desktop and phone, Theme Casora, light and dark): the map is a „Vergrößern“ key; tap → the map box goes big
// (top layer, full window) with the map image inside, fitted without distortion, and a visible „Verkleinern“ key; a new
// map picture (entity_picture changes) is swapped in while big and the big view stays open; the minimize key and Esc
// each return to the map in the popup, which stays open.
// CASORA_SHOTS=<dir>: also writes one picture per view (popup and big view).
// Builds the dashboard qa-karte-gross with the test vacuum and removes it again.
import { open, usePage, casoraDashboard, dashboard, cards, check, need, finish, atFinish } from './lib.mjs';
import fs from 'node:fs';
import { ws } from '../ws.mjs';

const URL_PATH = 'qa-karte-gross';
const SHOTS = process.env.CASORA_SHOTS || '';
const c0 = await ws();
const st = await c0.cmd({ type: 'get_states' });
const VAC = st.map((s) => s.entity_id).find((id) => id === 'vacuum.testsauger');
const MAP = st.find((s) => s.entity_id === 'image.testsauger_map');
await need('Testsauger mit Kartenbild', VAC && MAP && MAP.attributes.entity_picture);
const src = await casoraDashboard();
await need('Casora-Dashboard als Vorlage', src);
const roomView = src.config.views.find((v, i) => i > 0 && ((v.cards || [])[0] || {}).template === 'casora_room');
await need('Raumansicht', roomView);
const cfg = JSON.parse(JSON.stringify(src.config));
const view = JSON.parse(JSON.stringify(roomView));
view.cards[2].cards = [{ type: 'custom:button-card', template: 'casora_vacuum', entity: VAC, name: 'QA Sauger', variables: { entity_map: MAP.entity_id } }];
view.path = 'raum';
cfg.views = [view];
// The templates of this checkout (the stored dashboard may still carry older ones).
Object.assign(cfg.button_card_templates || (cfg.button_card_templates = {}),
  JSON.parse(fs.readFileSync(new URL('../../../custom_components/casora/panel/casora-templates.json', import.meta.url), 'utf8')).templates);
const dl = await c0.cmd({ type: 'lovelace/dashboards/list' });
for (const d of dl) if (d.url_path === URL_PATH) await c0.cmd({ type: 'lovelace/dashboards/delete', dashboard_id: d.id });
await c0.cmd({ type: 'lovelace/dashboards/create', url_path: URL_PATH, title: 'QA Karte groß', mode: 'storage', require_admin: false, show_in_sidebar: false });
await c0.cmd({ type: 'lovelace/config/save', url_path: URL_PATH, config: cfg });
atFinish(async () => {
  for (const d of await c0.cmd({ type: 'lovelace/dashboards/list' })) if (d.url_path === URL_PATH) await c0.cmd({ type: 'lovelace/dashboards/delete', dashboard_id: d.id });
  c0.close();
});

const zoomEl = `(() => (window.__pierce('.cv-map[data-casora-zoom]') || []).find((e) => e.getBoundingClientRect().width > 0) || null)()`;
const zxEl = `(() => { const z = ${zoomEl}; return z && z.querySelector('.hui-st-zx'); })()`;
const info = (page) => page.evaluate((z) => {
  const el = eval(z);
  const zx = el && el.querySelector('.hui-st-zx');
  const pop = window.__pierce('casora-popup').find((p) => p.hasAttribute('open'));
  const r = el && el.getBoundingClientRect();
  const imgs = el ? [...el.querySelectorAll('img[data-map]:not([data-old])')] : [];
  const i = imgs[imgs.length - 1];
  const ir = i && i.getBoundingClientRect();
  return { found: !!el, big: !!(el && el.classList.contains('big')), w: r && Math.round(r.width), h: r && Math.round(r.height),
    vw: innerWidth, vh: innerHeight, popup: !!pop, zx: !!(zx && zx.getBoundingClientRect().width > 0),
    img: !!(i && i.complete && i.naturalWidth > 0 && ir.width > 0 && getComputedStyle(i).opacity === '1'),
    src: i && i.getAttribute('src'), ratio: i && ir && i.naturalWidth ? (ir.width / ir.height) / (i.naturalWidth / i.naturalHeight) : 0,
    imgW: ir && Math.round(ir.width), label: el && el.getAttribute('aria-label'), role: el && el.getAttribute('role') };
}, zoomEl);
let touch = false;
const clickAt = async (page, sel) => {
  const r = await page.evaluate((s) => { const e = eval(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, sel);
  if (r) { if (touch) await page.touchscreen.tap(r.x, r.y); else await page.mouse.click(r.x, r.y); }
  return !!r;
};
// A new map picture while big: hand the card a hass whose map entity carries another picture URL.
const newPicture = (page) => page.evaluate((z) => {
  const el = eval(z);
  const card = el && el.getRootNode().host;
  const h = card && (card._hass || card.hass);
  if (!h) return null;
  const id = el.querySelector('img[data-map]').getAttribute('data-map'), s0 = h.states[id];
  const url = s0.attributes.entity_picture + '&qa=1';
  card.hass = Object.assign({}, h, { states: Object.assign({}, h.states, { [id]: Object.assign({}, s0, { attributes: Object.assign({}, s0.attributes, { entity_picture: url }) }) }) });
  return url;
}, zoomEl);

for (const [vn, o] of [['desktop-hell', { dark: false }], ['desktop-dunkel', { dark: true }],
  ['handy-hell', { dark: false, mobile: true, width: 390, height: 844 }], ['handy-dunkel', { dark: true, mobile: true, width: 390, height: 844 }]]) {
  const { page } = await open(o);
  touch = !!o.mobile;
  usePage(page);
  await dashboard(page, URL_PATH + '/raum', 2);
  const tile = (await cards(page, 'casora_vacuum'))[0];
  await need(vn + ': Saugroboter-Kachel', tile);
  await page.mouse.click(tile.x + tile.w / 2, tile.y + tile.h / 2);
  await page.waitForFunction((z) => { const e = eval(z); const i = e && e.querySelector('img[data-map]'); return i && i.complete && i.naturalWidth > 0; }, zoomEl, { timeout: 30000 }).catch(() => {});
  await page.evaluate((z) => { const e = eval(z); if (e) e.scrollIntoView({ block: 'center' }); }, zoomEl).catch(() => {});
  await page.waitForTimeout(1500);
  const a = await info(page);
  await check(vn + ': Karte im Popup', a.found && a.img, a);
  await check(vn + ': Karte ist ein Knopf „Vergrößern“', a.role === 'button' && /Vergrößern|Enlarge/.test(a.label || ''), a);
  await check(vn + ': Verkleinern-Knopf in der Vorschau versteckt', !a.zx, a);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${vn}.png` });
  if (!a.found) { await page.context().browser().close(); continue; }
  // Tap → big.
  await clickAt(page, zoomEl);
  await page.waitForTimeout(800);
  const b = await info(page);
  await check(vn + ': Antippen → große Karte über das ganze Fenster mit Verkleinern-Knopf', b.big && b.zx && b.w >= b.vw - 2 && b.h >= b.vh - 2, b);
  await check(vn + ': große Karte zeigt das Kartenbild, unverzerrt und größer als vorher', b.img && Math.abs(b.ratio - 1) < 0.02 && b.imgW > a.imgW, { a, b });
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${vn}-gross.png` });
  // New map picture while big: swapped in, big view stays.
  const url = await newPicture(page);
  await page.waitForFunction((u) => (window.__pierce('.cv-map.big img[data-map]') || []).some((i) => i.getAttribute('src') === u && getComputedStyle(i).opacity === '1'), url, { timeout: 10000 }).catch(() => {});
  const n = await info(page);
  await check(vn + ': neues Kartenbild erscheint im großen Bild, das offen bleibt', url && n.big && n.src === url && n.img && n.zx, { url, n });
  // Minimize key → preview, popup stays.
  await clickAt(page, zxEl);
  await page.waitForTimeout(800);
  const c = await info(page);
  await check(vn + ': Verkleinern → Karte im Popup, Popup offen', c.found && !c.big && c.popup && !c.zx, c);
  // Esc closes the big view first, not the popup.
  await clickAt(page, zoomEl); await page.waitForTimeout(800);
  const d0 = await info(page);
  await page.keyboard.press('Escape'); await page.waitForTimeout(800);
  const d = await info(page);
  await check(vn + ': Esc schließt nur die große Karte', d0.big && !d.big && d.popup, { d0, d });
  await page.context().browser().close();
}
await finish();
