// @zustand: arbeit
// @parallel: ui
// Issue #81 (26.10.2026): the cover popup shows the tile's „Beschattungsautomatik“ helper (input_boolean or switch)
// as a switch row. Toggling it ran the service, but the row kept its old state until the popup was reopened.
// Expected: the row follows the helper within about a second – for an input_boolean and for a switch.
import { open, casoraDashboards, dashboard, check, need, finish, usePage, shot } from './lib.mjs';

const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && d.url === 'qa-arbeit') || all.find((d) => !d.mobile);
await need('ein Casora-Dashboard', desk, all.map((d) => d.url));
const { page } = await open({ width: 1440, height: 900, theme: 'Casora' });
usePage(page);
await dashboard(page, desk.url);
const ids = await page.evaluate(() => {
  const st = document.querySelector('home-assistant').hass.states, k = Object.keys(st);
  const ok = (x) => st[x].state === 'on' || st[x].state === 'off';
  return { cover: k.find((x) => x.startsWith('cover.')), ib: k.find((x) => x.startsWith('input_boolean.') && ok(x)), sws: k.filter((x) => x.startsWith('switch.') && ok(x) && !/casora/.test(x)) };
});
// A switch of the test house that really follows switch.turn_on/off (some mock switches do not).
ids.sw = await page.evaluate(async (sws) => {
  const ha = document.querySelector('home-assistant');
  for (const s of sws.slice(0, 40)) {
    const b = ha.hass.states[s].state;
    await ha.hass.callService('switch', b === 'on' ? 'turn_off' : 'turn_on', { entity_id: s });
    await new Promise((r) => setTimeout(r, 400));
    if (ha.hass.states[s].state !== b) { await ha.hass.callService('switch', b === 'on' ? 'turn_on' : 'turn_off', { entity_id: s }); await new Promise((r) => setTimeout(r, 400)); return s; }
  }
  return null;
}, ids.sws);
await need('Rollo, input_boolean und Schalter im Testhaus', ids.cover && ids.ib && ids.sw, ids);
// The switch of the row that belongs to the helper (its row carries the helper's id).
const rowState = (helper) => page.evaluate((helper) => {
  const s = window.casoraPopup && window.casoraPopup.surface;
  const sw = s && window.__pierce('[role="switch"]', s).find((n) => { const r = n.closest('.hui-row'); return r && r.outerHTML.includes(helper); });
  return sw ? sw.getAttribute('aria-checked') : null;
}, helper);
for (const helper of [ids.ib, ids.sw]) {
  const dom = helper.split('.')[0];
  const start = await page.evaluate(async ({ cover, helper }) => {
    const ha = document.querySelector('home-assistant');
    const old = window.__pierce('button-card').find((b) => { const q = b.getBoundingClientRect(); return q.width > 120 && q.height > 60 && q.top > 60; });
    const el = document.createElement('button-card');
    el.setConfig({ type: 'custom:button-card', template: 'casora_cover', entity: cover, variables: { smart_automation_entity: helper } });
    el.hass = ha.hass; old.parentNode.insertBefore(el, old);
    await new Promise((res) => setTimeout(res, 700));
    el.addEventListener('hass-action', (ev) => { const act = ev.detail.config.tap_action; ev.stopPropagation(); window.casoraPopup.open(act.casora_popup); }, { capture: true, once: true });
    el._handleAction({ detail: { action: 'tap' } }, { isIcon: false });
    await new Promise((res) => setTimeout(res, 2500));
    window.__r359el = el;
    return ha.hass.states[helper].state;
  }, { cover: ids.cover, helper });
  const before = await rowState(helper);
  await need(dom + ': Automatik-Schalter im Popup', before !== null, before);
  const want = start === 'on' ? 'off' : 'on';
  await page.evaluate(({ helper, want }) => document.querySelector('home-assistant').hass.callService('homeassistant', want === 'on' ? 'turn_on' : 'turn_off', { entity_id: helper }), { helper, want });
  await page.waitForTimeout(1200);
  const after = await rowState(helper);
  const real = await page.evaluate((h) => document.querySelector('home-assistant').hass.states[h].state, helper);
  await shot(dom + ' nach Umschalten');
  await check(dom + ': Zeile folgt dem Helfer ohne neu öffnen (' + start + ' → ' + real + ')', real === want && after === (want === 'on' ? 'true' : 'false'), { before, after, real, want });
  // back to how it was
  await page.evaluate(({ helper, start }) => document.querySelector('home-assistant').hass.callService('homeassistant', start === 'on' ? 'turn_on' : 'turn_off', { entity_id: helper }), { helper, start });
  await page.evaluate(async () => { if (window.casoraPopup) window.casoraPopup.close(); if (window.__r359el) window.__r359el.remove(); await new Promise((res) => setTimeout(res, 700)); });
}
await finish();
