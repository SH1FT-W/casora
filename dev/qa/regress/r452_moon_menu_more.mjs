// @zustand: arbeit
// @deckt: custom_components/casora/scripts/casora-core.js
// Owner (01.11.2026, desktop, security popup armed „Nacht“): the menu behind „Alle (5)“ listed every mode again,
// the moons' ones included, and its last row was cut off at the bottom over the moon. Now the moon is „Mehr (n)“
// and its menu lists only the modes that are not moons already (n = rows); the chosen one stays hinterlegt. The menu
// lies fully inside the popup below its head, every row visible (or the pane scrolls inside itself).
//   CASORA_QA_SHOTS=<dir>: pictures there as well.
import fs from 'node:fs';
import path from 'node:path';
import { open, usePage, casoraDashboard, dashboard, fakeStates, check, need, finish } from './lib.mjs';

const d = await casoraDashboard();
await need('a Casora dashboard', d);
const OUT = process.env.CASORA_QA_SHOTS || null;
if (OUT) fs.mkdirSync(OUT, { recursive: true });
const keep = async (pg, name) => { if (OUT) await pg.screenshot({ path: path.join(OUT, name + '.png') }).catch(() => {}); };

const moonState = (pg) => pg.evaluate(() => {
  const p = window.casoraPopup && window.casoraPopup.element;
  const root = (p && p.shadowRoot) || document;
  const ms = window.__pierce('.hui-moon', root).filter((m) => m.getBoundingClientRect().width > 0);
  const mm = ms.find((m) => m.hasAttribute('data-casora-moonmenu') && m.getAttribute('aria-label') !== 'Effekte');
  const r = mm && mm.getBoundingClientRect();
  return { labels: ms.map((m) => m.getAttribute('aria-label')), menuMoon: mm ? mm.getAttribute('aria-label') : null,
    on: !!(mm && mm.classList.contains('on')), at: r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null };
});
const menuState = (pg) => pg.evaluate(() => {
  const host = document.querySelector('[data-casora-moonmenu-pane]');
  if (!host) return null;
  const pane = host.shadowRoot.querySelector('.pane'), r = pane.getBoundingClientRect();
  const rows = [...host.shadowRoot.querySelectorAll('.row')].map((x) => {
    const b = x.getBoundingClientRect();
    return { t: x.textContent.trim(), on: x.classList.contains('on'), vis: b.top >= r.top - 1 && b.bottom <= r.bottom + 1 };
  });
  const pop = window.__pierce('casora-popup', document)[0];
  const hd = pop && pop.shadowRoot.querySelector('.header'), sf = pop && pop.shadowRoot.querySelector('.surface');
  const h = hd && !hd.hidden ? hd.getBoundingClientRect() : null, s = sf ? sf.getBoundingClientRect() : null;
  return { rows, scrolls: pane.scrollHeight > pane.clientHeight + 1,
    inPopup: !s || !s.width || (r.top >= s.top - 1 && r.bottom <= s.bottom + 1 && r.left >= s.left - 1 && r.right <= s.right + 1),
    clearOfHead: !h || !h.height || r.top >= h.bottom - 1, inWindow: r.top >= 0 && r.bottom <= innerHeight,
    pane: { top: Math.round(r.top), bottom: Math.round(r.bottom) }, surf: s ? { top: Math.round(s.top), bottom: Math.round(s.bottom) } : null };
});

const run = async (label, o, tap) => {
  const { page } = await open(o);
  usePage(page);
  await dashboard(page, d.url, 3);
  const alarm = await page.evaluate(() => Object.keys(document.querySelector('home-assistant').hass.states).find((i) => i.startsWith('alarm_control_panel.')));
  await need(label + ': an alarm panel in the test house', alarm, alarm);
  // Five modes (home, away, night, bypass, vacation), armed night.
  await fakeStates(page, { [alarm]: { state: 'armed_night', attributes: { code_format: null, code_arm_required: false, supported_features: 63 } } }, { sticky: true });
  await page.evaluate((id) => new Promise((res) => { if (window.casoraPopup) window.casoraPopup.close();
    setTimeout(() => window._casoraNotifyOpenViaCard(id, res, { type: 'custom:button-card', template: ['casora_alarm'], entity: id, variables: { alarm_entity: id } }), 400); }), alarm);
  await page.waitForTimeout(3000);
  const m = await moonState(page);
  await need(label + ': a moon with a menu', m && m.menuMoon, m);
  const shown = m.labels.filter((x) => x !== m.menuMoon);
  await check(label + ': the moon is „Mehr (n)“', /^Mehr \(\d+\)$/.test(m.menuMoon), m.labels);
  await tap(page, m.at);
  await page.waitForTimeout(800);
  const menu = await menuState(page);
  await need(label + ': menu opens', menu && menu.rows.length, menu);
  await keep(page, label + '_menu');
  const texts = menu.rows.map((r) => r.t);
  await check(label + ': menu lists only modes that are no moon', !texts.some((t) => shown.includes(t)), { texts, shown });
  await check(label + ': n = rows in the menu', m.menuMoon === 'Mehr (' + texts.length + ')', { moon: m.menuMoon, texts });
  await check(label + ': every mode reachable once (moons + menu)', shown.length + texts.length === 5, { texts, shown });
  await check(label + ': the chosen mode (Nacht) is hinterlegt where it is', shown.includes('Nacht') ? !menu.rows.some((r) => r.on) : menu.rows.find((r) => r.t === 'Nacht').on, menu.rows);
  await check(label + ': menu fully inside the popup, below its head', menu.inPopup && menu.clearOfHead && menu.inWindow, menu);
  await check(label + ': every row whole, no row cut off, no scrolling', menu.rows.every((r) => r.vis) && !menu.scrolls, menu.rows);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await check(label + ': Esc closes', !(await menuState(page)));
};

await run('desktop', { width: 1440, height: 900, dark: false }, (pg, p) => pg.mouse.click(p.x, p.y));
await run('laptop', { width: 1280, height: 720, dark: false }, (pg, p) => pg.mouse.click(p.x, p.y));
await run('phone', { width: 393, height: 852, mobile: true, scale: 2, dark: false }, (pg, p) => pg.touchscreen.tap(p.x, p.y));
await finish();
