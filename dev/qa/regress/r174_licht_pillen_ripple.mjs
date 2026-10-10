// @zustand: arbeit
// @parallel: ui
// fehler-04 (10.10.2026): Antippen einer Lampen-Pille im Beleuchtungs-Popup (Desktop) warf aus HAs
// md-ripple „Invalid keyframe value … scale(Infinity)“: Die Pillen blendeten ha-ripple mit
// display:none aus, der Ripple reagiert aber weiter und rechnet mit Größe 0. Erwartet: keine
// Warnung beim Antippen, Pillen sehen gleich aus (Ripple unsichtbar), Auswahl wechselt.
import { open, casoraDashboards, dashboard, check, need, finish, usePage } from './lib.mjs';

const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && d.url === 'qa-arbeit') || all.find((d) => !d.mobile);
await need('ein Casora-Dashboard', desk, all.map((d) => d.url));
const { page } = await open({ width: 1440, height: 900, theme: 'Casora' });
usePage(page);
const warn = [];
page.on('console', (m) => { if (/scale\(Infinity\)|Invalid keyframe/.test(m.text())) warn.push(m.text()); });
await dashboard(page, desk.url);
await page.waitForTimeout(1500);
// Kachel „Beleuchtung“ (Lichtgruppe) antippen: Licht-Popup mit Lampen-Pillen.
const badge = await page.evaluate(() => {
  const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).some((t) => /^casora_light/.test(t))
    && x.getBoundingClientRect().width > 200 && /^light\./.test((x._config || {}).entity || ''));
  if (!b) return null;
  b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await need('Kachel Beleuchtung (Lichtgruppe)', badge);
await page.mouse.click(badge.x, badge.y);
let pills = [];
for (let i = 0; i < 30 && pills.length < 2; i++) {
  await page.waitForTimeout(250);
  pills = await page.evaluate(() => { const s = window.casoraPopup && window.casoraPopup.surface; if (!s) return [];
    return window.__pierce('button-card', s).filter((b) => { const c = b._config || {}; const t = c.tap_action || {};
      return t.event_data && t.event_data.casora_lf_gid && b.getBoundingClientRect().width > 20; })
      .map((b) => { const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width }; }); });
}
await need('Lampen-Pillen im Popup', pills.length >= 2, pills);
if (process.env.R174_BILD) { await page.mouse.move(5, 890); await page.waitForTimeout(400); await page.screenshot({ path: process.env.R174_BILD }); }
const rip = await page.evaluate(() => { const s = window.casoraPopup.surface;
  const b = window.__pierce('button-card', s).find((x) => ((x._config || {}).tap_action || {}).event_data);
  const r = b.shadowRoot.querySelector('ha-ripple'); const cs = getComputedStyle(r);
  return { vis: cs.visibility, disp: cs.display, pe: cs.pointerEvents, pos: cs.position }; });
await check('Ripple der Pille unsichtbar, ohne Zeiger, absolut', rip.vis === 'hidden' && rip.pe === 'none' && rip.pos === 'absolute', rip);
for (const p of pills.slice(1, 3)) { await page.mouse.click(p.x, p.y); await page.waitForTimeout(600); }
await page.mouse.click(pills[0].x, pills[0].y); await page.waitForTimeout(600);
await check('keine scale(Infinity)-Warnung beim Antippen der Pillen', warn.length === 0, warn.slice(0, 2));
await finish();
