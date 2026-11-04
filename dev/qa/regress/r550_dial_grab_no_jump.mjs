// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/casora-core.js#sliderRelink,sliderWatch,tdialGrab,tdialTarget,tdialDrop,tdialMove,tdialEnd,endDrag
// Reported (owner, iPhone, 04.11.2026, light popup v3): "Wenn man den Ring bedient (Helligkeit), springt der Ring ab
// und zu" – press and hold on the ring, then move: the value jumped by 5–7 % first and only then followed the finger,
// "irgendwie im 62/63 bis 65 % Bereich". Causes found:
// (1) the turn was counted from where the finger first touched, not from where turning started: what the finger did
//     before came on top of the first painted step – on iOS the drift of a resting finger (the contact settling as it
//     is pressed, reported only with the first real move), in Chromium the moves held back inside its touch slop
//     (+3–4 % at once);
// (2) a state change of the lamp while the ring is held redraws the popup: the dial under the finger is replaced by
//     one at the old value, the browser sends the touch's further events to the removed element only – the ring
//     snapped back, stopped following and nothing was sent.
// Expected (phone sheet, finger ~10° clockwise of the knob, held, then moved counter-clockwise, at 63 % and 74 %, also
// back and forth around 60–66 %): the value never rises above the start, no step between two painted values is
// larger than 2 %, release sends one call with the shown value; a redraw while turning keeps the dragged value and
// turning goes on; a tap or a hold without moving changes nothing. Real touch via CDP (Chromium) and iOS-style
// synthetic touches (every move delivered; with a drift of the resting finger reported by the first move).
// The lamp is faked in the browser, service calls are only recorded.
import { open, casoraDashboard, dashboard, fakeStates, check, need, finish, usePage } from './lib.mjs';

const dash = (await casoraDashboard((d) => d.url === 'qa-arbeit')) || (await casoraDashboard());
await need('a Casora dashboard', dash);
const L = 'light.qa_dial_grab';
const lamp = (pct, extra = {}) => ({ [L]: { state: 'on', attributes: { friendly_name: 'Grab lamp', brightness: Math.round(pct * 2.55),
  supported_color_modes: ['brightness'], color_mode: 'brightness', supported_features: 32, ...extra } } });

// Record light calls instead of sending them, and every value painted on a dial.
const spy = (page) => page.evaluate(() => {
  const conn = document.querySelector('home-assistant').hass.connection;
  window.__qaCalls = [];
  const orig = conn.sendMessagePromise.bind(conn);
  conn.sendMessagePromise = (m) => {
    if (m && m.type === 'call_service' && m.domain === 'light') { window.__qaCalls.push(m.service + ':' + JSON.stringify(m.service_data || {})); return Promise.resolve({ context: { id: 'qa' } }); }
    return orig(m);
  };
  const UI = window._casoraUI;
  window.__qaPaints = [];
  if (UI && !UI.__qaWrap) {
    UI.__qaWrap = true;
    const p0 = UI.dialPaint;
    UI.dialPaint = function (el, pct) { window.__qaPaints.push(Number(pct)); return p0.apply(this, arguments); };
  }
});

async function popup(page, pct) {
  await page.evaluate(() => { const p = window.casoraPopup; if (p && p.element && p.element.hasAttribute('open')) p.close(); });
  await page.waitForTimeout(700);
  await fakeStates(page, lamp(pct), { sticky: true });
  await page.evaluate((L) => window.loadCardHelpers().then((h) => {
    const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_light', entity: L, name: 'Grab lamp' });
    el.classList.add('qa-dial-tile'); el.hass = document.querySelector('home-assistant').hass;
    el.style.cssText = 'position:fixed;left:20px;top:120px;width:170px;height:100px;z-index:99999;';
    document.querySelector('home-assistant').shadowRoot.appendChild(el);
  }), L);
  await page.waitForTimeout(1500);
  const t = await page.evaluate(() => { const r = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-dial-tile').getBoundingClientRect(); return { x: r.x + r.width - 30, y: r.y + r.height / 2 }; });
  await page.touchscreen.tap(t.x, t.y);
  await page.waitForFunction(() => { const p = window.casoraPopup && window.casoraPopup.element; return p && p.hasAttribute('open') && window.__pierce('.hui-dl', p.shadowRoot).some((e) => e.getBoundingClientRect().width > 0); }, null, { timeout: 15000 }).catch(() => {});
  await page.evaluate(() => document.querySelector('home-assistant').shadowRoot.querySelectorAll('.qa-dial-tile').forEach((e) => e.remove()));
  await page.waitForTimeout(1200);
  await page.evaluate(() => { window.__qaCalls = []; window.__qaPaints = []; });
}
const state = (page) => page.evaluate(() => {
  const pop = window.casoraPopup && window.casoraPopup.element;
  if (!pop || !pop.hasAttribute('open') || pop.hasAttribute('closing')) return { open: false, calls: window.__qaCalls.slice() };
  const dl = window.__pierce('.hui-dl', pop.shadowRoot).find((e) => e.getBoundingClientRect().width > 0);
  const r = dl && dl.getBoundingClientRect();
  return { open: true, pct: dl ? parseFloat(dl.dataset.pct) : null, box: r ? { x: r.x, y: r.y, w: r.width } : null, calls: window.__qaCalls.slice() };
});
const pt = (box, deg, rad = 150) => ({ x: box.x + (210 + rad * Math.cos(deg * Math.PI / 180)) * box.w / 420, y: box.y + (210 + rad * Math.sin(deg * Math.PI / 180)) * box.w / 420 });
const knobDeg = (pct) => 135 + pct / 100 * 270;

// A finger: start, rest (hold ms), then the moves; mid(i) runs after move i (a redraw). Real touch through CDP, or
// iOS-style synthetic TouchEvents on the element first touched (every move delivered; drift: the resting finger's
// settling, reported with the first move; a removed target keeps the events, as in the browser). Returns the visible dial value after each move.
async function finger(page, mode, start, moves, { hold = 400, mid = null, gap = 24, drift = null } = {}) {
  const seen = [];
  const vis = () => page.evaluate(() => { const pop = window.casoraPopup.element; const dl = window.__pierce('.hui-dl', pop.shadowRoot).find((e) => e.getBoundingClientRect().width > 0); return dl ? parseFloat(dl.dataset.pct) : null; });
  if (mode === 'cdp') {
    const cdp = await page.context().newCDPSession(page);
    const tp = (p) => [{ x: p.x, y: p.y, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(start) });
    await page.waitForTimeout(hold);
    for (let i = 0; i < moves.length; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(moves[i]) });
      await page.waitForTimeout(gap);
      if (mid) await mid(i);
      seen.push(await vis());
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach().catch(() => {});
  } else {
    await page.evaluate((p) => {
      const deepAt = (x, y) => { let el = document.elementFromPoint(x, y); while (el && el.shadowRoot) { const inner = el.shadowRoot.elementFromPoint(x, y); if (!inner || inner === el) break; el = inner; } return el; };
      const target = deepAt(p.x, p.y);
      window.__qaTouch = (type, q) => {
        const t = new Touch({ identifier: 7, target, clientX: q.x, clientY: q.y, radiusX: 10, radiusY: 10 });
        const end = type === 'touchend';
        target.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, composed: true, touches: end ? [] : [t], targetTouches: end ? [] : [t], changedTouches: [t] }));
      };
      window.__qaTouch('touchstart', p);
    }, start);
    await page.waitForTimeout(hold);
    if (drift) await page.evaluate((q) => window.__qaTouch('touchmove', q), { x: start.x + drift.x, y: start.y + drift.y });
    for (let i = 0; i < moves.length; i++) {
      await page.evaluate((q) => window.__qaTouch('touchmove', q), moves[i]);
      await page.waitForTimeout(gap);
      if (mid) await mid(i);
      seen.push(await vis());
    }
    await page.evaluate((q) => window.__qaTouch('touchend', q), moves[moves.length - 1] || start);
  }
  await page.waitForTimeout(400);
  return seen;
}
const paints = (page) => page.evaluate(() => window.__qaPaints.splice(0));
const steps = (from, list) => { const all = [from].concat(list); return all.slice(1).map((v, i) => Math.abs(v - all[i])); };
const reset = async (page, pct) => {
  await fakeStates(page, lamp(pct, { qa_tick: Date.now() }), { sticky: true });
  await page.waitForTimeout(800);
  await page.evaluate(() => { window.__qaCalls = []; window.__qaPaints = []; });
};

const { page } = await open({ width: 393, height: 852, mobile: true, theme: 'Casora' });
usePage(page);
await dashboard(page, dash.url, 3);
await spy(page);

for (const mode of ['cdp', 'ios']) {
  for (const V of [63, 74]) {
    const tag = `${mode} ${V} %`;
    await popup(page, V);
    let s = await state(page);
    if (!(await check(`${tag}: light popup with a dial at ${V} %`, s.open && s.box && s.pct === V, s))) continue;
    // (1) ~10° clockwise of the knob, held, then counter-clockwise in 1.5° steps.
    const a0 = knobDeg(V) + 10;
    // iOS: the thumb settles 14 px down while it rests (the moves then go on from there).
    const drift = mode === 'ios' ? { x: 0, y: 14 } : null;
    const sh = (p) => (drift ? { x: p.x + drift.x, y: p.y + drift.y } : p);
    let seen = await finger(page, mode, pt(s.box, a0), Array.from({ length: 16 }, (_, i) => sh(pt(s.box, a0 - 1.5 * (i + 1)))), { drift });
    let pp = await paints(page);
    s = await state(page);
    await check(`${tag}: grabbing and turning back never rises above the start`, Math.max(...pp, ...seen) <= V, { V, pp, seen });
    await check(`${tag}: no jump on grabbing – every step ≤ 2 %`, pp.length > 3 && Math.max(...steps(V, pp)) <= 2, { V, pp });
    // The faked lamp never reports the call: after release a redraw may show its old value again – compare the call
    // with the last value shown while turning.
    const last = (list) => list[list.length - 1];
    await check(`${tag}: the value went down with the finger, one call with the shown value`, last(pp) < V - 4
      && s.calls.length === 1 && s.calls[0] === 'turn_on:' + JSON.stringify({ brightness_pct: last(pp) }), { s, pp });
    await reset(page, V);
    // Back and forth around 60–66 %.
    if (V === 63) {
      s = await state(page);
      const k = knobDeg(V);
      const path = [];
      // ±12° (±4.4 %): Chromium holds back the first moves inside its touch slop.
      for (const [f, t] of [[k, k - 12], [k - 12, k + 12], [k + 12, k - 8]]) for (let i = 1; i <= 10; i++) path.push(pt(s.box, f + (t - f) * i / 10));
      seen = await finger(page, mode, pt(s.box, k), path, { hold: 300 });
      pp = await paints(page);
      s = await state(page);
      // The finger spans 24° (8.9 %): the value never spans more (no jump), and it went up and back down.
      await check(`${tag}: back and forth around 60–66 % – no step over 2 %, span ≤ 9 %, follows both ways`, pp.length > 6 && Math.max(...steps(V, pp)) <= 2
        && Math.max(...pp) - Math.min(...pp) <= 9 && Math.max(...pp) > V && last(pp) < Math.max(...pp), { pp, seen });
      await check(`${tag}: … one call with the shown value`, s.calls.length === 1 && s.calls[0] === 'turn_on:' + JSON.stringify({ brightness_pct: last(pp) }), { s, pp });
      await reset(page, V);
    }
    // (2) The lamp changes (a report) while the ring is turned: the popup redraws, the turn goes on.
    s = await state(page);
    const b0 = knobDeg(V);
    let redrawn = null;
    seen = await finger(page, mode, pt(s.box, b0), Array.from({ length: 18 }, (_, i) => pt(s.box, b0 - 1.5 * (i + 1))), {
      mid: async (i) => {
        if (i !== 10) return;
        const before = await page.evaluate(() => { const pop = window.casoraPopup.element; window.__qaDl = window.__pierce('.hui-dl', pop.shadowRoot).find((e) => e.getBoundingClientRect().width > 0); return parseFloat(window.__qaDl.dataset.pct); });
        await fakeStates(page, lamp(V, { qa_tick: Date.now() }), { sticky: true });
        await page.waitForTimeout(250);
        redrawn = await page.evaluate(() => { const pop = window.casoraPopup.element; const dl = window.__pierce('.hui-dl', pop.shadowRoot).find((e) => e.getBoundingClientRect().width > 0); return { replaced: dl !== window.__qaDl, pct: parseFloat(dl.dataset.pct) }; });
        redrawn.before = before;
      },
    });
    s = await state(page);
    if (!redrawn || !redrawn.replaced) console.log('  info   ' + tag + ': the lamp report did not redraw the dial – redraw while turning not checked', redrawn);
    else {
      await check(`${tag}: a redraw while turning keeps the dragged value (no snap back)`, redrawn.pct === redrawn.before && redrawn.pct < V, { redrawn, seen });
      await check(`${tag}: … turning goes on after the redraw`, seen[seen.length - 1] < redrawn.pct, { redrawn, seen });
      await check(`${tag}: … release sends the turned value once`, s.calls.length === 1 && s.calls[0] === 'turn_on:' + JSON.stringify({ brightness_pct: seen[seen.length - 1] }), { s, seen });
    }
    await reset(page, V);
    // (3) A tap on the ring and a hold without moving change nothing.
    s = await state(page);
    const tp = pt(s.box, knobDeg(V) + 10);
    await page.touchscreen.tap(tp.x, tp.y);
    await page.waitForTimeout(500);
    await finger(page, mode, tp, [], { hold: 500 });
    await page.waitForTimeout(500);
    s = await state(page);
    await check(`${tag}: a tap and a hold on the ring without moving change nothing, send nothing`, s.open && s.pct === V && s.calls.length === 0, s);
  }
}
await finish();
