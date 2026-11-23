// @zustand: arbeit
// @deckt: custom_components/casora/scripts/local/29-eigene-badges.js#_casoraCustomBadge,CasoraCustomBadges custom_components/casora/panel/casora-panel.js#_customBadgesField,_condEditor
// #238: own badges get the tiles' "Show when". A room gets two own badges, the second with the condition "the
// room's light is on" (as the Studio stores it: conditions on the badge). Expected on the desktop and on the phone
// room page: with the light off only the first badge, with the light on both, off again one – without a reload
// (the light's state faked in this browser only). In the Studio the badge block carries the "Show when" editor with
// the stored condition. Writes the desktop dashboard (test HA only) and restores it.
import { open, usePage, casoraDashboard, dashboard, cards, stable, check, need, finish, atFinish, fakeStates, studio, studioRetry } from './lib.mjs';
import { ws } from '../ws.mjs';

const dash = await casoraDashboard((d) => (d.config.views || []).length > 1);
await need('Casora dashboard with a room', dash);
const d0 = JSON.parse(JSON.stringify(dash.config));
const d = JSON.parse(JSON.stringify(d0));
const view = d.views.slice(1).find((v) => ((v.cards || [])[0] || {}).variables && (v.cards[0].variables.light_entity_1 || v.cards[0].variables.light_group_entity));
await need('Room with a light in its badges', view);
const RV = view.cards[0].variables;
const light = RV.light_entity_1 || RV.light_group_entity;
RV.custom_badges = [
  { name: 'QA Immer', template: "{{ 'da' }}" },
  { name: 'QA Bedingt', template: "{{ 'sichtbar' }}", conditions: [{ condition: 'state', entity: light, state: 'on' }] },
];
const save = async (cfg) => { const c = await ws(); await c.cmd({ type: 'lovelace/config/save', url_path: dash.url, config: cfg }); c.close(); };
await save(d);
let restored = false;
atFinish(async () => { if (!restored) { restored = true; await save(d0); } });

const names = () => window.__pierce('button-card')
  .filter((x) => [].concat((x._config || {}).template || []).includes('casora_badge_custom') && x.getBoundingClientRect().width > 0)
  .map((x) => { const c = x.shadowRoot && x.shadowRoot.querySelector('ha-card'); return c ? c.innerText.replace(/\s+/g, ' ').trim() : ''; })
  .filter((t) => /QA /.test(t)).map((t) => (/QA \S+/.exec(t) || [''])[0]).sort();
const want = async (pg, state, list, label) => {
  await fakeStates(pg, { [light]: { state } }, { sticky: true });
  const got = await stable(pg, names, null, { max: 12000, until: (n) => JSON.stringify(n) === JSON.stringify(list) });
  await check(label + ' (' + JSON.stringify(got) + ')', JSON.stringify(got) === JSON.stringify(list), got);
};

const { page } = await open({ width: 1440, height: 900, dark: true });
usePage(page);
await dashboard(page, dash.url + '/' + view.path, 2);
await want(page, 'off', ['QA Immer'], 'desktop, light off: only the badge without a condition');
await want(page, 'on', ['QA Bedingt', 'QA Immer'], 'desktop, light on: the conditional badge appears');
await want(page, 'off', ['QA Immer'], 'desktop, light off again: it leaves');
await want(page, 'unavailable', ['QA Immer'], 'desktop, light unavailable: hidden');

if (dash.phone) {
  const ph = await open({ width: 393, height: 852, mobile: true, dark: true });
  usePage(ph.page);
  await dashboard(ph.page, dash.phone.url + '/home', 2);
  await ph.page.evaluate(() => window.casoraPhoneRoom && window.casoraPhoneRoom.refresh && window.casoraPhoneRoom.refresh());
  await ph.page.waitForTimeout(1500);
  const key = 'room_' + String(view.cards[0].name || view.title || view.path).trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  await ph.page.evaluate((k) => window._casoraFilter.set(k), key);
  await ph.page.waitForTimeout(1500);
  const there = await stable(ph.page, names, null, { max: 10000, until: (n) => n.length >= 1 });
  if (there.length) {
    await want(ph.page, 'off', ['QA Immer'], 'phone, light off: only the badge without a condition');
    await want(ph.page, 'on', ['QA Bedingt', 'QA Immer'], 'phone, light on: the conditional badge appears');
  } else console.log('    phone room page without own badges here – desktop checks only');
}

// Studio: the badge block shows the stored condition in the "Show when" editor.
const sp = await open({ width: 1440, height: 1000, dark: true });
usePage(sp.page);
await studio(sp.page, dash.url);
const st = await studioRetry(sp.page, dash.url, () => sp.page.evaluate(() => {
  const P = window.__panel();
  const i = P._state.compact.rooms.findIndex((r) => r.variables && Array.isArray(r.variables.custom_badges) && r.variables.custom_badges.some((b) => b.name === 'QA Bedingt'));
  if (i < 0) return { err: 'room not found' };
  const fs = document.createElement('section');
  P._customBadgesField(P._state.compact.rooms[i], fs, { key: 'custom_badges' }, () => {});
  const boxes = [...fs.querySelectorAll('.ownbadge-cond')];
  return { boxes: boxes.length, always: !!(boxes[0] && boxes[0].querySelector('.condalways')), rows: boxes[1] ? boxes[1].querySelectorAll('.condrow').length : 0,
    label: boxes[1] && boxes[1].querySelector('label') ? boxes[1].querySelector('label').textContent : '' };
})).catch((e) => ({ err: String(e) }));
console.log('    studio', JSON.stringify(st));
await check('Studio: a "Show when" editor per badge, "Always" without a condition, one row for the stored one',
  st && st.boxes === 2 && st.always === true && st.rows === 1, st);
restored = true;
await save(d0);
await finish();
