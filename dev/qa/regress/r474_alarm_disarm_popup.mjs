// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/07-weich-spezial.js custom_components/casora/scripts/casora-core.js
// Issue #109 (iPhone, Alarmo without a code): „Alarm beenden“ (triggered) and „Unscharf schalten“ (armed) in the
// alarm popup and the security popup did nothing. casoraAsk threw on a question without text or verb, so the
// confirm never showed and alarm_disarm was never sent. Phone, touch taps, both entry points:
//  - the stage pill asks first, „yes“ sends alarm_disarm,
//  - a call HA rejects shows a notice instead of nothing.
// Service calls are answered in the browser; the real panel never changes.
import { open, usePage, casoraDashboard, dashboard, fakeStates, check, need, finish } from './lib.mjs';

const d = await casoraDashboard();
await need('a Casora dashboard', d);
const { page } = await open({ width: 390, height: 844, mobile: true, dark: false });
usePage(page);
await dashboard(page, d.url, 3);
const info = await page.evaluate(() => {
  const alarm = Object.keys(document.querySelector('home-assistant').hass.states).find((i) => i.startsWith('alarm_control_panel.'));
  const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_badge_security'));
  return { alarm, badge: b ? JSON.parse(JSON.stringify(b._config)) : null };
});
await need('an alarm panel in the test house', info.alarm, info);
await need('a security badge on the dashboard', info.badge, info);
await page.evaluate(() => {
  const c = document.querySelector('home-assistant').hass.connection;
  window.__qaSent = []; window.__qaFail = false; window.__qaNotes = [];
  const o = c.sendMessagePromise.bind(c);
  c.sendMessagePromise = (m) => {
    if (m && m.type === 'call_service' && m.domain === 'alarm_control_panel') {
      window.__qaSent.push(m.service);
      return window.__qaFail ? Promise.reject({ code: 'home_assistant_error', message: 'QA rejected' }) : Promise.resolve({});
    }
    return o(m);
  };
  document.querySelector('home-assistant').addEventListener('hass-notification', (e) => window.__qaNotes.push(String((e.detail || {}).message || '')));
});
const pill = () => page.evaluate(() => {
  const p = window.casoraPopup && window.casoraPopup.element;
  const el = window.__pierce('[data-casora-alarm]', (p && p.shadowRoot) || document)
    .find((x) => x.getBoundingClientRect().width > 0 && /beenden|Unscharf/.test(x.getAttribute('aria-label') || x.textContent));
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { label: el.getAttribute('aria-label') || el.textContent.trim(), x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
const yes = () => page.evaluate(() => {
  const h = document.querySelector('.casora-askfirst');
  const b = h && h.shadowRoot && h.shadowRoot.querySelector('.yes');
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, title: h.shadowRoot.querySelector('h2').textContent };
});
const ENTRY = {
  alarm: { type: 'custom:button-card', template: ['casora_alarm'], entity: info.alarm, variables: { alarm_entity: info.alarm } },
  security: info.badge,
};
const tapDisarm = async (label, fail) => {
  await page.evaluate((f) => { window.__qaSent.length = 0; window.__qaNotes.length = 0; window.__qaFail = f; }, fail);
  const p = await pill();
  await need(label + ': disarm pill in the popup', p, p);
  await page.touchscreen.tap(p.x, p.y);
  await page.waitForTimeout(800);
  const y = await yes();
  await check(label + ': the pill asks first', !!y, y);
  if (y) { await page.touchscreen.tap(y.x, y.y); await page.waitForTimeout(1200); }
  return page.evaluate(() => ({ sent: window.__qaSent.slice(), notes: window.__qaNotes.slice() }));
};

for (const [entry, card] of Object.entries(ENTRY)) {
  for (const st of ['triggered', 'armed_night']) {
    const label = entry + ' ' + st;
    await fakeStates(page, { [info.alarm]: { state: st, attributes: { code_format: null, code_arm_required: false, supported_features: 15 } } }, { sticky: true });
    await page.evaluate(([id, c]) => new Promise((res) => { if (window.casoraPopup) window.casoraPopup.close();
      setTimeout(() => window._casoraNotifyOpenViaCard(id, res, c), 400); }), [info.alarm, card]);
    await page.waitForTimeout(2500);
    const ok = await tapDisarm(label, false);
    await check(label + ': „yes“ sends alarm_disarm', ok.sent.join() === 'alarm_disarm', ok);
    if (st === 'triggered') {
      const bad = await tapDisarm(label + ' (HA rejects)', true);
      await check(label + ': a rejected disarm shows a notice', bad.sent.join() === 'alarm_disarm' && bad.notes.some((n) => /alarm/i.test(n)), bad);
      // The toast lies over the pill; let it go before the next tap.
      await page.waitForTimeout(9000);
    }
  }
}
await page.evaluate(() => { window.__qaFail = false; });
await finish();
