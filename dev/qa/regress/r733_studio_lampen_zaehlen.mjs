// @zustand: arbeit
// @parallel: allein
// @deckt: custom_components/casora/panel/casora-panel.js#_miniModel,lightTally
// Newcomer round (14.11.2026): the Studio opened straight (not after a dashboard) said "Lights 3 on" where the
// dashboard said "4 on" for the same badge. Without the dashboard scripts the Studio counted a group's sub-groups
// as one light each; the dashboard counts lamps (window.casoraLightTally). The Studio now counts as the dashboard.
import { open, usePage, studio, casoraDashboard, check, need, finish, atFinish, BASE } from './lib.mjs';
import { ws } from '../ws.mjs';

const d = (await casoraDashboard((x) => x.url === 'qa-arbeit')) || (await casoraDashboard());
await need('Casora dashboard', d);
const c = await ws();
const states = Object.fromEntries((await c.cmd({ type: 'get_states' })).map((s) => [s.entity_id, s]));
const mem = (id) => ((states[id] && states[id].attributes && states[id].attributes.entity_id) || []).filter((x) => states[x]);
const leaves = (id, seen = new Set()) => { if (seen.has(id)) return []; seen.add(id); const m = mem(id); return m.length ? m.flatMap((x) => leaves(x, seen)) : [id]; };
// A light group with a sub-group of at least two lamps: there the two ways of counting differ.
const G = Object.keys(states).find((id) => id.startsWith('light.') && mem(id).some((m) => mem(m).length >= 2 && mem(m).every((x) => !mem(x).length)));
await need('a light group holding a group of two or more lamps', G, null);
const SG = mem(G).find((m) => mem(m).length >= 2);
const offBefore = leaves(SG).filter((x) => states[x].state !== 'on');
atFinish(async () => { if (offBefore.length) { const c2 = await ws(); await c2.cmd({ type: 'call_service', domain: 'light', service: 'turn_off', target: { entity_id: offBefore } }); c2.close(); } });
await c.cmd({ type: 'call_service', domain: 'light', service: 'turn_on', target: { entity_id: leaves(SG) } });
c.close();

const { page, context } = await open({ width: 1440, height: 900, dark: false });
// The dashboard's count: its own scripts in a dashboard page of the same browser.
const dp = await context.newPage();
await dp.goto(BASE + '/' + d.url + '/0', { waitUntil: 'domcontentloaded' });
await dp.waitForFunction(() => typeof window.casoraLightTally === 'function' && typeof window._casoraHomeLightVarsOf === 'function', null, { timeout: 60000 });
const want = await dp.evaluate((g) => { const h = document.querySelector('home-assistant').hass;
  return window.casoraLightTally(null, h.states, h, window._casoraHomeLightVarsOf({ light_group_entity: g })).on; }, G);
await dp.close();
usePage(page);
await studio(page, d.url);
const read = () => page.evaluate((g) => {
  const b = (window.__panel()._miniModel({ variables: { light_group_entity: g, show_lights: true } }) || []).find((x) => x.id === 'lights');
  return b && b.text;
}, G);
let text = await read();
for (let i = 0; i < 20 && text !== want + ' on'; i++) { await page.waitForTimeout(500); text = await read(); }
await check('the Studio badge counts lamps like the dashboard', text === want + ' on', { group: G, dashboard: want, studio: text });
await finish();
