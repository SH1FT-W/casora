// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/40-swipe-rooms.js custom_components/casora/scripts/casora-core.js#_casoraSwipeTablet
// Issue 114 (03.11.2026): swipe left/right on an open room for the next/previous room, in the room menu's order, as an
// option (Studio › Controls › Phone: "Swipe between rooms", "Also on the tablet"; both off by default).
// Phone 393 with real touch input (CDP), settings only in the browser:
//  1. off (default): a horizontal swipe on an open room changes nothing
//  2. on: swipe to the left → next room, to the right → previous room
//  3. on: a mostly vertical move scrolls and never changes the room
//  4. on: a swipe that starts in a sideways-scrolling row (badges) does not change the room
//  5. on: no room change while a Casora popup is open; no wrap-around past the last room
// Tablet 1180×820 with touch: with "Also on the tablet" a swipe on a room view goes to the next room view.
import { open, usePage, casoraDashboard, dashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora-Dashboard mit Handy-Gegenstück', dash && dash.phone);

async function swipe(cdp, page, x0, y0, x1, y1, steps = 10) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove',
      touchPoints: [{ x: x0 + (x1 - x0) * i / steps, y: y0 + (y1 - y0) * i / steps }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(1300);
}

// ── Phone ────────────────────────────────────────────────────────────────────
{
  const { page, context } = await open({ width: 393, height: 852, mobile: true, dark: false, theme: 'Casora' });
  usePage(page);
  await dashboard(page, dash.phone.url);
  await page.waitForFunction(() => !!(window._hmnOwner && window._hmnOwner._rooms && window._hmnOwner._rooms.length >= 3), null, { timeout: 20000 }).catch(() => {});
  const keys = await page.evaluate(() => (window._hmnOwner._rooms || []).filter(window.casoraSeesRoute || (() => true)).map((r) => r.key));
  await need('Handy: mindestens drei Räume im Raummenü', keys.length >= 3, keys);
  const cdp = await context.newCDPSession(page);
  const cur = () => page.evaluate(() => window._casoraFilter.get());
  const go = async (k) => { await page.evaluate((k) => { window._casoraFilter.set(k); }, k); await page.waitForTimeout(1800); };
  const setOn = (on) => page.evaluate((on) => { window._hmnOwner._cfg = Object.assign({}, window._hmnOwner._cfg, { swipe_rooms: on }); }, on);
  const midY = 520;

  await setOn(false);
  await go(keys[1]);
  await swipe(cdp, page, 330, midY, 60, midY + 6);
  await check('Handy aus: Wischen wechselt den Raum nicht', (await cur()) === keys[1], { cur: await cur() });

  await setOn(true);
  await go(keys[1]);
  await swipe(cdp, page, 330, midY, 60, midY + 6);
  await check('Handy an: nach links wischen → nächster Raum', (await cur()) === keys[2], { cur: await cur(), want: keys[2] });
  await swipe(cdp, page, 60, midY, 330, midY - 4);
  await check('Handy an: nach rechts wischen → voriger Raum', (await cur()) === keys[1], { cur: await cur(), want: keys[1] });

  await swipe(cdp, page, 200, 650, 160, 300);
  await check('Handy an: senkrecht wischen wechselt den Raum nicht', (await cur()) === keys[1], { cur: await cur() });

  // A start in a sideways-scrolling row (the room's badge row, if it scrolls).
  const row = await page.evaluate(() => {
    const el = window.__pierce('#rooms_row, #climate_row, #media_row').find((e) => e.getBoundingClientRect().width > 50
      && e.getBoundingClientRect().top > 0 && e.getBoundingClientRect().bottom < innerHeight);
    if (!el) return null; const r = el.getBoundingClientRect(); return { y: r.top + r.height / 2 };
  });
  if (row) {
    await swipe(cdp, page, 330, row.y, 60, row.y);
    await check('Handy an: Wischen in einer seitwärts scrollenden Reihe wechselt den Raum nicht', (await cur()) === keys[1], { cur: await cur() });
  } else console.log('  info   Handy: keine seitwärts scrollende Reihe im Bild – Fall 4 übersprungen');

  // Last room: no wrap-around.
  await go(keys[keys.length - 1]);
  await swipe(cdp, page, 330, midY, 60, midY + 6);
  await check('Handy an: am letzten Raum kein Sprung zum ersten', (await cur()) === keys[keys.length - 1], { cur: await cur() });

  // A Casora popup is open: no room change.
  await go(keys[1]);
  await page.evaluate(() => { window.casoraPopup = window.casoraPopup || {}; window.__qaSurf = window.casoraPopup.surface; window.casoraPopup.surface = document.body; });
  await swipe(cdp, page, 330, midY, 60, midY + 6);
  await page.evaluate(() => { window.casoraPopup.surface = window.__qaSurf; });
  await check('Handy an: bei offenem Popup kein Raumwechsel', (await cur()) === keys[1], { cur: await cur() });
  await page.evaluate(() => window._casoraFilter.set('all'));
  await page.context().close();
}

// ── Tablet ───────────────────────────────────────────────────────────────────
{
  const { page, context } = await open({ width: 1180, height: 820, touch: true, dark: false, theme: 'Casora' });
  usePage(page);
  const views = dash.config.views.filter((v) => [].concat(((v.cards || [])[0] || {}).template || []).includes('casora_room')
    && v.path && !(((v.cards || [])[0] || {}).variables || {}).casora_hidden).map((v) => v.path);
  await need('Tablet: mindestens drei Raumansichten', views.length >= 3, views);
  await dashboard(page, dash.url + '/' + views[1]);
  const cdp = await context.newCDPSession(page);
  const path = () => page.evaluate(() => location.pathname.split('/').filter(Boolean)[1]);
  await swipe(cdp, page, 1000, 560, 600, 566);
  await check('Tablet aus: Wischen wechselt die Ansicht nicht', (await path()) === views[1], { path: await path() });
  // "Also on the tablet" only in the browser: the dashboard config the settings reader sees gets the variable.
  await page.evaluate(() => {
    const deep = (r, d) => { if (!r || d > 10) return null; const h = r.querySelector && r.querySelector('hui-root'); if (h) return h;
      for (const e of r.querySelectorAll ? r.querySelectorAll('*') : []) if (e.shadowRoot) { const f = deep(e.shadowRoot, d + 1); if (f) return f; } return null; };
    const root = deep(document, 0);
    const cfg = JSON.parse(JSON.stringify(root.lovelace.config));
    cfg.views.forEach((v) => { const h = (v.cards || [])[0]; if (h && h.variables) h.variables.swipe_rooms_tablet = true; });
    root.lovelace = Object.assign({}, root.lovelace, { config: cfg });
  });
  await page.waitForTimeout(1500);
  await swipe(cdp, page, 1000, 560, 600, 566);
  await check('Tablet an: nach links wischen → nächste Raumansicht', (await path()) === views[2], { path: await path(), want: views[2] });
  await page.context().close();
}
await finish();
