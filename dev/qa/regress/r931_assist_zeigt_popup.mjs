// @zustand: arbeit
// @deckt: custom_components/casora/assist_show.py custom_components/casora/scripts/local/52-assist-show.js custom_components/casora/scripts/local/01-basis.js#_casoraAssist custom_components/casora/panel/casora-panel.js#markPhoneManaged
// New (wow/assist-popups): Assist shows the matching popup. In Casora's Assist chat (HA's own agent, no LLM) on a
// desktop dashboard:
//   - "Zeig mir alle Lichter": the chat shows HA's answer from Casora's sentence ("… Lichtern sind an." / "… lights are on."), then the
//     light popup of the house opens instead of the chat (its ‹ goes back to the chat)
//   - "Zeig mir das Wetter" (when the dashboard shows a weather entity): the answer names the temperature, the weather
//     popup opens
//   - a question HA answers by itself ("Wie spät ist es?"): the answer, the chat stays
//   - Studio switch off (Home's assist_popups: false): the answer only, the chat stays; the dashboard is restored
import { open, usePage, casoraDashboard, dashboard, check, need, finish, atFinish } from './lib.mjs';
import { ws } from '../ws.mjs';

const dash = await casoraDashboard((d) => (d.config.views || []).length > 1);
await need('Casora dashboard with rooms', dash);
const c = await ws();
const cfgHa = await c.cmd({ type: 'get_config' });
c.close();
await need('conversation and assist_pipeline loaded', (cfgHa.components || []).includes('assist_pipeline') && cfgHa.components.includes('conversation'), cfgHa.components);
const d0 = JSON.parse(JSON.stringify(dash.config));
const save = async (cfg) => { const c2 = await ws(); await c2.cmd({ type: 'lovelace/config/save', url_path: dash.url, config: cfg }); c2.close(); };
let changed = false;
atFinish(async () => { if (changed) await save(d0); });

const { page } = await open({ width: 1440, height: 900, dark: true });
usePage(page);
await dashboard(page, dash.url, 2);
await page.waitForFunction(() => !!(window._casoraAssist && window._casoraAssistShow && window._casoraSearch), null, { timeout: 20000 });

// Ask in the chat; wait for the answer, then up to 4 s for another popup.
// Casora's answer in the house's language (the test house speaks English, a German one German).
const LIGHTS = /(Lichtern sind an|lights are on)\.$/;
const ask = async (q) => page.evaluate(async (text) => {
  const A = window._casoraAssist;
  if (!window.casoraPopup.current || window.casoraPopup.current.title !== 'Assist') { A.reset(); A.open(); }
  for (let i = 0; i < 40 && !A.el('.has-log'); i++) await new Promise((r) => setTimeout(r, 100));
  const n = A.msgs.length;
  A.send(text);
  for (let i = 0; i < 150 && (A.busy || A.msgs.length < n + 2); i++) await new Promise((r) => setTimeout(r, 100));
  const answer = (A.msgs[A.msgs.length - 1] || {}).t || '';
  let title = 'Assist';
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 100));
    const cur = window.casoraPopup.current;
    title = cur ? String(cur.title || '') : '';
    if (title !== 'Assist') break;
  }
  return { answer, title, back: !!window._casoraBackNext || !!(window.casoraPopup.current && window.casoraPopup.current.back) };
}, q);

let r = await ask('Zeig mir alle Lichter');
await check('lights: Casora\'s answer in the chat (' + r.answer + ')', LIGHTS.test(r.answer), r);
await check('lights: the light popup opens instead of the chat (' + r.title + ')', r.title && r.title !== 'Assist', r);

const hasWeather = await page.evaluate(() => {
  const S = window._casoraSearch, h = document.querySelector('home-assistant').hass;
  const idx = S.index(S._configNow(), h, h.user, { url: location.pathname.split('/').filter(Boolean)[0] });
  return idx.devices.some((d) => d.id.indexOf('weather.') === 0);
});
if (hasWeather) {
  r = await ask('Zeig mir das Wetter');
  await check('weather: the answer names the temperature (' + r.answer + ')', /^(Draußen|It is .* outside)/.test(r.answer), r);
  await check('weather: the weather popup opens (' + r.title + ')', r.title && r.title !== 'Assist', r);
} else console.log('    no weather entity on this dashboard – weather skipped');

r = await ask('Wie spät ist es');
await check('HA\'s own answer: the chat stays (' + r.answer + ')', r.title === 'Assist' && r.answer.length > 0, r);

// Studio switch off: Home's room card carries assist_popups: false.
const d1 = JSON.parse(JSON.stringify(d0));
const home = (d1.views[0].cards || []).find((x) => [].concat(x.template || []).includes('casora_room'));
await need('Home room card', home);
home.variables = { ...(home.variables || {}), assist_popups: false };
changed = true;
await save(d1);
await dashboard(page, dash.url, 2);
await page.waitForFunction(() => !!(window._casoraAssist && window._casoraAssistShow), null, { timeout: 20000 });
r = await ask('Zeig mir alle Lichter');
await check('switched off: the answer only, the chat stays (' + r.title + ')', r.title === 'Assist' && LIGHTS.test(r.answer), r);

await finish();
