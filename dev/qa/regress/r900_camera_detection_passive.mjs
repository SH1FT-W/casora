// @zustand: arbeit
// Listed camera detections are shown in the bell but are not interactive.
import { open, usePage, casoraDashboard, check, need, finish, ready } from './lib.mjs';

const dash = await casoraDashboard((d) => !d.mobile);
await need('Casora desktop dashboard', dash);
const { page } = await open({ width: 1600, height: 1000 });
usePage(page);
await ready(page, '/' + dash.url + '/' + (dash.config.views[0].path || '0'), () => !!window._casoraNotify, 60000);

const entity = 'binary_sensor.testhof_all_occupancy';
await need('mock detection sensor', await page.evaluate((id) => !!document.querySelector('home-assistant').hass.states[id], entity));
await page.evaluate(async (id) => {
  const hass = document.querySelector('home-assistant').hass;
  const attributes = hass.states[id].attributes;
  window.CASORA_SETTINGS = { ...(window.CASORA_SETTINGS || {}), cameras: [{ entity_id: 'camera.testhof', detection_triggers: [id] }] };
  await hass.callApi('POST', 'states/' + id, { state: 'off', attributes });
  await hass.callApi('POST', 'states/' + id, { state: 'on', attributes });
}, entity);
await page.waitForFunction(async (id) => (await window._casoraNotify.refresh()).some((r) => r.entity === id && r.label.endsWith(' erkannt')), entity, { timeout: 30000 });
const result = await page.evaluate((id) => {
  const anchor = document.createElement('button');
  document.body.appendChild(anchor);
  window._casoraNotify.open(anchor);
  const row = [...document.querySelectorAll('.casora-notify-menu .hui-row')].find((el) => el._casoraRow?.entity === id);
  return row && { tappable: row.classList.contains('hui-tap'), cursor: row.style.cursor, target: row.dataset.casoraOpen, moreInfo: row.dataset.casoraMi };
}, entity);
await check('detection row has no tap affordance or target', !!result && !result.tappable && result.cursor !== 'pointer' && !result.target && !result.moreInfo, result);
await finish();
