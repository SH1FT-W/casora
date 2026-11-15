// @zustand: arbeit
// @parallel: allein   (sets the motion sensor of a phone room only in the browser, through setConfig of the card)
// @deckt: custom_components/casora/scripts/casora-core.js dashboards/casora/button_card_templates.json#casora_mobile_sensor_chips,casora_badge_base
// #204: on the phone a room's motion badge showed its markup as text („<div class="badge-wrap"><div class="badge-title">B…“)
// instead of „Bewegung“ / „Nicht erkannt“. The badge's name is evaluated by the outer card (casora_mobile_sensor_chips)
// and the plain-name guard escaped the result. Nothing is saved.
import { open, usePage, casoraDashboard, dashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora dashboard with a phone counterpart', dash && dash.phone);
const room = dash.config.views.find((v, i) => i > 0 && ((v.cards || [])[0] || {}).template === 'casora_room');
await need('a room on the desktop dashboard', room);
const kids = dash.phone.config.views[0].cards[1].cards;
const name = room.cards[0].name;
const ov = kids.find((k) => k && k.type === 'custom:casora-filter-overlay' && k.room === name);
const key = (ov && ov.filter_category) || 'room_' + String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '');

const { page } = await open({ width: 393, height: 852, mobile: true, dark: true });
usePage(page);
await dashboard(page, dash.phone.url + '/' + (dash.phone.config.views[0].path || '0'), 3);

const motion = await page.evaluate(() => {
  const S = document.querySelector('home-assistant').hass.states;
  return Object.keys(S).find((e) => e.startsWith('binary_sensor.') && ['motion', 'occupancy'].includes(S[e].attributes.device_class)
    && S[e].state === 'off');
});
await need('a motion sensor that is off', motion);

// The room's motion sensor as the Studio writes it (room_chips[<room>].motion_entity), in the browser only.
const set = await page.evaluate(([k, m]) => {
  const el = window.__pierce('button-card').find((b) => [].concat((b._config || {}).template || []).includes('casora_mobile_sensor_chips'));
  if (!el) return false;
  const cfg = JSON.parse(JSON.stringify(el._config));
  const rc = { ...((cfg.variables || {}).room_chips || {}) };
  rc[k] = { ...(rc[k] || {}), motion_entity: m };
  cfg.variables = { ...(cfg.variables || {}), room_chips: rc };
  el.setConfig(cfg);
  el.hass = document.querySelector('home-assistant').hass;
  return true;
}, [key, motion]);
await need('card casora_mobile_sensor_chips on the phone', set);
await page.evaluate((k) => window._casoraFilter.set(k), key);

// The motion badge: the row's casora_badge_base card with the motion icon.
const read = () => page.evaluate(() => {
  const card = window.__pierce('button-card').find((b) => [].concat((b._config || {}).template || []).includes('casora_mobile_sensor_chips'));
  const row = card && card.shadowRoot.querySelector('#rooms_row');
  const b = row && window.__pierce('button-card', row).find((x) => (x._config || {}).icon === 'mdi:motion-sensor'
    && x.getBoundingClientRect().width > 0);
  const nm = b && b.shadowRoot && b.shadowRoot.querySelector('#name');
  if (!nm) return null;
  const t = (s) => { const e = nm.querySelector(s); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; };
  return { text: nm.textContent.replace(/\s+/g, ' ').trim(), title: t('.badge-title'), sub: t('.badge-sub'), width: Math.round(b.getBoundingClientRect().width) };
});
let got = null;
for (const t0 = Date.now(); Date.now() - t0 < 12000; await page.waitForTimeout(250)) {
  got = await read();
  if (got && got.text) break;
}
await need('motion badge on the phone room page', got && got.text, got);
await check('motion badge: no markup as text', !/<div|badge-wrap/.test(got.text), got);
await check('motion badge: title „Bewegung“', got.title === 'Bewegung', got);
await check('motion badge: sub line says nothing detected (or since when)', !!got.sub && (got.sub === 'Nicht erkannt' || /^vor |gerade/.test(got.sub)), got);
await page.evaluate(() => window._casoraFilter.set('all'));
await finish();
