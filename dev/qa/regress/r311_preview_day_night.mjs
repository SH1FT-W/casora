// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/panel/casora-panel.js
// Reported: the day/night switch above the Studio preview only swapped the room photo – tiles, badges, chrome
// and popups kept Home Assistant's light/dark mode. And the player at the wave was the old 05.10 list, not
// the dashboard's cover stage and cover strips.
// Expected (Casora look): with the switch on day the preview looks the same whether HA is light or dark, and
// likewise on night; day and night differ. A playing player shows as the dashboard draws it
// (09-weich-wiedergabe.js): on the desktop the wave's window with the cover stage, on the phone cover strips,
// dark only on night. Nothing is saved; the player is faked in the browser.
import { open, usePage, studio, studioDashboard, fakeStates, check, need, finish } from './lib.mjs';

const dash = await studioDashboard();
await need('Casora dashboard for the Studio', dash);

const PLAYER = 'media_player.qa_preview_speaker';
const playing = { [PLAYER]: { state: 'playing', attributes: { friendly_name: 'QA Speaker', media_title: 'QA Song',
  media_artist: 'QA Band', supported_features: 152463, media_duration: 200, media_position: 40,
  media_position_updated_at: new Date().toISOString() } } };

const setMode = (page, m) => page.evaluate((m) => {
  const p = window.__panel();
  const b = p.shadowRoot.querySelector(`#modeseg [data-mode="${m}"]`);
  if (b && !!p._miniDark !== (m === 'night')) b.click();
  return !!p._miniDark;
}, m);
const colors = (page) => page.evaluate(() => {
  const r = window.__panel().shadowRoot;
  const bg = (sel) => { const e = r.querySelector('#mapmount ' + sel); return e ? getComputedStyle(e).backgroundColor : null; };
  return { tile: bg('.mtile'), badge: bg('.pbadge:not(.ghost)'), bell: bg('.mini-bell'),
    soft: !!r.querySelector('.card.map.soft') };
});

const seen = {};
for (const dark of [true, false]) {
  const { page } = await open({ dark, width: 1440, height: 900 });
  usePage(page);
  await studio(page, dash);
  await need(`HA ${dark ? 'dark' : 'light'}: Casora look in the preview`, (await colors(page)).soft);
  for (const m of ['day', 'night']) {
    await setMode(page, m);
    await page.waitForTimeout(900);
    seen[(dark ? 'ha-dark ' : 'ha-light ') + m] = await colors(page);
  }
  if (!dark) continue;

  // Player: faked as playing, Now Playing switched on in memory only.
  await fakeStates(page, playing, { sticky: true });
  await page.evaluate((id) => {
    const p = window.__panel();
    const room = p._state.compact.rooms[p._room || 0];
    room.variables = { ...(room.variables || {}), show_now_playing: true, show_media: true, media_player_1: id };
    p._npMin = false;
    p._rebuildPreview();
  }, PLAYER);
  const real = (sel) => page.waitForFunction((sel) => {
    const e = window.__panel().shadowRoot.querySelector('#mapmount ' + sel);
    return !!(e && e.shadowRoot && e.shadowRoot.querySelector('.r'));
  }, sel, { timeout: 20000 }).then(() => true, () => false);
  const np = (sel) => page.evaluate((sel) => {
    const r = window.__panel().shadowRoot;
    const e = r.querySelector('#mapmount ' + sel);
    const l = e && e.shadowRoot.querySelector('.l');
    return { real: !!e, stage: !!(l && l.querySelector('.r.st')), dark: !!(l && l.classList.contains('dk')),
      phone: !!(l && l.classList.contains('ph')), title: l ? (l.querySelector('.t') || {}).textContent : null,
      old: r.querySelectorAll('#mapmount .mini-nptile, #mapmount .mp-np').length,
      wave: (() => { const w = r.querySelector('#mapmount .mini-wave.on'); return w ? getComputedStyle(w).backgroundColor : null; })() };
  }, sel);
  await setMode(page, 'night');
  const deskOk = await real('.mini-npreal.win');
  let d = await np('.mini-npreal.win');
  await check('desktop: the wave shows the dashboard\'s window with the cover stage', deskOk && d.stage && d.title === 'QA Song' && !d.old, d);
  await check('desktop night: the player is dark', d.dark, d);
  await setMode(page, 'day');
  await page.waitForTimeout(900);
  d = await np('.mini-npreal.win');
  await check('desktop day: the player is light', d.real && !d.dark, d);

  await page.evaluate(() => { const b = window.__panel().shadowRoot.querySelector('#sizeseg [data-size="phone"]'); if (b) b.click(); });
  await page.waitForTimeout(2500);
  const phoneOk = await real('.mp-nprow .mini-npreal');
  let ph = await np('.mp-nprow .mini-npreal');
  await check('phone: cover strips as on the dashboard', phoneOk && ph.phone && !ph.stage && ph.title === 'QA Song' && !ph.old, ph);
  await setMode(page, 'night');
  await page.waitForTimeout(900);
  ph = await np('.mp-nprow .mini-npreal');
  await check('phone night: the strips are dark', ph.dark, ph);
  await fakeStates(page, { [PLAYER]: null });
}

const same = (a, b) => a.tile === b.tile && a.badge === b.badge && a.bell === b.bell;
await check('day: the same preview whether HA is light or dark', same(seen['ha-dark day'], seen['ha-light day']), seen);
await check('night: the same preview whether HA is light or dark', same(seen['ha-dark night'], seen['ha-light night']), seen);
await check('day and night differ (tiles)', seen['ha-dark day'].tile !== seen['ha-dark night'].tile, seen);
await finish();
