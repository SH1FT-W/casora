// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/casora-core.js#dial,mediaConsole, custom_components/casora/scripts/local/32-media-badge.js#B.stage
// Owner 05.11.2026 (iPhone screenshot, media popup v3 of a PlayStation, off): the stage showed a vinyl record with a blue
// note inside the volume wheel and „Lautstärke 0 %“. A game console is no record player. Expected (phone 393, desktop
// 1440, casora_media): a console (found by its integration, else its name) shows its game's picture as the whole disc
// when there is one, else a quiet disc with the console's symbol; off or without a volume of its own, no volume line.
// A music player keeps its record and „Lautstärke … %“. The test house's console and speaker are found by name/class
// (no ids here); states are faked in the browser only.
//   R571_SHOTS=<dir> R571_TAG=<name>: picture of the console's popup on the phone.
import { open, casoraDashboards, dashboard, check, need, finish, usePage, fakeStates } from './lib.mjs';

const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && d.url === 'qa-arbeit') || all.find((d) => !d.mobile);
await need('ein Casora-Dashboard', desk, all.map((d) => d.url));

const openMedia = (page, mp) => page.evaluate(async (mp) => {
  const ha = document.querySelector('home-assistant');
  if (window.__r571el) { try { window.casoraPopup.close(); } catch (e) { /* closed */ } window.__r571el.remove(); await new Promise((r) => setTimeout(r, 600)); }
  const old = window.__pierce('button-card').find((b) => { const q = b.getBoundingClientRect(); return q.width > 120 && q.height > 60 && q.top > 60; });
  const el = document.createElement('button-card');
  el.setConfig({ type: 'custom:button-card', template: 'casora_media', entity: mp });
  el.hass = ha.hass; old.parentNode.insertBefore(el, old);
  await new Promise((r) => setTimeout(r, 700));
  el.addEventListener('hass-action', (ev) => { const act = ev.detail.config.tap_action; ev.stopPropagation(); window.casoraPopup.open(act.casora_popup); }, { capture: true, once: true });
  el._handleAction({ detail: { action: 'tap' } }, { isIcon: false });
  window.__r571el = el;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 300));
    const s = window.casoraPopup && window.casoraPopup.surface;
    const c = s && window.__pierce('.hui-dl-cover', s).find((n) => n.getBoundingClientRect().width > 0);
    if (c) {
      await new Promise((r) => setTimeout(r, 600));
      const ic = c.querySelector('ha-icon'), img = c.querySelector('img'), vol = window.__pierce('.hui-dl-vol', s).find((n) => n.getBoundingClientRect().width > 0);
      return { cls: c.className, icon: ic ? ic.getAttribute('icon') : null, img: !!img, vol: vol ? vol.textContent.replace(/\s+/g, ' ').trim() : null };
    }
  }
  return null;
}, mp);

for (const [w, h, dev] of [[393, 852, 'phone'], [1440, 900, 'desktop']]) {
  const { page } = await open({ width: w, height: h, theme: 'Casora', mobile: w < 500 });
  usePage(page);
  await dashboard(page, desk.url);
  const ids = await page.evaluate(() => {
    const st = document.querySelector('home-assistant').hass.states, mp = Object.keys(st).filter((k) => k.startsWith('media_player.'));
    const nm = (k) => String(st[k].attributes.friendly_name || k);
    return { console: mp.find((k) => /playstation|xbox/i.test(nm(k))), music: mp.find((k) => st[k].attributes.device_class === 'speaker') };
  });
  await need('a console and a speaker in the test house', ids.console && ids.music, ids);
  // 1. The console off, no volume control (as the owner's PS5).
  await fakeStates(page, { [ids.console]: { state: 'off', attributes: { supported_features: 0, entity_picture: null, entity_picture_local: null } } }, { sticky: true });
  const off = await openMedia(page, ids.console);
  await check(dev + ': console off → no record, a quiet disc with the console symbol', off && /\btv\b/.test(off.cls) && off.icon === 'mdi:sony-playstation', off);
  await check(dev + ': console off → no „Lautstärke 0 %“', off && !off.vol, off);
  if (process.env.R571_SHOTS && dev === 'phone') await page.screenshot({ path: `${process.env.R571_SHOTS}/${process.env.R571_TAG || 'shot'}-handy.png` });
  // 2. The console in a game: the game's picture is the whole disc, not a record's label.
  const pic = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 48; const x = c.getContext('2d'); x.fillStyle = '#2a6'; x.fillRect(0, 0, 48, 48); return c.toDataURL('image/png'); });
  await fakeStates(page, { [ids.console]: { state: 'playing', attributes: { supported_features: 0, entity_picture: pic, media_title: 'Spiel' } } }, { sticky: true });
  const game = await openMedia(page, ids.console);
  await check(dev + ': console in a game → its picture fills the disc (no record, no turning)', game && /\bvideo\b/.test(game.cls) && game.img && !/spin/.test(game.cls) && !game.vol, game);
  // 3. A music player keeps its record and the volume line.
  await fakeStates(page, { [ids.music]: { state: 'playing', attributes: { volume_level: 0.4, entity_picture: null, entity_picture_local: null, media_title: 'Titel' } } }, { sticky: true });
  const mu = await openMedia(page, ids.music);
  await check(dev + ': music player keeps the record and „Lautstärke 40 %“', mu && !/\b(tv|video)\b/.test(mu.cls) && mu.icon === 'mdi:music-note' && /Lautstärke 40/.test(mu.vol || ''), mu);
}
await finish();
