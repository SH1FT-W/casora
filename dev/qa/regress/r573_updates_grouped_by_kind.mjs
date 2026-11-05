// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/08-weich-kompakt.js#_casoraSoftUpd custom_components/casora/scripts/local/03-popups.js#_casoraUpdX
// Owner (05.11.2026): the Software-Updates popup listed all updates in one list by name. A router's firmware
// ("Dream Router 7") and the Marketplace integration for that router ("UniFi Dream Router 7") stood one under the
// other with the same picture and were hard to tell apart. Expected: the updates grouped by kind, in this order:
// "Home Assistant" (platform hassio), "Marketplace" (marketplace, older HA: hacs), "Geräte" (everything else), each
// heading with its count; headings only when more than one kind has entries. Desktop 1440 and phone 393, Casora look
// dark, states and registry only in the browser.
import { open, casoraDashboard, dashboard, fakeStates, check, need, finish, usePage, shot } from './lib.mjs';

const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);
const upd = (name, from, to, extra) => ({ state: 'on', attributes: { friendly_name: name, title: name, installed_version: from,
  latest_version: to, in_progress: false, release_summary: '', skipped_version: null, auto_update: false, supported_features: 1, ...extra } });
const MOCK = {
  'update.qa_core': ['hassio', upd('Home Assistant Core', '2026.10.4', '2026.11.1')],
  'update.qa_addon_broker': ['hassio', upd('Mosquitto broker', '6.5.1', '6.5.2')],
  'update.qa_router_integration': ['marketplace', upd('UniFi Dream Router 7', '26.11.3', '26.11.4')],
  'update.qa_router_firmware': ['unifi', upd('Dream Router 7 Firmware', '5.1.30', '5.1.35', { device_class: 'firmware' })],
  'update.qa_drive_app': ['unifi', upd('UniFi Drive', '3.2.1', '3.3.0')],
};

const openPopup = (page) => page.evaluate(async (ent) => {
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
}, 'update.qa_core');

for (const [label, size] of [['Desktop', { width: 1440, height: 900 }], ['Handy', { width: 393, height: 852, mobile: true }]]) {
  const { page } = await open({ ...size, dark: true, theme: 'Casora' });
  usePage(page);
  await dashboard(page, dash.url);
  // The house's own updates out of the way: only the mock ones are pending.
  const others = await page.evaluate(() => { const S = document.querySelector('home-assistant').hass.states;
    return Object.keys(S).filter((id) => id.startsWith('update.') && (S[id].state === 'on' || /restart/i.test(String(S[id].attributes.release_summary || '')))); });
  const S = Object.fromEntries(others.map((id) => [id, { state: 'off', attributes: { in_progress: false, release_summary: '' } }]));
  for (const [id, [, st]] of Object.entries(MOCK)) S[id] = st;
  await page.evaluate((m) => {
    const ha = document.querySelector('home-assistant');
    const ents = { ...ha.hass.entities };
    for (const [id, p] of Object.entries(m)) ents[id] = { ...(ents[id] || {}), entity_id: id, platform: p };
    ha._updateHass({ entities: ents });
  }, Object.fromEntries(Object.entries(MOCK).map(([id, [p]]) => [id, p])));
  await fakeStates(page, S, { sticky: true });
  await need(label + ': Updates-Popup geöffnet', await openPopup(page));
  await page.waitForTimeout(3000);
  const text = () => page.evaluate(() => {
    const s = window.casoraPopup && window.casoraPopup.surface; if (!s) return '';
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    return window.__pierce('ha-card', s).filter(vis).map((c) => c.innerText || '').join('\n').replace(/[ \t]+/g, ' ');
  });
  const t = await text();
  await shot(label);
  const at = (re) => t.search(re);
  const hHa = at(/^Home Assistant · 2$/im), hMp = at(/^Marketplace · 1$/im), hDev = at(/^Geräte · 2$/im);
  await check(label + ': drei Überschriften in der Reihenfolge Home Assistant, Marketplace, Geräte',
    hHa >= 0 && hMp > hHa && hDev > hMp, t.slice(0, 900));
  await check(label + ': Core und Add-on unter „Home Assistant“', at(/Core/) > hHa && at(/Core/) < hMp && at(/Mosquitto/) > hHa && at(/Mosquitto/) < hMp, t.slice(0, 900));
  await check(label + ': die Integration unter „Marketplace“', at(/UniFi Dream Router 7/) > hMp && at(/UniFi Dream Router 7/) < hDev, t.slice(0, 900));
  const fw = t.split('\n').findIndex((l, i, a) => /^Dream Router 7$/.test(l.trim()) && a.slice(0, i).join('\n').length > hDev);
  await check(label + ': Firmware und Drive unter „Geräte“', fw >= 0 && at(/Drive/) > hDev, t.slice(0, 900));
  await check(label + ': „Alle aktualisieren“ bleibt', /Alle( aktualisieren)?/.test(t), t.slice(0, 400));

  // Only one kind pending: no kind headings, the list keeps „Verfügbare Updates“.
  const S1 = { ...S, 'update.qa_core': { state: 'off', attributes: {} }, 'update.qa_addon_broker': { state: 'off', attributes: {} },
    'update.qa_router_integration': { state: 'off', attributes: {} } };
  await fakeStates(page, S1, { sticky: true });
  await page.waitForTimeout(2000);
  const t1 = await text();
  await check(label + ': nur Geräte offen: keine Gruppen-Überschrift', /Verfügbare Updates/i.test(t1) && !/^Geräte · /im.test(t1)
    && !/^Home Assistant · /im.test(t1) && /Drive/.test(t1), t1.slice(0, 600));
  await page.context().close();
}
await finish();
