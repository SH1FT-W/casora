// @zustand: arbeit
// @parallel: allein
// @deckt: custom_components/casora/scripts/local/07-weich-spezial.js
// Reported 02.11.2026 (26.11.5, iPhone, issue #112): cameras popup (Sicherheit → Kameras), single camera view: the
// back chip „‹ Alle Kameras“ at the top is clipped, the pill is not fully visible.
// Expected (phone Chromium + WebKit, desktop; Theme Casora): in the single camera view the chip's bounding box lies
// fully inside every ancestor that clips (overflow other than visible, across shadow roots) and inside the viewport.
// CASORA_SHOTS=<dir>: also writes one picture of the single camera view per run.
// Builds the dashboard qa-kamera-zurueck with a cameras tile (two test cameras) and removes it again.
import { open, usePage, casoraDashboard, dashboard, cards, check, need, finish, atFinish } from './lib.mjs';
import fs from 'node:fs';
import { ws } from '../ws.mjs';

const URL_PATH = 'qa-kamera-zurueck';
const SHOTS = process.env.CASORA_SHOTS || '';
const c0 = await ws();
const st = await c0.cmd({ type: 'get_states' });
const CAMS = st.map((s) => s.entity_id).filter((id) => /^camera\./.test(id) && !/karte|map/.test(id)).sort().slice(0, 2);
await need('zwei Testkameras', CAMS.length === 2, CAMS);
const src = await casoraDashboard();
await need('Casora-Dashboard als Vorlage', src);
const roomView = src.config.views.find((v, i) => i > 0 && ((v.cards || [])[0] || {}).template === 'casora_room');
await need('Raumansicht', roomView);
const cfg = JSON.parse(JSON.stringify(src.config));
const view = JSON.parse(JSON.stringify(roomView));
view.cards[2].cards = [{ type: 'custom:button-card', template: 'casora_cameras', entity: CAMS[0], name: 'QA Kameras', variables: { cameras: CAMS } }];
view.path = 'raum';
cfg.views = [view];
// The templates of this checkout (the stored dashboard may still carry older ones).
Object.assign(cfg.button_card_templates || (cfg.button_card_templates = {}),
  JSON.parse(fs.readFileSync(new URL('../../../custom_components/casora/panel/casora-templates.json', import.meta.url), 'utf8')).templates);
const dl = await c0.cmd({ type: 'lovelace/dashboards/list' });
for (const d of dl) if (d.url_path === URL_PATH) await c0.cmd({ type: 'lovelace/dashboards/delete', dashboard_id: d.id });
await c0.cmd({ type: 'lovelace/dashboards/create', url_path: URL_PATH, title: 'QA Kamera zurück', mode: 'storage', require_admin: false, show_in_sidebar: false });
await c0.cmd({ type: 'lovelace/config/save', url_path: URL_PATH, config: cfg });
atFinish(async () => {
  for (const d of await c0.cmd({ type: 'lovelace/dashboards/list' })) if (d.url_path === URL_PATH) await c0.cmd({ type: 'lovelace/dashboards/delete', dashboard_id: d.id });
  c0.close();
});

// The visible chip and every clipping ancestor (composed tree) that cuts into its box.
const measure = (page) => page.evaluate(() => {
  const chip = (window.__pierce('.cam-back') || []).find((e) => e.getBoundingClientRect().width > 0);
  if (!chip) return { found: false };
  const r = chip.getBoundingClientRect();
  const box = { l: Math.round(r.left * 10) / 10, t: Math.round(r.top * 10) / 10, r: Math.round(r.right * 10) / 10, b: Math.round(r.bottom * 10) / 10 };
  const cut = [];
  const up = (n) => n.assignedSlot || n.parentElement || (n.getRootNode && n.getRootNode().host) || null;
  for (let n = up(chip); n && n.nodeType === 1; n = up(n)) {
    const cs = getComputedStyle(n);
    const clips = cs.overflowX !== 'visible' || cs.overflowY !== 'visible' || (cs.clipPath && cs.clipPath !== 'none') || /paint|strict|content/.test(cs.contain || '');
    if (!clips) continue;
    // Clipping happens at the padding box: border box minus the borders.
    const a = n.getBoundingClientRect();
    const p = { l: a.left + parseFloat(cs.borderLeftWidth), t: a.top + parseFloat(cs.borderTopWidth),
      r: a.right - parseFloat(cs.borderRightWidth), b: a.bottom - parseFloat(cs.borderBottomWidth) };
    const over = Math.max(p.l - r.left, p.t - r.top, r.right - p.r, r.bottom - p.b);
    if (over > 0.5) cut.push({ el: n.tagName.toLowerCase() + (n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\s+/).join('.') : ''),
      over: Math.round(over * 10) / 10, ov: cs.overflowX + '/' + cs.overflowY, at: { l: Math.round(p.l), t: Math.round(p.t), r: Math.round(p.r), b: Math.round(p.b) } });
  }
  const inView = r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5;
  return { found: true, box, cut, inView, text: chip.textContent.trim() };
});

for (const [vn, o] of [['desktop', { dark: false }], ['handy', { dark: false, mobile: true, width: 393, height: 852 }],
  ['handy-webkit', { dark: false, mobile: true, width: 393, height: 852, safari: true }]]) {
  const { page } = await open(o);
  usePage(page);
  const tap = async (x, y) => { if (o.mobile) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); };
  await dashboard(page, URL_PATH + '/raum', 1);
  const tile = (await cards(page, 'casora_cameras'))[0];
  await need(vn + ': Kameras-Kachel', tile);
  await tap(tile.x + tile.w / 2, tile.y + tile.h / 2);
  await page.waitForFunction(() => (window.__pierce('.casora-cam-tile') || []).some((e) => e.getBoundingClientRect().width > 0), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const t = await page.evaluate(() => { const e = (window.__pierce('.casora-cam-tile') || []).find((x) => x.getBoundingClientRect().width > 0);
    if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await need(vn + ': Kamera in der Übersicht', t);
  await tap(t.x, t.y);
  await page.waitForFunction(() => (window.__pierce('.cam-back') || []).some((e) => e.getBoundingClientRect().width > 0), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const m = await measure(page);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${vn}.png` });
  await check(vn + ': Zurück-Knopf „Alle Kameras“ in der Einzelansicht', m.found && /Kameras|cameras/i.test(m.text || ''), m);
  await check(vn + ': Zurück-Knopf liegt ganz in jedem abschneidenden Vorfahren', m.found && m.cut.length === 0, m);
  await check(vn + ': Zurück-Knopf liegt ganz im Bild', m.found && m.inView, m);
  await page.context().browser().close();
}
await finish();
