// @zustand: arbeit
// @parallel: allein
// Listed camera detections are shown in the bell but are not interactive.
// Stores the camera list with the settings call the Studio uses on save (test HA only) and restores the settings after.
import { open, usePage, casoraDashboard, check, need, finish, ready, atFinish } from './lib.mjs';
import { ws } from '../ws.mjs';

const dash = await casoraDashboard((d) => !d.mobile);
await need('Casora desktop dashboard', dash);
const entity = 'binary_sensor.testhof_all_occupancy';

// The page replaces window.CASORA_SETTINGS when the stored settings arrive, so a list set only in the page could be gone
// again when the bell collects (gate state). The list is stored like a Studio save instead.
const c = await ws();
const r0 = await c.cmd({ type: 'casora/settings/get' });
const before = r0.stored ? r0.settings : null;
atFinish(async () => {
  const c2 = await ws();
  await c2.cmd({ type: 'casora/settings/set', settings: before || {} });
  c2.close();
});
await c.cmd({ type: 'casora/settings/set', settings: { ...(before || {}), cameras: [{ entity_id: 'camera.testhof', detection_triggers: [entity] }] } });
c.close();

const { page } = await open({ width: 1600, height: 1000 });
usePage(page);
await ready(page, '/' + dash.url + '/' + (dash.config.views[0].path || '0'), () => !!window._casoraNotify, 60000);

await page.waitForFunction((id) => ((window.CASORA_SETTINGS || {}).cameras || []).some((x) => (x.detection_triggers || []).includes(id)), entity, { timeout: 30000 });
await need('mock detection sensor', await page.evaluate((id) => !!document.querySelector('home-assistant').hass.states[id], entity));
// A change in HA's start window counts as the restart, not a detection (casoraSinceMs). In the gate state the probe
// runs within minutes of HA's start (or of the setup's bulk writes), so wait until "now" is past that window.
const waited = Date.now();
await page.waitForFunction(() => window.casoraSinceMs({ entity_id: 'sensor.r900_probe', last_changed: new Date().toISOString() },
  document.querySelector('home-assistant').hass) !== null, null, { timeout: 8 * 60000, polling: 5000 });
console.log('  start window passed after ' + Math.round((Date.now() - waited) / 1000) + ' s');
await page.evaluate(async (id) => {
  const hass = document.querySelector('home-assistant').hass;
  const attributes = hass.states[id].attributes;
  // on, off, on: the logbook itself proves the "off" before the detection. In the gate state the sensor is off since
  // HA's start and the recorder has no state before the bell's window; the bell only counts an off -> on change whose
  // "off" it can prove (glocke_camera_detection.mjs: a first history row inside the window is no proof).
  await hass.callApi('POST', 'states/' + id, { state: 'on', attributes });
  await hass.callApi('POST', 'states/' + id, { state: 'off', attributes });
  await hass.callApi('POST', 'states/' + id, { state: 'on', attributes });
}, entity);
// Polled from here: waitForFunction does not wait for the promise of an async predicate (a pending promise counts as
// true), so the bell opened before the logbook had the change.
let seen = false;
for (const until = Date.now() + 30000; !seen && Date.now() < until; await new Promise((r) => setTimeout(r, 1000))) {
  seen = await page.evaluate(async (id) => (await window._casoraNotify.refresh()).some((r) => r.entity === id && r.label.endsWith(' erkannt')), entity);
}
await need('detection row in the bell', seen);
const result = await page.evaluate((id) => {
  const anchor = document.createElement('button');
  document.body.appendChild(anchor);
  window._casoraNotify.open(anchor);
  const row = [...document.querySelectorAll('.casora-notify-menu .hui-row')].find((el) => el._casoraRow?.entity === id);
  return row && { tappable: row.classList.contains('hui-tap'), cursor: row.style.cursor, target: row.dataset.casoraOpen, moreInfo: row.dataset.casoraMi };
}, entity);
await check('detection row has no tap affordance or target', !!result && !result.tappable && result.cursor !== 'pointer' && !result.target && !result.moreInfo, result);
await finish();
