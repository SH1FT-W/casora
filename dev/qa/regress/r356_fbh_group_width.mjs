// @zustand: arbeit
// @parallel: ui
// 26.10.2026 (owner, prod): the floor heating group popup (tile „Fußbodenheizung“, templates casora_thermostat +
// casora_popup_fbh, „Modus“ | „Räume“ side by side) was 552 px wide since stage 2 – room names cut („Badezi…“),
// „Ziel 22,0 °C“ wrapped. casora_thermostat's own popup width (one column, 552) won over casora_popup_fbh's 900.
// Expected on desktop 1440: the floor heating popup is 900 wide, room names are not cut; a plain thermostat stays 552.
// Owner, prod: one floor heating room (casora_popup_fbh without members) is one column – 552, not stretched to 900.
import { open, casoraDashboards, dashboard, check, need, finish, usePage, shot } from './lib.mjs';

const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && d.url === 'qa-arbeit') || all.find((d) => !d.mobile);
await need('ein Casora-Dashboard', desk, all.map((d) => d.url));
const { page } = await open({ width: 1440, height: 900, theme: 'Casora' });
usePage(page);
await dashboard(page, desk.url);
const openPop = (tpl, eid) => page.evaluate(async ({ tpl, eid }) => {
  const ha = document.querySelector('home-assistant');
  const old = window.__pierce('button-card').find((b) => { const x = b.getBoundingClientRect(); return x.width > 120 && x.height > 60 && x.top > 60; });
  const el = document.createElement('button-card');
  el.setConfig({ type: 'custom:button-card', template: tpl, entity: eid });
  el.hass = ha.hass; old.parentNode.insertBefore(el, old);
  await new Promise((r) => setTimeout(r, 600));
  el.addEventListener('hass-action', (ev) => { const act = ev.detail.config.tap_action; if (act && act.casora_popup) { ev.stopPropagation(); window.casoraPopup.open(act.casora_popup); } }, { capture: true, once: true });
  el._handleAction({ detail: { action: 'tap' } }, { isIcon: false });
  await new Promise((r) => setTimeout(r, 3000));
  const s = window.casoraPopup && window.casoraPopup.surface;
  const w = s ? Math.round(s.getBoundingClientRect().width) : 0;
  // Row texts cut with an ellipsis (text-overflow) – scroll width beyond the visible width.
  const cut = s ? window.__pierce('.hui-row *', s).filter((n) => n.childElementCount === 0 && n.textContent.trim() && getComputedStyle(n).textOverflow === 'ellipsis' && n.scrollWidth > n.clientWidth + 1).map((n) => n.textContent.trim()) : [];
  window.__r356el = el;
  return { w, cut };
}, { tpl, eid });
const close = () => page.evaluate(async () => { if (window.casoraPopup) window.casoraPopup.close(); if (window.__r356el) window.__r356el.remove(); await new Promise((r) => setTimeout(r, 600)); });

const ids = await page.evaluate(() => {
  const st = document.querySelector('home-assistant').hass.states;
  const cl = Object.keys(st).filter((k) => k.startsWith('climate.'));
  const grp = cl.find((k) => window.casoraClimateMembers && window.casoraClimateMembers(st[k], st).length > 1);
  const one = cl.find((k) => k !== grp && !(window.casoraClimateMembers && window.casoraClimateMembers(st[k], st).length));
  return { grp, one };
});
await need('Klima-Gruppe und einzelnes Thermostat im Testhaus', ids.grp && ids.one, ids);
const g = await openPop(['casora_thermostat', 'casora_popup_fbh'], ids.grp);
await shot('Fussbodenheizung Gruppe Desktop');
await check('Fußbodenheizung (Gruppe): Popup 900 breit', g.w >= 880, g);
await check('Fußbodenheizung (Gruppe): Raumnamen nicht abgeschnitten', g.cut.length === 0, g);
await close();
const r1 = await openPop(['casora_thermostat', 'casora_popup_fbh'], ids.one);
await shot('Fussbodenheizung Raum Desktop');
await check('Fußbodenheizung (ein Raum): Popup 552 breit', r1.w > 500 && r1.w < 600, r1);
await close();
const t = await openPop('casora_thermostat', ids.one);
await check('Thermostat einzeln: Popup bleibt 552 breit', t.w > 500 && t.w < 600, t);
await close();
await finish();
