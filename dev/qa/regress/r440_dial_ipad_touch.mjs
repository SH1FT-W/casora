// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/casora-core.js
// Reported (the owner, real iPad and iPhone, 26.11.1): in the v3 popups the dial (thermostat, cover, light) could
// not be turned by finger – dragging scrolled the page. iOS/iPadOS WebKit decides scroll vs. page on the FIRST
// touchmove: if that one is not prevented, the page scrolls and every later touchmove is non-cancelable. The
// dial only claimed the touch after 6 px (DIAL_SLOP), so the first small move always went to the page.
// Playwright's WebKit cannot build touch moves and Chromium's own touch scrolling does not follow that rule,
// so the gestures here are synthetic TouchEvents with iOS's rule replayed: the first touchmove is cancelable,
// and when the page did not prevent it the touch scrolls the popup and every later move is non-cancelable.
// Expected: iPad (dialog) – knob dragged straight up/down, along the ring's side, resting then dragging all
// turn; a tap in the gap and a swipe across the middle change nothing; − / + still step (real touch taps in
// WebKit too). Phone (sheet) – the knob turns, a tap in the gap and the middle change nothing. Desktop mouse
// still drags the ring. A linear slider (brightness bar) follows the finger. Service calls are only recorded.
import { open, casoraDashboard, dashboard, check, need, finish, usePage } from './lib.mjs';

const dash = (await casoraDashboard((d) => d.url === 'qa-arbeit')) || (await casoraDashboard());
await need('a Casora dashboard', dash);
const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

// Record service calls instead of sending them (again after each page load). A cover's position follows the
// recorded call as a real cover would: the cover dial shows the reported position, so without this any state_changed
// in the house (a busy gate) redrew the dial at the old, never-changed position and the test read that as a change.
const spy = (page) => page.evaluate(() => {
  const ha = document.querySelector('home-assistant');
  const conn = ha.hass.connection;
  window.__qaCalls = [];
  window.__qaPos = {};
  const orig = conn.sendMessagePromise.bind(conn);
  conn.sendMessagePromise = (m) => {
    if (m && m.type === 'call_service') {
      window.__qaCalls.push(m.domain + '.' + m.service + ':' + JSON.stringify(m.service_data || {}));
      const d = m.service_data || {}, ids = [].concat(d.entity_id || (m.target || {}).entity_id || []);
      if (m.domain === 'cover' && m.service === 'set_cover_position') ids.forEach((id) => { window.__qaPos[id] = d.position; });
      return Promise.resolve({ context: { id: 'qa' } });
    }
    return orig(m);
  };
  if (typeof ha._updateHass === 'function' && !ha.__qaPosWrap) {
    ha.__qaPosWrap = true;
    const up = ha._updateHass;
    ha._updateHass = function (obj) {
      if (obj && obj.states && window.__qaPos && Object.keys(window.__qaPos).length) {
        const st = { ...obj.states };
        for (const [id, pos] of Object.entries(window.__qaPos)) if (st[id]) st[id] = { ...st[id], attributes: { ...st[id].attributes, current_position: pos } };
        obj = { ...obj, states: st };
      }
      return up.call(this, obj);
    };
  }
});

// One entity per kind from the house (a dial each): heating thermostat, cover with a position, dimmable light.
const pick = (page) => page.evaluate(() => {
  const st = document.querySelector('home-assistant').hass.states;
  const ids = Object.keys(st);
  const climate = ids.find((k) => k.startsWith('climate.') && (st[k].attributes.hvac_modes || []).includes('heat') && !st[k].attributes.entity_id && st[k].state === 'heat')
    || ids.find((k) => k.startsWith('climate.') && (st[k].attributes.hvac_modes || []).includes('heat') && !st[k].attributes.entity_id);
  const cover = ids.find((k) => k.startsWith('cover.') && st[k].attributes.current_position != null && !st[k].attributes.entity_id);
  const light = ids.find((k) => k.startsWith('light.') && st[k].state === 'on' && (st[k].attributes.supported_color_modes || []).some((m) => m !== 'onoff') && !st[k].attributes.entity_id);
  return { climate, cover, light };
});
const TPL = { climate: 'casora_thermostat', cover: 'casora_cover', light: 'casora_light' };

async function popupFor(page, kind, id, mobile) {
  await page.evaluate(() => { const p = window.casoraPopup; if (p && p.element && p.element.hasAttribute('open')) p.close(); });
  await page.waitForTimeout(700);
  await page.evaluate(([tpl, id]) => window.loadCardHelpers().then((h) => {
    document.querySelectorAll('home-assistant').forEach((ha) => ha.shadowRoot.querySelectorAll('.qa-dial-tile').forEach((e) => e.remove()));
    const el = h.createCardElement({ type: 'custom:button-card', template: tpl, entity: id });
    el.classList.add('qa-dial-tile'); el.hass = document.querySelector('home-assistant').hass;
    el.style.cssText = 'position:fixed;left:20px;top:120px;width:170px;height:100px;z-index:99999;';
    document.querySelector('home-assistant').shadowRoot.appendChild(el);
  }), [TPL[kind], id]);
  await page.waitForTimeout(1500);
  const isOpen = () => page.evaluate(() => { const p = window.casoraPopup && window.casoraPopup.element; return !!(p && p.hasAttribute('open') && window.__pierce('.hui-dl', p.shadowRoot).some((e) => e.getBoundingClientRect().width > 0)); });
  for (const [fx, fy] of [[-30, 0.5], [40, -30], [0.5, 0.5]]) {
    const t = await page.evaluate(([fx, fy]) => { const r = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-dial-tile').getBoundingClientRect();
      return { x: fx < 0 ? r.x + r.width + fx : fx < 1 ? r.x + r.width * fx : r.x + fx, y: fy < 0 ? r.y + r.height + fy : r.y + r.height * fy }; }, [fx, fy]);
    if (mobile) await page.touchscreen.tap(t.x, t.y); else await page.mouse.click(t.x, t.y);
    await page.waitForFunction(() => { const p = window.casoraPopup && window.casoraPopup.element; return p && p.hasAttribute('open') && window.__pierce('.hui-dl', p.shadowRoot).some((e) => e.getBoundingClientRect().width > 0); }, null, { timeout: 6000 }).catch(() => {});
    if (await isOpen()) break;
  }
  await page.evaluate(() => document.querySelector('home-assistant').shadowRoot.querySelectorAll('.qa-dial-tile').forEach((e) => e.remove()));
  await page.waitForTimeout(1000);
  await page.evaluate(() => { window.__qaCalls = []; });
  return isOpen();
}

const state = (page) => page.evaluate(() => {
  const pop = window.casoraPopup && window.casoraPopup.element;
  if (!pop || !pop.hasAttribute('open') || pop.hasAttribute('closing')) return { open: false, calls: window.__qaCalls.slice() };
  const dl = window.__pierce('.hui-dl', pop.shadowRoot).find((e) => e.getBoundingClientRect().width > 0);
  const r = dl && dl.getBoundingClientRect();
  return { open: true, pct: dl ? parseFloat(dl.dataset.pct) : null, box: r ? { x: r.x, y: r.y, w: r.width } : null, calls: window.__qaCalls.slice() };
});
const pt = (box, deg, rad) => ({ x: box.x + (210 + rad * Math.cos(deg * Math.PI / 180)) * box.w / 420, y: box.y + (210 + rad * Math.sin(deg * Math.PI / 180)) * box.w / 420 });

// A finger gesture as iOS WebKit delivers it (see the head): synthetic TouchEvents on the element under the
// first point; the first touchmove decides – not prevented → the popup scrolls, later moves are non-cancelable.
// hold: ms resting before the moves; jitter: tiny moves (1 px) while resting, like a real finger.
const ios = (page, points, { gap = 16, hold = 0, jitter = false } = {}) => page.evaluate(async ({ points, gap, hold, jitter }) => {
  const deepAt = (x, y) => { let el = document.elementFromPoint(x, y); while (el && el.shadowRoot) { const inner = el.shadowRoot.elementFromPoint(x, y); if (!inner || inner === el) break; el = inner; } return el; };
  const target = deepAt(points[0].x, points[0].y);
  const pop = window.casoraPopup && window.casoraPopup.element;
  const content = pop && pop.shadowRoot && pop.shadowRoot.querySelector('.content');
  let first = true, scrolling = false, last = points[0];
  const fire = (type, p) => {
    const t = new Touch({ identifier: 7, target, clientX: p.x, clientY: p.y, radiusX: 10, radiusY: 10 });
    const end = type === 'touchend';
    const cancelable = type === 'touchmove' ? !scrolling : true;
    const ev = new TouchEvent(type, { bubbles: true, cancelable, composed: true, touches: end ? [] : [t], targetTouches: end ? [] : [t], changedTouches: [t] });
    target.dispatchEvent(ev);
    if (type === 'touchmove') {
      if (first) { first = false; if (!ev.defaultPrevented) scrolling = true; }
      if (scrolling && content) content.scrollTop -= p.y - last.y;
      last = p;
    }
  };
  fire('touchstart', points[0]);
  if (hold) {
    const until = Date.now() + hold;
    let k = 0;
    while (Date.now() < until) { await new Promise((r) => setTimeout(r, 40)); if (jitter) fire('touchmove', { x: points[0].x + (k++ % 2), y: points[0].y + (k % 2) }); }
  }
  for (let i = 1; i < points.length; i++) { await new Promise((r) => setTimeout(r, gap)); fire('touchmove', points[i]); }
  fire('touchend', points[points.length - 1]);
  return { scrolled: scrolling, target: target && target.localName };
}, { points, gap, hold, jitter });
// A straight drag: a small first step (2 px, as a real finger starts), then 12 px steps.
const line = (p, dx, dy, n = 9) => [p, { x: p.x + Math.sign(dx) * 2 * (dx ? 1 : 0), y: p.y + Math.sign(dy) * 2 * (dy ? 1 : 0) }]
  .concat(Array.from({ length: n }, (_, i) => ({ x: p.x + dx * (i + 1), y: p.y + dy * (i + 1) })));
const arc = (box, from, to, n = 14) => Array.from({ length: n + 1 }, (_, i) => pt(box, from + (to - from) * Math.pow(i / n, 1.6), 150));
const gapFree = (page, p) => page.evaluate((p) => { let el = document.elementFromPoint(p.x, p.y); while (el && el.shadowRoot) { const i = el.shadowRoot.elementFromPoint(p.x, p.y); if (!i || i === el) break; el = i; }
  return !!(el && el.closest && el.closest('.hui-dl') && !el.closest('[role="button"]')); }, p);
const settle = (page) => page.waitForTimeout(500);
const knobAt = (s) => pt(s.box, 135 + s.pct / 100 * 270, 150);

// ── iPad (dialog, ≥ 761 px), both user agents: Safari for iPad and „Desktop website“ (Mac) ─────────────
for (const [tag, ua] of [['iPad', IPAD_UA], ['iPad desktop website', MAC_UA]]) {
  const { page } = await open({ width: 820, height: 1180, mobile: true, touch: true, userAgent: ua });
  usePage(page);
  await dashboard(page, dash.url, 3);
  await spy(page);
  const ids = await pick(page);
  for (const kind of ['climate', 'cover', 'light']) {
    const id = ids[kind];
    if (!id) { await check(`${tag}: a ${kind} with a dial in the house`, false, ids); continue; }
    const ok = await popupFor(page, kind, id, true);
    let s = await state(page);
    if (!(await check(`${tag} ${kind}: popup with a dial opens`, ok && s.box, s))) continue;
    // Start in the middle of the range so both directions can move.
    const mid = pt(s.box, 270, 150);
    const k0 = knobAt(s);
    // (a) knob dragged straight down (if it sits on the right half: clockwise = up) – turns.
    let p0 = s.pct;
    const right = k0.x > s.box.x + s.box.w / 2;
    let g = await ios(page, line(k0, 0, right ? -12 : 12));
    await settle(page); s = await state(page);
    await check(`${tag} ${kind}: knob dragged straight up/down turns the dial (not the page)`, s.open && s.pct !== p0 && !g.scrolled, { p0, s, g });
    // (b) along the ring's right side (mostly vertical there).
    p0 = s.pct;
    g = await ios(page, arc(s.box, p0 > 70 ? 20 : 330, p0 > 70 ? -30 : 380));
    await settle(page); s = await state(page);
    await check(`${tag} ${kind}: along the ring's side turns the dial`, s.open && s.pct !== p0 && !g.scrolled, { p0, s, g });
    // (c) rest a moment (finger jitter), then drag on the left side.
    p0 = s.pct;
    const L = pt(s.box, 180, 150);
    g = await ios(page, line(L, 0, p0 > 50 ? 12 : -12), { hold: 360, jitter: true });
    await settle(page); s = await state(page);
    await check(`${tag} ${kind}: resting, then dragging turns the dial`, s.open && s.pct !== p0 && !g.scrolled, { p0, s, g });
    // (d) a tap in the gap and (e) a swipe across the middle change nothing.
    await page.waitForTimeout(800);
    s = await state(page); p0 = s.pct;
    const calls0 = s.calls.length;
    const gp = pt(s.box, 90, 150);
    // Only where the gap is empty (a thermostat or cover may put a mode button there).
    if (await gapFree(page, gp)) { await page.touchscreen.tap(gp.x, gp.y); await page.waitForTimeout(600); }
    g = await ios(page, line(pt(s.box, 0, 0), 0, -14, 8));
    await page.waitForTimeout(700);
    s = await state(page);
    await check(`${tag} ${kind}: tap in the gap and swipe over the middle change nothing`, s.open && s.pct === p0 && s.calls.length === calls0, { p0, s, calls0 });
    void mid;
  }
  // A linear slider (brightness bar, UI.slider) in the open popup: dragging by finger sets it.
  const sl = await page.evaluate((L) => {
    const pop = window.casoraPopup.element; const c = pop.shadowRoot.querySelector('.content');
    const box = document.createElement('div'); box.className = 'qa-lin'; box.style.cssText = 'padding:12px 0;';
    box.innerHTML = window._casoraUI.slider({ value: 20, softHeight: 58, bar: true, icon: 'light', svc: { domain: 'light', service: 'turn_on', field: 'brightness_pct', target: { entity_id: L } } });
    c.insertBefore(box, c.firstChild);
    const el = box.querySelector('[data-casora-slider]'); const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y + r.height / 2, w: r.width };
  }, ids.light);
  await page.waitForTimeout(400);
  await page.evaluate(() => { window.__qaCalls = []; });
  {
    const cdp = await page.context().newCDPSession(page);
    const tp = (x, y) => [{ x, y, id: 1, radiusX: 10, radiusY: 10, force: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(sl.x + sl.w * 0.2, sl.y) });
    for (let i = 1; i <= 10; i++) { await page.waitForTimeout(16); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(sl.x + sl.w * (0.2 + i * 0.05), sl.y + (i % 2)) }); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  await page.waitForTimeout(600);
  const lc = await page.evaluate(() => window.__qaCalls.slice());
  await check(`${tag}: linear slider dragged by finger sets the value`, lc.length === 1 && /brightness_pct":(6\d|7\d)/.test(lc[0]), lc);
  await page.context().browser().close();
}

// ── iPad WebKit: − / + by real touch taps on the thermostat ─────────────────────────────
{
  const { page } = await open({ width: 820, height: 1180, mobile: true, touch: true, safari: true, userAgent: IPAD_UA });
  usePage(page);
  await dashboard(page, dash.url, 3);
  await spy(page);
  const ids = await pick(page);
  const ok = ids.climate && await popupFor(page, 'climate', ids.climate, true);
  await need('WebKit iPad: thermostat popup', ok, ids);
  await page.waitForTimeout(700);
  const btn = (l) => page.evaluate((l) => window.__pierce('.hui-st-b', window.casoraPopup.element.shadowRoot)
    .filter((b) => b.getAttribute('role') === 'button' && b.getBoundingClientRect().width > 0 && !b.classList.contains('dis') && b.getAttribute('aria-label') === l)
    .map((b) => { const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, l }; })[0] || null, l);
  // Calls are only recorded, so the target stays: at a limit one of them is greyed – check the other.
  const live = [(await btn('Weniger')), (await btn('Mehr'))].filter(Boolean);
  await need('WebKit iPad: − / + in the thermostat', live.length >= 1, live);
  for (const b of live) {
    const s0 = await state(page);
    await page.touchscreen.tap(b.x, b.y);
    await page.waitForTimeout(1300);
    const s1 = await state(page);
    await check(`WebKit iPad: tap on „${b.l}“ steps the target`, s1.open && s1.calls.length > s0.calls.length && /climate\.set_temperature/.test(s1.calls[s1.calls.length - 1]), { s0, s1 });
  }
}

// ── Phone (sheet, 393 px) ──────────────────────────────────────────────────
{
  const { page } = await open({ width: 393, height: 852, mobile: true });
  usePage(page);
  await dashboard(page, dash.url, 3);
  await spy(page);
  const ids = await pick(page);
  for (const kind of ['climate', 'light']) {
    const ok = ids[kind] && await popupFor(page, kind, ids[kind], true);
    let s = await state(page);
    if (!(await check(`phone ${kind}: popup with a dial opens`, ok && s.box, s))) continue;
    let p0 = s.pct;
    const k0 = knobAt(s);
    const right = k0.x > s.box.x + s.box.w / 2;
    let g = await ios(page, line(k0, 0, right ? -12 : 12));
    await settle(page); s = await state(page);
    await check(`phone ${kind}: knob dragged straight up/down turns the dial`, s.open && s.pct !== p0 && !g.scrolled, { p0, s, g });
    await page.waitForTimeout(800);
    s = await state(page); p0 = s.pct;
    const calls0 = s.calls.length;
    const gp = pt(s.box, 90, 150);
    // Only where the gap is empty (a thermostat or cover may put a mode button there).
    if (await gapFree(page, gp)) { await page.touchscreen.tap(gp.x, gp.y); await page.waitForTimeout(600); }
    g = await ios(page, line(pt(s.box, 0, 0), 0, -14, 8));
    await page.waitForTimeout(700);
    s = await state(page);
    await check(`phone ${kind}: tap in the gap and swipe over the middle change nothing`, s.open && s.pct === p0 && s.calls.length === calls0, { p0, s, calls0 });
  }
}

// ── Desktop (mouse) ───────────────────────────────────────────────────────
{
  const { page } = await open({ width: 1440, height: 900 });
  usePage(page);
  await dashboard(page, dash.url, 3);
  await spy(page);
  const ids = await pick(page);
  const ok = ids.climate && await popupFor(page, 'climate', ids.climate, false);
  let s = await state(page);
  await need('desktop: thermostat popup', ok && s.box, s);
  const a = pt(s.box, s.pct > 50 ? 250 : 200, 150), b = pt(s.box, s.pct > 50 ? 200 : 250, 150);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 6 }); await page.mouse.up();
  await page.waitForTimeout(800);
  s = await state(page);
  await check('desktop: dragging the ring with the mouse still sets the value', s.open && s.calls.length === 1, s);
}

await finish();
