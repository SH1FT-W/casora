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
//  6. on (owner, 03.11.2026): Home is the first page – on Home a swipe to the left opens the first room, on the first
//     room a swipe to the right goes back Home, Home has no previous page; a swipe that starts on one of Home's own
//     horizontal rows (badges, chips, tile rows, carousels) stays with the row
// Tablet 1180×820 with touch: with "Also on the tablet" a swipe on a room view goes to the next room view; Home (the
// first view) is the first page there too.
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

// A point on the page whose ancestors take no horizontal touches (free) or that lies on such a row (row).
const SPOT = (kind) => (() => {
  const deepAt = (x, y) => { let el = document.elementFromPoint(x, y); while (el && el.shadowRoot && el.shadowRoot.elementFromPoint) {
    const inner = el.shadowRoot.elementFromPoint(x, y); if (!inner || inner === el) break; el = inner; } return el; };
  const up = (el) => { const out = []; while (el) { out.push(el); el = el.parentElement || (el.getRootNode && el.getRootNode().host) || null; } return out; };
  const claims = (el) => { if (el.nodeType !== 1) return false; if (/^(media_row|climate_row|rooms_row)$/.test(el.id)) return true;
    if (/^(casora-swipe-card|input|ha-slider|ha-control-slider|casora-chart|canvas)$/i.test(el.localName || '')) return true;
    const cs = getComputedStyle(el);
    if (/pan-x/.test(cs.touchAction) && !/pan-y/.test(cs.touchAction)) return true;
    return el.scrollWidth > el.clientWidth + 4 && el.clientWidth > 0 && (cs.overflowX === 'auto' || cs.overflowX === 'scroll'); };
  const W = innerWidth;
  for (let y = 120; y < innerHeight - 140; y += 30) {
    for (const x of [W * 0.5, W * 0.3, W * 0.7]) {
      const el = deepAt(x, y); if (!el) continue;
      const on = up(el).some(claims);
      if (KIND === 'row' ? on : !on) return { x, y };
    }
  }
  return null;
}).toString().replace('KIND', JSON.stringify(kind));
const spot = (page, kind) => page.evaluate('(' + SPOT(kind) + ')()');

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

  // A start in a sideways-scrolling row of the open room (hit-tested: the row must be what the finger lands on).
  const row = await page.evaluate(() => {
    const deepAt = (x, y) => { let el = document.elementFromPoint(x, y); while (el && el.shadowRoot && el.shadowRoot.elementFromPoint) {
      const inner = el.shadowRoot.elementFromPoint(x, y); if (!inner || inner === el) break; el = inner; } return el; };
    const up = (el) => { const out = []; while (el) { out.push(el); el = el.parentElement || (el.getRootNode && el.getRootNode().host) || null; } return out; };
    for (const el of window.__pierce('#rooms_row, #climate_row, #media_row')) {
      const r = el.getBoundingClientRect();
      if (r.width < 50 || r.top < 0 || r.bottom > innerHeight || el.scrollWidth <= el.clientWidth + 4) continue;
      const x = Math.min(r.right - 20, 330), y = r.top + r.height / 2;
      if (up(deepAt(x, y)).includes(el)) return { x, y };
    }
    return null;
  });
  if (row) {
    await swipe(cdp, page, row.x, row.y, row.x - 260, row.y);
    await check('Handy an: Wischen in einer seitwärts scrollenden Reihe wechselt den Raum nicht', (await cur()) === keys[1], { cur: await cur() });
  } else console.log('  info   Handy: keine seitwärts scrollende Reihe im offenen Raum – Fall 4 übersprungen');

  // Last room: no wrap-around.
  await go(keys[keys.length - 1]);
  await swipe(cdp, page, 330, midY, 60, midY + 6);
  await check('Handy an: am letzten Raum kein Sprung zum ersten', (await cur()) === keys[keys.length - 1], { cur: await cur() });

  // A Casora popup is open: no room change.
  await go(keys[1]);
  const lamp = await page.evaluate(() => Object.keys(document.querySelector('home-assistant').hass.states).find((id) => id.startsWith('light.')));
  await page.evaluate((id) => window.casoraPopup && window.casoraPopup.moreInfo(id), lamp);
  await page.waitForTimeout(1500);
  const popup = await page.evaluate(() => !!(window.casoraPopup && window.casoraPopup.surface));
  if (popup) {
    await swipe(cdp, page, 330, midY, 60, midY + 6);
    await check('Handy an: bei offenem Popup kein Raumwechsel', (await cur()) === keys[1], { cur: await cur() });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
  } else console.log('  info   Handy: kein Casora-Popup zu öffnen – Fall 5b übersprungen');
  // Home is the first page.
  await go('all');
  const free = await spot(page, 'free');
  if (free) {
    await swipe(cdp, page, free.x + 120, free.y, free.x - 150, free.y + 4);
    await check('Handy an: auf Home nach links wischen → erster Raum', (await cur()) === keys[0], { cur: await cur(), want: keys[0], at: free });
    await go(keys[0]);
    const fr = await spot(page, 'free');
    if (fr) await swipe(cdp, page, Math.max(40, fr.x - 140), fr.y, Math.min(370, fr.x + 150), fr.y - 4);
    await check('Handy an: im ersten Raum nach rechts wischen → Home', (await cur()) === 'all', { cur: await cur() });
    await swipe(cdp, page, Math.max(40, free.x - 140), free.y, Math.min(370, free.x + 150), free.y);
    await check('Handy an: auf Home nach rechts wischen bleibt auf Home', (await cur()) === 'all', { cur: await cur() });
  } else await check('Handy: freie Stelle auf Home zum Wischen', false);
  const homeRow = await spot(page, 'row');
  if (homeRow) {
    await swipe(cdp, page, Math.min(370, homeRow.x + 120), homeRow.y, Math.max(30, homeRow.x - 160), homeRow.y);
    await check('Handy an: Wischen auf einer Reihe von Home bleibt bei der Reihe', (await cur()) === 'all', { cur: await cur(), at: homeRow });
  } else console.log('  info   Handy: keine seitwärts wischbare Reihe auf Home – Fall 6b übersprungen');
  await page.evaluate(() => window._casoraFilter.set('all'));
  await page.context().close();
}

// ── Tablet ───────────────────────────────────────────────────────────────────
{
  const { page, context } = await open({ width: 1180, height: 820, touch: true, dark: false, theme: 'Casora' });
  usePage(page);
  const views = dash.config.views.filter((v, i) => i > 0 && [].concat(((v.cards || [])[0] || {}).template || []).includes('casora_room')
    && v.path && !v.casora_category && !(((v.cards || [])[0] || {}).variables || {}).casora_hidden).map((v) => v.path);
  await need('Tablet: mindestens drei Raumansichten', views.length >= 3, views);
  views.unshift(String(dash.config.views[0].path || '0'));   // Home first: views[1] is the first room
  await dashboard(page, dash.url + '/' + views[1]);
  const cdp = await context.newCDPSession(page);
  // "Also on the tablet" only in the browser: the dashboard config the settings reader sees gets the variable.
  const setTablet = (on) => page.evaluate((on) => {
    const deep = (r, d) => { if (!r || d > 10) return null; const h = r.querySelector && r.querySelector('hui-root'); if (h) return h;
      for (const e of r.querySelectorAll ? r.querySelectorAll('*') : []) if (e.shadowRoot) { const f = deep(e.shadowRoot, d + 1); if (f) return f; } return null; };
    const root = deep(document, 0);
    const cfg = JSON.parse(JSON.stringify(root.lovelace.config));
    cfg.views.forEach((v) => { const h = (v.cards || [])[0]; if (h) h.variables = Object.assign({}, h.variables, { swipe_rooms_tablet: on }); });
    root.lovelace = Object.assign({}, root.lovelace, { config: cfg });
    if (window._casoraHoldModeRefresh) window._casoraHoldModeRefresh();
    return window._casoraSwipeTablet;
  }, on);
  console.log('  info   Tablet: Einstellung im Browser', await setTablet(false));
  await page.waitForTimeout(1500);
  const path = () => page.evaluate(() => location.pathname.split('/').filter(Boolean)[1]);
  const swipeLeft = async () => { const f = (await spot(page, 'free')) || { x: 600, y: 300 };
    await swipe(cdp, page, Math.min(1120, f.x + 200), f.y, Math.max(60, f.x - 200), f.y + 4); };
  await swipeLeft();
  await check('Tablet aus: Wischen wechselt die Ansicht nicht', (await path()) === views[1], { path: await path() });
  console.log('  info   Tablet: Einstellung im Browser', await setTablet(true));
  await page.waitForTimeout(1500);
  await swipeLeft();
  await check('Tablet an: nach links wischen → nächste Raumansicht', (await path()) === views[2], { path: await path(), want: views[2] });
  // Home (first view) first: from the first room a swipe to the right goes Home, Home has no previous page.
  const homePath = String(dash.config.views[0].path || '0');
  await page.evaluate((p) => { history.pushState(null, '', p); window.dispatchEvent(new CustomEvent('location-changed')); }, '/' + dash.url + '/' + views[1]);
  await page.waitForTimeout(1800);
  const tfree = await spot(page, 'free');
  if (tfree) {
    await swipe(cdp, page, Math.max(60, tfree.x - 200), tfree.y, Math.min(1120, tfree.x + 200), tfree.y);
    await check('Tablet an: in der ersten Raumansicht nach rechts wischen → Home', (await path()) === homePath, { path: await path(), want: homePath });
    const hfree = await spot(page, 'free');
    if (hfree) await swipe(cdp, page, Math.max(60, hfree.x - 200), hfree.y, Math.min(1120, hfree.x + 200), hfree.y);
    await check('Tablet an: auf Home nach rechts wischen bleibt auf Home', (await path()) === homePath, { path: await path() });
  } else await check('Tablet: freie Stelle zum Wischen', false);
  await page.context().close();
}
await finish();
