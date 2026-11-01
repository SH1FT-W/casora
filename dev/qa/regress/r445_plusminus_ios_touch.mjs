// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/03-popups.js
// Reported (the owner, real iPad and iPhone, HA Companion app, 26.11.2): turning the dial worked, but − / + under
// the dial of the floor heating (room popup v3) did nothing – no display change, no service call. Cause: the
// FBH popup is a button-card inside a button-card; the outer one stops the touchstart and dispatches a copy
// from its container, and the − / + listener took that copy as a new touch off the button.
// Expected (WebKit, Companion user agent, iPad dialog and iPhone sheet; thermostat and floor heating popup):
// a real touch tap steps exactly once (no second step from the click echo); a finger that wanders a few px
// (2–14 px) still steps; one that slides far off the button does not; four quick taps count four steps;
// the opt-in diagnostics (localStorage 'casora-debug-touch') write to system_log only when switched on.
// Service calls are recorded (and reach the test house's mock climate).
import { open, casoraDashboard, dashboard, check, need, finish, usePage } from './lib.mjs';

const dash = (await casoraDashboard((d) => d.url === 'qa-arbeit')) || (await casoraDashboard());
await need('a Casora dashboard', dash);
const UA = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Home Assistant/2026.10.0 (io.robbie.HomeAssistant; build:2026.1; iPadOS 27.2)';

for (const [dev, opts] of [
  ['iPad', { width: 820, height: 1180, mobile: true, touch: true, safari: true, userAgent: UA }],
  ['iPhone', { width: 390, height: 844, mobile: true, touch: true, safari: true, userAgent: UA.replace('iPad', 'iPhone').replace('iPadOS', 'iOS') }],
]) {
  const { page } = await open(opts);
  usePage(page);
  await dashboard(page, dash.url, 3);
  await page.evaluate(() => {
    const conn = document.querySelector('home-assistant').hass.connection;
    window.__qaCalls = [];
    const orig = conn.sendMessagePromise.bind(conn);
    conn.sendMessagePromise = (m) => {
      // Recorded and sent (the test house's climate is a mock): the popup follows the real state.
      if (m && m.type === 'call_service') window.__qaCalls.push(m.domain + '.' + m.service + ':' + JSON.stringify(m.service_data || {}));
      return orig(m);
    };
  });
  const id = await page.evaluate(() => {
    const st = document.querySelector('home-assistant').hass.states;
    const ids = Object.keys(st).filter((i) => /^climate\./.test(i) && !Array.isArray(st[i].attributes.member_entities) && !Array.isArray(st[i].attributes.entity_id)
      && (st[i].attributes.hvac_modes || []).includes('heat'));
    return ids.find((i) => st[i].state === 'heat') || ids[0];
  });
  await need(`${dev}: a single heating thermostat`, id);
  // Heat at 21 °C (mid-range), restored at the end.
  const before = await page.evaluate((id) => { const s = document.querySelector('home-assistant').hass.states[id]; return { m: s.state, t: s.attributes.temperature }; }, id);
  const svc = (s, d) => page.evaluate(([id, s, d]) => document.querySelector('home-assistant').hass.callService('climate', s, d, { entity_id: id }).then(() => 1, () => 0), [id, s, d]);
  await svc('set_hvac_mode', { hvac_mode: 'heat' }); await svc('set_temperature', { temperature: 21 });
  for (const [kind, tpl] of [['thermostat', 'casora_thermostat'], ['floor heating', ['casora_thermostat', 'casora_popup_fbh']]]) {
    const tag = `${dev} ${kind}`;
    await page.evaluate(([id, tpl]) => new Promise((res) => {
      if (window.casoraPopup) window.casoraPopup.close();
      setTimeout(() => window._casoraNotifyOpenViaCard(id, res, { type: 'custom:button-card', template: tpl, entity: id, name: 'Heizung', variables: {} }), 500);
    }), [id, tpl]);
    await page.waitForTimeout(2500);
    const btns = () => page.evaluate(() => window.__pierce('.hui-st-b').filter((b) => b.getAttribute('role') === 'button' && b.getBoundingClientRect().width > 0)
      .map((b) => { const r = b.getBoundingClientRect(); return { l: b.getAttribute('aria-label'), dis: b.classList.contains('dis'), x: r.x + r.width / 2, y: r.y + r.height / 2 }; }));
    let bs = await btns();
    if (!(await check(`${tag}: − and + under the dial`, bs.length === 2, bs))) continue;
    await page.waitForTimeout(800);   // popup tap guard
    const val = () => page.evaluate(() => { const n = window.__pierce('.hp-st-v .n, .fb-st-v .n').find((e) => e.getBoundingClientRect().width > 0); return n ? parseFloat(n.textContent.replace(',', '.')) : null; });
    const reset = () => page.evaluate(() => { window.__qaCalls = []; });
    const settle = () => page.waitForTimeout(1500);
    // Pick the button that can move (not at a limit), minus first.
    const use = bs.find((b) => !b.dis && b.l === 'Weniger') || bs.find((b) => !b.dis);
    const dir = use.l === 'Weniger' ? -1 : 1;

    // (1) a real touch tap: one step, one call.
    await reset(); let v0 = await val();
    await page.touchscreen.tap(use.x, use.y); await settle();
    let v1 = await val(); let calls = await page.evaluate(() => window.__qaCalls.slice());
    await check(`${tag}: a touch tap steps once (${v0} → ${v1})`, v1 != null && Math.sign(v1 - v0) === dir && calls.length === 1, { v0, v1, calls });
    const stepSize = Math.abs(v1 - v0);

    // (2) four quick taps count four steps (floor heating: one call after the pause; thermostat: one per tap).
    await reset(); v0 = await val();
    for (let k = 0; k < 4; k++) { await page.touchscreen.tap(use.x, use.y); await page.waitForTimeout(120); }
    await settle(); v1 = await val(); calls = await page.evaluate(() => window.__qaCalls.slice());
    await check(`${tag}: four quick taps step four times (${v0} → ${v1})`, Math.abs(Math.abs(v1 - v0) - 4 * stepSize) < 1e-6 && calls.length >= 1, { v0, v1, calls });

    // (3) a finger as iOS delivers it: touchstart on the button, the button-card copy from further out,
    // jitter moves, touchend a few px away – steps; far off the button – does not.
    const finger = (dx, dy, resend) => page.evaluate(async ({ x, y, dx, dy, resend }) => {
      let el = document.elementFromPoint(x, y); while (el && el.shadowRoot) { const i = el.shadowRoot.elementFromPoint(x, y); if (!i || i === el) break; el = i; }
      // WebKit has no Touch constructor; its legacy document.createTouch builds the same object.
      const touch = (px, py) => { try { return new Touch({ identifier: 3, target: el, clientX: px, clientY: py, radiusX: 10, radiusY: 10 }); } catch (e) { return document.createTouch(window, el, 3, px + scrollX, py + scrollY, px, py); } };
      const mk = (type, px, py, end) => { const t = touch(px, py);
        const L = (a) => (document.createTouchList ? document.createTouchList(...a) : a);
        return new TouchEvent(type, { bubbles: true, cancelable: true, composed: true, touches: L(end ? [] : [t]), targetTouches: L(end ? [] : [t]), changedTouches: L([t]) }); };
      el.dispatchEvent(mk('touchstart', x, y));
      if (resend) { const host = el.getRootNode().host; (host && host.parentNode || document.body).dispatchEvent(mk('touchstart', x, y)); }
      const n = 4;
      for (let i = 1; i <= n; i++) { await new Promise((r) => setTimeout(r, 16)); el.dispatchEvent(mk('touchmove', x + dx * i / n + (i % 2), y + dy * i / n)); }
      el.dispatchEvent(mk('touchend', x + dx, y + dy, true));
    }, { x: use.x, y: use.y, dx, dy, resend });
    for (const [dx, dy] of [[2, 3], [6, -5], [8, 8], [14, -10]]) {
      await reset(); v0 = await val();
      await finger(dx, dy, true); await settle(); v1 = await val();
      await check(`${tag}: finger wandering ${dx}/${dy} px with a re-sent touchstart steps (${v0} → ${v1})`, Math.abs(Math.abs(v1 - v0) - stepSize) < 1e-6, { v0, v1 });
    }
    await reset(); v0 = await val();
    // Sideways, away from the other button (a vertical drag would move the phone sheet).
    await finger(use.l === 'Weniger' ? -60 : 60, 0, true); await settle(); v1 = await val();
    await check(`${tag}: sliding 60 px off the button does not step (${v0} → ${v1})`, v1 === v0 && (await page.evaluate(() => window.__qaCalls.length)) === 0, { v0, v1 });

    // (4) diagnostics: off by default, on with the localStorage switch.
    if (kind === 'floor heating') {
      await reset();
      await page.touchscreen.tap(use.x, use.y); await settle();
      let logs = await page.evaluate(() => window.__qaCalls.filter((c) => c.startsWith('system_log.')));
      await check(`${tag}: no touch diagnostics by default`, logs.length === 0, logs);
      await page.evaluate(() => localStorage.setItem('casora-debug-touch', '1'));
      await reset();
      await page.touchscreen.tap(use.x, use.y); await page.waitForTimeout(1600);
      logs = await page.evaluate(() => window.__qaCalls.filter((c) => c.startsWith('system_log.write')));
      await check(`${tag}: with 'casora-debug-touch' the − / + events go to the HA log`, logs.length >= 1 && /casora\.touch/.test(logs[0]) && /fb-step/.test(logs[0]), logs);
      await page.evaluate(() => localStorage.removeItem('casora-debug-touch'));
    }
  }
  if (before.t != null) await svc('set_temperature', { temperature: before.t });
  await svc('set_hvac_mode', { hvac_mode: before.m });
  await page.context().browser().close();
}
await finish();
