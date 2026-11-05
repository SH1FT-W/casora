// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/08-weich-kompakt.js custom_components/casora/scripts/local/03-popups.js#_casoraUpdX custom_components/casora/scripts/local/17-update-detail.js
// Owner (05.11.2026, prod, phone): in the Updates popup the install button of a device firmware update (own
// integration, device_class firmware, supported_features 5 = INSTALL|PROGRESS) did nothing – no state change, no
// error – while HA's own update dialog installed it. Taps the row's install button (and its confirm) and "Alle", on
// the phone (393, touch; Chromium and WebKit) and the desktop, and checks that update.install reaches Home Assistant
// for exactly the right entity. The service call is caught in the browser: nothing is installed.
// Not reproduced in the test house (05.11.2026: every path sent a correct call_service); this guards those paths.
import { open, casoraDashboard, dashboard, fakeStates, check, need, finish, usePage, stable } from './lib.mjs';

const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);
const A = 'update.qa_r574_router_firmware', B = 'update.qa_r574_second_firmware';
const fw = (name) => ({ state: 'on', attributes: { friendly_name: name, title: null, device_class: 'firmware', installed_version: '5.1.34',
  latest_version: '5.1.35', in_progress: false, update_percentage: null, release_summary: null, release_url: null, skipped_version: null,
  auto_update: false, supported_features: 5, entity_picture: null } });

const RUNS = [
  ['Handy Chromium', { width: 393, height: 852, mobile: true }],
  ['Handy WebKit', { width: 393, height: 852, mobile: true, safari: true }],
  ['Desktop', { width: 1440, height: 900 }],
];
for (const [label, size] of RUNS) {
  const { page } = await open({ ...size, dark: false, theme: 'Casora' });
  usePage(page);
  await dashboard(page, dash.url);
  const others = await page.evaluate(() => { const S = document.querySelector('home-assistant').hass.states;
    return Object.keys(S).filter((id) => id.startsWith('update.') && S[id].state === 'on'); });
  const S = Object.fromEntries(others.map((id) => [id, { state: 'off', attributes: { in_progress: false, release_summary: '' } }]));
  S[A] = fw('QA Router Firmware');
  S[B] = fw('QA Second Firmware');
  await fakeStates(page, S, { sticky: true });
  await page.evaluate(() => {
    window.__qaCalls = [];
    const wrap = () => {
      const hass = document.querySelector('home-assistant').hass;
      if (hass.callService.__qa) return;
      const f = function (d, s, data, target) { window.__qaCalls.push({ d, s, data, target }); return Promise.resolve(); };
      f.__qa = true;
      hass.callService = f;
    };
    wrap();
    window.__qaWrap = setInterval(wrap, 50);   // a new hass object (state change) brings HA's own callService back
  });
  // Open the updates popup like the bell does: a hidden tile with the template, tapped.
  const hit = await page.evaluate(async (ent) => {
    const ha = document.querySelector('home-assistant');
    const el = document.createElement('button-card');
    el.setConfig({ type: 'custom:button-card', template: ['casora_updates'], entity: ent });
    el.hass = ha.hass;
    el.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(el);
    await new Promise((r) => setTimeout(r, 300));
    return await new Promise((res) => {
      el.addEventListener('hass-action', (ev) => {
        const act = ev.detail && ev.detail.config && ev.detail.config.tap_action;
        if (act && act.casora_popup && window.casoraPopup) { ev.stopPropagation(); window.casoraPopup.open(act.casora_popup); res(true); } else res(false);
      }, { capture: true, once: true });
      try { el._handleAction({ detail: { action: 'tap' } }, { isIcon: false }); } catch (e) { res(false); }
      setTimeout(() => res(false), 1500);
    });
  }, A);
  await need(label + ': Updates-Popup geöffnet', hit);
  const tap = async (pt) => { if (size.mobile) await page.touchscreen.tap(pt.x, pt.y); else await page.mouse.click(pt.x, pt.y); };
  // The install button on the row of A (the round download button on the phone, „Aktualisieren“ on the desktop).
  const btn = await stable(page, (id) => {
    const s = window.casoraPopup && window.casoraPopup.surface; if (!s) return null;
    const row = window.__pierce('.hui-row', s).find((r) => r.getAttribute('data-casora-mi') === id && r.getBoundingClientRect().width);
    const a = row && row.querySelector('[data-casora-arm]');
    if (!a) return null;
    a.scrollIntoView({ block: 'center' });
    const r = a.getBoundingClientRect();
    return r.width ? { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } : null;
  }, A, { max: 10000, quiet: 1000 });
  await need(label + ': Installieren-Knopf in der Zeile', btn, btn);
  if (!btn) { await page.context().close(); continue; }
  await page.waitForTimeout(700);
  await tap(btn);
  await page.waitForTimeout(600);
  const cf = await page.evaluate((id) => {
    const s = window.casoraPopup && window.casoraPopup.surface; if (!s) return null;
    const row = window.__pierce('.hui-row', s).find((r) => r.getAttribute('data-casora-mi') === id && r.getBoundingClientRect().width);
    const c = row && row.querySelector(':scope > .hui-cf');
    if (!c || !row.classList.contains('armed')) return { armed: !!(row && row.classList.contains('armed')) };
    const r = c.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), text: c.textContent };
  }, A);
  await check(label + ': Tipp auf den Knopf zeigt „Starten“', cf && cf.x != null, cf);
  if (cf && cf.x != null) {
    await page.waitForTimeout(300);
    await tap(cf);
    await page.waitForTimeout(900);
  }
  const calls = await page.evaluate(() => window.__qaCalls.filter((c) => c.d === 'update'));
  await check(label + ': „Starten“ ruft genau ein update.install für die Firmware auf', calls.length === 1 && calls[0].s === 'install'
    && JSON.stringify(calls[0].target) === JSON.stringify({ entity_id: A }) && !(calls[0].data || {}).backup, calls);

  // „Alle aktualisieren“ (main action of the dial) with its question.
  await page.evaluate(() => { window.__qaCalls.length = 0; });
  const all = await stable(page, () => {
    const s = window.casoraPopup && window.casoraPopup.surface; if (!s) return null;
    const m = window.__pierce('[data-casora-svc]', s).find((e) => { const r = e.getBoundingClientRect();
      return r.width && /"service":"install"/.test(e.getAttribute('data-casora-svc')) && Array.isArray(JSON.parse(e.getAttribute('data-casora-svc')).target.entity_id); });
    if (!m) return null;
    const r = m.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  }, null, { max: 6000, quiet: 800 });
  await need(label + ': „Alle“ sichtbar', all, all);
  if (all) {
    await tap(all);
    const yes = await stable(page, () => {
      const y = window.__pierce('.yes', document.body).find((e) => e.getBoundingClientRect().width);
      if (!y) return null;
      const r = y.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    }, null, { max: 4000, quiet: 400 });
    await check(label + ': „Alle“ fragt nach', yes, yes);
    if (yes) { await tap(yes); await page.waitForTimeout(900); }
    const c2 = await page.evaluate(() => window.__qaCalls.filter((c) => c.d === 'update'));
    const ids = c2.length === 1 ? [].concat(c2[0].target.entity_id).sort() : [];
    await check(label + ': „Alle“ ruft update.install für beide auf', c2.length === 1 && c2[0].s === 'install'
      && JSON.stringify(ids) === JSON.stringify([A, B].sort()), c2);
  }
  await page.context().close();
}
await finish();
