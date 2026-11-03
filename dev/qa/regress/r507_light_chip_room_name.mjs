// @zustand: arbeit
// @parallel: ui
// @deckt: dashboards/casora/button_card_templates.json
// Owner (03.11.2026, prod): a room's lamp chips under „Beleuchtung“ drop the room name („Stehlampe Wohnzimmer“ →
// „Stehlampe“). In rooms whose card has no aqi_room_name (rooms set up before it existed) the name stayed: the chips
// must take the room's own name (the card's name, the title above the row) then. Desktop 1440; states and the room
// card's variables only in the browser, nothing saved.
import { open, dashboard, casoraDashboard, fakeStates, check, need, finish, usePage } from './lib.mjs';

const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);
const view = dash.config.views.find((v, i) => i > 0 && ((v.cards || [])[0] || {}).template === 'casora_room'
  && (v.cards[0].variables || {}).light_entity_1 && v.cards[0].name && v.path);
await need('Raum mit Licht-Badge und Namen', view, dash.config.views.map((v) => v.path));
const roomName = view.cards[0].name;
const group = view.cards[0].variables.light_entity_1;

const { page } = await open({ width: 1440, height: 900, dark: false, theme: 'Casora' });
usePage(page);
await dashboard(page, dash.url + '/' + view.path);
const lamp = 'light.qa_room_name_lamp', lamp2 = 'light.qa_room_name_lamp_2';
await fakeStates(page, {
  [lamp]: { state: 'off', attributes: { friendly_name: 'Stehlampe ' + roomName } },
  [lamp2]: { state: 'off', attributes: { friendly_name: roomName + ' Spots' } },
  [group]: { state: 'off', attributes: { entity_id: [lamp, lamp2], friendly_name: roomName } },
}, { sticky: true });
// The room card as an older setup saved it: no aqi_room_name, no room_name.
const ok = await page.evaluate(() => {
  const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_room')
    && x.getBoundingClientRect().width > 0);
  if (!b) return false;
  const cfg = JSON.parse(JSON.stringify(b._config));
  delete cfg.variables.aqi_room_name; delete cfg.variables.room_name;
  b.setConfig(cfg);
  return true;
});
await need('Raumkarte gefunden', ok);
await page.evaluate(() => document.querySelector('home-assistant').hass.callService('input_select', 'select_option',
  { entity_id: 'input_select.casora_expanded_row', option: 'lights' }).catch(() => {}));
await page.waitForTimeout(3000);
const names = await page.evaluate((ids) => window.__pierce('button-card')
  .filter((b) => ids.includes((b._config || {}).entity) && [].concat(b._config.template || []).includes('casora_badge_light')
    && b.getBoundingClientRect().width > 0)
  .map((b) => ((b.shadowRoot && b.shadowRoot.querySelector('.badge-title')) || {}).textContent || ''), [lamp, lamp2]);
await need('Lampen-Chips sichtbar', names.length >= 2, names);
await check('Lampen-Chips ohne Raumnamen („Stehlampe“, „Spots“)', names.every((n) => n === 'Stehlampe' || n === 'Spots')
  && names.includes('Stehlampe') && names.includes('Spots'), { names, roomName });
await page.evaluate(() => document.querySelector('home-assistant').hass.callService('input_select', 'select_option',
  { entity_id: 'input_select.casora_expanded_row', option: 'none' }).catch(() => {}));
await page.context().close();
await finish();
