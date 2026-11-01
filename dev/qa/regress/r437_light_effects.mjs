// @zustand: arbeit
// @deckt: custom_components/casora/scripts/local/03-popups.js
// User wish (Marco, 01.11.2026): a lamp with effects (Hue scenes/effects, WLED, Govee …) gets the moon „Effekte“ at the
// light popup's wheel. It opens the small menu at the moon (as „Alle (n)“): every effect, „Ohne Effekt“ first when the
// lamp knows none/off, the running one hinterlegt. A tap calls light.turn_on with the effect and closes the menu; the
// moon and the menu then mark the new effect. Desktop (mouse) and phone (touch, the menu stays inside the window).
// Room popup: the room's only lamp with effects gets the moon; the house (two lamps with effects) none.
// Test house: the Hue-like lamps of dev/casora_mock/hubs.py (Werkbanklampe in Garage, Palmenleuchte in Garten).
//   CASORA_QA_SHOTS=<dir>: pictures there as well (light theme).
import fs from 'node:fs';
import path from 'node:path';
import { open, usePage, casoraDashboard, dashboard, check, need, finish } from './lib.mjs';

const LAMP = 'light.werkbanklampe';
const d = await casoraDashboard();
await need('a Casora dashboard', d);
const OUT = process.env.CASORA_QA_SHOTS || null;
if (OUT) fs.mkdirSync(OUT, { recursive: true });
const keep = async (pg, name) => { if (OUT) await pg.screenshot({ path: path.join(OUT, name + '.png') }).catch(() => {}); };

// A light tile for the entity, opened by its tap (as r270).
const openPopup = async (pg, entity, vars) => {
  await pg.evaluate(async ([entity, vars]) => {
    if (window.casoraPopup && window.casoraPopup.close) window.casoraPopup.close();
    await new Promise((r) => setTimeout(r, 400));
    const ha = document.querySelector('home-assistant');
    const old = ha.shadowRoot.getElementById('qa-r437');
    if (old) old.remove();
    const h = await window.loadCardHelpers();
    const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_light', entity, variables: vars || {} });
    el.id = 'qa-r437'; el.hass = ha.hass; el.style.cssText = 'position:fixed;left:10px;top:500px;width:200px;height:140px;z-index:1;';
    ha.shadowRoot.appendChild(el);
    await new Promise((r) => setTimeout(r, 1200));
    el._handleAction({ detail: { action: 'tap' } }, { isIcon: false });
  }, [entity, vars]);
  await pg.waitForTimeout(3000);
};
const moonState = (pg) => pg.evaluate(() => {
  const p = window.casoraPopup && window.casoraPopup.element;
  if (!p) return null;
  const ms = window.__pierce('.hui-moon', p.shadowRoot).filter((m) => m.getBoundingClientRect().width > 0);
  const fx = ms.find((m) => m.getAttribute('aria-label') === 'Effekte');
  const r = fx && fx.getBoundingClientRect();
  return { n: ms.length, labels: ms.map((m) => m.getAttribute('aria-label')), fx: !!fx, on: !!(fx && fx.classList.contains('on')),
    menu: !!(fx && fx.hasAttribute('data-casora-moonmenu')), at: r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null };
});
const menuState = (pg) => pg.evaluate(() => {
  const host = document.querySelector('[data-casora-moonmenu-pane]');
  if (!host) return null;
  const pane = host.shadowRoot.querySelector('.pane'), r = pane.getBoundingClientRect();
  const rows = [...host.shadowRoot.querySelectorAll('.row')].map((x) => {
    const b = x.getBoundingClientRect();
    return { t: x.textContent.trim(), on: x.classList.contains('on'), x: b.x + b.width / 2, y: b.y + b.height / 2, vis: b.y >= r.y - 1 && b.bottom <= r.bottom + 1 };
  });
  // The popup's head and surface (desktop 01.11.2026: a long list opened upwards over the title).
  const pop = window.__pierce('casora-popup', document)[0];
  const hd = pop && pop.shadowRoot.querySelector('.header'), sf = pop && pop.shadowRoot.querySelector('.surface');
  const h = hd && !hd.hidden ? hd.getBoundingClientRect() : null, s = sf ? sf.getBoundingClientRect() : null;
  return { rows, inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, w: r.width,
    clearOfHead: !h || !h.height || r.top >= h.bottom - 1, inPopup: !s || !s.width || (r.top >= s.top - 1 && r.bottom <= s.bottom + 1),
    pane: { top: r.top, bottom: r.bottom }, head: h ? { bottom: h.bottom } : null, surf: s ? { top: s.top, bottom: s.bottom } : null };
});
const fxNow = (pg) => pg.evaluate((id) => { const s = document.querySelector('home-assistant').hass.states[id]; return s && s.attributes.effect; }, LAMP);
const setFx = (pg, e) => pg.evaluate(([id, e]) => document.querySelector('home-assistant').hass.callService('light', 'turn_on', { entity_id: id, effect: e }), [LAMP, e]);

const run = async (label, pg, tap, pickName) => {
  usePage(pg);
  await setFx(pg, 'off');
  await pg.waitForTimeout(800);
  await openPopup(pg, LAMP);
  const m0 = await moonState(pg);
  await need(label + ': lamp popup open', m0, m0);
  await check(label + ': moon „Effekte“ with its menu', m0.fx && m0.menu, m0);
  await check(label + ': at most 4 moons', m0.n <= 4, m0.labels);
  await check(label + ': no effect running – moon not chosen', !m0.on, m0);
  await keep(pg, label + '_popup');
  await tap(m0.at);
  await pg.waitForTimeout(700);
  const menu = await menuState(pg);
  await need(label + ': menu opens at the moon', menu && menu.rows.length > 2, menu);
  await check(label + ': „Ohne Effekt“ first and chosen, effects as words', menu.rows[0].t === 'Ohne Effekt' && menu.rows[0].on
    && menu.rows.some((r) => r.t === 'Candle') && menu.rows.some((r) => r.t === 'Fire') && !menu.rows.some((r) => /^[a-z]/.test(r.t)), menu.rows.map((r) => r.t));
  await check(label + ': menu stays inside the window', menu.inside, menu);
  await check(label + ': menu stays inside the popup and leaves its head free', menu.clearOfHead && menu.inPopup,
    { pane: menu.pane, head: menu.head, surf: menu.surf });
  await keep(pg, label + '_menu');
  const row = menu.rows.find((r) => r.t === pickName);
  if (!row.vis) {
    await pg.evaluate((t) => { const h = document.querySelector('[data-casora-moonmenu-pane]'); [...h.shadowRoot.querySelectorAll('.row')].find((x) => x.textContent.trim() === t).scrollIntoView({ block: 'center' }); }, pickName);
    await pg.waitForTimeout(300);
  }
  const row2 = (await menuState(pg)).rows.find((r) => r.t === pickName);
  await tap({ x: row2.x, y: row2.y });
  await pg.waitForTimeout(2200);
  await check(label + ': menu closed after the tap', !(await menuState(pg)));
  const fx = await fxNow(pg);
  await check(label + ': light.turn_on with the effect', fx === pickName.toLowerCase(), fx);
  const m1 = await moonState(pg);
  await check(label + ': moon marks the running effect', m1 && m1.on, m1);
  await tap(m1.at);
  await pg.waitForTimeout(700);
  const menu2 = await menuState(pg);
  await check(label + ': menu marks the running effect', menu2 && menu2.rows.filter((r) => r.on).map((r) => r.t).join() === pickName, menu2 && menu2.rows.filter((r) => r.on));
  await keep(pg, label + '_menu_after');
  await pg.keyboard.press('Escape');
  await pg.waitForTimeout(400);
  await check(label + ': Esc closes the menu', !(await menuState(pg)));
};

// ── Desktop ──────────────────────────────────────────────────────────────────
const desk = await open({ width: 1440, height: 900, dark: false });
await dashboard(desk.page, d.url, 3);
await run('desktop', desk.page, (p) => desk.page.mouse.click(p.x, p.y), 'Candle');

// Room popup (Garage: only the Werkbanklampe has effects) and the house (two lamps with effects: none).
const room = await desk.page.evaluate(() => {
  const S = document.querySelector('home-assistant').hass.states;
  return S['light.hub_lampen_garage'] ? 'light.hub_lampen_garage' : null;
});
if (room) {
  await openPopup(desk.page, room);
  const mr = await moonState(desk.page);
  await check('room popup: the room\'s only lamp with effects gets the moon', mr && mr.fx && mr.n <= 4, mr);
  await keep(desk.page, 'desktop_room_popup');
} else await check('room popup: hub group in the test house (private fixture)', true, 'skipped');
const house = await desk.page.evaluate(() => {
  const S = document.querySelector('home-assistant').hass.states;
  const grp = (x) => S[x] && Array.isArray((S[x].attributes || {}).entity_id);
  return Object.keys(S).find((x) => x.startsWith('light.') && grp(x) && S[x].attributes.entity_id.length >= 3 && S[x].attributes.entity_id.every(grp)) || null;
});
if (house) {
  await openPopup(desk.page, house, { group_rooms: true });
  const mh = await moonState(desk.page);
  await check('house popup: two lamps with effects – no moon (each lamp\'s own popup has it)', mh && !mh.fx, mh);
}

// ── Phone ────────────────────────────────────────────────────────────────────
const phone = await open({ width: 393, height: 852, mobile: true, scale: 2, dark: false });
await dashboard(phone.page, d.url, 3);
await run('phone', phone.page, (p) => phone.page.touchscreen.tap(p.x, p.y), 'Fire');

usePage(desk.page);
await setFx(desk.page, 'off');
await finish();
