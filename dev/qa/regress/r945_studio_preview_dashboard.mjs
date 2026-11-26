// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/panel/casora-panel.js#_paintTile,_paintBadge,_miniModel,_phoneRoomSceneList,solidToggle,offInk,LOCK_OPEN_TINT, custom_components/casora/panel/casora-panel-types.js#casoraTileIconUrl,casoraTileIsOffline
// Review 26.11.2026 (z3: u04-02, d02-04, d02-05): the Studio preview looked unlike the dashboard. Desktop: the open
// lock teal with a dark switch, the scenes badge a pale stack. Phone, room page: every TV, Apple TV, PlayStation and
// the cameras tile with the speaker/doorbell symbol, the dark lamp with a yellow symbol, the offline camera without
// its rim, no scenes section and no "Szenen"/"Geräte" headings. Expected as on the dashboard: open lock and its switch
// in the theme's colours (not teal, not the dark cut-out switch), scenes badge with the palette, device symbols per
// device, off symbols in the off colour, the dashed rim on an offline camera, and the room's scenes with headings.
// Nothing is saved.
import { open, usePage, studio, studioDashboard, check, need, finish } from './lib.mjs';

const dash = process.env.CASORA_QA_DASH || await studioDashboard();
await need('Casora dashboard for the Studio', dash);
const { page } = await open({ dark: false, width: 1440, height: 1000 });
usePage(page);
await studio(page, dash);
await page.waitForTimeout(2500);

const desk = await page.evaluate(() => {
  const r = window.__panel().shadowRoot;
  const tiles = [...r.querySelectorAll('#mapmount .mtile')];
  const lock = tiles.find((t) => (t.querySelector('.mglyph') || { style: { getPropertyValue: () => '' } }).style.getPropertyValue('--i').includes('lock')
    || /Schloss|Lock/.test((t.querySelector('.mname') || {}).textContent || ''));

  const circle = lock && lock.querySelector('.mcircle');
  const sw = lock && lock.querySelector('.mtgl rect');
  const sc = r.querySelector('#mapmount .pbadge[data-mk="b:scenes"] .pglyph');
  return {
    lock: !!lock, lockOn: !!(lock && lock.classList.contains('on')),
    lockSc: circle ? circle.style.getPropertyValue('--sc') : null,
    solid: getComputedStyle(document.documentElement).getPropertyValue('--casora-toggle-style').trim() === 'solid',
    sw: sw ? (sw.getAttribute('style') || '') + ' ' + (sw.getAttribute('fill') || '') : null,
    scenes: sc ? decodeURIComponent(sc.style.getPropertyValue('--i')) : null,
  };
});
await need('Home has a lock tile', desk.lock, desk);
if (desk.lockOn) {
  await check('desktop: the open lock takes the unlocked colour, not teal', /lock-unlocked-color/.test(desk.lockSc || ''), desk);
  // casora-toggle-style: solid (Weich): filled track in --casora-toggle-on-fill, as casora_entity's toggle.
  if (desk.solid) await check('desktop: its switch has the theme\'s "on" track', /casora-toggle-on-fill/.test(desk.sw || ''), desk);
}
await check('desktop: scenes badge with the palette symbol', !!desk.scenes && desk.scenes.includes('M17.5,12A1.5'), desk);

await page.evaluate(() => { const b = window.__panel().shadowRoot.querySelector('#sizeseg [data-size="phone"]'); if (b) b.click(); });
await page.waitForTimeout(2500);
const room = await page.evaluate(() => {
  const p = window.__panel();
  const names = (p._state.compact.rooms || []).map((s) => s.name || '');
  return names.find((n) => /Wohnzimmer|Living/i.test(n)) || null;
});
await need('phone layout has the living room', room, room);
await page.evaluate((n) => { const p = window.__panel(); p._phoneFilter = 'room:' + n; p._rebuildPreview(); }, room);
await page.waitForTimeout(3000);
const ph = await page.evaluate(() => {
  const r = window.__panel().shadowRoot;
  const t = [...r.querySelectorAll('#mapmount .mtile')].map((el) => {
    const g = el.querySelector('.mglyph');
    return { name: (el.querySelector('.mname') || {}).textContent, on: el.classList.contains('on'),
      offline: el.classList.contains('offline'), i: g ? g.style.getPropertyValue('--i') : '', ic: g ? g.style.getPropertyValue('--ic') : '' };
  });
  return { tiles: t, heads: [...r.querySelectorAll('#mapmount .mp-head')].map((h) => h.textContent.trim()),
    scenes: r.querySelectorAll('#mapmount .mp-scenegroup .mp-scenes > *').length };
});
const find = (re) => ph.tiles.find((x) => re.test(x.name || ''));
await check('phone room: TV, Apple TV and PlayStation keep their own symbols',
  ['tv.svg', 'apple_tv.svg', 'ps5.svg'].every((s) => ph.tiles.some((x) => x.i.includes('/' + s))), ph.tiles);
const cams = find(/^Kameras$|^Cameras$/);
await check('phone room: the cameras tile shows a camera', !cams || cams.i.includes('camera'), cams);
const lamp = ph.tiles.find((x) => !x.on && x.i.includes('light.svg'));
await check('phone room: an off lamp is drawn in the off ink', !lamp || /casora-icon-off-ink/.test(lamp.ic), lamp);
const cam = find(/^Kamera$|^Camera$/);
await check('phone room: the offline camera has the dashed rim', !cam || cam.offline, cam);
await check('phone room: the scenes section with "Szenen" and "Geräte" headings',
  ph.scenes > 0 && ph.heads.some((h) => /Szenen|Scenes/.test(h)) && ph.heads.some((h) => /Geräte|Devices/.test(h)), ph);
await finish();
