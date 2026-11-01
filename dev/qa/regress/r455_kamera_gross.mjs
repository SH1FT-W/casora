// @zustand: arbeit
// @parallel: allein
// Owner wish 01.11.2026 (popup v3, image stage S5): the camera picture stands free on the stage (no stage plate
// around it), and tapping it makes it big over the popup (top layer, dark backdrop, live view keeps running); the
// minimize key (× top right), Esc and the back gesture return to the preview in the popup, which stays open.
// Expected (desktop and phone, Theme Casora, light and dark): stage s5 without background/padding; picture → .big
// with a visible „Verkleinern“ key; key / Esc / history back → preview again, popup still open.
// CASORA_SHOTS=<dir>: also writes one picture of the popup per view (before/after comparisons).
// Builds the dashboard qa-kamera-gross with the test camera and removes it again.
import { open, usePage, casoraDashboard, dashboard, cards, check, need, finish, atFinish } from './lib.mjs';
import fs from 'node:fs';
import { ws } from '../ws.mjs';

const URL_PATH = 'qa-kamera-gross';
const SHOTS = process.env.CASORA_SHOTS || '';
const c0 = await ws();
const st = await c0.cmd({ type: 'get_states' });
const CAM = ['camera.testkamera', 'camera.testkamera_garten', 'camera.testdrucker_kamera']
  .find((id) => st.some((s) => s.entity_id === id && s.state !== 'unavailable'));
await need('Testkamera', CAM);
const src = await casoraDashboard();
await need('Casora-Dashboard als Vorlage', src);
const roomView = src.config.views.find((v, i) => i > 0 && ((v.cards || [])[0] || {}).template === 'casora_room');
await need('Raumansicht', roomView);
const cfg = JSON.parse(JSON.stringify(src.config));
const view = JSON.parse(JSON.stringify(roomView));
view.cards[2].cards = [{ type: 'custom:button-card', template: 'casora_camera', entity: CAM, name: 'QA Kamera' }];
view.path = 'raum';
cfg.views = [view];
// The templates of this checkout (the stored dashboard may still carry older ones).
Object.assign(cfg.button_card_templates || (cfg.button_card_templates = {}),
  JSON.parse(fs.readFileSync(new URL('../../../custom_components/casora/panel/casora-templates.json', import.meta.url), 'utf8')).templates);
const dl = await c0.cmd({ type: 'lovelace/dashboards/list' });
for (const d of dl) if (d.url_path === URL_PATH) await c0.cmd({ type: 'lovelace/dashboards/delete', dashboard_id: d.id });
await c0.cmd({ type: 'lovelace/dashboards/create', url_path: URL_PATH, title: 'QA Kamera groß', mode: 'storage', require_admin: false, show_in_sidebar: false });
await c0.cmd({ type: 'lovelace/config/save', url_path: URL_PATH, config: cfg });
atFinish(async () => {
  for (const d of await c0.cmd({ type: 'lovelace/dashboards/list' })) if (d.url_path === URL_PATH) await c0.cmd({ type: 'lovelace/dashboards/delete', dashboard_id: d.id });
  c0.close();
});

const zoomEl = `(() => (window.__pierce('.hui-st-img[data-casora-zoom]') || []).find((e) => e.getBoundingClientRect().width > 0) || null)()`;
const zxEl = `(() => { const z = ${zoomEl}; return z && z.querySelector('.hui-st-zx'); })()`;
const info = (page) => page.evaluate((z) => {
  const el = eval(z);
  const stg = el && el.closest('.hui-stage');
  const cs = stg && getComputedStyle(stg);
  const zx = el && el.querySelector('.hui-st-zx');
  const pop = window.__pierce('casora-popup').find((p) => p.hasAttribute('open'));
  const r = el && el.getBoundingClientRect();
  return { found: !!el, bg: cs && cs.backgroundColor, pad: cs && cs.paddingTop, big: !!(el && el.classList.contains('big')),
    zx: !!(zx && zx.getBoundingClientRect().width > 0), w: r && Math.round(r.width), vw: innerWidth, popup: !!pop,
    pic: !!(el && el.querySelector('video, img, canvas, ha-camera-stream, ha-hls-player, ha-web-rtc-player, hui-image, hui-picture-entity-card, hui-picture-glance-card')) && !(el && el.querySelector('.casora-cam-offline')),
    label: el && el.getAttribute('aria-label'), role: el && el.getAttribute('role') };
}, zoomEl);
let touch = false;
const clickAt = async (page, sel) => {
  const r = await page.evaluate((s) => { const e = eval(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, sel);
  // Phone: a real finger tap (HA's actionHandler cancels touchend there, so no click follows).
  if (r) { if (touch) await page.touchscreen.tap(r.x, r.y); else await page.mouse.click(r.x, r.y); }
  return !!r;
};

for (const [vn, o] of [['desktop-hell', { dark: false }], ['desktop-dunkel', { dark: true }],
  ['handy-hell', { dark: false, mobile: true, width: 390, height: 844 }], ['handy-dunkel', { dark: true, mobile: true, width: 390, height: 844 }]]) {
  const { page } = await open(o);
  touch = !!o.mobile;
  usePage(page);
  await dashboard(page, URL_PATH + '/raum', 2);
  const tile = (await cards(page, 'casora_camera'))[0];
  await need(vn + ': Kamera-Kachel', tile);
  await page.mouse.click(tile.x + tile.w / 2, tile.y + tile.h / 2);
  await page.waitForFunction((z) => !!eval(z), zoomEl, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const a = await info(page);
  await check(vn + ': Bildbühne vorhanden', a.found, a);
  await check(vn + ': Bildbühne ohne Platte (kein Hintergrund, kein Innenabstand)', a.found && /rgba\(0, 0, 0, 0\)|transparent/.test(a.bg) && a.pad === '0px', a);
  await check(vn + ': Bild ist ein Knopf „Vergrößern“', a.role === 'button' && /Vergrößern|Enlarge/.test(a.label || ''), a);
  await check(vn + ': Verkleinern-Knopf in der Vorschau versteckt', !a.zx, a);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${vn}.png` });
  if (!a.pic) { await check(vn + ': Kamera liefert ein Bild (für das große Bild)', false, a); await page.context().browser().close(); continue; }
  // Tap → big.
  await clickAt(page, zoomEl);
  await page.waitForTimeout(700);
  const b = await info(page);
  await check(vn + ': Antippen → großes Bild mit Verkleinern-Knopf', b.big && b.zx && b.w >= b.vw - 2, b);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${vn}-gross.png` });
  // Minimize key → preview, popup stays.
  await clickAt(page, zxEl);
  await page.waitForTimeout(700);
  const c = await info(page);
  await check(vn + ': Verkleinern → Vorschau im Popup, Popup offen', !c.big && c.popup && !c.zx, c);
  // Esc closes the big view first, not the popup.
  await clickAt(page, zoomEl); await page.waitForTimeout(700);
  await page.keyboard.press('Escape'); await page.waitForTimeout(700);
  const d = await info(page);
  await check(vn + ': Esc schließt nur das große Bild', !d.big && d.popup, d);
  // Back gesture closes the big view first.
  await clickAt(page, zoomEl); await page.waitForTimeout(700);
  await page.goBack().catch(() => {}); await page.waitForTimeout(900);
  const e = await info(page);
  await check(vn + ': Zurück schließt nur das große Bild', !e.big && e.popup, e);
  await page.context().browser().close();
}
await finish();
