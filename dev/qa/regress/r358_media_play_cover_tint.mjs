// @zustand: arbeit
// @parallel: ui
// 26.10.2026 (owner, prod): the media popup's big play button glowed pink and the glow ended in a hard line under the
// button (the card body clips it). Wish: the button takes its colour from the cover like the wave's rows do.
// Expected (Casora look, phone 393 and desktop 1440): no glow; with a red cover the button is reddish, with a
// yellow cover the icon turns dark; without a cover the button keeps the media colour.
import { open, casoraDashboards, dashboard, check, need, finish, usePage, shot, fakeStates } from './lib.mjs';

const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && d.url === 'qa-arbeit') || all.find((d) => !d.mobile);
await need('ein Casora-Dashboard', desk, all.map((d) => d.url));
const cover = (pg, col) => pg.evaluate((col) => { const c = document.createElement('canvas'); c.width = c.height = 48; const x = c.getContext('2d'); x.fillStyle = col; x.fillRect(0, 0, 48, 48); return c.toDataURL('image/png'); }, col);
const rgb = (s) => (String(s).match(/[\d.]+/g) || []).slice(0, 3).map(Number);
for (const [w, h, dev] of [[393, 852, 'Handy'], [1440, 900, 'Desktop']]) {
  const { page } = await open({ width: w, height: h, theme: 'Casora' });
  usePage(page);
  await dashboard(page, desk.url);
  const mp = await page.evaluate(() => { const st = document.querySelector('home-assistant').hass.states; return Object.keys(st).find((k) => k.startsWith('media_player.') && /tv/i.test(k)) || Object.keys(st).find((k) => k.startsWith('media_player.')); });
  await need('Mediaplayer im Testhaus', mp, mp);
  const play = async (pic) => {
    await fakeStates(page, { [mp]: { state: 'playing', attributes: { entity_picture: pic, entity_picture_local: null, media_title: 'Titel', media_artist: 'Sender', supported_features: 152511 } } }, { sticky: true });
    return page.evaluate(async (mp) => {
      const ha = document.querySelector('home-assistant');
      const old = window.__pierce('button-card').find((b) => { const q = b.getBoundingClientRect(); return q.width > 120 && q.height > 60 && q.top > 60; });
      const el = document.createElement('button-card');
      el.setConfig({ type: 'custom:button-card', template: 'casora_media', entity: mp });
      el.hass = ha.hass; old.parentNode.insertBefore(el, old);
      await new Promise((res) => setTimeout(res, 700));
      el.addEventListener('hass-action', (ev) => { const act = ev.detail.config.tap_action; ev.stopPropagation(); window.casoraPopup.open(act.casora_popup); }, { capture: true, once: true });
      el._handleAction({ detail: { action: 'tap' } }, { isIcon: false });
      await new Promise((res) => setTimeout(res, 3000));
      const b = window.casoraPopup && window.casoraPopup.surface && window.__pierce('.hm-b.lg', window.casoraPopup.surface)[0];
      const out = b ? { bg: getComputedStyle(b).backgroundColor, sh: getComputedStyle(b).boxShadow, icon: b.firstElementChild ? getComputedStyle(b.firstElementChild).backgroundColor : '' } : null;
      window.__r358el = el;
      return out;
    }, mp);
  };
  const close = () => page.evaluate(async () => { if (window.casoraPopup) window.casoraPopup.close(); if (window.__r358el) window.__r358el.remove(); await new Promise((res) => setTimeout(res, 600)); });

  const red = await play(await cover(page, '#c0392b'));
  await shot(dev + ' rotes Cover');
  await need(dev + ': Wiedergabe-Knopf im Popup', red, red);
  await check(dev + ': kein abgeschnittener Schein unter dem Knopf', red.sh === 'none', red);
  const [r1, g1, b1] = rgb(red.bg);
  await check(dev + ': rotes Cover → Knopf rötlich', r1 > g1 + 40 && r1 > b1 + 40, red);
  await close();
  const yel = await play(await cover(page, '#f5d000'));
  const [ri, gi, bi] = rgb(yel.icon);
  await check(dev + ': gelbes Cover → Symbol dunkel (lesbar)', ri + gi + bi < 200, yel);
  await close();
  const none = await play(null);
  await check(dev + ': ohne Cover Medienfarbe wie bisher', none && rgb(none.bg).join() !== rgb(red.bg).join() && none.sh === 'none', { none, red });
  await close();
}
await finish();
