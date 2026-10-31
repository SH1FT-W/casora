// @zustand: arbeit
// @parallel: ui
// Prüfung 2 (DH-01, DH-02, fam-01, fam-02, DD-01): on the phone, turning the dial dragged the whole sheet down
// and closed the popup; a vertical swipe over the ring (meant to scroll) set the value; a tap in the open gap at
// the bottom jumped to 0 or 100 %; on the desktop a click into the dial's middle closed the popup.
// Expected (phone, WebKit, touch): turning from the knob or along the ring changes the value, the sheet stays
// and the popup stays open; a vertical swipe on the ring's side, a swipe from the middle, a tap in the gap or
// in the middle change nothing and send nothing; the dial is not touch-action:none. Desktop (Chromium, mouse):
// a click into the middle or the gap neither closes nor changes anything; dragging the ring still works.
// The light is faked in the browser, service calls are only recorded.
import { open, casoraDashboard, dashboard, fakeStates, check, need, finish, usePage } from './lib.mjs';

const dash = (await casoraDashboard((d) => d.url === 'qa-arbeit')) || (await casoraDashboard());
await need('a Casora dashboard', dash);
const L = 'light.qa_dial_test';

// Record light service calls instead of sending them (again after each page load).
const spy = (page) => page.evaluate(() => {
  const conn = document.querySelector('home-assistant').hass.connection;
  window.__qaCalls = [];
  const orig = conn.sendMessagePromise.bind(conn);
  conn.sendMessagePromise = (m) => {
    if (m && m.type === 'call_service' && m.domain === 'light') { window.__qaCalls.push(m.service + ':' + JSON.stringify(m.service_data || {})); return Promise.resolve({ context: { id: 'qa' } }); }
    return orig(m);
  };
});

async function setup(opts) {
  const { page } = await open(opts);
  usePage(page);
  await dashboard(page, dash.url, 3);
  await fakeStates(page, { [L]: { state: 'on', attributes: { friendly_name: 'Dial lamp', brightness: 128,
    supported_color_modes: ['brightness'], color_mode: 'brightness', supported_features: 32 } } }, { sticky: true });
  await spy(page);
  await page.evaluate((L) => window.loadCardHelpers().then((h) => {
    const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_light', entity: L, name: 'Dial lamp' });
    el.classList.add('qa-dial-tile'); el.hass = document.querySelector('home-assistant').hass;
    el.style.cssText = 'position:fixed;left:20px;top:120px;width:170px;height:100px;z-index:99999;';
    document.querySelector('home-assistant').shadowRoot.appendChild(el);
  }), L);
  await page.waitForTimeout(1500);
  const t = await page.evaluate(() => { const r = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-dial-tile').getBoundingClientRect(); return { x: r.x + r.width - 30, y: r.y + r.height / 2 }; });
  if (opts.mobile) await page.touchscreen.tap(t.x, t.y); else await page.mouse.click(t.x, t.y);
  await page.waitForFunction(() => { const p = window.casoraPopup && window.casoraPopup.element; return p && p.hasAttribute('open') && window.__pierce('.hui-dl', p.shadowRoot).length; }, null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1200);
  return page;
}
// Popup, dial geometry (point at angle/radius in the dial's 420 viewBox → page coordinates), sheet offset.
const state = (page) => page.evaluate(() => {
  const pop = window.casoraPopup && window.casoraPopup.element;
  if (!pop || !pop.hasAttribute('open') || pop.hasAttribute('closing')) return { open: false, calls: window.__qaCalls.slice() };
  const dl = window.__pierce('.hui-dl', pop.shadowRoot).find((e) => e.getBoundingClientRect().width > 0);
  const surf = pop.shadowRoot.querySelector('.surface');
  const r = dl && dl.getBoundingClientRect();
  return { open: true, pct: dl ? parseFloat(dl.dataset.pct) : null, box: r ? { x: r.x, y: r.y, w: r.width } : null,
    ta: dl ? getComputedStyle(dl).touchAction : null, sheet: surf ? surf.style.transform || '' : '', calls: window.__qaCalls.slice() };
});
const pt = (box, deg, rad) => ({ x: box.x + (210 + rad * Math.cos(deg * Math.PI / 180)) * box.w / 420, y: box.y + (210 + rad * Math.sin(deg * Math.PI / 180)) * box.w / 420 });
// A finger gesture: real touch through CDP in Chromium (the browser scrolls natively), otherwise synthetic
// TouchEvents on the element under the point (composed, through the shadow roots). Reports the sheet's
// largest downward offset during the gesture.
const touch = async (page, points, gap = 16) => {
  await page.evaluate(() => {
    const surf = window.casoraPopup.element.shadowRoot.querySelector('.surface');
    window.__qaSheet = 0;
    const tick = () => { const m = /translateY\(([\d.]+)px\)/.exec(surf.style.transform || ''); if (m) window.__qaSheet = Math.max(window.__qaSheet, parseFloat(m[1])); if (window.__qaWatch) requestAnimationFrame(tick); };
    window.__qaWatch = true; requestAnimationFrame(tick);
  });
  let how = null;
  let cdp = null;
  try { cdp = await page.context().newCDPSession(page); } catch (e) { cdp = null; }
  if (cdp) {
    how = 'cdp';
    const tp = (p) => [{ x: p.x, y: p.y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(points[0]) });
    for (let i = 1; i < points.length; i++) { await page.waitForTimeout(gap); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(points[i]) }); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    how = await page.evaluate(async ({ points, gap }) => {
      const deepAt = (x, y) => { let el = document.elementFromPoint(x, y); while (el && el.shadowRoot) { const inner = el.shadowRoot.elementFromPoint(x, y); if (!inner || inner === el) break; el = inner; } return el; };
      try { new Touch({ identifier: 7, target: document.body, clientX: 1, clientY: 1 }); } catch (e) { return null; }
      const target = deepAt(points[0].x, points[0].y);
      const fire = (type, p) => {
        const t = new Touch({ identifier: 7, target, clientX: p.x, clientY: p.y });
        const end = type === 'touchend';
        target.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, composed: true, touches: end ? [] : [t], targetTouches: end ? [] : [t], changedTouches: [t] }));
      };
      fire('touchstart', points[0]);
      for (let i = 1; i < points.length; i++) { await new Promise((r) => setTimeout(r, gap)); fire('touchmove', points[i]); }
      fire('touchend', points[points.length - 1]);
      return 'synthetic';
    }, { points, gap });
  }
  await page.waitForTimeout(450);
  const maxSheet = await page.evaluate(() => { window.__qaWatch = false; return window.__qaSheet; });
  return { touch: !!how, how, maxSheet };
};
const arc = (box, from, to, n = 10, rad = 150) => Array.from({ length: n + 1 }, (_, i) => pt(box, from + (to - from) * i / n, rad));

// ── Phone (WebKit and Chromium, touch) ─────────────────────────────────────
for (const safari of [true, false]) {
  const tag = safari ? 'WebKit' : 'Chromium';
  const page = await setup({ width: 393, height: safari ? 852 : 560, mobile: true, safari, dark: !safari, theme: 'Casora' });
  let s = await state(page);
  await need(tag + ': light popup with a dial', s.open && s.box, s);
  await check(tag + ': ' + 'dial is not touch-action:none (the sheet scrolls over it)', s.ta && s.ta !== 'none', s.ta);
  const p0 = s.pct;
  // Taps (real touch taps in both engines): the gap at the bottom and the middle change nothing.
  for (const [what, deg, rad] of [['gap (right of the middle)', 80, 150], ['gap (left of the middle)', 100, 150], ['middle', 270, 30]]) {
    const q = pt(s.box, deg, rad);
    await page.touchscreen.tap(q.x, q.y); await page.waitForTimeout(700);
    s = await state(page);
    await check(tag + ': ' + `tap in the ${what}: popup open, value unchanged, nothing sent`, s.open && s.pct === p0 && s.calls.length === 0, s);
  }
  // Vertical swipe up on the ring's left side (meant to scroll): nothing changes.
  const left = pt(s.box, 180, 150);
  const scroll = () => page.evaluate(() => { const p = window.casoraPopup && window.casoraPopup.element; const c = p && p.shadowRoot && p.shadowRoot.querySelector('.content'); return c ? { top: c.scrollTop, room: c.scrollHeight - c.clientHeight } : { top: 0, room: 0 }; });
  const sc0 = await scroll();
  let g = await touch(page, Array.from({ length: 8 }, (_, i) => ({ x: left.x, y: left.y - i * 14 })));
  if (!g.touch) console.log('  info   ' + tag + ': touch moves cannot be built in this browser – swipes and turning not checked here');
  else {
    s = await state(page);
    await check(tag + ': vertical swipe over the ring: value unchanged, nothing sent, sheet still', s.open && s.pct === p0 && s.calls.length === 0 && g.maxSheet === 0, { s, g });
    const sc1 = await scroll();
    if (g.how === 'cdp' && sc0.room > 20) await check(tag + ': … and the sheet scrolled instead', sc1.top > sc0.top, { sc0, sc1 });
    else console.log('  info   ' + tag + ': sheet scrolling over the ring not measured (' + (g.how === 'cdp' ? 'nothing to scroll' : 'synthetic touch') + ')');
    await page.evaluate(() => { window.casoraPopup.element.shadowRoot.querySelector('.content').scrollTop = 0; });
    await page.waitForTimeout(300);
    s = await state(page);
    const mid = pt(s.box, 270, 0);
    g = await touch(page, Array.from({ length: 8 }, (_, i) => ({ x: mid.x, y: mid.y - i * 14 })));
    s = await state(page);
    await check(tag + ': swipe from the middle: value unchanged, nothing sent', s.open && s.pct === p0 && s.calls.length === 0, { s, g });
    // DH-01: thumb on the ring top right, turn clockwise downwards (not from the knob).
    const start = s.pct;
    g = await touch(page, arc(s.box, 315, 375, 12));
    s = await state(page);
    await check(tag + ': turning along the ring changes the value', s.open && s.pct > start, { start, s, g });
    await check(tag + ': turning does not move the sheet', g.maxSheet === 0 && !/translateY\([1-9]/.test(s.sheet), { g, sheet: s.sheet });
    await page.waitForTimeout(700);
    s = await state(page);
    await check(tag + ': popup still open after turning, one light call', s.open && s.calls.length === 1 && /^turn_on:/.test(s.calls[0]), s);
    // From the knob: turning back counter-clockwise works too.
    const kAng = 135 + s.pct / 100 * 270, before = s.pct;
    await touch(page, arc(s.box, kAng, kAng - 40, 8));
    s = await state(page);
    await check(tag + ': turning from the knob back lowers the value, popup open', s.open && s.pct < before && s.calls.length === 2, { before, s });
    // DH-02 with a popup taller than the screen (house lighting on the phone dashboard): a vertical swipe
    // starting on the ring's side scrolls the sheet and changes nothing.
    if (g.how === 'cdp') {
      await page.evaluate(() => window.casoraPopup.close());
      await page.waitForTimeout(800);
      await dashboard(page, dash.url + '-mobile', 3).catch(() => {});
      await spy(page);
      const badge = await page.evaluate(() => { const b = window.__pierce('button-card').find((e) => e.getBoundingClientRect().width > 0
        && /Beleuchtung/.test((e.shadowRoot && e.shadowRoot.textContent) || '')); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
      if (badge) {
        await page.touchscreen.tap(badge.x, badge.y);
        await page.waitForFunction(() => { const p = window.casoraPopup && window.casoraPopup.element; return p && p.hasAttribute('open') && window.__pierce('.hui-dl', p.shadowRoot).length; }, null, { timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(1200);
        s = await state(page);
        const c0 = await scroll(), calls0 = s.calls.length, q0 = s.pct;
        if (s.box && c0.room > 40) {
          const side = pt(s.box, 180, 150);
          g = await touch(page, Array.from({ length: 10 }, (_, i) => ({ x: side.x, y: side.y - i * 16 })));
          await page.waitForTimeout(500);
          const c1 = await scroll();
          s = await state(page);
          await check(tag + ': tall popup – swipe up on the ring scrolls the sheet', c1.top > c0.top + 20, { c0, c1, g });
          await check(tag + ': tall popup – … without touching the value', s.open && s.pct === q0 && s.calls.length === calls0, s);
        } else console.log('  info   ' + tag + ': house lighting popup not scrollable here – scrolling over the ring not measured');
      } else console.log('  info   ' + tag + ': no lighting badge on the phone dashboard – scrolling over the ring not measured');
    }
  }
}

// ── Desktop (Chromium, mouse) ─────────────────────────────────────────────
{
  const page = await setup({ width: 1440, height: 900, dark: true, theme: 'Casora' });
  let s = await state(page);
  await need('desktop: light popup with a dial', s.open && s.box, s);
  const p0 = s.pct;
  for (const [what, deg, rad] of [['middle', 270, 20], ['gap', 90, 150]]) {
    const q = pt(s.box, deg, rad);
    await page.mouse.click(q.x, q.y); await page.waitForTimeout(800);
    s = await state(page);
    await check(`desktop: click in the dial's ${what} keeps the popup open and the value`, s.open && s.pct === p0 && s.calls.length === 0, s);
  }
  const a = pt(s.box, 200, 150), b = pt(s.box, 250, 150);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 6 }); await page.mouse.up();
  await page.waitForTimeout(800);
  s = await state(page);
  await check('desktop: dragging the ring still sets the value', s.open && s.calls.length === 1, s);
}

await finish();
