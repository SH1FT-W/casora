// @zustand: arbeit
// Pause im Fortschrittskreis oben rechts (casora_entity, show_progress + progress_transport): Ein Klick auf das
// Pause-Symbol hält den Saugroboter wirklich an. Vorher stand im SVG-Inline-Code „event“ – an SVG-Elementen heißt
// das Ereignis „evt“, window.event ist im Shadow-DOM undefiniert, der Aufruf brach ab (14.10.2026).
// Am Ende fährt der Sauger zurück zur Station.
import { open, casoraDashboard, dashboard, check, need, finish, atFinish, stable } from './lib.mjs';

const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);
const { page } = await open({ width: 1440, height: 1000, theme: 'Casora' });
await dashboard(page, dash.url, 3);
const VID = await page.evaluate(() => Object.keys(document.querySelector('home-assistant').hass.states).find((k) => k.startsWith('vacuum.')));
await need('Saugroboter im Testhaus', VID);
const svc = (s) => page.evaluate(([id, s]) => document.querySelector('home-assistant').hass.callService('vacuum', s, { entity_id: id }), [VID, s]);
atFinish(() => svc('return_to_base').catch(() => {}));
await svc('start');
await page.evaluate(async (id) => {
  const ha = document.querySelector('home-assistant');
  const h = await window.loadCardHelpers();
  const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_vacuum', entity: id, name: 'Sauger', variables: { show_progress: true } });
  el.classList.add('qa-r264'); el.hass = ha.hass;
  el.style.cssText = 'position:fixed;left:400px;top:300px;width:220px;height:140px;z-index:99990;';
  ha.shadowRoot.appendChild(el);
  setInterval(() => { if (el.hass !== ha.hass) el.hass = ha.hass; }, 200);
}, VID);
const at = await stable(page, () => {
  const el = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-r264');
  const c = el && el.shadowRoot.querySelector('#progress g[onclick] circle');
  if (!c) return null;
  const r = c.getBoundingClientRect();
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
}, null, { max: 8000, quiet: 800 });
await check('Kreis mit Pause-Symbol, solange er saugt', !!at, at);
if (at) await page.mouse.click(at.x, at.y);
await page.waitForTimeout(1500);
const st = await page.evaluate((id) => document.querySelector('home-assistant').hass.states[id].state, VID);
await check('Pause im Kreis hält den Saugroboter an', st === 'paused', st);
await finish();
