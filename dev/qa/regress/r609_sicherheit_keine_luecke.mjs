// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/panel/casora-panel.js
// #152: removing a device from the security badge leaves no gap. Later slots move up, and a config that already has
// a gap reads 1, 2, 3 with the empty row last.
import { open, usePage, studio, casoraDashboard, check, need, finish } from './lib.mjs';

const d = (await casoraDashboard((x) => x.url === 'qa-arbeit')) || (await casoraDashboard());
await need('Casora dashboard', d);
const { page } = await open({ width: 1440, height: 900, dark: false });
usePage(page);
await studio(page, d.url);
const K = (n) => 'security_entity_' + n;
const setup = (slots) => page.evaluate(async ([slots]) => {
  const p = window.__panel(), rooms = p._state.compact.rooms;
  const i = rooms.findIndex((r, x) => x > 0 && r.path !== 'home');
  p._room = i; p._renderTabs();
  const V = rooms[i].variables;
  V.show_security = true;
  for (let n = 1; n <= 8; n++) { delete V['security_entity_' + n]; delete V['security_label_' + n]; }
  Object.entries(slots).forEach(([n, id]) => { V['security_entity_' + n] = id; });
  V.security_label_3 = 'Third';
  p._bOpen = true; p._select({ group: 'badges', key: 'Security', label: 'Security' });
  await new Promise((r) => setTimeout(r, 900));
}, [slots]);
const rows = () => page.evaluate(() => {
  const p = window.__panel();
  const R = [...p.shadowRoot.querySelectorAll('#pane .row[data-key^="security_entity_"]')];
  return R.map((r) => ({ key: r.dataset.key, label: (r.querySelector('label') || {}).textContent, blank: !!r.querySelector('.drop.blank') }));
});
const vars = () => page.evaluate(() => { const p = window.__panel(), V = p._state.compact.rooms[p._room].variables;
  return Object.fromEntries(Object.entries(V).filter(([k]) => /^security_(entity|label)_\d/.test(k))); });
const ids = await page.evaluate(() => Object.keys(window.__panel()._hass.states).filter((e) => e.startsWith('binary_sensor.')).slice(0, 3));
await need('three sensors', ids.length === 3, ids);

// A config that already has a gap: slots 2 and 3 are set.
await setup({ 2: ids[1], 3: ids[2] });
let r = await rows();
const num = (x) => x.map((y) => Number((String(y.label).match(/(\d+)\s*$/) || [])[1]));
await check('gap in the config: numbered by position', JSON.stringify(num(r)) === '[1,2,3]', r);
await check('gap in the config: the empty row is last', r.length === 3 && r[2].blank && !r[0].blank && !r[1].blank, r);

// Removing the middle one of three.
await setup({ 1: ids[0], 2: ids[1], 3: ids[2] });
await page.evaluate(() => { const p = window.__panel(); p.shadowRoot.querySelector('#pane .row[data-key="security_entity_2"] .drop').click(); });
await page.waitForTimeout(200);
await page.evaluate(() => { const p = window.__panel(); p.shadowRoot.querySelector('#pane .delbtn').click(); });
await page.waitForTimeout(700);
const v = await vars();
await check('removed: the later device moved up', v[K(1)] === ids[0] && v[K(2)] === ids[2] && !v[K(3)], v);
await check('removed: its label moved with it', v.security_label_2 === 'Third' && !v.security_label_3, v);
r = await rows();
await check('removed: rows 1, 2 and an empty 3', JSON.stringify(num(r)) === '[1,2,3]' && r[2].blank, r);
await finish();
