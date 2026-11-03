// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/40-swipe-rooms.js custom_components/casora/scripts/casora-core.js#_casoraSwipeRooms
// Issue 114 (03.11.2026): swipe left/right on Home or an open room for the next/previous page, in the room menu's order,
// as ONE option for every touch device (Studio › Controls › Phone: "Swipe between rooms", off by default; owner
// 03.11.2026: no separate tablet option, touch detected by capability, never by user agent).
// Phone 393 with real touch input (CDP), settings only in the browser:
//  1. off (default): a horizontal swipe on an open room changes nothing
//  2. on: swipe to the left → next room, to the right → previous room
//  3. on: a mostly vertical move scrolls and never changes the room
//  4. on: a swipe that starts in a sideways-scrolling row (badges) does not change the room
//  5. on: no room change while a Casora popup is open; no wrap-around past the last room
//  6. on: Home is the first page – on Home a swipe to the left opens the first room, on the first room a swipe to the
//     right goes back Home, Home has no previous page; a swipe that starts on one of Home's own sideways-scrolling
//     rows stays with the row
// iPad (WebKit, landscape, iPadOS Safari's Mac user agent, touch events): the same setting on the desktop dashboard
// swipes between the room views, Home (first view) first; a saved swipe_rooms_tablet alone does nothing.
// Desktop with a mouse (Chromium 1440, no touch): dragging never changes the page.
// Owner 03.11.2026 (iPad prod): a row that scrolls sideways keeps the swipe only while it can still scroll that way; at
// its end the page swipes (scroll chaining) – a tablet room page is mostly tile rows. Smooth change ("the background
// image jerks in"): the neighbours' room photos are decoded ahead, the backgrounds crossfade under html.casora-room-swap
// (not with reduced motion).
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
const SPOT = (kind, side) => (() => {
  const deepAt = (x, y) => { let el = document.elementFromPoint(x, y); while (el && el.shadowRoot && el.shadowRoot.elementFromPoint) {
    const inner = el.shadowRoot.elementFromPoint(x, y); if (!inner || inner === el) break; el = inner; } return el; };
  const up = (el) => { const out = []; while (el) { out.push(el); el = el.parentElement || (el.getRootNode && el.getRootNode().host) || null; } return out; };
  const claims = (el) => { if (el.nodeType !== 1) return false; if (/^(media_row|climate_row|rooms_row)$/.test(el.id)) return true;
    if (/^(casora-swipe-card|input|ha-slider|ha-control-slider|casora-chart|canvas)$/i.test(el.localName || '')) return true;
    const cs = getComputedStyle(el);
    if (/pan-x/.test(cs.touchAction) && !/pan-y/.test(cs.touchAction)) return true;
    return el.scrollWidth > el.clientWidth + 4 && el.clientWidth > 0 && (cs.overflowX === 'auto' || cs.overflowX === 'scroll'); };
  const W = innerWidth;
  for (let y = 56; y < innerHeight - 140; y += 20) {
    for (const x of (SIDE === 'right' ? [W * 0.8, W * 0.7, W * 0.9] : [W * 0.2, W * 0.3, W * 0.12])) {
      const el = deepAt(x, y); if (!el) continue;
      const on = up(el).some(claims);
      if (KIND === 'row' ? on : !on) return { x, y };
    }
  }
  return null;
}).toString().replace('KIND', JSON.stringify(kind)).replace('SIDE', JSON.stringify(side));
// The swipe starts exactly at the spot: 'right' for a swipe to the left, 'left' for one to the right.
const spot = (page, kind, side) => page.evaluate('(' + SPOT(kind, side) + ')()');
const toLeft = (s, w) => [s.x, s.y, Math.max(8, s.x - w * 0.6), s.y + 4];
const toRight = (s, w) => [s.x, s.y, Math.min(w - 8, s.x + w * 0.6), s.y - 4];

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
  // The open room follows the finger (GPU transform) while it drags.
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: midY }] });
  for (let i = 1; i <= 5; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 300 - i * 16, y: midY }] }); await page.waitForTimeout(16); }
  const follows = await page.evaluate((k) => { let tf = '';
    Array.from(window._casoraSmartRows || []).forEach((r) => r.shadowRoot && r.shadowRoot.querySelectorAll('casora-filter-overlay')
      .forEach((fo) => { if (fo._config && fo._config.filter_category === k && fo._overlayEl) tf = fo._overlayEl.style.transform; }));
    return tf; }, keys[1]);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(900);
  await check('Handy an: der offene Raum folgt dem Finger (translate3d)', /translate3d\(-/.test(follows), { follows });
  await go(keys[1]);
  // Smooth change: neighbour photos decoded ahead, crossfade class while switching; none with reduced motion.
  await page.waitForTimeout(800);
  const pre = await page.evaluate(() => (window.casoraSwipeRooms.preloaded ? window.casoraSwipeRooms.preloaded() : []));
  await check('Handy an: Fotos der Nachbarräume vorgeladen', pre.length >= 1, pre);
  await page.evaluate(() => { window.__qaSwap = false; new MutationObserver(() => { if (document.documentElement.classList.contains('casora-room-swap')) window.__qaSwap = true; })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['class'] }); });
  await swipe(cdp, page, 330, midY, 60, midY + 6);
  await check('Handy an: Hintergründe blenden über (casora-room-swap)', await page.evaluate(() => window.__qaSwap) && (await cur()) === keys[2], { cur: await cur() });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => { window.__qaSwap = false; });
  await swipe(cdp, page, 60, midY, 330, midY - 4);
  await check('Handy an, weniger Bewegung: Raumwechsel ohne Überblenden', !(await page.evaluate(() => window.__qaSwap)) && (await cur()) === keys[1], { cur: await cur() });
  await page.emulateMedia({ reducedMotion: 'no-preference' });

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
  const free = await spot(page, 'free', 'right');
  if (free) {
    await swipe(cdp, page, ...toLeft(free, 393));
    await check('Handy an: auf Home nach links wischen → erster Raum', (await cur()) === keys[0], { cur: await cur(), want: keys[0], at: free });
  } else await check('Handy: freie Stelle auf Home zum Wischen', false);
  await go(keys[0]);
  const fr = await spot(page, 'free', 'left');
  if (fr) await swipe(cdp, page, ...toRight(fr, 393));
  await check('Handy an: im ersten Raum nach rechts wischen → Home', (await cur()) === 'all', { cur: await cur(), at: fr });
  await go('all');
  const fl = await spot(page, 'free', 'left');
  if (fl) await swipe(cdp, page, ...toRight(fl, 393));
  await check('Handy an: auf Home nach rechts wischen bleibt auf Home', (await cur()) === 'all', { cur: await cur() });
  // Home's own sideways-scrolling row: probed with a real touch (the element under the finger must be in the row).
  await page.evaluate(() => { window.__qaPath = null; document.addEventListener('touchstart', (e) => { window.__qaPath = e.composedPath()
    .filter((el) => el.nodeType === 1).some((el) => { const cs = getComputedStyle(el);
      return el.scrollWidth > el.clientWidth + 4 && el.clientWidth > 0 && (cs.overflowX === 'auto' || cs.overflowX === 'scroll'); }); }, { capture: true, passive: true }); });
  let homeRow = null;
  for (let y = 56; y < 700 && !homeRow; y += 20) {
    for (const x of [314, 270, 340]) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      if (await page.evaluate(() => window.__qaPath)) { homeRow = { x, y }; break; }
    }
  }
  if (homeRow) {
    await swipe(cdp, page, homeRow.x, homeRow.y, homeRow.x - 230, homeRow.y);
    await check('Handy an: Wischen auf einer Reihe von Home bleibt bei der Reihe', (await cur()) === 'all', { cur: await cur(), at: homeRow });
  } else console.log('  info   Handy: keine seitwärts scrollende Reihe auf Home unter dem Finger – Fall 6b übersprungen');
  await page.evaluate(() => window._casoraFilter.set('all'));
  await page.context().close();
}

// ── iPad (WebKit, Mac user agent) and a mouse-only desktop ───────────────────
const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15';
const views = dash.config.views.filter((v, i) => i > 0 && [].concat(((v.cards || [])[0] || {}).template || []).includes('casora_room')
  && v.path && !v.casora_category && !(((v.cards || [])[0] || {}).variables || {}).casora_hidden).map((v) => v.path);
await need('Tablet: mindestens drei Raumansichten', views.length >= 3, views);
views.unshift(String(dash.config.views[0].path || '0'));   // Home first: views[1] is the first room
const homePath = views[0];
// The setting only in the browser: the dashboard config the settings reader sees.
const setRooms = (page, vars) => page.evaluate((vars) => {
  const deep = (r, sel, d) => { if (!r || d > 10) return null; const h = r.querySelector && r.querySelector(sel); if (h) return h;
    for (const e of r.querySelectorAll ? r.querySelectorAll('*') : []) if (e.shadowRoot) { const f = deep(e.shadowRoot, sel, d + 1); if (f) return f; } return null; };
  const root = deep(document, 'hui-root', 0), panel = deep(document, 'ha-panel-lovelace', 0);
  const cfg = JSON.parse(JSON.stringify(root.lovelace.config));
  cfg.views.forEach((v) => { const h = (v.cards || [])[0]; if (!h) return; const V = Object.assign({}, h.variables);
    delete V.swipe_rooms; delete V.swipe_rooms_tablet; h.variables = Object.assign(V, vars); });
  // Both the panel and the view root: the panel hands its lovelace down again when it re-renders.
  if (panel && panel.lovelace) panel.lovelace = Object.assign({}, panel.lovelace, { config: cfg });
  root.lovelace = Object.assign({}, root.lovelace, { config: cfg });
  if (window._casoraHoldModeRefresh) window._casoraHoldModeRefresh();
  return true;
}, vars);
// WebKit has no CDP touch input: touch events dispatched at the element under the finger (composed, like a touch).
async function jsSwipe(page, x0, y0, x1, y1) {
  const ok = await page.evaluate(async ([x0, y0, x1, y1]) => {
    let el = document.elementFromPoint(x0, y0);
    while (el && el.shadowRoot && el.shadowRoot.elementFromPoint) { const inner = el.shadowRoot.elementFromPoint(x0, y0); if (!inner || inner === el) break; el = inner; }
    const target = el || document.body;
    // Desktop WebKit has no Touch constructor (iPadOS Safari has): an Event of the touch type with the touch lists, which is
    // all 40-swipe-rooms.js reads (touches[0].clientX/Y, timeStamp, composedPath).
    const mk = (type, x, y) => { const t = { identifier: 7, target, clientX: x, clientY: y, pageX: x, pageY: y, screenX: x, screenY: y };
      const ev = new Event(type, { bubbles: true, composed: true, cancelable: true });
      Object.defineProperty(ev, 'touches', { value: type === 'touchend' ? [] : [t] });
      Object.defineProperty(ev, 'changedTouches', { value: [t] });
      return ev; };
    target.dispatchEvent(mk('touchstart', x0, y0));
    for (let i = 1; i <= 10; i++) { await new Promise((r) => setTimeout(r, 16)); target.dispatchEvent(mk('touchmove', x0 + (x1 - x0) * i / 10, y0 + (y1 - y0) * i / 10)); }
    target.dispatchEvent(mk('touchend', x1, y1));
    return true;
  }, [x0, y0, x1, y1]);
  await page.waitForTimeout(1600);
  return ok;
}
{
  const W = 1194;
  const { page } = await open({ safari: true, width: W, height: 834, touch: true, userAgent: MAC_UA, dark: false, theme: 'Casora' });
  usePage(page);
  await dashboard(page, dash.url + '/' + views[1]);
  const path = () => page.evaluate(() => location.pathname.split('/').filter(Boolean)[1] || '0');
  const goPath = async (p) => { await page.evaluate((p) => { history.pushState(null, '', p); window.dispatchEvent(new CustomEvent('location-changed')); }, '/' + dash.url + '/' + p); await page.waitForTimeout(1800); };
  const sw = async (side) => { const f = await spot(page, 'free', side);
    if (!f) return null; return jsSwipe(page, ...(side === 'right' ? toLeft(f, W) : toRight(f, W))); };
  const ua = await page.evaluate(() => navigator.userAgent);
  await need('iPad: Mac-Kennung wie iPadOS-Safari', /Macintosh/.test(ua), ua);
  // Only the old separate tablet option: nothing (one setting now).
  await setRooms(page, { swipe_rooms_tablet: true });
  const ran = await sw('right');
  await check('iPad: nur „swipe_rooms_tablet“ (alt) wischt nicht', (await path()) === views[1], { path: await path() });
  await setRooms(page, { swipe_rooms: true });
  await sw('right');
  await check('iPad an: nach links wischen → nächste Raumansicht', (await path()) === views[2], { path: await path(), want: views[2] });
  await goPath(views[1]);
  await sw('left');
  await check('iPad an: in der ersten Raumansicht nach rechts wischen → Home', (await path()) === homePath, { path: await path(), want: homePath });
  await sw('left');
  await check('iPad an: auf Home nach rechts wischen bleibt auf Home', (await path()) === homePath, { path: await path() });
  await sw('right');
  await check('iPad an: auf Home nach links wischen → erster Raum', (await path()) === views[1], { path: await path(), want: views[1] });
  // Scroll chaining on a tile row that overflows (narrowed in the browser): at its start a swipe to the left scrolls the
  // row, at its end the page goes on to the next room.
  const row = await page.evaluate(() => {
    const el = window.__pierce('casora-smart-row').find((x) => getComputedStyle(x).overflowX === 'auto' && x.getBoundingClientRect().width > 300);
    if (!el) return null;
    el.style.width = '360px'; el.scrollLeft = 0; window.__qaRow = el;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width - 30, y: r.top + r.height / 2, over: el.scrollWidth > el.clientWidth + 4 };
  });
  if (row && row.over) {
    await jsSwipe(page, row.x, row.y, row.x - 300, row.y + 2);
    await check('iPad an: Wischen auf einer Kachelreihe, die noch scrollen kann, bleibt bei der Reihe', (await path()) === views[1], { path: await path() });
    await page.evaluate(() => { const el = window.__qaRow; el.scrollLeft = el.scrollWidth; });
    await jsSwipe(page, row.x, row.y, row.x - 300, row.y + 2);
    await check('iPad an: am Ende der Kachelreihe wischt die Seite weiter', (await path()) === views[2], { path: await path(), want: views[2] });
  } else console.log('  info   iPad: keine Kachelreihe zum Verengen gefunden – Fall Scroll-Kette übersprungen');
  await page.context().close();
}
{
  const W = 1440;
  const { page } = await open({ width: W, height: 900, dark: false, theme: 'Casora' });
  usePage(page);
  await dashboard(page, dash.url + '/' + views[1]);
  await setRooms(page, { swipe_rooms: true });
  const path = () => page.evaluate(() => location.pathname.split('/').filter(Boolean)[1] || '0');
  const f = (await spot(page, 'free', 'right')) || { x: 1100, y: 300 };
  await page.mouse.move(f.x, f.y); await page.mouse.down();
  for (let i = 1; i <= 10; i++) { await page.mouse.move(f.x - 60 * i, f.y + 2); await page.waitForTimeout(16); }
  await page.mouse.up();
  await page.waitForTimeout(1500);
  await check('Desktop mit Maus: Ziehen wechselt die Ansicht nie', (await path()) === views[1], { path: await path() });
  await page.context().close();
}
await finish();
