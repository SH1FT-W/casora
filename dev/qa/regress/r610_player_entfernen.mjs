// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/panel/casora-panel-personal.js custom_components/casora/scripts/casora-core.js#_casoraNPSources
// #151: a player a dashboard lists can be taken out of Now Playing in the Studio's player list, and brought back.
import { open, usePage, studio, casoraDashboard, dashboard, check, need, finish } from './lib.mjs';

const d = await casoraDashboard();
await need('Casora dashboard', d);
const ID = 'media_player.qa_tablet';
const { page } = await open({ width: 1440, height: 900, dark: false });
usePage(page);
await dashboard(page, d.url + '/' + (d.config.views[0].path || '0'));
const sources = (hidden) => page.evaluate(([id, hidden]) => {
  const before = window.CASORA_SETTINGS;
  window.CASORA_SETTINGS = { ...(before || {}), media: { ...((before || {}).media || {}), hidden } };
  const list = window._casoraNPSources({ [id]: { state: 'playing', attributes: { media_title: 'Song', friendly_name: 'Tablet' } } },
    { show_media_player_1: true, media_player_1: id, pause_timeout_minutes: 10 });
  window.CASORA_SETTINGS = before;
  return list.filter(Boolean).map((r) => r.entity);
}, [ID, hidden]);
await check('Now Playing lists the player by default', (await sources([])).includes(ID));
await check('Now Playing leaves out a removed player', !(await sources([ID])).includes(ID));

await studio(page, d.url);
const state = () => page.evaluate((id) => {
  const w = window.__t151; const rows = [...w.host.querySelectorAll('.casora-prow')].filter((r) => r.textContent.includes(id) || r.textContent.includes('QA Tablet'));
  const r = rows[0];
  return { rows: rows.length, x: !!(r && r.querySelector('.casora-x')), back: !!(r && r.querySelector('.casora-pagain')), hidden: w.S.media.hidden.slice() };
}, ID);
await page.evaluate((id) => {
  const p = window.__panel();
  p._hass.states[id] = { entity_id: id, state: 'idle', attributes: { friendly_name: 'QA Tablet' } };
  p._casoraNPShown = [id]; p._casoraNPAt = Date.now();
  const host = document.createElement('div'); p.shadowRoot.appendChild(host);
  const S = { media: { players: {}, hidden: [] } };
  const render = () => { host.innerHTML = ''; p._casoraPersonalGroups(host, S, ['media'], render); };
  window.__t151 = { host, S }; render();
}, ID);
let s = await state();
await check('Studio: a detected player has a remove button', s.rows === 1 && s.x, s);
await page.evaluate(() => { const w = window.__t151; [...w.host.querySelectorAll('.casora-prow')].find((r) => r.textContent.includes('QA Tablet')).querySelector('.casora-x').click(); });
s = await state();
await check('Studio: removing puts it on the hidden list, the row can bring it back', s.hidden.includes(ID) && s.back && !s.x, s);
await page.evaluate(() => { window.__t151.host.querySelector('.casora-pagain').click(); });
s = await state();
await check('Studio: bringing it back clears the list', !s.hidden.length && s.x, s);
await finish();
