// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/panel/casora-panel.js
// Reported: in the Studio preview the wave showed the old player list again, although r311 had switched it
// to the dashboard's cover stage. The new player only drew when the dashboard's list had something in it
// and its module was already loaded; otherwise the preview fell back to its own old copy – with a player
// paused longer than the pause timeout, with nothing playing (the "Nothing playing" placeholder) and while
// the dashboard scripts were still loading.
// Expected (Casora themes – Casora, Glas, Nebel): the preview never draws the old player. With nothing in
// the dashboard's list there is no wave and no player, as on the dashboard (desktop and phone). Is the
// module not there yet, the preview draws nothing and redraws once casora-local.js reports it is loaded.
// Nothing is saved; the player is faked in the browser.
import { open, usePage, studio, studioDashboard, fakeStates, check, need, finish } from './lib.mjs';

const dash = await studioDashboard();
await need('Casora dashboard for the Studio', dash);

const PLAYER = 'media_player.qa_preview_speaker';
const attrs = { friendly_name: 'QA Speaker', media_title: 'QA Song', media_artist: 'QA Band',
  supported_features: 152463, media_duration: 200, media_position: 40 };

const { page } = await open({ width: 1440, height: 900 });
usePage(page);
await studio(page, dash);
await need('Casora look in the preview', await page.evaluate(() => !!window.__panel().shadowRoot.querySelector('.card.map.soft')));

// Now Playing on in memory only, with the faked player as the room's only source.
const useRoom = () => page.evaluate((id) => {
  const p = window.__panel();
  const room = p._state.compact.rooms[p._room || 0];
  const v = { ...(room.variables || {}), show_now_playing: true, show_media: true, media_player_1: id };
  for (let i = 2; i <= 10; i++) delete v['media_player_' + i];
  ['psn_1', 'psn_2', 'discord_user', 'discord_online', 'discord_game', 'steam_account', 'steam_game'].forEach((k) => delete v[k]);
  room.variables = v;
  p._npMin = false;
  p._rebuildPreview();
}, PLAYER);
// Paused since an hour: last_changed set by hand (fakeStates stamps "now").
const pausedLong = () => page.evaluate(({ id, attrs }) => {
  const ha = document.querySelector('home-assistant');
  const old = new Date(Date.now() - 3600e3).toISOString();
  const states = { ...ha.hass.states, [id]: { entity_id: id, state: 'paused', attributes: attrs,
    last_changed: old, last_updated: old, context: { id: 'qa' } } };
  ha._updateHass({ states });
}, { id: PLAYER, attrs });
const look = () => page.evaluate(() => {
  const r = window.__panel().shadowRoot;
  const real = r.querySelector('#mapmount .mini-npreal');
  return {
    old: r.querySelectorAll('#mapmount .mini-nptile, #mapmount .mp-np').length,
    wave: !!r.querySelector('#mapmount .mz-np'),
    head: [...r.querySelectorAll('#mapmount .mp-head')].some((h) => h.dataset.jump === 'Now Playing'),
    real: !!(real && real.shadowRoot && real.shadowRoot.querySelector('.r')),
  };
});
const settle = () => page.waitForTimeout(1200);

// Desktop.
await fakeStates(page, { [PLAYER]: { state: 'playing', attributes: attrs } });
await useRoom();
await page.waitForFunction(() => !!window._casoraNPSoft, null, { timeout: 20000 }).catch(() => {});
await useRoom();
await settle();
let d = await look();
await check('desktop, playing: the dashboard\'s player at the wave', d.real && d.wave && !d.old, d);

await pausedLong();
await useRoom();
await settle();
d = await look();
await check('desktop, paused an hour: no wave and no old player', !d.wave && !d.old && !d.real, d);

await fakeStates(page, { [PLAYER]: { state: 'off', attributes: {} } });
await useRoom();
await settle();
d = await look();
await check('desktop, nothing playing: no wave, no "Nothing playing" placeholder', !d.wave && !d.old, d);

// Module not loaded yet: nothing drawn, then the real player once the loader reports in.
await fakeStates(page, { [PLAYER]: { state: 'playing', attributes: attrs } });
await page.evaluate(() => { window.__qaNP = window._casoraNPSoft; delete window._casoraNPSoft; });
await useRoom();
await settle();
d = await look();
await check('desktop, module still loading: no old player meanwhile', !d.old && !d.real, d);
await page.evaluate(() => { window._casoraNPSoft = window.__qaNP; window.dispatchEvent(new Event('casora-local-loaded')); });
await settle();
d = await look();
await check('desktop, module loaded: the preview redraws with the dashboard\'s player', d.real && !d.old, d);

// Phone.
await page.evaluate(() => { const b = window.__panel().shadowRoot.querySelector('#sizeseg [data-size="phone"]'); if (b) b.click(); });
await page.waitForTimeout(2500);
await useRoom();
await settle();
d = await look();
await check('phone, playing: the dashboard\'s cover strips', d.real && d.head && !d.old, d);

await pausedLong();
await useRoom();
await settle();
d = await look();
await check('phone, paused an hour: no "Now Playing" and no old player', !d.head && !d.old && !d.real, d);

await fakeStates(page, { [PLAYER]: null });
await finish();
