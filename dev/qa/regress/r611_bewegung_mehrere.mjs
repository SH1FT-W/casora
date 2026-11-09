// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/panel/casora-panel.js
// #150: a room takes several motion sensors in the Studio: an existing one stays the first, the next row appears when it is filled, and removing one closes the gap.
import { open, usePage, studio, casoraDashboard, check, need, finish } from './lib.mjs';

const d = (await casoraDashboard((x) => x.url === 'qa-arbeit')) || (await casoraDashboard());
await need('Casora dashboard', d);
const { page } = await open({ width: 1440, height: 900, dark: false });
usePage(page);
await studio(page, d.url);
const ids = await page.evaluate(() => { const S = window.__panel()._hass.states; return Object.keys(S).filter((e) => e.startsWith('binary_sensor.') && ['motion', 'occupancy'].includes(S[e].attributes.device_class)).slice(0, 3); });
await need('three motion sensors', ids.length === 3, ids);
const setup = (v) => page.evaluate(async (v) => {
  const p = window.__panel(), rooms = p._state.compact.rooms;
  const i = rooms.findIndex((r, x) => x > 0 && r.path !== 'home');
  p._room = i; p._renderTabs();
  const V = rooms[i].variables;
  ['motion_entity', 'motion_entity_2', 'motion_entity_3', 'motion_entity_4'].forEach((k) => delete V[k]);
  Object.assign(V, v);
  p._bOpen = true; p._select({ group: 'rooms', key: 'Appearance', label: 'Appearance' });
  await new Promise((r) => setTimeout(r, 900));
}, v);
const rows = () => page.evaluate(() => [...window.__panel().shadowRoot.querySelectorAll('#pane .row[data-key^="motion_entity"]')]
  .map((r) => ({ key: r.dataset.key, label: r.querySelector('label').textContent, blank: !!r.querySelector('.drop.blank') })));
const vars = () => page.evaluate(() => { const p = window.__panel(), V = p._state.compact.rooms[p._room].variables; return Object.fromEntries(Object.entries(V).filter(([k]) => k.startsWith('motion_entity'))); });

await setup({ motion_entity: ids[0] });
let r = await rows();
await check('one sensor as before, its key unchanged, an empty row after it', r.length === 2 && r[0].key === 'motion_entity' && !r[0].blank && r[1].key === 'motion_entity_2' && r[1].blank, r);

await setup({ motion_entity: ids[0], motion_entity_2: ids[1], motion_entity_3: ids[2] });
r = await rows();
await check('three sensors: three rows and an empty one', r.length === 4 && r[3].blank, r);
await page.evaluate(() => window.__panel().shadowRoot.querySelector('#pane .row[data-key="motion_entity"] .drop').click());
await page.waitForTimeout(200);
await page.evaluate(() => window.__panel().shadowRoot.querySelector('#pane .delbtn').click());
await page.waitForTimeout(700);
const v = await vars();
await check('removing the first: the others move up', v.motion_entity === ids[1] && v.motion_entity_2 === ids[2] && !v.motion_entity_3, v);
await finish();
