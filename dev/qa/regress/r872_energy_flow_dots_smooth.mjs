// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/05-weich-mehr.js#flowE1,flowE1Dots,flowE1Paths
// Owner (beta 26.11.28b4, his own devices): the dots of the energy flow in the energy popup are not smooth, they
// stutter again and again. Cause: the dots were a dashed stroke moved by stroke-dashoffset. That property is animated
// on the page's main thread and repainted every frame, so each state update (all cards recompute) held the dots
// for some frames; measured with a 6x slower processor: no frame over 50 ms without updates, one per update with them.
// Expected (Chromium and WebKit phone 393x852, Chromium desktop): the dots animate transform/opacity only (what a
// browser moves in its compositor), during 20 state updates no dot animation starts anew, none jumps back or ahead,
// no node of the flow is replaced; and in Chromium the dots keep moving on screen while the page is busy for 0.7 s.
// The sensors exist only in the browser (invented ids), nothing is saved.
import { open, casoraDashboard, dashboard, fakeStates, check, need, finish, stable, usePage } from './lib.mjs';

const dash = await casoraDashboard();
await need('a Casora dashboard', dash);
const ID = {
  home: 'sensor.qa_r872_home', solar: 'sensor.qa_r872_solar', soc: 'sensor.qa_r872_soc', grid: 'sensor.qa_r872_grid',
  chg: 'sensor.qa_r872_charge', dis: 'sensor.qa_r872_discharge', out: 'sensor.qa_r872_output', exp: 'sensor.qa_r872_export',
};
const W = { unit_of_measurement: 'W', device_class: 'power', state_class: 'measurement' };
const START = {
  [ID.home]: { state: '420', attributes: { ...W, friendly_name: 'Haus' } },
  [ID.solar]: { state: '900', attributes: { ...W, friendly_name: 'Solar' } },
  [ID.soc]: { state: '60', attributes: { unit_of_measurement: '%', device_class: 'battery', friendly_name: 'Akku' } },
  [ID.grid]: { state: '30', attributes: { ...W, friendly_name: 'Netz' } },
  [ID.chg]: { state: '300', attributes: { ...W, friendly_name: 'Laden' } },
  [ID.dis]: { state: '0', attributes: { ...W, friendly_name: 'Entladen' } },
  [ID.out]: { state: '600', attributes: { ...W, friendly_name: 'Ausgang' } },
  [ID.exp]: { state: '0', attributes: { ...W, friendly_name: 'Einspeisung' } },
};
// The flow of the open popup (in the page).
const FIND = () => {
  const pop = window.__pierce('casora-popup').find((p) => p.hasAttribute('open'));
  return pop ? window.__pierce('[data-casora-kind="e1"]', pop.shadowRoot)[0] || null : null;
};
const inFlow = (page, body, arg) => page.evaluate(([f, body, arg]) => new Function('box', 'ID', 'arg', body)(new Function('return (' + f + ')()')(), arg && arg.ID, arg),
  [FIND.toString(), body, arg || null]);

for (const [tag, o] of [
  ['Chromium phone', { width: 393, height: 852, mobile: true, scale: 3 }],
  ['WebKit phone', { width: 393, height: 852, mobile: true, scale: 3, safari: true }],
  ['Chromium desktop', { width: 1440, height: 900 }],
]) {
  const { page, browser } = await open(o);
  usePage(page);
  await dashboard(page, dash.url, 3);
  await fakeStates(page, START, { sticky: true });
  // An energy tile with solar, battery and grid, made in the browser, then tapped.
  await page.evaluate(async ([I, left]) => {
    const h = await window.loadCardHelpers();
    const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_energy', entity: I.home,
      variables: { entity_solar_power: I.solar, entity_battery_soc: I.soc, entity_netz_power: I.grid,
        entity_battery_charge: I.chg, entity_battery_discharge: I.dis, entity_solarbank_output: I.out, entity_grid_export: I.exp } });
    el.classList.add('qa-r872');
    el.hass = document.querySelector('home-assistant').hass;
    el.style.cssText = 'position:fixed;left:' + left + 'px;top:300px;width:220px;height:140px;z-index:99999;';
    document.querySelector('home-assistant').shadowRoot.appendChild(el);
  }, [ID, o.mobile ? 80 : 400]);
  await page.waitForTimeout(1500);
  const at = await page.evaluate(() => { const el = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-r872');
    const r = (el.shadowRoot && el.shadowRoot.querySelector('ha-card') || el).getBoundingClientRect();
    return { x: r.x + Math.min(r.width, 200) / 2, y: r.y + Math.min(r.height, 120) / 2 }; });
  if (o.mobile) await page.touchscreen.tap(at.x, at.y); else await page.mouse.click(at.x, at.y);
  const n = await stable(page, (f) => { const box = new Function('return (' + f + ')()')(); return box ? box.querySelectorAll('[data-e1-dot]').length : 0; },
    FIND.toString(), { max: 12000, quiet: 1500 });
  await need(tag + ': the energy flow (E1) in the popup', n >= 3, n);
  // The tile lay over the popup only to be tapped.
  await page.evaluate(() => { const el = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-r872'); if (el) el.style.display = 'none'; });
  await page.waitForTimeout(1200);

  // 1. What the dots animate.
  const props = await inFlow(page, `
    const an = [...box.querySelectorAll('[data-e1-dot], [data-e1-dot] *')].flatMap((d) => d.getAnimations()).filter((a) => a.animationName);
    const keys = new Set();
    an.forEach((a) => a.effect.getKeyframes().forEach((k) => Object.keys(k).forEach((p) => { if (!['offset', 'computedOffset', 'easing', 'composite'].includes(p)) keys.add(p); })));
    return { anims: an.length, running: an.filter((a) => a.playState === 'running').length, props: [...keys].sort(),
      shown: [...box.querySelectorAll('[data-e1-dot]')].filter((d) => getComputedStyle(d).opacity === '1').length };`);
  await check(tag + ': dots are running on the lines with power', props.anims > 0 && props.running === props.anims && props.shown >= 2, props);
  await check(tag + ': the dots animate only transform and opacity (no stroke-dashoffset, no repaint per frame)',
    props.props.length > 0 && props.props.every((p) => p === 'transform' || p === 'opacity'), props);

  // 2. 5 s with a state update every 250 ms (power swinging, so the speed changes too): per frame the progress of
  // every dot animation against the document's clock.
  const r = await inFlow(page, `
    const ha = document.querySelector('home-assistant');
    const anims = () => [...box.querySelectorAll('[data-e1-dot], [data-e1-dot] *')].flatMap((d) => d.getAnimations()).filter((a) => a.animationName);
    const first = anims(), known = new Set(first);
    let restarts = 0, added = 0, removed = 0, i = 0, back = 0, jump = 0, worst = 0, frames = 0, rates = 0;
    const obs = new MutationObserver((ms) => ms.forEach((m) => { added += [...m.addedNodes].filter((x) => x.nodeType === 1).length; removed += [...m.removedNodes].filter((x) => x.nodeType === 1).length; }));
    obs.observe(box, { childList: true, subtree: true });
    const nodes = [...box.querySelectorAll('[data-e1-dot], [data-e1-dot] *, [data-e1-line], [data-e1-node], svg')];
    const push = () => {
      i++;
      const s = ha.__qaSticky, v = (id, val) => { s[id] = { ...s[id], state: String(val) }; };
      v(ID.home, 420 + i * 37); v(ID.solar, 900 + i * 53 + (i % 2) * 2500); v(ID.grid, 30 + i * 11 + (i % 3) * 800);
      v(ID.chg, 300 + i * 13 + (i % 2) * 900); v(ID.out, 600 + i * 40);
      ha._updateHass({ states: { ...ha.hass.states } });
    };
    const iv = setInterval(push, 250);
    const t0 = performance.now();
    let last = null;
    return new Promise((done) => {
      const step = () => {
        frames++;
        anims().forEach((a) => { if (!known.has(a)) { known.add(a); restarts++; } });
        const now = { tl: document.timeline.currentTime, t: first.map((a) => a.currentTime), r: first.map((a) => a.playbackRate) };
        if (last) first.forEach((a, k) => {
          if (now.t[k] == null || last.t[k] == null) return;
          const dt = now.tl - last.tl, da = now.t[k] - last.t[k];
          if (now.r[k] !== last.r[k]) rates++;
          const lo = Math.min(now.r[k], last.r[k]), hi = Math.max(now.r[k], last.r[k]);
          if (da < -0.5) back++;
          else if (da < dt * lo - 3 || da > dt * hi + 3) { jump++; worst = Math.max(worst, Math.abs(da - dt * hi)); }
        });
        last = now;
        if (performance.now() - t0 < 5000) requestAnimationFrame(step);
        else { clearInterval(iv); obs.disconnect();
          done({ updates: i, frames, restarts, back, jump, worst: Math.round(worst), rates, added, removed, same: nodes.every((x) => x.isConnected && box.contains(x)),
            text: box.textContent.replace(/\\s+/g, ' ').slice(0, 160) }); }
      };
      requestAnimationFrame(step);
    });`, { ID });
  console.log('  ' + tag + ' ' + JSON.stringify(r));
  await check(tag + ': state updates arrived and changed the dots\' speed', r.updates >= 15 && r.rates > 0 && r.frames > 30, r);
  await check(tag + ': no dot animation starts anew during the updates', r.restarts === 0, r);
  await check(tag + ': no dot jumps back or ahead on an update', r.back === 0 && r.jump === 0, r);
  await check(tag + ': no node of the flow is replaced', r.added === 0 && r.removed === 0 && r.same, r);

  // 3. Chromium: the screen keeps getting new pictures of the dots while the page's main thread is busy.
  if (!o.safari) {
    const cdp = await page.context().newCDPSession(page);
    const got = [];
    cdp.on('Page.screencastFrame', (f) => { got.push({ ts: f.metadata.timestamp * 1000, data: f.data }); cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 60, everyNthFrame: 1 });
    await page.waitForTimeout(600);
    const busy = await page.evaluate(() => { const a = Date.now(); while (Date.now() - a < 700) { /* busy */ } return [a, Date.now()]; });
    await page.waitForTimeout(300);
    await cdp.send('Page.stopScreencast');
    const during = got.filter((f) => f.ts > busy[0] + 120 && f.ts < busy[1] - 30);
    const pictures = new Set(during.map((f) => f.data)).size;
    console.log('  ' + tag + ' pictures while busy: ' + pictures + ' (of ' + got.length + ' in all)');
    await check(tag + ': the dots keep moving while the page is busy for 0.7 s', pictures >= 4, { pictures, all: got.length });
  }
  await browser.close();
}
await finish();
